import type { VercelRequest, VercelResponse } from "@vercel/node";
import { enforceRateLimit } from "../../lib/rate-limit";
import { initializeDatabase } from "../../lib/db";
import {
  createAdminSessionToken,
  isValidAdminSessionToken,
  isValidAdminPassword,
} from "../../lib/admin-auth";

let adminBootstrapPromise: Promise<void> | null = null;

async function ensureAdminBootstrap(): Promise<void> {
  if (!adminBootstrapPromise) {
    adminBootstrapPromise = initializeDatabase().catch((err) => {
      adminBootstrapPromise = null;
      throw err;
    });
  }
  await adminBootstrapPromise;
}

/**
 * POST /api/admin/auth
 *
 * Verifies the admin password. Returns { success: true } if valid.
 * The frontend stores the password in sessionStorage and sends it
 * as a Bearer token with subsequent requests.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureAdminBootstrap();
  } catch (err) {
    return res.status(500).json({
      error: "Database bootstrap failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const { password, token } = req.body || {};

  // Session validation path (used by dashboard reloads) should not count as a login attempt.
  if (token !== undefined) {
    try {
      const ok = await isValidAdminSessionToken(token);
      if (!ok) {
        return res.status(401).json({ error: "Invalid session" });
      }
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({
        error: "Failed to validate session",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Password auth path is rate-limited to reduce brute-force attempts.
  if (!(await enforceRateLimit(req, res, "ADMIN_AUTH"))) {
    return;
  }
  let validPassword = false;
  try {
    validPassword = isValidAdminPassword(password);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Server configuration error",
    });
  }
  if (!validPassword) {
    return res.status(401).json({ error: "Invalid password" });
  }

  try {
    const session = await createAdminSessionToken();
    return res.status(200).json({
      success: true,
      token: session.token,
      expires_at: session.expiresAt,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to create admin session",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
