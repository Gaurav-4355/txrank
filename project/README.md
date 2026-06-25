# Transaction Ranking System

A backend service + live frontend for recording transactions, summarising user activity, and ranking users via a multi-factor composite score.

Live Frontend: https://txrank.vercel.app
Backend API:  https://txrank.onrender.com
video link:  https://www.loom.com/share/13ee678548874743b5c1be83502be09c

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Frontend | React 18, plain CSS |
| Backend Hosting | Render |
| Frontend Hosting | Vercel |

---

## Running Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
API available at `http://localhost:8000`  
Docs at `http://localhost:8000/docs`

### Frontend
```bash
cd frontend
# Create a .env.local file:
echo "REACT_APP_API_URL=http://localhost:8000" > .env.local
npm install
npm start
```
Frontend at `http://localhost:3000`

---

## API Reference

### `POST /transaction`

Records a new transaction for a user.

**Request body:**
```json
{
  "userId": "alice",
  "amount": 1500.00,
  "category": "shopping",
  "idempotency_key": "idem-abc123"
}
```

**Validation rules:**
- `userId` — non-empty string, max 64 chars
- `amount` — positive float, max 1,000,000
- `category` — one of: `food`, `travel`, `shopping`, `health`, `entertainment`, `other`
- `idempotency_key` — non-empty string, max 128 chars

**Responses:**
- `201 Created` — new transaction recorded
- `200 OK` with `status: "duplicate"` — idempotency key already seen; returns original transaction
- `400` — validation error
- `422` — malformed request body
- `429` — rate limit exceeded (max 10 tx/minute per user)

---

### `GET /summary/:userId`

Returns aggregate stats and full transaction history for a user.

**Response:**
```json
{
  "userId": "alice",
  "summary": {
    "total_amount": 4500.00,
    "tx_count": 3,
    "avg_amount": 1500.00,
    "top_category": "shopping",
    "category_breakdown": { "shopping": 2, "food": 1 },
    "last_tx_time": "2026-06-24T10:00:00+00:00",
    "recency_score": 0.9772
  },
  "transactions": [ ... ]
}
```

- `404` if userId has no transactions.

---

### `GET /ranking`

Returns a leaderboard of all users sorted by composite score.

**Response:**
```json
{
  "ranking": [
    {
      "rank": 1,
      "userId": "alice",
      "score": 0.8541,
      "total_amount": 4500.00,
      "tx_count": 3,
      "top_category": "shopping",
      "last_tx_time": "2026-06-24T10:00:00+00:00"
    }
  ],
  "scoring_weights": {
    "total_amount": "50%",
    "frequency": "30%",
    "recency": "20%"
  },
  "recency_half_life_days": 7
}
```

---

## Ranking Formula

```
score = 0.50 × norm_amount + 0.30 × norm_frequency + 0.20 × recency_score
```

| Factor | Weight | Description |
|---|---|---|
| `total_amount` | 50% | User's total spending / max spender's total (min-max normalised) |
| `tx_count` | 30% | User's transaction count / max count (min-max normalised) |
| `recency_score` | 20% | `exp(-ln(2) × days_since_last_tx / 7)` — halves every 7 days |

**Why three factors?**
- Spending alone can be gamed by one large transaction.
- Frequency alone rewards spam.
- Recency prevents old users from permanently dominating the leaderboard.
- The rate limit (10 tx/min/user) adds a hard ceiling on burst manipulation.

---

## Duplicate Request Prevention

Each `POST /transaction` requires a client-supplied `idempotency_key`.

1. Before writing, the backend checks if the key exists in `idempotency_store`.
2. If found → returns `200` with the **original transaction** (idempotent response).
3. If new → proceeds to commit the transaction and registers the key.

This means retrying a failed network request is safe — it will never double-count.

---

## Concurrency Safety

All write operations (transaction commit + user stat update) are wrapped in a single `threading.Lock`. This ensures that two simultaneous requests for the same user cannot produce inconsistent aggregates (e.g. both reading `total_amount = 0` and both writing `total_amount = 500` instead of `1000`).

---

## Data Model (In-Memory)

```
transactions:       { tx_id  → Transaction object }
user_stats:         { userId → { total_amount, tx_count, last_tx_time, categories } }
idempotency_store:  { idempotency_key → tx_id }
```

No database is used. All state resets when the server restarts.  
**Assumption:** For this assignment, in-memory storage is sufficient. In production, these would be PostgreSQL tables with a unique index on `idempotency_key`.

---

## Deploying to Render + Vercel

### Backend → Render
1. Push `backend/` to a GitHub repo.
2. Create a new **Web Service** on Render, point to the repo.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
1. Push `frontend/` to a GitHub repo.
2. Import on Vercel, framework preset = **Create React App**.
3. Add environment variable: `REACT_APP_API_URL=https://<your-render-url>`
4. Deploy.

---

## Assumptions & Trade-offs

| Decision | Rationale |
|---|---|
| In-memory store | No DB setup needed; fast for demo; resets on restart |
| Global threading lock | Simple and correct; would use DB transactions in production |
| Idempotency key from client | Industry-standard pattern (Stripe, etc.); gives client control |
| Rate limit: 10 tx/min/user | Prevents leaderboard manipulation; threshold is tunable |
| Recency half-life: 7 days | Keeps leaderboard fresh without punishing brief inactivity |
