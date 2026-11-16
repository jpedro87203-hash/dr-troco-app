/* =========================================================
   DR. TROCO — SEGURANÇA E AUTORIZAÇÃO (PIN)
   ========================================================= */
'use strict';

(() => {
  if (window.__drTrocoSegurancaInicializado) return;
  window.__drTrocoSegurancaInicializado = true;

  const CHAVE_PIN = 'drTroco_pin_hash';
  const SALT = 'dr_troco_2024_salt'; // Sal para dificultar quebra

  // ==========================================
  // CRIPTOGRAFIA (SHA-256)
  // ==========================================
  async function criarHash(pin) {
    const msgBuffer = new TextEncoder().encode(pin + SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function temPinCadastrado() {
    return !!localStorage.getItem(CHAVE_PIN);
  }

  // ==========================================
  // UI E ESTILOS DO TECLADO
  // ==========================================
  const style = document.createElement('style');
  style.innerHTML = `
    .pin-overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(5px); z-index: 1000000; display: none;
      align-items: center; justify-content: center; padding: 20px;
    }
    .pin-overlay.aberto { display: flex; }
    .pin-box {
      background: #fff; width: 100%; max-width: 340px; border-radius: 24px;
      padding: 24px 20px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.3);
      animation: slideUp 0.3s ease;
    }
    .pin-box h3 { margin: 0 0 6px; color: #1f3028; font-size: 18px; }
    .pin-box p { margin: 0 0 20px; color: #7b898f; font-size: 13px; }
    
    .pin-display {
      display: flex; justify-content: center; gap: 12px; margin-bottom: 25px;
    }
    .pin-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #e2e8f0; transition: background 0.2s;
    }
    .pin-dot.ativo { background: #168b53; transform: scale(1.1); }
    
    .pin-teclado {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    }
    .pin-tecla {
      height: 65px; border-radius: 50%; border: 1px solid #f0f4f1; background: #f8faf9;
      font-size: 24px; font-weight: 800; color: #263640; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.1s, transform 0.1s;
    }
    .pin-tecla:active { background: #e2e8f0; transform: scale(0.95); }
    .pin-tecla.apagar { background: #fff0f0; color: #d94b4b; font-size: 20px; }
    .pin-tecla.vazio { background: transparent; border: 0; pointer-events: none; }
    
    .pin-erro { color: #d94b4b; font-size: 13px; font-weight: 700; margin-top: 15px; display: none; }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }
    .shake { animation: shake 0.3s ease-in-out; }
  `;
  document.head.appendChild(style);

  // ==========================================
  // LÓGICA DO TECLADO E PROMISES
  // ==========================================
  let pinDigitado = '';
  let resolvePromise = null;
  let rejectPromise = null;
  let modoAtual = 'verificar'; // 'verificar' ou 'cadastrar'
  let pinTemporario = '';

  function criarUI() {
    if (document.getElementById('modalPinSeguranca')) return;

    const modal = document.createElement('div');
    modal.id = 'modalPinSeguranca';
    modal.className = 'pin-overlay';
    modal.innerHTML = `
      <div class="pin-box" id="pinBox">
        <h3 id="pinTitulo">Digite o PIN</h3>
        <p id="pinSubtitulo">Autorização necessária</p>
        
        <div class="pin-display">
          <div class="pin-dot" id="dot1"></div>
          <div class="pin-dot" id="dot2"></div>
          <div class="pin-dot" id="dot3"></div>
          <div class="pin-dot" id="dot4"></div>
        </div>

        <div class="pin-teclado">
          <button class="pin-tecla" data-num="1">1</button>
          <button class="pin-tecla" data-num="2">2</button>
          <button class="pin-tecla" data-num="3">3</button>
          <button class="pin-tecla" data-num="4">4</button>
          <button class="pin-tecla" data-num="5">5</button>
          <button class="pin-tecla" data-num="6">6</button>
          <button class="pin-tecla" data-num="7">7</button>
          <button class="pin-tecla" data-num="8">8</button>
          <button class="pin-tecla" data-num="9">9</button>
          <button class="pin-tecla vazio"></button>
          <button class="pin-tecla" data-num="0">0</button>
          <button class="pin-tecla apagar" id="btnPinApagar">⌫</button>
        </div>
        
        <div class="pin-erro" id="pinErro">PIN incorreto. Tente novamente.</div>
        
        <button type="button" id="btnPinCancelar" style="margin-top:20px; background:none; border:0; color:#7b898f; font-weight:700; font-size:13px; cursor:pointer; padding:10px;">Cancelar</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Eventos dos botões numéricos
    modal.querySelectorAll('[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (pinDigitado.length < 4) {
          pinDigitado += btn.getAttribute('data-num');
          atualizarDots();
          document.getElementById('pinErro').style.display = 'none';
          if (pinDigitado.length === 4) setTimeout(validarPin, 200);
        }
      });
    });

    document.getElementById('btnPinApagar').addEventListener('click', () => {
      if (pinDigitado.length > 0) {
        pinDigitado = pinDigitado.slice(0, -1);
        atualizarDots();
      }
    });

    document.getElementById('btnPinCancelar').addEventListener('click', () => {
      fecharModal();
      if (rejectPromise) rejectPromise(new Error('Ação cancelada pelo usuário.'));
    });
  }

  function atualizarDots() {
    for (let i = 1; i <= 4; i++) {
      const dot = document.getElementById(`dot${i}`);
      if (i <= pinDigitado.length) dot.classList.add('ativo');
      else dot.classList.remove('ativo');
    }
  }

  function fecharModal() {
    document.getElementById('modalPinSeguranca').classList.remove('aberto');
    pinDigitado = '';
    atualizarDots();
  }

  async function validarPin() {
    if (modoAtual === 'cadastrar') {
      if (!pinTemporario) {
        // Primeiro passo do cadastro
        pinTemporario = pinDigitado;
        pinDigitado = '';
        atualizarDots();
        document.getElementById('pinTitulo').textContent = 'Confirme o PIN';
        document.getElementById('pinSubtitulo').textContent = 'Digite os 4 números novamente';
        return;
      } else {
        // Segundo passo do cadastro
        if (pinDigitado === pinTemporario) {
          const hash = await criarHash(pinDigitado);
          localStorage.setItem(CHAVE_PIN, hash);
          fecharModal();
          if (resolvePromise) resolvePromise(true);
        } else {
          document.getElementById('pinBox').classList.add('shake');
          document.getElementById('pinErro').textContent = 'Os PINs não coincidem.';
          document.getElementById('pinErro').style.display = 'block';
          setTimeout(() => document.getElementById('pinBox').classList.remove('shake'), 300);
          pinDigitado = '';
          pinTemporario = '';
          atualizarDots();
          document.getElementById('pinTitulo').textContent = 'Crie um PIN';
          document.getElementById('pinSubtitulo').textContent = 'Digite 4 números para proteger o app';
        }
        return;
      }
    }

    // Modo Verificar
    const hashSalvo = localStorage.getItem(CHAVE_PIN);
    const hashDigitado = await criarHash(pinDigitado);

    if (hashDigitado === hashSalvo) {
      fecharModal();
      if (resolvePromise) resolvePromise(true);
    } else {
      document.getElementById('pinBox').classList.add('shake');
      document.getElementById('pinErro').style.display = 'block';
      setTimeout(() => document.getElementById('pinBox').classList.remove('shake'), 300);
      pinDigitado = '';
      atualizarDots();
    }
  }

  // ==========================================
  // API PÚBLICA
  // ==========================================
  
  // Função usada pelas outras telas (Ex: excluir venda, fechar caixa)
  function verificarPIN(motivo = 'Autorizar Ação') {
    criarUI();
    return new Promise((resolve, reject) => {
      if (!temPinCadastrado()) {
        alert("Você ainda não cadastrou um PIN de segurança.\nVá no Painel do Lojista e cadastre um PIN antes de realizar ações críticas.");
        return reject(new Error('PIN não cadastrado.'));
      }

      modoAtual = 'verificar';
      resolvePromise = resolve;
      rejectPromise = reject;
      pinDigitado = '';
      atualizarDots();

      document.getElementById('pinTitulo').textContent = 'Digite o PIN';
      document.getElementById('pinSubtitulo').textContent = motivo;
      document.getElementById('pinErro').style.display = 'none';
      
      document.getElementById('modalPinSeguranca').classList.add('aberto');
    });
  }

  // Função usada no Painel do Lojista para cadastrar/trocar o PIN
  function cadastrarPIN() {
    criarUI();
    return new Promise((resolve, reject) => {
      modoAtual = 'cadastrar';
      resolvePromise = resolve;
      rejectPromise = reject;
      pinDigitado = '';
      pinTemporario = '';
      atualizarDots();

      document.getElementById('pinTitulo').textContent = 'Crie um PIN';
      document.getElementById('pinSubtitulo').textContent = 'Digite 4 números para proteger o app';
      document.getElementById('pinErro').style.display = 'none';
      
      document.getElementById('modalPinSeguranca').classList.add('aberto');
    });
  }

  window.DrTrocoSeguranca = {
    verificarPIN,
    cadastrarPIN,
    temPin: temPinCadastrado
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', criarUI);
  } else {
    criarUI();
  }
})();
