// ── 金門旅遊行程 Service Worker ──────────────────────────────
const CACHE_NAME = 'kinmen-travel-v1';

// 需要快取的靜態資源
const STATIC_ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@300;400;600;700;900&family=Noto+Sans+TC:wght@300;400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
];

// 不快取的網域（即時資料）
const BYPASS_HOSTS = [
  'api.open-meteo.com',   // 天氣 API
  'maps.google.com',      // Google Maps
  'maps.app.goo.gl',      // Maps 短網址
];

// ── 安裝：快取靜態資源 ────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function() {
        // 部分資源快取失敗不影響整體安裝
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// ── 啟動：清除舊版快取 ───────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// ── 攔截請求：Cache First（靜態）/ Network Only（即時）────────
self.addEventListener('fetch', function(event) {
  var url;
  try { url = new URL(event.request.url); } catch(e) { return; }

  // 即時資料：直接走網路，不快取
  if(BYPASS_HOSTS.some(function(h){ return url.hostname.includes(h); })) {
    return; // 讓瀏覽器自己處理
  }

  // Google Fonts / CDN：Network First，失敗時用快取
  if(url.hostname.includes('fonts.googleapis.com') ||
     url.hostname.includes('fonts.gstatic.com') ||
     url.hostname.includes('cdnjs.cloudflare.com') ||
     url.hostname.includes('kinmen.travel')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if(response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 主 HTML：Network First，離線時用快取
  if(url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function() {
          return caches.match(event.request) ||
                 caches.match('./index.html');
        })
    );
    return;
  }

  // 其他：Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if(response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
