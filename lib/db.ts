import { neon, neonConfig } from "@neondatabase/serverless";

// Disable fetch connection caching for serverless
neonConfig.fetchConnectionCache = true;

function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return neon(databaseUrl);
}

// ---------------------------------------------------------------------------
// Schema creation (used by admin setup and lazy auto-init)
// ---------------------------------------------------------------------------

export const CREATE_PAYMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  sellauth_invoice_id VARCHAR(255) NOT NULL,
  sellauth_invoice_data JSONB,
  nowpayments_invoice_id VARCHAR(255),
  nowpayments_invoice_url TEXT,
  nowpayments_payment_id VARCHAR(255),
  nowpayments_pay_address VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  amount_usd DECIMAL(10,2),
  pay_currency VARCHAR(20),
  pay_amount DECIMAL(20,8),
  sellauth_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const CREATE_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  source VARCHAR(50),
  message TEXT,
  data JSONB,
  sellauth_invoice_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const CREATE_CONFIG_TABLE = `
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

export const CREATE_ADMIN_SESSIONS_TABLE = `
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
`;

export const CREATE_RATE_LIMITS_TABLE = `
CREATE TABLE IF NOT EXISTS rate_limits (
  scope VARCHAR(50) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  window_start BIGINT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, identifier, window_start)
);
`;

export const CREATE_INDEX_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_payments_sellauth_invoice ON payments(sellauth_invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_nowpayments_invoice ON payments(nowpayments_invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_sellauth_invoice ON logs(sellauth_invoice_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at)`,
];

export async function initializeDatabase(): Promise<void> {
  const sql = getDb();
  await sql(CREATE_PAYMENTS_TABLE);
  await sql(CREATE_LOGS_TABLE);
  await sql(CREATE_CONFIG_TABLE);
  await sql(CREATE_ADMIN_SESSIONS_TABLE);
  await sql(CREATE_RATE_LIMITS_TABLE);
  for (const stmt of CREATE_INDEX_STATEMENTS) {
    await sql(stmt);
  }
}

let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

async function ensureDatabaseReady(): Promise<void> {
  if (dbInitialized) return;

  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase()
      .then(() => {
        dbInitialized = true;
      })
      .catch((err) => {
        dbInitPromise = null;
        throw err;
      });
  }

  await dbInitPromise;
}

// ---------------------------------------------------------------------------
// Payment CRUD
// ---------------------------------------------------------------------------

export interface PaymentRecord {
  id?: number;
  sellauth_invoice_id: string;
  sellauth_invoice_data?: Record<string, unknown>;
  nowpayments_invoice_id?: string;
  nowpayments_invoice_url?: string;
  nowpayments_payment_id?: string;
  nowpayments_pay_address?: string;
  status: string;
  amount_usd?: number;
  pay_currency?: string;
  pay_amount?: number;
  sellauth_processed?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function findPaymentBySellAuthInvoice(
  sellauthInvoiceId: string
): Promise<PaymentRecord | null> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(
    `SELECT * FROM payments WHERE sellauth_invoice_id = $1 ORDER BY id DESC LIMIT 1`,
    [sellauthInvoiceId]
  );
  return (rows[0] as PaymentRecord) || null;
}

export async function findPaymentByNowPaymentsOrderId(
  orderId: string
): Promise<PaymentRecord | null> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(
    `SELECT * FROM payments WHERE sellauth_invoice_id = $1 ORDER BY id DESC LIMIT 1`,
    [orderId]
  );
  return (rows[0] as PaymentRecord) || null;
}

export async function createPayment(
  payment: Omit<PaymentRecord, "id" | "created_at" | "updated_at">
): Promise<PaymentRecord> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(
    `INSERT INTO payments (
      sellauth_invoice_id, sellauth_invoice_data, nowpayments_invoice_id,
      nowpayments_invoice_url, status, amount_usd
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      payment.sellauth_invoice_id,
      JSON.stringify(payment.sellauth_invoice_data || {}),
      payment.nowpayments_invoice_id || null,
      payment.nowpayments_invoice_url || null,
      payment.status,
      payment.amount_usd || null,
    ]
  );
  return rows[0] as PaymentRecord;
}

export async function updatePaymentStatus(
  sellauthInvoiceId: string,
  updates: Partial<
    Pick<
      PaymentRecord,
      | "status"
      | "nowpayments_payment_id"
      | "nowpayments_pay_address"
      | "pay_currency"
      | "pay_amount"
      | "sellauth_processed"
    >
  >
): Promise<PaymentRecord | null> {
  await ensureDatabaseReady();
  const sql = getDb();
  const setClauses: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.nowpayments_payment_id !== undefined) {
    setClauses.push(`nowpayments_payment_id = $${paramIndex++}`);
    values.push(updates.nowpayments_payment_id);
  }
  if (updates.nowpayments_pay_address !== undefined) {
    setClauses.push(`nowpayments_pay_address = $${paramIndex++}`);
    values.push(updates.nowpayments_pay_address);
  }
  if (updates.pay_currency !== undefined) {
    setClauses.push(`pay_currency = $${paramIndex++}`);
    values.push(updates.pay_currency);
  }
  if (updates.pay_amount !== undefined) {
    setClauses.push(`pay_amount = $${paramIndex++}`);
    values.push(updates.pay_amount);
  }
  if (updates.sellauth_processed !== undefined) {
    setClauses.push(`sellauth_processed = $${paramIndex++}`);
    values.push(updates.sellauth_processed);
  }

  values.push(sellauthInvoiceId);

  const rows = await sql(
    `UPDATE payments SET ${setClauses.join(", ")} WHERE sellauth_invoice_id = $${paramIndex} RETURNING *`,
    values
  );
  return (rows[0] as PaymentRecord) || null;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export interface LogRecord {
  id?: number;
  level: string;
  source: string;
  message: string;
  data?: Record<string, unknown>;
  sellauth_invoice_id?: string;
  created_at?: string;
}

export async function insertLog(log: Omit<LogRecord, "id" | "created_at">): Promise<void> {
  try {
    await ensureDatabaseReady();
    const sql = getDb();
    await sql(
      `INSERT INTO logs (level, source, message, data, sellauth_invoice_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        log.level,
        log.source,
        log.message,
        JSON.stringify(log.data || {}),
        log.sellauth_invoice_id || null,
      ]
    );
  } catch (err) {
    // If logging to DB fails, don't crash the request -- just console.error
    console.error("[DB LOG FAILED]", err, log);
  }
}

