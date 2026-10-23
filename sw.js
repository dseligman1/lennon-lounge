// Phone alerts service worker (2026-10-23). Only job: show web-push notifications sent by the
// "Phone Alerts" Action (.github/workflows/notify.yml) and open the app when one is tapped.
// Deliberately no fetch handler — it never caches or intercepts anything. Registered only when an
// admin taps "Enable on this device" in Back Office → 📲 Phone alerts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  // iOS revokes the subscription if a push arrives without a visible notification, so always show one.
  e.waitUntil(self.registration.showNotification(d.title || 'Lennon Lounge', {
    body: d.body || '',
    tag: d.tag || undefined,
    data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
    const w = wins.find(x => x.url.startsWith(self.registration.scope));
    return w ? w.focus() : self.clients.openWindow(url);
  }));
});
