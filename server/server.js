const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = "/server";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/budget-tracker";
const HF_API_KEY = process.env.HF_API_KEY || "";
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || "";

app.use(cors());
app.use(express.json());

mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});

const transactionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  amount:   { type: Number, required: true },
  category: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Transaction = mongoose.model("Transaction", transactionSchema);

async function verifyTurnstile(token) {
  if (!TURNSTILE_SECRET) return true;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token })
    });
    const data = await res.json();
    return data.success;
  } catch {
    return false;
  }
}

app.post(`${PREFIX}/register`, async (req, res) => {
  try {
    const { username, password, turnstileToken } = req.body;
    if (!(await verifyTurnstile(turnstileToken))) {
      return res.json({ success: false, error: "Verification failed. Please try again." });
    }
    if (!username || !password) {
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
    res.json({ success: false, error: err.message });
  }
});

app.post(`${PREFIX}/login`, async (req, res) => {
  try {
    const { username, password, turnstileToken } = req.body;
    if (!(await verifyTurnstile(turnstileToken))) {
      return res.json({ success: false, error: "Verification failed. Please try again." });
    }
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.json({ success: false, error: "Invalid login" });
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post(`${PREFIX}/add-transaction`, async (req, res) => {
  try {
    const { username, amount, category } = req.body;
    if (!username || amount === undefined || !category) {
      return res.json({ success: false, error: "Invalid data" });
    }
    await new Transaction({ username, amount, category }).save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get(`${PREFIX}/transactions/:username`, async (req, res) => {
  try {
    const transactions = await Transaction
      .find({ username: req.params.username })
      .select("amount category")
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch {
    res.json([]);
  }
});

app.post(`${PREFIX}/ai-feedback`, async (req, res) => {
  try {
    const { amount, category } = req.body;
    if (amount === undefined || !category) {
      return res.json({ success: false, error: "Invalid data" });
    }
    if (!HF_API_KEY) {
      return res.json({ success: false, error: "AI feedback is not configured" });
    }

    const prompt = `Expense: ${category} $${amount}
Feedback: You spent a`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const hfRes = await fetch(
      "https://router.huggingface.co/hf-inference/models/gpt2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 40, temperature: 0.3 }
        })
      }
    );

    clearTimeout(timeout);

    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => "");
      return res.json({ success: false, error: `AI error (${hfRes.status}): ${errText.slice(0,100)}` });
    }

    const hfData = await hfRes.json();
    let text = hfData[0]?.generated_text || "";
    text = text.replace(prompt, "").replace(/\n/g, " ").trim();
    text = text.split(".")[0] + ".";
    if (!text.includes("reasonable") && !text.includes("unreasonable")) {
      text = `You spent a reasonable amount on ${category}.`;
    }

    res.json({ success: true, feedback: text });
  } catch (err) {
    const msg = err.name === "AbortError"
      ? "AI request timed out"
      : err.message === "fetch failed"
        ? "AI service unreachable"
        : err.message;
    res.json({ success: false, error: msg });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budget Tracker server running on port ${PORT}${PREFIX}`);
});
