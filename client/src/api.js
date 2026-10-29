// Small fetch wrapper for the REST API. Stores the login token in localStorage.
const API_URL = (import.meta.env && import.meta.env.VITE_API_URL) || '';
const BASE = `${API_URL}/api`;
const TOKEN_KEY = 'studyplanner_token';

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let token = readToken();
let onUnauthorized = null;

export function setToken(value) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: keep the token in memory only */
  }
}

export const hasToken = () => Boolean(token);
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && token && onUnauthorized) onUnauthorized();
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.fields = (data && data.fields) || {};
    throw err;
  }
  return data;
}
