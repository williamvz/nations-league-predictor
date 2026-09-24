// Shared test harness: throwaway database + the real Express app on an
// ephemeral port, with a tiny JSON client. Import this BEFORE any src module
// (it sets DB_PATH and secrets through the environment).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function useTempDb(prefix = 'nlpool-') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DB_PATH = path.join(tmp, 'test.db');
  process.env.JWT_SECRET ||= 'test-secret';
  process.env.ADMIN_PASSWORD ||= 'admin-pw-123';
  return tmp;
}

/** Start the full app; returns { url, call, close }. */
export async function startApp() {
  const { seed } = await import('../src/db/seed.js');
  seed();
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;

  async function call(method, route, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${url}/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, data };
  }
  const close = () => new Promise((r) => server.close(r));
  return { url, call, close };
}
