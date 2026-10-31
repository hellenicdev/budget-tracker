const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = "/server";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/budget-tracker";
const COOKIE_NAME = "session";
const GENERIC_ERROR = "Something went wrong. Please try again.";

mongoose.set("sanitizeFilter", true);

function logError(context, err) {
  const message = err && err.message ? String(err.message) : String(err || "unknown error");
  const safe = /mongodb(\+srv)?:\/\//i.test(message) ? "database error" : message;
  console.error(context, safe);
}

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "https://hellenicdev.eu")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET || "";
  return secret.length >= 16 ? secret : "";
}

function turnstileSecret() {
  return process.env.TURNSTILE_SECRET || "";
}

app.set("trust proxy", 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins().includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true
}));
app.use(express.json());

mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).catch((err) => {
  logError("MongoDB connection error:", err);
});
mongoose.connection.on("error", (err) => {
  logError("MongoDB connection error:", err);
});

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});

const transactionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);

function cookieBase() {
  const secure = process.env.NODE_ENV !== "development";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    partitioned: secure,
    path: "/"
  };
}

function cookieOptions() {
  return {
    ...cookieBase(),
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== "string" || !header) return "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function requireAuth(req, res, next) {
  const secret = jwtSecret();
  if (!secret) {
    return res.status(500).json({ success: false, error: "Server auth is not configured" });
  }
  const token = readCookie(req, COOKIE_NAME);
  if (!token) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (!payload || typeof payload.username !== "string" || !payload.username) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    req.user = { username: payload.username };
    return next();
  } catch {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }
}

function requireDb(req, res, next) {
  const state = mongoose.connection.readyState;
  if (state === 1 || state === 2) return next();
  return res.status(503).json({ success: false, error: "Service temporarily unavailable" });
}

function textField(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function parseAmount(value) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount)) return null;
  return amount;
}

async function verifyTurnstile(token) {
  const secret = turnstileSecret();
  if (!secret) return false;
  if (typeof token !== "string" || token.length < 1 || token.length > 4096) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token })
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    logError("Turnstile verification failed:", err);
    return false;
  }
}

function limitReached(message) {
  return function handler(req, res) {
    res.status(429).json({ success: false, error: message });
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: limitReached("Too many attempts. Please try again later.")
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: limitReached("Too many AI requests. Please try again later.")
});

app.post(`${PREFIX}/register`, authLimiter, requireDb, async (req, res) => {
  try {
    const body = req.body || {};
    if (!(await verifyTurnstile(body.turnstileToken))) {
      return res.json({ success: false, error: "Verification failed. Please try again." });
    }
    const username = textField(body.username, 32);
    const password = body.password;
    if (!username || typeof password !== "string" || password.length < 1 || password.length > 128) {
      return res.json({ success: false, error: "Username and password required" });
    }
    const existing = await User.findOne({ username });
    if (existing) {
      return res.json({ success: false, error: "User exists" });
    }
    const hashed = await bcrypt.hash(password, 10);
    await new User({ username, password: hashed }).save();
    res.json({ success: true });
  } catch (err) {
    logError("Register failed:", err);
    if (err && err.code === 11000) {
      return res.json({ success: false, error: "User exists" });
    }
    res.json({ success: false, error: GENERIC_ERROR });
  }
});

app.post(`${PREFIX}/login`, authLimiter, requireDb, async (req, res) => {
  try {
    const secret = jwtSecret();
    if (!secret) {
      return res.status(500).json({ success: false, error: "Server auth is not configured" });
    }
    const body = req.body || {};
    if (!(await verifyTurnstile(body.turnstileToken))) {
      return res.json({ success: false, error: "Verification failed. Please try again." });
    }
    const username = textField(body.username, 32);
    const password = body.password;
    if (!username || typeof password !== "string" || password.length < 1 || password.length > 128) {
      return res.json({ success: false, error: "Invalid login" });
    }
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, error: "Invalid login" });
    }
    const token = jwt.sign({ username: user.username }, secret, {
      expiresIn: "7d",
      algorithm: "HS256"
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());
    res.json({ success: true, username: user.username });
  } catch (err) {
    logError("Login failed:", err);
    res.json({ success: false, error: GENERIC_ERROR });
  }
});

app.post(`${PREFIX}/logout`, (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieBase());
  res.json({ success: true });
});

app.get(`${PREFIX}/me`, requireAuth, (req, res) => {
  res.json({ success: true, username: req.user.username });
});

app.post(`${PREFIX}/add-transaction`, requireAuth, requireDb, async (req, res) => {
  try {
    const body = req.body || {};
    const category = textField(body.category, 60);
    const amount = parseAmount(body.amount);
    if (!category || amount === null || amount <= 0 || amount > 1000000000) {
      return res.json({ success: false, error: "Invalid data" });
    }
    await new Transaction({
      username: req.user.username,
      amount,
      category
    }).save();
    res.json({ success: true });
  } catch (err) {
    logError("Add transaction failed:", err);
    res.json({ success: false, error: GENERIC_ERROR });
  }
});

app.get(`${PREFIX}/transactions`, requireAuth, requireDb, async (req, res) => {
  try {
    const transactions = await Transaction
      .find({ username: req.user.username })
      .select("amount category")
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    logError("Load transactions failed:", err);
    res.status(500).json({ success: false, error: GENERIC_ERROR });
  }
});

app.post(`${PREFIX}/ai-feedback`, aiLimiter, requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const category = textField(body.category, 60);
    const amount = parseAmount(body.amount);
    if (!category || amount === null) {
      return res.json({ success: false, error: "Invalid data" });
    }
    const apiKey = process.env.HF_API_KEY || "";
    if (!apiKey) {
      console.error("AI feedback is not configured");
      return res.json({ success: false, error: "AI feedback is unavailable" });
    }

    const safeCategory = category.replace(/[\r\n<>]/g, " ");
    const shown = Number(amount.toFixed(2));
    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a financial advisor.<|eot_id|><|start_header_id|>user<|end_header_id|>

Analyze this expense: ${safeCategory} $${shown}. Respond with ONE short sentence starting with "You spent a" followed by "reasonable" or "unreasonable". If unreasonable, end with " — that purchase was not needed."<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let hfRes;
    try {
      hfRes = await fetch(
        "https://router.huggingface.co/hf-inference/models/meta-llama/Llama-3.1-8B-Instruct",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          signal: controller.signal,
          body: JSON.stringify({
            inputs: prompt,
            parameters: { max_new_tokens: 80, temperature: 0.2 }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!hfRes.ok) {
      console.error("AI provider error status:", hfRes.status);
      return res.json({ success: false, error: "AI feedback is unavailable" });
    }

    const hfData = await hfRes.json();
    let text = hfData[0]?.generated_text || "";
    text = text.split("<|start_header_id|>assistant<|end_header_id|>").pop().split("<|eot_id|>")[0].trim();

    res.json({ success: true, feedback: text || "Could not generate feedback." });
  } catch (err) {
    logError("AI feedback failed:", err);
    const timedOut = err && err.name === "AbortError";
    res.json({
      success: false,
      error: timedOut ? "AI request timed out" : "AI feedback is unavailable"
    });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  logError("Request error:", err);
  const invalid = err && (err.type === "entity.parse.failed" || err instanceof SyntaxError);
  res.status(invalid ? 400 : 500).json({
    success: false,
    error: invalid ? "Invalid request" : GENERIC_ERROR
  });
});

if (require.main === module) {
  process.on("unhandledRejection", (err) => {
    logError("Unhandled rejection:", err);
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Budget Tracker server running on port ${PORT}${PREFIX}`);
  });
}

module.exports = { app };
