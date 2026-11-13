/* =========================================================
   DR. TROCO — CONTAS A PAGAR (SUPABASE)
   Fonte da verdade: public.contas_pagar
   Espelho/fallback: localStorage (drTroco_contasPagar)
   Caixa: Supabase via DrTrocoDados (fallback local)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoContasInicializado) return;
  window.__drTrocoContasInicializado = true;

  const TAB = 'contas_pagar';
  const CHAVE_LOCAL = 'drTroco_contasPagar';
  const CHAVE_MOV = 'drTroco_movimentacoes';

  const estado = {
    pronto: false,
    carregando: false,
    erro: null,
    contas: [],
    usuario: null
  };
  let promessaCarga = null;
  let filtroAtual = 'pendentes';

  const $ = (id) => document.getElementById(id);

  function getSupa() {
    if (!window.supabaseClient) throw new Error('Cliente Supabase não inicializado.');
    return window.supabaseClient;
  }

  async function getUsuario() {
    if (estado.usuario) return estado.usuario;
    const { data: { user }, error } = await getSupa().auth.getUser();
    if (error || !user) throw new Error('Usuário não autenticado.');
    estado.usuario = user;
    return user;
  }

  function gerarId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'cp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function dataHojeISO() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function dataHojeBR() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatarReal(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(iso) {
    if (!iso) return 'Sem vencimento';
    const p = String(iso).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  function escaparHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  /* ---- Mapeamento ---- */

  function contaDoBanco(row) {
    return {
      id: String(row.id),
      descricao: row.descricao || '',
      valor: Number(row.valor) || 0,
      vencimento: row.vencimento || '',
      criadaEm: row.criado_em ? String(row.criado_em).slice(0, 10) : '',
      paga: !!row.paga,
      dataPagamento: row.data_pagamento || null,
      formaPagamento: row.forma_pagamento || null,
      movimentoId: row.movimento_id || null
    };
  }

  function contaParaBanco(c) {
    return {
      id: String(c.id),
      usuario_id: estado.usuario.id,
      descricao: String(c.descricao).trim(),
      valor: Number(c.valor),
      vencimento: c.vencimento,
      paga: !!c.paga,
      data_pagamento: c.dataPagamento || null,
      forma_pagamento: c.formaPagamento || null,
      movimento_id: c.movimentoId || null,
      atualizado_em: new Date().toISOString()
    };
  }

  /* ---- Carregamento + migração ---- */

  async function carregar() {
    if (estado.pronto) return estado.contas;
    if (estado.carregando) return promessaCarga;

    estado.carregando = true;
    estado.erro = null;

    promessaCarga = (async () => {
      try {
        await getUsuario();
        const { data, error } = await getSupa().from(TAB)
          .select('*').eq('usuario_id', estado.usuario.id)
          .order('vencimento', { ascending: true });
        if (error) throw error;

        estado.contas = (data || []).map(contaDoBanco);
        estado.pronto = true;

        await migrarLocaisSeNecessario();
        try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado.contas)); } catch (e) {}

        return estado.contas;
      } catch (err) {
        console.error('[Contas] Falha ao carregar:', err);
        estado.erro = err;

        if (estado.contas.length === 0) {
          try {
            const bruto = localStorage.getItem(CHAVE_LOCAL);
            if (bruto) {
              const arr = JSON.parse(bruto);
              if (Array.isArray(arr)) estado.contas = arr;
            }
          } catch (e) {}
        }
        return estado.contas;
      } finally {
        estado.carregando = false;
        promessaCarga = null;
      }
    })();

    return promessaCarga;
  }

  async function migrarLocaisSeNecessario() {
    let locais;
    try {
      const bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return;
      locais = JSON.parse(bruto);
      if (!Array.isArray(locais) || !locais.length) return;
    } catch (e) { return; }

    const supa = getSupa();
    const user = estado.usuario;
    const ids = new Set(estado.contas.map(c => c.id));
    let migrou = false;

    for (const local of locais) {
      if (!local || !local.descricao) continue;
      const id = String(local.id || gerarId());
      if (ids.has(id)) continue;

      const { error } = await supa.from(TAB).insert({
        id,
        usuario_id: user.id,
        descricao: String(local.descricao).trim(),
        valor: Number(local.valor) || 0,
        vencimento: local.vencimento || dataHojeISO(),
        paga: !!local.paga,
        data_pagamento: local.dataPagamento || null,
        forma_pagamento: local.formaPagamento || null,
        movimento_id: local.movimentoId || null
      });
      if (!error) { ids.add(id); migrou = true; }
    }

    if (migrou) {
      const { data, error } = await supa.from(TAB)
        .select('*').eq('usuario_id', user.id)
        .order('vencimento', { ascending: true });
      if (!error) estado.contas = (data || []).map(contaDoBanco);
    }
  }

  /* ---- Operações ---- */

  async function inserirConta({ descricao, valor, vencimento }) {
    await getUsuario();
    const nova = {
      id: gerarId(),
      descricao: String(descricao).trim(),
      valor: Math.round(Number(valor) * 100) / 100,
      vencimento,
      criadaEm: dataHojeISO(),
      paga: false,
      dataPagamento: null,
      formaPagamento: null,
      movimentoId: null
    };
    const { data, error } = await getSupa().from(TAB)
      .insert(contaParaBanco(nova)).select().single();
    if (error) throw new Error('Falha ao cadastrar conta: ' + error.message);
    estado.contas.push(contaDoBanco(data));
    persistirCacheLocal();
    return data;
  }

  async function marcarComoPaga(id, formaPagamento, movimentoId) {
    await getUsuario();
    const dataHoje = dataHojeISO();
    const { data, error } = await getSupa().from(TAB)
      .update({
        paga: true,
        data_pagamento: dataHoje,
        forma_pagamento: formaPagamento,
        movimento_id: movimentoId,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', String(id)).eq('usuario_id', estado.usuario.id)
      .select().single();
    if (error) throw new Error('Falha ao registrar pagamento: ' + error.message);

    const idx = estado.contas.findIndex(c => c.id === String(id));
    if (idx >= 0) estado.contas[idx] = contaDoBanco(data);
    persistirCacheLocal();
    return data;
  }

  async function removerConta(id) {
    await getUsuario();
    const { error } = await getSupa().from(TAB)
      .delete().eq('id', String(id)).eq('usuario_id', estado.usuario.id);
    if (error) throw new Error('Falha ao excluir conta: ' + error.message);
    estado.contas = estado.contas.filter(c => c.id !== String(id));
    persistirCacheLocal();
  }

  function persistirCacheLocal() {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado.contas)); }
    catch (e) { console.warn('[Contas] Cache local falhou:', e); }
  }

  /* ---- Movimentação de caixa (Supabase via DrTrocoDados) ---- */

  function lerMovimentacoes() {
    if (window.DrTrocoDados && typeof window.DrTrocoDados.movimentacoes === 'function') {
      try {
        const arr = window.DrTrocoDados.movimentacoes();
        if (Array.isArray(arr)) return arr;
      } catch (e) { /* cai no fallback */ }
    }
    try {
      const bruto = localStorage.getItem(CHAVE_MOV);
      if (!bruto) return [];
      const arr = JSON.parse(bruto);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function salvarMovimentacoesLocal(m) {
    try { localStorage.setItem(CHAVE_MOV, JSON.stringify(m)); return true; }
    catch (e) { console.error(e); return false; }
  }

  function obterSessaoAtual() {
    try {
      if (window.DrTrocoCaixa && typeof window.DrTrocoCaixa.current === 'function') {
        return window.DrTrocoCaixa.current();
      }
      if (window.DrTrocoDados && typeof window.DrTrocoDados.sessoes === 'function') {
        const sessoes = window.DrTrocoDados.sessoes();
        return sessoes.find(s => s.status === 'aberto') || null;
      }
      const sessoes = JSON.parse(localStorage.getItem('drTroco_sessoesCaixa') || '[]');
      return sessoes.find(s => s.status === 'aberto') || null;
    } catch (e) {
      return null;
    }
  }

  /* ---- UI ---- */

  function adicionarEstilos() {
    if (document.getElementById('estilosContasPagar')) return;
    const s = document.createElement('style');
    s.id = 'estilosContasPagar';
    s.textContent = `
      .cp-secao { margin:0 0 14px; padding:0; border-radius:16px; background:#fff;
        color:#1f3028; border:1px solid #e1e9e3;
        box-shadow:0 4px 16px rgba(20,80,45,.06); overflow:hidden; }
      .cp-cabecalho { display:flex; align-items:center; gap:12px; width:100%;
        padding:16px; border:0; background:transparent; color:inherit;
        text-align:left; font:inherit; cursor:pointer; }
      .cp-titulo-cabecalho { flex:1; min-width:0; }
      .cp-seta { display:grid; place-items:center; flex-shrink:0;
        width:28px; height:28px; border-radius:9px; background:#eaf8f1;
        color:#168b53; font-size:20px; line-height:1;
        transition:transform .2s ease; }
      .cp-cabecalho[aria-expanded="true"] .cp-seta { transform:rotate(180deg); }
      #conteudoContasPagar[hidden] { display:none !important; }
      .cp-icone { width:44px; height:44px; display:grid; place-items:center;
        border-radius:13px; background:#eaf8f1; font-size:22px; flex-shrink:0; }
      .cp-cabecalho h2 { margin:0 0 4px; font-size:16px; font-weight:900; color:#1f3028; }
      .cp-cabecalho p { margin:0; font-size:12px; color:#7b898f; line-height:1.4; }
      .cp-conteudo { padding:0 16px 16px; }
      .cp-resumos { display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
        gap:8px; margin-bottom:16px; }
      .cp-resumo { padding:12px 8px; border-radius:12px; background:#f2f8f4; min-width:0; }
      .cp-resumo span { display:block; font-size:10px; margin-bottom:6px;
        color:#52685a; font-weight:700; }
      .cp-resumo strong { display:block; font-size:13px; overflow-wrap:anywhere;
        color:#176b3a; }
      .cp-form { display:grid; gap:12px; margin-bottom:16px; padding:14px;
        border:1px solid #e4eee7; border-radius:13px; background:#fafcfb; }
      .cp-form h3 { margin:0; font-size:14px; color:#1f3028; }
      .cp-campo { display:grid; gap:6px; }
      .cp-campo label { font-size:12px; font-weight:700; color:#34483d; }
      .cp-campo input, .cp-campo select {
        box-sizing:border-box; width:100%; min-height:44px; padding:10px 12px;
        border:1px solid #d6e3d9; border-radius:10px; background:#fff;
        color:#203126; font:inherit; font-size:14px; }
      .cp-campo input:focus, .cp-campo select:focus {
        outline:none; border-color:#20a767;
        box-shadow:0 0 0 3px rgba(32,167,103,.12); }
      .cp-btn { border:0; border-radius:10px; min-height:42px;
        padding:10px 14px; font:inherit; font-size:13px; font-weight:700;
        cursor:pointer; }
      .cp-btn-principal { background:#168b53; color:#fff; }
      .cp-btn-pagar { background:#168b53; color:#fff; flex:1; }
      .cp-btn-excluir { background:#fff0f0; color:#b42318; }
      .cp-filtros { display:flex; gap:8px; margin-bottom:12px; }
      .cp-filtro { flex:1; padding:10px 6px; border:1px solid #dce8df;
        border-radius:10px; background:#f5f8f6; color:#355340;
        font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
      .cp-filtro.ativo { background:#168b53; color:#fff; border-color:#168b53; }
      .cp-lista { display:grid; gap:10px; }
      .cp-conta { padding:14px; border:1px solid #e3ece5; border-radius:13px;
        background:#fff; color:#203126; }
      .cp-conta-topo { display:flex; justify-content:space-between;
        align-items:flex-start; gap:10px; }
      .cp-conta-nome { margin:0; font-size:15px; overflow-wrap:anywhere; color:#1f3028; }
      .cp-conta-valor { font-size:15px; font-weight:900; color:#176b3a; white-space:nowrap; }
      .cp-detalhes { display:flex; flex-wrap:wrap; gap:7px 12px;
        margin-top:10px; font-size:12px; color:#607166; }
      .cp-status { display:inline-block; margin-top:10px; padding:5px 8px;
        border-radius:20px; background:#e8f6ed; color:#176b3a;
        font-size:11px; font-weight:700; }
      .cp-status.atrasada { background:#fff0e8; color:#a33a0b; }
      .cp-acoes { display:flex; gap:8px; margin-top:12px; }
      .cp-acoes .cp-btn { flex:1; }
      .cp-vazio { padding:22px 12px; text-align:center; border:1px dashed #d6e3d9;
        border-radius:12px; color:#718076; font-size:13px; }
      .cp-nota { margin:14px 0 0; font-size:11px; line-height:1.5; color:#718076; }
      .cp-erro { padding:12px 14px; border-radius:12px; background:#fff0f0;
        border:1px solid #f0d8d8; color:#b42318; font-size:12px;
        line-height:1.5; margin-bottom:14px; }
      .cp-carregando { padding:20px; text-align:center; color:#718076; font-size:13px; }
      @media (max-width:360px){
        .cp-resumos { gap:5px; }
        .cp-resumo { padding:9px 5px; }
        .cp-resumo strong { font-size:12px; }
        .cp-conta-topo { flex-direction:column; }
      }
    `;
    document.head.appendChild(s);
  }

  function criarInterface() {
    if (document.getElementById('secaoContasPagar')) return;
    const principal = document.querySelector('[data-contas-pagar]') || document.querySelector('main');
    if (!principal) {
      console.error('[Contas] Container não encontrado.');
      return;
    }

    const secao = document.createElement('section');
    secao.id = 'secaoContasPagar';
    secao.className = 'cp-secao';
    secao.innerHTML = `
      <button type="button" class="cp-cabecalho" id="btnToggleContasPagar"
        aria-expanded="false" aria-controls="conteudoContasPagar">
        <span class="cp-icone" aria-hidden="true">🧾</span>
        <span class="cp-titulo-cabecalho">
          <h2>Contas a pagar</h2>
          <p>Organize vencimentos e registre pagamentos no caixa</p>
        </span>
        <span class="cp-seta" aria-hidden="true">⌄</span>
      </button>
      <div id="conteudoContasPagar" class="cp-conteudo" hidden>
        <div class="cp-resumos">
          <div class="cp-resumo"><span>Pendentes</span>
            <strong id="cpTotalPendentes">R$ 0,00</strong></div>
          <div class="cp-resumo"><span>Atrasadas</span>
            <strong id="cpTotalAtrasadas">R$ 0,00</strong></div>
          <div class="cp-resumo"><span>Pagas hoje</span>
            <strong id="cpTotalPagas">R$ 0,00</strong></div>
        </div>
        <form id="cpFormConta" class="cp-form">
          <h3>＋ Cadastrar conta</h3>
          <div class="cp-campo">
            <label for="cpDescricao">Descrição da conta</label>
            <input id="cpDescricao" name="descricao" type="text" maxlength="100"
              placeholder="Ex.: fornecedor, energia, aluguel" required>
          </div>
          <div class="cp-campo">
            <label for="cpValor">Valor (R$)</label>
            <input id="cpValor" name="valor" type="number" min="0.01" step="0.01"
              inputmode="decimal" placeholder="0,00" required>
          </div>
          <div class="cp-campo">
            <label for="cpVencimento">Data de vencimento</label>
            <input id="cpVencimento" name="vencimento" type="date" required>
          </div>
          <button class="cp-btn cp-btn-principal" type="submit">Salvar conta</button>
        </form>
        <div class="cp-filtros">
          <button type="button" class="cp-filtro ativo" data-filtro="pendentes">Pendentes</button>
          <button type="button" class="cp-filtro" data-filtro="pagas">Pagas</button>
          <button type="button" class="cp-filtro" data-filtro="todas">Todas</button>
        </div>
        <div id="cpListaContas" class="cp-lista">
          <div class="cp-carregando">⏳ Carregando contas...</div>
        </div>
        <p class="cp-nota">
          Uma conta só entra nas saídas do Fluxo de Caixa quando seu
          pagamento é confirmado. Confira o valor e a forma de pagamento
          antes de confirmar.
        </p>
      </div>
    `;
    principal.appendChild(secao);

    $('cpVencimento').value = dataHojeISO();
    $('cpFormConta').addEventListener('submit', cadastrarConta);
    secao.addEventListener('click', tratarClique);
  }

  async function cadastrarConta(evento) {
    evento.preventDefault();
    const descricao = $('cpDescricao').value.trim();
    const valor = Number($('cpValor').value);
    const vencimento = $('cpVencimento').value;

    if (!descricao) { alert('Informe a descrição.'); return; }
    if (!(valor > 0)) { alert('Informe um valor válido.'); return; }
    if (!vencimento) { alert('Informe o vencimento.'); return; }

    const btn = evento.target.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando...';

    try {
      await inserirConta({ descricao, valor, vencimento });
      $('cpFormConta').reset();
      $('cpVencimento').value = dataHojeISO();
      renderizar();
      alert('Conta cadastrada com sucesso!');
    } catch (err) {
      console.error('[Contas]', err);
      alert(err.message || 'Não foi possível cadastrar.');
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  }

  async function pagarConta(id) {
    const conta = estado.contas.find(c => c.id === String(id));
    if (!conta) return;
    if (conta.paga) { alert('Esta conta já foi paga.'); return; }

    const formaSel = $('cpMetodo-' + id);
    if (!formaSel) return;
    const formaPagamento = formaSel.value;
    const nomesForma = { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', credito:'Crédito' };

    if (!confirm(
      'Confirmar pagamento?\n\n' + conta.descricao + '\n' +
      formatarReal(conta.valor) + '\nForma: ' +
      (nomesForma[formaPagamento] || formaPagamento) +
      '\n\nSerá registrada uma saída no Fluxo de Caixa.'
    )) return;

    const movimentoId = 'conta-pagar-' + conta.id;

    // Verifica duplicidade no cache
    const jaExiste = lerMovimentacoes().some(m => String(m.id) === movimentoId);

    if (!jaExiste) {
      const novaMov = {
        id: movimentoId,
        tipo: 'saida',
        descricao: 'Conta a pagar: ' + conta.descricao,
        valor: conta.valor,
        formaPagamento,
        formaPagamentoNome: nomesForma[formaPagamento] || formaPagamento,
        data: dataHojeBR(),
        dataChave: dataHojeISO(),
        hora: horaAtual(),
        origem: 'contas_pagar',
        contaPagarId: conta.id
      };

      // NOVO: Vincular à sessão de caixa
      const sessao = obterSessaoAtual();
      if (sessao) {
        novaMov.caixaSessaoId = sessao.id;
        novaMov.caixaSessaoNumero = sessao.numero;
      }

      // >>> SYNC: Supabase via DrTrocoDados
      if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarMovimentacao === 'function') {
        const r = await window.DrTrocoDados.salvarMovimentacao(novaMov);
        if (!r || !r.ok) {
          alert('Falha ao registrar saída no caixa. Pagamento cancelado.\n' + ((r && r.erro) || ''));
          return;
        }
      } else {
        // Fallback: localStorage
        const movs = lerMovimentacoes();
        movs.push(novaMov);
        if (!salvarMovimentacoesLocal(movs)) {
          alert('Falha ao registrar saída no caixa. Pagamento cancelado.');
          return;
        }
      }
    }

    try {
      await marcarComoPaga(conta.id, formaPagamento, movimentoId);
      renderizar();
      if (typeof window.carregarFluxo === 'function') window.carregarFluxo();
      alert('Pagamento registrado!');
    } catch (err) {
      console.error('[Contas] Erro ao confirmar pagamento. Desfazendo movimentação...', err);
      
      // Rollback: tenta excluir a movimentação se o pagamento falhou
      if (window.DrTrocoDados && typeof window.DrTrocoDados.excluirMovimentacao === 'function') {
        await window.DrTrocoDados.excluirMovimentacao(movimentoId);
      }

      alert(err.message || 'Não foi possível registrar pagamento.');
    }
  }

  async function excluirConta(id) {
    const conta = estado.contas.find(c => c.id === String(id));
    if (!conta) return;
    if (conta.paga) { alert('Conta já paga não pode ser excluída.'); return; }
    if (!confirm('Excluir a conta "' + conta.descricao + '"?')) return;

    try {
      await removerConta(id);
      renderizar();
    } catch (err) {
      alert(err.message || 'Não foi possível excluir.');
    }
  }

  function tratarClique(ev) {
    const toggle = ev.target.closest('#btnToggleContasPagar');
    if (toggle) {
      const conteudo = $('conteudoContasPagar');
      const aberto = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!aberto));
      conteudo.hidden = aberto;
      return;
    }
    const filtro = ev.target.closest('[data-filtro]');
    if (filtro) {
      filtroAtual = filtro.dataset.filtro;
      document.querySelectorAll('.cp-filtro').forEach(b =>
        b.classList.toggle('ativo', b.dataset.filtro === filtroAtual));
      renderizar();
      return;
    }
    const pagar = ev.target.closest('[data-cp-pagar]');
    if (pagar) return pagarConta(pagar.dataset.cpPagar);

    const excluir = ev.target.closest('[data-cp-excluir]');
    if (excluir) return excluirConta(excluir.dataset.cpExcluir);
  }

  function renderizar() {
    const lista = $('cpListaContas');
    if (!lista) return;

    if (estado.carregando && !estado.pronto) {
      lista.innerHTML = '<div class="cp-carregando">⏳ Carregando...</div>';
      return;
    }

    const erroHtml = estado.erro
      ? `<div class="cp-erro">Sem conexão com o Supabase — exibindo cache local.
          <br>${escaparHTML(estado.erro.message || '')}</div>`
      : '';

    const contas = estado.contas;
    const hoje = dataHojeISO();
    const pendentes = contas.filter(c => !c.paga);
    const atrasadas = pendentes.filter(c => c.vencimento && c.vencimento < hoje);
    const pagasHoje = contas.filter(c => c.paga && c.dataPagamento === hoje);

    if ($('cpTotalPendentes')) $('cpTotalPendentes').textContent =
      formatarReal(pendentes.reduce((s, c) => s + c.valor, 0));
    if ($('cpTotalAtrasadas')) $('cpTotalAtrasadas').textContent =
      formatarReal(atrasadas.reduce((s, c) => s + c.valor, 0));
    if ($('cpTotalPagas')) $('cpTotalPagas').textContent =
      formatarReal(pagasHoje.reduce((s, c) => s + c.valor, 0));

    let exibidas = contas;
    if (filtroAtual === 'pendentes') exibidas = contas.filter(c => !c.paga);
    else if (filtroAtual === 'pagas') exibidas = contas.filter(c => c.paga);

    exibidas = [...exibidas].sort((a, b) => {
      if (a.paga !== b.paga) return a.paga ? 1 : -1;
      return String(a.vencimento || '').localeCompare(String(b.vencimento || ''));
    });

    if (exibidas.length === 0) {
      const msg = {
        pendentes: 'Nenhuma conta pendente.',
        pagas: 'Nenhuma conta paga ainda.',
        todas: 'Nenhuma conta cadastrada.'
      }[filtroAtual] || 'Nenhuma conta.';
      lista.innerHTML = `${erroHtml}
        <div class="cp-vazio">
          <div style="font-size:25px;margin-bottom:8px">🧾</div>${msg}
        </div>`;
      return;
    }

    lista.innerHTML = erroHtml + exibidas.map(c => {
      const atrasada = !c.paga && c.vencimento && c.vencimento < hoje;
      const status = c.paga ? 'Paga' : (atrasada ? 'Vencida' : 'Pendente');
      const statusClasse = atrasada ? ' atrasada' : '';
      const idSeg = escaparHTML(c.id);

      const pagInfo = c.paga ? `
        <div class="cp-detalhes">
          <span>Pagamento: ${escaparHTML(formatarData(c.dataPagamento))}</span>
          <span>Forma: ${escaparHTML(c.formaPagamento || '—')}</span>
        </div>` : '';

      const acoes = c.paga ? '' : `
        <div class="cp-campo" style="margin-top:12px">
          <label for="cpMetodo-${idSeg}">Forma de pagamento</label>
          <select id="cpMetodo-${idSeg}">
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">Pix</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
        <div class="cp-acoes">
          <button type="button" class="cp-btn cp-btn-pagar"
            data-cp-pagar="${idSeg}">✓ Confirmar pagamento</button>
          <button type="button" class="cp-btn cp-btn-excluir"
            data-cp-excluir="${idSeg}">Excluir</button>
        </div>`;

      return `
        <article class="cp-conta">
          <div class="cp-conta-topo">
            <h3 class="cp-conta-nome">${escaparHTML(c.descricao)}</h3>
            <strong class="cp-conta-valor">${formatarReal(c.valor)}</strong>
          </div>
          <div class="cp-detalhes">
            <span>Vencimento: ${escaparHTML(formatarData(c.vencimento))}</span>
          </div>
          <span class="cp-status${statusClasse}">${status}</span>
          ${pagInfo}${acoes}
        </article>`;
    }).join('');
  }

  async function iniciar() {
    adicionarEstilos();
    criarInterface();
    await carregar();
    renderizar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.DrTrocoContas = {
    estaPronto: () => estado.pronto,
    carregar,
    listar: () => [...estado.contas]
  };
})();
