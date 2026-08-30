import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, cases } from "@/db/schema";
import { getCurrentAnalyst } from "@/lib/auth";
import type { RuleHit } from "@/lib/rules-engine";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const analyst = await getCurrentAnalyst();
  if (!analyst) redirect("/login");

  const caseRow = await db.query.cases.findFirst({
    where: eq(cases.id, id),
    with: { transaction: true, decisions: true },
  });

  if (!caseRow) notFound();

  const [scoringEvent] = await db
    .select()
    .from(auditLog)
    .where(
      and(eq(auditLog.entityType, "transaction"), eq(auditLog.entityId, caseRow.transactionId))
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  const hits = (scoringEvent?.metadata as { hits?: RuleHit[] } | null)?.hits ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/cases" className="text-sm text-zinc-500 hover:underline">
        ← Back to open cases
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">Case {caseRow.id.slice(0, 8)}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {caseRow.status} · {caseRow.priority} priority · opened {caseRow.openedAt.toLocaleString()}
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Transaction
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-zinc-500">Amount</dt>
          <dd>
            {caseRow.transaction.amount} {caseRow.transaction.currency.toUpperCase()}
          </dd>
          <dt className="text-zinc-500">Merchant</dt>
          <dd>{caseRow.transaction.merchantId}</dd>
          <dt className="text-zinc-500">Customer</dt>
          <dd>{caseRow.transaction.customerId ?? "—"}</dd>
          <dt className="text-zinc-500">Card</dt>
          <dd>
            {caseRow.transaction.cardBin ?? "—"} ···· {caseRow.transaction.cardLast4 ?? "····"}
          </dd>
          <dt className="text-zinc-500">IP address</dt>
          <dd>{caseRow.transaction.ipAddress ?? "—"}</dd>
          <dt className="text-zinc-500">Status</dt>
          <dd className="capitalize">{caseRow.transaction.status}</dd>
          <dt className="text-zinc-500">Risk score</dt>
          <dd>{caseRow.transaction.riskScore ?? "—"}</dd>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Rule hits
        </h2>
        {hits.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">No rule hits recorded.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {hits.map((hit) => (
              <li
                key={hit.rule}
                className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{hit.rule}</span>
                  <span className="text-zinc-500">weight {hit.weight}</span>
                </div>
                <p className="mt-1 text-zinc-500">{hit.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Decisions
        </h2>
        {caseRow.decisions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No decisions yet. Decision submission isn&apos;t wired up until analyst auth exists.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {caseRow.decisions.map((decision) => (
              <li
                key={decision.id}
                className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <span className="font-medium capitalize">{decision.decision}</span>
                {" — "}
                {decision.notes ?? "no notes"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
