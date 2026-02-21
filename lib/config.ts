import { getConfigValue } from "./db";

/**
 * Keys that MUST always come from environment variables.
 * DATABASE_URL is needed to even access the config table (chicken-and-egg).
 */
const ENV_ONLY_KEYS = new Set(["DATABASE_URL", "ADMIN_SECRET"]);

/**
 * Get a configuration value.
 *
 * Resolution order:
 *   1. If the key is in ENV_ONLY_KEYS → always return process.env[key]
 *   2. Check the `config` table in the database for an override
 *   3. Fall back to process.env[key]
 *
 * This lets the admin GUI override values stored in Vercel env vars
 * without needing a redeploy.
 */
export async function getConfig(key: string): Promise<string | undefined> {
  if (ENV_ONLY_KEYS.has(key)) {
    return process.env[key];
  }

  try {
    const dbValue = await getConfigValue(key);
    if (dbValue !== null) return dbValue;
  } catch {
    // DB not available or config table doesn't exist yet — fall back to ENV
  }

  return process.env[key];
}
