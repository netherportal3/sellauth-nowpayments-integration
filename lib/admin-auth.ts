import crypto from "crypto";
import type { VercelRequest } from "@vercel/node";
import { cleanupExpiredAdminSessions, insertAdminSession, touchAdminSession } from "./db";

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET not configured on the server");
  }
  return secret;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function isValidAdminPassword(password: unknown): boolean {
  if (typeof password !== "string" || password.length === 0) {
    return false;
  }
  const secret = getAdminSecret();
  return timingSafeEqualString(password, secret);
}

export async function createAdminSessionToken(): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAtDate = new Date(Date.now() + ADMIN_SESSION_TTL_MS);
  await insertAdminSession(hashToken(token), expiresAtDate);
  // Opportunistic cleanup to keep table small with no cron requirement.
  if (Math.random() < 0.05) {
    await cleanupExpiredAdminSessions();
  }
  return { token, expiresAt: expiresAtDate.toISOString() };
}

export async function isValidAdminSessionToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length < 32) {
    return false;
  }
  const isValid = await touchAdminSession(hashToken(token));
  if (isValid && Math.random() < 0.02) {
    await cleanupExpiredAdminSessions();
  }
  return isValid;
}

export async function verifyAdminRequest(req: VercelRequest): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  return isValidAdminSessionToken(auth.slice(7));
}
