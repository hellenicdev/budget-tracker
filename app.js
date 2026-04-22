const API_BASE = "https://niobic-omari-boastingly.ngrok-free.dev/server/";

let currentUser = null;

/* AUTH */

async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  alert(data.success ? "Registered!" : "User exists");
}

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!data.success) {
    alert("Invalid login");
    return;
  }

  currentUser = username;

  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";

  loadTransactions();
}

/* TRANSACTIONS */

async function addTransaction() {
  const amount = document.getElementById("amount").value;
  const category = document.getElementById("category").value;

  await fetch(`${API_BASE}/add-transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: currentUser,
      amount,
      category
    })
  });

  loadTransactions();
}

async function loadTransactions() {
  const res = await fetch(
    `${API_BASE}/transactions/${currentUser}`
  );

  const data = await res.json();

  const list = document.getElementById("list");
  list.innerHTML = "";

  data.forEach(t => {
    const li = document.createElement("li");
    li.innerText = `${t.amount} - ${t.category}`;
    list.appendChild(li);
  });
}