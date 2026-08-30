import { login } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-500">Enter your analyst email and password to continue.</p>

      <form action={login} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          name="email"
          required
          placeholder="you@fraudection.com"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        />
        <input
          type="password"
          name="password"
          required
          placeholder="Password"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Continue
        </button>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          Incorrect email or password.
        </p>
      )}
    </main>
  );
}
