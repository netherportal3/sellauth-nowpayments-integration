import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/logs
 *
 * DEPRECATED — this endpoint used query-param auth which leaks secrets
 * into logs, browser history, and referrer headers.
 *
 * Use the admin dashboard at /api/admin instead, which uses secure
 * header-based Bearer token authentication.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(410).json({
    error: "This endpoint has been retired for security reasons",
    message: "Use the admin dashboard at /api/admin instead",
  });
}
