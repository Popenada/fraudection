import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { getCurrentAnalyst } from "@/lib/auth";

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
};

export default async function CasesPage() {
  const analyst = await getCurrentAnalyst();
  if (!analyst) redirect("/login");

  const openCases = await db.query.cases.findMany({
    where: eq(cases.status, "open"),
    with: { transaction: true },
  });

  const sorted = [...openCases].sort((a, b) => {
    const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return rankDiff !== 0 ? rankDiff : a.openedAt.getTime() - b.openedAt.getTime();
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Open cases</h1>
      <p className="mt-1 text-sm text-zinc-500">{sorted.length} open</p>

      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-2 pr-4 font-medium">Priority</th>
            <th className="py-2 pr-4 font-medium">Merchant</th>
            <th className="py-2 pr-4 font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">Risk score</th>
            <th className="py-2 pr-4 font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-3 pr-4">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${PRIORITY_BADGE[c.priority]}`}>
                  {c.priority}
                </span>
              </td>
              <td className="py-3 pr-4">
                <Link href={`/cases/${c.id}`} className="hover:underline">
                  {c.transaction.merchantId}
                </Link>
              </td>
              <td className="py-3 pr-4">
                {c.transaction.amount} {c.transaction.currency.toUpperCase()}
              </td>
              <td className="py-3 pr-4">{c.transaction.riskScore ?? "—"}</td>
              <td className="py-3 pr-4">{c.openedAt.toLocaleString()}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-zinc-400">
                No open cases.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
