// Service worker simples: app abre offline e atualiza em segundo plano.
const CACHE = 'leve-v2';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/icon.svg', '/icon-192.png', '/manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Só arquivos do app e fontes: dados do Supabase sempre vão direto à rede
  const { origin } = new URL(req.url);
  if (origin !== self.location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(new URL(req.url).hostname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// Lembrete enviado pelo servidor (chega mesmo com o app fechado)
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data && e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Leve', {
      body: d.body || '',
      tag: d.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: d.data || {},
    }),
  );
});

// Toque num lembrete: traz o app para a frente e abre a tarefa
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list[0];
      if (client) {
        client.postMessage({ type: 'open-task', taskId: data.taskId, date: data.date });
        return client.focus();
      }
      const q = data.taskId ? `/?task=${encodeURIComponent(data.taskId)}${data.date ? `&date=${data.date}` : ''}` : '/';
      return self.clients.openWindow(q);
    }),
  );
});
