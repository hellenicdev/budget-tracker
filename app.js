const API_BASE = "https://budget-tracker-api.onrender.com/server";

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
  const logoutBtn = document.querySelector("#dashboard button");

  let currentUser = null;
  let isLogin = true;
  let chartInstance = null;

  function showAlert(msg, type = "success") {
    alertBox.textContent = msg;
    alertBox.className = `alert ${type}`;
    alertBox.classList.remove("hidden");
    setTimeout(() => alertBox.classList.add("hidden"), 3000);
  }

  async function register(username, password) {
    const res = await fetch(`${API_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  }

  async function login(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
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
    authCard.style.display = "block";
    authForm.reset();
    currentUser = null;
    transactionList.innerHTML = "";
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  };

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      showAlert("Please fill in all fields.", "error");
      return;
    }

    if (isLogin) {
      try {
        const data = await login(username, password);
        if (!data.success) {
          showAlert(data.error || "Invalid login", "error");
          return;
        }
        showAlert("Login successful!");
        showDashboard(username);
      } catch {
        showAlert("Cannot reach server. Make sure the server is running.", "error");
      }
    } else {
      try {
        const data = await register(username, password);
        if (!data.success) {
          showAlert(data.error || "Registration failed", "error");
          return;
        }
        showAlert("Registered! You can now log in.");
        toggleMode();
      } catch {
        showAlert("Cannot reach server. Make sure the server is running.", "error");
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
        div.textContent = `${t.category}: $${parseFloat(t.amount).toFixed(2)}`;
        transactionList.appendChild(div);
      });
      renderChart(data);
    } catch {
      showAlert("Failed to load transactions.", "error");
    }
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
          backgroundColor: ["#FF5733", "#33FF57", "#3357FF", "#FF33A8", "#F3FF33"]
        }]
      },
      options: { responsive: true }
    });
  }
});
