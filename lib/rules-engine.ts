import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";

const VELOCITY_WINDOW_MINUTES = 10;
const VELOCITY_THRESHOLD = 3;
const HIGH_AMOUNT_THRESHOLD = 2000;

// Placeholder blocklist — replace with a real blocklist table once one exists.
const BLOCKED_BINS = new Set<string>([]);

export type RuleHit = {
  rule: string;
  weight: number;
  detail: string;
};

export type ScoringResult = {
  status: "allowed" | "held" | "blocked";
  riskScore: number;
  hits: RuleHit[];
};

type Transaction = typeof transactions.$inferSelect;

export async function scoreTransaction(transaction: Transaction): Promise<ScoringResult> {
  const hits: RuleHit[] = [];

  if (transaction.cardBin && BLOCKED_BINS.has(transaction.cardBin)) {
    hits.push({
      rule: "blocked_bin",
      weight: 1,
      detail: `Card BIN ${transaction.cardBin} is on the blocklist`,
    });
  }

  const amount = Number(transaction.amount);
  if (amount >= HIGH_AMOUNT_THRESHOLD) {
    hits.push({
      rule: "high_amount",
      weight: 0.5,
      detail: `Amount ${amount} ${transaction.currency} meets or exceeds ${HIGH_AMOUNT_THRESHOLD}`,
    });
  }

  if (transaction.customerId) {
    const windowStart = new Date(Date.now() - VELOCITY_WINDOW_MINUTES * 60_000);
    const recent = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.customerId, transaction.customerId),
          gte(transactions.createdAt, windowStart),
          ne(transactions.id, transaction.id)
        )
      );
    if (recent.length >= VELOCITY_THRESHOLD) {
      hits.push({
        rule: "velocity",
        weight: 0.4,
        detail: `${recent.length} other transactions from this customer in the last ${VELOCITY_WINDOW_MINUTES}m`,
      });
    }
  }

  if (!transaction.customerId && !transaction.cardBin) {
    hits.push({
      rule: "thin_data",
      weight: 0.15,
      detail: "Missing customerId and cardBin",
    });
  }

  const riskScore = Math.min(1, hits.reduce((sum, hit) => sum + hit.weight, 0));

  let status: ScoringResult["status"] = "allowed";
  if (riskScore >= 0.8) {
    status = "blocked";
  } else if (riskScore >= 0.4) {
    status = "held";
  }

  return { status, riskScore, hits };
}
