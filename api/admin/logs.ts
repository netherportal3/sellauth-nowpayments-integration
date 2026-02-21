import type { VercelRequest, VercelResponse } from "@vercel/node";
import { queryLogs } from "../../lib/db";
import { enforceRateLimit } from "../../lib/rate-limit";
import { verifyAdminRequest } from "../../lib/admin-auth";

/**
 * GET /api/admin/logs
 *
 * Returns application logs from the Postgres logs table.
 * Protected by Bearer token auth.
 *
 * Query params:
 *   limit   – number of logs (default 50, max 500)
 *   offset  – pagination offset (default 0)
 *   source  – filter by source (e.g. "ipn", "pay")
 *   level   – filter by level ("info", "warn", "error")
 *   invoice – filter by sellauth_invoice_id
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await enforceRateLimit(req, res, "ADMIN_API"))) {
    return;
  }

  if (!(await verifyAdminRequest(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const source = req.query.source as string | undefined;
    const level = req.query.level as string | undefined;
    const invoice = req.query.invoice as string | undefined;

    const logs = await queryLogs({
      limit,
      offset,
      source,
      level,
      sellauth_invoice_id: invoice,
    });

    return res.status(200).json({
      count: logs.length,
      limit,
      offset,
      logs,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to query logs",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
