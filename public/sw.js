// CHATice Service Worker — handles background push notifications
const CACHE = 'chatice-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Handle push events (when tab is closed / backgrounded)
self.addEventListener('push', event => {
  const data = event.data?.json?.() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CHATice', {
      body: data.body ?? 'New message',
      icon: data.icon ?? '/logo.png',
      badge: '/logo.png',
      tag: data.tag ?? 'chatice-msg',
      data: { url: data.url ?? '/' },
    })
  );
});

// Click notification → focus or open the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
