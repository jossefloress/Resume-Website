// Retired service worker.
// A redesign in July 2026 registered a caching service worker. Browsers that visited then keep running it
// and could keep showing the old cached redesign. This replacement deletes those caches and unregisters
// itself, so returning visitors get the current site. Safe to delete after a few months.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
