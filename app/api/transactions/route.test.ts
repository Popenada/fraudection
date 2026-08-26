import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { auditLog, cases } from "@/db/schema";
import type { ScoringResult } from "@/lib/rules-engine";

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rules-engine", () => ({
  scoreTransaction: vi.fn(),
}));

import { db } from "@/db";
import { scoreTransaction } from "@/lib/rules-engine";
import { POST } from "./route";

const insertMock = db.insert as ReturnType<typeof vi.fn>;
const selectMock = db.select as ReturnType<typeof vi.fn>;
const transactionMock = db.transaction as ReturnType<typeof vi.fn>;
const scoreTransactionMock = scoreTransaction as ReturnType<typeof vi.fn>;

const baseRow = {
  id: "tx-1",
  externalId: "evt_1",
  amount: "50.00",
  currency: "usd",
  merchantId: "merchant_1",
  customerId: "customer_1",
  cardBin: "411111",
  cardLast4: "1111",
  ipAddress: "1.2.3.4",
  deviceId: "device_1",
  status: "pending",
  riskScore: null,
  rawPayload: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    externalId: "evt_1",
    amount: 50,
    currency: "usd",
    merchantId: "merchant_1",
    customerId: "customer_1",
    cardBin: "411111",
    ...overrides,
  };
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/transactions", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// Configures db.insert(transactions).values(...).onConflictDoNothing(...).returning()
function mockInsertReturning(rows: unknown[]) {
  insertMock.mockReturnValue({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: () => Promise.resolve(rows),
      }),
    }),
  });
}

// Configures db.select().from().where().limit() for the idempotent re-select path
function mockSelectExisting(row: unknown) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([row]),
      }),
    }),
  });
}

// Configures db.transaction(cb) to run cb against a fake tx, capturing what
// gets written so tests can assert on audit log / case insert payloads.
function mockDbTransaction(updatedRow: unknown) {
  const auditValues = vi.fn(() => Promise.resolve(undefined));
  const caseValues = vi.fn(() => Promise.resolve(undefined));
  const txInsert = vi.fn((table: unknown) => ({
    values: table === cases ? caseValues : auditValues,
  }));
  const txUpdate = vi.fn(() => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([updatedRow]),
      }),
    }),
  }));

  transactionMock.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ insert: txInsert, update: txUpdate })
  );

  return { txInsert, auditValues, caseValues, txUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/transactions", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(postRequest("not json"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a schema-invalid payload", async () => {
    const res = await POST(postRequest({ amount: 50 }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid transaction event");
    expect(body.issues).toBeDefined();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts, scores, and writes an audit log entry for a new allowed transaction", async () => {
    mockInsertReturning([baseRow]);
    scoreTransactionMock.mockResolvedValue({
      status: "allowed",
      riskScore: 0,
      hits: [],
    } satisfies ScoringResult);
    const { txInsert, auditValues, caseValues } = mockDbTransaction({
      ...baseRow,
      status: "allowed",
      riskScore: "0.0000",
    });

    const res = await POST(postRequest(validPayload()));

    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("allowed");
    expect(txInsert).toHaveBeenCalledWith(auditLog);
    expect(auditValues).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "transaction",
        entityId: baseRow.id,
        action: "auto_scored",
        actor: "rules-engine",
      })
    );
    expect(caseValues).not.toHaveBeenCalled();
  });

  it("opens a medium-priority case when held below the high-priority risk threshold", async () => {
    mockInsertReturning([baseRow]);
    scoreTransactionMock.mockResolvedValue({
      status: "held",
      riskScore: 0.5,
      hits: [{ rule: "high_amount", weight: 0.5, detail: "amount over threshold" }],
    } satisfies ScoringResult);
    const { caseValues } = mockDbTransaction({
      ...baseRow,
      status: "held",
      riskScore: "0.5000",
    });

    await POST(postRequest(validPayload()));

    expect(caseValues).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: baseRow.id, priority: "medium" })
    );
  });

  it("opens a high-priority case when held at or above the risk threshold", async () => {
    mockInsertReturning([baseRow]);
    scoreTransactionMock.mockResolvedValue({
      status: "held",
      riskScore: 0.6,
      hits: [],
    } satisfies ScoringResult);
    const { caseValues } = mockDbTransaction({
      ...baseRow,
      status: "held",
      riskScore: "0.6000",
    });

    await POST(postRequest(validPayload()));

    expect(caseValues).toHaveBeenCalledWith(expect.objectContaining({ priority: "high" }));
  });

  it("opens a high-priority case when blocked, regardless of exact score", async () => {
    mockInsertReturning([baseRow]);
    scoreTransactionMock.mockResolvedValue({
      status: "blocked",
      riskScore: 1,
      hits: [],
    } satisfies ScoringResult);
    const { caseValues } = mockDbTransaction({
      ...baseRow,
      status: "blocked",
      riskScore: "1.0000",
    });

    const res = await POST(postRequest(validPayload()));

    expect(res.status).toBe(201);
    expect(caseValues).toHaveBeenCalledWith(expect.objectContaining({ priority: "high" }));
  });

  it("is idempotent on externalId: returns the existing row without re-scoring or re-casing", async () => {
    mockInsertReturning([]); // onConflictDoNothing -> nothing returned
    mockSelectExisting(baseRow);

    const res = await POST(postRequest(validPayload()));

    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(baseRow.id);
    expect(scoreTransactionMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
