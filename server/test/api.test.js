const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { MongoMemoryServer } = require("mongodb-memory-server");

const TOKEN = "ok-token";
let mongod;
let server;
let base;
let mongoose;
let app;

function cookiePair(setCookies, name) {
  const lines = setCookies || [];
  for (const line of lines) {
    const first = line.split(";")[0];
    if (first.startsWith(`${name}=`)) return first;
  }
  return "";
}

async function api(path, { method = "GET", body, cookie, origin, rawBody, contentType } = {}) {
  const headers = {};
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (rawBody !== undefined) {
    headers["Content-Type"] = contentType || "application/json";
    payload = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: res.status,
    json,
    text,
    setCookie: typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [],
    allowOrigin: res.headers.get("access-control-allow-origin"),
    allowCredentials: res.headers.get("access-control-allow-credentials")
  };
}

describe("budget tracker API", { concurrency: false }, () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = "test-secret-value-123";
    process.env.TURNSTILE_SECRET = "turnstile-test-secret";
    process.env.NODE_ENV = "development";
    process.env.ALLOWED_ORIGINS = "https://hellenicdev.eu";
    delete process.env.HF_API_KEY;

    const realFetch = global.fetch.bind(global);
    global.fetch = async (url, options) => {
      const target = String(url);
      if (target.includes("challenges.cloudflare.com/turnstile")) {
        const raw = options && options.body ? String(options.body) : "";
        const params = new URLSearchParams(raw);
        return { ok: true, json: async () => ({ success: params.get("response") === TOKEN }) };
      }
      return realFetch(url, options);
    };

    ({ app } = require("../server"));
    mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("database did not connect")), 20000);
        mongoose.connection.once("connected", () => {
          clearTimeout(timer);
          resolve();
        });
        mongoose.connection.once("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    }

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/server`;
  }, { timeout: 180000 });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  test("register rejects a missing Turnstile token", async () => {
    const res = await api("/register", {
      method: "POST",
      origin: "https://hellenicdev.eu",
      body: { username: "alice", password: "secret-pass", turnstileToken: "" }
    });
    assert.equal(res.json.success, false);
    assert.equal(res.json.error, "Verification failed. Please try again.");
  });

  test("register and login issue an httpOnly cookie and ignore a spoofed username", async () => {
    const registered = await api("/register", {
      method: "POST",
      origin: "https://hellenicdev.eu",
      body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
    });
    assert.equal(registered.json.success, true);
    assert.equal(registered.setCookie.length, 0);

    const duplicate = await api("/register", {
      method: "POST",
      body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
    });
    assert.equal(duplicate.json.error, "User exists");

    const bad = await api("/login", {
      method: "POST",
      body: { username: "alice", password: "wrong-password", turnstileToken: TOKEN }
    });
    assert.equal(bad.json.error, "Invalid login");

    const login = await api("/login", {
      method: "POST",
      origin: "https://hellenicdev.eu",
      body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
    });
    assert.equal(login.json.success, true);
    assert.equal(login.json.username, "alice");
    assert.equal(login.json.token, undefined);
    const aliceCookie = cookiePair(login.setCookie, "session");
    assert.match(login.setCookie[0], /HttpOnly/i);
    assert.match(login.setCookie[0], /SameSite=Lax/i);
    assert.doesNotMatch(login.setCookie[0], /Secure/i);
    assert.equal(login.allowOrigin, "https://hellenicdev.eu");
    assert.equal(login.allowCredentials, "true");

    const bob = await api("/register", {
      method: "POST",
      body: { username: "bob", password: "bob-password", turnstileToken: TOKEN }
    });
    assert.equal(bob.json.success, true);
    const bobLogin = await api("/login", {
      method: "POST",
      body: { username: "bob", password: "bob-password", turnstileToken: TOKEN }
    });
    const bobCookie = cookiePair(bobLogin.setCookie, "session");

    const anonymous = await api("/transactions");
    assert.equal(anonymous.status, 401);

    const oldRoute = await api("/transactions/bob", { cookie: aliceCookie });
    assert.equal(oldRoute.status, 404);

    const spoofed = await api("/add-transaction", {
      method: "POST",
      cookie: aliceCookie,
      body: { username: "bob", amount: 12.5, category: "Coffee" }
    });
    assert.equal(spoofed.json.success, true);

    const aliceTx = await api("/transactions", { cookie: aliceCookie });
    assert.equal(aliceTx.status, 200);
    assert.equal(aliceTx.json.length, 1);
    assert.equal(aliceTx.json[0].category, "Coffee");
    assert.equal(aliceTx.json[0].username, undefined);

    const bobTx = await api("/transactions", { cookie: bobCookie });
    assert.deepEqual(bobTx.json, []);

    const me = await api("/me", { cookie: aliceCookie });
    assert.deepEqual(me.json, { success: true, username: "alice" });

    const loggedOut = await api("/logout", { method: "POST", cookie: aliceCookie });
    assert.equal(loggedOut.json.success, true);
    assert.match(loggedOut.setCookie[0], /Expires=/i);
    const afterLogout = await api("/me");
    assert.equal(afterLogout.status, 401);
  });

  test("rejects operator objects and does not return raw errors", async () => {
    const injected = await api("/login", {
      method: "POST",
      body: { username: { $gt: "" }, password: { $gt: "" }, turnstileToken: TOKEN }
    });
    assert.equal(injected.json.success, false);
    assert.equal(injected.json.error, "Invalid login");
    assert.doesNotMatch(injected.text, /\$gt|Cast to|MongoServer|stack/i);

    const broken = await api("/register", {
      method: "POST",
      rawBody: "{not-json",
      origin: "https://hellenicdev.eu"
    });
    assert.equal(broken.status, 400);
    assert.equal(broken.json.error, "Invalid request");
    assert.doesNotMatch(broken.text, /SyntaxError|at\s/);
  });

  test("AI feedback requires a session and hides provider details", async () => {
    const open = await api("/ai-feedback", {
      method: "POST",
      body: { amount: 10, category: "Snacks" }
    });
    assert.equal(open.status, 401);

    const login = await api("/login", {
      method: "POST",
      body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
    });
    const cookie = cookiePair(login.setCookie, "session");
    const feedback = await api("/ai-feedback", {
      method: "POST",
      cookie,
      body: { amount: "8", category: "Snacks" }
    });
    assert.equal(feedback.json.success, false);
    assert.equal(feedback.json.error, "AI feedback is unavailable");
    assert.doesNotMatch(feedback.text, /HF_API_KEY|huggingface/i);
  });

  test("CORS allows only the configured origins", async () => {
    const blocked = await api("/me", { origin: "https://evil.example" });
    assert.equal(blocked.allowOrigin, null);

    const allowed = await api("/me", { origin: "https://hellenicdev.eu" });
    assert.equal(allowed.allowOrigin, "https://hellenicdev.eu");
    assert.equal(allowed.allowCredentials, "true");
  });

  test("Turnstile fails closed when the secret is unset", async () => {
    const previous = process.env.TURNSTILE_SECRET;
    delete process.env.TURNSTILE_SECRET;
    try {
      const res = await api("/login", {
        method: "POST",
        body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
      });
      assert.equal(res.json.success, false);
      assert.equal(res.json.error, "Verification failed. Please try again.");
    } finally {
      process.env.TURNSTILE_SECRET = previous;
    }
  });

  test("login refuses to issue a session without JWT_SECRET", async () => {
    const previous = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const res = await api("/login", {
        method: "POST",
        body: { username: "alice", password: "secret-pass", turnstileToken: TOKEN }
      });
      assert.equal(res.status, 500);
      assert.equal(res.json.error, "Server auth is not configured");
      assert.equal(res.setCookie.length, 0);
    } finally {
      process.env.JWT_SECRET = previous;
    }
  });

  test("production cookies are Secure, SameSite=None, and Partitioned", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const res = await api("/login", {
        method: "POST",
        body: { username: "bob", password: "bob-password", turnstileToken: TOKEN }
      });
      assert.equal(res.json.success, true);
      assert.match(res.setCookie[0], /HttpOnly/i);
      assert.match(res.setCookie[0], /Secure/i);
      assert.match(res.setCookie[0], /SameSite=None/i);
      assert.match(res.setCookie[0], /Partitioned/i);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  test("login and register are rate limited", async () => {
    let sawLimit = false;
    for (let i = 0; i < 25; i += 1) {
      const res = await api("/login", {
        method: "POST",
        body: { username: "alice", password: "wrong-password", turnstileToken: "" }
      });
      if (res.status === 429) {
        sawLimit = true;
        assert.equal(res.json.error, "Too many attempts. Please try again later.");
        break;
      }
    }
    assert.equal(sawLimit, true);
  });
});
