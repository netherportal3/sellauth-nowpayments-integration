import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConfig } from "./config";
import { cleanupOldRateLimits, incrementRateLimitCount } from "./db";

type RateLimitScope = "PAY" | "PAYMENT_STATUS" | "IPN" | "ADMIN_AUTH" | "ADMIN_API";

interface ScopeDefaults {
  limit: number;
  windowMs: number;
}

const DEFAULTS: Record<RateLimitScope, ScopeDefaults> = {
  PAY: { limit: 120, windowMs: 60_000 },
  PAYMENT_STATUS: { limit: 300, windowMs: 60_000 },
  IPN: { limit: 1200, windowMs: 60_000 },
  ADMIN_AUTH: { limit: 20, windowMs: 60_000 },
  ADMIN_API: { limit: 240, windowMs: 60_000 },
};

interface Bucket {
  count: number;
  resetAt: number;
}

// In-memory fallback only used when DB rate-limit writes fail.
const fallbackBuckets = new Map<string, Bucket>();

interface CachedInt {
  value: number;
  expiresAt: number;
}

const intConfigCache = new Map<string, CachedInt>();
const CONFIG_CACHE_TTL_MS = 10_000;

async function readIntConfig(key: string, fallback: number): Promise<number> {
  const now = Date.now();
  const cached = intConfigCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value = fallback;
  try {
    const raw = await getConfig(key);
    const parsed = raw === undefined ? NaN : parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      value = parsed;
    }
  } catch {
    value = fallback;
  }

  intConfigCache.set(key, { value, expiresAt: now + CONFIG_CACHE_TTL_MS });
  return value;
}

function getClientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0 && xff[0]) {
    return xff[0].split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }
  return "unknown";
}

function maybeCleanupBuckets(now: number): void {
  // Lightweight cleanup to avoid unbounded growth.
  if (fallbackBuckets.size < 5000) return;
  for (const [key, bucket] of fallbackBuckets) {
    if (bucket.resetAt <= now) {
      fallbackBuckets.delete(key);
    }
  }
}

let lastDbCleanupAt = 0;

async function maybeCleanupRateLimitsInDb(now: number, windowMs: number): Promise<void> {
  // At most once every 15 minutes per warm instance.
  if (now - lastDbCleanupAt < 15 * 60_000) return;
  lastDbCleanupAt = now;
  const cutoff = now - Math.max(windowMs * 5, 15 * 60_000);
  try {
    await cleanupOldRateLimits(cutoff);
  } catch {
    // Cleanup is best-effort only.
  }
}

export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  scope: RateLimitScope
): Promise<boolean> {
  const defaults = DEFAULTS[scope];
  const [limit, windowMs] = await Promise.all([
    readIntConfig(`RATE_LIMIT_${scope}_LIMIT`, defaults.limit),
    readIntConfig(`RATE_LIMIT_${scope}_WINDOW_MS`, defaults.windowMs),
  ]);

  // Setting either value to 0 or less disables limiting for this scope.
  if (limit <= 0 || windowMs <= 0) {
    return true;
  }

  const now = Date.now();
  const clientIp = getClientIp(req);
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const resetSeconds = Math.max(0, Math.ceil((resetAt - now) / 1000));

  let currentCount = 0;
  let usedFallback = false;
  try {
    currentCount = await incrementRateLimitCount(scope, clientIp, windowStart);
    // Fire-and-forget periodic table cleanup.
    void maybeCleanupRateLimitsInDb(now, windowMs);
  } catch {
    // DB unavailable: fail closed with local limiting instead of disabling protection.
    usedFallback = true;
    maybeCleanupBuckets(now);
    const key = `${scope}:${clientIp}`;
    const existing = fallbackBuckets.get(key);
    let bucket: Bucket;
    if (!existing || existing.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      fallbackBuckets.set(key, bucket);
    } else {
      bucket = existing;
    }
    bucket.count += 1;
    currentCount = bucket.count;
  }

  const remainingAfter = Math.max(0, limit - currentCount);

  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(remainingAfter));
  res.setHeader("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));
  if (usedFallback) {
    res.setHeader("X-RateLimit-Mode", "fallback");
  }

  if (currentCount > limit) {
    res.setHeader("Retry-After", String(resetSeconds));
    res.status(429).json({
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again soon.",
      scope,
      retry_after_seconds: resetSeconds,
    });
    return false;
  }
  return true;
}

