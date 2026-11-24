/* =========================================================
   DR. TROCO — SERVICE WORKER (PWA)
   ========================================================= */

const CACHE_NAME = 'dr-troco-v74'; // <--- MUDAMOS A VERSÃO AQUI

const ASSETS = [
  './',
  './index.html',
  './fluxo.html',
  './historico.html',
  './estoque.html',
  './fiado.html',
  './painel-lojista.html',
  './estabelecimento.html',
  './login.html',
  './licenca.html',
  './admin.html',
  './style.css',
  './manifest.json',
  './supabase.js',
  './auth-guard.js',
  './protecao.js',
  './fiado.js',
  './dados-supabase.js',
  './estoque-supabase.js',
  './script.js',
  './alertas.js',
  './fluxo.js',
  './historico.js',
  './estoque.js',
  './contas-pagar.js',
  './fornecedores.js',
  './lucro.js',
  './admin.js',
  './licenca.js',
  './estabelecimento.js',
  // ADICIONADOS AQUI PARA FUNCIONAR OFFLINE:
  './cardapio.html',
  './pedidos.html',
  './pedidos.js',
  './config-estabelecimento.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Guardando arquivos no cache v73');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpando cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (
    e.request.url.includes('supabase.co') || 
    e.request.url.includes('jsdelivr.net') ||
    e.request.url.includes('fonts.googleapis.com')
  ) {
    return; 
  }

  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).then((fetchRes) => {
        return fetchRes;
      });
    }).catch(() => {
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes('painel-lojista.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/painel-lojista.html');
      }
    })
  );
});
