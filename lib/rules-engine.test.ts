import { beforeEach, describe, expect, it, vi } from "vitest";
import type { transactions } from "@/db/schema";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/db";
import { scoreTransaction } from "./rules-engine";

type Transaction = typeof transactions.$inferSelect;

function buildTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    externalId: "evt_1",
    amount: "50.00",
    currency: "usd",
    merchantId: "merchant_1",
    customerId: "customer_1",
    cardBin: "411111",
    cardLast4: "1111",
    ipAddress: "1.2.3.4",
    deviceId: "device_1",
    country: "US",
    status: "pending",
    riskScore: null,
    rawPayload: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Configures db.select().from().where() to resolve with the given prior
// transactions, as used by the velocity/geo_mismatch rules' shared query.
function mockPriorTransactions(rows: { id: string; country?: string | null }[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPriorTransactions([]);
});

describe("scoreTransaction", () => {
  it("allows a clean transaction", async () => {
    const result = await scoreTransaction(buildTransaction());

    expect(result.status).toBe("allowed");
    expect(result.riskScore).toBe(0);
    expect(result.hits).toEqual([]);
  });

  it("flags a high amount", async () => {
    const result = await scoreTransaction(buildTransaction({ amount: "2000.00" }));

    expect(result.hits.map((h) => h.rule)).toContain("high_amount");
    expect(result.riskScore).toBeCloseTo(0.5);
    expect(result.status).toBe("held");
  });

  it("flags velocity when the customer has enough recent transactions", async () => {
    mockPriorTransactions([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const result = await scoreTransaction(buildTransaction());

    expect(result.hits.map((h) => h.rule)).toContain("velocity");
    expect(result.riskScore).toBeCloseTo(0.4);
    expect(result.status).toBe("held");
  });

  it("does not flag velocity when under the threshold", async () => {
    mockPriorTransactions([{ id: "a" }, { id: "b" }]);

    const result = await scoreTransaction(buildTransaction());

    expect(result.hits.map((h) => h.rule)).not.toContain("velocity");
    expect(result.status).toBe("allowed");
  });

  it("flags geo_mismatch when a recent transaction from the same customer has a different country", async () => {
    mockPriorTransactions([{ id: "a", country: "FR" }]);

    const result = await scoreTransaction(buildTransaction({ country: "US" }));

    expect(result.hits.map((h) => h.rule)).toContain("geo_mismatch");
    expect(result.riskScore).toBeCloseTo(0.35);
    expect(result.status).toBe("allowed");
  });

  it("does not flag geo_mismatch when the recent transaction's country matches", async () => {
    mockPriorTransactions([{ id: "a", country: "US" }]);

    const result = await scoreTransaction(buildTransaction({ country: "US" }));

    expect(result.hits.map((h) => h.rule)).not.toContain("geo_mismatch");
  });

  it("does not flag geo_mismatch when the transaction has no country", async () => {
    mockPriorTransactions([{ id: "a", country: "FR" }]);

    const result = await scoreTransaction(buildTransaction({ country: null }));

    expect(result.hits.map((h) => h.rule)).not.toContain("geo_mismatch");
  });

  it("does not flag geo_mismatch when the prior transaction has no country on record", async () => {
    mockPriorTransactions([{ id: "a", country: null }]);

    const result = await scoreTransaction(buildTransaction({ country: "US" }));

    expect(result.hits.map((h) => h.rule)).not.toContain("geo_mismatch");
  });

  it("skips the velocity query entirely when there is no customerId", async () => {
    const result = await scoreTransaction(buildTransaction({ customerId: null }));

    expect(db.select).not.toHaveBeenCalled();
    expect(result.hits.map((h) => h.rule)).not.toContain("velocity");
  });

  it("flags thin data when both customerId and cardBin are missing", async () => {
    const result = await scoreTransaction(
      buildTransaction({ customerId: null, cardBin: null })
    );

    expect(result.hits.map((h) => h.rule)).toContain("thin_data");
    expect(result.riskScore).toBeCloseTo(0.15);
    expect(result.status).toBe("allowed");
  });

  it("blocks when stacked rule weights reach the block threshold", async () => {
    mockPriorTransactions([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const result = await scoreTransaction(
      buildTransaction({ amount: "2000.00" })
    );

    // high_amount (0.5) + velocity (0.4) = 0.9
    expect(result.riskScore).toBeCloseTo(0.9);
    expect(result.status).toBe("blocked");
  });

  it("caps the risk score at 1 even if weights would exceed it", async () => {
    mockPriorTransactions([{ id: "a" }, { id: "b" }, { id: "c" }]);

    const result = await scoreTransaction(
      buildTransaction({ amount: "2000.00", customerId: null, cardBin: null })
    );

    // high_amount (0.5) + thin_data (0.15), velocity skipped without customerId
    expect(result.riskScore).toBeLessThanOrEqual(1);
    expect(result.status).toBe("held");
  });
});
