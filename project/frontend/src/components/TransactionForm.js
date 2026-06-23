import React, { useState } from 'react';
import { postTransaction } from '../api';

const CATEGORIES = ['food', 'travel', 'shopping', 'health', 'entertainment', 'other'];

function genKey() {
  return 'idem-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
}

export default function TransactionForm({ showToast }) {
  const [form, setForm] = useState({
    userId: '',
    amount: '',
    category: 'food',
    idempotency_key: genKey(),
  });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const regenerateKey = () => setForm(f => ({ ...f, idempotency_key: genKey() }));

  const handleSubmit = async () => {
    if (!form.userId.trim()) return showToast('userId is required', 'error');
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) return showToast('Enter a valid positive amount', 'error');

    setLoading(true);
    setResponse(null);
    try {
      const result = await postTransaction({
        userId: form.userId.trim(),
        amount: amt,
        category: form.category,
        idempotency_key: form.idempotency_key,
      });

      const isDuplicate = result.data?.status === 'duplicate';
      const isError = result.status >= 400;

      setResponse({
        type: isError ? 'error' : isDuplicate ? 'duplicate' : 'success',
        json: JSON.stringify(result.data, null, 2),
      });

      if (isError) showToast(result.data?.detail || 'Request failed', 'error');
      else if (isDuplicate) showToast('Duplicate — already processed', 'error');
      else {
        showToast('Transaction recorded!', 'success');
        // Auto-regenerate idempotency key for next submission
        regenerateKey();
      }
    } catch {
      setResponse({ type: 'error', json: 'Network error — is the backend running?' });
      showToast('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="card">
        <p className="card-title">New Transaction</p>

        <div className="form-grid">
          <div className="field">
            <label>User ID</label>
            <input
              placeholder="e.g. alice"
              value={form.userId}
              onChange={set('userId')}
            />
          </div>

          <div className="field">
            <label>Amount (₹)</label>
            <input
              type="number"
              placeholder="e.g. 1500"
              min="0.01"
              max="1000000"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
            />
          </div>

          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Idempotency Key</label>
            <input
              value={form.idempotency_key}
              onChange={set('idempotency_key')}
            />
            <span className="field-hint">
              Auto-generated · same key = duplicate blocked
            </span>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Submit Transaction'}
        </button>
      </div>

      {/* Test duplicate button */}
      <div className="card">
        <p className="card-title">Test Duplicate Prevention</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Click "Submit Transaction" above twice without changing the idempotency key — the second attempt will be blocked.
          Or use the button below to deliberately resubmit the last key.
        </p>
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={handleSubmit}
        >
          Re-submit same key (triggers duplicate)
        </button>
      </div>

      {response && (
        <div className={`response-box ${response.type}`}>
          <p className="response-label">
            {response.type === 'success' ? '✓ Success'
              : response.type === 'duplicate' ? '⚠ Duplicate Blocked'
              : '✕ Error'}
          </p>
          <pre className="response-body">{response.json}</pre>
        </div>
      )}
    </div>
  );
}
