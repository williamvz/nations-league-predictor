import db from '../db/database.js';

/** Insert a broadcast notification (visible to every user). */
export function broadcast(type, title, body = '') {
  db.prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (NULL, ?, ?, ?)')
    .run(type, title, body);
}

/** Insert a personal notification. */
export function notifyUser(userId, type, title, body = '') {
  db.prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)')
    .run(userId, type, title, body);
}

export function listForUser(userId, limit = 25) {
  return db.prepare(`
    SELECT n.id, n.type, n.title, n.body, n.created_at,
           CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.user_id IS NULL OR n.user_id = ?
    ORDER BY n.id DESC
    LIMIT ?
  `).all(userId, userId, limit);
}

export function markRead(userId, notificationId) {
  db.prepare('INSERT OR IGNORE INTO notification_reads (user_id, notification_id) VALUES (?, ?)')
    .run(userId, notificationId);
}

export function markAllRead(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO notification_reads (user_id, notification_id)
    SELECT ?, n.id FROM notifications n WHERE n.user_id IS NULL OR n.user_id = ?
  `).run(userId, userId);
}
