import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllConfig, upsertConfig, deleteConfig } from "../../lib/db";
import { enforceRateLimit } from "../../lib/rate-limit";
import { verifyAdminRequest } from "../../lib/admin-auth";

/** Known configuration keys (mirrors .env.example). */
const KNOWN_KEYS = [
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_IPN_SECRET",
  "SELLAUTH_API_KEY",
  "SELLAUTH_SHOP_ID",
  "BASE_URL",
  "CUSTOMER_RETURN_URL_TEMPLATE",
  "DATABASE_URL",
  "ADMIN_SECRET",
  "RATE_LIMIT_PAY_LIMIT",
  "RATE_LIMIT_PAY_WINDOW_MS",
  "RATE_LIMIT_PAYMENT_STATUS_LIMIT",
  "RATE_LIMIT_PAYMENT_STATUS_WINDOW_MS",
  "RATE_LIMIT_IPN_LIMIT",
  "RATE_LIMIT_IPN_WINDOW_MS",
  "RATE_LIMIT_ADMIN_AUTH_LIMIT",
  "RATE_LIMIT_ADMIN_AUTH_WINDOW_MS",
  "RATE_LIMIT_ADMIN_API_LIMIT",
  "RATE_LIMIT_ADMIN_API_WINDOW_MS",
];
const ENV_ONLY_KEYS = new Set(["DATABASE_URL", "ADMIN_SECRET"]);
const SENSITIVE_KEYS = new Set([
  "NOWPAYMENTS_API_KEY",
  "NOWPAYMENTS_IPN_SECRET",
  "SELLAUTH_API_KEY",
  "DATABASE_URL",
  "ADMIN_SECRET",
]);

/**
 * /api/admin/config
 *
 *   GET    → list all config entries (DB overrides + ENV fallbacks)
 *   PUT    → upsert a config key/value into the database
 *   DELETE → remove a database override (falls back to ENV)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await enforceRateLimit(req, res, "ADMIN_API"))) {
    return;
  }

  if (!(await verifyAdminRequest(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // ── GET ── list all config
  if (req.method === "GET") {
    try {
      const dbConfig = await getAllConfig();
      const dbMap = new Map(dbConfig.map((c) => [c.key, c]));

      // Merge known keys + any custom keys stored in DB
      const allKeys = new Set([...KNOWN_KEYS, ...dbConfig.map((c) => c.key)]);

      const entries = Array.from(allKeys)
        .sort()
        .map((key) => {
          const dbEntry = dbMap.get(key);
          const envValue = process.env[key];
          const isSensitive = SENSITIVE_KEYS.has(key);
          const activeValue = dbEntry?.value ?? envValue ?? null;
          return {
            key,
            db_value: isSensitive ? null : dbEntry?.value ?? null,
            env_set: envValue !== undefined,
            env_value: isSensitive ? null : envValue ?? null,
            active_source: dbEntry ? "db" : envValue ? "env" : "unset",
            active_value: isSensitive ? null : activeValue,
            has_active_value: activeValue !== null,
            updated_at: dbEntry?.updated_at ?? null,
            is_known: KNOWN_KEYS.includes(key),
            env_only: ENV_ONLY_KEYS.has(key),
            sensitive: isSensitive,
          };
        });

      return res.status(200).json({ entries, known_keys: KNOWN_KEYS });
    } catch (err) {
      return res.status(500).json({
        error: "Failed to load config",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── PUT ── upsert a config value
  if (req.method === "PUT") {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Missing key or value" });
    }
    const keyString = String(key);
    if (ENV_ONLY_KEYS.has(keyString)) {
      return res.status(400).json({
        error: `${keyString} must be set in environment variables and cannot be overridden in the dashboard`,
      });
    }
    try {
      await upsertConfig(keyString, String(value));
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({
        error: "Failed to save config",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── DELETE ── remove a DB override
  if (req.method === "DELETE") {
    const key = req.query.key as string;
    if (!key) {
      return res.status(400).json({ error: "Missing key query parameter" });
    }
    if (ENV_ONLY_KEYS.has(key)) {
      return res.status(400).json({
        error: `${key} is environment-only and cannot be removed from the dashboard`,
      });
    }
    try {
      await deleteConfig(key);
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({
        error: "Failed to delete config",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
