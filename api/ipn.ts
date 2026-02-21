import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLogger } from "../lib/logger";
import { verifyNowPaymentsSignature } from "../lib/verify";
import { findPaymentByNowPaymentsOrderId, updatePaymentStatus } from "../lib/db";
import { getInvoice, processInvoice } from "../lib/sellauth";
import { getConfig } from "../lib/config";
import { enforceRateLimit } from "../lib/rate-limit";

/**
 * NOWPayments IPN (Instant Payment Notification) webhook handler.
 *
 * NOWPayments sends POST requests here when payment status changes.
 * We verify the HMAC-SHA512 signature, update our DB, and process
 * the SellAuth invoice when payment is confirmed/finished.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const log = createLogger({ source: "ipn" });

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await enforceRateLimit(req, res, "IPN"))) {
    return;
  }

  try {
    // -----------------------------------------------------------------------
    // Step 1: Read raw body and headers
    // -----------------------------------------------------------------------
    // Vercel parses the body automatically. We need the raw body for signature
    // verification, so we reconstruct it from the parsed JSON.
    const body = req.body;
    const rawBody = typeof body === "string" ? body : JSON.stringify(body);
    const signature = req.headers["x-nowpayments-sig"] as string | undefined;

    await log.info("IPN webhook received", {
      headers: {
        "x-nowpayments-sig": signature ? `${signature.substring(0, 20)}...` : "MISSING",
        "content-type": req.headers["content-type"],
      },
      body: body,
    });

    // -----------------------------------------------------------------------
    // Step 2: Verify HMAC-SHA512 signature
    // -----------------------------------------------------------------------
    if (!signature) {
      await log.error("IPN rejected: missing x-nowpayments-sig header");
      return res.status(401).json({ error: "Missing signature" });
    }

    let signatureValid = false;
    try {
      const ipnSecret = await getConfig("NOWPAYMENTS_IPN_SECRET");
      if (!ipnSecret) throw new Error("NOWPAYMENTS_IPN_SECRET is not configured");
      signatureValid = verifyNowPaymentsSignature(rawBody, signature, ipnSecret);
    } catch (err) {
      await log.error("IPN signature verification threw error", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(401).json({ error: "Signature verification failed" });
    }

    if (!signatureValid) {
      await log.error("IPN rejected: invalid signature", {
        received_sig: signature.substring(0, 40) + "...",
      });
      return res.status(401).json({ error: "Invalid signature" });
    }

    await log.info("IPN signature verified successfully");

    // -----------------------------------------------------------------------
    // Step 3: Extract payment details from IPN body
    // -----------------------------------------------------------------------
    const {
      payment_id,
      payment_status,
      pay_address,
      pay_currency,
      pay_amount,
      actually_paid,
      price_amount,
      price_currency,
      order_id,
      order_description,
      invoice_id: np_invoice_id,
    } = body;

    // order_id contains our SellAuth invoice identifier (typically unique_id)
    const sellauthInvoiceId = order_id as string;

    if (!sellauthInvoiceId) {
      await log.error("IPN body missing order_id (SellAuth invoice ID)", { body });
      return res.status(400).json({ error: "Missing order_id" });
    }

    const logWithInvoice = log.withInvoice(sellauthInvoiceId);

    await logWithInvoice.info("IPN payment details extracted", {
      payment_id,
      payment_status,
      pay_address,
      pay_currency,
      pay_amount,
      actually_paid,
      price_amount,
      price_currency,
      order_id,
      order_description,
      np_invoice_id,
    });

    // -----------------------------------------------------------------------
    // Step 4: Update payment record in database
    // -----------------------------------------------------------------------
    try {
      await updatePaymentStatus(sellauthInvoiceId, {
        status: payment_status as string,
        nowpayments_payment_id: String(payment_id),
        nowpayments_pay_address: pay_address as string,
        pay_currency: pay_currency as string,
        pay_amount: typeof pay_amount === "number" ? pay_amount : parseFloat(pay_amount as string),
      });
      await logWithInvoice.info("Payment record updated in database", {
        status: payment_status,
      });
    } catch (err) {
      // Non-fatal: still try to process the invoice
      await logWithInvoice.error("Failed to update payment record in database", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // -----------------------------------------------------------------------
    // Step 5: If payment is finished/confirmed, process SellAuth invoice
    // -----------------------------------------------------------------------
    const completedStatuses = ["finished", "confirmed"];

    if (completedStatuses.includes(payment_status as string)) {
      await logWithInvoice.info(
        `Payment status is "${payment_status}" -- processing SellAuth invoice`,
        {
          actually_paid,
          pay_amount,
          pay_currency,
        }
      );

      // Check if we already processed this (avoid double-processing)
      const existingPayment = await findPaymentByNowPaymentsOrderId(sellauthInvoiceId);
      if (existingPayment?.sellauth_processed) {
        await logWithInvoice.warn("SellAuth invoice already processed, skipping", {
          payment_id: existingPayment.id,
        });
        return res.status(200).json({ status: "ok", message: "Already processed" });
      }

      try {
        // Resolve the invoice first so we can process using its canonical numeric ID.
        // Some SellAuth endpoints accept unique_id for reads but require numeric ID for actions.
        let processTargetInvoiceId: string | number = sellauthInvoiceId;
        try {
          const sellauthInvoice = await getInvoice(sellauthInvoiceId);
          processTargetInvoiceId = sellauthInvoice.id ?? sellauthInvoiceId;
          await logWithInvoice.info("Resolved SellAuth invoice for processing", {
            requested_id: sellauthInvoiceId,
            resolved_id: processTargetInvoiceId,
            unique_id: sellauthInvoice.unique_id,
            status: sellauthInvoice.status,
          });
        } catch (resolveErr) {
          await logWithInvoice.warn(
            "Failed to resolve canonical SellAuth invoice ID, using order_id as fallback",
            {
              requested_id: sellauthInvoiceId,
              error: resolveErr instanceof Error ? resolveErr.message : String(resolveErr),
            }
          );
        }

        const processResult = await processInvoice(processTargetInvoiceId);
        await logWithInvoice.info("SellAuth invoice processed successfully", {
          result: processResult,
          process_target_invoice_id: processTargetInvoiceId,
        });

        // Mark as processed in DB
        try {
          await updatePaymentStatus(sellauthInvoiceId, {
            sellauth_processed: true,
          });
        } catch (dbErr) {
          await logWithInvoice.error("Failed to mark sellauth_processed in DB", {
            error: dbErr instanceof Error ? dbErr.message : String(dbErr),
          });
        }
      } catch (err) {
        await logWithInvoice.error("FAILED to process SellAuth invoice", {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          sellauthInvoiceId,
        });
        // Still return 200 to NOWPayments so they don't retry with a failed signature
        // We'll need to manually process this invoice
        return res.status(200).json({
          status: "error",
          message: "Failed to process SellAuth invoice -- manual intervention required",
        });
      }
    } else {
      await logWithInvoice.info(`Payment status "${payment_status}" -- no action needed yet`, {
        waiting_for: completedStatuses,
      });
    }

    return res.status(200).json({ status: "ok" });
  } catch (err) {
    await log.error("Unhandled error in IPN handler", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    // Return 200 to prevent NOWPayments from retrying with broken state
    return res.status(200).json({ status: "error", message: "Internal error" });
  }
}
