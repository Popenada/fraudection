import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { logout } from "@/app/actions/auth";
import { getCurrentAnalyst } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fraudection",
  description: "Fraud case review",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const analyst = await getCurrentAnalyst();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {analyst && (
          <header className="flex items-center justify-end gap-3 border-b border-zinc-200 px-6 py-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-500">
              Signed in as {analyst.name} ({analyst.email})
            </span>
            <form action={logout}>
              <button type="submit" className="hover:underline">
                Log out
              </button>
            </form>
          </header>
        )}
        {children}
      </body>
    </html>
  );
}
