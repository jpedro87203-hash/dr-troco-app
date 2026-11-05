/* =========================================================
   DR. TROCO — FORNECEDORES (SUPABASE)
   Fonte da verdade: public.fornecedores + public.fornecedor_compras
   Espelho/fallback: localStorage (drTroco_fornecedores)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoFornecedoresInicializado) return;
  window.__drTrocoFornecedoresInicializado = true;

  const TAB_FORN  = 'fornecedores';
  const TAB_COMPRAS = 'fornecedor_compras';
  const CHAVE_LOCAL = 'drTroco_fornecedores';
  const CHAVE_ESTOQUE_BASE = 'drTroco_estoque';

  const $ = (id) => document.getElementById(id);

  const estado = {
    pronto: false,
    carregando: false,
    erro: null,
    dados: [], // [{id, nome, telefone, email, compras:[...] }]
    usuario: null
  };
  let promessaCarga = null;

  /* ---------- Utilitários ---------- */

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
    return 'forn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function formatarReal(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatarData(iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  function dataHojeISO() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function escaparHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function normalizar(txt) {
    return String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase();
  }

  function obterComercioIdLocal() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave && chave.startsWith(CHAVE_ESTOQUE_BASE + '_') &&
            chave !== CHAVE_ESTOQUE_BASE + '_legado') {
          return chave.replace(CHAVE_ESTOQUE_BASE + '_', '');
        }
      }
    } catch (e) {}
    return null;
  }

  function obterChaveEstoque() {
    const cid = obterComercioIdLocal();
    return cid ? `${CHAVE_ESTOQUE_BASE}_${cid}` : CHAVE_ESTOQUE_BASE;
  }

  function listarProdutosEstoque() {
    try {
      const bruto = localStorage.getItem(obterChaveEstoque());
      if (!bruto) return [];
      const arr = JSON.parse(bruto);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /* ---------- Mapeamento banco <-> app ---------- */

  function fornecedorDoBanco(row, compras = []) {
    return {
      id: String(row.id),
      nome: row.nome || '',
      telefone: row.telefone || '',
      email: row.email || '',
      criadoEm: row.criado_em || null,
      atualizadoEm: row.atualizado_em || null,
      compras: compras.map(c => ({
        id: String(c.id),
        produto: c.produto || '',
        quantidade: Number(c.quantidade) || 0,
        precoUnitario: Number(c.preco_unitario) || 0,
        data: c.data || '',
        observacao: c.observacao || '',
        criadoEm: c.criado_em || null
      }))
    };
  }

  function compraParaBanco(c, fornecedorId) {
    return {
      id: String(c.id),
      usuario_id: estado.usuario.id,
      fornecedor_id: String(fornecedorId),
      produto: String(c.produto).trim(),
      quantidade: Number(c.quantidade) || 0,
      preco_unitario: Number(c.precoUnitario) || 0,
      data: c.data || dataHojeISO(),
      observacao: c.observacao || null
    };
  }

  function fornecedorParaBanco(f) {
    return {
      id: String(f.id),
      usuario_id: estado.usuario.id,
      nome: String(f.nome).trim(),
      telefone: f.telefone ? String(f.telefone).trim() : null,
      email: f.email ? String(f.email).trim() : null,
      atualizado_em: new Date().toISOString()
    };
  }

  /* ---------- Carregamento + migração ---------- */

  async function carregar() {
    if (estado.pronto) return estado.dados;
    if (estado.carregando) return promessaCarga;

    estado.carregando = true;
    estado.erro = null;

    promessaCarga = (async () => {
      try {
        await getUsuario();
        const supa = getSupa();

        const [fResp, cResp] = await Promise.all([
          supa.from(TAB_FORN).select('*')
            .eq('usuario_id', estado.usuario.id)
            .order('nome', { ascending: true }),
          supa.from(TAB_COMPRAS).select('*')
            .eq('usuario_id', estado.usuario.id)
            .order('data', { ascending: true })
        ]);

        if (fResp.error) throw fResp.error;
        if (cResp.error) throw cResp.error;

        const comprasPorFornecedor = new Map();
        (cResp.data || []).forEach(c => {
          const k = String(c.fornecedor_id);
          if (!comprasPorFornecedor.has(k)) comprasPorFornecedor.set(k, []);
          comprasPorFornecedor.get(k).push(c);
        });

        estado.dados = (fResp.data || []).map(f =>
          fornecedorDoBanco(f, comprasPorFornecedor.get(String(f.id)) || [])
        );

        estado.pronto = true;

        // Migração oportunista do localStorage (se ainda houver dados antigos)
        await migrarLocaisSeNecessario();

        // Cache local (apenas espelho)
        try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado.dados)); } catch (e) {}

        return estado.dados;

      } catch (err) {
        console.error('[Fornecedores] Falha ao carregar:', err);
        estado.erro = err;

        // fallback localStorage
        if (estado.dados.length === 0) {
          try {
            const bruto = localStorage.getItem(CHAVE_LOCAL);
            if (bruto) {
              const arr = JSON.parse(bruto);
              if (Array.isArray(arr)) estado.dados = arr;
            }
          } catch (e) {}
        }
        return estado.dados;

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

    const idsFornecedores = new Set(estado.dados.map(f => f.id));
    const idsCompras = new Set();
    estado.dados.forEach(f => (f.compras || []).forEach(c => idsCompras.add(c.id)));

    for (const local of locais) {
      if (!local || !local.nome) continue;

      const idForn = String(local.id || gerarId());

      if (!idsFornecedores.has(idForn)) {
        const { error: e1 } = await supa.from(TAB_FORN).insert({
          id: idForn,
          usuario_id: user.id,
          nome: String(local.nome).trim(),
          telefone: local.telefone || null,
          email: local.email || null
        });
        if (e1) {
          console.warn('[Fornecedores] Migração falhou para', local.nome, e1);
          continue;
        }
        idsFornecedores.add(idForn);
      }

      for (const compraLocal of (local.compras || [])) {
        if (!compraLocal || !compraLocal.produto) continue;
        const idCompra = String(compraLocal.id || gerarId());
        if (idsCompras.has(idCompra)) continue;

        const { error: e2 } = await supa.from(TAB_COMPRAS).insert({
          id: idCompra,
          usuario_id: user.id,
          fornecedor_id: idForn,
          produto: String(compraLocal.produto).trim(),
          quantidade: Number(compraLocal.quantidade) || 0,
          preco_unitario: Number(compraLocal.precoUnitario) || 0,
          data: compraLocal.data || dataHojeISO(),
          observacao: compraLocal.observacao || null
        });
        if (!e2) idsCompras.add(idCompra);
      }
    }

    // Recarrega dados pós-migração
    if (idsFornecedores.size > estado.dados.length || idsCompras.size > 0) {
      estado.pronto = false;
      // chama recarregamento interno (sem migrar de novo)
      const [fResp, cResp] = await Promise.all([
        supa.from(TAB_FORN).select('*').eq('usuario_id', user.id).order('nome', { ascending: true }),
        supa.from(TAB_COMPRAS).select('*').eq('usuario_id', user.id).order('data', { ascending: true })
      ]);
      if (!fResp.error && !cResp.error) {
        const agrupado = new Map();
        (cResp.data || []).forEach(c => {
          const k = String(c.fornecedor_id);
          if (!agrupado.has(k)) agrupado.set(k, []);
          agrupado.get(k).push(c);
        });
        estado.dados = (fResp.data || []).map(f =>
          fornecedorDoBanco(f, agrupado.get(String(f.id)) || [])
        );
        estado.pronto = true;
      }
    }
  }

  /* ---------- Operações ---------- */

  async function inserirFornecedor({ nome, telefone, email }) {
    await getUsuario();
    const novo = {
      id: gerarId(),
      nome: String(nome).trim(),
      telefone: String(telefone || '').trim(),
      email: String(email || '').trim(),
      compras: []
    };

    const { data, error } = await getSupa().from(TAB_FORN)
      .insert(fornecedorParaBanco(novo)).select().single();
    if (error) throw new Error('Falha ao salvar fornecedor: ' + error.message);

    const salvo = fornecedorDoBanco(data, []);
    estado.dados.push(salvo);
    persistirCacheLocal();
    return salvo;
  }

  async function atualizarFornecedor(id, { nome, telefone, email }) {
    await getUsuario();
    const { data, error } = await getSupa().from(TAB_FORN)
      .update({
        nome: String(nome).trim(),
        telefone: String(telefone || '').trim() || null,
        email: String(email || '').trim() || null,
        atualizado_em: new Date().toISOString()
      })
      .eq('id', String(id)).eq('usuario_id', estado.usuario.id)
      .select().single();
    if (error) throw new Error('Falha ao editar fornecedor: ' + error.message);

    const idx = estado.dados.findIndex(f => f.id === String(id));
    if (idx >= 0) {
      estado.dados[idx].nome = data.nome;
      estado.dados[idx].telefone = data.telefone || '';
      estado.dados[idx].email = data.email || '';
      estado.dados[idx].atualizadoEm = data.atualizado_em;
    }
    persistirCacheLocal();
    return data;
  }

  async function removerFornecedor(id) {
    await getUsuario();
    // deletar compras primeiro (por segurança, caso cascade não exista)
    const { error: e1 } = await getSupa().from(TAB_COMPRAS)
      .delete().eq('fornecedor_id', String(id)).eq('usuario_id', estado.usuario.id);
    if (e1) throw new Error('Falha ao excluir compras: ' + e1.message);

    const { error: e2 } = await getSupa().from(TAB_FORN)
      .delete().eq('id', String(id)).eq('usuario_id', estado.usuario.id);
    if (e2) throw new Error('Falha ao excluir fornecedor: ' + e2.message);

    estado.dados = estado.dados.filter(f => f.id !== String(id));
    persistirCacheLocal();
  }

  async function inserirCompra(fornecedorId, compra) {
    await getUsuario();
    const f = estado.dados.find(x => x.id === String(fornecedorId));
    if (!f) throw new Error('Fornecedor não encontrado.');

    const nova = {
      id: 'compra-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      produto: String(compra.produto).trim(),
      quantidade: Number(compra.quantidade) || 0,
      precoUnitario: Number(compra.precoUnitario) || 0,
      data: compra.data || dataHojeISO(),
      observacao: String(compra.observacao || '').trim()
    };
    if (nova.quantidade <= 0) throw new Error('Quantidade inválida.');
    if (nova.precoUnitario <= 0) throw new Error('Preço inválido.');
    if (!nova.produto) throw new Error('Produto vazio.');

    const { data, error } = await getSupa().from(TAB_COMPRAS)
      .insert(compraParaBanco(nova, fornecedorId)).select().single();
    if (error) throw new Error('Falha ao registrar compra: ' + error.message);

    f.compras.push({
      id: String(data.id),
      produto: data.produto,
      quantidade: Number(data.quantidade),
      precoUnitario: Number(data.preco_unitario),
      data: data.data,
      observacao: data.observacao || '',
      criadoEm: data.criado_em
    });
    persistirCacheLocal();
    return data;
  }

  function persistirCacheLocal() {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado.dados));
    } catch (e) {
      console.warn('[Fornecedores] Cache local falhou:', e);
    }
  }

  /* ---------- UI ---------- */

  function adicionarEstilos() {
    if (document.getElementById('estilosFornecedores')) return;
    const s = document.createElement('style');
    s.id = 'estilosFornecedores';
    s.textContent = `
      .frn-topo { display:flex; gap:8px; margin-bottom:14px; }
      .frn-btn { flex:1; min-height:42px; border:0; border-radius:10px;
        font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
      .frn-btn-principal { background:#168b53; color:#fff; }
      .frn-btn-secundario { background:#eef4f0; color:#168b53; border:1px solid #d6e3d9; }
      .frn-btn-perigo { background:#fff0f0; color:#b42318; border:1px solid #f0d8d8; }
      .frn-form { display:grid; gap:12px; padding:14px; margin-bottom:14px;
        border:1px solid #e4eee7; border-radius:13px; background:#fafcfb; }
      .frn-form h3 { margin:0; font-size:14px; color:#1f3028; }
      .frn-campo { display:grid; gap:6px; }
      .frn-campo label { font-size:12px; font-weight:700; color:#34483d; }
      .frn-campo input, .frn-campo textarea {
        box-sizing:border-box; width:100%; min-height:42px; padding:10px 12px;
        border:1px solid #d6e3d9; border-radius:10px; background:#fff;
        color:#203126; font:inherit; font-size:14px; }
      .frn-campo input:focus, .frn-campo textarea:focus {
        outline:none; border-color:#20a767;
        box-shadow:0 0 0 3px rgba(32,167,103,.12); }
      .frn-form-acoes { display:flex; gap:8px; margin-top:4px; }
      .frn-form-acoes .frn-btn { flex:1; }
      .frn-lista { display:grid; gap:10px; }
      .frn-card { padding:14px; border:1px solid #e3ece5; border-radius:13px; background:#fff; }
      .frn-card-topo { display:flex; justify-content:space-between;
        align-items:flex-start; gap:10px; }
      .frn-nome { margin:0; color:#1f3028; font-size:15px; overflow-wrap:anywhere; }
      .frn-total { color:#176b3a; font-size:15px; font-weight:900; white-space:nowrap; }
      .frn-contato { margin:8px 0 0; color:#607166; font-size:12px;
        line-height:1.5; overflow-wrap:anywhere; }
      .frn-detalhes { margin-top:12px; }
      .frn-detalhes summary { cursor:pointer; font-size:12px; font-weight:700;
        color:#168b53; padding:6px 0; list-style:none; }
      .frn-detalhes summary::-webkit-details-marker { display:none; }
      .frn-detalhes summary::after { content:"▾"; margin-left:6px;
        display:inline-block; transition:transform .2s; }
      .frn-detalhes[open] summary::after { transform:rotate(180deg); }
      .frn-compras { display:grid; gap:8px; padding-top:8px; }
      .frn-compra { padding:10px 12px; border-radius:10px; background:#f5f9f6;
        font-size:12px; color:#4b5f53; line-height:1.5; }
      .frn-compra-topo { display:flex; justify-content:space-between;
        gap:10px; margin-bottom:4px; }
      .frn-compra-nome { font-weight:700; color:#1f3028; overflow-wrap:anywhere; }
      .frn-compra-total { font-weight:900; color:#176b3a; white-space:nowrap; }
      .frn-acoes { display:flex; gap:8px; margin-top:12px; }
      .frn-acoes .frn-btn { flex:1; }
      .frn-vazio { padding:22px 12px; text-align:center; border:1px dashed #d6e3d9;
        border-radius:12px; color:#718076; font-size:13px; }
      .frn-erro { padding:12px 14px; border-radius:12px; background:#fff0f0;
        border:1px solid #f0d8d8; color:#b42318; font-size:12px;
        line-height:1.5; margin-bottom:14px; }
      .frn-carregando { padding:20px; text-align:center; color:#718076;
        font-size:13px; }
    `;
    document.head.appendChild(s);
  }

  let editandoId = null;
  let compraFornecedorId = null;

  function renderizar() {
    const area = $('fornecedoresArea');
    if (!area) return;

    if (estado.carregando && !estado.pronto) {
      area.innerHTML = '<div class="frn-carregando">⏳ Carregando fornecedores...</div>';
      return;
    }

    const erroHtml = estado.erro
      ? `<div class="frn-erro">
          Não foi possível carregar do Supabase. Exibindo dados em cache local.
          <br>Motivo: ${escaparHTML(estado.erro.message || 'erro desconhecido')}
        </div>`
      : '';

    area.innerHTML = `
      ${erroHtml}
      <div class="frn-topo">
        <button type="button" class="frn-btn frn-btn-principal" id="frnBtnNovo">
          ＋ Novo fornecedor
        </button>
      </div>
      <div id="frnFormArea"></div>
      <div id="frnLista" class="frn-lista"></div>
    `;

    $('frnBtnNovo').addEventListener('click', () => abrirFormularioFornecedor(null));

    const fornecedores = [...estado.dados].sort((a, b) =>
      String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    if (fornecedores.length === 0) {
      $('frnLista').innerHTML = `
        <div class="frn-vazio">
          <div style="font-size:26px;margin-bottom:8px">📦</div>
          Nenhum fornecedor cadastrado.<br>Toque em <b>＋ Novo fornecedor</b> para começar.
        </div>`;
      return;
    }

    $('frnLista').innerHTML = fornecedores.map(f => renderizarCard(f)).join('');

    fornecedores.forEach(f => {
      const card = document.querySelector(`[data-forn-id="${CSS.escape(f.id)}"]`);
      if (!card) return;
      card.querySelector('[data-acao="editar"]')?.addEventListener('click', () => abrirFormularioFornecedor(f));
      card.querySelector('[data-acao="comprar"]')?.addEventListener('click', () => abrirFormularioCompra(f.id));
      card.querySelector('[data-acao="excluir"]')?.addEventListener('click', () => excluirFornecedor(f.id));
    });
  }

  function renderizarCard(f) {
    const compras = Array.isArray(f.compras) ? f.compras : [];
    const total = compras.reduce((s, c) => s + Number(c.quantidade || 0) * Number(c.precoUnitario || 0), 0);
    const contatos = [];
    if (f.telefone) contatos.push(`📞 ${escaparHTML(f.telefone)}`);
    if (f.email) contatos.push(`✉️ ${escaparHTML(f.email)}`);

    const comprasHtml = compras.length === 0
      ? '<div class="frn-compra">Nenhuma compra registrada ainda.</div>'
      : [...compras].reverse().map(c => `
        <div class="frn-compra">
          <div class="frn-compra-topo">
            <span class="frn-compra-nome">${escaparHTML(c.produto)}</span>
            <span class="frn-compra-total">${formatarReal(Number(c.quantidade) * Number(c.precoUnitario))}</span>
          </div>
          <span>${Number(c.quantidade)} × ${formatarReal(c.precoUnitario)} · ${formatarData(c.data)}</span>
          ${c.observacao ? `<div style="margin-top:4px">${escaparHTML(c.observacao)}</div>` : ''}
        </div>`).join('');

    return `
      <article class="frn-card" data-forn-id="${escaparHTML(f.id)}">
        <div class="frn-card-topo">
          <h3 class="frn-nome">${escaparHTML(f.nome)}</h3>
          <span class="frn-total">${formatarReal(total)}</span>
        </div>
        ${contatos.length ? `<p class="frn-contato">${contatos.join(' · ')}</p>` : ''}
        <details class="frn-detalhes">
          <summary>Histórico de compras (${compras.length})</summary>
          <div class="frn-compras">${comprasHtml}</div>
        </details>
        <div class="frn-acoes">
          <button type="button" class="frn-btn frn-btn-principal" data-acao="comprar">＋ Compra</button>
          <button type="button" class="frn-btn frn-btn-secundario" data-acao="editar">Editar</button>
          <button type="button" class="frn-btn frn-btn-perigo" data-acao="excluir">Excluir</button>
        </div>
      </article>`;
  }

  function abrirFormularioFornecedor(fornecedor) {
    const area = $('frnFormArea');
    if (!area) return;
    editandoId = fornecedor ? fornecedor.id : null;

    area.innerHTML = `
      <form class="frn-form" id="frnFormFornecedor">
        <h3>${fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>
        <div class="frn-campo">
          <label for="frnNome">Nome *</label>
          <input id="frnNome" type="text" maxlength="120" required
            value="${escaparHTML(fornecedor?.nome || '')}"
            placeholder="Ex.: Distribuidora Central">
        </div>
        <div class="frn-campo">
          <label for="frnTelefone">Telefone (opcional)</label>
          <input id="frnTelefone" type="tel" maxlength="30"
            value="${escaparHTML(fornecedor?.telefone || '')}"
            placeholder="(98) 99999-9999">
        </div>
        <div class="frn-campo">
          <label for="frnEmail">E-mail (opcional)</label>
          <input id="frnEmail" type="email" maxlength="120"
            value="${escaparHTML(fornecedor?.email || '')}"
            placeholder="contato@fornecedor.com">
        </div>
        <div class="frn-form-acoes">
          <button type="button" class="frn-btn frn-btn-secundario" id="frnCancelar">Cancelar</button>
          <button type="submit" class="frn-btn frn-btn-principal">Salvar</button>
        </div>
      </form>`;

    $('frnCancelar').addEventListener('click', () => {
      area.innerHTML = '';
      editandoId = null;
    });
    $('frnFormFornecedor').addEventListener('submit', salvarFornecedor);
    $('frnNome').focus();
  }

  async function salvarFornecedor(evento) {
    evento.preventDefault();
    const nome = $('frnNome').value.trim();
    const telefone = $('frnTelefone').value.trim();
    const email = $('frnEmail').value.trim();

    if (!nome) { alert('Informe o nome do fornecedor.'); $('frnNome').focus(); return; }

    const btn = evento.target.querySelector('button[type="submit"]');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      if (editandoId) await atualizarFornecedor(editandoId, { nome, telefone, email });
      else await inserirFornecedor({ nome, telefone, email });
      editandoId = null;
      renderizar();
    } catch (err) {
      console.error('[Fornecedores]', err);
      alert(err.message || 'Não foi possível salvar o fornecedor.');
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  async function excluirFornecedor(id) {
    const f = estado.dados.find(x => x.id === id);
    if (!f) return;
    if (!confirm(`Excluir o fornecedor "${f.nome}"?\n\nO histórico de compras dele também será apagado.`)) return;

    try {
      await removerFornecedor(id);
      renderizar();
    } catch (err) {
      console.error('[Fornecedores]', err);
      alert(err.message || 'Não foi possível excluir.');
    }
  }

  function abrirFormularioCompra(fornecedorId) {
    const fornecedor = estado.dados.find(f => f.id === fornecedorId);
    if (!fornecedor) return;
    compraFornecedorId = fornecedorId;

    const produtos = listarProdutosEstoque();
    const opcoes = produtos.map(p => `<option value="${escaparHTML(p.nome)}">`).join('');

    const area = $('frnFormArea');
    area.innerHTML = `
      <form class="frn-form" id="frnFormCompra">
        <h3>＋ Nova compra — ${escaparHTML(fornecedor.nome)}</h3>
        <div class="frn-campo">
          <label for="frnProduto">Produto comprado *</label>
          <input id="frnProduto" type="text" maxlength="120" required
            list="frnListaProdutos" autocomplete="off"
            placeholder="Ex.: Arroz 5kg">
          <datalist id="frnListaProdutos">${opcoes}</datalist>
        </div>
        <div class="frn-campo">
          <label for="frnQtd">Quantidade *</label>
          <input id="frnQtd" type="number" min="1" step="1" required value="1">
        </div>
        <div class="frn-campo">
          <label for="frnPreco">Preço unitário de compra (R$) *</label>
          <input id="frnPreco" type="number" min="0.01" step="0.01"
            inputmode="decimal" required placeholder="0,00">
        </div>
        <div class="frn-campo">
          <label for="frnData">Data da compra</label>
          <input id="frnData" type="date" value="${dataHojeISO()}" required>
        </div>
        <div class="frn-campo">
          <label for="frnObs">Observação (opcional)</label>
          <textarea id="frnObs" maxlength="200" rows="2"
            placeholder="Nota fiscal, condições, etc."></textarea>
        </div>
        <div class="frn-form-acoes">
          <button type="button" class="frn-btn frn-btn-secundario" id="frnCancelarCompra">Cancelar</button>
          <button type="submit" class="frn-btn frn-btn-principal">Registrar compra</button>
        </div>
      </form>`;

    $('frnCancelarCompra').addEventListener('click', () => {
      area.innerHTML = '';
      compraFornecedorId = null;
    });
    $('frnFormCompra').addEventListener('submit', salvarCompra);
    $('frnProduto').focus();
  }

  async function salvarCompra(evento) {
    evento.preventDefault();
    const produto = $('frnProduto').value.trim();
    const quantidade = Number($('frnQtd').value);
    const precoUnitario = Number($('frnPreco').value);
    const data = $('frnData').value;
    const observacao = $('frnObs').value.trim();

    if (!produto) { alert('Informe o produto.'); return; }
    if (!(quantidade > 0)) { alert('Quantidade inválida.'); return; }
    if (!(precoUnitario > 0)) { alert('Preço inválido.'); return; }
    if (!data) { alert('Informe a data.'); return; }

    const btn = evento.target.querySelector('button[type="submit"]');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      await inserirCompra(compraFornecedorId, {
        produto, quantidade, precoUnitario, data, observacao
      });

      const produtos = listarProdutosEstoque();
      const existe = produtos.find(p => normalizar(p.nome) === normalizar(produto));
      if (!existe) {
        alert(`Compra registrada!\n\nAtenção: "${produto}" não está no estoque. ` +
              `O lucro será calculado, mas o produto não aparecerá para venda ` +
              `até você cadastrá-lo em Estoque.`);
      }

      compraFornecedorId = null;
      renderizar();
    } catch (err) {
      console.error('[Fornecedores]', err);
      alert(err.message || 'Falha ao registrar compra.');
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }

  /* ---------- Inicialização + API ---------- */

  async function iniciar() {
    adicionarEstilos();
    renderizar();
    await carregar();
    renderizar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.DrTrocoFornecedores = {
    estaPronto: () => estado.pronto,
    carregar,
    listar: () => [...estado.dados],
    mapaCustos: () => {
      const mapa = new Map();
      estado.dados.forEach(f => {
        (f.compras || []).forEach(c => {
          const k = normalizar(c.produto);
          if (!k) return;
          const existente = mapa.get(k);
          if (!existente || String(c.data) >= existente.data) {
            mapa.set(k, { data: c.data, preco: Number(c.precoUnitario) || 0 });
          }
        });
      });
      return mapa;
    }
  };
})();
