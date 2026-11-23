/* ============================================================
   DR. TROCO — COMANDAS & QR CODE POR MESA
   Arquivo: comandas.js (WHATSAPP + ENTREGA + NUVEM)
============================================================ */
'use strict';

(() => {
  if (window.__drTrocoComandasInicializado) return;
  window.__drTrocoComandasInicializado = true;

  const CHAVE_MESAS = 'drTroco_comandasMesas';
  const CHAVE_COMANDAS = 'drTroco_comandasLista';
  const PREFIXO_ESTOQUE = 'drTroco_estoque_';
  const PREFIXO_MOV_ESTOQUE = 'drTroco_movimentacoesEstoque_';
  const CHAVE_VENDAS_HISTORICO = 'drTroco_vendas';
  const CHAVE_CONFIG_CAIXA = 'drTroco_configCaixa';

  let mesas = [];
  let comandas = [];
  let produtosEstoqueCache = [];
  let comandaAtivaId = null;
  let streamCamera = null;
  let loopLeituraId = null;
  let avisoTimer = null;
  let modoLeitor = 'comanda'; // 'comanda' ou 'entrega'

  const $ = id => document.getElementById(id);

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function paraCentavos(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
    if (typeof valor !== 'string') return 0;
    let limpo = valor.trim().replace(/[R$\s]/g, '');
    if (!limpo) return 0;
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    const n = Number(limpo);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function formatarDinheiro(centavos) {
    return ((Number(centavos) || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function normalizarCodigo(cod) { return String(cod || '').trim().toUpperCase(); }

  function obterHorarioCorteConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem(CHAVE_CONFIG_CAIXA) || '{"horarioCorte":"04:00"}');
      return cfg && cfg.horarioCorte ? String(cfg.horarioCorte) : '04:00';
    } catch (_) { return '04:00'; }
  }

  function obterDataHoraOperacional() {
    const agora = new Date();
    const referencia = new Date(agora.getTime());
    const [horaCorte, minutoCorte] = obterHorarioCorteConfig().split(':').map(Number);
    const hAtual = referencia.getHours(), mAtual = referencia.getMinutes();

    if (Number.isFinite(horaCorte) && (hAtual < horaCorte || (hAtual === horaCorte && mAtual < (Number.isFinite(minutoCorte) ? minutoCorte : 0)))) {
      referencia.setDate(referencia.getDate() - 1);
    }
    const dia = String(referencia.getDate()).padStart(2, '0');
    const mes = String(referencia.getMonth() + 1).padStart(2, '0');
    const ano = referencia.getFullYear();
    return {
      dataChave: `${ano}-${mes}-${dia}`, dataFormatada: `${dia}/${mes}/${ano}`,
      horaFormatada: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`,
      horaCompleta: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`,
      iso: agora.toISOString()
    };
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
    } catch (_) { mesas = []; comandas = []; }
    if (!mesas.length) garantirMesasIniciais(6);
  }

  function salvarEstadoLocal() {
    try {
      localStorage.setItem(CHAVE_MESAS, JSON.stringify(mesas));
      localStorage.setItem(CHAVE_COMANDAS, JSON.stringify(comandas));
      sincronizarComandasNuvem();
    } catch (_) {}
  }

  // Sincroniza com a tabela 'comandas_abertas' no Supabase
  async function sincronizarComandasNuvem() {
    if (!window.supabaseClient) return;
    try {
      const ativas = comandas.filter(c => c.status === 'aberta');
      for (const c of ativas) {
        await window.supabaseClient.from('comandas_abertas').upsert({
          id: c.id, mesa_nome: c.mesaNome, codigo_qr: c.codigoQr,
          cliente_nome: c.clienteNome || '', itens: c.itens,
          total: totalComandaCentavos(c) / 100, status: c.status,
          forma_pagamento: c.formaPagamento || null, atualizado_em: new Date().toISOString()
        });
      }
    } catch (e) { console.warn('[Comandas] Erro sync nuvem:', e); }
  }

  function formatarNomeMesa(numeroOuNome) {
    const bruto = String(numeroOuNome || '').trim();
    if (!bruto) return 'Mesa 01';
    if (/^mesa\b/i.test(bruto)) return bruto;
    if (/^\d+$/.test(bruto)) return `Mesa ${bruto.padStart(2, '0')}`;
    return bruto;
  }

  function gerarCodigoQrPadrao(nomeMesa) {
    const slug = String(nomeMesa || 'MESA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `DRTROCO-${slug || 'MESA'}`;
  }

  function vincularOuAtualizarMesa(nomeMesa, codigoQr) {
    const nomeFormatado = formatarNomeMesa(nomeMesa);
    const codigoFinal = normalizarCodigo(codigoQr) || gerarCodigoQrPadrao(nomeFormatado);
    let mesaExistente = mesas.find(m => m.nome.toLowerCase() === nomeFormatado.toLowerCase() || m.codigoQr === codigoFinal);

    if (mesaExistente) {
      if (codigoQr && mesaExistente.codigoQr !== codigoFinal && !confirm(`A ${mesaExistente.nome} já possui QR "${mesaExistente.codigoQr}". Trocar?`)) return mesaExistente;
      mesaExistente.nome = nomeFormatado; mesaExistente.codigoQr = codigoFinal;
    } else {
      mesaExistente = { id: gerarId(), nome: nomeFormatado, codigoQr: codigoFinal, criadoEm: new Date().toISOString() };
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
        mesas.push({ id: gerarId(), nome: rotulo, codigoQr: cod, criadoEm: new Date().toISOString() });
      }
    }
    salvarEstadoLocal();
  }

  function montarResumoItensComanda(itens) {
    return itens.map(it => `${Math.max(1, Number(it.quantidade) || 1)}x ${it.nome}`).join(', ');
  }

  async function registrarComandaNoHistoricoComoVenda(comanda, totalCentavos, formaPagamento) {
    const momento = obterDataHoraOperacional();
    const totalReais = Number((totalCentavos / 100).toFixed(2));
    const descricao = `${comanda.mesaNome}${comanda.clienteNome ? ' · ' + comanda.clienteNome : ''} — ${montarResumoItensComanda(comanda.itens)}`;

    const produtosVenda = (comanda.itens || []).filter(it => it && it.produtoId).map(it => {
      const qtd = Math.max(1, Number(it.quantidade) || 1);
      const preco = Number(((Number(it.valorUnitarioCentavos) || 0) / 100).toFixed(2));
      const prodEstoque = produtosEstoqueCache.find(p => String(p.id) === String(it.produtoId));
      const custoUnit = Number(prodEstoque?.precoCusto || 0) / Math.max(1, Number(prodEstoque?.qtdEmbalagem || 1));
      const subtotalCusto = Number((custoUnit * qtd).toFixed(2));
      const lucroItem = Number(((preco * qtd) - subtotalCusto).toFixed(2));
      return { id: String(it.produtoId), nome: it.nome, quantidade: qtd, preco, custoUnitario: Number(custoUnit.toFixed(4)), subtotalCusto, lucroItem, margemPct: (preco * qtd) > 0 ? Number(((lucroItem / (preco * qtd)) * 100).toFixed(1)) : 0 };
    });

    const totalCusto = produtosVenda.reduce((acc, p) => acc + p.subtotalCusto, 0);
    const lucroBruto = Number((totalReais - totalCusto).toFixed(2));

    const registroVenda = {
      id: gerarId(), tipo: 'venda', categoria: 'venda', origem: 'comanda',
      comandaId: comanda.id, mesaNome: comanda.mesaNome, clienteNome: comanda.clienteNome || '',
      descricao, total: totalReais, valor: totalReais, formaPagamento, forma_pagamento: formaPagamento,
      produtos: produtosVenda, totalCusto, lucroBruto, margemPct: totalReais > 0 ? Number(((lucroBruto / totalReais) * 100).toFixed(1)) : 0,
      data: momento.dataFormatada, dataChave: momento.dataChave, dataISO: momento.dataChave,
      hora: momento.horaFormatada, criadoEm: momento.iso
    };

    const salvarVendaLocalmente = () => {
      try {
        const atual = JSON.parse(localStorage.getItem(CHAVE_VENDAS_HISTORICO) || '[]');
        const lista = Array.isArray(atual) ? atual : [];
        if (!lista.some(v => String(v.id) === String(registroVenda.id))) {
          lista.unshift(registroVenda); localStorage.setItem(CHAVE_VENDAS_HISTORICO, JSON.stringify(lista));
        }
      } catch (_) {}
    };

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarVenda === 'function') {
      try { await window.DrTrocoDados.salvarVenda(registroVenda); } catch (e) { console.warn(e); salvarVendaLocalmente(); }
    } else {
      salvarVendaLocalmente();
    }
    return registroVenda;
  }

  function encontrarChavesEstoqueLocal() {
    let chaveEstoque = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO_ESTOQUE) && !k.includes('_backup_')) { chaveEstoque = k; break; }
    }
    if (!chaveEstoque) return { chaveEstoque: null, chaveMov: null };
    const sufixo = chaveEstoque.slice(PREFIXO_ESTOQUE.length);
    return { chaveEstoque, chaveMov: `${PREFIXO_MOV_ESTOQUE}${sufixo}` };
  }

  async function carregarProdutosEstoqueDisponiveis() {
    if (window.EstoqueSupabase && typeof window.EstoqueSupabase.carregarProdutos === 'function') {
      try { await window.EstoqueSupabase.obterComercioId(); produtosEstoqueCache = await window.EstoqueSupabase.carregarProdutos() || []; return produtosEstoqueCache; } catch (_) {}
    }
    const { chaveEstoque } = encontrarChavesEstoqueLocal();
    if (!chaveEstoque) return (produtosEstoqueCache = []);
    try { produtosEstoqueCache = JSON.parse(localStorage.getItem(chaveEstoque) || '[]'); } catch (_) { produtosEstoqueCache = []; }
    return produtosEstoqueCache;
  }

  function preencherSelectProdutosComanda() {
    const select = $('selectProdutoEstoqueComanda'); if (!select) return;
    const valorAtual = select.value; const opcoes = ['<option value="">Item avulso / manual</option>'];
    produtosEstoqueCache.forEach(prod => {
      const qtdDisp = Math.max(0, Number(prod.quantidade) || 0); const precoNum = Number(prod.preco) || 0;
      const labelPreco = precoNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      opcoes.push(`<option value="${escaparHTML(prod.id)}">${escaparHTML(prod.nome)} (${labelPreco} · Est: ${qtdDisp})</option>`);
    });
    select.innerHTML = opcoes.join('');
    if (valorAtual && produtosEstoqueCache.some(p => String(p.id) === String(valorAtual))) select.value = valorAtual;
  }

  function quantidadeNaComandaPorProdutoId(comanda, produtoId) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens.filter(it => it.produtoId && String(it.produtoId) === String(produtoId)).reduce((acc, it) => acc + (Math.max(1, Number(it.quantidade) || 1)), 0);
  }

  function renderizarGradeEstoqueComanda() {
    const grade = $('gradeProdutosEstoqueComanda'); if (!grade) return;
    const comanda = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta');
    const termo = String($('buscaProdutoEstoqueComanda')?.value || '').trim().toLowerCase();
    const filtrados = produtosEstoqueCache.filter(prod => !termo || String(prod.nome||'').toLowerCase().includes(termo) || String(prod.codigo||'').toLowerCase().includes(termo));

    if (!filtrados.length) { grade.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:#64748b;font-size:12px;">Nenhum produto encontrado.</div>`; return; }

    grade.innerHTML = filtrados.map(prod => {
      const qtdNaCmd = quantidadeNaComandaPorProdutoId(comanda, prod.id);
      const estDisp = Math.max(0, Number(prod.quantidade) || 0);
      const precoFmt = (Number(prod.preco) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const inicial = String(prod.nome || '?').trim().charAt(0).toUpperCase() || '?';
      const fotoHtml = prod.foto ? `<img src="${escaparHTML(prod.foto)}" alt="${escaparHTML(prod.nome)}">` : `<span>${escaparHTML(inicial)}</span>`;
      return `
        <div class="card-prod-comanda">
          <div class="foto-prod-comanda">${fotoHtml}</div>
          <div class="nome-prod-comanda">${escaparHTML(prod.nome)}</div>
          <div class="est-prod-comanda">Estoque: ${estDisp}</div>
          <div class="preco-prod-comanda">${precoFmt}</div>
          <div class="acoes-qtd-comanda">
            <button type="button" data-cmd-prod-menos="${escaparHTML(prod.id)}" ${qtdNaCmd <= 0 ? 'disabled' : ''}>−</button>
            <span>${qtdNaCmd}</span>
            <button type="button" data-cmd-prod-mais="${escaparHTML(prod.id)}" ${qtdNaCmd >= estDisp ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
    }).join('');
  }

  function ajustarQuantidadeProdutoNaComanda(produtoId, delta) {
    const comanda = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta'); if (!comanda) return;
    const prod = produtosEstoqueCache.find(p => String(p.id) === String(produtoId)); if (!prod) return;
    const idxExistente = comanda.itens.findIndex(it => it.produtoId && String(it.produtoId) === String(prod.id));

    if (delta > 0) {
      const estDisp = Math.max(0, Number(prod.quantidade) || 0);
      if (quantidadeNaComandaPorProdutoId(comanda, prod.id) + delta > estDisp) { mostrarAviso(`Estoque insuficiente.`, true); return; }
      const precoCentavos = paraCentavos(Number(prod.preco) || 0);
      if (idxExistente >= 0) comanda.itens[idxExistente].quantidade += delta;
      else comanda.itens.push({ id: gerarId(), produtoId: String(prod.id), nome: prod.nome, quantidade: delta, valorUnitarioCentavos: precoCentavos, adicionadoEm: new Date().toISOString() });
    } else if (delta < 0 && idxExistente >= 0) {
      const atual = Number(comanda.itens[idxExistente].quantidade) || 1;
      if (atual + delta <= 0) comanda.itens.splice(idxExistente, 1); else comanda.itens[idxExistente].quantidade = atual + delta;
    }
    salvarEstadoLocal(); renderizarComandas(); renderizarItensComanda(comanda); renderizarGradeEstoqueComanda();
  }

  async function validarEstoqueAntesDeFechar(comanda) {
    await carregarProdutosEstoqueDisponiveis();
    const faltando = []; const agregados = new Map();
    (comanda.itens || []).forEach(it => { if (!it.produtoId) return; const pid = String(it.produtoId); agregados.set(pid, (agregados.get(pid) || 0) + (Number(it.quantidade) || 1)); });
    agregados.forEach((qtd, pid) => {
      const prod = produtosEstoqueCache.find(p => String(p.id) === pid);
      if (!prod) faltando.push(`Produto não existe mais no estoque.`);
      else if (qtd > Number(prod.quantidade)) faltando.push(`${prod.nome}: pede ${qtd}, tem ${prod.quantidade}`);
    });
    return faltando;
  }

  async function darBaixaEstoqueAoFecharComanda(comanda) {
    const itens = Array.isArray(comanda?.itens) ? comanda.itens : []; if (!itens.length) return;
    const agregados = new Map();
    itens.forEach(item => { if (!item || !item.produtoId) return; const pid = String(item.produtoId); agregados.set(pid, (agregados.get(pid) || 0) + (Math.max(1, parseInt(item.quantidade, 10) || 1))); });

    const momento = obterDataHoraOperacional();
    const { chaveEstoque, chaveMov } = encontrarChavesEstoqueLocal();

    if (chaveEstoque) {
      try {
        const listaProdutos = JSON.parse(localStorage.getItem(chaveEstoque) || '[]');
        let movs = []; if (chaveMov) try { movs = JSON.parse(localStorage.getItem(chaveMov) || '[]'); } catch (_) {}
        agregados.forEach((qtdBaixa, pid) => {
          const prod = listaProdutos.find(p => String(p.id) === pid); if (!prod) return;
          const ant = Math.max(0, Number(prod.quantidade) || 0); const nova = Math.max(0, ant - qtdBaixa); prod.quantidade = nova;
          if (ant - nova > 0 && chaveMov) movs.push({ id: gerarId(), produtoId: prod.id, produtoNome: prod.nome, tipo: 'saida', quantidade: ant - nova, quantidadeAnterior: ant, quantidadeNova: nova, observacao: `Fechamento ${comanda.mesaNome}`, data: momento.dataChave, hora: momento.horaCompleta });
        });
        localStorage.setItem(chaveEstoque, JSON.stringify(listaProdutos)); if (chaveMov) localStorage.setItem(chaveMov, JSON.stringify(movs));
      } catch (e) { console.error(e); }
    }

    if (window.EstoqueSupabase && typeof window.EstoqueSupabase.salvarProduto === 'function') {
      try {
        await window.EstoqueSupabase.obterComercioId(); const remotos = await window.EstoqueSupabase.carregarProdutos();
        for (const [pid, qtdBaixa] of agregados.entries()) {
          const prod = remotos.find(p => String(p.id) === pid); if (!prod) continue;
          const ant = Number(prod.quantidade) || 0; const nova = Math.max(0, ant - qtdBaixa);
          await window.EstoqueSupabase.salvarProduto({ ...prod, quantidade: nova });
          await window.EstoqueSupabase.salvarMovimentacao({ produtoId: prod.id, produtoNome: prod.nome, tipo: 'saida', quantidade: qtdBaixa, quantidadeAnterior: ant, quantidadeNova: nova, data: momento.dataChave, hora: momento.horaCompleta, observacao: `Fechamento ${comanda.mesaNome}` });
        }
      } catch (e) { console.error(e); }
    }
    await carregarProdutosEstoqueDisponiveis(); preencherSelectProdutosComanda(); renderizarGradeEstoqueComanda();
  }

  function totalComandaCentavos(comanda) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens.reduce((acc, item) => acc + (Math.max(1, Number(item.quantidade) || 1) * (Number(item.valorUnitarioCentavos) || 0)), 0);
  }

  function quantidadeItensComanda(comanda) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens.reduce((acc, item) => acc + (Math.max(1, Number(item.quantidade) || 1)), 0);
  }

  function abrirModal(id) { const el = $(id); if (el) { el.classList.add('aberto'); el.setAttribute('aria-hidden', 'false'); } }
  function fecharModal(id) { const el = $(id); if (el) { el.classList.remove('aberto'); el.setAttribute('aria-hidden', 'true'); if (id === 'modalLeitorQrComanda') pararCameraQr(); } }

  function gerarDataUrlQrCode(texto, tamanhoModulo = 4) {
    if (typeof window.qrcode !== 'function') return '';
    try { const qr = window.qrcode(0, 'M'); qr.addData(String(texto)); qr.make(); return qr.createDataURL(tamanhoModulo, 4); } catch (_) { return ''; }
  }

  // ============================================================
  // FUNÇÕES DO WHATSAPP (ENVIO DO QR PARA O CLIENTE)
  // ============================================================
  async function enviarQrParaCliente(comanda) {
    let path = window.location.pathname;
    if (path.includes('comandas.html')) path = path.replace('comandas.html', 'entrega.html');
    else path = '/entrega.html';
    
    const urlBase = window.location.origin + path;
    const linkEntrega = `${urlBase}?id=${comanda.id}`;
    const qrUrl = gerarDataUrlQrCode(linkEntrega, 5);
    
    const texto = `Olá ${comanda.clienteNome || 'cliente'}! Aqui está o QR Code do seu pedido.\n\nTotal: ${formatarDinheiro(totalComandaCentavos(comanda))}\n\nApresente este código ao entregador para confirmar a entrega.`;
    
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const file = new File([blob], `pedido-qrcode.png`, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR Code do Pedido', text: texto });
      } else {
        const janela = window.open('', '_blank');
        janela.document.write(`
          <html><head><title>Enviar QR Code</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family:Arial; padding:20px; text-align:center;">
            <h2>QR Code do Pedido</h2>
            <p style="color:#64748b; font-size:14px;">${texto.replace(/\n/g, '<br>')}</p>
            <img src="${qrUrl}" style="width:250px;height:250px; margin:20px auto; display:block; border:1px solid #ccc; border-radius:10px;"/>
            <a href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" style="display:inline-block; background:#25D366; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:bold;">Abrir WhatsApp</a>
            <p style="font-size:12px; color:#94a3b8; margin-top:20px;">Tire um print do QR Code e envie junto com a mensagem.</p>
          </body></html>
        `);
      }
    } catch (err) {
      window.open('https://wa.me/?text=' + encodeURIComponent(texto), '_blank');
    }
  }

  // ============================================================
  // FUNÇÕES DE LEITURA DE ENTREGA (APP DO ENTREGADOR)
  // ============================================================
  async function buscarDadosEntrega(idOuCodigo) {
    let comanda = comandas.find(c => c.id === idOuCodigo || c.codigoQr === idOuCodigo);
    
    if (!comanda && window.supabaseClient) {
      try {
        const { data } = await window.supabaseClient.from('comandas_abertas').select('*').or(`id.eq.${idOuCodigo},codigo_qr.eq.${idOuCodigo}`).single();
        if (data) {
          comanda = { id: data.id, mesaNome: data.mesa_nome, clienteNome: data.cliente_nome, itens: data.itens, status: data.status, formaPagamento: data.forma_pagamento, totalFechadoCentavos: data.total * 100 };
        }
      } catch(e) {}
    }
    
    if (!comanda) { alert('Pedido não encontrado para este QR Code.'); return; }
    exibirResultadoEntrega(comanda);
  }

  function exibirResultadoEntrega(c) {
    const itensHtml = (c.itens || []).map(it => {
      const qtd = Number(it.quantidade) || 1; const unit = Number(it.valorUnitarioCentavos) || 0;
      return `<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;"><span>${qtd}x ${it.nome}</span><strong>${formatarDinheiro(qtd * unit)}</strong></div>`;
    }).join('');
    
    const totalC = c.totalFechadoCentavos || totalComandaCentavos(c);
    const pago = c.status === 'fechada';
    
    $('conteudoResultadoEntrega').innerHTML = `
      <div style="background:${pago ? '#eaf8f0' : '#fff4d8'};padding:12px;border-radius:12px;margin-bottom:16px;text-align:center;">
        <strong style="display:block;font-size:18px;color:${pago ? '#147844' : '#a26b00'};">${pago ? '✓ PEDIDO PAGO' : '⏳ PEDIDO EM ABERTO'}</strong>
        <span style="font-size:12px;color:#64748b;">${pago ? 'Forma: ' + (c.formaPagamento || c.forma_pagamento || 'Não informada') : 'Aguardando pagamento'}</span>
      </div>
      <div style="margin-bottom:16px;">
        <span style="font-size:12px;color:#64748b;font-weight:800;">CLIENTE</span>
        <strong style="display:block;font-size:16px;">${c.clienteNome || c.cliente_nome || 'Não informado'}</strong>
        <span style="font-size:12px;color:#64748b;">Pedido: ${c.mesaNome || c.mesa_nome}</span>
      </div>
      <div style="border-top:1px solid #e1e9e5;border-bottom:1px solid #e1e9e5;padding:12px 0;margin-bottom:12px;">
        <span style="font-size:12px;color:#64748b;font-weight:800;display:block;margin-bottom:8px;">ITENS DO PEDIDO</span>
        ${itensHtml || '<span style="color:#94a3b8;font-size:13px;">Nenhum item.</span>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:15px;">Total</strong>
        <strong style="font-size:22px;color:#168b53;">${formatarDinheiro(totalC)}</strong>
      </div>
    `;
    
    abrirModal('modalResultadoEntrega');
    
    $('btnConfirmarEntrega').onclick = () => {
      alert('Entrega confirmada com sucesso!');
      fecharModal('modalResultadoEntrega');
    };
  }

  // ============================================================
  // RENDERIZAÇÃO E UI
  // ============================================================
  function renderizarComandas() {
    const abertas = comandas.filter(c => c.status === 'aberta');
    const totalAbertoC = abertas.reduce((soma, c) => soma + totalComandaCentavos(c), 0);

    if ($('comandasQtdAbertas')) $('comandasQtdAbertas').textContent = String(abertas.length);
    if ($('comandasTotalAberto')) $('comandasTotalAberto').textContent = formatarDinheiro(totalAbertoC);

    const lista = $('listaComandasAbertas'); if (!lista) return;

    if (!abertas.length) { lista.innerHTML = `<div class="comanda-vazio"><strong>Nenhuma comanda aberta</strong><span>Toque em "+ Nova comanda".</span></div>`; return; }

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
            <span>${c.clienteNome ? 'Cliente: ' + escaparHTML(c.clienteNome) : 'Sem nome'}</span>
            <span>${qtdItens} itens</span>
          </div>
          <div class="comanda-card-acoes" style="grid-template-columns: 1fr 1fr;">
            <button type="button" data-acao-comanda="abrir" data-id="${escaparHTML(c.id)}">＋ Itens</button>
            <button type="button" data-acao-comanda="enviar_qr" data-id="${escaparHTML(c.id)}" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd;">📲 QR Cliente</button>
            <button type="button" class="fechar" data-acao-comanda="fechar" data-id="${escaparHTML(c.id)}">✓ Fechar</button>
            <button type="button" data-acao-comanda="excluir" data-id="${escaparHTML(c.id)}" style="background:#fff0f0;color:#d94b4b;border-color:#f3d6d6;">🗑 Excluir</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function abrirDetalhesComanda(comandaId) {
    const comanda = comandas.find(c => c.id === comandaId); if (!comanda) return mostrarAviso('Comanda não encontrada.', true);
    comandaAtivaId = comanda.id;
    if ($('detalheComandaTitulo')) $('detalheComandaTitulo').textContent = `${comanda.mesaNome} — ${comanda.status === 'aberta' ? 'Aberta' : 'Fechada'}`;
    if ($('detalheComandaSubtitulo')) {
      const partes = [`QR: ${comanda.codigoQr}`]; if (comanda.clienteNome) partes.push(`Cliente: ${comanda.clienteNome}`);
      $('detalheComandaSubtitulo').textContent = partes.join(' · ');
    }
    if ($('formAdicionarItemComanda')) $('formAdicionarItemComanda').style.display = comanda.status === 'aberta' ? 'grid' : 'none';
    if ($('btnToggleGradeEstoqueComanda')) $('btnToggleGradeEstoqueComanda').style.display = comanda.status === 'aberta' ? 'flex' : 'none';
    if ($('painelGradeEstoqueComanda') && comanda.status !== 'aberta') $('painelGradeEstoqueComanda').style.display = 'none';
    if ($('btnFecharComandaConta')) $('btnFecharComandaConta').disabled = comanda.status !== 'aberta';
    if (comanda.status === 'aberta') { await carregarProdutosEstoqueDisponiveis(); preencherSelectProdutosComanda(); renderizarGradeEstoqueComanda(); }
    renderizarItensComanda(comanda); abrirModal('modalDetalhesComanda');
  }

  function renderizarItensComanda(comanda) {
    const container = $('detalheComandaItens'); if (!container) return;
    const itens = Array.isArray(comanda.itens) ? comanda.itens : [];
    if (!itens.length) { container.innerHTML = '<div style="font-size:13px;color:#64748b;text-align:center;padding:8px 0;">Nenhum item adicionado.</div>'; }
    else {
      container.innerHTML = itens.map((item, idx) => {
        const qtd = Math.max(1, Number(item.quantidade) || 1); const unitC = Number(item.valorUnitarioCentavos) || 0;
        return `<div class="comanda-item-linha"><div><strong>${escaparHTML(item.nome)}</strong><small style="display:block;color:#64748b;">${qtd}x ${formatarDinheiro(unitC)}</small></div><div style="display:flex;align-items:center;gap:8px;"><strong>${formatarDinheiro(qtd * unitC)}</strong>${comanda.status === 'aberta' ? `<button type="button" data-remover-item-idx="${idx}" style="border:0;background:#fff0f0;color:#d94b4b;border-radius:6px;padding:4px 7px;cursor:pointer;">✕</button>` : ''}</div></div>`;
      }).join('');
    }
    if ($('detalheComandaTotal')) $('detalheComandaTotal').textContent = formatarDinheiro(totalComandaCentavos(comanda));
  }

  function criarComanda({ numeroMesa, codigoQr, clienteNome }) {
    const mesa = vincularOuAtualizarMesa(numeroMesa, codigoQr);
    const jaAberta = comandas.find(c => c.status === 'aberta' && (c.mesaId === mesa.id || c.codigoQr === mesa.codigoQr));
    if (jaAberta) { mostrarAviso(`Já existe comanda para ${mesa.nome}.`); return jaAberta; }
    const nova = { id: gerarId(), mesaId: mesa.id, mesaNome: mesa.nome, codigoQr: mesa.codigoQr, clienteNome: String(clienteNome || '').trim(), status: 'aberta', itens: [], abertoEm: new Date().toISOString() };
    comandas.unshift(nova); salvarEstadoLocal(); renderizarComandas(); return nova;
  }

  function adicionarItemComanda(comandaId, { produtoId = null, nome, quantidade, valorUnitario }) {
    const comanda = comandas.find(c => c.id === comandaId && c.status === 'aberta'); if (!comanda) return mostrarAviso('Comanda fechada.', true);
    const nomeLimpo = String(nome || '').trim(); const qtd = Math.max(1, parseInt(quantidade, 10) || 1); const valorC = paraCentavos(valorUnitario);
    if (!nomeLimpo || valorC <= 0) return mostrarAviso('Informe nome e valor.', true);
    if (produtoId) { const prod = produtosEstoqueCache.find(p => String(p.id) === String(produtoId)); if (prod) { if (quantidadeNaComandaPorProdutoId(comanda, produtoId) + qtd > Number(prod.quantidade)) return mostrarAviso(`Estoque insuficiente.`, true); } }
    comanda.itens.push({ id: gerarId(), produtoId: produtoId ? String(produtoId) : null, nome: nomeLimpo, quantidade: qtd, valorUnitarioCentavos: valorC, adicionadoEm: new Date().toISOString() });
    salvarEstadoLocal(); renderizarComandas(); renderizarItensComanda(comanda); renderizarGradeEstoqueComanda(); mostrarAviso(`Adicionado: ${qtd}x ${nomeLimpo}`);
  }

  async function excluirComanda(comandaId) {
    const idx = comandas.findIndex(c => String(c.id) === String(comandaId)); if (idx < 0) return;
    const comanda = comandas[idx];
    if (window.DrTrocoSeguranca?.verificarPIN) { try { await window.DrTrocoSeguranca.verificarPIN('Autorizar Exclusão'); } catch (_) { return; } }
    if (!confirm(`Excluir comanda de ${comanda.mesaNome}?`)) return;
    comandas.splice(idx, 1);
    if (comandaAtivaId === comanda.id) { comandaAtivaId = null; fecharModal('modalDetalhesComanda'); }
    if (window.supabaseClient) { try { await window.supabaseClient.from('comandas_abertas').delete().eq('id', comanda.id); } catch(e){} }
    salvarEstadoLocal(); renderizarComandas(); mostrarAviso('Comanda excluída.');
  }

  async function fecharComandaConta(comandaId, formaPagamento = 'dinheiro') {
    const comanda = comandas.find(c => c.id === comandaId && c.status === 'aberta'); if (!comanda) return;
    const totalC = totalComandaCentavos(comanda); if (totalC <= 0) return mostrarAviso('Adicione itens antes.', true);
    const faltando = await validarEstoqueAntesDeFechar(comanda);
    if (faltando.length && !confirm('Estoque insuficiente:\n' + faltando.join('\n') + '\n\nFechar mesmo assim?')) return;

    await darBaixaEstoqueAoFecharComanda(comanda);
    const vendaSalva = await registrarComandaNoHistoricoComoVenda(comanda, totalC, formaPagamento);

    comanda.status = 'fechada'; comanda.formaPagamento = formaPagamento; comanda.fechadoEm = new Date().toISOString(); comanda.totalFechadoCentavos = totalC; comanda.vendaHistoricoId = vendaSalva?.id || null;
    salvarEstadoLocal();
    
    if (window.supabaseClient) {
      try { await window.supabaseClient.from('comandas_abertas').update({ status: 'fechada', forma_pagamento: formaPagamento, total: totalC / 100, itens: comanda.itens }).eq('id', comanda.id); } catch(e){}
    }

    renderizarComandas(); fecharModal('modalDetalhesComanda'); comandaAtivaId = null;
    mostrarAviso(`Comanda fechada! Total: ${formatarDinheiro(totalC)}`);
  }

  function processarCodigoQrLido(codigoLido) {
    let limpo = codigoLido.trim();
    if (limpo.includes('?mesa=')) limpo = limpo.split('?mesa=')[1];
    if (limpo.includes('?id=')) limpo = limpo.split('?id=')[1];
    if (!limpo) return mostrarAviso('QR vazio.', true);
    fecharModal('modalLeitorQrComanda');

    if (modoLeitor === 'entrega') {
      buscarDadosEntrega(limpo);
      return;
    }

    const aberta = comandas.find(c => c.status === 'aberta' && (normalizarCodigo(c.codigoQr) === limpo || c.id === limpo));
    if (aberta) return abrirDetalhesComanda(aberta.id);

    const mesaVinculada = mesas.find(m => m.codigoQr === limpo || limpo.includes(m.codigoQr));
    if ($('inputNumeroMesa')) $('inputNumeroMesa').value = mesaVinculada ? mesaVinculada.nome : '';
    if ($('inputCodigoQrMesa')) $('inputCodigoQrMesa').value = mesaVinculada ? mesaVinculada.codigoQr : limpo;
    if ($('inputClienteComanda')) $('inputClienteComanda').value = '';
    abrirModal('modalAbrirComanda');
  }

  function pararCameraQr() { if (loopLeituraId) cancelAnimationFrame(loopLeituraId); loopLeituraId = null; if (streamCamera) { streamCamera.getTracks().forEach(t => t.stop()); streamCamera = null; } }

  async function iniciarLeitorQr() {
    abrirModal('modalLeitorQrComanda');
    if ($('inputQrManual')) $('inputQrManual').value = '';
    const video = $('videoQrComanda'), statusEl = $('statusLeitorQr');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (statusEl) statusEl.textContent = 'Câmera indisponível.'; return; }
    if (typeof window.BarcodeDetector !== 'function') { if (statusEl) statusEl.textContent = 'Navegador não suporta leitor (iOS). Use o campo manual.'; return; }

    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      streamCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (video) { video.srcObject = streamCamera; await video.play(); }
      if (statusEl) statusEl.textContent = 'Aponte para o QR Code...';
      const tick = async () => {
        if (!streamCamera || !video || video.readyState < 2) { loopLeituraId = requestAnimationFrame(tick); return; }
        try {
          const codigos = await detector.detect(video);
          if (codigos.length > 0 && codigos[0].rawValue) { processarCodigoQrLido(codigos[0].rawValue); return; }
        } catch (_) {}
        loopLeituraId = requestAnimationFrame(tick);
      };
      loopLeituraId = requestAnimationFrame(tick);
    } catch (_) { if (statusEl) statusEl.textContent = 'Permissão negada.'; }
  }

  function renderizarGridQrMesas() {
    const container = $('gridQrMesas'); if (!container) return;
    if (!mesas.length) { container.innerHTML = '<div class="comanda-vazio"><strong>Nenhuma mesa cadastrada</strong></div>'; return; }
    container.innerHTML = mesas.map(m => {
      const imgSrc = gerarDataUrlQrCode(m.codigoQr, 3);
      return `<div class="qr-mesa-card"><strong>${escaparHTML(m.nome)}</strong>${imgSrc ? `<img src="${imgSrc}" style="width:108px;height:108px;">` : ''}<small>${escaparHTML(m.codigoQr)}</small></div>`;
    }).join('');
  }

  function imprimirQrMesas() {
    if (!mesas.length) { mostrarAviso('Nenhuma mesa.', true); return; }
    const cardsHtml = mesas.map(m => `<div class="folha-qr"><h2>${escaparHTML(m.nome)}</h2><img src="${gerarDataUrlQrCode(m.codigoQr, 4)}"><p>${escaparHTML(m.codigoQr)}</p></div>`).join('');
    const janela = window.open('', '_blank');
    janela.document.write(`<html><body><div class="grade">${cardsHtml}</div><style>.grade{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.folha-qr{border:1.5px solid #1f3028;border-radius:12px;padding:14px;text-align:center;page-break-inside:avoid}.folha-qr h2{margin:0 0 10px;font-size:18px}.folha-qr img{width:150px;height:150px}.folha-qr p{margin:8px 0 0;font-size:11px;color:#475569}</style><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    janela.document.close();
  }

  function bindEventos() {
    $('btnAbrirNovaComanda')?.addEventListener('click', () => { $('formAbrirComanda')?.reset(); abrirModal('modalAbrirComanda'); });
    $('btnAbrirQrMesas')?.addEventListener('click', () => { renderizarGridQrMesas(); abrirModal('modalQrMesas'); });
    $('btnGerarLoteMesas')?.addEventListener('click', () => { garantirMesasIniciais(parseInt($('inputQtdMesasGerar')?.value || '6', 10)); renderizarGridQrMesas(); });
    $('btnImprimirQrMesas')?.addEventListener('click', imprimirQrMesas);
    
    $('btnLerQrComanda')?.addEventListener('click', () => { modoLeitor = 'comanda'; $('tituloLeitorQr').textContent = 'Ler QR Code da mesa'; iniciarLeitorQr(); });
    $('btnEscanearEntrega')?.addEventListener('click', () => { modoLeitor = 'entrega'; $('tituloLeitorQr').textContent = 'Escanear QR de Entrega'; iniciarLeitorQr(); });
    
    $('btnFecharLeitorQr')?.addEventListener('click', () => fecharModal('modalLeitorQrComanda'));
    $('btnConfirmarQrManual')?.addEventListener('click', () => processarCodigoQrLido($('inputQrManual')?.value || ''));

    document.querySelectorAll('[data-fechar-modal]').forEach(btn => btn.addEventListener('click', () => fecharModal(btn.getAttribute('data-fechar-modal'))));

    $('formAbrirComanda')?.addEventListener('submit', ev => {
      ev.preventDefault();
      const numeroMesa = $('inputNumeroMesa')?.value || ''; if (!numeroMesa.trim()) return mostrarAviso('Informe a mesa.', true);
      const cmd = criarComanda({ numeroMesa, codigoQr: $('inputCodigoQrMesa')?.value || '', clienteNome: $('inputClienteComanda')?.value || '' });
      fecharModal('modalAbrirComanda'); if (cmd) abrirDetalhesComanda(cmd.id);
    });

    $('listaComandasAbertas')?.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao-comanda]'); if (!btn) return;
      const acao = btn.getAttribute('data-acao-comanda'); const id = btn.getAttribute('data-id');
      const cmd = comandas.find(c => c.id === id); if (!cmd) return;

      if (acao === 'abrir' || acao === 'fechar') abrirDetalhesComanda(id);
      else if (acao === 'excluir') excluirComanda(id);
      else if (acao === 'enviar_qr') enviarQrParaCliente(cmd);
    });

    $('btnToggleGradeEstoqueComanda')?.addEventListener('click', async () => {
      const p = $('painelGradeEstoqueComanda'); if (!p) return;
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      if (p.style.display === 'block') { await carregarProdutosEstoqueDisponiveis(); renderizarGradeEstoqueComanda(); }
    });

    $('buscaProdutoEstoqueComanda')?.addEventListener('input', renderizarGradeEstoqueComanda);
    $('gradeProdutosEstoqueComanda')?.addEventListener('click', ev => {
      const m = ev.target.closest('[data-cmd-prod-mais]'), n = ev.target.closest('[data-cmd-prod-menos]');
      if (m) ajustarQuantidadeProdutoNaComanda(m.getAttribute('data-cmd-prod-mais'), 1);
      else if (n) ajustarQuantidadeProdutoNaComanda(n.getAttribute('data-cmd-prod-menos'), -1);
    });

    $('selectProdutoEstoqueComanda')?.addEventListener('change', ev => {
      const prod = produtosEstoqueCache.find(p => String(p.id) === String(ev.target.value)); if (!prod) return;
      if ($('itemNomeComanda')) $('itemNomeComanda').value = prod.nome || '';
      if ($('itemValorComanda')) $('itemValorComanda').value = (Number(prod.preco) || 0).toFixed(2).replace('.', ',');
    });

    $('formAdicionarItemComanda')?.addEventListener('submit', ev => {
      ev.preventDefault(); if (!comandaAtivaId) return;
      adicionarItemComanda(comandaAtivaId, { produtoId: $('selectProdutoEstoqueComanda')?.value || null, nome: $('itemNomeComanda')?.value || '', quantidade: $('itemQtdComanda')?.value || 1, valorUnitario: $('itemValorComanda')?.value || 0 });
      $('formAdicionarItemComanda').reset(); if ($('selectProdutoEstoqueComanda')) $('selectProdutoEstoqueComanda').value = ''; $('itemNomeComanda')?.focus();
    });

    $('detalheComandaItens')?.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-remover-item-idx]'); if (!btn || !comandaAtivaId) return;
      const cmd = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta'); if (!cmd) return;
      cmd.itens.splice(parseInt(btn.getAttribute('data-remover-item-idx'), 10), 1);
      salvarEstadoLocal(); renderizarComandas(); renderizarItensComanda(cmd); renderizarGradeEstoqueComanda();
    });

    $('btnFecharComandaConta')?.addEventListener('click', () => {
      if (!comandaAtivaId) return;
      fecharComandaConta(comandaAtivaId, $('formaPagamentoFechamento')?.value || 'dinheiro');
    });
  }

  function inicializar() {
    carregarEstadoLocal(); bindEventos(); renderizarComandas();
    carregarProdutosEstoqueDisponiveis().then(() => { preencherSelectProdutosComanda(); renderizarGradeEstoqueComanda(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializar);
  else inicializar();
})();
