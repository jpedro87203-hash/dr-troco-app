/* =========================================================
   DR. TROCO — SERVICE WORKER (PWA) - VERSÃO CORRIGIDA
   ========================================================= */

const CACHE_NAME = 'dr-troco-p91.';

const ASSETS = [
  './', './index.html', './fluxo.html', './historico.html', './estoque.html',
  './fiado.html', './painel-lojista.html', './estabelecimento.html', './login.html',
  './licenca.html', './admin.html', './style.css', './manifest.json', './supabase.js',
  './auth-guard.js', './protecao.js', './fiado.js', './dados-supabase.js',
  './estoque-supabase.js', './script.js', './alertas.js', './fluxo.js', './historico.js',
  './estoque.js', './contas-pagar.js', './fornecedores.js', './lucro.js', './admin.js',
  './licenca.js', './estabelecimento.js', 
  './cardapio.html', './pedidos.html', './pedidos.js', './config-estabelecimento.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ESTRATÉGIA: Network First (Busca na internet primeiro, se falhar usa o cache)
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('supabase.co') || e.request.url.includes('jsdelivr.net') || e.request.url.includes('fonts.googleapis.com')) {
    return; 
  }

  e.respondWith(
    fetch(e.request).then((response) => {
      // Se achou na internet, atualiza o cache e retorna
      const responseClone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(e.request, responseClone);
      });
      return response;
    }).catch(() => {
      // Se falhou (sem internet), tenta pegar do cache
      return caches.match(e.request);
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url.includes('painel-lojista.html') && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/painel-lojista.html');
    })
  );
});
