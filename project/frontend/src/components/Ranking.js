import React, { useState, useEffect } from 'react';
import { getRanking } from '../api';

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Ranking({ showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchRanking = async () => {
    setLoading(true);
    try {
      const res = await getRanking();
      if (res.status >= 400) showToast('Failed to load ranking', 'error');
      else setData(res.data);
    } catch {
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRanking(); }, []); // eslint-disable-line

  const ranking = data?.ranking || [];
  const weights = data?.scoring_weights;
  const maxScore = ranking.length ? ranking[0].score : 1;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p className="card-title" style={{ marginBottom: 0 }}>Leaderboard</p>
          <button className="btn btn-secondary refresh-btn" onClick={fetchRanking} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻ Refresh'}
          </button>
        </div>

        {/* Scoring weights */}
        {weights && (
          <div className="rank-weights">
            <span className="weight-chip">Amount <strong>{weights.total_amount}</strong></span>
            <span className="weight-chip">Frequency <strong>{weights.frequency}</strong></span>
            <span className="weight-chip">Recency <strong>{weights.recency}</strong></span>
            <span className="weight-chip" style={{ fontSize: 11 }}>
              Recency half-life: <strong>{data.recency_half_life_days}d</strong>
            </span>
          </div>
        )}

        {ranking.length === 0 && !loading && (
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <p className="empty-text">No transactions yet — submit one to see the leaderboard.</p>
          </div>
        )}

        <div className="rank-list">
          {ranking.map(entry => (
            <div
              key={entry.userId}
              className={`rank-item ${entry.rank <= 3 ? `rank-${entry.rank}` : ''}`}
            >
              {/* Position */}
              <div className="rank-pos">
                {entry.rank <= 3
                  ? MEDALS[entry.rank - 1]
                  : <span className="rank-pos-other">#{entry.rank}</span>}
              </div>

              {/* Info */}
              <div className="rank-info">
                <div className="rank-user">{entry.userId}</div>
                <div className="rank-meta">
                  ₹{fmt(entry.total_amount)} &nbsp;·&nbsp; {entry.tx_count} tx &nbsp;·&nbsp;
                  <span style={{ textTransform: 'capitalize' }}>{entry.top_category}</span>
                </div>
                <div className="score-bar-wrap">
                  <div
                    className="score-bar"
                    style={{ width: `${(entry.score / maxScore) * 100}%` }}
                  />
                </div>
              </div>

              {/* Score */}
              <div className="rank-score">
                <div className="score-value">{(entry.score * 100).toFixed(1)}</div>
                <div className="score-label">score</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explanation card */}
      <div className="card">
        <p className="card-title">How scoring works</p>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 12 }}>
            Each user's composite score is calculated across three factors to prevent gaming the system by a single metric:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', minWidth: 32 }}>50%</span>
              <span><strong style={{ color: 'var(--text)' }}>Total Amount</strong> — normalised spending vs the highest spender.</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', minWidth: 32 }}>30%</span>
              <span><strong style={{ color: 'var(--text)' }}>Frequency</strong> — how active the user is vs the most frequent transactor.</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--accent2)', fontFamily: 'var(--font-mono)', minWidth: 32 }}>20%</span>
              <span><strong style={{ color: 'var(--text)' }}>Recency</strong> — exponential decay (half-life 7 days); old users drop over time.</span>
            </div>
          </div>
          <p style={{ marginTop: 12 }}>
            Rate limiting (10 tx/min per user) prevents burst-spamming to inflate the frequency or amount components.
          </p>
        </div>
      </div>
    </div>
  );
}
