const API_BASE = "https://budget-tracker-hk4o.onrender.com/server";
const TURNSTILE_SITEKEY = "0x4AAAAAADdoCy_V3M2v9tST";

document.addEventListener("DOMContentLoaded", () => {
  const authCard = document.getElementById("auth-card");
  const authForm = document.getElementById("auth-form");
  const formTitle = document.getElementById("form-title");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const alertBox = document.getElementById("alert");
  const userDisplay = document.getElementById("user-display");
  const amountInput = document.getElementById("transaction-amount");
  const categoryInput = document.getElementById("transaction-category");
  const transactionList = document.getElementById("transaction-list");
  const addBtn = document.getElementById("add-transaction");
  const dashboard = document.getElementById("dashboard");
  const tcContainer = document.getElementById("turnstile-container");

  let currentUser = null;
  let isLogin = true;
  let chartInstance = null;
  let turnstileWidgetId = null;

  function initTurnstile() {
    if (typeof turnstile === "undefined") {
      setTimeout(initTurnstile, 200);
      return;
    }
    turnstileWidgetId = turnstile.render(tcContainer, {
      sitekey: TURNSTILE_SITEKEY
    });
  }
  initTurnstile();

  function getTurnstileToken() {
    if (!turnstileWidgetId || typeof turnstile === "undefined") return "";
    return turnstile.getResponse(turnstileWidgetId);
  }

  function resetTurnstile() {
    if (turnstileWidgetId && typeof turnstile !== "undefined") {
      turnstile.reset(turnstileWidgetId);
    }
  }

  function showAlert(msg, type) {
    alertBox.textContent = msg;
    alertBox.className = "alert";
    if (type) alertBox.classList.add(type);
    alertBox.classList.remove("hidden");
    setTimeout(() => alertBox.classList.add("hidden"), 3500);
  }

  async function authRequest(endpoint, username, password, turnstileToken) {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, turnstileToken })
    });
    return res.json();
  }

  async function addTransactionAPI(username, amount, category) {
    await fetch(`${API_BASE}/add-transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, amount, category })
    });
  }

  async function loadTransactionsAPI(username) {
    const res = await fetch(`${API_BASE}/transactions/${username}`);
    return res.json();
  }

  function showDashboard(username) {
    currentUser = username;
    authCard.style.display = "none";
    dashboard.style.display = "block";
    userDisplay.textContent = username;
    loadTransactions();
  }

  window.logout = function () {
    dashboard.style.display = "none";
    authCard.style.display = "";
    authForm.reset();
    currentUser = null;
    transactionList.innerHTML = "";
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    resetTurnstile();
  };

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      showAlert("Please fill in all fields.", "error");
      return;
    }

    const turnstileToken = getTurnstileToken();

    if (isLogin) {
      try {
        const data = await authRequest("login", username, password, turnstileToken);
        if (!data.success) {
          showAlert(data.error || "Invalid login", "error");
          resetTurnstile();
          return;
        }
        showAlert("Login successful!");
        showDashboard(username);
      } catch {
        showAlert("Cannot reach server.", "error");
        resetTurnstile();
      }
    } else {
      try {
        const data = await authRequest("register", username, password, turnstileToken);
        if (!data.success) {
          showAlert(data.error || "Registration failed", "error");
          resetTurnstile();
          return;
        }
        showAlert("Registered! You can now log in.");
        toggleMode();
      } catch {
        showAlert("Cannot reach server.", "error");
        resetTurnstile();
      }
    }
  });

  const switchBtn = document.createElement("button");
  switchBtn.id = "switch-btn";
  switchBtn.textContent = "Don't have an account? Sign up";
  authCard.querySelector(".card").appendChild(switchBtn);

  function toggleMode() {
    isLogin = !isLogin;
    formTitle.textContent = isLogin ? "Login" : "Sign Up";
    authForm.querySelector('button[type="submit"]').textContent = isLogin ? "Login" : "Sign Up";
    switchBtn.textContent = isLogin
      ? "Don't have an account? Sign up"
      : "Already have an account? Login";
    resetTurnstile();
  }

  switchBtn.addEventListener("click", toggleMode);

  const strengthContainer = document.createElement("div");
  strengthContainer.id = "strength";
  const strengthBar = document.createElement("div");
  strengthBar.id = "strength-bar";
  strengthContainer.appendChild(strengthBar);
  passwordInput.insertAdjacentElement("afterend", strengthContainer);

  passwordInput.addEventListener("input", () => {
    const val = passwordInput.value;
    const strength = Math.min(val.length / 10, 1);
    strengthBar.style.width = `${strength * 100}%`;
    strengthBar.style.backgroundColor =
      strength < 0.4 ? "red" : strength < 0.7 ? "orange" : "green";
  });

  addBtn.addEventListener("click", async () => {
    const amount = parseFloat(amountInput.value);
    const category = categoryInput.value.trim();

    if (isNaN(amount) || amount <= 0 || !category) {
      showAlert("Please enter a valid amount and category.", "error");
      return;
    }

    try {
      await addTransactionAPI(currentUser, amount, category);
      showAlert("Transaction added!");
      amountInput.value = "";
      categoryInput.value = "";
      loadTransactions();
    } catch {
      showAlert("Failed to save transaction.", "error");
    }
  });

  async function loadTransactions() {
    try {
      const data = await loadTransactionsAPI(currentUser);
      transactionList.innerHTML = "";
      data.forEach(t => {
        const div = document.createElement("div");
        div.className = "transaction";

        const label = document.createElement("span");
        label.textContent = `${t.category}: $${parseFloat(t.amount).toFixed(2)}`;

        const actions = document.createElement("div");
        actions.className = "transaction-actions";

        const analyzeBtn = document.createElement("button");
        analyzeBtn.className = "btn-analyze";
        analyzeBtn.textContent = "Analyze";
        analyzeBtn.dataset.amount = t.amount;
        analyzeBtn.dataset.category = t.category;
        analyzeBtn.addEventListener("click", onAnalyze);

        actions.appendChild(analyzeBtn);
        div.appendChild(label);
        div.appendChild(actions);
        transactionList.appendChild(div);
      });
      renderChart(data);
    } catch {
      showAlert("Failed to load transactions.", "error");
    }
  }

  async function onAnalyze(e) {
    const btn = e.currentTarget;
    const amount = btn.dataset.amount;
    const category = btn.dataset.category;
    const txDiv = btn.closest(".transaction");

    let feedbackEl = txDiv.nextElementSibling;
    if (feedbackEl && feedbackEl.classList.contains("ai-feedback")) {
      feedbackEl.remove();
    }

    feedbackEl = document.createElement("div");
    feedbackEl.className = "ai-feedback loading";
    feedbackEl.textContent = "Analyzing...";
    txDiv.insertAdjacentElement("afterend", feedbackEl);
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/ai-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, category })
      });
      const data = await res.json();

      if (!data.success) {
        feedbackEl.textContent = data.error || "AI feedback unavailable";
        feedbackEl.className = "ai-feedback";
      } else {
        feedbackEl.textContent = data.feedback;
        feedbackEl.className = "ai-feedback";
        if (data.feedback.toLowerCase().includes("unreasonable")) {
          feedbackEl.classList.add("unreasonable");
        } else if (data.feedback.toLowerCase().includes("reasonable")) {
          feedbackEl.classList.add("reasonable");
        }
      }
    } catch {
      feedbackEl.textContent = "Failed to get AI feedback.";
      feedbackEl.className = "ai-feedback";
    }

    btn.disabled = false;
  }

  function renderChart(transactions) {
    const ctx = document.getElementById("budgetChart").getContext("2d");
    const categories = [];
    const amounts = [];

    transactions.forEach(t => {
      const idx = categories.indexOf(t.category);
      if (idx === -1) {
        categories.push(t.category);
        amounts.push(parseFloat(t.amount));
      } else {
        amounts[idx] += parseFloat(t.amount);
      }
    });

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: "pie",
      data: {
        labels: categories.length ? categories : ["No transactions yet"],
        datasets: [{
          label: "Spending Breakdown",
          data: amounts.length ? amounts : [1],
          backgroundColor: ["#FF5733", "#33FF57", "#3357FF", "#FF33A8", "#F3FF33", "#FFC300", "#DAF7A6"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 16, boxWidth: 12 }
          }
        }
      }
    });
  }
});
