import crypto from "crypto";

/**
 * Verify a NOWPayments IPN webhook signature.
 *
 * NOWPayments signs the webhook body with HMAC-SHA512:
 * 1. Sort the JSON body keys alphabetically
 * 2. Stringify the sorted object
 * 3. HMAC-SHA512 with IPN secret
 * 4. Compare hex digest with x-nowpayments-sig header
 *
 * @param ipnSecret - The IPN secret (caller resolves from config/env)
 */
export function verifyNowPaymentsSignature(
  rawBody: string,
  signature: string,
  ipnSecret: string
): boolean {
  if (!ipnSecret) {
    throw new Error("NOWPAYMENTS_IPN_SECRET is not configured");
  }

  // Parse, sort keys alphabetically, re-stringify
  const parsed = JSON.parse(rawBody);
  const sorted = sortObjectKeys(parsed);
  const sortedJson = JSON.stringify(sorted);

  const hmac = crypto
    .createHmac("sha512", ipnSecret)
    .update(sortedJson)
    .digest("hex");

  const expected = Buffer.from(hmac, "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || expected.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

/**
 * Verify a SellAuth HTTP notification webhook signature.
 *
 * SellAuth signs the raw JSON body with HMAC-SHA256:
 * 1. Take the raw JSON payload
 * 2. HMAC-SHA256 with webhook secret
 * 3. Compare hex digest with X-Signature header
 */
export function verifySellAuthSignature(
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean {
  const hmac = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(hmac, "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length || expected.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

/**
 * Recursively sort an object's keys alphabetically.
 * Required by NOWPayments IPN signature verification.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
