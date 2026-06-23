import React, { useState } from 'react';
import { getSummary } from '../api';

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

function relTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Summary({ showToast }) {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetch = async () => {
    const uid = userId.trim();
    if (!uid) return showToast('Enter a userId', 'error');
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const res = await getSummary(uid);
      if (res.status === 404) {
        setError(`No transactions found for "${uid}"`);
        showToast('User not found', 'error');
      } else if (res.status >= 400) {
        setError(res.data?.detail || 'Request failed');
        showToast('Error fetching summary', 'error');
      } else {
        setData(res.data);
      }
    } catch {
      setError('Network error — is the backend running?');
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const s = data?.summary;

  return (
    <div>
      <div className="card">
        <p className="card-title">User Summary</p>
        <div className="search-row">
          <input
            placeholder="Enter userId (e.g. alice)"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetch()}
          />
          <button className="btn btn-secondary" onClick={fetch} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Fetch'}
          </button>
        </div>

        {error && (
          <div className="response-box error">
            <p className="response-label">✕ Error</p>
            <p className="response-body">{error}</p>
          </div>
        )}

        {s && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">₹{fmt(s.total_amount)}</div>
                <div className="stat-label">Total Spent</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{s.tx_count}</div>
                <div className="stat-label">Transactions</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">₹{fmt(s.avg_amount)}</div>
                <div className="stat-label">Avg Amount</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ textTransform: 'capitalize', fontSize: 18 }}>
                  {s.top_category || '—'}
                </div>
                <div className="stat-label">Top Category</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{relTime(s.last_tx_time)}</div>
                <div className="stat-label">Last Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{(s.recency_score * 100).toFixed(1)}%</div>
                <div className="stat-label">Recency Score</div>
              </div>
            </div>

            {/* Category breakdown */}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Category Breakdown
            </p>
            <div className="cat-pills">
              {Object.entries(s.category_breakdown).map(([cat, count]) => (
                <span className="cat-pill" key={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  <span>{count}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Transaction history */}
      {data?.transactions?.length > 0 && (
        <div className="card">
          <p className="card-title">Transaction History ({data.transactions.length})</p>
          <div className="tx-list">
            {data.transactions.map(tx => (
              <div className="tx-item" key={tx.tx_id}>
                <div className="tx-left">
                  <span className="tx-id">{tx.tx_id.slice(0, 18)}…</span>
                  <span className="tx-cat">{tx.category}</span>
                </div>
                <div className="tx-right">
                  <div className="tx-amount">₹{fmt(tx.amount)}</div>
                  <div className="tx-time">{relTime(tx.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
