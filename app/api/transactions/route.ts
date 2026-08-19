import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";

const transactionEventSchema = z.object({
  externalId: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().min(1),
  merchantId: z.string().min(1),
  customerId: z.string().optional(),
  cardBin: z.string().optional(),
  cardLast4: z.string().optional(),
  ipAddress: z.string().optional(),
  deviceId: z.string().optional(),
});

// Payment provider webhook ingestion: validates the event, writes the raw
// payload + parsed fields, and is idempotent on externalId since providers
// retry webhook delivery.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = transactionEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transaction event", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const event = parsed.data;

  const [inserted] = await db
    .insert(transactions)
    .values({
      externalId: event.externalId,
      amount: String(event.amount),
      currency: event.currency,
      merchantId: event.merchantId,
      customerId: event.customerId,
      cardBin: event.cardBin,
      cardLast4: event.cardLast4,
      ipAddress: event.ipAddress,
      deviceId: event.deviceId,
      rawPayload: body,
    })
    .onConflictDoNothing({ target: transactions.externalId })
    .returning();

  if (inserted) {
    return NextResponse.json(inserted, { status: 201 });
  }

  const [existing] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.externalId, event.externalId))
    .limit(1);

  return NextResponse.json(existing, { status: 200 });
}
