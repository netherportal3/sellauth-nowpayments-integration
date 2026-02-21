import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLogger } from "../lib/logger";
import { getPaymentStatus } from "../lib/nowpayments";
import { enforceRateLimit } from "../lib/rate-limit";

/**
 * GET /api/payment-status?id={nowpayments_payment_id}&order_id={sellauth_invoice_id}
 *
 * Proxies to NOWPayments GET /v1/payment/{id} to check payment status.
 * Requires order_id to reduce cross-order data exposure.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const log = createLogger({ source: "payment-status" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await enforceRateLimit(req, res, "PAYMENT_STATUS"))) {
    return;
  }

  const paymentId = req.query.id as string;
  if (!paymentId) {
    return res.status(400).json({ error: "Missing 'id' query parameter (NOWPayments payment ID)" });
  }
  const orderId = req.query.order_id as string;
  if (!orderId) {
    return res.status(400).json({ error: "Missing 'order_id' query parameter (SellAuth invoice ID)" });
  }

  try {
    await log.info("Checking payment status", { paymentId, orderId });

    const status = await getPaymentStatus(paymentId);
    if (status.order_id !== orderId) {
      await log.warn("Payment status request rejected due to order mismatch", {
        paymentId,
        requested_order_id: orderId,
        actual_order_id: status.order_id,
      });
      return res.status(404).json({ error: "Payment not found" });
    }

    await log.info("Payment status retrieved", {
      paymentId,
      payment_status: status.payment_status,
      pay_currency: status.pay_currency,
      actually_paid: status.actually_paid,
    });

    // Return only fields needed for customer-facing payment progress.
    return res.status(200).json({
      payment_id: status.payment_id,
      payment_status: status.payment_status,
      price_amount: status.price_amount,
      price_currency: status.price_currency,
      pay_amount: status.pay_amount,
      pay_currency: status.pay_currency,
      actually_paid: status.actually_paid,
    });
  } catch (err) {
    await log.error("Failed to get payment status", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(502).json({ error: "Failed to fetch payment status from NOWPayments" });
  }
}
