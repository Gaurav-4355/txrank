"""
Institute of Digital Risk - Backend Assignment
Transaction API with ranking, duplicate prevention, and concurrency safety.
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from typing import Optional
import threading
import time
import math
from datetime import datetime, timezone
import uuid

app = FastAPI(title="Transaction Ranking API", version="1.0.0")

# ---------------------------------------------------------------------------
# CORS – allow all origins so the Vercel frontend can reach Render
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-Memory Data Store
# ---------------------------------------------------------------------------

# Stores all valid transactions
# { tx_id: { userId, amount, category, timestamp, idempotency_key } }
transactions: dict = {}

# Tracks per-user aggregates
# { userId: { total_amount, tx_count, last_tx_time, categories: {cat: count} } }
user_stats: dict = {}

# Idempotency key → transaction_id mapping (dedup store)
idempotency_store: dict = {}

# Global lock for all writes (ensures thread-safe concurrent updates)
_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

class TransactionRequest(BaseModel):
    userId: str
    amount: float
    category: str
    idempotency_key: str  # Client-provided unique key to prevent duplicate processing

    @field_validator("userId")
    @classmethod
    def validate_user_id(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("userId cannot be empty")
        if len(v) > 64:
            raise ValueError("userId too long (max 64 chars)")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("amount must be positive")
        if v > 1_000_000:
            raise ValueError("amount exceeds maximum allowed (1,000,000)")
        return round(v, 2)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v):
        allowed = {"food", "travel", "shopping", "health", "entertainment", "other"}
        v = v.strip().lower()
        if v not in allowed:
            raise ValueError(f"category must be one of: {', '.join(sorted(allowed))}")
        return v

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("idempotency_key cannot be empty")
        if len(v) > 128:
            raise ValueError("idempotency_key too long (max 128 chars)")
        return v


# ---------------------------------------------------------------------------
# Helper: update user aggregates (called inside lock)
# ---------------------------------------------------------------------------

def _apply_transaction_to_user(tx: dict):
    uid = tx["userId"]
    if uid not in user_stats:
        user_stats[uid] = {
            "total_amount": 0.0,
            "tx_count": 0,
            "last_tx_time": None,
            "categories": {},
        }
    stats = user_stats[uid]
    stats["total_amount"] = round(stats["total_amount"] + tx["amount"], 2)
    stats["tx_count"] += 1
    stats["last_tx_time"] = tx["timestamp"]
    cat = tx["category"]
    stats["categories"][cat] = stats["categories"].get(cat, 0) + 1


# ---------------------------------------------------------------------------
# Ranking Logic
#
# Score = w1 * norm_amount + w2 * norm_frequency + w3 * recency_score
#
# Three factors prevent simple manipulation:
#   1. total_amount  – raw spending power
#   2. tx_count      – engagement / frequency
#   3. recency       – exponential decay; old accounts can't coast on past txns
#
# Weights: amount 50 %, frequency 30 %, recency 20 %
# ---------------------------------------------------------------------------

WEIGHT_AMOUNT    = 0.50
WEIGHT_FREQUENCY = 0.30
WEIGHT_RECENCY   = 0.20
RECENCY_HALF_LIFE_DAYS = 7  # Score halves every 7 days of inactivity


def _compute_recency_score(last_tx_iso: Optional[str]) -> float:
    """Exponential decay from last transaction timestamp."""
    if last_tx_iso is None:
        return 0.0
    last_ts = datetime.fromisoformat(last_tx_iso)
    now = datetime.now(timezone.utc)
    days_ago = (now - last_ts).total_seconds() / 86400
    return math.exp(-math.log(2) * days_ago / RECENCY_HALF_LIFE_DAYS)


def _build_ranking() -> list:
    if not user_stats:
        return []

    # Collect raw values
    rows = []
    for uid, stats in user_stats.items():
        rows.append({
            "userId": uid,
            "total_amount": stats["total_amount"],
            "tx_count": stats["tx_count"],
            "last_tx_time": stats["last_tx_time"],
            "recency_score": _compute_recency_score(stats["last_tx_time"]),
            "top_category": max(stats["categories"], key=stats["categories"].get)
                            if stats["categories"] else "N/A",
        })

    # Min-max normalise amount and frequency
    amounts = [r["total_amount"] for r in rows]
    counts  = [r["tx_count"]     for r in rows]

    max_amount = max(amounts) or 1
    max_count  = max(counts)  or 1

    for r in rows:
        norm_amount = r["total_amount"] / max_amount
        norm_freq   = r["tx_count"]    / max_count
        norm_rec    = r["recency_score"]  # already in [0,1]

        r["score"] = round(
            WEIGHT_AMOUNT    * norm_amount +
            WEIGHT_FREQUENCY * norm_freq   +
            WEIGHT_RECENCY   * norm_rec,
            4,
        )

    rows.sort(key=lambda x: x["score"], reverse=True)

    result = []
    for rank, r in enumerate(rows, start=1):
        result.append({
            "rank": rank,
            "userId": r["userId"],
            "score": r["score"],
            "total_amount": r["total_amount"],
            "tx_count": r["tx_count"],
            "top_category": r["top_category"],
            "last_tx_time": r["last_tx_time"],
        })
    return result


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Transaction Ranking API is live.", "version": "1.0.0"}


@app.post("/transaction", status_code=201)
def post_transaction(body: TransactionRequest):
    """
    Record a transaction.
    - Validates all fields.
    - Uses idempotency_key to detect and reject duplicate submissions.
    - Acquires a global lock before writing to prevent race conditions.
    """
    with _lock:
        # --- Duplicate detection ---
        if body.idempotency_key in idempotency_store:
            existing_tx_id = idempotency_store[body.idempotency_key]
            existing_tx    = transactions[existing_tx_id]
            return JSONResponse(
                status_code=200,
                content={
                    "status": "duplicate",
                    "message": "Transaction already processed (idempotency_key seen before).",
                    "transaction": existing_tx,
                },
            )

        # --- Abuse guard: rate-limit per user (max 10 txns per minute) ---
        if body.userId in user_stats:
            recent_user_txns = [
                tx for tx in transactions.values()
                if tx["userId"] == body.userId
                and (time.time() - datetime.fromisoformat(tx["timestamp"]).timestamp()) < 60
            ]
            if len(recent_user_txns) >= 10:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded: max 10 transactions per minute per user.",
                )

        # --- Commit transaction ---
        tx_id = str(uuid.uuid4())
        tx = {
            "tx_id": tx_id,
            "userId": body.userId,
            "amount": body.amount,
            "category": body.category,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "idempotency_key": body.idempotency_key,
        }
        transactions[tx_id] = tx
        idempotency_store[body.idempotency_key] = tx_id
        _apply_transaction_to_user(tx)

    return {"status": "success", "transaction": tx}


@app.get("/summary/{userId}")
def get_summary(userId: str):
    """
    Return aggregate summary and full transaction history for a user.
    """
    userId = userId.strip()
    if not userId:
        raise HTTPException(status_code=400, detail="userId cannot be empty.")

    if userId not in user_stats:
        raise HTTPException(status_code=404, detail=f"No transactions found for user '{userId}'.")

    stats = user_stats[userId]
    user_txns = sorted(
        [tx for tx in transactions.values() if tx["userId"] == userId],
        key=lambda x: x["timestamp"],
        reverse=True,
    )

    avg_amount = round(stats["total_amount"] / stats["tx_count"], 2) if stats["tx_count"] else 0

    return {
        "userId": userId,
        "summary": {
            "total_amount": stats["total_amount"],
            "tx_count": stats["tx_count"],
            "avg_amount": avg_amount,
            "top_category": max(stats["categories"], key=stats["categories"].get)
                            if stats["categories"] else None,
            "category_breakdown": stats["categories"],
            "last_tx_time": stats["last_tx_time"],
            "recency_score": round(_compute_recency_score(stats["last_tx_time"]), 4),
        },
        "transactions": user_txns,
    }


@app.get("/ranking")
def get_ranking():
    """
    Return leaderboard ranked by composite score:
      50% total_amount + 30% tx_frequency + 20% recency
    """
    ranking = _build_ranking()
    return {
        "ranking": ranking,
        "scoring_weights": {
            "total_amount": f"{int(WEIGHT_AMOUNT*100)}%",
            "frequency":    f"{int(WEIGHT_FREQUENCY*100)}%",
            "recency":      f"{int(WEIGHT_RECENCY*100)}%",
        },
        "recency_half_life_days": RECENCY_HALF_LIFE_DAYS,
    }


# ---------------------------------------------------------------------------
# Global error handler — always return JSON, never HTML stack traces
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )
