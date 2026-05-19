const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PREFIX = "/server";

app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.post(`${PREFIX}/register`, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, error: "Username and password required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.json({ success: false, error: "User exists" });
  }
  const hashed = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashed);
  res.json({ success: true });
});

app.post(`${PREFIX}/login`, (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.json({ success: false, error: "Invalid login" });
  }
  res.json({ success: true });
});

app.post(`${PREFIX}/add-transaction`, (req, res) => {
  const { username, amount, category } = req.body;
  if (!username || amount === undefined || !category) {
    return res.json({ success: false, error: "Invalid data" });
  }
  db.prepare("INSERT INTO transactions (username, amount, category) VALUES (?, ?, ?)").run(username, amount, category);
  res.json({ success: true });
});

app.get(`${PREFIX}/transactions/:username`, (req, res) => {
  const transactions = db.prepare(
    "SELECT amount, category FROM transactions WHERE username = ? ORDER BY created_at DESC"
  ).all(req.params.username);
  res.json(transactions);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Budget Tracker server running on http://0.0.0.0:${PORT}${PREFIX}`);
});
