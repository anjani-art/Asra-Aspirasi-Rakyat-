// Nama cache
const CACHE_NAME = 'asra-cache-v1';

// Daftar aset yang akan di-cache saat instalasi
// Ini adalah file-file penting yang membuat aplikasi berjalan bahkan offline
const urlsToCache = [
  './', // Cache root (index.html)
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'icon-192x192.png',
  'icon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Open+Sans:wght@400;600;700&display=swap', // Google Fonts
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css' // Font Awesome CSS
];

// Event: install (Ketika Service Worker pertama kali diinstal)
self.addEventListener('install', event => {
  console.log('Service Worker: Menginstal...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Meng-cache file utama.');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Gagal meng-cache file:', error);
      })
  );
});

// Event: fetch (Ketika browser mencoba mengambil aset)
self.addEventListener('fetch', event => {
  // Hanya tangani permintaan HTTP/HTTPS, abaikan chrome-extension:// dan sejenisnya
  if (event.request.url.startsWith('http') || event.request.url.startsWith('https')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // Jika aset ada di cache, gunakan itu
          if (response) {
            return response;
          }
          // Jika tidak ada di cache, ambil dari jaringan dan cache untuk penggunaan di masa depan
          return fetch(event.request)
            .then(networkResponse => {
              // Pastikan respons valid sebelum meng-cache
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return networkResponse;
            })
            .catch(() => {
              // Jika offline dan tidak ada di cache, bisa berikan fallback page/pesan
              // Untuk saat ini, kita biarkan error fetch standar.
              console.log('Service Worker: Fetch gagal untuk', event.request.url);
            });
        })
    );
  }
});

// Event: activate (Ketika Service Worker baru mengambil alih)
self.addEventListener('activate', event => {
  console.log('Service Worker: Mengaktifkan...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          // Hapus cache lama jika ada versi baru
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Menghapus cache lama:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});


