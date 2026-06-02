const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = "/server";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/budget-tracker";

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

app.post(`${PREFIX}/register`, async (req, res) => {
  try {
    const { username, password } = req.body;
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
    const { username, password } = req.body;
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
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budget Tracker server running on port ${PORT}${PREFIX}`);
});
