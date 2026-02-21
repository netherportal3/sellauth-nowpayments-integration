import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeDatabase } from "../lib/db";

let adminPageBootstrapPromise: Promise<void> | null = null;

async function ensureAdminPageBootstrap(): Promise<void> {
  if (!adminPageBootstrapPromise) {
    adminPageBootstrapPromise = initializeDatabase().catch((err) => {
      adminPageBootstrapPromise = null;
      throw err;
    });
  }
  await adminPageBootstrapPromise;
}

/**
 * GET /api/admin
 *
 * Serves the admin dashboard single-page application.
 * All HTML, CSS, and JS are inline — no external dependencies.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await ensureAdminPageBootstrap();
  } catch (err) {
    return res.status(500).json({
      error: "Database bootstrap failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
  return res.status(200).send(ADMIN_HTML);
}

// ---------------------------------------------------------------------------
// Full admin SPA — embedded HTML / CSS / JS
// ---------------------------------------------------------------------------

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin &middot; Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg0: #08080d; --bg1: #0f0f17; --bg2: #161622; --bg3: #1e1e2e; --bg4: #282840;
      --border1: #1c1c30; --border2: #2a2a42; --border3: #363650;
      --text1: #ededf0; --text2: #9898a8; --text3: #5c5c6e;
      --orange: #f97316; --purple: #7c3aed;
      --grad: #7c3aed;
      --grad-soft: rgba(124,58,237,0.10);
      --green: #22c55e; --yellow: #eab308; --red: #ef4444; --blue: #3b82f6;
      --r: 8px; --r-lg: 12px;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --mono: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
    }

    body { font-family: var(--font); background: var(--bg0); color: var(--text1); min-height: 100vh; -webkit-font-smoothing: antialiased; line-height: 1.5; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text3); }

    /* ── Gradient top bar ── */
    .top-line { position: fixed; top: 0; left: 0; right: 0; height: 2px; background: var(--border2); z-index: 999; }

    /* ── Login ── */
    .login-wrap {
      display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px;
      background: radial-gradient(ellipse at 25% 50%, rgba(249,115,22,0.04) 0%, transparent 60%),
                  radial-gradient(ellipse at 75% 50%, rgba(168,85,247,0.04) 0%, transparent 60%), var(--bg0);
    }
    .login-card {
      width: 100%; max-width: 440px; background: linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0)) var(--bg1);
      border: 1px solid var(--border2); border-radius: var(--r-lg); padding: 46px 38px 34px; position: relative;
      box-shadow: 0 18px 50px rgba(0,0,0,0.42);
    }
    .login-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--border2); border-radius: var(--r-lg) var(--r-lg) 0 0; }
    .login-title { font-size: 28px; font-weight: 800; text-align: center; margin-bottom: 24px; line-height: 1.2; }
    .login-note { text-align: center; color: var(--text3); font-size: 12px; margin-top: 14px; }

    /* ── Form fields ── */
    .field { margin-bottom: 20px; }
    .field label { display: block; font-size: 13px; font-weight: 500; color: var(--text2); margin-bottom: 6px; }
    .field input, .field select {
      width: 100%; padding: 10px 14px; background: var(--bg0); border: 1px solid var(--border1);
      border-radius: var(--r); color: var(--text1); font-size: 14px; font-family: var(--font);
      outline: none; transition: border-color 0.2s;
    }
    .field input:focus, .field select:focus { border-color: var(--purple); }
    .field input::placeholder { color: var(--text3); }
    .field-error { color: var(--red); font-size: 13px; margin-top: 12px; text-align: center; }

    /* ── Buttons ── */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 18px; border: none; border-radius: var(--r); font-size: 14px; font-weight: 500;
      font-family: var(--font); cursor: pointer; transition: all 0.2s; outline: none; white-space: nowrap;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--purple); color: #fff; }
    .btn-primary:hover:not(:disabled) { opacity: 0.95; transform: translateY(-1px); box-shadow: 0 4px 20px rgba(124,58,237,0.25); }
    .btn-ghost { background: transparent; color: var(--text2); border: 1px solid var(--border2); }
    .btn-ghost:hover:not(:disabled) { color: var(--text1); border-color: var(--text3); background: var(--bg2); }
    .btn-danger { background: rgba(239,68,68,0.08); color: var(--red); border: 1px solid rgba(239,68,68,0.15); }
    .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
    .btn-sm { padding: 5px 12px; font-size: 12px; }
    .btn-full { width: 100%; padding: 11px 18px; }
    .btn-icon { padding: 6px; width: 32px; height: 32px; }

    /* ── Header ── */
    .header {
      position: sticky; top: 2px; z-index: 50;
      background: rgba(8,8,13,0.88); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border1); padding: 0 24px;
      display: flex; align-items: center; height: 56px;
    }
    .header-brand { font-size: 15px; font-weight: 700; margin-right: 32px; display: flex; align-items: center; gap: 10px; }
    .header-brand .v { font-size: 11px; color: var(--text3); font-weight: 400; padding: 2px 8px; background: var(--bg2); border-radius: 4px; border: 1px solid var(--border1); }
    .header-tabs { display: flex; gap: 4px; flex: 1; }
    .tab-btn {
      padding: 8px 16px; border: none; background: transparent; color: var(--text3);
      font-size: 14px; font-weight: 500; cursor: pointer; border-radius: var(--r);
      transition: all 0.2s; font-family: var(--font); position: relative;
    }
    .tab-btn:hover { color: var(--text2); background: var(--bg2); }
    .tab-btn.active { color: var(--text1); background: var(--bg2); }
    .tab-btn.active::after {
      content: ''; position: absolute; bottom: -1px; left: 50%; transform: translateX(-50%);
      width: 24px; height: 2px; background: var(--grad); border-radius: 1px;
    }
    .header-right { display: flex; gap: 8px; align-items: center; }

    /* ── Main ── */
    .main { max-width: 1000px; margin: 0 auto; padding: 32px 24px; }
    .section-head { margin-bottom: 24px; }
    .section-title { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    .section-desc { color: var(--text3); font-size: 14px; }

    /* ── Card ── */
    .card { background: var(--bg1); border: 1px solid var(--border1); border-radius: var(--r-lg); overflow: hidden; }
    .card + .card { margin-top: 16px; }

    /* ── Config rows ── */
    .config-row { display: flex; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border1); gap: 12px; transition: background 0.15s; }
    .config-row:last-child { border-bottom: none; }
    .config-row:hover { background: rgba(255,255,255,0.015); }
    .config-key { font-family: var(--mono); font-size: 13px; font-weight: 500; min-width: 200px; color: var(--text1); word-break: break-all; }
    .config-val { flex: 1; font-family: var(--mono); font-size: 13px; color: var(--text2); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .config-val input {
      width: 100%; padding: 6px 10px; background: var(--bg0); border: 1px solid var(--border2);
      border-radius: var(--r); color: var(--text1); font-family: var(--mono); font-size: 13px; outline: none;
    }
    .config-val input:focus { border-color: var(--purple); }
    .config-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }

    /* ── Badges ── */
    .badge { display: inline-flex; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-db { background: rgba(168,85,247,0.12); color: var(--purple); }
    .badge-env { background: rgba(249,115,22,0.12); color: var(--orange); }
    .badge-unset { background: rgba(92,92,110,0.12); color: var(--text3); }

    /* ── Config add ── */
    .config-add { padding: 14px 20px; border-top: 1px solid var(--border1); }
    .config-add-form { display: flex; gap: 8px; align-items: center; }
    .config-add-form input {
      flex: 1; padding: 8px 12px; background: var(--bg0); border: 1px solid var(--border1);
      border-radius: var(--r); color: var(--text1); font-size: 13px; font-family: var(--mono); outline: none;
    }
    .config-add-form input:focus { border-color: var(--purple); }
    .config-add-form input::placeholder { color: var(--text3); }

    /* ── Log filters ── */
    .log-filters { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; align-items: end; }
    .log-filters .field { margin-bottom: 0; min-width: 140px; flex: 1; }
    .log-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .log-count { font-size: 13px; color: var(--text3); }
    .log-tools { display: flex; gap: 10px; align-items: center; }
    .auto-label { font-size: 13px; color: var(--text3); display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
    .auto-label input[type=checkbox] { accent-color: var(--purple); width: 14px; height: 14px; cursor: pointer; }

    /* ── Log entries ── */
    .log-entry { border-bottom: 1px solid var(--border1); }
    .log-entry:last-child { border-bottom: none; }
    .log-head { display: flex; align-items: center; gap: 10px; padding: 11px 20px; cursor: pointer; transition: background 0.15s; }
    .log-head:hover { background: rgba(255,255,255,0.015); }
    .log-time { font-size: 12px; color: var(--text3); font-family: var(--mono); min-width: 72px; flex-shrink: 0; }
    .level-badge { display: inline-flex; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; flex-shrink: 0; }
    .level-info { background: rgba(59,130,246,0.12); color: var(--blue); }
    .level-warn { background: rgba(234,179,8,0.12); color: var(--yellow); }
    .level-error { background: rgba(239,68,68,0.12); color: var(--red); }
    .log-source { font-size: 12px; color: var(--text3); background: var(--bg2); padding: 2px 8px; border-radius: 4px; font-family: var(--mono); flex-shrink: 0; }
    .log-msg { flex: 1; font-size: 13px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .log-invoice { font-size: 11px; font-family: var(--mono); color: var(--text3); background: var(--bg3); padding: 1px 6px; border-radius: 3px; flex-shrink: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .log-chevron { color: var(--text3); transition: transform 0.2s; font-size: 11px; flex-shrink: 0; }
    .log-chevron.open { transform: rotate(90deg); }
    .log-data { padding: 0 20px 14px 20px; display: none; }
    .log-data.open { display: block; }
    .log-data pre {
      background: var(--bg0); border: 1px solid var(--border1); border-radius: var(--r);
      padding: 12px 16px; font-size: 12px; font-family: var(--mono); color: var(--text2);
      overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; line-height: 1.6;
    }

    /* ── Empty / loading ── */
    .empty { text-align: center; padding: 48px 24px; color: var(--text3); }
    .empty-title { font-size: 16px; color: var(--text2); margin-bottom: 4px; font-weight: 500; }
    .empty-desc { font-size: 14px; margin-bottom: 16px; }
    .loading-wrap { text-align: center; padding: 32px; color: var(--text3); }
    .spinner { display: inline-block; width: 18px; height: 18px; border: 2px solid var(--border2); border-top-color: var(--purple); border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Toasts ── */
    #toasts { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
    .toast { padding: 12px 20px; border-radius: var(--r); font-size: 14px; font-weight: 500; max-width: 420px; transform: translateX(120%); transition: transform 0.3s ease; pointer-events: auto; }
    .toast-show { transform: translateX(0); }
    .toast-success { background: rgba(34,197,94,0.12); color: var(--green); border: 1px solid rgba(34,197,94,0.18); }
    .toast-error { background: rgba(239,68,68,0.12); color: var(--red); border: 1px solid rgba(239,68,68,0.18); }
    .toast-info { background: rgba(59,130,246,0.12); color: var(--blue); border: 1px solid rgba(59,130,246,0.18); }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .login-card { padding: 36px 24px; }
      .header { padding: 0 16px; }
      .header-brand { margin-right: 16px; }
      .main { padding: 20px 16px; }
      .config-row { flex-wrap: wrap; padding: 12px 16px; }
      .config-key { min-width: 100%; margin-bottom: 6px; }
      .log-filters { flex-direction: column; }
      .log-filters .field { min-width: 100%; }
      .log-head { flex-wrap: wrap; gap: 6px; padding: 10px 16px; }
      .log-msg { min-width: 100%; white-space: normal; order: 10; }
      .log-data { padding: 0 16px 12px 16px; }
      .config-add-form { flex-wrap: wrap; }
    }
  </style>
</head>
<body>

  <!-- SVG gradient for icons -->
  <svg width="0" height="0" style="position:absolute">
    <defs>
      <linearGradient id="ig" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f97316"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
    </defs>
  </svg>

  <div class="top-line"></div>
  <div id="app"></div>
  <div id="toasts"></div>

  <script>
  (function() {
    'use strict';

    // ════════════════════════════════════════════════════════════════════════
    // State
    // ════════════════════════════════════════════════════════════════════════
    var S = {
      token: sessionStorage.getItem('np_admin') || '',
      view: 'config',
      config: [],
      configLoading: false,
      configError: null,
      editKey: null,
      editVal: '',
      addMode: false,
      newKey: '',
      newVal: '',
      revealed: {},
      logs: [],
      logsLoading: false,
      logsError: null,
      filters: { source: '', level: '', invoice: '', limit: 50 },
      autoRefresh: false,
      autoRefreshId: null,
      expandedLogs: {},
      setupRunning: false
    };

    var SENSITIVE = ['NOWPAYMENTS_API_KEY','NOWPAYMENTS_IPN_SECRET','SELLAUTH_API_KEY','ADMIN_SECRET','DATABASE_URL'];
    var RATE_LIMIT_SCOPES = [
      { scope: 'PAY', label: 'Checkout Link', defaults: { limit: 120, windowMs: 60000 } },
      { scope: 'PAYMENT_STATUS', label: 'Payment Status', defaults: { limit: 300, windowMs: 60000 } },
      { scope: 'IPN', label: 'NOWPayments IPN', defaults: { limit: 1200, windowMs: 60000 } },
      { scope: 'ADMIN_AUTH', label: 'Admin Login', defaults: { limit: 20, windowMs: 60000 } },
      { scope: 'ADMIN_API', label: 'Admin API', defaults: { limit: 240, windowMs: 60000 } }
    ];
    var RATE_LIMIT_PRESETS = {
      strict: {
        PAY: { limit: 60, windowMs: 60000 },
        PAYMENT_STATUS: { limit: 120, windowMs: 60000 },
        IPN: { limit: 600, windowMs: 60000 },
        ADMIN_AUTH: { limit: 10, windowMs: 60000 },
        ADMIN_API: { limit: 120, windowMs: 60000 }
      },
      balanced: {
        PAY: { limit: 120, windowMs: 60000 },
        PAYMENT_STATUS: { limit: 300, windowMs: 60000 },
        IPN: { limit: 1200, windowMs: 60000 },
        ADMIN_AUTH: { limit: 20, windowMs: 60000 },
        ADMIN_API: { limit: 240, windowMs: 60000 }
      },
      high_volume: {
        PAY: { limit: 360, windowMs: 60000 },
        PAYMENT_STATUS: { limit: 900, windowMs: 60000 },
        IPN: { limit: 3000, windowMs: 60000 },
        ADMIN_AUTH: { limit: 40, windowMs: 60000 },
        ADMIN_API: { limit: 600, windowMs: 60000 }
      }
    };
    var $app = document.getElementById('app');

    // ════════════════════════════════════════════════════════════════════════
    // API helper
    // ════════════════════════════════════════════════════════════════════════
    function parseApiResponse(r) {
      return r.text().then(function(t) {
        var data = null;
        if (t) {
          try {
            data = JSON.parse(t);
          } catch (e) {
            data = { error: t.length > 240 ? t.slice(0, 240) + '...' : t };
          }
        } else {
          data = {};
        }
        return { ok: r.ok, status: r.status, data: data };
      });
    }

    function api(method, path, body) {
      var h = { 'Content-Type': 'application/json' };
      if (S.token) h['Authorization'] = 'Bearer ' + S.token;
      var opts = { method: method, headers: h };
      if (body) opts.body = JSON.stringify(body);
      return fetch('/api/admin/' + path, opts).then(function(r) {
        return parseApiResponse(r).then(function(res) {
          if (res.status === 401) {
            S.token = '';
            sessionStorage.removeItem('np_admin');
            render();
            throw new Error('Session expired');
          }
          if (!res.ok) {
            throw new Error((res.data && (res.data.error || res.data.message)) || ('Request failed (' + res.status + ')'));
          }
          return res.data;
        });
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Auth
    // ════════════════════════════════════════════════════════════════════════
    function doLogin(pw) {
      return fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(parseApiResponse).then(function(res) {
        if (res.ok && res.data.success && res.data.token) {
          S.token = res.data.token;
          sessionStorage.setItem('np_admin', res.data.token);
          loadConfig();
          render();
        } else {
          throw new Error((res.data && (res.data.error || res.data.message)) || 'Invalid password');
        }
      });
    }

    function doLogout() {
      S.token = '';
      sessionStorage.removeItem('np_admin');
      if (S.autoRefreshId) { clearInterval(S.autoRefreshId); S.autoRefreshId = null; }
      S.autoRefresh = false;
      render();
    }

    // ════════════════════════════════════════════════════════════════════════
    // Config
    // ════════════════════════════════════════════════════════════════════════
    function loadConfig() {
      S.configLoading = true;
      S.configError = null;
      render();
      api('GET', 'config').then(function(d) {
        S.config = d.entries || [];
        S.configLoading = false;
        render();
      }).catch(function(e) {
        S.configLoading = false;
        S.configError = e.message;
        render();
      });
    }

    function saveEntry(key, value) {
      api('PUT', 'config', { key: key, value: value }).then(function(d) {
        if (d.success) { toast('Saved: ' + key, 'success'); S.editKey = null; S.addMode = false; loadConfig(); }
        else toast(d.error || 'Save failed', 'error');
      }).catch(function(e) { toast(e.message, 'error'); });
    }

    function deleteEntry(key) {
      api('DELETE', 'config?key=' + encodeURIComponent(key)).then(function(d) {
        if (d.success) { toast('Removed override: ' + key, 'success'); loadConfig(); }
        else toast(d.error || 'Delete failed', 'error');
      }).catch(function(e) { toast(e.message, 'error'); });
    }

    function doSetup() {
      S.setupRunning = true;
      render();
      api('POST', 'setup').then(function(d) {
        S.setupRunning = false;
        if (d.success) { toast('Database initialized successfully', 'success'); loadConfig(); }
        else { toast(d.error || 'Setup failed', 'error'); render(); }
      }).catch(function(e) {
        S.setupRunning = false;
        toast(e.message, 'error');
        render();
      });
    }

    function saveRateLimitScope(scope) {
      var limitEl = document.getElementById('rl-' + scope + '-limit');
      var windowEl = document.getElementById('rl-' + scope + '-window');
      var limit = limitEl ? parseInt(limitEl.value, 10) : NaN;
      var windowMs = windowEl ? parseInt(windowEl.value, 10) : NaN;
      if (isNaN(limit) || limit < 0 || isNaN(windowMs) || windowMs < 0) {
        toast('Rate limit values must be numbers >= 0', 'error');
        return;
      }
      Promise.all([
        api('PUT', 'config', { key: getRateLimitKey(scope, 'LIMIT'), value: String(limit) }),
        api('PUT', 'config', { key: getRateLimitKey(scope, 'WINDOW_MS'), value: String(windowMs) })
      ]).then(function() {
        toast('Saved rate limit for ' + scope, 'success');
        loadConfig();
      }).catch(function(e) {
        toast(e.message, 'error');
      });
    }

    function applyRatePreset(name) {
      var preset = RATE_LIMIT_PRESETS[name];
      if (!preset) return;
      var writes = [];
      for (var i = 0; i < RATE_LIMIT_SCOPES.length; i++) {
        var scope = RATE_LIMIT_SCOPES[i].scope;
        var values = preset[scope];
        if (!values) continue;
        writes.push(api('PUT', 'config', { key: getRateLimitKey(scope, 'LIMIT'), value: String(values.limit) }));
        writes.push(api('PUT', 'config', { key: getRateLimitKey(scope, 'WINDOW_MS'), value: String(values.windowMs) }));
      }
      Promise.all(writes).then(function() {
        toast('Applied ' + name.replace('_', ' ') + ' preset', 'success');
        loadConfig();
      }).catch(function(e) {
        toast(e.message, 'error');
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Logs
    // ════════════════════════════════════════════════════════════════════════
    function loadLogs() {
      S.logsLoading = true;
      S.logsError = null;
      render();
      var p = ['limit=' + S.filters.limit];
      if (S.filters.source) p.push('source=' + encodeURIComponent(S.filters.source));
      if (S.filters.level) p.push('level=' + encodeURIComponent(S.filters.level));
      if (S.filters.invoice) p.push('invoice=' + encodeURIComponent(S.filters.invoice));
      api('GET', 'logs?' + p.join('&')).then(function(d) {
        S.logs = d.logs || [];
        S.logsLoading = false;
        render();
      }).catch(function(e) {
        S.logsLoading = false;
        S.logsError = e.message;
        render();
      });
    }

    function toggleAutoRefresh() {
      S.autoRefresh = !S.autoRefresh;
      if (S.autoRefresh) {
        loadLogs();
        S.autoRefreshId = setInterval(loadLogs, 5000);
      } else {
        if (S.autoRefreshId) clearInterval(S.autoRefreshId);
        S.autoRefreshId = null;
      }
      render();
    }

    // ════════════════════════════════════════════════════════════════════════
    // Utilities
    // ════════════════════════════════════════════════════════════════════════
    function esc(s) {
      if (s == null) return '';
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function mask(v) {
      if (!v) return '••••••••';
      if (v.length <= 8) return '••••••••';
      return v.substring(0, 4) + '••••••••' + v.substring(v.length - 4);
    }
    function isSensitive(key) { return SENSITIVE.indexOf(key) !== -1; }
    function isRateLimitKey(key) { return /^RATE_LIMIT_[A-Z_]+_(LIMIT|WINDOW_MS)$/.test(key || ''); }
    function getRateLimitKey(scope, kind) { return 'RATE_LIMIT_' + scope + '_' + kind; }
    function getEntryByKey(key) {
      for (var i = 0; i < S.config.length; i++) {
        if (S.config[i].key === key) return S.config[i];
      }
      return null;
    }
    function getEntryInt(key, fallback) {
      var e = getEntryByKey(key);
      if (!e || !e.has_active_value) return fallback;
      var raw = e.active_value;
      if (raw === null || raw === undefined || raw === '') return fallback;
      var parsed = parseInt(raw, 10);
      return isNaN(parsed) ? fallback : parsed;
    }
    function timeAgo(iso) {
      if (!iso) return '';
      var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 0) return 'just now';
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }
    function fmtDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleString();
    }
    function toast(msg, type) {
      var c = document.getElementById('toasts');
      var el = document.createElement('div');
      el.className = 'toast toast-' + (type || 'info');
      el.textContent = msg;
      c.appendChild(el);
      setTimeout(function() { el.classList.add('toast-show'); }, 10);
      setTimeout(function() {
        el.classList.remove('toast-show');
        setTimeout(function() { try { c.removeChild(el); } catch (e) {} }, 300);
      }, 3500);
    }

    // ════════════════════════════════════════════════════════════════════════
    // SVG icons (inline helpers)
    // ════════════════════════════════════════════════════════════════════════
    var ICO = {
      lock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      eye: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      eyeOff: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
      edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
      settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    };

    // ════════════════════════════════════════════════════════════════════════
    // Render functions
    // ════════════════════════════════════════════════════════════════════════
    function render() {
      if (!S.token) { $app.innerHTML = renderLogin(); }
      else { $app.innerHTML = renderDashboard(); }
      bindEvents();
    }

    // ── Login ──
    function renderLogin() {
      return '<div class="login-wrap">' +
        '<div class="login-card">' +
          '<div style="text-align:center">' +
            '<h1 class="login-title">Admin Dashboard</h1>' +
          '</div>' +
          '<form id="login-form">' +
            '<div class="field">' +
              '<label for="login-pw">Password:</label>' +
              '<input type="password" id="login-pw" placeholder="Enter password" autocomplete="current-password" />' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-full">Sign In</button>' +
            '<div id="login-error" class="field-error" style="display:none"></div>' +
          '</form>' +
        '</div>' +
      '</div>';
    }

    // ── Dashboard shell ──
    function renderDashboard() {
      var viewHtml = '';
      if (S.view === 'config') viewHtml = renderConfig();
      else if (S.view === 'rate-limits') viewHtml = renderRateLimits();
      else viewHtml = renderLogs();
      return renderHeader() +
        '<div class="main">' +
          viewHtml +
        '</div>';
    }

    // ── Header ──
    function renderHeader() {
      return '<div class="header">' +
        '<div class="header-brand">Admin Dashboard <span class="v">v1.0</span></div>' +
        '<div class="header-tabs">' +
          '<button class="tab-btn' + (S.view === 'config' ? ' active' : '') + '" data-action="tab" data-tab="config">' + ICO.settings + ' Configuration</button>' +
          '<button class="tab-btn' + (S.view === 'rate-limits' ? ' active' : '') + '" data-action="tab" data-tab="rate-limits">' + ICO.settings + ' Rate Limits</button>' +
          '<button class="tab-btn' + (S.view === 'logs' ? ' active' : '') + '" data-action="tab" data-tab="logs">' + ICO.list + ' Logs</button>' +
        '</div>' +
        '<div class="header-right">' +
          '<button class="btn btn-ghost btn-sm" data-action="logout">Sign Out</button>' +
        '</div>' +
      '</div>';
    }

    // ── Config view ──
    function renderConfig() {
      var baseConfig = [];
      for (var x = 0; x < S.config.length; x++) {
        if (!isRateLimitKey(S.config[x].key)) baseConfig.push(S.config[x]);
      }
      var html = '<div class="section-head">' +
        '<h2 class="section-title">Environment Configuration</h2>' +
        '<p class="section-desc">Manage runtime configuration. Database overrides take priority over Vercel environment variables (except env-only keys such as ADMIN_SECRET).</p>' +
      '</div>';

      if (S.configLoading) {
        return html + '<div class="loading-wrap"><span class="spinner"></span> Loading configuration...</div>';
      }

      if (S.configError) {
        return html + '<div class="card"><div class="empty">' +
          '<div class="empty-title">Failed to load configuration</div>' +
          '<div class="empty-desc">' + esc(S.configError) + '</div>' +
          '<div style="display:flex;gap:8px;justify-content:center">' +
            '<button class="btn btn-primary btn-sm" data-action="setup"' + (S.setupRunning ? ' disabled' : '') + '>' +
              (S.setupRunning ? '<span class="spinner"></span> Initializing...' : 'Initialize Database') +
            '</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="reload-config">Retry</button>' +
          '</div>' +
        '</div></div>';
      }

      if (baseConfig.length === 0) {
        return html + '<div class="card"><div class="empty">' +
          '<div class="empty-title">No configuration found</div>' +
          '<div class="empty-desc">Initialize the database to get started.</div>' +
          '<button class="btn btn-primary btn-sm" data-action="setup"' + (S.setupRunning ? ' disabled' : '') + '>' +
            (S.setupRunning ? '<span class="spinner"></span>' : 'Initialize Database') +
          '</button>' +
        '</div></div>';
      }

      html += '<div class="card">';
      for (var i = 0; i < baseConfig.length; i++) {
        html += renderConfigRow(baseConfig[i]);
      }

      // Add new row
      if (S.addMode) {
        html += '<div class="config-add">' +
          '<div class="config-add-form">' +
            '<input type="text" id="new-cfg-key" placeholder="KEY_NAME" />' +
            '<input type="text" id="new-cfg-val" placeholder="value" />' +
            '<button class="btn btn-primary btn-sm" data-action="save-new">Save</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="cancel-add">Cancel</button>' +
          '</div>' +
        '</div>';
      } else {
        html += '<div class="config-add">' +
          '<button class="btn btn-ghost btn-sm" data-action="add-config" style="width:100%;border-style:dashed">+ Add Configuration</button>' +
        '</div>';
      }

      html += '</div>';
      return html;
    }

    function renderConfigRow(entry) {
      var editing = S.editKey === entry.key;
      var sens = isSensitive(entry.key);
      var revealed = S.revealed[entry.key];
      var hasValue = !!entry.has_active_value;
      var envOnly = !!entry.env_only;

      // Value display
      var val = '';
      if (editing) {
        val = '<input type="text" id="edit-cfg-val" value="' + esc(entry.db_value || '') + '" />';
      } else if (hasValue) {
        if (sens && !revealed) {
          val = '<span style="color:var(--text3);letter-spacing:1px">' + mask('redacted') + '</span>';
        } else {
          val = '<span>' + esc(entry.active_value || '') + '</span>';
        }
      } else {
        val = '<span style="color:var(--text3);font-style:italic">not set</span>';
      }

      // Source badge
      var badge = '';
      if (entry.active_source === 'db') badge = '<span class="badge badge-db">DB</span>';
      else if (entry.active_source === 'env') badge = '<span class="badge badge-env">ENV</span>';
      else badge = '<span class="badge badge-unset">&mdash;</span>';

      // Action buttons
      var actions = '';
      if (editing) {
        actions = '<button class="btn btn-primary btn-sm" data-action="save-edit" data-key="' + esc(entry.key) + '">Save</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="cancel-edit">Cancel</button>';
      } else {
        if (sens && entry.active_value) {
          actions += '<button class="btn btn-ghost btn-sm btn-icon" data-action="toggle-reveal" data-key="' + esc(entry.key) + '" title="' + (revealed ? 'Hide' : 'Reveal') + '">' + (revealed ? ICO.eyeOff : ICO.eye) + '</button>';
        }
        if (!envOnly) {
          actions += '<button class="btn btn-ghost btn-sm btn-icon" data-action="edit-config" data-key="' + esc(entry.key) + '" title="Edit">' + ICO.edit + '</button>';
        }
        if (!envOnly && entry.active_source === 'db') {
          actions += '<button class="btn btn-danger btn-sm btn-icon" data-action="delete-config" data-key="' + esc(entry.key) + '" title="Remove DB override">' + ICO.trash + '</button>';
        }
      }

      return '<div class="config-row">' +
        '<div class="config-key">' + esc(entry.key) + '</div>' +
        '<div class="config-val">' + val + '</div>' +
        '<div style="flex-shrink:0">' + badge + '</div>' +
        '<div class="config-actions">' + actions + '</div>' +
      '</div>';
    }

    function renderRateLimits() {
      var html = '<div class="section-head">' +
        '<h2 class="section-title">Rate Limits</h2>' +
        '<p class="section-desc">Use presets or configure each limiter. Set limit or window to 0 to disable a scope.</p>' +
      '</div>';

      if (S.configLoading) {
        return html + '<div class="loading-wrap"><span class="spinner"></span> Loading rate limits...</div>';
      }

      html += '<div class="card"><div class="config-add">' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" data-action="apply-rate-preset" data-preset="strict">Apply Strict Preset</button>' +
          '<button class="btn btn-primary btn-sm" data-action="apply-rate-preset" data-preset="balanced">Apply Balanced Preset</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="apply-rate-preset" data-preset="high_volume">Apply High-Volume Preset</button>' +
        '</div>' +
      '</div></div>';

      for (var i = 0; i < RATE_LIMIT_SCOPES.length; i++) {
        var rl = RATE_LIMIT_SCOPES[i];
        var limitKey = getRateLimitKey(rl.scope, 'LIMIT');
        var windowKey = getRateLimitKey(rl.scope, 'WINDOW_MS');
        var limitVal = getEntryInt(limitKey, rl.defaults.limit);
        var windowVal = getEntryInt(windowKey, rl.defaults.windowMs);

        html += '<div class="card"><div class="config-row">' +
          '<div class="config-key">' + esc(rl.label) + '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + esc(rl.scope) + '</div></div>' +
          '<div class="config-val">' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
              '<input id="rl-' + esc(rl.scope) + '-limit" type="number" min="0" step="1" value="' + esc(String(limitVal)) + '" style="max-width:180px" />' +
              '<input id="rl-' + esc(rl.scope) + '-window" type="number" min="0" step="1000" value="' + esc(String(windowVal)) + '" style="max-width:220px" />' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text3);margin-top:6px">Limit requests per window (ms)</div>' +
          '</div>' +
          '<div class="config-actions">' +
            '<button class="btn btn-primary btn-sm" data-action="save-rate-scope" data-scope="' + esc(rl.scope) + '">Save</button>' +
          '</div>' +
        '</div></div>';
      }
      return html;
    }

    // ── Logs view ──
    function renderLogs() {
      var html = '<div class="section-head">' +
        '<h2 class="section-title">Application Logs</h2>' +
        '<p class="section-desc">Real-time view of system logs stored in the database.</p>' +
      '</div>';

      // Filters
      html += '<div class="log-filters">' +
        '<div class="field"><label>Source</label><select id="f-source"><option value="">All Sources</option>' +
          '<option value="pay"' + (S.filters.source === 'pay' ? ' selected' : '') + '>pay</option>' +
          '<option value="ipn"' + (S.filters.source === 'ipn' ? ' selected' : '') + '>ipn</option>' +
          '<option value="payment-status"' + (S.filters.source === 'payment-status' ? ' selected' : '') + '>payment-status</option>' +
          '<option value="sellauth"' + (S.filters.source === 'sellauth' ? ' selected' : '') + '>sellauth</option>' +
        '</select></div>' +
        '<div class="field"><label>Level</label><select id="f-level"><option value="">All Levels</option>' +
          '<option value="info"' + (S.filters.level === 'info' ? ' selected' : '') + '>info</option>' +
          '<option value="warn"' + (S.filters.level === 'warn' ? ' selected' : '') + '>warn</option>' +
          '<option value="error"' + (S.filters.level === 'error' ? ' selected' : '') + '>error</option>' +
        '</select></div>' +
        '<div class="field"><label>Invoice ID</label><input type="text" id="f-invoice" placeholder="Filter by invoice..." value="' + esc(S.filters.invoice) + '" /></div>' +
        '<div class="field"><label>Limit</label><select id="f-limit">' +
          '<option value="25"' + (S.filters.limit === 25 ? ' selected' : '') + '>25</option>' +
          '<option value="50"' + (S.filters.limit === 50 ? ' selected' : '') + '>50</option>' +
          '<option value="100"' + (S.filters.limit === 100 ? ' selected' : '') + '>100</option>' +
          '<option value="200"' + (S.filters.limit === 200 ? ' selected' : '') + '>200</option>' +
          '<option value="500"' + (S.filters.limit === 500 ? ' selected' : '') + '>500</option>' +
        '</select></div>' +
      '</div>';

      // Toolbar
      html += '<div class="log-toolbar">' +
        '<div class="log-count">' +
          (S.logsLoading ? '<span class="spinner"></span> Loading...' : S.logs.length + ' entries loaded') +
        '</div>' +
        '<div class="log-tools">' +
          '<label class="auto-label"><input type="checkbox" id="auto-refresh-cb"' + (S.autoRefresh ? ' checked' : '') + ' /> Auto-refresh (5s)</label>' +
          '<button class="btn btn-ghost btn-sm" data-action="refresh-logs">' + ICO.refresh + ' Refresh</button>' +
        '</div>' +
      '</div>';

      // Error state
      if (S.logsError) {
        return html + '<div class="card"><div class="empty">' +
          '<div class="empty-title">Failed to load logs</div>' +
          '<div class="empty-desc">' + esc(S.logsError) + '</div>' +
          '<button class="btn btn-ghost btn-sm" data-action="refresh-logs">Retry</button>' +
        '</div></div>';
      }

      // Empty state
      if (!S.logsLoading && S.logs.length === 0) {
        return html + '<div class="card"><div class="empty">' +
          '<div class="empty-title">No logs found</div>' +
          '<div class="empty-desc">Adjust your filters or check back later.</div>' +
        '</div></div>';
      }

      // Log entries
      html += '<div class="card">';
      for (var i = 0; i < S.logs.length; i++) {
        html += renderLogEntry(S.logs[i], i);
      }
      html += '</div>';

      return html;
    }

    function renderLogEntry(log, idx) {
      var expanded = S.expandedLogs[idx];
      var levelCls = 'level-' + (log.level || 'info');
      var hasData = log.data && typeof log.data === 'object' && Object.keys(log.data).length > 0;

      var html = '<div class="log-entry">' +
        '<div class="log-head" data-action="toggle-log" data-idx="' + idx + '">' +
          '<span class="log-time" title="' + esc(fmtDate(log.created_at)) + '">' + timeAgo(log.created_at) + '</span>' +
          '<span class="level-badge ' + levelCls + '">' + esc(log.level) + '</span>' +
          '<span class="log-source">' + esc(log.source) + '</span>' +
          '<span class="log-msg">' + esc(log.message) + '</span>' +
          (log.sellauth_invoice_id ? '<span class="log-invoice" title="' + esc(log.sellauth_invoice_id) + '">' + esc(log.sellauth_invoice_id) + '</span>' : '') +
          (hasData ? '<span class="log-chevron' + (expanded ? ' open' : '') + '">&#9654;</span>' : '<span style="width:11px"></span>') +
        '</div>';

      if (hasData) {
        html += '<div class="log-data' + (expanded ? ' open' : '') + '">' +
          '<pre>' + esc(JSON.stringify(log.data, null, 2)) + '</pre>' +
        '</div>';
      }

      html += '</div>';
      return html;
    }

    // ════════════════════════════════════════════════════════════════════════
    // Event binding
    // ════════════════════════════════════════════════════════════════════════
    function bindEvents() {
      // Login form
      var loginForm = document.getElementById('login-form');
      if (loginForm) {
        loginForm.onsubmit = function(e) {
          e.preventDefault();
          var pw = document.getElementById('login-pw');
          if (!pw || !pw.value) return;
          var errEl = document.getElementById('login-error');
          doLogin(pw.value).catch(function(err) {
            if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
          });
        };
      }

      // Log filter selects
      var fs = document.getElementById('f-source');
      if (fs) fs.onchange = function() { S.filters.source = this.value; loadLogs(); };
      var fl = document.getElementById('f-level');
      if (fl) fl.onchange = function() { S.filters.level = this.value; loadLogs(); };
      var fli = document.getElementById('f-limit');
      if (fli) fli.onchange = function() { S.filters.limit = parseInt(this.value) || 50; loadLogs(); };
      var fi = document.getElementById('f-invoice');
      if (fi) {
        var debounce;
        fi.oninput = function() {
          var v = this.value;
          clearTimeout(debounce);
          debounce = setTimeout(function() { S.filters.invoice = v; loadLogs(); }, 500);
        };
      }

      // Auto-refresh checkbox
      var arcb = document.getElementById('auto-refresh-cb');
      if (arcb) arcb.onchange = toggleAutoRefresh;

      // Focus edit input if editing
      if (S.editKey) {
        var ei = document.getElementById('edit-cfg-val');
        if (ei) { ei.focus(); ei.select(); }
      }
      if (S.addMode) {
        var nk = document.getElementById('new-cfg-key');
        if (nk) nk.focus();
      }
    }

    // ── Delegated click handler ──
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      var key = btn.getAttribute('data-key');
      var idx = btn.getAttribute('data-idx');

      switch (action) {
        case 'tab':
          S.view = btn.getAttribute('data-tab');
          if (S.view === 'logs' && S.logs.length === 0 && !S.logsLoading) loadLogs();
          else if ((S.view === 'config' || S.view === 'rate-limits') && S.config.length === 0 && !S.configLoading) loadConfig();
          else render();
          break;
        case 'logout':
          doLogout();
          break;
        case 'setup':
          doSetup();
          break;
        case 'reload-config':
          loadConfig();
          break;
        case 'edit-config':
          var cfgEntry = null;
          for (var i = 0; i < S.config.length; i++) { if (S.config[i].key === key) { cfgEntry = S.config[i]; break; } }
          S.editKey = key;
          S.editVal = cfgEntry ? (cfgEntry.active_value || '') : '';
          render();
          break;
        case 'save-edit':
          var editInput = document.getElementById('edit-cfg-val');
          if (editInput && key) saveEntry(key, editInput.value);
          break;
        case 'cancel-edit':
          S.editKey = null;
          render();
          break;
        case 'delete-config':
          if (confirm('Remove database override for "' + key + '"?\\nThe environment variable value will be used as fallback.')) {
            deleteEntry(key);
          }
          break;
        case 'toggle-reveal':
          S.revealed[key] = !S.revealed[key];
          render();
          break;
        case 'add-config':
          S.addMode = true;
          render();
          break;
        case 'save-new':
          var nkEl = document.getElementById('new-cfg-key');
          var nvEl = document.getElementById('new-cfg-val');
          if (nkEl && nvEl && nkEl.value.trim()) {
            saveEntry(nkEl.value.trim(), nvEl.value);
          } else {
            toast('Please enter a key name', 'error');
          }
          break;
        case 'cancel-add':
          S.addMode = false;
          render();
          break;
        case 'refresh-logs':
          loadLogs();
          break;
        case 'save-rate-scope':
          var scope = btn.getAttribute('data-scope');
          if (scope) saveRateLimitScope(scope);
          break;
        case 'apply-rate-preset':
          var preset = btn.getAttribute('data-preset');
          if (preset && confirm('Apply "' + preset.replace('_', ' ') + '" preset to all rate-limit scopes?')) {
            applyRatePreset(preset);
          }
          break;
        case 'toggle-log':
          if (idx !== null) {
            S.expandedLogs[idx] = !S.expandedLogs[idx];
            // Toggle inline without full re-render
            var dataEl = btn.parentElement.querySelector('.log-data');
            var chevron = btn.querySelector('.log-chevron');
            if (dataEl) dataEl.classList.toggle('open');
            if (chevron) chevron.classList.toggle('open');
          }
          break;
      }
    });

    // Handle Enter key in edit input
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var target = e.target;
        if (target.id === 'edit-cfg-val' && S.editKey) {
          saveEntry(S.editKey, target.value);
        }
        if (target.id === 'new-cfg-val' || target.id === 'new-cfg-key') {
          var nk = document.getElementById('new-cfg-key');
          var nv = document.getElementById('new-cfg-val');
          if (nk && nv && nk.value.trim()) saveEntry(nk.value.trim(), nv.value);
        }
      }
      if (e.key === 'Escape') {
        if (S.editKey) { S.editKey = null; render(); }
        if (S.addMode) { S.addMode = false; render(); }
      }
    });

    // ════════════════════════════════════════════════════════════════════════
    // Init
    // ════════════════════════════════════════════════════════════════════════
    render();
    if (S.token) {
      // Verify saved token is still valid
      fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: S.token })
      }).then(function(r) {
        if (r.ok) { loadConfig(); }
        else { S.token = ''; sessionStorage.removeItem('np_admin'); render(); }
      }).catch(function() {
        S.token = '';
        sessionStorage.removeItem('np_admin');
        render();
      });
    }
  })();
  </script>
</body>
</html>`;
