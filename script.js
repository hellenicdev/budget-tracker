const authCard = document.getElementById('auth-card');
const dashboard = document.getElementById('dashboard');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const userDisplay = document.getElementById('user-display');
const alertBox = document.getElementById('alert');
const transactionAmountInput = document.getElementById('transaction-amount');
const transactionCategoryInput = document.getElementById('transaction-category');
const transactionList = document.getElementById('transaction-list');
const addTransactionBtn = document.getElementById('add-transaction');
const strengthBar = document.getElementById('strength-bar');

let transactions = JSON.parse(localStorage.getItem('transactions') || '[]');
let income = JSON.parse(localStorage.getItem('income') || '0');

// Show alert messages
function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert ${type}`;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 3000);
}

// Password strength indicator
passwordInput.addEventListener('input', () => {
  const val = passwordInput.value;
  const strength = Math.min(val.length / 10, 1);
  strengthBar.style.width = `${strength * 100}%`;
  strengthBar.style.backgroundColor = strength < 0.4 ? 'red' : strength < 0.7 ? 'orange' : 'green';
});

// Handle form submission (login)
authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  const users = JSON.parse(localStorage.getItem('users') || '{}');

  // Check password length
  if (password.length < 6) {
    showAlert("Password must be at least 6 characters.", "error");
    return;
  }

  // Login logic
  if (!users[username] || users[username] !== password) {
    showAlert("Invalid username or password.", "error");
    return;
  }

  showAlert("Login successful!");
  // Store username in localStorage to remember user
  localStorage.setItem('loggedInUser', username);

  // Show dashboard after successful login
  showDashboard(username);
});

// Show the dashboard after login
function showDashboard(username) {
  userDisplay.textContent = username;
  authCard.style.display = 'none';  // Hide the login form
  dashboard.style.display = 'block';  // Show the dashboard
  renderChart();  // Render the chart after showing the dashboard
}

// Logout and show login form again
function logout() {
  dashboard.style.display = 'none';  // Hide dashboard
  authCard.style.display = 'block';  // Show login form again
  authForm.reset();
  strengthBar.style.width = "0";
  localStorage.removeItem('loggedInUser');  // Remove the logged-in user from localStorage
}

// Check if user is already logged in
window.addEventListener('load', () => {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if (loggedInUser) {
    // If user is logged in, show dashboard directly
    showDashboard(loggedInUser);
  }
});

// Render the budget chart
function renderChart() {
  const ctx = document.getElementById('budgetChart').getContext('2d');

  // Get categories and amounts from transactions
  const categories = [];
  const amounts = [];

  transactions.forEach(t => {
    if (categories.indexOf(t.category) === -1) {
      categories.push(t.category);
      amounts.push(t.amount);
    } else {
      const categoryIndex = categories.indexOf(t.category);
      amounts[categoryIndex] += t.amount;  // Sum amounts for the same category
    }
  });

  // Create the pie chart
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: categories.length > 0 ? categories : ['No transactions yet'],
      datasets: [{
        label: 'Spending Breakdown',
        data: amounts.length > 0 ? amounts : [1],
        backgroundColor: ['#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#F3FF33'],
      }]
    },
    options: {
      responsive: true
    }
  });
}

// Handle transaction addition
addTransactionBtn.addEventListener('click', () => {
  const amount = parseFloat(transactionAmountInput.value);
  const category = transactionCategoryInput.value.trim();

  if (isNaN(amount) || amount <= 0 || category === '') {
    showAlert("Please enter a valid amount and category.", "error");
    return;
  }

  transactions.push({ amount, category });
  income += amount;
  localStorage.setItem('transactions', JSON.stringify(transactions));
  localStorage.setItem('income', JSON.stringify(income));

  renderChart();  // Re-render the chart
  showAlert("Transaction added!");
  transactionAmountInput.value = '';
  transactionCategoryInput.value = '';
  displayTransactions();
});

// Display transaction list
function displayTransactions() {
  transactionList.innerHTML = '';
  transactions.forEach(t => {
    const transactionItem = document.createElement('div');
    transactionItem.className = 'transaction';
    transactionItem.textContent = `${t.category}: $${t.amount.toFixed(2)}`;
    transactionList.appendChild(transactionItem);
  });
}