// Bridge to Home Assistant. When running as an HA add-on the Supervisor
// injects SUPERVISOR_TOKEN and proxies the Core API on http://supervisor.
// With ha_notify_service set (e.g. "notify.mobile_app_telefoon_william")
// events land directly on the admin's phone via the companion app; without
// it we fall back to a persistent notification in the HA dashboard.
// Outside Home Assistant this is a silent no-op.

export function haAvailable() {
  return Boolean(process.env.SUPERVISOR_TOKEN);
}

/**
 * Fire an event on the Home Assistant event bus (e.g. nlpool_goal), so the
 * user can build automations — flash the lights orange when Nederland
 * scores. Silent no-op outside HA.
 */
export async function fireHomeAssistantEvent(eventType, payload = {}) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`http://supervisor/core/api/events/${eventType}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HA antwoordde ${res.status}`);
    return true;
  } catch (err) {
    console.error(`⚠️ HA-event ${eventType} mislukt:`, err.message);
    return false;
  }
}

export async function notifyHomeAssistant(title, message) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) return false;

  const configured = (process.env.HA_NOTIFY_SERVICE || '').trim();
  const [domain, service] = configured.includes('.')
    ? configured.split('.', 2)
    : ['persistent_notification', 'create'];

  try {
    const res = await fetch(`http://supervisor/core/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, message }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HA antwoordde ${res.status}`);
    return true;
  } catch (err) {
    console.error(`⚠️ Home Assistant-notificatie mislukt (${domain}.${service}):`, err.message);
    return false;
  }
}
