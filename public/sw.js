const CACHE_NAME = 'campussync-static-v7';
const STATIC_ASSETS = [
    '/manifest.json',
    '/styles.css',
    '/app.js',
    '/pwa.js',
    '/offline.html',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];
const STATIC_PATHS = new Set(STATIC_ASSETS);

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(cacheName => cacheName.startsWith('campussync-') && cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(() => caches.match('/offline.html'))
        );
        return;
    }

    if (!STATIC_PATHS.has(url.pathname)) return;
    event.respondWith(
        caches.match(request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;
            return fetch(request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const responseCopy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, responseCopy));
                }
                return response;
            });
        })
    );
});
