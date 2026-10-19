// Service worker: приложение открывается сразу из памяти телефона, в том числе без интернета.
// При ЛЮБОМ изменении файлов приложения увеличьте VERSION: браузер увидит новый sw.js,
// в фоне скачает свежие файлы, и со следующего открытия заработает новая версия.
const VERSION = 'v1.4.0';
const SHELL = `shell-${VERSION}`;
const CDN = 'cdn-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/favicon-64.png',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/config.js',
  'js/lib/preact.js',
  'js/lib/dates.js',
  'js/lib/money.js',
  'js/lib/budget.js',
  'js/lib/voice-parse.js',
  'js/data/store.js',
  'js/data/local.js',
  'js/data/firebase.js',
  'js/ui/common.js',
  'js/ui/tx-sheet.js',
  'js/ui/envelope-sheet.js',
  'js/ui/summary-sheet.js',
  'js/ui/income-sheet.js',
  'js/ui/allocate-sheet.js',
  'js/ui/purchase-sheet.js',
  'js/ui/shop-sheet.js',
  'js/ui/voice-card.js',
  'js/screens/shops.js',
  'js/screens/home.js',
  'js/screens/history.js',
  'js/screens/savings.js',
  'js/screens/settings.js',
  'js/screens/onboarding.js',
  'js/screens/login.js',
];

const SHELL_PATHS = new Set(SHELL_FILES.map((f) => new URL(f, self.location).pathname));

// Библиотеки с CDN (версии зафиксированы, поэтому их можно кэшировать навсегда)
const CDN_HOSTS = ['unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  // cache: 'reload' — берём файлы с сервера, а не из HTTP-кэша браузера (GitHub Pages держит его 10 минут)
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== CDN).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Библиотеки: сначала кэш
  if (CDN_HOSTS.includes(url.hostname) && /\/(htm@|firebasejs\/)/.test(url.pathname)) {
    e.respondWith(
      caches.open(CDN).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return; // Firestore, Auth и пр. — напрямую

  // Свои файлы: сначала память телефона — запуск мгновенный и не зависит от связи.
  // Свежие версии приходят вместе с новым sw.js (см. VERSION).
  e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const shell = await caches.match('index.html');
    if (shell) return shell;
  }
  try {
    const res = await fetch(req);
    if (res.ok && SHELL_PATHS.has(new URL(req.url).pathname)) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
    }
    return res;
  } catch {
    return Response.error();
  }
}
