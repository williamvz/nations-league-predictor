// Web Push (PWA) notifications. Maintenance-free by design: the VAPID key
// pair is generated once at first boot and stored in the settings table, so
// there is nothing to configure. Requires a secure context in the browser
// (HTTPS or the HA ingress URL); the frontend hides the toggle otherwise.
import webpush from 'web-push';
import db, { getSetting, setSetting } from '../db/database.js';

let configured = false;

export function initPush() {
  let publicKey = getSetting('vapid_public');
  let privateKey = getSetting('vapid_private');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
    console.log('🔑 VAPID-sleutels voor webpush gegenereerd');
  }
  webpush.setVapidDetails('mailto:beheerder@nlpool.local', publicKey, privateKey);
  configured = true;
  return publicKey;
}

export function getPublicKey() {
  if (!configured) initPush();
  return getSetting('vapid_public');
}

export function saveSubscription(userId, subscription) {
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, keys_json) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json
  `).run(userId, subscription.endpoint, JSON.stringify(subscription.keys || {}));
}

export function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

export function subscriptionCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId).n;
}

/**
 * Send a push to specific users (array of ids) or to everyone (null).
 * Dead subscriptions (404/410) are pruned automatically. Fire-and-forget.
 */
export async function sendPush(userIds, { title, body, url = './' }) {
  if (!configured) initPush();
  let rows;
  if (userIds === null) {
    rows = db.prepare('SELECT * FROM push_subscriptions').all();
  } else if (userIds.length === 0) {
    return { sent: 0 };
  } else {
    rows = db.prepare(
      `SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`
    ).all(...userIds);
  }

  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  await Promise.allSettled(rows.map(async (row) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: JSON.parse(row.keys_json) },
        payload,
        { TTL: 12 * 3600 }
      );
      sent += 1;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      }
    }
  }));
  return { sent, total: rows.length };
}

export function adminUserIds() {
  return db.prepare("SELECT id FROM users WHERE is_admin = 1 AND status = 'active'").all().map((r) => r.id);
}
