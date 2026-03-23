# NOWPayments x SellAuth Integration Backend

This project lets you accept crypto payments with NOWPayments for SellAuth manual checkout.

## What this does

1. Customer opens your SellAuth payment link
2. Backend creates a NOWPayments invoice
3. Customer pays on NOWPayments
4. NOWPayments sends webhook to this backend
5. Backend completes the SellAuth invoice

## 1) What you need first

- A GitHub account
- A Vercel account (free plan works)
- A NOWPayments account
- A SellAuth account on the **Business plan** (manual payments require it)

## 2) Deploy to Vercel (beginner friendly)

1. Clone this repo to your GitHub.
2. In Vercel, click **Add New Project** and import this repo.
3. On your Vercel project page, click **Storage**.
4. Click **Create Database**.
5. Choose **Neon**.
6. If asked, create/sign in to your Neon account.
7. Choose the **free plan**.
8. Name the database anything you want.
9. Click **Connect** next to that new database.
10. **Do not change the custom prefix** during connect.

After connect, Vercel adds your database environment variables automatically.

## 3) Set environment variables

Set this first in **Vercel project dashboard** -> **Settings** -> **Environment Variables**:

- `ADMIN_SECRET` (required): password for admin endpoints/dashboard

Then sign in to the admin dashboard at `https://YOUR-VERCEL-URL/api/admin` and set the rest in **Configuration**.

You can still set values in Vercel env vars if you prefer, but `ADMIN_SECRET` should stay env-only.

Set these required values:

| Variable | Required | Description |
|---|---|---|
| `NOWPAYMENTS_API_KEY` | Yes | NOWPayments API key |
| `NOWPAYMENTS_IPN_SECRET` | Yes | NOWPayments IPN secret |
| `SELLAUTH_API_KEY` | Yes | SellAuth API token |
| `SELLAUTH_SHOP_ID` | Yes | SellAuth shop ID |
| `BASE_URL` | Yes | Your Vercel URL (no trailing slash) |
| `DATABASE_URL` | Yes | Added by Neon connect |
| `ADMIN_SECRET` | Yes (env-only) | Password for admin endpoints/dashboard |
| `CUSTOMER_RETURN_URL_TEMPLATE` | No | Use `YOUR-SELLAUTH-STORE-URL/checkout/{invoiceId}` for most stores. Use a custom URL only if you need custom redirect behavior (`{status}` is optional). |
| `RATE_LIMIT_*` | No | Optional per-endpoint rate limit overrides (see "Rate limits" section below) |

## 4) Configure  payment method

In , create/edit your manual payment method and set instructions to:

```text
Click below to pay with crypto:
https://YOUR-VERCEL-URL/api/pay/{unique_id}
```

- Replace `YOUR-VERCEL-URL` with your deployed URL
- Keep `{unique_id}` exactly as shown

## 5) Configure NOWPayments

In NOWPayments:

- Copy your API key
- Generate/copy your IPN secret
- Add those values in the admin dashboard/env vars

No global callback URL is needed.

## Rate limits (easy defaults, fully configurable)

This project includes per-IP rate limits out of the box:

- `PAY`: 120 requests/minute
- `PAYMENT_STATUS`: 300 requests/minute
- `IPN`: 1200 requests/minute
- `ADMIN_AUTH`: 20 requests/minute
- `ADMIN_API`: 240 requests/minute

Rate limits are configured in the admin dashboard **Rate Limits** page.
It includes ready presets:

- **Strict** (tighter protection)
- **Balanced** (default values)
- **High-Volume** (higher throughput)

You can apply a preset, then fine-tune each scope manually.

Use these optional keys:

- `RATE_LIMIT_PAY_LIMIT`, `RATE_LIMIT_PAY_WINDOW_MS`
- `RATE_LIMIT_PAYMENT_STATUS_LIMIT`, `RATE_LIMIT_PAYMENT_STATUS_WINDOW_MS`
- `RATE_LIMIT_IPN_LIMIT`, `RATE_LIMIT_IPN_WINDOW_MS`
- `RATE_LIMIT_ADMIN_AUTH_LIMIT`, `RATE_LIMIT_ADMIN_AUTH_WINDOW_MS`
- `RATE_LIMIT_ADMIN_API_LIMIT`, `RATE_LIMIT_ADMIN_API_WINDOW_MS`

Limits are stored in Postgres so they apply across serverless instances.

Set a `*_LIMIT` or `*_WINDOW_MS` value to `0` to disable that limiter.

## 6) Test everything

1. Make a test order in 
2. Choose your crypto payment method
3. Open the payment link
4. Confirm you are redirected to NOWPayments
5. Complete a test payment flow
6. Check logs in:
   - `https://YOUR-VERCEL-URL/api/admin` (Logs tab)
   - Vercel function logs

## Custom subdomain setup (Vercel)

Recommended: use a dedicated payments subdomain, for example:

`payments.yourstoreurl.com`

If you want to use your own domain/subdomain instead of `*.vercel.app`:

1. Open your Vercel project.
2. Go to **Settings** -> **Domains**.
3. Click **Add Domain**.
4. Enter your subdomain (example: `payments.yourstoreurl.com`) and save.
5. Vercel will show DNS records to add at your domain provider (Cloudflare, Namecheap, GoDaddy, etc.).
6. Add the records exactly as shown.
7. Wait for Vercel to show the domain as **Valid**.
8. In this project, update `BASE_URL` to your custom subdomain URL.
9. Update SellAuth payment instructions to use your custom subdomain:

```text
https://payments.yourstoreurl.com/api/pay/{unique_id}
```

10. If you use `CUSTOMER_RETURN_URL_TEMPLATE`, make sure it uses your store URL flow (for example: `{sellauth-url}/checkout/{invoiceId}`).

You can set/update `BASE_URL` and `CUSTOMER_RETURN_URL_TEMPLATE` in the admin dashboard (**Configuration**) or in Vercel env vars.

## Admin dashboard

- URL: `https://YOUR-VERCEL-URL/api/admin`
- Sign in using `ADMIN_SECRET` from your environment variables (the browser receives a short-lived session token; your raw secret is not reused as an API bearer token)
- Use **Configuration** to manage runtime keys
- Use **Rate Limits** to apply presets and configure per-endpoint limits
- Use **Logs** to inspect events/errors

## Main endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/pay/{invoiceId}` | GET | Create NOWPayments invoice and redirect customer |
| `/api/ipn` | POST | Verify NOWPayments webhook and process SellAuth invoice |
| `/api/payment-status?id={paymentId}&order_id={invoiceId}` | GET | Payment status check |
| `/api/admin` | GET | Admin dashboard |

## License

MIT
