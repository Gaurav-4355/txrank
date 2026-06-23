// Change this to your Render backend URL after deploying
const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export async function postTransaction(data) {
  const res = await fetch(`${BASE_URL}/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  return { status: res.status, data: json };
}

export async function getSummary(userId) {
  const res = await fetch(`${BASE_URL}/summary/${encodeURIComponent(userId)}`);
  const json = await res.json();
  return { status: res.status, data: json };
}

export async function getRanking() {
  const res = await fetch(`${BASE_URL}/ranking`);
  const json = await res.json();
  return { status: res.status, data: json };
}
