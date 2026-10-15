// Service worker: приложение открывается без интернета.
// При изменении файлов приложения увеличьте VERSION, чтобы телефоны получили обновление.
const VERSION = 'v1.3.0';
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

// Библиотеки с CDN (версии зафиксированы, поэтому их можно кэшировать навсегда)
const CDN_HOSTS = ['unpkg.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
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

  // Свои файлы: сеть (не дольше 3 секунд), иначе кэш. Обновления приходят сразу,
  // а в магазине со слабой связью приложение не зависает на загрузке.
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const fromCache = () =>
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  // no-cache: сверяемся с сервером (GitHub Pages иначе отдаёт файлы из HTTP-кэша до 10 минут).
  // Для навигации нельзя пересоздать Request с параметрами, поэтому берём URL.
  const network = fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    const res = await Promise.race([network, timeout.then(fromCache)]);
    if (res) return res;
  } catch {
    /* нет сети */
  }
  return (await fromCache()) || network.catch(() => Response.error());
}
