/**
 * Team sessions for the web app's write actions. The lead (Ananya) signs in with INTAKE_PASSCODE
 * (set in Vercel); she creates teammates, each with their own passcode, stored only as a scrypt hash.
 * The cookie holds "<member id>.<HMAC>", never a passcode.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";

const COOKIE = "radar_session";
const LEAD_NAME = process.env.LEAD_NAME || "Ananya";

export interface Member {
  id: number;
  name: string;
  role: "lead" | "member";
}

function secret(): string {
  return process.env.SESSION_SECRET || process.env.INTAKE_PASSCODE || "";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(`csr-partnership-radar:${value}`).digest("hex");
}

/** The pre-teams cookie (HMAC of the passcode); still accepted, as the lead. */
function legacyToken(passcode: string): string {
  return createHmac("sha256", passcode).update("csr-partnership-radar").digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passcodeConfigured(): boolean {
  return Boolean(process.env.INTAKE_PASSCODE);
}

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(passcode, salt, 32).toString("hex")}`;
}

function verifyPasscode(passcode: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return same(scryptSync(passcode, salt, 32).toString("hex"), hash);
}

async function db() {
  const { getDb } = await import("@/lib/db/client");
  return getDb();
}

async function leadMember(): Promise<Member> {
  const { teamMembers } = await import("@/lib/db/schema");
  const d = await db();
  const [lead] = await d.select().from(teamMembers).where(eq(teamMembers.role, "lead")).limit(1);
  if (lead) return { id: lead.id, name: lead.name, role: "lead" };
  const [made] = await d
    .insert(teamMembers)
    .values({ name: LEAD_NAME, role: "lead" })
    .onConflictDoUpdate({ target: teamMembers.name, set: { role: "lead" } })
    .returning();
  return { id: made.id, name: made.name, role: "lead" };
}

/**
 * Sign in. The lead passcode (INTAKE_PASSCODE) works with any or no name; a teammate needs their
 * name and passcode. Returns the member, or null.
 */
export async function signIn(name: string, passcode: string): Promise<Member | null> {
  if (!passcode) return null;
  let member: Member | null = null;
  const lead = process.env.INTAKE_PASSCODE;
  if (lead && same(legacyToken(passcode), legacyToken(lead))) {
    member = await leadMember();
  } else if (name.trim()) {
    const { teamMembers } = await import("@/lib/db/schema");
    const [m] = await (await db())
      .select()
      .from(teamMembers)
      .where(sql`lower(${teamMembers.name}) = ${name.trim().toLowerCase()} and ${teamMembers.active}`);
    if (m && verifyPasscode(passcode, m.passcodeHash)) member = { id: m.id, name: m.name, role: m.role };
  }
  if (!member) return null;
  const { teamMembers } = await import("@/lib/db/schema");
  await (await db()).update(teamMembers).set({ lastSeenAt: new Date() }).where(eq(teamMembers.id, member.id));
  (await cookies()).set(COOKIE, `${member.id}.${sign(String(member.id))}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return member;
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in member, or null. */
export async function currentMember(): Promise<Member | null> {
  if (!secret()) return null;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return null;
  const lead = process.env.INTAKE_PASSCODE;
  if (lead && same(v, legacyToken(lead))) return leadMember();
  const [id, mac] = v.split(".");
  if (!id || !mac || !same(mac, sign(id))) return null;
  const { teamMembers } = await import("@/lib/db/schema");
  const [m] = await (await db()).select().from(teamMembers).where(eq(teamMembers.id, Number(id)));
  return m && m.active ? { id: m.id, name: m.name, role: m.role } : null;
}

export async function hasSession(): Promise<boolean> {
  return (await currentMember()) !== null;
}
