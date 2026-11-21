/* ============================================================
   DR. TROCO — COMANDAS & QR CODE POR MESA
   Arquivo: comandas.js
============================================================ */
'use strict';

(() => {
  if (window.__drTrocoComandasInicializado) return;
  window.__drTrocoComandasInicializado = true;

  const CHAVE_MESAS = 'drTroco_comandasMesas';
  const CHAVE_COMANDAS = 'drTroco_comandasLista';

  let mesas = [];
  let comandas = [];
  let comandaAtivaId = null;
  let streamCamera = null;
  let loopLeituraId = null;
  let avisoTimer = null;

  const $ = id => document.getElementById(id);

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'cmd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function paraCentavos(valor) {
    if (typeof valor === 'number') {
      return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
    }
    if (typeof valor !== 'string') return 0;
    let limpo = valor.trim().replace(/[R$\s]/g, '');
    if (!limpo) return 0;
    if (limpo.includes(',')) {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(limpo);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function formatarDinheiro(centavos) {
    return ((Number(centavos) || 0) / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }

  function normalizarCodigo(cod) {
    return String(cod || '').trim().toUpperCase();
  }

  function mostrarAviso(msg, erro = false) {
    const el = $('comandaAviso');
    if (!el) return;
    clearTimeout(avisoTimer);
    el.textContent = msg;
    el.classList.toggle('erro', Boolean(erro));
    el.classList.add('visivel');
    avisoTimer = setTimeout(() => el.classList.remove('visivel'), 3600);
  }

  function carregarEstadoLocal() {
    try {
      const m = JSON.parse(localStorage.getItem(CHAVE_MESAS) || '[]');
      const c = JSON.parse(localStorage.getItem(CHAVE_COMANDAS) || '[]');
      mesas = Array.isArray(m) ? m : [];
      comandas = Array.isArray(c) ? c : [];
    } catch (_) {
      mesas = [];
      comandas = [];
    }

    if (!mesas.length) {
      garantirMesasIniciais(6);
    }
  }

  function salvarEstadoLocal() {
    try {
      localStorage.setItem(CHAVE_MESAS, JSON.stringify(mesas));
      localStorage.setItem(CHAVE_COMANDAS, JSON.stringify(comandas));
    } catch (_) {}
  }

  function formatarNomeMesa(numeroOuNome) {
    const bruto = String(numeroOuNome || '').trim();
    if (!bruto) return 'Mesa 01';
    if (/^mesa\b/i.test(bruto)) return bruto;
    if (/^\d+$/.test(bruto)) return `Mesa ${bruto.padStart(2, '0')}`;
    return bruto;
  }

  function gerarCodigoQrPadrao(nomeMesa) {
    const slug = String(nomeMesa || 'MESA')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `DRTROCO-${slug || 'MESA'}`;
  }

  function vincularOuAtualizarMesa(nomeMesa, codigoQr) {
    const nomeFormatado = formatarNomeMesa(nomeMesa);
    const codigoFinal = normalizarCodigo(codigoQr) || gerarCodigoQrPadrao(nomeFormatado);

    let mesaExistente = mesas.find(
      m => m.nome.toLowerCase() === nomeFormatado.toLowerCase() || m.codigoQr === codigoFinal
    );

    if (mesaExistente) {
      mesaExistente.nome = nomeFormatado;
      mesaExistente.codigoQr = codigoFinal;
    } else {
      mesaExistente = {
        id: gerarId(),
        nome: nomeFormatado,
        codigoQr: codigoFinal,
        criadoEm: new Date().toISOString()
      };
      mesas.push(mesaExistente);
    }

    salvarEstadoLocal();
    return mesaExistente;
  }

  function garantirMesasIniciais(qtd = 6) {
    const total = Math.max(1, Math.min(100, Number(qtd) || 6));
    for (let i = 1; i <= total; i++) {
      const rotulo = `Mesa ${String(i).padStart(2, '0')}`;
      const cod = `DRTROCO-MESA-${String(i).padStart(2, '0')}`;
      if (!mesas.some(m => m.codigoQr === cod || m.nome.toLowerCase() === rotulo.toLowerCase())) {
        mesas.push({
          id: gerarId(),
          nome: rotulo,
          codigoQr: cod,
          criadoEm: new Date().toISOString()
        });
      }
    }
    salvarEstadoLocal();
  }

  function totalComandaCentavos(comanda) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens.reduce((acc, item) => {
      const qtd = Math.max(1, Number(item.quantidade) || 1);
      const unit = Number(item.valorUnitarioCentavos) || 0;
      return acc + (qtd * unit);
    }, 0);
  }

  function quantidadeItensComanda(comanda) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens.reduce((acc, item) => acc + (Math.max(1, Number(item.quantidade) || 1)), 0);
  }

  function buscarComandaAbertaPorCodigoQr(codigoQr) {
    const cod = normalizarCodigo(codigoQr);
    if (!cod) return null;
    const mesa = mesas.find(m => m.codigoQr === cod);
    if (mesa) {
      return comandas.find(c => c.status === 'aberta' && (c.mesaId === mesa.id || normalizarCodigo(c.codigoQr) === cod)) || null;
    }
    return comandas.find(c => c.status === 'aberta' && normalizarCodigo(c.codigoQr) === cod) || null;
  }

  function abrirModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('aberto');
    el.setAttribute('aria-hidden', 'false');
  }

  function fecharModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('aberto');
    el.setAttribute('aria-hidden', 'true');
    if (id === 'modalLeitorQrComanda') {
      pararCameraQr();
    }
  }

  function gerarDataUrlQrCode(texto, tamanhoModulo = 4) {
    if (typeof window.qrcode !== 'function') return '';
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(String(texto));
      qr.make();
      return qr.createDataURL(tamanhoModulo, 4);
    } catch (_) {
      return '';
    }
  }

  function renderizarGridQrMesas() {
    const container = $('gridQrMesas');
    if (!container) return;

    if (!mesas.length) {
      container.innerHTML = '<div class="comanda-vazio"><strong>Nenhuma mesa cadastrada</strong></div>';
      return;
    }

    container.innerHTML = mesas.map(m => {
      const imgSrc = gerarDataUrlQrCode(m.codigoQr, 3);
      return `
        <div class="qr-mesa-card">
          <strong>${escaparHTML(m.nome)}</strong>
          ${imgSrc ? `<img src="${imgSrc}" alt="QR Code ${escaparHTML(m.nome)}" style="width:108px;height:108px;">` : ''}
          <small>${escaparHTML(m.codigoQr)}</small>
        </div>
      `;
    }).join('');
  }

  function imprimirQrMesas() {
    if (!mesas.length) {
      mostrarAviso('Nenhuma mesa para imprimir.', true);
      return;
    }

    const cardsHtml = mesas.map(m => {
      const imgSrc = gerarDataUrlQrCode(m.codigoQr, 4);
      return `
        <div class="folha-qr">
          <h2>${escaparHTML(m.nome)}</h2>
          ${imgSrc ? `<img src="${imgSrc}" alt="${escaparHTML(m.nome)}">` : ''}
          <p>${escaparHTML(m.codigoQr)}</p>
        </div>
      `;
    }).join('');

    const janela = window.open('', '_blank');
    if (!janela) {
      mostrarAviso('Permita pop-ups para imprimir os QR Codes.', true);
      return;
    }

    janela.document.open();
    janela.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>QR Codes das Mesas — Dr. Troco</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 16px; color: #1f3028; }
        .grade { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .folha-qr { border: 1.5px solid #1f3028; border-radius: 12px; padding: 14px; text-align: center; page-break-inside: avoid; }
        .folha-qr h2 { margin: 0 0 10px; font-size: 18px; }
        .folha-qr img { width: 150px; height: 150px; }
        .folha-qr p { margin: 8px 0 0; font-size: 11px; color: #475569; }
      </style></head><body>
      <div class="grade">${cardsHtml}</div>
      <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script>
      </body></html>`);
    janela.document.close();
  }

  function renderizarComandas() {
    const abertas = comandas.filter(c => c.status === 'aberta');
    const totalAbertoC = abertas.reduce((soma, c) => soma + totalComandaCentavos(c), 0);

    if ($('comandasQtdAbertas')) $('comandasQtdAbertas').textContent = String(abertas.length);
    if ($('comandasTotalAberto')) $('comandasTotalAberto').textContent = formatarDinheiro(totalAbertoC);

    const lista = $('listaComandasAbertas');
    if (!lista) return;

    if (!abertas.length) {
      lista.innerHTML = `
        <div class="comanda-vazio">
          <strong>Nenhuma comanda aberta no momento</strong>
          <span>Toque em “+ Nova comanda” ou “Ler QR Code” para iniciar um atendimento.</span>
        </div>
      `;
      return;
    }

    lista.innerHTML = abertas.map(c => {
      const totalC = totalComandaCentavos(c);
      const qtdItens = quantidadeItensComanda(c);
      return `
        <article class="comanda-card">
          <div class="comanda-card-topo">
            <span class="comanda-mesa-badge">🍽️ ${escaparHTML(c.mesaNome)}</span>
            <span class="comanda-total-destaque">${formatarDinheiro(totalC)}</span>
          </div>
          <div class="comanda-card-meta">
            <span>${c.clienteNome ? 'Cliente: ' + escaparHTML(c.clienteNome) : 'Sem nome informado'}</span>
            <span>${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'} · QR: ${escaparHTML(c.codigoQr)}</span>
          </div>
          <div class="comanda-card-acoes">
            <button type="button" data-acao-comanda="abrir" data-id="${escaparHTML(c.id)}">＋ Itens / Ver</button>
            <button type="button" data-acao-comanda="qr" data-id="${escaparHTML(c.id)}">🔲 QR Mesa</button>
            <button type="button" class="fechar" data-acao-comanda="fechar" data-id="${escaparHTML(c.id)}">✓ Fechar</button>
          </div>
        </article>
      `;
    }).join('');
  }

  function abrirDetalhesComanda(comandaId) {
    const comanda = comandas.find(c => c.id === comandaId);
    if (!comanda) {
      mostrarAviso('Comanda não encontrada.', true);
      return;
    }

    comandaAtivaId = comanda.id;
    if ($('detalheComandaTitulo')) {
      $('detalheComandaTitulo').textContent = `${comanda.mesaNome} — ${comanda.status === 'aberta' ? 'Aberta' : 'Fechada'}`;
    }
    if ($('detalheComandaSubtitulo')) {
      const partes = [`QR: ${comanda.codigoQr}`];
      if (comanda.clienteNome) partes.push(`Cliente: ${comanda.clienteNome}`);
      $('detalheComandaSubtitulo').textContent = partes.join(' · ');
    }

    const formItem = $('formAdicionarItemComanda');
    if (formItem) {
      formItem.style.display = comanda.status === 'aberta' ? 'grid' : 'none';
    }
    if ($('btnFecharComandaConta')) {
      $('btnFecharComandaConta').disabled = comanda.status !== 'aberta';
    }

    renderizarItensComanda(comanda);
    abrirModal('modalDetalhesComanda');
  }

  function renderizarItensComanda(comanda) {
    const container = $('detalheComandaItens');
    const totalEl = $('detalheComandaTotal');
    if (!container) return;

    const itens = Array.isArray(comanda.itens) ? comanda.itens : [];
    if (!itens.length) {
      container.innerHTML = '<div style="font-size:13px;color:#64748b;text-align:center;padding:8px 0;">Nenhum item adicionado ainda.</div>';
    } else {
      container.innerHTML = itens.map((item, idx) => {
        const qtd = Math.max(1, Number(item.quantidade) || 1);
        const unitC = Number(item.valorUnitarioCentavos) || 0;
        const subC = qtd * unitC;
        return `
          <div class="comanda-item-linha">
            <div>
              <strong>${escaparHTML(item.nome)}</strong>
              <small style="display:block;color:#64748b;">${qtd}x ${formatarDinheiro(unitC)}</small>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <strong>${formatarDinheiro(subC)}</strong>
              ${comanda.status === 'aberta' ? `<button type="button" data-remover-item-idx="${idx}" style="border:0;background:#fff0f0;color:#d94b4b;border-radius:6px;padding:4px 7px;cursor:pointer;">✕</button>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    if (totalEl) {
      totalEl.textContent = formatarDinheiro(totalComandaCentavos(comanda));
    }
  }

  function criarComanda({ numeroMesa, codigoQr, clienteNome }) {
    const mesa = vincularOuAtualizarMesa(numeroMesa, codigoQr);
    const jaAberta = comandas.find(c => c.status === 'aberta' && (c.mesaId === mesa.id || c.codigoQr === mesa.codigoQr));
    if (jaAberta) {
      mostrarAviso(`Já existe uma comanda aberta para ${mesa.nome}.`);
      return jaAberta;
    }

    const nova = {
      id: gerarId(),
      mesaId: mesa.id,
      mesaNome: mesa.nome,
      codigoQr: mesa.codigoQr,
      clienteNome: String(clienteNome || '').trim(),
      status: 'aberta',
      itens: [],
      abertoEm: new Date().toISOString()
    };

    comandas.unshift(nova);
    salvarEstadoLocal();
    renderizarComandas();
    return nova;
  }

  function adicionarItemComanda(comandaId, { nome, quantidade, valorUnitario }) {
    const comanda = comandas.find(c => c.id === comandaId && c.status === 'aberta');
    if (!comanda) {
      mostrarAviso('Comanda não encontrada ou já fechada.', true);
      return;
    }

    const nomeLimpo = String(nome || '').trim();
    const qtd = Math.max(1, parseInt(quantidade, 10) || 1);
    const valorC = paraCentavos(valorUnitario);

    if (!nomeLimpo || valorC <= 0) {
      mostrarAviso('Informe o nome do item e um valor maior que zero.', true);
      return;
    }

    comanda.itens.push({
      id: gerarId(),
      nome: nomeLimpo,
      quantidade: qtd,
      valorUnitarioCentavos: valorC,
      adicionadoEm: new Date().toISOString()
    });

    salvarEstadoLocal();
    renderizarComandas();
    renderizarItensComanda(comanda);
    mostrarAviso(`Adicionado: ${qtd}x ${nomeLimpo}`);
  }

  async function fecharComandaConta(comandaId, formaPagamento = 'dinheiro') {
    const comanda = comandas.find(c => c.id === comandaId && c.status === 'aberta');
    if (!comanda) {
      mostrarAviso('Comanda não encontrada ou já fechada.', true);
      return;
    }

    const totalC = totalComandaCentavos(comanda);
    if (totalC <= 0) {
      mostrarAviso('Adicione ao menos um item antes de fechar a conta.', true);
      return;
    }

    comanda.status = 'fechada';
    comanda.formaPagamento = formaPagamento;
    comanda.fechadoEm = new Date().toISOString();
    comanda.totalFechadoCentavos = totalC;

    salvarEstadoLocal();
    renderizarComandas();
    fecharModal('modalDetalhesComanda');
    comandaAtivaId = null;
    mostrarAviso(`${comanda.mesaNome} fechada (${formatarDinheiro(totalC)} · ${formaPagamento}).`);
  }

  function processarCodigoQrLido(codigoLido) {
    const limpo = normalizarCodigo(codigoLido);
    if (!limpo) {
      mostrarAviso('Código QR vazio.', true);
      return;
    }

    fecharModal('modalLeitorQrComanda');

    const aberta = buscarComandaAbertaPorCodigoQr(limpo);
    if (aberta) {
      abrirDetalhesComanda(aberta.id);
      return;
    }

    const mesaVinculada = mesas.find(m => m.codigoQr === limpo);
    if ($('inputNumeroMesa')) $('inputNumeroMesa').value = mesaVinculada ? mesaVinculada.nome : '';
    if ($('inputCodigoQrMesa')) $('inputCodigoQrMesa').value = limpo;
    if ($('inputClienteComanda')) $('inputClienteComanda').value = '';
    abrirModal('modalAbrirComanda');
    mostrarAviso(`QR ${limpo} lido. Abra a comanda da mesa para começar.`);
  }

  function pararCameraQr() {
    if (loopLeituraId) {
      cancelAnimationFrame(loopLeituraId);
      loopLeituraId = null;
    }
    if (streamCamera) {
      streamCamera.getTracks().forEach(t => t.stop());
      streamCamera = null;
    }
  }

  async function iniciarLeitorQr() {
    abrirModal('modalLeitorQrComanda');
    if ($('inputQrManual')) $('inputQrManual').value = '';

    const video = $('videoQrComanda');
    const statusEl = $('statusLeitorQr');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) statusEl.textContent = 'Câmera indisponível neste dispositivo. Digite ou cole o código abaixo.';
      return;
    }

    if (typeof window.BarcodeDetector !== 'function') {
      if (statusEl) statusEl.textContent = 'Leitor automático não suportado neste navegador. Digite ou cole o código abaixo.';
      return;
    }

    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      streamCamera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });

      if (video) {
        video.srcObject = streamCamera;
        await video.play();
      }
      if (statusEl) statusEl.textContent = 'Aponte a câmera para o QR Code...';

      const tick = async () => {
        if (!streamCamera || !video || video.readyState < 2) {
          loopLeituraId = requestAnimationFrame(tick);
          return;
        }
        try {
          const codigos = await detector.detect(video);
          if (Array.isArray(codigos) && codigos.length > 0 && codigos[0].rawValue) {
            processarCodigoQrLido(codigos[0].rawValue);
            return;
          }
        } catch (_) {}
        loopLeituraId = requestAnimationFrame(tick);
      };

      loopLeituraId = requestAnimationFrame(tick);
    } catch (_) {
      if (statusEl) statusEl.textContent = 'Permissão de câmera negada ou indisponível. Use o campo manual abaixo.';
    }
  }

  function bindEventos() {
    $('btnAbrirNovaComanda')?.addEventListener('click', () => {
      $('formAbrirComanda')?.reset();
      abrirModal('modalAbrirComanda');
    });

    $('btnAbrirQrMesas')?.addEventListener('click', () => {
      renderizarGridQrMesas();
      abrirModal('modalQrMesas');
    });

    $('btnGerarLoteMesas')?.addEventListener('click', () => {
      const qtd = parseInt($('inputQtdMesasGerar')?.value || '6', 10) || 6;
      garantirMesasIniciais(qtd);
      renderizarGridQrMesas();
      mostrarAviso(`Mesas atualizadas até a ${String(qtd).padStart(2, '0')}.`);
    });

    $('btnImprimirQrMesas')?.addEventListener('click', imprimirQrMesas);
    $('btnLerQrComanda')?.addEventListener('click', iniciarLeitorQr);
    $('btnFecharLeitorQr')?.addEventListener('click', () => fecharModal('modalLeitorQrComanda'));

    $('btnConfirmarQrManual')?.addEventListener('click', () => {
      processarCodigoQrLido($('inputQrManual')?.value || '');
    });

    document.querySelectorAll('[data-fechar-modal]').forEach(btn => {
      btn.addEventListener('click', () => fecharModal(btn.getAttribute('data-fechar-modal')));
    });

    $('formAbrirComanda')?.addEventListener('submit', ev => {
      ev.preventDefault();
      const numeroMesa = $('inputNumeroMesa')?.value || '';
      const codigoQr = $('inputCodigoQrMesa')?.value || '';
      const clienteNome = $('inputClienteComanda')?.value || '';

      if (!String(numeroMesa).trim()) {
        mostrarAviso('Informe o número ou nome da mesa.', true);
        return;
      }

      const cmd = criarComanda({ numeroMesa, codigoQr, clienteNome });
      fecharModal('modalAbrirComanda');
      if (cmd) abrirDetalhesComanda(cmd.id);
    });

    $('listaComandasAbertas')?.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao-comanda]');
      if (!btn) return;
      const acao = btn.getAttribute('data-acao-comanda');
      const id = btn.getAttribute('data-id');
      const cmd = comandas.find(c => c.id === id);
      if (!cmd) return;

      if (acao === 'abrir') {
        abrirDetalhesComanda(id);
      } else if (acao === 'qr') {
        renderizarGridQrMesas();
        abrirModal('modalQrMesas');
      } else if (acao === 'fechar') {
        abrirDetalhesComanda(id);
      }
    });

    $('formAdicionarItemComanda')?.addEventListener('submit', ev => {
      ev.preventDefault();
      if (!comandaAtivaId) return;
      adicionarItemComanda(comandaAtivaId, {
        nome: $('itemNomeComanda')?.value || '',
        quantidade: $('itemQtdComanda')?.value || 1,
        valorUnitario: $('itemValorComanda')?.value || 0
      });
      if ($('itemNomeComanda')) $('itemNomeComanda').value = '';
      if ($('itemQtdComanda')) $('itemQtdComanda').value = '1';
      if ($('itemValorComanda')) $('itemValorComanda').value = '';
      $('itemNomeComanda')?.focus();
    });

    $('detalheComandaItens')?.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-remover-item-idx]');
      if (!btn || !comandaAtivaId) return;
      const idx = parseInt(btn.getAttribute('data-remover-item-idx'), 10);
      const cmd = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta');
      if (!cmd || Number.isNaN(idx) || !cmd.itens[idx]) return;

      cmd.itens.splice(idx, 1);
      salvarEstadoLocal();
      renderizarComandas();
      renderizarItensComanda(cmd);
      mostrarAviso('Item removido da comanda.');
    });

    $('btnFecharComandaConta')?.addEventListener('click', () => {
      if (!comandaAtivaId) return;
      const forma = $('formaPagamentoFechamento')?.value || 'dinheiro';
      fecharComandaConta(comandaAtivaId, forma);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    carregarEstadoLocal();
    bindEventos();
    renderizarComandas();
  });

  window.DrTrocoComandas = {
    criarComanda,
    adicionarItemComanda,
    fecharComandaConta,
    processarCodigoQrLido,
    renderizarComandas
  };
})();
