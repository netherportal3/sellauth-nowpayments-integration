import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeDatabase } from "../../lib/db";
import { enforceRateLimit } from "../../lib/rate-limit";
import { verifyAdminRequest } from "../../lib/admin-auth";

/**
 * POST /api/admin/setup
 *
 * Initializes database tables (payments, logs, config, admin sessions,
 * distributed rate limits + indexes).
 * Protected by Bearer token auth. Idempotent — safe to call multiple times.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await enforceRateLimit(req, res, "ADMIN_API"))) {
    return;
  }

  if (!(await verifyAdminRequest(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await initializeDatabase();
    return res.status(200).json({
      success: true,
      message:
        "Database tables created successfully (payments, logs, config, admin sessions, rate limits + indexes)",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Failed to initialize database",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
