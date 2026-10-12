/**
 * Minimal passcode session for the few write actions (message drop). INTAKE_PASSCODE is set in
 * Vercel; the cookie holds an HMAC of it, never the passcode itself.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "radar_session";

function token(passcode: string): string {
  return createHmac("sha256", passcode).update("csr-partnership-radar").digest("hex");
}

export function passcodeConfigured(): boolean {
  return Boolean(process.env.INTAKE_PASSCODE);
}

export function checkPasscode(input: string): boolean {
  const expected = process.env.INTAKE_PASSCODE;
  if (!expected) return false;
  const a = Buffer.from(token(input));
  const b = Buffer.from(token(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, token(process.env.INTAKE_PASSCODE ?? ""), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function hasSession(): Promise<boolean> {
  const expected = process.env.INTAKE_PASSCODE;
  if (!expected) return false;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v);
  const b = Buffer.from(token(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}
