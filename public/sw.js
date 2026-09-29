// Service worker da Mesa do Sócio: instala como app e recebe avisos (push) mesmo com a Mesa fechada.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let d = { titulo: "Mesa do Sócio", corpo: "Você tem uma novidade.", url: "/", tag: "mesa" };
  try { d = { ...d, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.corpo, icon: "/icone-192.png", badge: "/icone-192.png", data: { url: d.url }, tag: d.tag, renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
    if (url.startsWith("/")) {
      for (const c of lista) if ("navigate" in c && "focus" in c) return c.navigate(url).then((w) => (w || c).focus());
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
