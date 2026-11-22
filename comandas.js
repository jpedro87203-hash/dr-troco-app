Encontrei o problema! O HTML está perfeito, o problema estava no JavaScript.

O que estava causando o "Carregando..." infinito?

Quando você abre a tela, o HTML mostra um bloco com a frase "Carregando comandas... Aguarde um instante.". O JavaScript deveria apagar esse texto e desenhar os cards das comandas.

Porém, o seu comandas.js estava usando document.addEventListener('DOMContentLoaded', ...). Como o script é carregado no final do <body>, o DOMContentLoaded já tinha disparado antes do script ser lido em algumas situações, e o evento nunca era escutado pelo seu código. Assim, a tela continuava mostrando o texto estático do HTML para sempre.

Para corrigir, basta rodar a inicialização direto, sem esperar o evento DOMContentLoaded.

Peguei o arquivo comandas.js que te mandei anteriormente e alterei apenas as últimas linhas. Copie o código abaixo inteiro e substitua o seu comandas.js:

```javascript
/* ============================================================
   DR. TROCO — COMANDAS & QR CODE POR MESA
   Arquivo: comandas.js (CORRIGIDO)
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

  function obterHorarioCorteConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem(CHAVE_CONFIG_CAIXA) || '{"horarioCorte":"04:00"}');
      return cfg && cfg.horarioCorte ? String(cfg.horarioCorte) : '04:00';
    } catch (_) {
      return '04:00';
    }
  }

  function obterDataHoraOperacional() {
    const agora = new Date();
    const referencia = new Date(agora.getTime());
    const [horaCorte, minutoCorte] = obterHorarioCorteConfig().split(':').map(Number);

    const hAtual = referencia.getHours();
    const mAtual = referencia.getMinutes();

    if (
      Number.isFinite(horaCorte) &&
      (hAtual < horaCorte || (hAtual === horaCorte && mAtual < (Number.isFinite(minutoCorte) ? minutoCorte : 0)))
    ) {
      referencia.setDate(referencia.getDate() - 1);
    }

    const dia = String(referencia.getDate()).padStart(2, '0');
    const mes = String(referencia.getMonth() + 1).padStart(2, '0');
    const ano = referencia.getFullYear();

    const hora = String(agora.getHours()).padStart(2, '0');
    const minuto = String(agora.getMinutes()).padStart(2, '0');
    const segundo = String(agora.getSeconds()).padStart(2, '0');

    return {
      dataChave: `${ano}-${mes}-${dia}`,
      dataFormatada: `${dia}/${mes}/${ano}`,
      horaFormatada: `${hora}:${minuto}`,
      horaCompleta: `${hora}:${minuto}:${segundo}`,
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
      if (codigoQr && mesaExistente.codigoQr !== codigoFinal) {
        const trocar = confirm(
          `A ${mesaExistente.nome} já possui o QR Code "${mesaExistente.codigoQr}".\n\n` +
          `Deseja realmente trocar para "${codigoFinal}"?\n\n` +
          `Se o QR antigo já estiver impresso na mesa, ele deixará de funcionar.`
        );
        if (!trocar) return mesaExistente;
      }
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

  /* =========================================================
     INTEGRAÇÃO COM HISTÓRICO COMO VENDA NO FECHAMENTO
  ========================================================= */

  function montarResumoItensComanda(itens) {
    return itens.map(it => {
      const qtd = Math.max(1, Number(it.quantidade) || 1);
      const unitC = Number(it.valorUnitarioCentavos) || 0;
      return `${qtd}x ${it.nome} (${formatarDinheiro(qtd * unitC)})`;
    }).join(', ');
  }

  async function registrarComandaNoHistoricoComoVenda(comanda, totalCentavos, formaPagamento) {
    const momento = obterDataHoraOperacional();
    const totalReais = Number((totalCentavos / 100).toFixed(2));
    const resumoItens = montarResumoItensComanda(comanda.itens || []);
    const clienteParte = comanda.clienteNome ? ` · ${comanda.clienteNome}` : '';
    const descricao = `${comanda.mesaNome}${clienteParte}${resumoItens ? ` — ${resumoItens}` : ''}`;

    const produtosVenda = (comanda.itens || [])
      .filter(it => it && it.produtoId)
      .map(it => {
        const qtd = Math.max(1, Number(it.quantidade) || 1);
        const preco = Number(((Number(it.valorUnitarioCentavos) || 0) / 100).toFixed(2));
        
        const prodEstoque = produtosEstoqueCache.find(p => String(p.id) === String(it.produtoId));
        const custoBruto = Number(prodEstoque?.precoCusto || 0);
        const qtdEmbalagem = Math.max(1, Number(prodEstoque?.qtdEmbalagem || 1));
        const custoUnit = custoBruto / qtdEmbalagem;
        
        const subtotalCusto = Number((custoUnit * qtd).toFixed(2));
        const lucroItem = Number(((preco * qtd) - subtotalCusto).toFixed(2));
        const margemPct = (preco * qtd) > 0 ? Number(((lucroItem / (preco * qtd)) * 100).toFixed(1)) : 0;

        return {
          id: String(it.produtoId),
          nome: it.nome,
          quantidade: qtd,
          preco: preco,
          custoUnitario: Number(custoUnit.toFixed(4)),
          subtotalCusto,
          lucroItem,
          margemPct
        };
      });

    const totalCusto = produtosVenda.reduce((acc, p) => acc + p.subtotalCusto, 0);
    const lucroBruto = Number((totalReais - totalCusto).toFixed(2));
    const margemPctTotal = totalReais > 0 ? Number(((lucroBruto / totalReais) * 100).toFixed(1)) : 0;

    const registroVenda = {
      id: gerarId(),
      tipo: 'venda',
      categoria: 'venda',
      origem: 'comanda',
      comandaId: comanda.id,
      mesaNome: comanda.mesaNome,
      clienteNome: comanda.clienteNome || '',
      descricao,
      total: totalReais,
      valor: totalReais,
      formaPagamento,
      forma_pagamento: formaPagamento,
      produtos: produtosVenda,
      totalCusto,
      lucroBruto,
      margemPct: margemPctTotal,
      data: momento.dataFormatada,
      dataChave: momento.dataChave,
      dataISO: momento.dataChave,
      dataFormatada: momento.dataFormatada,
      hora: momento.horaFormatada,
      criadoEm: momento.iso
    };

    try {
      const atual = JSON.parse(localStorage.getItem(CHAVE_VENDAS_HISTORICO) || '[]');
      const lista = Array.isArray(atual) ? atual : [];
      lista.unshift(registroVenda);
      localStorage.setItem(CHAVE_VENDAS_HISTORICO, JSON.stringify(lista));
    } catch (_) {}

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarVenda === 'function') {
      try {
        await window.DrTrocoDados.salvarVenda(registroVenda);
      } catch (e) {
        console.warn('[Comandas] Venda salva em drTroco_vendas; falha ao enviar via DrTrocoDados:', e);
      }
    }

    return registroVenda;
  }

  /* =========================================================
     INTEGRAÇÃO COM ESTOQUE (SEM BAIXA AO ADICIONAR ITEM)
  ========================================================= */

  function encontrarChavesEstoqueLocal() {
    let chaveEstoque = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO_ESTOQUE) && !k.includes('_backup_')) {
        chaveEstoque = k;
        break;
      }
    }
    if (!chaveEstoque) return { chaveEstoque: null, chaveMov: null };
    const sufixo = chaveEstoque.slice(PREFIXO_ESTOQUE.length);
    return {
      chaveEstoque,
      chaveMov: `${PREFIXO_MOV_ESTOQUE}${sufixo}`
    };
  }

  async function carregarProdutosEstoqueDisponiveis() {
    if (window.DrTrocoEstoque && typeof window.DrTrocoEstoque.listarProdutosParaComanda === 'function') {
      try {
        const lista = await window.DrTrocoEstoque.listarProdutosParaComanda();
        produtosEstoqueCache = Array.isArray(lista) ? lista : [];
        return produtosEstoqueCache;
      } catch (_) {}
    }

    const { chaveEstoque } = encontrarChavesEstoqueLocal();
    if (!chaveEstoque) {
      produtosEstoqueCache = [];
      return [];
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(chaveEstoque) || '[]');
      produtosEstoqueCache = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      produtosEstoqueCache = [];
    }
    return produtosEstoqueCache;
  }

  function preencherSelectProdutosComanda() {
    const select = $('selectProdutoEstoqueComanda');
    if (!select) return;

    const valorAtual = select.value;
    const opcoes = ['<option value="">Item avulso / manual</option>'];

    produtosEstoqueCache.forEach(prod => {
      const qtdDisp = Math.max(0, Number(prod.quantidade) || 0);
      const precoNum = Number(prod.preco) || 0;
      const labelPreco = precoNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      opcoes.push(
        `<option value="${escaparHTML(prod.id)}">${escaparHTML(prod.nome)} (${labelPreco} · Est: ${qtdDisp})</option>`
      );
    });

    select.innerHTML = opcoes.join('');
    if (valorAtual && produtosEstoqueCache.some(p => String(p.id) === String(valorAtual))) {
      select.value = valorAtual;
    }
  }

  function quantidadeNaComandaPorProdutoId(comanda, produtoId) {
    if (!comanda || !Array.isArray(comanda.itens)) return 0;
    return comanda.itens
      .filter(it => it.produtoId && String(it.produtoId) === String(produtoId))
      .reduce((acc, it) => acc + (Math.max(1, Number(it.quantidade) || 1)), 0);
  }

  function renderizarGradeEstoqueComanda() {
    const grade = $('gradeProdutosEstoqueComanda');
    if (!grade) return;

    const comanda = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta');
    const termo = String($('buscaProdutoEstoqueComanda')?.value || '').trim().toLowerCase();

    const filtrados = produtosEstoqueCache.filter(prod => {
      if (!termo) return true;
      const nome = String(prod.nome || '').toLowerCase();
      const codigo = String(prod.codigo || '').toLowerCase();
      return nome.includes(termo) || codigo.includes(termo);
    });

    if (!filtrados.length) {
      grade.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:16px;color:#64748b;font-size:12px;">
          Nenhum produto encontrado no estoque.
        </div>`;
      return;
    }

    grade.innerHTML = filtrados.map(prod => {
      const qtdNaCmd = quantidadeNaComandaPorProdutoId(comanda, prod.id);
      const estDisp = Math.max(0, Number(prod.quantidade) || 0);
      const precoNum = Number(prod.preco) || 0;
      const precoFmt = precoNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const inicial = String(prod.nome || '?').trim().charAt(0).toUpperCase() || '?';
      const fotoHtml = prod.foto
        ? `<img src="${escaparHTML(prod.foto)}" alt="${escaparHTML(prod.nome)}">`
        : `<span>${escaparHTML(inicial)}</span>`;

      const podeAdicionar = qtdNaCmd < estDisp;

      return `
        <div class="card-prod-comanda">
          <div class="foto-prod-comanda">${fotoHtml}</div>
          <div class="nome-prod-comanda">${escaparHTML(prod.nome)}</div>
          <div class="est-prod-comanda">Estoque: ${estDisp}</div>
          <div class="preco-prod-comanda">${precoFmt}</div>
          <div class="acoes-qtd-comanda">
            <button type="button" data-cmd-prod-menos="${escaparHTML(prod.id)}" ${qtdNaCmd <= 0 ? 'disabled' : ''}>−</button>
            <span>${qtdNaCmd}</span>
            <button type="button" data-cmd-prod-mais="${escaparHTML(prod.id)}" ${!podeAdicionar ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
    }).join('');
  }

  function ajustarQuantidadeProdutoNaComanda(produtoId, delta) {
    const comanda = comandas.find(c => c.id === comandaAtivaId && c.status === 'aberta');
    if (!comanda) return;

    const prod = produtosEstoqueCache.find(p => String(p.id) === String(produtoId));
    if (!prod) return;

    const idxExistente = comanda.itens.findIndex(
      it => it.produtoId && String(it.produtoId) === String(prod.id)
    );

    if (delta > 0) {
      const estDisp = Math.max(0, Number(prod.quantidade) || 0);
      const qtdJaNaComanda = quantidadeNaComandaPorProdutoId(comanda, prod.id);
      if (qtdJaNaComanda + delta > estDisp) {
        mostrarAviso(`Estoque insuficiente: ${prod.nome} (disponível: ${estDisp}).`, true);
        return;
      }

      const precoCentavos = paraCentavos(Number(prod.preco) || 0);
      if (idxExistente >= 0) {
        comanda.itens[idxExistente].quantidade = (Number(comanda.itens[idxExistente].quantidade) || 1) + delta;
      } else {
        comanda.itens.push({
          id: gerarId(),
          produtoId: String(prod.id),
          nome: prod.nome,
          quantidade: delta,
          valorUnitarioCentavos: precoCentavos,
          adicionadoEm: new Date().toISOString()
        });
      }
      salvarEstadoLocal();
      renderizarComandas();
      renderizarItensComanda(comanda);
      renderizarGradeEstoqueComanda();
    } else if (delta < 0 && idxExistente >= 0) {
      const atual = Number(comanda.itens[idxExistente].quantidade) || 1;
      if (atual + delta <= 0) {
        comanda.itens.splice(idxExistente, 1);
      } else {
        comanda.itens[idxExistente].quantidade = atual + delta;
      }
      salvarEstadoLocal();
      renderizarComandas();
      renderizarItensComanda(comanda);
      renderizarGradeEstoqueComanda();
    }
  }

  async function validarEstoqueAntesDeFechar(comanda) {
    await carregarProdutosEstoqueDisponiveis();
    const faltando = [];
    const agregados = new Map();

    (comanda.itens || []).forEach(it => {
      if (!it.produtoId) return;
      const pid = String(it.produtoId);
      agregados.set(pid, (agregados.get(pid) || 0) + (Number(it.quantidade) || 1));
    });

    agregados.forEach((qtd, pid) => {
      const prod = produtosEstoqueCache.find(p => String(p.id) === pid);
      if (!prod) {
        faltando.push(`Produto ID ${pid} não existe mais no estoque.`);
        return;
      }
      const disp = Math.max(0, Number(prod.quantidade) || 0);
      if (qtd > disp) {
        faltando.push(`${prod.nome}: pede ${qtd}, tem ${disp}`);
      }
    });

    return faltando;
  }

  async function darBaixaEstoqueAoFecharComanda(comanda) {
    const itens = Array.isArray(comanda?.itens) ? comanda.itens : [];
    if (!itens.length) return;

    if (window.DrTrocoEstoque && typeof window.DrTrocoEstoque.darBaixaFechamentoComanda === 'function') {
      await window.DrTrocoEstoque.darBaixaFechamentoComanda(itens, comanda.mesaNome);
      await carregarProdutosEstoqueDisponiveis();
      preencherSelectProdutosComanda();
      renderizarGradeEstoqueComanda();
      return;
    }

    const { chaveEstoque, chaveMov } = encontrarChavesEstoqueLocal();
    if (!chaveEstoque) return;

    try {
      const listaProdutos = JSON.parse(localStorage.getItem(chaveEstoque) || '[]');
      if (!Array.isArray(listaProdutos)) return;

      const agregados = new Map();
      itens.forEach(item => {
        if (!item || !item.produtoId) return;
        const pid = String(item.produtoId);
        const qtd = Math.max(1, parseInt(item.quantidade, 10) || 1);
        agregados.set(pid, (agregados.get(pid) || 0) + qtd);
      });

      if (!agregados.size) return;

      const momento = obterDataHoraOperacional();
      let movs = [];
      if (chaveMov) {
        try {
          const mRaw = JSON.parse(localStorage.getItem(chaveMov) || '[]');
          if (Array.isArray(mRaw)) movs = mRaw;
        } catch (_) {}
      }

      agregados.forEach((qtdBaixa, pid) => {
        const prod = listaProdutos.find(p => String(p.id) === pid);
        if (!prod) return;
        const ant = Math.max(0, Number(prod.quantidade) || 0);
        const nova = Math.max(0, ant - qtdBaixa);
        const efetiva = ant - nova;
        prod.quantidade = nova;
        prod.atualizadoEm = new Date().toISOString();

        if (efetiva > 0 && chaveMov) {
          movs.push({
            id: gerarId(),
            produtoId: prod.id,
            produtoNome: prod.nome,
            tipo: 'saida',
            quantidade: efetiva,
            quantidadeAnterior: ant,
            quantidadeNova: nova,
            observacao: `Fechamento ${comanda.mesaNome || 'Comanda'}`,
            data: momento.dataChave,
            hora: momento.horaCompleta
          });
        }
      });

      localStorage.setItem(chaveEstoque, JSON.stringify(listaProdutos));
      if (chaveMov) {
        localStorage.setItem(chaveMov, JSON.stringify(movs));
      }
      await carregarProdutosEstoqueDisponiveis();
      preencherSelectProdutosComanda();
      renderizarGradeEstoqueComanda();
    } catch (_) {}
  }

  /* =========================================================
     CÁLCULOS E COMANDAS
  ========================================================= */

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
            <button type="button" data-acao-comanda="excluir" data-id="${escaparHTML(c.id)}" style="background:#fff0f0;color:#d94b4b;border-color:#f3d6d6;">🗑 Excluir</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async function abrirDetalhesComanda(comandaId) {
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
    if ($('btnToggleGradeEstoqueComanda')) {
      $('btnToggleGradeEstoqueComanda').style.display = comanda.status === 'aberta' ? 'flex' : 'none';
    }
    if ($('painelGradeEstoqueComanda') && comanda.status !== 'aberta') {
      $('painelGradeEstoqueComanda').style.display = 'none';
    }
    if ($('btnFecharComandaConta')) {
      $('btnFecharComandaConta').disabled = comanda.status !== 'aberta';
    }

    if (comanda.status === 'aberta') {
      await carregarProdutosEstoqueDisponiveis();
      preencherSelectProdutosComanda();
      renderizarGradeEstoqueComanda();
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
        const tagEstoque = item.produtoId ? ' · Estoque (baixa no fechamento)' : ' · Avulso';
        return `
          <div class="comanda-item-linha">
            <div>
              <strong>${escaparHTML(item.nome)}</strong>
              <small style="display:block;color:#64748b;">${qtd}x ${formatarDinheiro(unitC)}${escaparHTML(tagEstoque)}</small>
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

  function adicionarItemComanda(comandaId, { produtoId = null, nome, quantidade, valorUnitario }) {
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

    if (produtoId) {
      const prod = produtosEstoqueCache.find(p => String(p.id) === String(produtoId));
      if (prod) {
        const estDisp = Math.max(0, Number(prod.quantidade) || 0);
        const qtdJaNaComanda = quantidadeNaComandaPorProdutoId(comanda, produtoId);
        if (qtdJaNaComanda + qtd > estDisp) {
          mostrarAviso(`Estoque insuficiente: ${prod.nome} (disponível: ${estDisp - qtdJaNaComanda}).`, true);
          return;
        }
      }
    }

    comanda.itens.push({
      id: gerarId(),
      produtoId: produtoId ? String(produtoId) : null,
      nome: nomeLimpo,
      quantidade: qtd,
      valorUnitarioCentavos: valorC,
      adicionadoEm: new Date().toISOString()
    });

    salvarEstadoLocal();
    renderizarComandas();
    renderizarItensComanda(comanda);
    renderizarGradeEstoqueComanda();
    mostrarAviso(`Adicionado à comanda: ${qtd}x ${nomeLimpo} (baixa só ao fechar)`);
  }

  async function excluirComanda(comandaId) {
    const idx = comandas.findIndex(c => String(c.id) === String(comandaId));
    if (idx < 0) {
      mostrarAviso('Comanda não encontrada.', true);
      return false;
    }

    const comanda = comandas[idx];
    const totalC = totalComandaCentavos(comanda);
    const clienteInfo = comanda.clienteNome ? ` (${comanda.clienteNome})` : '';

    if (window.DrTrocoSeguranca && typeof window.DrTrocoSeguranca.verificarPIN === 'function') {
      try {
        await window.DrTrocoSeguranca.verificarPIN('Autorizar Exclusão de Comanda');
      } catch (_) {
        return false;
      }
    }

    let avisoExtra = '';
    if (comanda.status === 'fechada') {
      avisoExtra = '\n\n⚠️ Esta comanda já foi FECHADA.\nA baixa de estoque NÃO será revertida automaticamente.\nSe quiser repor o estoque, exclua a venda pelo Histórico.';
    }

    const confirmado = confirm(
      `Deseja excluir a comanda de ${comanda.mesaNome}${clienteInfo}?\n` +
      `Total: ${formatarDinheiro(totalC)}${avisoExtra}`
    );
    if (!confirmado) return false;

    comandas.splice(idx, 1);
    if (comandaAtivaId === comanda.id) {
      comandaAtivaId = null;
      fecharModal('modalDetalhesComanda');
    }

    salvarEstadoLocal();
    renderizarComandas();
    mostrarAviso(`${comanda.mesaNome} excluída.`);
    return true;
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

    const faltando = await validarEstoqueAntesDeFechar(comanda);
    if (faltando.length) {
      const continuar = confirm(
        '⚠️ O estoque atual é insuficiente para:\n\n' + faltando.join('\n') +
        '\n\nIsso pode acontecer se outro dispositivo vendeu o mesmo produto.\n\nDeseja fechar a comanda mesmo assim? (O estoque ficará zerado)'
      );
      if (!continuar) return;
    }

    await darBaixaEstoqueAoFecharComanda(comanda);
    const vendaSalva = await registrarComandaNoHistoricoComoVenda(comanda, totalC, formaPagamento);

    comanda.status = 'fechada';
    comanda.formaPagamento = formaPagamento;
    comanda.fechadoEm = new Date().toISOString();
    comanda.totalFechadoCentavos = totalC;
    comanda.vendaHistoricoId = vendaSalva?.id || null;

    salvarEstadoLocal();
    renderizarComandas();
    fecharModal('modalDetalhesComanda');
    comandaAtivaId = null;
    mostrarAviso(`${comanda.mesaNome} fechada (${formatarDinheiro(totalC)} · ${formaPagamento}). Salva como venda no histórico.`);
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
      setTimeout(() => $('inputQrManual')?.focus(), 300);
      return;
    }

    if (typeof window.BarcodeDetector !== 'function') {
      if (statusEl) statusEl.textContent = 'Este navegador não suporta leitura automática (iOS/Safari). Use o campo abaixo para digitar o código.';
      setTimeout(() => $('inputQrManual')?.focus(), 300);
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
      setTimeout(() => $('inputQrManual')?.focus(), 300);
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
      } else if (acao === 'excluir') {
        excluirComanda(id);
      }
    });

    $('btnToggleGradeEstoqueComanda')?.addEventListener('click', async () => {
      const painel = $('painelGradeEstoqueComanda');
      if (!painel) return;
      const vaiAbrir = painel.style.display === 'none' || !painel.style.display;
      painel.style.display = vaiAbrir ? 'block' : 'none';
      if (vaiAbrir) {
        await carregarProdutosEstoqueDisponiveis();
        renderizarGradeEstoqueComanda();
        $('buscaProdutoEstoqueComanda')?.focus();
      }
    });

    $('buscaProdutoEstoqueComanda')?.addEventListener('input', () => {
      renderizarGradeEstoqueComanda();
    });

    $('gradeProdutosEstoqueComanda')?.addEventListener('click', ev => {
      const btnMais = ev.target.closest('[data-cmd-prod-mais]');
      if (btnMais) {
        ajustarQuantidadeProdutoNaComanda(btnMais.getAttribute('data-cmd-prod-mais'), 1);
        return;
      }
      const btnMenos = ev.target.closest('[data-cmd-prod-menos]');
      if (btnMenos) {
        ajustarQuantidadeProdutoNaComanda(btnMenos.getAttribute('data-cmd-prod-menos'), -1);
      }
    });

    $('selectProdutoEstoqueComanda')?.addEventListener('change', ev => {
      const pid = ev.target.value;
      if (!pid) return;
      const prod = produtosEstoqueCache.find(p => String(p.id) === String(pid));
      if (!prod) return;
      if ($('itemNomeComanda')) $('itemNomeComanda').value = prod.nome || '';
      if ($('itemValorComanda')) {
        const precoNum = Number(prod.preco) || 0;
        $('itemValorComanda').value = precoNum > 0 ? precoNum.toFixed(2).replace('.', ',') : '';
      }
      if ($('itemQtdComanda') && !String($('itemQtdComanda').value || '').trim()) {
        $('itemQtdComanda').value = '1';
      }
    });

    $('formAdicionarItemComanda')?.addEventListener('submit', ev => {
      ev.preventDefault();
      if (!comandaAtivaId) return;
      const produtoId = $('selectProdutoEstoqueComanda')?.value || null;
      adicionarItemComanda(comandaAtivaId, {
        produtoId,
        nome: $('itemNomeComanda')?.value || '',
        quantidade: $('itemQtdComanda')?.value || 1,
        valorUnitario: $('itemValorComanda')?.value || 0
      });
      if ($('selectProdutoEstoqueComanda')) $('selectProdutoEstoqueComanda').value = '';
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
      renderizarGradeEstoqueComanda();
      mostrarAviso('Item removido da comanda.');
    });

    $('btnFecharComandaConta')?.addEventListener('click', () => {
      if (!comandaAtivaId) return;
      const forma = $('formaPagamentoFechamento')?.value || 'dinheiro';
      fecharComandaConta(comandaAtivaId, forma);
    });
  }

  /* =========================================================
     INICIALIZAÇÃO DIRETA (Sem esperar DOMContentLoaded)
  ========================================================= */
  function inicializar() {
    try {
      carregarEstadoLocal();
      bindEventos();
      renderizarComandas(); // Força a troca da tela "Carregando..." imediatamente
      
      // Busca estoque em background
      carregarProdutosEstoqueDisponiveis().then(() => {
        preencherSelectProdutosComanda();
        renderizarGradeEstoqueComanda();
      }).catch(e => {
        console.warn('[Comandas] Erro ao carregar estoque em background:', e);
      });
    } catch (erro) {
      console.error('[Comandas] Erro fatal:', erro);
      const lista = document.getElementById('listaComandasAbertas');
      if (lista) {
        lista.innerHTML = `
          <div class="comanda-vazio" style="border-color:#f3d6d6;color:#d94b4b;">
            <strong>Erro ao carregar</strong>
            <span>${erro.message}</span>
            <br><br>
            <button onclick="location.reload()" style="padding:8px 16px;background:#20a767;color:#fff;border:0;border-radius:8px;">Recarregar</button>
          </div>`;
      }
    }
  }

  // Se o HTML já estiver carregado, roda imediatamente; se não, aguarda.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

  window.DrTrocoComandas = {
    criarComanda,
    adicionarItemComanda,
    excluirComanda,
    fecharComandaConta,
    processarCodigoQrLido,
    renderizarComandas
  };
})();
```
