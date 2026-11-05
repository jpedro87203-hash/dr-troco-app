/* ============================================================
   DR. TROCO — CONTROLE DE FIADO (SUPABASE)
   Arquivo: fiado.js
   Armazenamento: Supabase (fiado_clientes / fiado_movimentacoes)
   Backup/fallback: localStorage (drTroco_fiadoClientes)
   Estrutura real: ids são TEXT, valor_centavos é BIGINT, valor é NUMERIC
============================================================ */

'use strict';

(() => {
  if (window.__drTrocoFiadoInicializado) return;
  window.__drTrocoFiadoInicializado = true;

  const TAB_CLIENTES = 'fiado_clientes';
  const TAB_MOVS     = 'fiado_movimentacoes';
  const CHAVE_LOCAL  = 'drTroco_fiadoClientes';

  const $ = id => document.getElementById(id);

  const elementos = {
    totalClientes: $('fiadoTotalClientes'),
    totalRecebido: $('fiadoTotalRecebido'),
    totalAberto:   $('fiadoTotalAberto'),

    busca:    $('fiadoBuscaCliente'),
    contagem: $('fiadoContagemClientes'),
    lista:    $('fiadoListaClientes'),

    modalCadastro: $('modalCadastroFiado'),
    formCadastro:  $('formCadastroCliente'),
    nome:          $('fiadoNomeCliente'),
    telefone:      $('fiadoTelefoneCliente'),

    modalDetalhes:       $('modalDetalhesFiado'),
    detalhesNome:        $('fiadoDetalhesNome'),
    detalhesTelefone:    $('fiadoDetalhesTelefone'),
    detalhesSaldo:       $('fiadoDetalhesSaldo'),
    detalhesCompras:     $('fiadoDetalhesCompras'),
    detalhesPago:        $('fiadoDetalhesPago'),

    mesReferencia:  $('fiadoMesReferencia'),
    resumoMensal:   $('fiadoResumoMensal'),
    periodoExtrato: $('fiadoPeriodoExtrato'),
    historico:      $('fiadoHistoricoCliente'),

    btnComprar:        $('btnAdicionarDividaFiado'),
    btnPagamento:      $('btnRegistrarPagamentoFiado'),
    btnPDF:            $('btnExportarFiadoPDF'),
    btnExcluirCliente: $('btnExcluirClienteFiado'),

    btnFecharDetalhes:  $('btnFecharDetalhesFiado'),
    btnFecharDetalhes2: $('btnFecharDetalhesFiado2'),

    modalPagamento:       $('modalPagamentoFiado'),
    formPagamento:        $('formPagamentoFiado'),
    valorPagamento:       $('fiadoValorPagamento'),
    formaPagamento:       $('fiadoFormaPagamento'),
    observacaoPagamento:  $('fiadoObservacaoPagamento'),

    btnFecharPagamento:   $('btnFecharPagamentoFiado'),
    btnCancelarPagamento: $('btnCancelarPagamentoFiado'),

    notificacao: $('fiadoNotificacao')
  };

  let clientes = [];
  let clienteSelecionadoId = null;
  let usuarioAtual = null;
  let carregando = false;
  let pronto = false;
  let erroCarregamento = null;
  let temporizadorNotificacao = null;

  /* ==========================================================
     UTILITÁRIOS
  ========================================================== */

  function getSupa() {
    if (!window.supabaseClient) throw new Error('Cliente Supabase não inicializado (supabase.js).');
    return window.supabaseClient;
  }

  async function getUsuario() {
    if (usuarioAtual) return usuarioAtual;
    const { data: { user }, error } = await getSupa().auth.getUser();
    if (error || !user) throw new Error('Usuário não autenticado.');
    usuarioAtual = user;
    return user;
  }

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  // IMPORTANTE: id é TEXT na tabela real.
  // Qualquer string não vazia pode ser preservada na migração.
  function idPreservavel(v) {
    return typeof v === 'string' && v.trim().length > 0;
  }

  function agoraISO() { return new Date().toISOString(); }

  function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function mesAtual() { return dataLocalISO().slice(0, 7); }

  function formatarDinheiro(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function paraCentavos(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
    if (typeof valor !== 'string') return 0;
    let texto = valor.trim();
    if (!texto) return 0;
    texto = texto.replace(/[R$\s]/g, '');
    if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    const numero = Number(texto);
    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function normalizarTexto(valor) {
    return String(valor ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLocaleLowerCase('pt-BR');
  }

  function obterDataMovimento(mov) {
    const valor = mov.data || mov.dataHora;
    if (!valor) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor);
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    return dataLocalISO(d);
  }

  function formatarData(valor) {
    if (!valor) return 'Data não informada';
    const texto = String(valor);
    const iso = /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : obterDataMovimento({ data: texto });
    if (!iso) return 'Data não informada';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : 'Data não informada';
  }

  function formatarHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatarMes(mes) {
    if (!/^\d{4}-\d{2}$/.test(String(mes))) return String(mes || '');
    const [ano, n] = mes.split('-');
    return new Date(Number(ano), Number(n) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function clonar(v) { return JSON.parse(JSON.stringify(v)); }

  function mostrarNotificacao(msg, erro = false) {
    const el = elementos.notificacao;
    if (!el) { console.log('[Fiado]', msg); return; }
    clearTimeout(temporizadorNotificacao);
    el.textContent = msg;
    el.classList.toggle('erro', erro);
    el.classList.add('visivel');
    temporizadorNotificacao = setTimeout(() => el.classList.remove('visivel'), 3600);
  }

  function confirmar(msg) { return window.confirm(msg); }

  /* ==========================================================
     MAPEAMENTO BANCO <-> APP
     Estrutura real:
       fiado_clientes: id text, nome, telefone, criado_em, atualizado_em, usuario_id
       fiado_movimentacoes: id text, cliente_id text, tipo, valor_centavos bigint,
                            valor numeric, descricao, forma, observacao, data, data_hora,
                            origem, venda_id text, usuario_id
  ========================================================== */

  function clienteDoBanco(row) {
    return {
      id: String(row.id),
      nome: row.nome,
      telefone: row.telefone || '',
      criadoEm: row.criado_em || agoraISO(),
      atualizadoEm: row.atualizado_em || row.criado_em || agoraISO(),
      movimentacoes: []
    };
  }

  function movDoBanco(row) {
    const tipo = row.tipo === 'pagamento' ? 'pagamento' : 'divida';
    // valor_centavos é bigint; pode vir como string do driver. Converter.
    let valorC = Number(row.valor_centavos);
    if (!Number.isFinite(valorC) || valorC === 0) {
      // fallback: usar valor numeric se valor_centavos estiver vazio
      const v = Number(row.valor);
      valorC = Number.isFinite(v) ? Math.round(v * 100) : 0;
    }
    return {
      id: String(row.id),
      tipo,
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: row.descricao || '',
      data: row.data || (row.data_hora ? String(row.data_hora).slice(0, 10) : dataLocalISO()),
      dataHora: row.data_hora || agoraISO(),
      forma: row.forma || (tipo === 'pagamento' ? 'dinheiro' : ''),
      observacao: row.observacao || '',
      origem: row.origem || '',
      vendaId: row.venda_id || null
    };
  }

  function clienteParaBanco(c) {
    return {
      id: String(c.id),
      usuario_id: usuarioAtual.id,
      nome: String(c.nome || '').trim(),
      telefone: c.telefone ? String(c.telefone).trim() : null,
      criado_em: c.criadoEm || agoraISO(),
      atualizado_em: agoraISO()
    };
  }

  function movParaBanco(m, clienteId) {
    const tipo = m.tipo === 'pagamento' ? 'pagamento' : 'divida';
    const valorC = Number(m.valorCentavos) || 0;
    return {
      id: String(m.id),
      usuario_id: usuarioAtual.id,
      cliente_id: String(clienteId),
      tipo,
      valor_centavos: valorC,
      valor: valorC / 100,               // coluna numeric espelhada — mantém consistência
      descricao: m.descricao || (tipo === 'divida' ? 'Compra fiado' : 'Pagamento'),
      data: m.data || dataLocalISO(),
      data_hora: m.dataHora || agoraISO(),
      forma: m.forma || (tipo === 'pagamento' ? 'dinheiro' : null),
      observacao: m.observacao || null,
      origem: m.origem || null,
      venda_id: m.vendaId || null
    };
  }

  /* ==========================================================
     CARREGAMENTO + MIGRAÇÃO
  ========================================================== */

  async function carregarTudo() {
    if (carregando) return pronto;
    carregando = true;
    erroCarregamento = null;

    try {
      await getUsuario();
      const supa = getSupa();

      const [cliResp, movResp] = await Promise.all([
        supa.from(TAB_CLIENTES).select('*').eq('usuario_id', usuarioAtual.id).order('nome', { ascending: true }),
        supa.from(TAB_MOVS).select('*').eq('usuario_id', usuarioAtual.id).order('data_hora', { ascending: false })
      ]);

      if (cliResp.error) throw cliResp.error;
      if (movResp.error) throw movResp.error;

      const mapa = new Map();
      (cliResp.data || []).forEach(row => mapa.set(String(row.id), clienteDoBanco(row)));
      (movResp.data || []).forEach(row => {
        const c = mapa.get(String(row.cliente_id));
        if (c) c.movimentacoes.push(movDoBanco(row));
      });

      clientes = Array.from(mapa.values());
      pronto = true;
      return true;

    } catch (err) {
      console.error('[Fiado] Falha ao carregar do Supabase:', err);
      erroCarregamento = err;
      if (clientes.length === 0) {
        try {
          const bruto = localStorage.getItem(CHAVE_LOCAL);
          if (bruto) {
            const dados = JSON.parse(bruto);
            if (Array.isArray(dados)) {
              clientes = dados
                .filter(c => c && typeof c === 'object')
                .map(normalizarClienteLocal)
                .filter(c => c.nome);
            }
          }
        } catch (_) { /* ignora */ }
      }
      return false;
    } finally {
      carregando = false;
    }
  }

  function normalizarClienteLocal(c) {
    const item = { ...c };
    item.id = item.id ? String(item.id) : gerarId();
    item.nome = String(item.nome || item.nomeCliente || '').trim();
    item.telefone = String(item.telefone || '').trim();
    item.criadoEm = item.criadoEm || item.dataCadastro || agoraISO();
    item.atualizadoEm = item.atualizadoEm || item.criadoEm;
    const movs = Array.isArray(item.movimentacoes) ? item.movimentacoes : [];
    item.movimentacoes = movs.map(m => {
      const mm = { ...m };
      mm.id = mm.id ? String(mm.id) : gerarId();
      mm.tipo = (mm.tipo === 'pagamento') ? 'pagamento' : 'divida';
      mm.valorCentavos = Number.isInteger(mm.valorCentavos)
        ? mm.valorCentavos
        : paraCentavos(mm.valor ?? mm.valorTotal ?? 0);
      mm.valor = mm.valorCentavos / 100;
      mm.data = obterDataMovimento(mm) || dataLocalISO();
      mm.dataHora = mm.dataHora || `${mm.data}T12:00:00`;
      if (mm.tipo === 'pagamento') mm.forma = mm.forma || 'dinheiro';
      return mm;
    });
    return item;
  }

  /**
   * Migração idempotente — preserva IDs textuais sempre que possível.
   */
  async function migrarDadosLocais() {
    await getUsuario();
    const supa = getSupa();
    const user = usuarioAtual;

    let locais;
    try {
      const bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return { migrados: 0, pulados: 0, erro: null, vazio: true };
      locais = JSON.parse(bruto);
      if (!Array.isArray(locais)) return { migrados: 0, pulados: 0, erro: 'Dados locais malformados.' };
    } catch (err) {
      return { migrados: 0, pulados: 0, erro: 'Dados locais malformados.' };
    }
    if (!locais.length) return { migrados: 0, pulados: 0, erro: null, vazio: true };

    const [idsCliResp, idsMovResp] = await Promise.all([
      supa.from(TAB_CLIENTES).select('id').eq('usuario_id', user.id),
      supa.from(TAB_MOVS).select('id').eq('usuario_id', user.id)
    ]);
    if (idsCliResp.error) return { migrados: 0, pulados: 0, erro: 'Falha ao verificar clientes existentes: ' + idsCliResp.error.message };
    if (idsMovResp.error) return { migrados: 0, pulados: 0, erro: 'Falha ao verificar movimentações existentes: ' + idsMovResp.error.message };

    const idsClientes = new Set((idsCliResp.data || []).map(r => String(r.id)));
    const idsMovs = new Set((idsMovResp.data || []).map(r => String(r.id)));

    let migrados = 0, pulados = 0;

    for (const local of locais) {
      if (!local || typeof local !== 'object') continue;
      const nome = String(local.nome || local.nomeCliente || '').trim();
      if (!nome) continue;

      const idOriginal = local.id ? String(local.id) : null;
      const podePreservarId = idPreservavel(idOriginal);
      const jaExiste = podePreservarId && idsClientes.has(idOriginal);

      let idCliente;
      if (jaExiste) {
        idCliente = idOriginal;
        pulados++;
      } else {
        idCliente = podePreservarId ? idOriginal : gerarId();

        const { error: insErr } = await supa.from(TAB_CLIENTES).insert({
          id: idCliente,
          usuario_id: user.id,
          nome,
          telefone: local.telefone || null,
          criado_em: local.criadoEm || local.dataCadastro || agoraISO(),
          atualizado_em: local.atualizadoEm || agoraISO()
        });

        if (insErr) {
          console.error('[Fiado/migração] Falha ao inserir cliente', nome, insErr);
          continue;
        }
        idsClientes.add(idCliente);
        migrados++;
      }

      const movsLocais = Array.isArray(local.movimentacoes) ? local.movimentacoes : [];
      for (const movLocal of movsLocais) {
        if (!movLocal || typeof movLocal !== 'object') continue;
        const valorC = Number.isInteger(movLocal.valorCentavos)
          ? movLocal.valorCentavos
          : paraCentavos(movLocal.valor ?? 0);
        if (valorC <= 0) continue;

        const idMovOrig = movLocal.id ? String(movLocal.id) : null;
        const preservarMov = idPreservavel(idMovOrig);
        const movJaExiste = preservarMov && idsMovs.has(idMovOrig);
        if (movJaExiste) { pulados++; continue; }

        const idMov = preservarMov ? idMovOrig : gerarId();
        const tipo = movLocal.tipo === 'pagamento' ? 'pagamento' : 'divida';

        const { error: movErr } = await supa.from(TAB_MOVS).insert({
          id: idMov,
          usuario_id: user.id,
          cliente_id: String(idCliente),
          tipo,
          valor_centavos: valorC,
          valor: valorC / 100,
          descricao: movLocal.descricao || (tipo === 'divida' ? 'Compra fiado' : 'Pagamento'),
          data: movLocal.data || dataLocalISO(),
          data_hora: movLocal.dataHora || agoraISO(),
          forma: movLocal.forma || (tipo === 'pagamento' ? 'dinheiro' : null),
          observacao: movLocal.observacao || null,
          origem: movLocal.origem || null,
          venda_id: movLocal.vendaId || null
        });

        if (movErr) {
          console.error('[Fiado/migração] Falha ao inserir movimentação', movErr);
          continue;
        }
        idsMovs.add(idMov);
        migrados++;
      }
    }

    return { migrados, pulados, erro: null };
  }

  /* ==========================================================
     OPERAÇÕES DE CLIENTE
  ========================================================== */

  async function inserirCliente({ nome, telefone }) {
    await getUsuario();
    const supa = getSupa();
    const novo = {
      id: gerarId(),
      nome: String(nome).trim(),
      telefone: String(telefone || '').trim(),
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
      movimentacoes: []
    };
    const { data, error } = await supa.from(TAB_CLIENTES).insert(clienteParaBanco(novo)).select().single();
    if (error) throw new Error('Falha ao cadastrar cliente: ' + error.message);
    return clienteDoBanco(data);
  }

  async function atualizarCliente(id, { nome, telefone }) {
    await getUsuario();
    const supa = getSupa();
    const { data, error } = await supa.from(TAB_CLIENTES)
      .update({
        nome: String(nome).trim(),
        telefone: String(telefone || '').trim() || null,
        atualizado_em: agoraISO()
      })
      .eq('id', String(id)).eq('usuario_id', usuarioAtual.id)
      .select().single();
    if (error) throw new Error('Falha ao editar cliente: ' + error.message);
    return clienteDoBanco(data);
  }

  async function removerCliente(id) {
    await getUsuario();
    const supa = getSupa();

    const { data: movs, error: e1 } = await supa.from(TAB_MOVS)
      .select('id').eq('cliente_id', String(id)).eq('usuario_id', usuarioAtual.id).limit(1);
    if (e1) throw new Error('Falha ao verificar movimentações: ' + e1.message);
    if (movs && movs.length > 0) throw new Error('Este cliente possui movimentações. Exclua-as primeiro.');

    const { error: e2 } = await supa.from(TAB_CLIENTES)
      .delete().eq('id', String(id)).eq('usuario_id', usuarioAtual.id);
    if (e2) throw new Error('Falha ao excluir cliente: ' + e2.message);
  }

  async function inserirMovimentacao(clienteId, mov) {
    await getUsuario();
    const supa = getSupa();
    const { data, error } = await supa.from(TAB_MOVS)
      .insert(movParaBanco(mov, clienteId)).select().single();
    if (error) throw new Error('Falha ao registrar movimentação: ' + error.message);
    return movDoBanco(data);
  }

  async function removerMovimentacao(movId) {
    await getUsuario();
    const supa = getSupa();
    const { error } = await supa.from(TAB_MOVS)
      .delete().eq('id', String(movId)).eq('usuario_id', usuarioAtual.id);
    if (error) throw new Error('Falha ao excluir movimentação: ' + error.message);
  }

  /* ==========================================================
     CÁLCULOS
  ========================================================== */

  function obterMovimentacoes(c) { return Array.isArray(c.movimentacoes) ? c.movimentacoes : []; }

  function valorMovimentoCentavos(m) {
    return Number.isInteger(m.valorCentavos) ? m.valorCentavos : paraCentavos(m.valor ?? 0);
  }

  function totalPorTipo(c, tipo) {
    return obterMovimentacoes(c).reduce((t, m) => m.tipo === tipo ? t + valorMovimentoCentavos(m) : t, 0);
  }

  const totalComprado = c => totalPorTipo(c, 'divida');
  const totalPago     = c => totalPorTipo(c, 'pagamento');
  const obterSaldo    = c => totalComprado(c) - totalPago(c);

  function buscarClienteInterno(id) {
    return clientes.find(c => String(c.id) === String(id)) || null;
  }

  function ordenarMovimentacoes(movs) {
    return [...movs].sort((a, b) => {
      const da = new Date(a.dataHora || a.data || 0).getTime();
      const db = new Date(b.dataHora || b.data || 0).getTime();
      if (da !== db) return db - da;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }

  /* ==========================================================
     MODAIS
  ========================================================== */

  function abrirModal(modal, campo) {
    if (!modal) return;
    modal.classList.add('aberto');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (campo) setTimeout(() => campo.focus(), 80);
  }

  function fecharModal(modal) {
    if (!modal) return;
    modal.classList.remove('aberto');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.fiado-modal.aberto')) document.body.style.overflow = '';
  }

  function fecharDetalhes() { fecharModal(elementos.modalDetalhes); clienteSelecionadoId = null; }
  function fecharPagamento() {
    fecharModal(elementos.modalPagamento);
    if (elementos.formPagamento) elementos.formPagamento.reset();
  }
  function fecharTodosModais() {
    document.querySelectorAll('.fiado-modal.aberto').forEach(fecharModal);
    clienteSelecionadoId = null;
  }

  document.querySelectorAll('.fiado-modal').forEach(modal => {
    modal.addEventListener('click', ev => { if (ev.target === modal) fecharModal(modal); });
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharTodosModais(); });

  /* ==========================================================
     CADASTRO / EDIÇÃO DE CLIENTES
  ========================================================== */

  function abrirCadastroCliente(cliente = null) {
    if (!elementos.formCadastro) return;
    elementos.formCadastro.reset();
    const titulo = $('tituloCadastroFiado');
    const btnSalvar = elementos.formCadastro.querySelector('[type="submit"]');

    if (cliente) {
      elementos.nome.value = cliente.nome;
      elementos.telefone.value = cliente.telefone || '';
      if (titulo) titulo.textContent = 'Editar cliente';
      if (btnSalvar) btnSalvar.textContent = 'Salvar alterações';
      elementos.formCadastro.dataset.editarId = cliente.id;
    } else {
      if (titulo) titulo.textContent = 'Cadastrar cliente';
      if (btnSalvar) btnSalvar.textContent = '＋ Salvar cliente';
      delete elementos.formCadastro.dataset.editarId;
    }
    abrirModal(elementos.modalCadastro, elementos.nome);
  }

  async function salvarCliente(evento) {
    evento.preventDefault();
    const nome = elementos.nome.value.trim();
    const telefone = elementos.telefone.value.trim();
    const idEdicao = elementos.formCadastro.dataset.editarId;

    if (!nome) { mostrarNotificacao('Digite o nome do cliente.', true); elementos.nome.focus(); return; }

    const nomeNorm = normalizarTexto(nome);
    const duplicado = clientes.find(c =>
      normalizarTexto(c.nome) === nomeNorm && String(c.id) !== String(idEdicao || '')
    );
    if (duplicado && !confirmar('Já existe um cliente com esse nome. Cadastrar mesmo assim?')) return;

    try {
      if (idEdicao) {
        const atualizado = await atualizarCliente(idEdicao, { nome, telefone });
        const local = buscarClienteInterno(idEdicao);
        if (local) {
          local.nome = atualizado.nome;
          local.telefone = atualizado.telefone;
          local.atualizadoEm = atualizado.atualizadoEm;
        }
        fecharModal(elementos.modalCadastro);
        mostrarNotificacao('Dados do cliente atualizados!');
      } else {
        const novo = await inserirCliente({ nome, telefone });
        clientes.push(novo);
        clientes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        fecharModal(elementos.modalCadastro);
        mostrarNotificacao('Cliente cadastrado com sucesso!');
      }
      renderizarTudo();
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Não foi possível salvar o cliente.', true);
    }
  }

  async function excluirCliente(id) {
    const cliente = buscarClienteInterno(id);
    if (!cliente) { mostrarNotificacao('Cliente não encontrado.', true); return; }

    const saldo = obterSaldo(cliente);
    let msg = `Deseja excluir o cliente "${cliente.nome}"?`;
    if (saldo > 0) msg += `\n\nSaldo devedor atual: ${formatarDinheiro(saldo)}.`;
    msg += '\n\nO histórico deste cliente será removido do Fiado.';
    if (!confirmar(msg)) return;

    try {
      await removerCliente(id);
      clientes = clientes.filter(c => String(c.id) !== String(id));
      fecharModal(elementos.modalDetalhes);
      clienteSelecionadoId = null;
      renderizarTudo();
      mostrarNotificacao('Cliente excluído.');
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Não foi possível excluir.', true);
    }
  }

  /* ==========================================================
     COMPRAS / PAGAMENTOS
  ========================================================== */

  function criarModalCompra() {
    let modal = $('modalNovaDividaFiado');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modalNovaDividaFiado';
    modal.className = 'fiado-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="fiado-modal-conteudo">
        <div class="fiado-modal-topo">
          <div><h2>Registrar compra fiado</h2><p>Informe o valor da compra.</p></div>
          <button type="button" class="fiado-btn-fechar" data-fechar-compra aria-label="Fechar">×</button>
        </div>
        <form id="formNovaDividaFiado" class="fiado-form">
          <div class="fiado-campo">
            <label for="fiadoValorDivida">Valor da compra (R$) *</label>
            <input id="fiadoValorDivida" name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
          </div>
          <div class="fiado-campo">
            <label for="fiadoDescricaoDivida">Descrição (opcional)</label>
            <textarea id="fiadoDescricaoDivida" name="descricao" maxlength="300" rows="3" placeholder="Detalhes da compra"></textarea>
          </div>
          <button type="submit" class="fiado-btn fiado-btn-principal">Salvar compra</button>
          <button type="button" class="fiado-btn fiado-btn-neutro" data-fechar-compra>Cancelar</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-fechar-compra]').forEach(b => b.addEventListener('click', () => fecharModal(modal)));
    modal.addEventListener('click', ev => { if (ev.target === modal) fecharModal(modal); });
    modal.querySelector('#formNovaDividaFiado').addEventListener('submit', registrarCompraManual);
    return modal;
  }

  async function registrarCompraManual(evento) {
    evento.preventDefault();
    const modal = $('modalNovaDividaFiado');
    const campoValor = $('fiadoValorDivida');
    const campoDesc = $('fiadoDescricaoDivida');
    const valorC = paraCentavos(campoValor.value);
    if (valorC <= 0) { mostrarNotificacao('Informe um valor válido.', true); campoValor.focus(); return; }

    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Selecione um cliente.', true); fecharModal(modal); return; }

    const mov = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: campoDesc.value.trim() || 'Compra fiado',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'manual'
    };

    try {
      const salvo = await inserirMovimentacao(cliente.id, mov);
      cliente.movimentacoes.push(salvo);
      cliente.atualizadoEm = agoraISO();
      fecharModal(modal);
      mostrarNotificacao('Compra registrada: ' + formatarDinheiro(valorC));
      renderizarTudo();
      abrirDetalhes(cliente.id);
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao registrar compra.', true);
    }
  }

  function abrirCompra() {
    if (!clienteSelecionadoId) { mostrarNotificacao('Selecione um cliente.', true); return; }
    const modal = criarModalCompra();
    const form = $('formNovaDividaFiado');
    if (form) form.reset();
    abrirModal(modal, $('fiadoValorDivida'));
  }

  function abrirPagamento() {
    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Selecione um cliente.', true); return; }
    if (obterSaldo(cliente) <= 0) { mostrarNotificacao('Este cliente não possui saldo devedor.', true); return; }
    if (elementos.formPagamento) elementos.formPagamento.reset();
    abrirModal(elementos.modalPagamento, elementos.valorPagamento);
  }

  async function registrarPagamentoManual(evento) {
    evento.preventDefault();
    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Cliente não encontrado.', true); return; }

    const valorC = paraCentavos(elementos.valorPagamento.value);
    const saldoAtual = obterSaldo(cliente);

    if (valorC <= 0) { mostrarNotificacao('Informe um valor válido.', true); elementos.valorPagamento.focus(); return; }
    if (valorC > saldoAtual) {
      mostrarNotificacao('O pagamento não pode ser maior que a dívida (' + formatarDinheiro(saldoAtual) + ').', true);
      return;
    }

    const forma = elementos.formaPagamento.value;
    if (!['dinheiro', 'pix', 'debito', 'credito'].includes(forma)) {
      mostrarNotificacao('Forma de pagamento inválida.', true);
      return;
    }

    const mov = {
      id: gerarId(),
      tipo: 'pagamento',
      valorCentavos: valorC,
      valor: valorC / 100,
      forma,
      observacao: elementos.observacaoPagamento.value.trim(),
      descricao: 'Pagamento recebido',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'manual'
    };

    try {
      const salvo = await inserirMovimentacao(cliente.id, mov);
      cliente.movimentacoes.push(salvo);
      cliente.atualizadoEm = agoraISO();
      fecharPagamento();
      mostrarNotificacao('Pagamento registrado: ' + formatarDinheiro(valorC));
      renderizarTudo();
      abrirDetalhes(cliente.id);
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao registrar pagamento.', true);
    }
  }

  /* ==========================================================
     API PÚBLICA
  ========================================================== */

  async function registrarVendaFiado(dados) {
    if (!dados || typeof dados !== 'object') return { sucesso: false, erro: 'Dados inválidos.' };
    const idCliente = dados.clienteId ?? dados.idCliente ?? dados.cliente_id;
    const cliente = buscarClienteInterno(idCliente);
    if (!cliente) return { sucesso: false, erro: 'Cliente não encontrado.' };

    const valorC = paraCentavos(dados.valor ?? dados.total ?? dados.valorTotal);
    if (valorC <= 0) return { sucesso: false, erro: 'Valor inválido.' };

    const mov = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: String(dados.descricao || 'Venda fiado').trim(),
      data: dados.data || dataLocalISO(),
      dataHora: agoraISO(),
      origem: dados.origem || 'pdv',
      vendaId: dados.vendaId || null
    };

    try {
      const salvo = await inserirMovimentacao(cliente.id, mov);
      cliente.movimentacoes.push(salvo);
      cliente.atualizadoEm = agoraISO();
      renderizarTudo();
      return { sucesso: true, clienteId: cliente.id, movimentoId: salvo.id, saldoDevedor: obterSaldo(cliente) / 100 };
    } catch (err) {
      console.error('[Fiado] Erro registrarVendaFiado:', err);
      return { sucesso: false, erro: err.message };
    }
  }

  async function registrarPagamentoAPI(idCliente, valor, forma = 'dinheiro', observacao = '', vendaId = null) {
    const cliente = buscarClienteInterno(idCliente);
    if (!cliente) return { sucesso: false, erro: 'Cliente não encontrado.' };

    const valorC = paraCentavos(valor);
    if (valorC <= 0) return { sucesso: false, erro: 'Valor inválido.' };
    if (!['dinheiro', 'pix', 'debito', 'credito'].includes(forma)) return { sucesso: false, erro: 'Forma de pagamento inválida.' };

    const mov = {
      id: gerarId(),
      tipo: 'pagamento',
      valorCentavos: valorC,
      valor: valorC / 100,
      forma,
      observacao: String(observacao || ''),
      descricao: 'Pagamento recebido',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'pdv',
      vendaId
    };

    try {
      const salvo = await inserirMovimentacao(cliente.id, mov);
      cliente.movimentacoes.push(salvo);
      cliente.atualizadoEm = agoraISO();
      renderizarTudo();
      return { sucesso: true, clienteId: cliente.id, movimentoId: salvo.id, saldoDevedor: obterSaldo(cliente) / 100 };
    } catch (err) {
      console.error('[Fiado] Erro registrarPagamento:', err);
      return { sucesso: false, erro: err.message };
    }
  }

  async function buscarClienteAPI(id) {
    const c = buscarClienteInterno(id);
    return c ? clonar(c) : null;
  }

  async function listarClientes() {
    if (!pronto && !carregando) await carregarTudo();
    return clonar(clientes);
  }

  async function listarClientesComSaldo() {
    if (!pronto && !carregando) await carregarTudo();
    return clientes.map(c => ({ id: c.id, nome: c.nome, telefone: c.telefone, saldoDevedor: obterSaldo(c) / 100 }));
  }

  async function saldoDevedorAPI(id) {
    const c = buscarClienteInterno(id);
    return c ? obterSaldo(c) / 100 : null;
  }

  async function excluirMovimentacao(clienteId, movId) {
    const cliente = buscarClienteInterno(clienteId);
    if (!cliente) { mostrarNotificacao('Cliente não encontrado.', true); return; }

    const idx = cliente.movimentacoes.findIndex(m => String(m.id) === String(movId));
    if (idx < 0) { mostrarNotificacao('Movimentação não encontrada.', true); return; }

    const mov = cliente.movimentacoes[idx];
    const tipo = mov.tipo === 'pagamento' ? 'pagamento' : 'compra fiado';
    if (!confirmar(`Excluir este lançamento de ${tipo}? O saldo do cliente será recalculado.`)) return;

    try {
      await removerMovimentacao(movId);
      cliente.movimentacoes.splice(idx, 1);
      cliente.atualizadoEm = agoraISO();
      renderizarTudo();
      if (elementos.modalDetalhes?.classList.contains('aberto')) renderizarDetalhes(cliente);
      mostrarNotificacao('Lançamento excluído.');
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao excluir.', true);
    }
  }

  /* ==========================================================
     RENDERIZAÇÃO
  ========================================================== */

  function atualizarResumoGeral() {
    const qtd = clientes.length;
    const recebido = clientes.reduce((t, c) => t + totalPago(c), 0);
    const aberto = clientes.reduce((t, c) => t + obterSaldo(c), 0);
    if (elementos.totalClientes) elementos.totalClientes.textContent = String(qtd);
    if (elementos.totalRecebido) elementos.totalRecebido.textContent = formatarDinheiro(recebido);
    if (elementos.totalAberto) elementos.totalAberto.textContent = formatarDinheiro(aberto);
  }

  function renderizarClientes() {
    if (!elementos.lista) return;
    const busca = normalizarTexto(elementos.busca?.value || '');
    const filtrados = clientes
      .filter(c => {
        const n = normalizarTexto(c.nome);
        const t = normalizarTexto(c.telefone);
        return n.includes(busca) || t.includes(busca);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (elementos.contagem) {
      elementos.contagem.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'}`;
    }

    if (!filtrados.length) {
      const vazio = busca
        ? { icone: '🔎', titulo: 'Nenhum cliente encontrado', desc: 'Tente outro nome ou telefone.' }
        : { icone: '👥', titulo: 'Nenhum cliente cadastrado', desc: 'Toque em “Cadastrar cliente” para começar.' };
      elementos.lista.innerHTML = `
        <div class="fiado-vazio">
          <div aria-hidden="true">${vazio.icone}</div>
          <h3>${vazio.titulo}</h3>
          <p>${vazio.desc}</p>
        </div>`;
      return;
    }

    elementos.lista.innerHTML = filtrados.map(c => {
      const saldo = obterSaldo(c);
      const tel = c.telefone || 'Telefone não informado';
      return `
        <article class="fiado-cliente-card">
          <div class="fiado-cliente-info">
            <div class="fiado-avatar" aria-hidden="true">👤</div>
            <div class="fiado-cliente-texto">
              <h3>${escaparHTML(c.nome)}</h3>
              <p>${escaparHTML(tel)}</p>
              <small>${obterMovimentacoes(c).length} movimentações</small>
            </div>
          </div>
          <div class="fiado-cliente-saldo">
            <span>Saldo devedor</span>
            <strong>${formatarDinheiro(saldo)}</strong>
          </div>
          <button type="button" class="fiado-btn fiado-btn-secundario"
            data-acao="detalhes" data-id="${escaparHTML(c.id)}">
            Ver detalhes
          </button>
        </article>`;
    }).join('');
  }

  function abrirDetalhes(id) {
    const c = buscarClienteInterno(id);
    if (!c) { mostrarNotificacao('Cliente não encontrado.', true); return; }
    clienteSelecionadoId = c.id;

    if (elementos.detalhesNome) elementos.detalhesNome.textContent = c.nome;
    if (elementos.detalhesTelefone) elementos.detalhesTelefone.textContent = c.telefone || 'Telefone não informado';
    if (elementos.mesReferencia && !elementos.mesReferencia.value) elementos.mesReferencia.value = mesAtual();
    renderizarDetalhes(c);
    abrirModal(elementos.modalDetalhes);
  }

  function renderizarDetalhes(c) {
    if (!c) return;
    const compras = totalComprado(c);
    const pago = totalPago(c);
    const saldo = obterSaldo(c);
    if (elementos.detalhesSaldo) elementos.detalhesSaldo.textContent = formatarDinheiro(saldo);
    if (elementos.detalhesCompras) elementos.detalhesCompras.textContent = formatarDinheiro(compras);
    if (elementos.detalhesPago) elementos.detalhesPago.textContent = formatarDinheiro(pago);
    renderizarResumoMensal(c);
    renderizarHistorico(c);
  }

  function renderizarResumoMensal(c) {
    if (!elementos.resumoMensal) return;
    const mes = elementos.mesReferencia?.value || mesAtual();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      elementos.resumoMensal.innerHTML = '<div class="fiado-vazio"><h3>Selecione um mês válido</h3></div>';
      return;
    }
    const movs = obterMovimentacoes(c);
    const anteriores = movs.filter(m => { const d = obterDataMovimento(m); return d && d.slice(0, 7) < mes; });
    const doMes = movs.filter(m => { const d = obterDataMovimento(m); return d && d.slice(0, 7) === mes; });
    const saldoAnterior = anteriores.reduce((s, m) => {
      const v = valorMovimentoCentavos(m);
      return m.tipo === 'divida' ? s + v : (m.tipo === 'pagamento' ? s - v : s);
    }, 0);
    const comprasMes = doMes.filter(m => m.tipo === 'divida').reduce((t, m) => t + valorMovimentoCentavos(m), 0);
    const pagMes = doMes.filter(m => m.tipo === 'pagamento').reduce((t, m) => t + valorMovimentoCentavos(m), 0);
    const saldoFinal = saldoAnterior + comprasMes - pagMes;

    const itens = [
      { t: 'Saldo anterior', v: saldoAnterior, c: '' },
      { t: 'Compras do mês', v: comprasMes, c: '' },
      { t: 'Pagamentos do mês', v: pagMes, c: '' },
      { t: 'Saldo final do mês', v: saldoFinal, c: 'final' }
    ];
    elementos.resumoMensal.innerHTML = itens.map(i => `
      <div class="fiado-mes-item ${i.c}">
        <span>${i.t}</span><strong>${formatarDinheiro(i.v)}</strong>
      </div>`).join('');
  }

  function renderizarHistorico(c) {
    if (!elementos.historico) return;
    const movs = ordenarMovimentacoes(obterMovimentacoes(c));
    if (!movs.length) {
      elementos.historico.innerHTML = `
        <div class="fiado-vazio">
          <div aria-hidden="true">📋</div>
          <h3>Nenhuma movimentação</h3>
          <p>As compras e os pagamentos aparecerão aqui.</p>
        </div>`;
      return;
    }

    let saldo = 0;
    const cronologicas = [...movs].reverse();
    const saldoDepois = new Map();
    cronologicas.forEach(m => {
      const v = valorMovimentoCentavos(m);
      if (m.tipo === 'divida') saldo += v;
      if (m.tipo === 'pagamento') saldo -= v;
      saldoDepois.set(m.id, saldo);
    });

    elementos.historico.innerHTML = movs.map(m => {
      const pag = m.tipo === 'pagamento';
      const v = valorMovimentoCentavos(m);
      const data = obterDataMovimento(m);
      const hora = formatarHora(m.dataHora);
      const titulo = pag ? 'Pagamento recebido' : 'Compra fiado';
      const classeValor = pag ? 'fiado-valor-pago' : 'fiado-valor-divida';
      const sinal = pag ? '− ' : '+ ';

      let detalhe = m.descricao || titulo;
      if (pag && m.forma) {
        const formas = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };
        detalhe += ' · ' + (formas[m.forma] || m.forma);
      }
      if (pag && m.observacao) detalhe += ' · ' + m.observacao;

      const saldoApos = saldoDepois.get(m.id) ?? 0;

      return `
        <article class="fiado-movimento">
          <div class="fiado-movimento-info">
            <strong>${escaparHTML(titulo)}</strong>
            <small>${escaparHTML(formatarData(data))}${hora ? ' · ' + escaparHTML(hora) : ''}</small>
            <small>${escaparHTML(detalhe)}</small>
            <span class="fiado-saldo-apos">
              Saldo após movimentação: <strong>${formatarDinheiro(saldoApos)}</strong>
            </span>
            <div class="fiado-movimento-acoes">
              <button type="button" class="fiado-btn-mini"
                data-acao="excluir-movimento"
                data-id="${escaparHTML(c.id)}"
                data-movimento-id="${escaparHTML(m.id)}">Excluir lançamento</button>
            </div>
          </div>
          <div class="fiado-movimento-valor ${classeValor}">${sinal}${formatarDinheiro(v)}</div>
        </article>`;
    }).join('');
  }

  function renderizarTudo() {
    atualizarResumoGeral();
    renderizarClientes();
    const c = buscarClienteInterno(clienteSelecionadoId);
    if (c && elementos.modalDetalhes?.classList.contains('aberto')) renderizarDetalhes(c);
  }

  /* ==========================================================
     EXTRATO PDF
  ========================================================== */

  function gerarExtratoHTML(cliente, movs, tituloPeriodo) {
    const compras = movs.reduce((t, m) => m.tipo === 'divida' ? t + valorMovimentoCentavos(m) : t, 0);
    const pagamentos = movs.reduce((t, m) => m.tipo === 'pagamento' ? t + valorMovimentoCentavos(m) : t, 0);
    const saldo = compras - pagamentos;
    const linhas = ordenarMovimentacoes(movs).map(m => {
      const pag = m.tipo === 'pagamento';
      const v = valorMovimentoCentavos(m);
      let desc = m.descricao || (pag ? 'Pagamento recebido' : 'Compra fiado');
      if (pag && m.forma) desc += ' — ' + m.forma;
      return `<tr>
        <td>${escaparHTML(formatarData(obterDataMovimento(m)))}</td>
        <td>${escaparHTML(desc)}</td>
        <td>${pag ? formatarDinheiro(v) : '—'}</td>
        <td>${pag ? '—' : formatarDinheiro(v)}</td>
      </tr>`;
    }).join('');
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Extrato — ${escaparHTML(cliente.nome)}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#263640;font-size:12px}
        header{border-bottom:2px solid #168b53;padding-bottom:16px}
        h1{margin:0 0 7px;font-size:23px}
        p{margin:4px 0}
        .resumo{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:18px 0}
        .item{padding:12px;border:1px solid #dce7e0;border-radius:9px}
        .item span{display:block;margin-bottom:7px;color:#718078}
        table{width:100%;border-collapse:collapse}
        th,td{padding:9px 7px;border-bottom:1px solid #e1eae5;text-align:left}
        th{background:#eaf8f1}
      </style></head><body>
      <header>
        <h1>Dr. Troco — Extrato do Fiado</h1>
        <p><strong>Cliente:</strong> ${escaparHTML(cliente.nome)}</p>
        <p><strong>Telefone:</strong> ${escaparHTML(cliente.telefone || 'Não informado')}</p>
        <p><strong>Período:</strong> ${escaparHTML(tituloPeriodo)}</p>
        <p><strong>Emitido em:</strong> ${escaparHTML(formatarData(dataLocalISO()))}</p>
      </header>
      <section class="resumo">
        <div class="item"><span>Total comprado</span><strong>${formatarDinheiro(compras)}</strong></div>
        <div class="item"><span>Total pago</span><strong>${formatarDinheiro(pagamentos)}</strong></div>
        <div class="item"><span>Saldo líquido</span><strong>${formatarDinheiro(saldo)}</strong></div>
      </section>
      <h2>Movimentações</h2>
      <table><thead><tr><th>Data</th><th>Descrição</th><th>Pagamento</th><th>Compra</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="4">Nenhuma movimentação no período.</td></tr>'}</tbody></table>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script>
      </body></html>`;
  }

  function exportarPDF() {
    const c = buscarClienteInterno(clienteSelecionadoId);
    if (!c) { mostrarNotificacao('Selecione um cliente.', true); return; }
    const periodo = elementos.periodoExtrato?.value || 'mes';
    let movs = obterMovimentacoes(c);
    let titulo = 'Todo o histórico';
    if (periodo === 'mes') {
      const mes = elementos.mesReferencia?.value || mesAtual();
      movs = movs.filter(m => { const d = obterDataMovimento(m); return d && d.slice(0, 7) === mes; });
      titulo = formatarMes(mes);
    }
    const html = gerarExtratoHTML(c, movs, titulo);
    const janela = window.open('', '_blank');
    if (!janela) { mostrarNotificacao('Permita pop-ups para gerar o extrato.', true); return; }
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
  }

  /* ==========================================================
     EVENTOS
  ========================================================== */

  if (elementos.formCadastro) elementos.formCadastro.addEventListener('submit', salvarCliente);
  if (elementos.busca) elementos.busca.addEventListener('input', renderizarClientes);

  if (elementos.lista) {
    elementos.lista.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      if (btn.dataset.acao === 'detalhes') abrirDetalhes(btn.dataset.id);
    });
  }

  if (elementos.historico) {
    elementos.historico.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      if (btn.dataset.acao === 'excluir-movimento') excluirMovimentacao(btn.dataset.id, btn.dataset.movimentoId);
    });
  }

  if (elementos.btnComprar) elementos.btnComprar.addEventListener('click', abrirCompra);
  if (elementos.btnPagamento) elementos.btnPagamento.addEventListener('click', abrirPagamento);
  if (elementos.formPagamento) elementos.formPagamento.addEventListener('submit', registrarPagamentoManual);
  if (elementos.btnPDF) elementos.btnPDF.addEventListener('click', exportarPDF);
  if (elementos.btnExcluirCliente) {
    elementos.btnExcluirCliente.addEventListener('click', () => {
      if (clienteSelecionadoId) excluirCliente(clienteSelecionadoId);
    });
  }

  if (elementos.btnFecharDetalhes) elementos.btnFecharDetalhes.addEventListener('click', fecharDetalhes);
  if (elementos.btnFecharDetalhes2) elementos.btnFecharDetalhes2.addEventListener('click', fecharDetalhes);
  if (elementos.btnFecharPagamento) elementos.btnFecharPagamento.addEventListener('click', fecharPagamento);
  if (elementos.btnCancelarPagamento) elementos.btnCancelarPagamento.addEventListener('click', fecharPagamento);

  if (elementos.mesReferencia) {
    elementos.mesReferencia.addEventListener('change', () => {
      const c = buscarClienteInterno(clienteSelecionadoId);
      if (c) renderizarResumoMensal(c);
    });
  }

  /* ==========================================================
     INICIALIZAÇÃO + MIGRAÇÃO AUTOMÁTICA
  ========================================================== */

  function renderizarTudoInicial() {
    renderizarTudo();
    const c = buscarClienteInterno(clienteSelecionadoId);
    if (c) renderizarDetalhes(c);
  }

  async function inicializar() {
    if (elementos.mesReferencia && !elementos.mesReferencia.value) elementos.mesReferencia.value = mesAtual();

    renderizarTudoInicial();

    const ok = await carregarTudo();

    if (ok) {
      try {
        const resultado = await migrarDadosLocais();
        if (resultado.erro) {
          console.warn('[Fiado/migração]', resultado.erro);
        } else if (resultado.migrados > 0) {
          console.log(`[Fiado/migração] ${resultado.migrados} registros migrados, ${resultado.pulados} já existiam.`);
          await carregarTudo();
        }
      } catch (err) {
        console.error('[Fiado/migração]', err);
      }
      renderizarTudoInicial();
    } else {
      console.warn('[Fiado] Modo offline — exibindo cache local.');
      mostrarNotificacao('Não foi possível conectar ao Supabase. Os dados exibidos podem estar desatualizados.', true);
    }

    console.log('Dr. Troco — módulo Fiado (Supabase) inicializado.');
  }

  /* ==========================================================
     API PÚBLICA
  ========================================================== */

  window.DrTrocoFiado = {
    registrarVendaFiado,
    registrarPagamento: registrarPagamentoAPI,
    buscarCliente: buscarClienteAPI,
    listarClientes,
    listarClientesComSaldo,
    saldoDevedor: saldoDevedorAPI,
    atualizar: async () => { await carregarTudo(); renderizarTudoInicial(); },
    abrirDetalhes,
    abrirCadastro: () => abrirCadastroCliente(),
    paraCentavos,
    formatarDinheiro,
    migrarDadosLocais,
    recarregarDoSupabase: carregarTudo,
    estaPronto: () => pronto
  };

  /* ==========================================================
     START
  ========================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar, { once: true });
  } else {
    inicializar();
  }
})();
