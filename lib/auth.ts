import { cookies } from "next/headers";
import type { analysts } from "@/db/schema";

type Analyst = typeof analysts.$inferSelect;

export const SESSION_COOKIE_NAME = "fraudection_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Mock credentials until real analyst login (email lookup + password hashing) is wired up.
export const MOCK_CREDENTIALS = {
  email: "analyst@fraudection.com",
  password: "password",
};

const MOCK_ANALYST: Analyst = {
  id: "00000000-0000-0000-0000-000000000000",
  email: MOCK_CREDENTIALS.email,
  name: "Mock Analyst",
  role: "analyst",
  createdAt: new Date(0),
};

export async function getCurrentAnalyst(): Promise<Analyst | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return session === MOCK_CREDENTIALS.email ? MOCK_ANALYST : null;
}