export async function queryLogs(options: {
  limit?: number;
  offset?: number;
  source?: string;
  level?: string;
  sellauth_invoice_id?: string;
}): Promise<LogRecord[]> {
  await ensureDatabaseReady();
  const sql = getDb();
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (options.source) {
    conditions.push(`source = $${paramIndex++}`);
    values.push(options.source);
  }
  if (options.level) {
    conditions.push(`level = $${paramIndex++}`);
    values.push(options.level);
  }
  if (options.sellauth_invoice_id) {
    conditions.push(`sellauth_invoice_id = $${paramIndex++}`);
    values.push(options.sellauth_invoice_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  values.push(limit, offset);

  const rows = await sql(
    `SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );
  return rows as LogRecord[];
}

// ---------------------------------------------------------------------------
// Config (key-value store for runtime configuration overrides)
// ---------------------------------------------------------------------------

export interface ConfigRecord {
  key: string;
  value: string;
  updated_at?: string;
}

export async function getAllConfig(): Promise<ConfigRecord[]> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(`SELECT * FROM config ORDER BY key ASC`);
  return rows as ConfigRecord[];
}

export async function getConfigValue(key: string): Promise<string | null> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(`SELECT value FROM config WHERE key = $1`, [key]);
  return rows[0] ? (rows[0] as { value: string }).value : null;
}

export async function upsertConfig(key: string, value: string): Promise<void> {
  await ensureDatabaseReady();
  const sql = getDb();
  await sql(
    `INSERT INTO config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function deleteConfig(key: string): Promise<void> {
  await ensureDatabaseReady();
  const sql = getDb();
  await sql(`DELETE FROM config WHERE key = $1`, [key]);
}

// ---------------------------------------------------------------------------
// Admin sessions
// ---------------------------------------------------------------------------

export interface AdminSessionRecord {
  token_hash: string;
  created_at?: string;
  last_used_at?: string;
  expires_at: string;
}

export async function insertAdminSession(tokenHash: string, expiresAt: Date): Promise<void> {
  await ensureDatabaseReady();
  const sql = getDb();
  await sql(
    `INSERT INTO admin_sessions (token_hash, expires_at)
     VALUES ($1, $2)
     ON CONFLICT (token_hash) DO UPDATE
       SET expires_at = $2, last_used_at = NOW()`,
    [tokenHash, expiresAt.toISOString()]
  );
}

export async function touchAdminSession(tokenHash: string): Promise<boolean> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(
    `UPDATE admin_sessions
     SET last_used_at = NOW()
     WHERE token_hash = $1
       AND expires_at > NOW()
     RETURNING token_hash`,
    [tokenHash]
  );
  return rows.length > 0;
}

export async function cleanupExpiredAdminSessions(): Promise<void> {
  await ensureDatabaseReady();
  const sql = getDb();
  await sql(`DELETE FROM admin_sessions WHERE expires_at <= NOW()`);
}

// ---------------------------------------------------------------------------
// Distributed rate limiting
// ---------------------------------------------------------------------------

export async function incrementRateLimitCount(
  scope: string,
  identifier: string,
  windowStart: number
): Promise<number> {
  await ensureDatabaseReady();
  const sql = getDb();
  const rows = await sql(
    `INSERT INTO rate_limits (scope, identifier, window_start, count, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (scope, identifier, window_start)
     DO UPDATE SET count = rate_limits.count + 1, updated_at = NOW()
     RETURNING count`,
    [scope, identifier, windowStart]
  );
  return Number((rows[0] as { count: number }).count || 1);
}

export async function cleanupOldRateLimits(minWindowStart: number): Promise<void> {
  await ensureDatabaseReady();
  const sql = getDb();
  await sql(`DELETE FROM rate_limits WHERE window_start < $1`, [minWindowStart]);
}
