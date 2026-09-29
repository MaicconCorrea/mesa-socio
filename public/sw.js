// Service worker da Mesa do Sócio (permite instalar como app; notificações push entram na próxima versão)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    for (const c of lista) if ("focus" in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow("/whatsapp");
  }));
});
