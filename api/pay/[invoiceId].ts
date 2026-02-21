import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createLogger } from "../../lib/logger";
import { findPaymentBySellAuthInvoice, createPayment } from "../../lib/db";
import { getInvoice } from "../../lib/sellauth";
import { createInvoice } from "../../lib/nowpayments";
import { getConfig } from "../../lib/config";
import { enforceRateLimit } from "../../lib/rate-limit";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const log = createLogger({ source: "pay" });

  // Only allow GET (customer clicks a link)
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await enforceRateLimit(req, res, "PAY"))) {
    return;
  }

  const invoiceId = req.query.invoiceId as string;
  if (!invoiceId) {
    await log.error("Missing invoiceId in URL param");
    return res.status(400).json({ error: "Missing invoice ID" });
  }

  const logWithInvoice = log.withInvoice(invoiceId);
  await logWithInvoice.info("Payment flow started", { invoiceId });

  try {
    // NOWPayments sends users back to this endpoint after success/cancel.
    // Handle that callback first so we do not loop back into invoice creation.
    const callbackStatus = req.query.status as string | undefined;
    if (callbackStatus === "success" || callbackStatus === "cancelled") {
      const returnTemplate = await getConfig("CUSTOMER_RETURN_URL_TEMPLATE");
      const fallbackBaseUrl = await getConfig("BASE_URL");

      if (returnTemplate) {
        const returnUrl = returnTemplate
          .replace(/\{invoiceId\}/g, encodeURIComponent(invoiceId))
          .replace(/\{status\}/g, encodeURIComponent(callbackStatus));

        await logWithInvoice.info("Redirecting customer to configured return URL", {
          callbackStatus,
          returnUrl,
        });
        return res.redirect(302, returnUrl);
      }

      await logWithInvoice.warn(
        "CUSTOMER_RETURN_URL_TEMPLATE not configured; showing callback confirmation page",
        { callbackStatus, baseUrl: fallbackBaseUrl }
      );

      const statusLabel = callbackStatus === "success" ? "Payment successful" : "Payment cancelled";
      const safeInvoiceId = escapeHtml(invoiceId);
      return res.status(200).send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${statusLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: 0 auto; }
      .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 8px 0; color: #333; }
      code { background: #f6f6f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${statusLabel}</h1>
      <p>Your invoice ID is <code>${safeInvoiceId}</code>.</p>
      <p>You can close this tab and return to the shop.</p>
      <p>To auto-redirect customers, set <code>CUSTOMER_RETURN_URL_TEMPLATE</code> (for example: <code>https://your-store.com/checkout/{invoiceId}</code>). The <code>{status}</code> placeholder is optional.</p>
    </div>
  </body>
</html>`);
    }

    // -----------------------------------------------------------------------
    // Step 1: Check if we already created a NOWPayments invoice for this
    //         SellAuth invoice (idempotency -- prevents duplicate invoices)
    // -----------------------------------------------------------------------
    const existing = await findPaymentBySellAuthInvoice(invoiceId);
    if (existing && existing.nowpayments_invoice_url) {
      await logWithInvoice.info("Found existing NOWPayments invoice, redirecting", {
        nowpayments_invoice_id: existing.nowpayments_invoice_id,
        nowpayments_invoice_url: existing.nowpayments_invoice_url,
        status: existing.status,
      });
      return res.redirect(302, existing.nowpayments_invoice_url);
    }

    // -----------------------------------------------------------------------
    // Step 2: Fetch the SellAuth invoice to get amount, currency, email
    // -----------------------------------------------------------------------
    await logWithInvoice.info("Fetching SellAuth invoice");

    let sellauthInvoice;
    try {
      sellauthInvoice = await getInvoice(invoiceId);
    } catch (err) {
      await logWithInvoice.error("Failed to fetch SellAuth invoice", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(404).json({ error: "Invoice not found" });
    }

    await logWithInvoice.info("SellAuth invoice fetched", {
      id: sellauthInvoice.id,
      unique_id: sellauthInvoice.unique_id,
      status: sellauthInvoice.status,
      price: sellauthInvoice.price,
      price_usd: sellauthInvoice.price_usd,
      currency: sellauthInvoice.currency,
      email: sellauthInvoice.email,
      manual: sellauthInvoice.manual,
      items: sellauthInvoice.items?.map((i) => ({
        product: i.product?.name,
        variant: i.variant?.name,
        price: i.price,
        quantity: i.quantity,
      })),
    });

    // -----------------------------------------------------------------------
    // Step 3: Validate the invoice
    // -----------------------------------------------------------------------
    if (sellauthInvoice.status === "completed") {
      await logWithInvoice.warn("Invoice already completed, cannot create payment");
      return res.status(400).json({ error: "This invoice has already been completed" });
    }

    if (sellauthInvoice.status === "cancelled") {
      await logWithInvoice.warn("Invoice is cancelled");
      return res.status(400).json({ error: "This invoice has been cancelled" });
    }

    if (!sellauthInvoice.manual) {
      await logWithInvoice.info("Invoice manual field is falsy, proceeding anyway", {
        manual: sellauthInvoice.manual,
        gateway: sellauthInvoice.gateway,
      });
    }

    // -----------------------------------------------------------------------
    // Step 4: Create a NOWPayments invoice
    // -----------------------------------------------------------------------
    const baseUrl = await getConfig("BASE_URL");
    if (!baseUrl) {
      await logWithInvoice.error("BASE_URL is not configured");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const priceUsd = parseFloat(sellauthInvoice.price_usd || sellauthInvoice.price);
    if (isNaN(priceUsd) || priceUsd <= 0) {
      await logWithInvoice.error("Invalid price on SellAuth invoice", {
        price: sellauthInvoice.price,
        price_usd: sellauthInvoice.price_usd,
      });
      return res.status(400).json({ error: "Invalid invoice amount" });
    }

    const npInvoiceParams = {
      price_amount: priceUsd,
      price_currency: "usd",
      order_id: invoiceId,
      order_description: `SellAuth Order ${sellauthInvoice.id}`,
      ipn_callback_url: `${baseUrl}/api/ipn`,
      success_url: `${baseUrl}/api/pay/${invoiceId}?status=success`,
      cancel_url: `${baseUrl}/api/pay/${invoiceId}?status=cancelled`,
    };

    await logWithInvoice.info("Creating NOWPayments invoice", {
      params: npInvoiceParams,
    });

    let npInvoice;
    try {
      npInvoice = await createInvoice(npInvoiceParams);
    } catch (err) {
      await logWithInvoice.error("Failed to create NOWPayments invoice", {
        error: err instanceof Error ? err.message : String(err),
        params: npInvoiceParams,
      });
      return res.status(502).json({ error: "Failed to create crypto payment" });
    }

    await logWithInvoice.info("NOWPayments invoice created", {
      nowpayments_invoice_id: npInvoice.id,
      invoice_url: npInvoice.invoice_url,
      price_amount: npInvoice.price_amount,
      price_currency: npInvoice.price_currency,
    });

    // -----------------------------------------------------------------------
    // Step 5: Save to database
    // -----------------------------------------------------------------------
    try {
      await createPayment({
        sellauth_invoice_id: invoiceId,
        sellauth_invoice_data: sellauthInvoice as unknown as Record<string, unknown>,
        nowpayments_invoice_id: String(npInvoice.id),
        nowpayments_invoice_url: npInvoice.invoice_url,
        status: "created",
        amount_usd: priceUsd,
      });
      await logWithInvoice.info("Payment record saved to database");
    } catch (err) {
      // Non-fatal: log it but still redirect the customer
      await logWithInvoice.error("Failed to save payment record to database", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // -----------------------------------------------------------------------
    // Step 6: Redirect customer to NOWPayments payment page
    // -----------------------------------------------------------------------
    await logWithInvoice.info("Redirecting customer to NOWPayments", {
      invoice_url: npInvoice.invoice_url,
    });

    return res.redirect(302, npInvoice.invoice_url);
  } catch (err) {
    await logWithInvoice.error("Unhandled error in payment flow", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}
