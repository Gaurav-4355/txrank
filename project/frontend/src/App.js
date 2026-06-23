import React, { useState, useCallback } from 'react';
import TransactionForm from './components/TransactionForm';
import Summary from './components/Summary';
import Ranking from './components/Ranking';
import './App.css';

const TABS = [
  { id: 'transaction', label: 'Post Transaction', icon: '⟶' },
  { id: 'summary',     label: 'User Summary',     icon: '◈' },
  { id: 'ranking',     label: 'Leaderboard',      icon: '◆' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('transaction');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">Tx</span>
            <span className="logo-text">RANK</span>
          </div>
          <p className="header-sub">Transaction · Summary · Leaderboard</p>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="main-content">
        {activeTab === 'transaction' && <TransactionForm showToast={showToast} />}
        {activeTab === 'summary'     && <Summary showToast={showToast} />}
        {activeTab === 'ranking'     && <Ranking showToast={showToast} />}
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
