/* =========================================================
   DR. TROCO — CONTROLE DE TEMA (DARK MODE)
   ========================================================= */

'use strict';

(() => {
  const THEME_KEY = 'drTroco_theme';

  // 1. Verifica a preferência salva ou do sistema operacional
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }

  // Executa imediatamente para evitar "piscar" a tela branca
  initTheme();

  // 2. Cria o botão flutuante quando o HTML estiver pronto
  document.addEventListener('DOMContentLoaded', () => {
    // Evita duplicar o botão se o script for chamado 2x
    if (document.getElementById('btnToggleTheme')) return;

    const btn = document.createElement('button');
    btn.id = 'btnToggleTheme';
    btn.setAttribute('aria-label', 'Alternar modo escuro');
    
    // Define o ícone inicial (Sol ou Lua)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? '☀️' : '🌙';

    // Ação de clique
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      
      btn.innerHTML = next === 'dark' ? '☀️' : '🌙';
    });

    document.body.appendChild(btn);
  });
})();
