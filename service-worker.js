/* =========================================================
   DR. TROCO — SERVICE WORKER (PWA)
   ========================================================= */

const CACHE_NAME = 'dr-troco-v7';

// Lista de arquivos essenciais para o app abrir offline
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
  './estabelecimento.js'
];

// 1. INSTALAÇÃO: Salva os arquivos no cache do celular
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Guardando arquivos no cache');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. ATIVAÇÃO: Limpa caches antigos quando o app é atualizado
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

// 3. FETCH: Busca do cache se estiver offline, senão busca da internet
self.addEventListener('fetch', (e) => {
  // Não interceptar chamadas para o Supabase ou CDNs externos
  if (
    e.request.url.includes('supabase.co') || 
    e.request.url.includes('jsdelivr.net') ||
    e.request.url.includes('fonts.googleapis.com')
  ) {
    return; // Deixa o navegador lidar com isso normalmente
  }

  e.respondWith(
    caches.match(e.request).then((response) => {
      // Se achou no cache, retorna. Se não, busca na internet.
      return response || fetch(e.request).then((fetchRes) => {
        return fetchRes;
      });
    }).catch(() => {
      // Se estiver offline e tentar navegar para uma página, volta pro index
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
