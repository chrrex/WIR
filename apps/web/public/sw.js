/* WIR · Service Worker: nur Push-Nachrichten (kein Offline-Cache, ADR-043). */
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : { title: 'WIR' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: d.url || '/' }, lang: 'de' }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data.url, self.location.origin).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin));
    return open ? open.navigate(url).then((c) => c && c.focus()) : clients.openWindow(url);
  }));
});
