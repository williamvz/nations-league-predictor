// API base is derived from the page URL, so the same build works on
// http://pi:8099/ and behind Home Assistant ingress
// (https://ha/api/hassio_ingress/<token>/). Never use absolute '/api'.
const API_BASE = new URL('api/', document.baseURI).href.replace(/\/$/, '');

const TOKEN_KEY = 'nlpool_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) {
    throw new Error(data?.error || `Er ging iets mis (${res.status})`);
  }
  // successful writes may unlock achievements or create notifications —
  // let the layout refresh its bell/popup immediately instead of waiting
  // for the next 60s poll
  if (method !== 'GET' && !path.startsWith('/notifications') && !path.startsWith('/achievements')) {
    window.dispatchEvent(new Event('nlpool:activity'));
  }
  return data;
}

export const api = {
  meta: () => request('/meta'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  updateMe: (payload) => request('/auth/me', { method: 'PUT', body: payload }),
  changePassword: (current_password, new_password) =>
    request('/auth/password', { method: 'PUT', body: { current_password, new_password } }),

  matches: () => request('/matches'),
  match: (id) => request(`/matches/${id}`),
  upcoming: () => request('/matches/upcoming'),
  live: () => request('/matches/live'),
  predict: (match_id, home_goals, away_goals, is_joker) =>
    request('/predictions', { method: 'POST', body: { match_id, home_goals, away_goals, is_joker } }),
  predictionSummary: () => request('/predictions/summary'),

  leaderboard: () => request('/leaderboard'),
  leaderboardHistory: () => request('/leaderboard/history'),
  compare: (otherId) => request(`/leaderboard/compare/${otherId}`),

  standings: () => request('/standings'),
  scorers: () => request('/standings/scorers'),
  teamInsights: (id) => request(`/standings/team/${id}`),

  bonus: () => request('/bonus'),
  answerBonus: (questionId, body) => request(`/bonus/${questionId}`, { method: 'POST', body }),

  achievements: () => request('/achievements'),
  unseenAchievements: () => request('/achievements/unseen'),
  markAchievementsSeen: () => request('/achievements/seen', { method: 'POST' }),

  pushKey: () => request('/push/key'),
  pushSubscribe: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
  pushUnsubscribe: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  pushTest: () => request('/push/test', { method: 'POST' }),

  notifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),

  admin: {
    dashboard: () => request('/admin/dashboard'),
    users: () => request('/admin/users'),
    createUser: (body) => request('/admin/users', { method: 'POST', body }),
    approveUser: (id) => request(`/admin/users/${id}/approve`, { method: 'POST' }),
    rejectUser: (id) => request(`/admin/users/${id}/reject`, { method: 'POST' }),
    updateUser: (id, body) => request(`/admin/users/${id}`, { method: 'PUT', body }),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    setResult: (id, home_score, away_score, winner_team_id) =>
      request(`/admin/matches/${id}/result`, { method: 'PUT', body: { home_score, away_score, winner_team_id } }),
    resetMatch: (id) => request(`/admin/matches/${id}/reset`, { method: 'PUT' }),
    syncLog: () => request('/admin/sync/log'),
    runSync: () => request('/admin/sync/run', { method: 'POST' }),
    settings: (body) => request('/admin/settings', { method: 'PUT', body }),
    broadcast: (body) => request('/admin/broadcast', { method: 'POST', body }),
    addScorer: (body) => request('/admin/scorers', { method: 'POST', body }),
  },
};
