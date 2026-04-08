const CACHE_NAME = 'tahfidz-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
];

// CDN pihak ketiga
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

// ── INSTALL: pre-cache semua aset lokal + CDN ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Cache aset lokal (same-origin, aman)
      await cache.addAll(ASSETS);

      // Cache CDN tanpa mode no-cors agar response bisa dibaca
      await Promise.all(
        CDN_ASSETS.map(url =>
          fetch(url)
            .then(res => {
              if (res && res.ok) {
                return cache.put(url, res);
              }
              console.warn('[SW] Gagal cache CDN (status tidak OK):', url, res?.status);
            })
            .catch(err => console.warn('[SW] Gagal fetch CDN:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: hapus cache lama ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Hapus cache lama:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: strategi per tipe request ──
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Abaikan request non-GET
  if (request.method !== 'GET') return;

  // Abaikan protokol non-http
  if (!url.protocol.startsWith('http')) return;

  const isCDN = url.hostname === 'cdnjs.cloudflare.com';

  if (isCDN) {
    // CDN: cache-first → jika tidak ada, fetch lalu simpan
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          return cached;
        }
        return fetch(request).then(res => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, res.clone()));
          }
          return res;
        }).catch(() => {
          console.warn('[SW] CDN offline dan tidak ada cache:', request.url);
          // Fallback: coba kembalikan response kosong agar tidak crash
          return new Response('', { status: 200, statusText: 'OK' });
        });
      })
    );
    return;
  }

  // Aset lokal: cache-first → fallback network → fallback index.html
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => {
        // Jika request adalah navigasi (halaman), kembalikan index.html
        if (request.destination === 'document') {
          return caches.match('./index.html');
        }
        // Untuk request lain (gambar, css, js) kembalikan 404
        return new Response('Not Found', { status: 404 });
      });
    })
  );
});

// ── MESSAGE: trigger skip waiting dari halaman ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});