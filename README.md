# Budget Tracker

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/S6S31XB030)

> 🚧 **Work in progress.** This project isn't finished yet, so features and APIs may change.

A simple personal budget tracker. Sign in, log your expenses by category, see a live spending breakdown chart, and get one-line AI feedback on whether a purchase was reasonable.

**Live:** https://hellenicdev.eu/budget-tracker/

## Features

- Account registration and login with httpOnly JWT session cookies
- Cloudflare Turnstile bot protection on auth
- Add expenses by amount and category
- Spending breakdown chart (Chart.js)
- AI feedback per expense (Llama 3.1 via Hugging Face Inference)
- Rate limiting on auth and AI endpoints; CORS restricted to an allow-list

## Tech stack

- **Frontend:** HTML, CSS, vanilla JavaScript, Chart.js (GitHub Pages)
- **Backend:** Node.js, Express 5, Mongoose, bcryptjs, jsonwebtoken, express-rate-limit
- **Database:** MongoDB
- **AI:** Hugging Face Inference router

## Setup

```bash
git clone https://github.com/hellenicdev/budget-tracker.git
cd budget-tracker/server
npm install
npm start        # API on http://localhost:3000/server
npm test         # API tests (uses an in-memory MongoDB)
```

Open `index.html` with any static server for the frontend.

### Environment variables (server)

| Name | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Session signing secret (at least 16 characters) |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret key |
| `HF_API_KEY` | Hugging Face API token for AI feedback |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (default `https://hellenicdev.eu`) |
| `NODE_ENV` | Set to `development` for non-secure local cookies |
| `PORT` | HTTP port (default 3000) |

## Project structure

```
├── index.html     # UI
├── app.js         # Frontend logic (auth, transactions, chart, AI feedback)
├── style.css
└── server/
    ├── server.js  # Express API (all routes under /server)
    └── test/      # node:test API tests
```

## License

BSD 3-Clause — see [LICENSE](LICENSE).

---

Made by [HellenicDev](https://hellenicdev.eu).
