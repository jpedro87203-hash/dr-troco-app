/* =========================================================
   DR. TROCO — CAMADA DE DADOS (SUPABASE)
   Fonte da verdade: vendas, movimentacoes, saldos_iniciais, sessoes_caixa
   Espelho/leitura rápida: localStorage (mantém chaves antigas para
   backup.js, fluxo.js, historico.js, script.js continuarem funcionando)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoDadosInicializado) return;
  window.__drTrocoDadosInicializado = true;

  const CHAVES = {
    vendas: 'drTroco_vendas',
    movimentacoes: 'drTroco_movimentacoes',
    saldosIniciais: 'drTroco_saldosIniciais',
    sessoesCaixa: 'drTroco_sessoesCaixa'
  };

  const estado = {
    usuario: null,
    carregando: false,
    erro: null,
    sincronizado: false
  };
  let promessaCarga = null;
  const ouvintes = new Set();

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

  function lerLocal(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      if (!bruto) return padrao;
      const dados = JSON.parse(bruto);
      return dados === null ? padrao : dados;
    } catch (e) { return padrao; }
  }
  function salvarLocal(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { console.error('[Dados] cache:', e); return false; }
  }

  /* ------- Mapeamento ------- */

  function vendaParaBanco(v) {
    return {
      id: String(v.id),
      usuario_id: estado.usuario.id,
      data: v.data || null,
      data_chave: v.dataChave || null,
      hora: v.hora || null,
      forma_pagamento: v.formaPagamento || null,
      forma_pagamento_nome: v.formaPagamentoNome || null,
      valor_conta: Number(v.valorConta) || 0,
      valor_avulso: Number(v.valorAvulso) || 0,
      total_produtos: Number(v.totalProdutos) || 0,
      valor_base: Number(v.valorBase) || 0,
      total: Number(v.total) || 0,
      valor_recebido: Number(v.valorRecebido) || 0,
      troco: Number(v.troco) || 0,
      produtos: Array.isArray(v.produtos) ? v.produtos : [],
      cliente_id: v.clienteId || (v.fiado && v.fiado.clienteId) || null,
      cliente_nome: v.clienteNome || (v.fiado && v.fiado.clienteNome) || null,
      fiado: v.fiado || null,
      caixa_sessao_id: v.caixaSessaoId || null,
      caixa_sessao_numero: v.caixaSessaoNumero || null
    };
  }
  function vendaDoBanco(r) {
    return {
      id: String(r.id),
      data: r.data,
      dataChave: r.data_chave,
      hora: r.hora,
      formaPagamento: r.forma_pagamento,
      formaPagamentoNome: r.forma_pagamento_nome,
      valorConta: Number(r.valor_conta) || 0,
      valorAvulso: Number(r.valor_avulso) || 0,
      totalProdutos: Number(r.total_produtos) || 0,
      valorBase: Number(r.valor_base) || 0,
      total: Number(r.total) || 0,
      valorRecebido: Number(r.valor_recebido) || 0,
      troco: Number(r.troco) || 0,
      produtos: r.produtos || [],
      clienteId: r.cliente_id || null,
      clienteNome: r.cliente_nome || null,
      fiado: r.fiado || null,
      caixaSessaoId: r.caixa_sessao_id || null,
      caixaSessaoNumero: r.caixa_sessao_numero || null
    };
  }

  function movParaBanco(m) {
    return {
      id: String(m.id),
      usuario_id: estado.usuario.id,
      tipo: m.tipo || 'entrada',
      valor: Number(m.valor) || 0,
      descricao: m.descricao || null,
      forma_pagamento: m.formaPagamento || null,
      forma_pagamento_nome: m.formaPagamentoNome || null,
      data: m.data || null,
      data_chave: m.dataChave || null,
      hora: m.hora || null,
      origem: m.origem || null,
      fiado_id: m.fiadoId || null,
      venda_id: m.vendaId || null,
      conta_pagar_id: m.contaPagarId || null,
      caixa_sessao_id: m.caixaSessaoId || null,
      caixa_sessao_numero: m.caixaSessaoNumero || null
    };
  }
  function movDoBanco(r) {
    return {
      id: String(r.id),
      tipo: r.tipo,
      valor: Number(r.valor) || 0,
      descricao: r.descricao || '',
      formaPagamento: r.forma_pagamento || null,
      formaPagamentoNome: r.forma_pagamento_nome || null,
      data: r.data,
      dataChave: r.data_chave,
      hora: r.hora || '',
      origem: r.origem || null,
      fiadoId: r.fiado_id || null,
      vendaId: r.venda_id || null,
      contaPagarId: r.conta_pagar_id || null,
      caixaSessaoId: r.caixa_sessao_id || null,
      caixaSessaoNumero: r.caixa_sessao_numero || null
    };
  }

  function sessaoParaBanco(s) {
    return {
      id: String(s.id),
      usuario_id: estado.usuario.id,
      status: s.status || 'aberto',
      data_abertura: s.dataAbertura || s.abertoEm || new Date().toISOString(),
      data_operacional: s.dataOperacional || (s.dataAbertura || s.abertoEm || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      valor_abertura: Number(s.valorAbertura) || 0,
      operador: s.operador || null,
      data_fechamento: s.dataFechamento || s.fechadoEm || null,
      dinheiro_esperado: s.dinheiroEsperado != null ? Number(s.dinheiroEsperado) : null,
      valor_contado: s.valorContado != null ? Number(s.valorContado) : null,
      diferenca: s.diferenca != null ? Number(s.diferenca) : null,
      observacao_fechamento: s.observacaoFechamento || null,
      totais: s.totais || null
    };
  }
  function sessaoDoBanco(r) {
    return {
      id: String(r.id),
      status: r.status,
      dataAbertura: r.data_abertura,
      dataOperacional: r.data_operacional,
      valorAbertura: Number(r.valor_abertura) || 0,
      operador: r.operador || '',
      dataFechamento: r.data_fechamento || null,
      dinheiroEsperado: r.dinheiro_esperado != null ? Number(r.dinheiro_esperado) : null,
      valorContado: r.valor_contado != null ? Number(r.valor_contado) : null,
      diferenca: r.diferenca != null ? Number(r.diferenca) : null,
      observacaoFechamento: r.observacao_fechamento || '',
      totais: r.totais || null
    };
  }

  /* ------- Sincronização ------- */

  async function sincronizar() {
    if (estado.sincronizado) return true;
    if (estado.carregando) return promessaCarga;

    estado.carregando = true;
    estado.erro = null;

    promessaCarga = (async () => {
      try {
        await getUsuario();
        const supa = getSupa();

        await empurrarPendentes();
        await migrarLocaisSeNecessario();

        const [vR, mR, sR, sesR] = await Promise.all([
          supa.from('vendas').select('*').eq('usuario_id', estado.usuario.id).order('data_chave', { ascending: true }),
          supa.from('movimentacoes').select('*').eq('usuario_id', estado.usuario.id).order('data_chave', { ascending: true }),
          supa.from('saldos_iniciais').select('*').eq('usuario_id', estado.usuario.id),
          supa.from('sessoes_caixa').select('*').eq('usuario_id', estado.usuario.id).order('data_abertura', { ascending: true })
        ]);
        if (vR.error) throw vR.error;
        if (mR.error) throw mR.error;
        if (sR.error) throw sR.error;
        if (sesR.error) throw sesR.error;

        salvarLocal(CHAVES.vendas, (vR.data || []).map(vendaDoBanco));
        salvarLocal(CHAVES.movimentacoes, (mR.data || []).map(movDoBanco));

        const saldos = {};
        (sR.data || []).forEach(s => { saldos[s.data_chave] = Number(s.valor) || 0; });
        salvarLocal(CHAVES.saldosIniciais, saldos);

        salvarLocal(CHAVES.sessoesCaixa, (sesR.data || []).map(sessaoDoBanco));

        estado.sincronizado = true;
        notificar();
        return true;

      } catch (err) {
        console.error('[Dados] Sincronização falhou:', err);
        estado.erro = err;
        return false;
      } finally {
        estado.carregando = false;
        promessaCarga = null;
      }
    })();

    return promessaCarga;
  }

  async function migrarLocaisSeNecessario() {
    if (localStorage.getItem('drTroco_migracao_vendas_v1') === 'ok') return;

    const supa = getSupa();
    const user = estado.usuario;

    const { data: eV } = await supa.from('vendas').select('id').eq('usuario_id', user.id).limit(1);
    const { data: eM } = await supa.from('movimentacoes').select('id').eq('usuario_id', user.id).limit(1);

    if ((eV && eV.length) || (eM && eM.length)) {
      // Outro aparelho já migrou — apenas marca
      localStorage.setItem('drTroco_migracao_vendas_v1', 'ok');
      return;
    }

    const vendasLocais = lerLocal(CHAVES.vendas, []);
    const movsLocais = lerLocal(CHAVES.movimentacoes, []);
    const saldosLocais = lerLocal(CHAVES.saldosIniciais, {});
    const sessoesLocais = lerLocal(CHAVES.sessoesCaixa, []);

    if (Array.isArray(vendasLocais) && vendasLocais.length) {
      const { error } = await supa.from('vendas')
        .upsert(vendasLocais.map(vendaParaBanco), { onConflict: 'id', ignoreDuplicates: true });
      if (error) console.warn('[Dados] migração vendas:', error);
    }
    if (Array.isArray(movsLocais) && movsLocais.length) {
      const { error } = await supa.from('movimentacoes')
        .upsert(movsLocais.map(movParaBanco), { onConflict: 'id', ignoreDuplicates: true });
      if (error) console.warn('[Dados] migração movs:', error);
    }
    if (saldosLocais && typeof saldosLocais === 'object') {
      const rows = Object.entries(saldosLocais).map(([data, valor]) => ({
        usuario_id: user.id, data_chave: data, valor: Number(valor) || 0
      }));
      if (rows.length) {
        const { error } = await supa.from('saldos_iniciais')
          .upsert(rows, { onConflict: 'usuario_id,data_chave' });
        if (error) console.warn('[Dados] migração saldos:', error);
      }
    }
    if (Array.isArray(sessoesLocais) && sessoesLocais.length) {
      const { error } = await supa.from('sessoes_caixa')
        .upsert(sessoesLocais.map(sessaoParaBanco), { onConflict: 'id', ignoreDuplicates: true });
      if (error) console.warn('[Dados] migração sessões:', error);
    }

    localStorage.setItem('drTroco_migracao_vendas_v1', 'ok');
  }

  async function empurrarPendentes() {
    const pendV = lerLocal(CHAVES.vendas + '_pendentes', []);
    const pendM = lerLocal(CHAVES.movimentacoes + '_pendentes', []);
    if (!pendV.length && !pendM.length) return;

    const supa = getSupa();

    if (pendV.length) {
      const todas = lerLocal(CHAVES.vendas, []);
      const enviar = todas.filter(v => pendV.includes(v.id));
      if (enviar.length) {
        const { error } = await supa.from('vendas')
          .upsert(enviar.map(vendaParaBanco), { onConflict: 'id' });
        if (!error) {
          const restantes = pendV.filter(id => !enviar.find(v => v.id === id));
          salvarLocal(CHAVES.vendas + '_pendentes', restantes);
        }
      }
    }
    if (pendM.length) {
      const todas = lerLocal(CHAVES.movimentacoes, []);
      const enviar = todas.filter(m => pendM.includes(m.id));
      if (enviar.length) {
        const { error } = await supa.from('movimentacoes')
          .upsert(enviar.map(movParaBanco), { onConflict: 'id' });
        if (!error) {
          const restantes = pendM.filter(id => !enviar.find(m => m.id === id));
          salvarLocal(CHAVES.movimentacoes + '_pendentes', restantes);
        }
      }
    }
  }

  /* ------- Escritas ------- */

  function marcarPendente(chave, id) {
    try {
      const k = chave + '_pendentes';
      const arr = lerLocal(k, []);
      if (!arr.includes(id)) arr.push(id);
      salvarLocal(k, arr);
    } catch (e) {}
  }

  async function salvarVenda(venda) {
    await getUsuario();
    const arr = lerLocal(CHAVES.vendas, []);
    arr.push(venda);
    salvarLocal(CHAVES.vendas, arr);
    try {
      const { error } = await getSupa().from('vendas').insert(vendaParaBanco(venda));
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      console.error('[Dados] venda offline:', err);
      marcarPendente(CHAVES.vendas, venda.id);
      return { ok: false, erro: err.message };
    }
  }

  async function salvarMovimentacao(mov) {
    await getUsuario();
    const arr = lerLocal(CHAVES.movimentacoes, []);
    arr.push(mov);
    salvarLocal(CHAVES.movimentacoes, arr);
    try {
      const { error } = await getSupa().from('movimentacoes').insert(movParaBanco(mov));
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      console.error('[Dados] mov offline:', err);
      marcarPendente(CHAVES.movimentacoes, mov.id);
      return { ok: false, erro: err.message };
    }
  }

  async function atualizarMovimentacao(mov) {
    await getUsuario();
    const arr = lerLocal(CHAVES.movimentacoes, []);
    const idx = arr.findIndex(m => String(m.id) === String(mov.id));
    if (idx >= 0) arr[idx] = mov;
    salvarLocal(CHAVES.movimentacoes, arr);
    try {
      const { error } = await getSupa().from('movimentacoes')
        .upsert(movParaBanco(mov), { onConflict: 'id' });
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      marcarPendente(CHAVES.movimentacoes, mov.id);
      return { ok: false, erro: err.message };
    }
  }

  async function salvarSaldoInicial(dataChave, valor) {
    await getUsuario();
    const saldos = lerLocal(CHAVES.saldosIniciais, {});
    saldos[dataChave] = valor;
    salvarLocal(CHAVES.saldosIniciais, saldos);
    try {
      const { error } = await getSupa().from('saldos_iniciais')
        .upsert({ usuario_id: estado.usuario.id, data_chave: dataChave, valor }, { onConflict: 'usuario_id,data_chave' });
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  }

  async function salvarSessao(sessao) {
    await getUsuario();
    const arr = lerLocal(CHAVES.sessoesCaixa, []);
    const idx = arr.findIndex(s => String(s.id) === String(sessao.id));
    if (idx >= 0) arr[idx] = sessao;
    else arr.push(sessao);
    salvarLocal(CHAVES.sessoesCaixa, arr);
    try {
      const { error } = await getSupa().from('sessoes_caixa')
        .upsert(sessaoParaBanco(sessao), { onConflict: 'id' });
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  }

  async function excluirVenda(id) {
    await getUsuario();
    const arr = lerLocal(CHAVES.vendas, []);
    salvarLocal(CHAVES.vendas, arr.filter(v => String(v.id) !== String(id)));
    try {
      const { error } = await getSupa().from('vendas')
        .delete().eq('id', String(id)).eq('usuario_id', estado.usuario.id);
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  }

  async function excluirMovimentacao(id) {
    await getUsuario();
    const arr = lerLocal(CHAVES.movimentacoes, []);
    salvarLocal(CHAVES.movimentacoes, arr.filter(m => String(m.id) !== String(id)));
    try {
      const { error } = await getSupa().from('movimentacoes')
        .delete().eq('id', String(id)).eq('usuario_id', estado.usuario.id);
      if (error) throw error;
      notificar();
      return { ok: true };
    } catch (err) {
      return { ok: false, erro: err.message };
    }
  }

  function notificar() {
    ouvintes.forEach(cb => { try { cb(); } catch (e) { console.error(e); } });
  }
  function onSync(cb) {
    ouvintes.add(cb);
    return () => ouvintes.delete(cb);
  }

  window.DrTrocoDados = {
    sincronizar, onSync, estaPronto: () => estado.sincronizado,
    // leituras síncronas (cache)
    vendas: () => lerLocal(CHAVES.vendas, []),
    movimentacoes: () => lerLocal(CHAVES.movimentacoes, []),
    saldoInicial: (d) => { const s = lerLocal(CHAVES.saldosIniciais, {}); return Number(s[d]) || 0; },
    sessoes: () => lerLocal(CHAVES.sessoesCaixa, []),
    // escritas assíncronas
    salvarVenda, salvarMovimentacao, atualizarMovimentacao,
    salvarSaldoInicial, salvarSessao,
    excluirVenda, excluirMovimentacao
  };

  console.log('Dr. Troco — camada de dados (Supabase) pronta.');
})();
