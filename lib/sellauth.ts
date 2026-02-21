import { getConfig } from "./config";

const SELLAUTH_API_BASE = "https://api.sellauth.com/v1";

async function getApiKey(): Promise<string> {
  const key = await getConfig("SELLAUTH_API_KEY");
  if (!key) throw new Error("SELLAUTH_API_KEY is not configured");
  return key;
}

async function getShopId(): Promise<string> {
  const id = await getConfig("SELLAUTH_SHOP_ID");
  if (!id) throw new Error("SELLAUTH_SHOP_ID is not configured");
  return id;
}

async function saFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = `${SELLAUTH_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `SellAuth API error ${response.status}: ${JSON.stringify(body)}`
    );
  }

  return body;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SellAuthInvoice {
  id: number;
  status: string;
  price: string;
  currency: string;
  price_usd: string;
  paid: string;
  paid_usd: string;
  gateway: string;
  payment_method_id: number;
  email: string;
  salt: string;
  manual: number;
  unique_id: string;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
  shop_id: number;
  crypto_address: string | null;
  crypto_amount: string | null;
  items: SellAuthInvoiceItem[];
  payment_method: {
    name: string;
    icon_image_url: string | null;
    $id?: number;
    id?: number;
  };
  [key: string]: unknown;
}

export interface SellAuthInvoiceItem {
  id: number;
  invoice_id: number;
  product_id: number;
  variant_id: number;
  status: string;
  price: string;
  quantity: number;
  product: {
    id: number;
    name: string;
    stock_count: number;
  };
  variant: {
    id: number;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * Fetch a specific invoice by ID or unique_id.
 *
 * Docs: GET /v1/shops/{shopId}/invoices/{invoiceId}
 */
export async function getInvoice(invoiceId: string | number): Promise<SellAuthInvoice> {
  const shopId = await getShopId();
  const result = await saFetch(`/shops/${shopId}/invoices/${invoiceId}`);
  return result as SellAuthInvoice;
}

/**
 * Process (complete) an invoice. This triggers product delivery.
 *
 * Docs: GET /v1/shops/{shopId}/invoices/{invoiceId}/process
 */
export async function processInvoice(invoiceId: string | number): Promise<unknown> {
  const shopId = await getShopId();
  const result = await saFetch(`/shops/${shopId}/invoices/${invoiceId}/process`);
  return result;
}

/**
 * Cancel an invoice.
 *
 * Docs: POST /v1/shops/{shopId}/invoices/{invoiceId}/cancel
 */
export async function cancelInvoice(invoiceId: string | number): Promise<unknown> {
  const shopId = await getShopId();
  const result = await saFetch(`/shops/${shopId}/invoices/${invoiceId}/cancel`, {
    method: "POST",
  });
  return result;
}
