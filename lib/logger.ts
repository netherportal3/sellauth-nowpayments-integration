import { insertLog } from "./db";

type LogLevel = "info" | "warn" | "error";

interface LogOptions {
  source: string;
  sellauthInvoiceId?: string;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function consoleLog(level: LogLevel, source: string, message: string, data?: Record<string, unknown>) {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${source}]`;

  switch (level) {
    case "error":
      console.error(prefix, message, data ? JSON.stringify(data, null, 2) : "");
      break;
    case "warn":
      console.warn(prefix, message, data ? JSON.stringify(data, null, 2) : "");
      break;
    default:
      console.log(prefix, message, data ? JSON.stringify(data, null, 2) : "");
      break;
  }
}

/**
 * Creates a logger instance scoped to a specific source (endpoint/function).
 * Every log call writes to both console AND Postgres.
 */
export function createLogger(options: LogOptions) {
  const { source, sellauthInvoiceId } = options;

  async function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    // Always log to console first (synchronous, never fails)
    consoleLog(level, source, message, data);

    // Then persist to Postgres (async, fire-and-forget with error handling inside)
    await insertLog({
      level,
      source,
      message,
      data,
      sellauth_invoice_id: sellauthInvoiceId,
    });
  }

  return {
    info: (message: string, data?: Record<string, unknown>) => log("info", message, data),
    warn: (message: string, data?: Record<string, unknown>) => log("warn", message, data),
    error: (message: string, data?: Record<string, unknown>) => log("error", message, data),

    /**
     * Returns a child logger with a specific sellauth_invoice_id attached.
     * Useful when you learn the invoice ID mid-flow.
     */
    withInvoice(invoiceId: string) {
      return createLogger({ source, sellauthInvoiceId: invoiceId });
    },
  };
}
