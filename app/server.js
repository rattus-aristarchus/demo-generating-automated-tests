import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------------------------------------------------------------------------
// CLI / env configuration: supports `--port 7100`, `--port=7100`, `--host`,
// and the PORT / HOST environment variables.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { port: Number(process.env.PORT) || 7100, host: process.env.HOST || "127.0.0.1" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" && argv[i + 1]) {
      args.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--port=")) {
      args.port = Number(arg.slice("--port=".length));
    } else if (arg === "--host" && argv[i + 1]) {
      args.host = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--host=")) {
      args.host = arg.slice("--host=".length);
    }
  }
  return args;
}

const { port, host } = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Domain constants (mirror mock-tms/test-cases.json expectations).
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const MSG_INVALID_CREDENTIALS = "Неверный логин или пароль";
const MSG_LOCKED = "Слишком много попыток. Попробуйте через 15 минут";

// Seeded accounts: login "A" and login "C" from the test cases.
// Any other login (e.g. "B") is treated as unregistered.
const USERS = new Map([
  ["alice", "password123"],
  ["carol", "password456"],
]);

// Per-login brute-force state: login -> { fails: number, lockedUntil: number }.
// Tracked for unregistered logins too (TC-11: no observable difference).
const attempts = new Map();
// Active sessions: sid -> { login: string }.
const sessions = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, ...extraHeaders });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function getSession(req) {
  const { sid } = parseCookies(req);
  return sid ? sessions.get(sid) : undefined;
}

function sessionCookie(sid, maxAgeSeconds) {
  return `sid=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// Only same-site absolute paths are allowed to prevent open redirects.
function sanitizeReturnUrl(value) {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/home";
}

async function servePage(res, fileName, status = 200, extraHeaders = {}) {
  const html = await readFile(path.join(PUBLIC_DIR, fileName));
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(html);
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
async function handleLogin(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, code: "bad_request", message: MSG_INVALID_CREDENTIALS });
  }

  const login = typeof body.login === "string" ? body.login.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const now = Date.now();

  let record = attempts.get(login);
  if (!record) {
    record = { fails: 0, lockedUntil: 0 };
    attempts.set(login, record);
  }

  // Lock window expired -> counter resets before evaluating this attempt (TC-09).
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.fails = 0;
    record.lockedUntil = 0;
  }

  // TC-09: while locked even valid credentials must not authenticate.
  if (record.lockedUntil && now < record.lockedUntil) {
    return json(res, 423, { ok: false, code: "locked", message: MSG_LOCKED });
  }

  if (USERS.get(login) === password) {
    // TC-03: a successful login resets the failure counter.
    attempts.delete(login);
    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, { login });
    return json(
      res,
      200,
      { ok: true, redirectUrl: sanitizeReturnUrl(body.returnUrl) },
      { "Set-Cookie": sessionCookie(sid, 60 * 60) },
    );
  }

  record.fails += 1;
  if (record.fails >= MAX_FAILED_ATTEMPTS) {
    // TC-08: the 5th consecutive failure locks the login for 15 minutes.
    record.lockedUntil = now + LOCK_DURATION_MS;
    return json(res, 423, { ok: false, code: "locked", message: MSG_LOCKED });
  }
  // TC-06 / TC-07: identical response for wrong password and unknown login.
  return json(res, 401, { ok: false, code: "invalid_credentials", message: MSG_INVALID_CREDENTIALS });
}

async function handleLogout(req, res) {
  const { sid } = parseCookies(req);
  if (sid) sessions.delete(sid);
  return json(res, 200, { ok: true, redirectUrl: "/login" }, { "Set-Cookie": sessionCookie("deleted", 0) });
}

// ---------------------------------------------------------------------------
// Test hooks (used by Playwright fixtures; not part of the product surface).
// ---------------------------------------------------------------------------
function handleTestReset(_req, res) {
  attempts.clear();
  sessions.clear();
  return json(res, 200, { ok: true });
}

function handleTestExpireLocks(_req, res) {
  // Simulates "15 minutes have passed" for TC-09 without real waiting.
  for (const record of attempts.values()) {
    if (record.lockedUntil) record.lockedUntil = 1;
  }
  return json(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const STATIC_FILES = new Map([
  ["/login.js", "application/javascript; charset=utf-8"],
  ["/styles.css", "text/css; charset=utf-8"],
]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;

  try {
    // --- test hooks -------------------------------------------------------
    if (req.method === "POST" && pathname === "/__test__/reset") return handleTestReset(req, res);
    if (req.method === "POST" && pathname === "/__test__/expire-locks") return handleTestExpireLocks(req, res);

    // --- API ---------------------------------------------------------------
    if (req.method === "POST" && pathname === "/api/login") return handleLogin(req, res);
    if (req.method === "POST" && pathname === "/api/logout") return handleLogout(req, res);

    // --- static assets -----------------------------------------------------
    if (req.method === "GET" && STATIC_FILES.has(pathname)) {
      const content = await readFile(path.join(PUBLIC_DIR, pathname.slice(1)));
      res.writeHead(200, { "Content-Type": STATIC_FILES.get(pathname) });
      return res.end(content);
    }

    // --- pages ---------------------------------------------------------------
    if (req.method === "GET" && (pathname === "/" || pathname === "/login")) {
      if (getSession(req)) return redirect(res, "/home");
      return servePage(res, "login.html");
    }

    if (req.method === "GET" && (pathname === "/home" || pathname === "/dashboard")) {
      // TC-02: an anonymous visit to a protected page redirects to the login
      // form carrying the target URL; after login the user lands back here.
      if (!getSession(req)) {
        return redirect(res, `/login?returnUrl=${encodeURIComponent(pathname)}`);
      }
      return servePage(res, `${pathname.slice(1)}.html`);
    }

    return json(res, 404, { ok: false, code: "not_found" });
  } catch (err) {
    return json(res, 500, { ok: false, code: "internal_error", message: String(err) });
  }
});

server.listen(port, host, () => {
  console.log(`Login demo app listening on http://${host}:${port}`);
});
