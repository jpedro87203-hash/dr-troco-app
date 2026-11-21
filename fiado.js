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
  const CHAVE_FORMAS = 'drTroco_fiadoFormasPagamento';

  const FORMAS_PADRAO = [
    { codigo: 'dinheiro', nome: 'Dinheiro' },
    { codigo: 'pix', nome: 'Pix' },
    { codigo: 'debito', nome: 'Cartão de débito' },
    { codigo: 'credito', nome: 'Cartão de crédito' },
    { codigo: 'transferencia', nome: 'Transferência' }
  ];

  const $ = id => document.getElementById(id);

  const elementos = {
    totalClientes: $('fiadoTotalClientes'),
    totalRecebido: $('fiadoTotalRecebido'),
    totalAberto:   $('fiadoTotalAberto'),
    totalVencido:  $('fiadoTotalVencido'),
    clientesInadimplentes: $('fiadoClientesInadimplentes'),

    busca:    $('fiadoBuscaCliente'),
    contagem: $('fiadoContagemClientes'),
    lista:    $('fiadoListaClientes'),
    filtrosSituacao: $('fiadoFiltrosSituacao'),

    modalCadastro:       $('modalCadastroFiado'),
    formCadastro:        $('formCadastroCliente'),
    nome:                $('fiadoNomeCliente'),
    telefone:            $('fiadoTelefoneCliente'),
    endereco:            $('fiadoEnderecoCliente'),
    limiteCredito:       $('fiadoLimiteCliente'),
    situacao:            $('fiadoSituacaoCliente'),
    observacoes:         $('fiadoObservacoesCliente'),
    btnFecharCadastro:   $('btnFecharCadastroFiado'),
    btnCancelarCadastro: $('btnCancelarCadastroFiado'),

    modalDetalhes:       $('modalDetalhesFiado'),
    detalhesNome:        $('fiadoDetalhesNome'),
    detalhesTelefone:    $('fiadoDetalhesTelefone'),
    detalhesSaldo:       $('fiadoDetalhesSaldo'),
    detalhesCompras:     $('fiadoDetalhesCompras'),
    detalhesPago:        $('fiadoDetalhesPago'),
    detalhesLimite:      $('fiadoDetalhesLimite'),
    detalhesDisponivel:  $('fiadoDetalhesDisponivel'),
    detalhesPendentesQtd: $('fiadoDetalhesPendentesQtd'),

    mesReferencia:  $('fiadoMesReferencia'),
    resumoMensal:   $('fiadoResumoMensal'),
    periodoExtrato: $('fiadoPeriodoExtrato'),
    parcelasLista:  $('fiadoParcelasCliente'),
    historico:      $('fiadoHistoricoCliente'),

    btnComprar:        $('btnAdicionarDividaFiado'),
    btnPagamento:      $('btnRegistrarPagamentoFiado'),
    btnEditarCliente:  $('btnEditarClienteFiado'),
    btnWhatsApp:       $('btnCobrarWhatsAppFiado'),
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

    modalCobrancas:       $('modalCobrancasFiado'),
    btnFecharCobrancas:   $('btnFecharCobrancasFiado'),
    listaCobrancas:       $('fiadoListaCobrancas'),

    modalRelatorios:      $('modalRelatoriosFiado'),
    btnFecharRelatorios:  $('btnFecharRelatoriosFiado'),
    formRelatorio:        $('formFiltroRelatorioFiado'),
    relatorioCliente:     $('fiadoRelatorioCliente'),
    relatorioInicio:      $('fiadoRelatorioDataInicio'),
    relatorioFim:         $('fiadoRelatorioDataFim'),
    btnImprimirRelatorio: $('btnImprimirRelatorioFiado'),
    conteudoRelatorio:    $('fiadoConteudoRelatorio'),

    notificacao: $('fiadoNotificacao')
  };

  let clientes = [];
  let clienteSelecionadoId = null;
  let filtroSituacaoAtual = 'todos';
  let usuarioAtual = null;
  let carregando = false;
  let pronto = false;
  let erroCarregamento = null;
  let temporizadorNotificacao = null;
  let operacoesEmAndamento = new Set();

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

  function obterNomeOperador() {
    try {
      const sessao = JSON.parse(localStorage.getItem('drTroco_sessao') || localStorage.getItem('drTroco_usuario') || '{}');
      if (sessao && (sessao.nome || sessao.operador || sessao.email)) {
        return String(sessao.nome || sessao.operador || sessao.email).trim();
      }
    } catch (_) {}
    if (usuarioAtual?.user_metadata?.nome) return String(usuarioAtual.user_metadata.nome).trim();
    if (usuarioAtual?.email) return String(usuarioAtual.email).trim();
    return 'Operador';
  }

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

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

  function adicionarMesesISO(dataISO, meses) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dataISO)) ? String(dataISO) : dataLocalISO();
    const [ano, mes, dia] = base.split('-').map(Number);
    const alvo = new Date(ano, (mes - 1) + Number(meses || 0), 1);
    const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    const diaAjustado = Math.min(dia || 1, ultimoDia);
    return dataLocalISO(new Date(alvo.getFullYear(), alvo.getMonth(), diaAjustado));
  }

  function calcularDiasAtraso(vencimentoISO, referenciaISO = dataLocalISO()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vencimentoISO))) return 0;
    const [a1, m1, d1] = String(vencimentoISO).split('-').map(Number);
    const [a2, m2, d2] = String(referenciaISO).split('-').map(Number);
    const utc1 = Date.UTC(a1, m1 - 1, d1);
    const utc2 = Date.UTC(a2, m2 - 1, d2);
    const diff = Math.floor((utc2 - utc1) / 86400000);
    return diff > 0 ? diff : 0;
  }

  function formatarDinheiro(centavos) {
    return ((Number(centavos) || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
    const valor = mov?.data || mov?.dataHora;
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
    temporizadorNotificacao = setTimeout(() => el.classList.remove('visivel'), 4000);
  }

  function confirmar(msg) { return window.confirm(msg); }

  function salvarCacheLocal() {
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(clientes));
    } catch (_) {}
  }

  function obterFormasPagamento() {
    const mapa = new Map(FORMAS_PADRAO.map(f => [f.codigo, f.nome]));
    try {
      const extras = JSON.parse(localStorage.getItem(CHAVE_FORMAS) || '[]');
      if (Array.isArray(extras)) {
        extras.forEach(item => {
          if (typeof item === 'string' && item.trim()) {
            const cod = normalizarTexto(item).replace(/[^a-z0-9_]+/g, '_');
            if (cod) mapa.set(cod, item.trim());
          } else if (item && typeof item === 'object' && item.codigo && item.nome) {
            mapa.set(String(item.codigo).trim(), String(item.nome).trim());
          }
        });
      }
    } catch (_) {}
    return Array.from(mapa.entries()).map(([codigo, nome]) => ({ codigo, nome }));
  }

  function nomeFormaPagamento(codigo) {
    const achada = obterFormasPagamento().find(f => f.codigo === codigo);
    return achada ? achada.nome : (codigo || 'Dinheiro');
  }

  function sincronizarSelectFormas() {
    const sel = elementos.formaPagamento;
    if (!sel) return;
    const atual = sel.value || 'dinheiro';
    const formas = obterFormasPagamento();
    sel.innerHTML = formas.map(f => `<option value="${escaparHTML(f.codigo)}">${escaparHTML(f.nome)}</option>`).join('');
    sel.value = formas.some(f => f.codigo === atual) ? atual : 'dinheiro';
  }

  async function executarComTrava(chave, fn) {
    if (operacoesEmAndamento.has(chave)) {
      throw new Error('Operação já em andamento. Aguarde a conclusão.');
    }
    operacoesEmAndamento.add(chave);
    try {
      return await fn();
    } finally {
      operacoesEmAndamento.delete(chave);
    }
  }

  /* ==========================================================
     REGISTRO INTERNO DE COBRANÇAS E METADADOS
  ========================================================== */

  function registrarCobrancaLocal(cliente, dados = {}) {
    if (!cliente) return null;
    if (!Array.isArray(cliente.cobrancas)) cliente.cobrancas = [];
    const registro = {
      id: gerarId(),
      dataHora: agoraISO(),
      operador: obterNomeOperador(),
      canal: dados.canal || 'whatsapp',
      valorCentavos: Number(dados.valorCentavos) || 0,
      diasAtraso: Number(dados.diasAtraso) || 0,
      vencimento: dados.vencimento || null,
      mensagem: String(dados.mensagem || ''),
      status: dados.status || 'gerada'
    };
    cliente.cobrancas.unshift(registro);
    return registro;
  }

  function extrairMetadadosObservacao(obsTexto) {
    if (!obsTexto || typeof obsTexto !== 'string') return {};
    const marcador = '__DRTROCO_META__:';
    const idx = obsTexto.indexOf(marcador);
    if (idx === -1) return { textoLimpo: obsTexto };
    const textoLimpo = obsTexto.slice(0, idx).trim();
    try {
      const meta = JSON.parse(obsTexto.slice(idx + marcador.length));
      return { textoLimpo, ...meta };
    } catch (_) {
      return { textoLimpo: obsTexto };
    }
  }

  function embutirMetadadosObservacao(textoLimpo, meta = {}) {
    const base = String(textoLimpo || '').trim();
    const temMeta = Object.keys(meta).length > 0;
    if (!temMeta) return base || null;
    return `${base}${base ? ' ' : ''}__DRTROCO_META__:${JSON.stringify(meta)}`;
  }

  /* ==========================================================
     MAPEAMENTO BANCO <-> APP
  ========================================================== */

  function clienteDoBanco(row) {
    const limiteC = Number.isFinite(Number(row.limite_credito_centavos))
      ? Number(row.limite_credito_centavos)
      : (Number.isFinite(Number(row.limite_credito)) ? Math.round(Number(row.limite_credito) * 100) : 0);

    return {
      id: String(row.id),
      nome: row.nome,
      telefone: row.telefone || '',
      endereco: row.endereco || '',
      limiteCreditoCentavos: limiteC,
      situacao: row.situacao === 'bloqueado' ? 'bloqueado' : 'ativo',
      arquivado: Boolean(row.arquivado),
      observacoes: row.observacoes || '',
      criadoEm: row.criado_em || agoraISO(),
      atualizadoEm: row.atualizado_em || row.criado_em || agoraISO(),
      movimentacoes: [],
      cobrancas: Array.isArray(row.cobrancas) ? row.cobrancas : []
    };
  }

  function movDoBanco(row) {
    const tipo = row.tipo === 'pagamento' ? 'pagamento' : 'divida';
    let valorC = Number(row.valor_centavos);
    if (!Number.isFinite(valorC) || valorC === 0) {
      const v = Number(row.valor);
      valorC = Number.isFinite(v) ? Math.round(v * 100) : 0;
    }

    const extraObs = extrairMetadadosObservacao(row.observacao || '');
    const statusMovimento = row.status_movimento || extraObs.statusMovimento || 'ativo';
    const parcelas = Array.isArray(row.parcelas)
      ? row.parcelas
      : (Array.isArray(extraObs.parcelas) ? extraObs.parcelas : []);
    const itens = Array.isArray(row.itens)
      ? row.itens
      : (Array.isArray(extraObs.itens) ? extraObs.itens : []);

    return {
      id: String(row.id),
      tipo,
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: row.descricao || '',
      data: row.data || (row.data_hora ? String(row.data_hora).slice(0, 10) : dataLocalISO()),
      dataHora: row.data_hora || agoraISO(),
      forma: row.forma || (tipo === 'pagamento' ? 'dinheiro' : ''),
      observacao: extraObs.textoLimpo || '',
      origem: row.origem || '',
      vendaId: row.venda_id || null,
      operador: row.operador || extraObs.operador || 'Operador',
      statusMovimento,
      canceladoEm: row.cancelado_em || extraObs.canceladoEm || null,
      canceladoPor: row.cancelado_por || extraObs.canceladoPor || null,
      motivoCancelamento: row.motivo_cancelamento || extraObs.motivoCancelamento || '',
      parcelas,
      itens
    };
  }

  function clienteParaBanco(c) {
    const payload = {
      id: String(c.id),
      usuario_id: usuarioAtual.id,
      nome: String(c.nome || '').trim(),
      telefone: c.telefone ? String(c.telefone).trim() : null,
      criado_em: c.criadoEm || agoraISO(),
      atualizado_em: agoraISO()
    };
    if (c.endereco !== undefined) payload.endereco = c.endereco ? String(c.endereco).trim() : null;
    if (c.limiteCreditoCentavos !== undefined) payload.limite_credito_centavos = Number(c.limiteCreditoCentavos) || 0;
    if (c.situacao !== undefined) payload.situacao = c.situacao === 'bloqueado' ? 'bloqueado' : 'ativo';
    if (c.arquivado !== undefined) payload.arquivado = Boolean(c.arquivado);
    if (c.observacoes !== undefined) payload.observacoes = c.observacoes ? String(c.observacoes).trim() : null;
    return payload;
  }

  function movParaBanco(m, clienteId) {
    const tipo = m.tipo === 'pagamento' ? 'pagamento' : 'divida';
    const valorC = Number(m.valorCentavos) || 0;
    const meta = {};
    if (m.operador) meta.operador = m.operador;
    if (m.statusMovimento && m.statusMovimento !== 'ativo') meta.statusMovimento = m.statusMovimento;
    if (m.canceladoEm) meta.canceladoEm = m.canceladoEm;
    if (m.canceladoPor) meta.canceladoPor = m.canceladoPor;
    if (m.motivoCancelamento) meta.motivoCancelamento = m.motivoCancelamento;
    if (Array.isArray(m.parcelas) && m.parcelas.length) meta.parcelas = m.parcelas;
    if (Array.isArray(m.itens) && m.itens.length) meta.itens = m.itens;

    const payload = {
      id: String(m.id),
      usuario_id: usuarioAtual.id,
      cliente_id: String(clienteId),
      tipo,
      valor_centavos: valorC,
      valor: valorC / 100,
      descricao: m.descricao || (tipo === 'divida' ? 'Compra fiado' : 'Pagamento'),
      data: m.data || dataLocalISO(),
      data_hora: m.dataHora || agoraISO(),
      forma: m.forma || (tipo === 'pagamento' ? 'dinheiro' : null),
      observacao: embutirMetadadosObservacao(m.observacao, meta),
      origem: m.origem || null,
      venda_id: m.vendaId || null
    };
    if (m.operador) payload.operador = m.operador;
    if (m.statusMovimento) payload.status_movimento = m.statusMovimento;
    if (m.canceladoEm) payload.cancelado_em = m.canceladoEm;
    if (m.canceladoPor) payload.cancelado_por = m.canceladoPor;
    if (m.motivoCancelamento) payload.motivo_cancelamento = m.motivoCancelamento;
    return payload;
  }

  function detectarErroColunaInexistente(err) {
    const msg = String(err?.message || '').toLowerCase();
    return msg.includes('column') || msg.includes('does not exist') || err?.code === '42703';
  }

  async function persistirClienteSeguro(c, modo = 'insert') {
    await getUsuario();
    const supa = getSupa();
    const completo = clienteParaBanco(c);
    const basico = {
      id: completo.id,
      usuario_id: completo.usuario_id,
      nome: completo.nome,
      telefone: completo.telefone,
      criado_em: completo.criado_em,
      atualizado_em: completo.atualizado_em
    };

    const rodar = async payload => {
      if (modo === 'update') {
        const { id, usuario_id, criado_em, ...camposUpdate } = payload;
        return supa.from(TAB_CLIENTES)
          .update(camposUpdate)
          .eq('id', String(c.id))
          .eq('usuario_id', usuarioAtual.id)
          .select()
          .single();
      }
      return supa.from(TAB_CLIENTES).insert(payload).select().single();
    };

    let resp = await rodar(completo);
    if (resp.error && detectarErroColunaInexistente(resp.error)) {
      resp = await rodar(basico);
    }
    if (resp.error) throw resp.error;
    return clienteDoBanco({ ...resp.data, cobrancas: c.cobrancas });
  }

  async function persistirMovimentacaoSegura(clienteId, mov, modo = 'insert') {
    await getUsuario();
    const supa = getSupa();
    const completo = movParaBanco(mov, clienteId);
    const basico = {
      id: completo.id,
      usuario_id: completo.usuario_id,
      cliente_id: completo.cliente_id,
      tipo: completo.tipo,
      valor_centavos: completo.valor_centavos,
      valor: completo.valor,
      descricao: completo.descricao,
      data: completo.data,
      data_hora: completo.data_hora,
      forma: completo.forma,
      observacao: completo.observacao,
      origem: completo.origem,
      venda_id: completo.venda_id
    };

    const rodar = async payload => {
      if (modo === 'update') {
        const { id, usuario_id, cliente_id, ...camposUpdate } = payload;
        return supa.from(TAB_MOVS)
          .update(camposUpdate)
          .eq('id', String(mov.id))
          .eq('usuario_id', usuarioAtual.id)
          .select()
          .single();
      }
      return supa.from(TAB_MOVS).insert(payload).select().single();
    };

    let resp = await rodar(completo);
    if (resp.error && detectarErroColunaInexistente(resp.error)) {
      resp = await rodar(basico);
    }
    if (resp.error) throw resp.error;
    return movDoBanco(resp.data);
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
      salvarCacheLocal();
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
        } catch (_) {}
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
    item.endereco = String(item.endereco || '').trim();
    item.limiteCreditoCentavos = Number.isInteger(item.limiteCreditoCentavos)
      ? item.limiteCreditoCentavos
      : paraCentavos(item.limiteCredito ?? item.limite_credito ?? 0);
    item.situacao = item.situacao === 'bloqueado' ? 'bloqueado' : 'ativo';
    item.arquivado = Boolean(item.arquivado);
    item.observacoes = String(item.observacoes || '').trim();
    item.criadoEm = item.criadoEm || item.dataCadastro || agoraISO();
    item.atualizadoEm = item.atualizadoEm || item.criadoEm;
    item.cobrancas = Array.isArray(item.cobrancas) ? item.cobrancas : [];

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
      mm.operador = mm.operador || 'Operador';
      mm.statusMovimento = mm.statusMovimento || 'ativo';
      mm.parcelas = Array.isArray(mm.parcelas) ? mm.parcelas : [];
      mm.itens = Array.isArray(mm.itens) ? mm.itens : [];
      if (mm.tipo === 'pagamento') mm.forma = mm.forma || 'dinheiro';
      return mm;
    });
    return item;
  }

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
    } catch (_) {
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
      const normalizado = normalizarClienteLocal(local);
      if (!normalizado.nome) continue;

      const idOriginal = normalizado.id;
      const podePreservarId = idPreservavel(idOriginal);
      const jaExiste = podePreservarId && idsClientes.has(idOriginal);

      let idCliente;
      if (jaExiste) {
        idCliente = idOriginal;
        pulados++;
      } else {
        idCliente = podePreservarId ? idOriginal : gerarId();
        try {
          await persistirClienteSeguro({ ...normalizado, id: idCliente }, 'insert');
          idsClientes.add(idCliente);
          migrados++;
        } catch (insErr) {
          console.error('[Fiado/migração] Falha ao inserir cliente', normalizado.nome, insErr);
          continue;
        }
      }

      for (const movLocal of normalizado.movimentacoes) {
        const valorC = valorMovimentoCentavos(movLocal);
        if (valorC <= 0) continue;

        const idMovOrig = movLocal.id ? String(movLocal.id) : null;
        const preservarMov = idPreservavel(idMovOrig);
        if (preservarMov && idsMovs.has(idMovOrig)) {
          pulados++;
          continue;
        }

        const idMov = preservarMov ? idMovOrig : gerarId();
        try {
          await persistirMovimentacaoSegura(idCliente, { ...movLocal, id: idMov }, 'insert');
          idsMovs.add(idMov);
          migrados++;
        } catch (movErr) {
          console.error('[Fiado/migração] Falha ao inserir movimentação', movErr);
          continue;
        }
      }
    }

    return { migrados, pulados, erro: null };
  }

  /* ==========================================================
     OPERAÇÕES DE CLIENTE E MOVIMENTAÇÃO
  ========================================================== */

  async function inserirCliente(dados) {
    const novo = normalizarClienteLocal({
      id: gerarId(),
      nome: String(dados.nome || '').trim(),
      telefone: String(dados.telefone || '').trim(),
      endereco: String(dados.endereco || '').trim(),
      limiteCreditoCentavos: paraCentavos(dados.limiteCreditoCentavos ?? dados.limiteCredito ?? 0),
      situacao: dados.situacao === 'bloqueado' ? 'bloqueado' : 'ativo',
      arquivado: false,
      observacoes: String(dados.observacoes || '').trim(),
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
      movimentacoes: []
    });
    try {
      return await persistirClienteSeguro(novo, 'insert');
    } catch (error) {
      throw new Error('Falha ao cadastrar cliente: ' + error.message);
    }
  }

  async function atualizarCliente(id, dados) {
    const atual = buscarClienteInterno(id);
    const mesclado = normalizarClienteLocal({
      ...(atual || {}),
      id: String(id),
      nome: dados.nome !== undefined ? String(dados.nome).trim() : (atual?.nome || ''),
      telefone: dados.telefone !== undefined ? String(dados.telefone).trim() : (atual?.telefone || ''),
      endereco: dados.endereco !== undefined ? String(dados.endereco).trim() : (atual?.endereco || ''),
      limiteCreditoCentavos: dados.limiteCreditoCentavos !== undefined
        ? paraCentavos(dados.limiteCreditoCentavos)
        : (dados.limiteCredito !== undefined ? paraCentavos(dados.limiteCredito) : (atual?.limiteCreditoCentavos || 0)),
      situacao: dados.situacao !== undefined ? (dados.situacao === 'bloqueado' ? 'bloqueado' : 'ativo') : (atual?.situacao || 'ativo'),
      arquivado: dados.arquivado !== undefined ? Boolean(dados.arquivado) : Boolean(atual?.arquivado),
      observacoes: dados.observacoes !== undefined ? String(dados.observacoes).trim() : (atual?.observacoes || ''),
      atualizadoEm: agoraISO()
    });
    try {
      return await persistirClienteSeguro(mesclado, 'update');
    } catch (error) {
      throw new Error('Falha ao editar cliente: ' + error.message);
    }
  }

  async function removerCliente(id) {
    await getUsuario();
    const supa = getSupa();

    const { data: movs, error: e1 } = await supa.from(TAB_MOVS)
      .select('id').eq('cliente_id', String(id)).eq('usuario_id', usuarioAtual.id).limit(1);
    if (e1) throw new Error('Falha ao verificar movimentações: ' + e1.message);
    if (movs && movs.length > 0) throw new Error('Este cliente possui movimentações e não pode ser excluído.');

    const { error: e2 } = await supa.from(TAB_CLIENTES)
      .delete().eq('id', String(id)).eq('usuario_id', usuarioAtual.id);
    if (e2) throw new Error('Falha ao excluir cliente: ' + e2.message);
  }

  async function inserirMovimentacao(clienteId, mov) {
    try {
      return await persistirMovimentacaoSegura(clienteId, mov, 'insert');
    } catch (error) {
      throw new Error('Falha ao registrar movimentação: ' + error.message);
    }
  }

  async function atualizarMovimentacao(clienteId, mov) {
    try {
      return await persistirMovimentacaoSegura(clienteId, mov, 'update');
    } catch (error) {
      throw new Error('Falha ao atualizar movimentação: ' + error.message);
    }
  }

  async function removerMovimentacao(movId) {
    await getUsuario();
    const supa = getSupa();
    const { error } = await supa.from(TAB_MOVS)
      .delete().eq('id', String(movId)).eq('usuario_id', usuarioAtual.id);
    if (error) throw new Error('Falha ao excluir movimentação: ' + error.message);
  }

  /* ==========================================================
     ENTRADA E ESTORNO NO CAIXA AO REGISTRAR PAGAMENTO DE FIADO
  ========================================================== */

  function chaveMovCaixaFiado(movId) {
    return 'fiado-pg-' + String(movId);
  }

  function chaveEstornoCaixaFiado(movId) {
    return 'fiado-est-' + String(movId);
  }

  async function registrarEntradaCaixaFiado(mov, cliente) {
    if (!mov || mov.tipo !== 'pagamento') {
      return { ok: false, motivo: 'não é pagamento' };
    }
    if (!cliente) {
      return { ok: false, motivo: 'cliente ausente' };
    }
    if (mov.origem === 'pdv') {
      return { ok: true, pulado: true, motivo: 'origem=pdv' };
    }
    if (!window.DrTrocoDados || typeof window.DrTrocoDados.salvarMovimentacao !== 'function') {
      return { ok: false, motivo: 'DrTrocoDados indisponível' };
    }

    const idCaixa = chaveMovCaixaFiado(mov.id);

    try {
      const existentes = typeof window.DrTrocoDados.movimentacoes === 'function'
        ? await window.DrTrocoDados.movimentacoes()
        : [];
      if (Array.isArray(existentes) && existentes.some(m => String(m.id) === idCaixa)) {
        return { ok: true, pulado: true, motivo: 'já registrada' };
      }
    } catch (_) {}

    const valorC = Number(mov.valorCentavos) || 0;
    if (valorC <= 0) {
      return { ok: false, motivo: 'valor inválido' };
    }

    const dataISO = obterDataMovimento(mov) || dataLocalISO();
    const [ano, mes, dia] = dataISO.split('-');
    const dataBR = `${dia}/${mes}/${ano}`;
    const agora = new Date();
    const formaCodigo = mov.forma || 'dinheiro';

    const entrada = {
      id: idCaixa,
      tipo: 'entrada',
      valor: valorC / 100,
      descricao: `Pagamento de fiado — ${cliente.nome || 'Cliente'} (${nomeFormaPagamento(formaCodigo)})`,
      formaPagamento: formaCodigo,
      formaPagamentoNome: nomeFormaPagamento(formaCodigo),
      data: dataBR,
      dataChave: dataISO,
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      operador: mov.operador || obterNomeOperador(),
      origem: 'fiado',
      fiadoId: String(mov.id),
      vendaId: mov.vendaId || null
    };

    try {
      const r = await window.DrTrocoDados.salvarMovimentacao(entrada);
      if (!r || r.ok === false || r.sucesso === false) {
        return { ok: false, motivo: (r && (r.erro || r.error)) || 'falha ao salvar no caixa' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, motivo: err.message || 'erro ao acessar o caixa' };
    }
  }

  async function registrarEstornoCaixaFiado(mov, cliente, motivo = 'Cancelamento de pagamento no fiado') {
    if (!mov || mov.tipo !== 'pagamento') return { ok: true, pulado: true };
    if (!window.DrTrocoDados || typeof window.DrTrocoDados.salvarMovimentacao !== 'function') {
      return { ok: false, motivo: 'DrTrocoDados indisponível' };
    }

    const idEstorno = chaveEstornoCaixaFiado(mov.id);
    try {
      const existentes = typeof window.DrTrocoDados.movimentacoes === 'function'
        ? await window.DrTrocoDados.movimentacoes()
        : [];
      if (Array.isArray(existentes) && existentes.some(m => String(m.id) === idEstorno)) {
        return { ok: true, pulado: true, motivo: 'estorno já registrado' };
      }
    } catch (_) {}

    const valorC = valorMovimentoCentavos(mov);
    const dataISO = dataLocalISO();
    const [ano, mes, dia] = dataISO.split('-');
    const agora = new Date();
    const formaCodigo = mov.forma || 'dinheiro';

    const estorno = {
      id: idEstorno,
      tipo: formaCodigo === 'dinheiro' ? 'saida' : 'estorno',
      valor: valorC / 100,
      descricao: `Estorno pagamento fiado — ${cliente?.nome || 'Cliente'} (${motivo})`,
      formaPagamento: formaCodigo,
      formaPagamentoNome: nomeFormaPagamento(formaCodigo),
      data: `${dia}/${mes}/${ano}`,
      dataChave: dataISO,
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      operador: obterNomeOperador(),
      origem: 'fiado_estorno',
      fiadoId: String(mov.id)
    };

    try {
      const r = await window.DrTrocoDados.salvarMovimentacao(estorno);
      if (!r || r.ok === false || r.sucesso === false) {
        return { ok: false, motivo: (r && (r.erro || r.error)) || 'falha ao estornar no caixa' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, motivo: err.message || 'erro ao registrar estorno no caixa' };
    }
  }

  /* ==========================================================
     CÁLCULOS, LIMITE, PARCELAMENTO E COBRANÇA
  ========================================================== */

  function obterMovimentacoes(c) { return Array.isArray(c?.movimentacoes) ? c.movimentacoes : []; }

  function movimentacaoAtiva(m) {
    return (m?.statusMovimento || 'ativo') === 'ativo';
  }

  function valorMovimentoCentavos(m) {
    return Number.isInteger(m?.valorCentavos) ? m.valorCentavos : paraCentavos(m?.valor ?? 0);
  }

  function totalPorTipo(c, tipo) {
    return obterMovimentacoes(c).reduce((t, m) => (movimentacaoAtiva(m) && m.tipo === tipo) ? t + valorMovimentoCentavos(m) : t, 0);
  }

  const totalComprado = c => totalPorTipo(c, 'divida');
  const totalPago     = c => totalPorTipo(c, 'pagamento');
  const obterSaldo    = c => totalComprado(c) - totalPago(c);

  function obterLimiteCredito(c) {
    return Number.isFinite(Number(c?.limiteCreditoCentavos)) ? Number(c.limiteCreditoCentavos) : 0;
  }

  function obterCreditoDisponivel(c) {
    const limite = obterLimiteCredito(c);
    if (limite <= 0) return null;
    return Math.max(0, limite - obterSaldo(c));
  }

  function quantidadeComprasPendentes(c) {
    const saldo = obterSaldo(c);
    if (saldo <= 0) return 0;
    const comprasAtivas = obterMovimentacoes(c).filter(m => movimentacaoAtiva(m) && m.tipo === 'divida').length;
    return Math.max(1, comprasAtivas);
  }

  function obterUltimaDataPorTipo(c, tipo) {
    const lista = obterMovimentacoes(c)
      .filter(m => movimentacaoAtiva(m) && m.tipo === tipo)
      .sort((a, b) => new Date(b.dataHora || b.data || 0).getTime() - new Date(a.dataHora || a.data || 0).getTime());
    return lista[0] ? obterDataMovimento(lista[0]) : null;
  }

  function validarNovaCompra(cliente, valorCentavos, { ignorarBloqueio = false, ignorarLimite = false } = {}) {
    if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' };
    if (cliente.arquivado) return { ok: false, erro: 'Cliente arquivado. Não é possível registrar novas compras.' };
    if (!ignorarBloqueio && cliente.situacao === 'bloqueado') {
      return { ok: false, erro: `Cliente "${cliente.nome}" está bloqueado para novas compras.` };
    }
    const valorC = Number(valorCentavos) || 0;
    if (valorC <= 0) return { ok: false, erro: 'Informe um valor válido maior que zero.' };

    const limiteC = obterLimiteCredito(cliente);
    if (!ignorarLimite && limiteC > 0) {
      const novoSaldo = obterSaldo(cliente) + valorC;
      if (novoSaldo > limiteC) {
        const disponivel = Math.max(0, limiteC - obterSaldo(cliente));
        return {
          ok: false,
          erro: `Compra excede o limite de crédito de ${formatarDinheiro(limiteC)}. Disponível: ${formatarDinheiro(disponivel)}.`
        };
      }
    }
    return { ok: true };
  }

  function gerarParcelas(valorTotalCentavos, quantidadeParcelas, primeiroVencimentoISO, dataBaseISO = dataLocalISO()) {
    const qtd = Math.max(1, Math.min(60, parseInt(quantidadeParcelas, 10) || 1));
    const totalC = Number(valorTotalCentavos) || 0;
    const baseValor = Math.floor(totalC / qtd);
    const resto = totalC - (baseValor * qtd);
    const vencInicial = /^\d{4}-\d{2}-\d{2}$/.test(String(primeiroVencimentoISO))
      ? String(primeiroVencimentoISO)
      : adicionarMesesISO(dataBaseISO, 1);

    const parcelas = [];
    for (let i = 0; i < qtd; i++) {
      const numero = i + 1;
      const valorC = baseValor + (i === qtd - 1 ? resto : 0);
      parcelas.push({
        id: `${gerarId()}-p${numero}`,
        numero,
        totalParcelas: qtd,
        valorCentavos: valorC,
        valorPagoCentavos: 0,
        vencimento: adicionarMesesISO(vencInicial, i),
        status: 'pendente',
        pagamentos: [],
        historico: [{
          dataHora: agoraISO(),
          operador: obterNomeOperador(),
          acao: 'criada',
          detalhe: `Parcela ${numero}/${qtd} gerada (${formatarDinheiro(valorC)})`
        }]
      });
    }
    return parcelas;
  }

  function atualizarStatusParcela(parcela, hojeISO = dataLocalISO()) {
    const totalC = Number(parcela.valorCentavos) || 0;
    const pagoC = Number(parcela.valorPagoCentavos) || 0;
    const restanteC = Math.max(0, totalC - pagoC);
    const atrasoDias = restanteC > 0 ? calcularDiasAtraso(parcela.vencimento, hojeISO) : 0;

    let status = 'pendente';
    if (restanteC === 0 && totalC > 0) status = 'paga';
    else if (pagoC > 0 && atrasoDias > 0) status = 'vencida_parcial';
    else if (pagoC > 0) status = 'parcial';
    else if (atrasoDias > 0) status = 'vencida';

    return {
      ...parcela,
      valorRestanteCentavos: restanteC,
      diasAtraso: atrasoDias,
      status
    };
  }

  function listarParcelasCliente(cliente) {
    const lista = [];
    obterMovimentacoes(cliente).forEach(m => {
      if (!movimentacaoAtiva(m) || m.tipo !== 'divida' || !Array.isArray(m.parcelas)) return;
      m.parcelas.forEach(p => {
        const calc = atualizarStatusParcela(p);
        lista.push({
          ...calc,
          clienteId: cliente.id,
          clienteNome: cliente.nome,
          telefone: cliente.telefone,
          movimentacaoId: m.id,
          descricaoCompra: m.descricao || 'Compra fiado'
        });
      });
    });
    return lista.sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')));
  }

  async function registrarPagamentoParcela(clienteId, movimentacaoId, parcelaId, valorPagamento, forma = 'dinheiro', observacao = '') {
    return executarComTrava(`pg-parcela-${clienteId}-${parcelaId}`, async () => {
      const cliente = buscarClienteInterno(clienteId);
      if (!cliente) throw new Error('Cliente não encontrado.');
      const compra = obterMovimentacoes(cliente).find(m => String(m.id) === String(movimentacaoId) && movimentacaoAtiva(m));
      if (!compra) throw new Error('Compra parcelada não encontrada.');
      const idxP = (compra.parcelas || []).findIndex(p => String(p.id) === String(parcelaId));
      if (idxP < 0) throw new Error('Parcela não encontrada.');

      const parcela = atualizarStatusParcela(compra.parcelas[idxP]);
      const valorC = paraCentavos(valorPagamento);
      const saldoGeral = obterSaldo(cliente);

      if (valorC <= 0) throw new Error('Informe um valor válido.');
      if (valorC > saldoGeral) throw new Error(`Pagamento excede o saldo devedor total (${formatarDinheiro(saldoGeral)}).`);
      if (valorC > parcela.valorRestanteCentavos) {
        throw new Error(`Valor maior que o restante da parcela (${formatarDinheiro(parcela.valorRestanteCentavos)}).`);
      }

      const operador = obterNomeOperador();
      const movPag = {
        id: gerarId(),
        tipo: 'pagamento',
        valorCentavos: valorC,
        valor: valorC / 100,
        forma,
        observacao: String(observacao || '').trim(),
        descricao: `Pagamento parcela ${parcela.numero}/${parcela.totalParcelas} — ${compra.descricao || 'Compra fiado'}`,
        data: dataLocalISO(),
        dataHora: agoraISO(),
        origem: 'manual',
        operador,
        statusMovimento: 'ativo'
      };

      const salvoPag = await inserirMovimentacao(cliente.id, movPag);
      cliente.movimentacoes.push(salvoPag);

      const novoPago = (Number(parcela.valorPagoCentavos) || 0) + valorC;
      const atualizada = atualizarStatusParcela({
        ...parcela,
        valorPagoCentavos: novoPago,
        pagamentos: [...(parcela.pagamentos || []), {
          pagamentoId: salvoPag.id,
          valorCentavos: valorC,
          forma,
          dataHora: agoraISO(),
          operador
        }],
        historico: [...(parcela.historico || []), {
          dataHora: agoraISO(),
          operador,
          acao: novoPago >= parcela.valorCentavos ? 'quitada' : 'pagamento_parcial',
          detalhe: `Pago ${formatarDinheiro(valorC)} (${nomeFormaPagamento(forma)})`
        }]
      });
      compra.parcelas[idxP] = atualizada;
      await atualizarMovimentacao(cliente.id, compra);

      const rCaixa = await registrarEntradaCaixaFiado(salvoPag, cliente);
      cliente.atualizadoEm = agoraISO();
      salvarCacheLocal();
      renderizarTudo();

      return {
        sucesso: true,
        pagamento: clonar(salvoPag),
        parcela: clonar(atualizada),
        caixa: rCaixa,
        saldoDevedor: obterSaldo(cliente) / 100
      };
    });
  }

  async function alterarVencimentoParcela(clienteId, movimentacaoId, parcelaId, novoVencimentoISO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(novoVencimentoISO))) {
      throw new Error('Data de vencimento inválida.');
    }
    const cliente = buscarClienteInterno(clienteId);
    if (!cliente) throw new Error('Cliente não encontrado.');
    const compra = obterMovimentacoes(cliente).find(m => String(m.id) === String(movimentacaoId) && movimentacaoAtiva(m));
    if (!compra) throw new Error('Compra não encontrada.');
    const idxP = (compra.parcelas || []).findIndex(p => String(p.id) === String(parcelaId));
    if (idxP < 0) throw new Error('Parcela não encontrada.');

    const parcela = compra.parcelas[idxP];
    const operador = obterNomeOperador();
    const anterior = parcela.vencimento;
    compra.parcelas[idxP] = atualizarStatusParcela({
      ...parcela,
      vencimento: novoVencimentoISO,
      historico: [...(parcela.historico || []), {
        dataHora: agoraISO(),
        operador,
        acao: 'vencimento_alterado',
        detalhe: `Vencimento alterado de ${formatarData(anterior)} para ${formatarData(novoVencimentoISO)}`
      }]
    });

    await atualizarMovimentacao(cliente.id, compra);
    cliente.atualizadoEm = agoraISO();
    salvarCacheLocal();
    renderizarTudo();
    mostrarNotificacao('Vencimento da parcela atualizado.');
    return clonar(compra.parcelas[idxP]);
  }

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

  function fecharCadastro() {
    fecharModal(elementos.modalCadastro);
    if (elementos.formCadastro) {
      delete elementos.formCadastro.dataset.editarId;
      elementos.formCadastro.reset();
    }
  }

  function fecharDetalhes() {
    fecharModal(elementos.modalDetalhes);
    if (!document.querySelector('.fiado-modal.aberto')) clienteSelecionadoId = null;
  }

  function fecharPagamento() {
    fecharModal(elementos.modalPagamento);
    if (elementos.formPagamento) elementos.formPagamento.reset();
  }

  function fecharTodosModais() {
    document.querySelectorAll('.fiado-modal.aberto').forEach(fecharModal);
    clienteSelecionadoId = null;
  }

  document.querySelectorAll('.fiado-modal').forEach(modal => {
    modal.addEventListener('click', ev => {
      if (ev.target === modal) {
        fecharModal(modal);
        if (modal === elementos.modalDetalhes) clienteSelecionadoId = null;
      }
    });
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') fecharTodosModais(); });

  /* ==========================================================
     CADASTRO / EDIÇÃO DE CLIENTES (SEM CPF, ENDEREÇO OPCIONAL)
  ========================================================== */

  function garantirCamposExtrasCadastro() {
    const form = elementos.formCadastro;
    if (!form) return;
    if ($('fiadoEnderecoCliente')) {
      elementos.endereco = $('fiadoEnderecoCliente');
      elementos.limiteCredito = $('fiadoLimiteCliente');
      elementos.situacao = $('fiadoSituacaoCliente');
      elementos.observacoes = $('fiadoObservacoesCliente');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    const wrapper = document.createElement('div');
    wrapper.id = 'fiadoCamposExtrasCadastro';
    wrapper.style.display = 'grid';
    wrapper.style.gap = '12px';
    wrapper.innerHTML = `
      <div class="fiado-campo">
        <label for="fiadoEnderecoCliente">Endereço (opcional)</label>
        <input id="fiadoEnderecoCliente" name="endereco" type="text" maxlength="180" placeholder="Rua, número, bairro">
      </div>
      <div class="fiado-campo">
        <label for="fiadoLimiteCliente">Limite de crédito (R$ — opcional)</label>
        <input id="fiadoLimiteCliente" name="limiteCredito" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00 (sem limite se vazio)">
      </div>
      <div class="fiado-campo">
        <label for="fiadoSituacaoCliente">Situação do cliente</label>
        <select id="fiadoSituacaoCliente" name="situacao">
          <option value="ativo">Ativo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
      </div>
      <div class="fiado-campo">
        <label for="fiadoObservacoesCliente">Observações (opcional)</label>
        <textarea id="fiadoObservacoesCliente" name="observacoes" rows="2" maxlength="300" placeholder="Referências ou observações"></textarea>
      </div>
    `;
    if (submitBtn) form.insertBefore(wrapper, submitBtn);
    else form.appendChild(wrapper);

    elementos.endereco = $('fiadoEnderecoCliente');
    elementos.limiteCredito = $('fiadoLimiteCliente');
    elementos.situacao = $('fiadoSituacaoCliente');
    elementos.observacoes = $('fiadoObservacoesCliente');
  }

  function abrirCadastroCliente(cliente = null) {
    garantirCamposExtrasCadastro();
    if (!elementos.formCadastro) return;
    elementos.formCadastro.reset();
    const titulo = $('tituloCadastroFiado');
    const btnSalvar = elementos.formCadastro.querySelector('[type="submit"]');
    const campoEnd = elementos.endereco || $('fiadoEnderecoCliente');
    const campoLim = elementos.limiteCredito || $('fiadoLimiteCliente');
    const campoSit = elementos.situacao || $('fiadoSituacaoCliente');
    const campoObs = elementos.observacoes || $('fiadoObservacoesCliente');

    if (cliente) {
      elementos.nome.value = cliente.nome;
      elementos.telefone.value = cliente.telefone || '';
      if (campoEnd) campoEnd.value = cliente.endereco || '';
      if (campoLim) campoLim.value = cliente.limiteCreditoCentavos > 0 ? (cliente.limiteCreditoCentavos / 100).toFixed(2) : '';
      if (campoSit) campoSit.value = cliente.situacao || 'ativo';
      if (campoObs) campoObs.value = cliente.observacoes || '';
      if (titulo) titulo.textContent = 'Editar cliente';
      if (btnSalvar) btnSalvar.textContent = 'Salvar alterações';
      elementos.formCadastro.dataset.editarId = cliente.id;
    } else {
      if (campoSit) campoSit.value = 'ativo';
      if (titulo) titulo.textContent = 'Cadastrar cliente';
      if (btnSalvar) btnSalvar.textContent = '＋ Salvar cliente';
      delete elementos.formCadastro.dataset.editarId;
    }
    abrirModal(elementos.modalCadastro, elementos.nome);
  }

  async function salvarCliente(evento) {
    evento.preventDefault();
    garantirCamposExtrasCadastro();
    const nome = elementos.nome.value.trim();
    const telefone = elementos.telefone.value.trim();
    const endereco = (elementos.endereco || $('fiadoEnderecoCliente'))?.value.trim() || '';
    const limiteBruto = (elementos.limiteCredito || $('fiadoLimiteCliente'))?.value;
    const limiteCreditoCentavos = limiteBruto && String(limiteBruto).trim() !== '' ? paraCentavos(limiteBruto) : 0;
    const situacao = (elementos.situacao || $('fiadoSituacaoCliente'))?.value === 'bloqueado' ? 'bloqueado' : 'ativo';
    const observacoes = (elementos.observacoes || $('fiadoObservacoesCliente'))?.value.trim() || '';
    const idEdicao = elementos.formCadastro.dataset.editarId;

    if (!nome) { mostrarNotificacao('Digite o nome do cliente.', true); elementos.nome.focus(); return; }
    if (limiteCreditoCentavos < 0) { mostrarNotificacao('Limite de crédito não pode ser negativo.', true); return; }

    const nomeNorm = normalizarTexto(nome);
    const duplicado = clientes.find(c =>
      normalizarTexto(c.nome) === nomeNorm && String(c.id) !== String(idEdicao || '')
    );
    if (duplicado && !confirmar('Já existe um cliente com esse nome. Salvar mesmo assim?')) return;

    try {
      if (idEdicao) {
        const atualizado = await atualizarCliente(idEdicao, {
          nome,
          telefone,
          endereco,
          limiteCreditoCentavos,
          situacao,
          observacoes
        });
        const local = buscarClienteInterno(idEdicao);
        if (local) Object.assign(local, atualizado);
        salvarCacheLocal();
        fecharCadastro();
        mostrarNotificacao('Dados do cliente atualizados!');
        if (clienteSelecionadoId && String(clienteSelecionadoId) === String(idEdicao) && elementos.modalDetalhes?.classList.contains('aberto')) {
          abrirDetalhes(idEdicao);
        }
      } else {
        const novo = await inserirCliente({
          nome,
          telefone,
          endereco,
          limiteCreditoCentavos,
          situacao,
          observacoes
        });
        clientes.push(novo);
        clientes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        salvarCacheLocal();
        fecharCadastro();
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

    if (window.DrTrocoSeguranca && typeof window.DrTrocoSeguranca.verificarPIN === 'function') {
      try {
        await window.DrTrocoSeguranca.verificarPIN('Excluir Cliente do Fiado');
      } catch (_) {
        return;
      }
    }

    const saldo = obterSaldo(cliente);
    let msg = `Deseja excluir o cliente "${cliente.nome}"?`;
    if (saldo > 0) msg += `\n\nSaldo devedor atual: ${formatarDinheiro(saldo)}.`;
    if (!confirmar(msg)) return;

    try {
      await removerCliente(id);
      clientes = clientes.filter(c => String(c.id) !== String(id));
      salvarCacheLocal();
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
     COMPRAS (COM PARCELAMENTO) E PAGAMENTOS
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
          <div><h2>Registrar compra fiado</h2><p>Informe o valor, parcelamento e vencimento.</p></div>
          <button type="button" class="fiado-btn-fechar" data-fechar-compra aria-label="Fechar">×</button>
        </div>
        <form id="formNovaDividaFiado" class="fiado-form">
          <div class="fiado-campo">
            <label for="fiadoValorDivida">Valor da compra (R$) *</label>
            <input id="fiadoValorDivida" name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
          </div>
          <div class="fiado-campo">
            <label for="fiadoQtdParcelasDivida">Quantidade de parcelas</label>
            <select id="fiadoQtdParcelasDivida" name="parcelas">
              <option value="1">1x (à vista / parcela única)</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
              <option value="5">5x</option>
              <option value="6">6x</option>
              <option value="10">10x</option>
              <option value="12">12x</option>
            </select>
          </div>
          <div class="fiado-campo">
            <label for="fiadoVencimentoDivida">1º vencimento</label>
            <input id="fiadoVencimentoDivida" name="vencimento" type="date">
          </div>
          <div class="fiado-campo">
            <label for="fiadoDescricaoDivida">Descrição / produtos (opcional)</label>
            <textarea id="fiadoDescricaoDivida" name="descricao" maxlength="300" rows="2" placeholder="Ex.: 2x Refrigerante, 1x Pão"></textarea>
          </div>
          <div class="fiado-acoes-modal">
            <button type="submit" class="fiado-btn fiado-btn-principal">Salvar compra</button>
            <button type="button" class="fiado-btn fiado-btn-neutro" data-fechar-compra>Cancelar</button>
          </div>
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
    const campoParc = $('fiadoQtdParcelasDivida');
    const campoVenc = $('fiadoVencimentoDivida');
    const valorC = paraCentavos(campoValor.value);

    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Selecione um cliente.', true); fecharModal(modal); return; }

    const validacao = validarNovaCompra(cliente, valorC);
    if (!validacao.ok) {
      mostrarNotificacao(validacao.erro, true);
      campoValor.focus();
      return;
    }

    const qtdParcelas = parseInt(campoParc?.value || '1', 10) || 1;
    const primeiroVenc = campoVenc?.value || adicionarMesesISO(dataLocalISO(), 1);
    const parcelas = qtdParcelas > 1 || campoVenc?.value
      ? gerarParcelas(valorC, qtdParcelas, primeiroVenc, dataLocalISO())
      : [];

    const operador = obterNomeOperador();
    const mov = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: campoDesc.value.trim() || (qtdParcelas > 1 ? `Compra fiado (${qtdParcelas}x)` : 'Compra fiado'),
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'manual',
      operador,
      statusMovimento: 'ativo',
      parcelas
    };

    try {
      await executarComTrava(`compra-${cliente.id}-${valorC}`, async () => {
        const salvo = await inserirMovimentacao(cliente.id, mov);
        cliente.movimentacoes.push(salvo);
        cliente.atualizadoEm = agoraISO();
        salvarCacheLocal();
      });
      fecharModal(modal);
      mostrarNotificacao(`Compra registrada: ${formatarDinheiro(valorC)}${qtdParcelas > 1 ? ` em ${qtdParcelas}x` : ''}`);
      renderizarTudo();
      abrirDetalhes(cliente.id);
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao registrar compra.', true);
    }
  }

  function abrirCompra() {
    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Selecione um cliente.', true); return; }
    if (cliente.arquivado) {
      mostrarNotificacao('Cliente arquivado. Não é possível registrar compras.', true);
      return;
    }
    if (cliente.situacao === 'bloqueado') {
      mostrarNotificacao(`Cliente "${cliente.nome}" está bloqueado para novas compras.`, true);
      return;
    }
    const modal = criarModalCompra();
    const form = $('formNovaDividaFiado');
    if (form) form.reset();
    const venc = $('fiadoVencimentoDivida');
    if (venc) venc.value = adicionarMesesISO(dataLocalISO(), 1);
    abrirModal(modal, $('fiadoValorDivida'));
  }

  function abrirPagamento(valorSugeridoCentavos = null, descricaoSugerida = '') {
    sincronizarSelectFormas();
    const cliente = buscarClienteInterno(clienteSelecionadoId);
    if (!cliente) { mostrarNotificacao('Selecione um cliente.', true); return; }
    const saldo = obterSaldo(cliente);
    if (saldo <= 0) { mostrarNotificacao('Este cliente não possui saldo devedor.', true); return; }
    if (elementos.formPagamento) elementos.formPagamento.reset();
    sincronizarSelectFormas();
    if (elementos.valorPagamento && Number(valorSugeridoCentavos) > 0) {
      elementos.valorPagamento.value = (Math.min(Number(valorSugeridoCentavos), saldo) / 100).toFixed(2);
    }
    if (elementos.observacaoPagamento && descricaoSugerida) {
      elementos.observacaoPagamento.value = descricaoSugerida;
    }
    abrirModal(elementos.modalPagamento, elementos.valorPagamento);
  }

  async function registrarPagamentoManual(evento) {
    evento.preventDefault();
    sincronizarSelectFormas();
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
    const formasValidas = new Set(obterFormasPagamento().map(f => f.codigo));
    if (!formasValidas.has(forma)) {
      mostrarNotificacao('Forma de pagamento inválida.', true);
      return;
    }

    const operador = obterNomeOperador();
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
      origem: 'manual',
      operador,
      statusMovimento: 'ativo'
    };

    try {
      let salvo;
      let rCaixa = { ok: false, motivo: 'não executado' };

      await executarComTrava(`pag-${cliente.id}-${valorC}-${forma}`, async () => {
        salvo = await inserirMovimentacao(cliente.id, mov);
        cliente.movimentacoes.push(salvo);
        cliente.atualizadoEm = agoraISO();
        salvarCacheLocal();
        rCaixa = await registrarEntradaCaixaFiado(salvo, cliente);
      });

      fecharPagamento();
      renderizarTudo();
      abrirDetalhes(cliente.id);

      if (!rCaixa.ok && !rCaixa.pulado) {
        mostrarNotificacao(
          `Pagamento de ${formatarDinheiro(valorC)} salvo no Fiado, mas FALHOU no caixa (${rCaixa.motivo}). Confira o caixa!`,
          true
        );
      } else {
        mostrarNotificacao('Pagamento registrado: ' + formatarDinheiro(valorC));
      }

      const novoSaldo = obterSaldo(cliente);
      const dataFormatada = new Date().toLocaleDateString('pt-BR');
      let msgZap = `*Dr. Troco - Recibo de Pagamento*\n`;
      msgZap += `Data: ${dataFormatada}\n`;
      msgZap += `Cliente: ${cliente.nome}\n`;
      msgZap += `--------------------------------\n`;
      msgZap += `Valor Pago: *${formatarDinheiro(valorC)}*\n`;
      msgZap += `Forma: ${nomeFormaPagamento(forma)}\n`;
      msgZap += `*Saldo Devedor Restante: ${formatarDinheiro(novoSaldo)}*\n`;
      msgZap += `--------------------------------\nObrigado! 🙏`;

      if (confirmar('Pagamento registrado!\n\nDeseja enviar o recibo via WhatsApp?')) {
        let numFinal = '';
        if (cliente.telefone) {
          const num = String(cliente.telefone).replace(/\D/g, '');
          numFinal = num.length <= 11 ? '55' + num : num;
        }
        window.open(`https://wa.me/${numFinal}?text=${encodeURIComponent(msgZap)}`, '_blank', 'noopener');
      }
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao registrar pagamento.', true);
    }
  }

  /* ==========================================================
     API PÚBLICA (COMPATIBILIDADE GARANTIDA)
  ========================================================== */

  async function registrarVendaFiado(dados) {
    if (!dados || typeof dados !== 'object') return { sucesso: false, erro: 'Dados inválidos.' };
    const idCliente = dados.clienteId ?? dados.idCliente ?? dados.cliente_id;
    const cliente = buscarClienteInterno(idCliente);
    if (!cliente) return { sucesso: false, erro: 'Cliente não encontrado.' };

    if (dados.vendaId) {
      const existente = obterMovimentacoes(cliente).find(
        m => movimentacaoAtiva(m) && m.tipo === 'divida' && String(m.vendaId) === String(dados.vendaId)
      );
      if (existente) {
        return {
          sucesso: true,
          duplicada: true,
          clienteId: cliente.id,
          movimentoId: existente.id,
          saldoDevedor: obterSaldo(cliente) / 100
        };
      }
    }

    const valorC = paraCentavos(dados.valor ?? dados.total ?? dados.valorTotal);
    const validacao = validarNovaCompra(cliente, valorC, {
      ignorarBloqueio: Boolean(dados.ignorarBloqueio),
      ignorarLimite: Boolean(dados.ignorarLimite)
    });
    if (!validacao.ok) return { sucesso: false, erro: validacao.erro };

    const qtdParcelas = parseInt(dados.parcelas ?? dados.quantidadeParcelas ?? 1, 10) || 1;
    const dataMov = dados.data || dataLocalISO();
    const parcelas = qtdParcelas > 1
      ? gerarParcelas(valorC, qtdParcelas, dados.primeiroVencimento || adicionarMesesISO(dataMov, 1), dataMov)
      : [];

    const operador = dados.operador || obterNomeOperador();
    const mov = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos: valorC,
      valor: valorC / 100,
      descricao: String(dados.descricao || 'Venda fiado').trim(),
      data: dataMov,
      dataHora: agoraISO(),
      origem: dados.origem || 'pdv',
      vendaId: dados.vendaId || null,
      operador,
      statusMovimento: 'ativo',
      parcelas,
      itens: Array.isArray(dados.itens) ? dados.itens : []
    };

    try {
      const salvo = await executarComTrava(`pdv-venda-${dados.vendaId || cliente.id}-${valorC}`, async () => {
        const reg = await inserirMovimentacao(cliente.id, mov);
        cliente.movimentacoes.push(reg);
        cliente.atualizadoEm = agoraISO();
        salvarCacheLocal();
        return reg;
      });
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
    if (valorC > obterSaldo(cliente)) {
      return { sucesso: false, erro: 'Valor maior que o saldo devedor atual.' };
    }

    const formasValidas = new Set(obterFormasPagamento().map(f => f.codigo));
    if (!formasValidas.has(forma)) return { sucesso: false, erro: 'Forma de pagamento inválida.' };

    const operador = obterNomeOperador();
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
      vendaId,
      operador,
      statusMovimento: 'ativo'
    };

    try {
      const salvo = await executarComTrava(`api-pag-${cliente.id}-${valorC}`, async () => {
        const reg = await inserirMovimentacao(cliente.id, mov);
        cliente.movimentacoes.push(reg);
        cliente.atualizadoEm = agoraISO();
        salvarCacheLocal();
        return reg;
      });
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
    return clientes.map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      endereco: c.endereco,
      situacao: c.situacao,
      arquivado: c.arquivado,
      limiteCredito: obterLimiteCredito(c) / 100,
      creditoDisponivel: obterCreditoDisponivel(c) === null ? null : obterCreditoDisponivel(c) / 100,
      saldoDevedor: obterSaldo(c) / 100
    }));
  }

  async function saldoDevedorAPI(id) {
    const c = buscarClienteInterno(id);
    return c ? obterSaldo(c) / 100 : null;
  }

  async function excluirMovimentacao(clienteId, movId, motivo = 'Cancelado pelo operador') {
    const cliente = buscarClienteInterno(clienteId);
    if (!cliente) { mostrarNotificacao('Cliente não encontrado.', true); return; }

    const idx = cliente.movimentacoes.findIndex(m => String(m.id) === String(movId));
    if (idx < 0) { mostrarNotificacao('Movimentação não encontrada.', true); return; }

    const mov = cliente.movimentacoes[idx];
    const tipo = mov.tipo === 'pagamento' ? 'pagamento' : 'compra fiado';

    if (window.DrTrocoSeguranca && typeof window.DrTrocoSeguranca.verificarPIN === 'function') {
      try {
        await window.DrTrocoSeguranca.verificarPIN(`Cancelar ${tipo}`);
      } catch (_) {
        return;
      }
    }

    if (!confirmar(`Cancelar este lançamento de ${tipo}? O registro ficará preservado no histórico e o saldo será recalculado.`)) return;

    const operador = obterNomeOperador();
    try {
      await executarComTrava(`cancel-mov-${movId}`, async () => {
        if (mov.tipo === 'pagamento') {
          const rEst = await registrarEstornoCaixaFiado(mov, cliente, motivo);
          if (!rEst.ok && !rEst.pulado) {
            throw new Error(`Falha ao estornar no caixa (${rEst.motivo}). Cancelamento interrompido.`);
          }
        }

        const cancelada = {
          ...mov,
          statusMovimento: 'cancelado',
          canceladoEm: agoraISO(),
          canceladoPor: operador,
          motivoCancelamento: motivo
        };

        try {
          const salvo = await atualizarMovimentacao(cliente.id, cancelada);
          cliente.movimentacoes[idx] = { ...salvo, statusMovimento: 'cancelado', canceladoEm: cancelada.canceladoEm, canceladoPor: operador, motivoCancelamento: motivo };
        } catch (_) {
          await removerMovimentacao(movId);
          cliente.movimentacoes.splice(idx, 1);
        }

        cliente.atualizadoEm = agoraISO();
        salvarCacheLocal();
      });

      renderizarTudo();
      if (elementos.modalDetalhes?.classList.contains('aberto')) renderizarDetalhes(cliente);
      mostrarNotificacao('Lançamento cancelado e estornado.');
    } catch (err) {
      console.error('[Fiado]', err);
      mostrarNotificacao(err.message || 'Falha ao cancelar lançamento.', true);
    }
  }

  /* ==========================================================
     ESTORNO DE VENDA (CANCELAMENTO NO PDV)
  ========================================================== */

  async function estornarVendaFiado(vendaId, motivo = 'Venda cancelada no PDV') {
    if (!vendaId) return { sucesso: false, erro: 'ID da venda não informado.' };
    await getUsuario();
    const supa = getSupa();
    const operador = obterNomeOperador();

    let alterouLocal = false;
    clientes.forEach(c => {
      c.movimentacoes.forEach(m => {
        if (String(m.vendaId) === String(vendaId) && movimentacaoAtiva(m)) {
          m.statusMovimento = 'estornado';
          m.canceladoEm = agoraISO();
          m.canceladoPor = operador;
          m.motivoCancelamento = motivo;
          alterouLocal = true;
        }
      });
    });

    if (alterouLocal) {
      salvarCacheLocal();
      renderizarTudo();
    }

    try {
      const { error } = await supa.from(TAB_MOVS)
        .delete()
        .eq('venda_id', String(vendaId))
        .eq('usuario_id', usuarioAtual.id);
      if (error) throw error;
      return { sucesso: true };
    } catch (err) {
      console.error('[Fiado] Erro ao estornar venda:', err);
      return { sucesso: false, erro: err.message };
    }
  }

  /* ==========================================================
     COBRANÇAS E RELATÓRIOS
  ========================================================== */

  function clienteEhInadimplente(c, hojeISO = dataLocalISO()) {
    if (c.arquivado) return false;
    const saldo = obterSaldo(c);
    if (saldo <= 0) return false;
    const temParcelaVencida = listarParcelasCliente(c).some(p => p.valorRestanteCentavos > 0 && p.diasAtraso > 0);
    if (temParcelaVencida) return true;
    const ultimaCompra = obterUltimaDataPorTipo(c, 'divida');
    return ultimaCompra ? calcularDiasAtraso(ultimaCompra, hojeISO) >= 30 : false;
  }

  function listarCobrancasPendentes() {
    const hoje = dataLocalISO();
    const itens = [];

    clientes.filter(c => !c.arquivado).forEach(c => {
      const saldo = obterSaldo(c);
      const parcelas = listarParcelasCliente(c).filter(p => p.valorRestanteCentavos > 0);
      const vencidas = parcelas.filter(p => p.diasAtraso > 0);
      const proximas = parcelas.filter(p => p.diasAtraso === 0);
      const maiorAtraso = vencidas.reduce((max, p) => Math.max(max, p.diasAtraso), 0);
      const totalVencidoC = vencidas.reduce((s, p) => s + p.valorRestanteCentavos, 0);

      if (saldo > 0 || parcelas.length > 0) {
        const ultimaCompra = obterUltimaDataPorTipo(c, 'divida');
        const diasDesdeCompra = !vencidas.length && saldo > 0 && ultimaCompra ? calcularDiasAtraso(ultimaCompra, hoje) : 0;
        itens.push({
          clienteId: c.id,
          clienteNome: c.nome,
          telefone: c.telefone,
          saldoCentavos: saldo,
          totalVencidoCentavos: totalVencidoC || (diasDesdeCompra > 0 ? saldo : 0),
          diasAtraso: maiorAtraso || diasDesdeCompra,
          parcelasVencidas: vencidas.length,
          parcelasProximas: proximas.length,
          proximoVencimento: parcelas[0]?.vencimento || ultimaCompra || null
        });
      }
    });

    return itens.sort((a, b) => b.diasAtraso - a.diasAtraso || b.saldoCentavos - a.saldoCentavos);
  }

  function montarMensagemCobranca(cliente, opcoes = {}) {
    let nomeLoja = 'Dr. Troco';
    try {
      const est = JSON.parse(localStorage.getItem('drTroco_estabelecimento') || '{}');
      if (est && est.nomeEstabelecimento) nomeLoja = String(est.nomeEstabelecimento).trim();
    } catch (_) {}

    const saldo = obterSaldo(cliente);
    const valorCentavos = Number(opcoes.valorCentavos) > 0 ? Number(opcoes.valorCentavos) : saldo;
    const vencimento = opcoes.vencimento || obterUltimaDataPorTipo(cliente, 'divida');
    const diasAtraso = Number(opcoes.diasAtraso) || (vencimento ? calcularDiasAtraso(vencimento) : 0);

    return (
      `Olá, ${cliente.nome}! 👋\n\n` +
      `Lembramos sobre o seu débito em aberto com *${nomeLoja}*:\n` +
      `💰 Valor devido: *${formatarDinheiro(valorCentavos)}*\n` +
      (vencimento ? `📅 Vencimento/Referência: ${formatarData(vencimento)}\n` : '') +
      (diasAtraso > 0 ? `⏰ Dias em atraso: ${diasAtraso}\n` : '') +
      `\nPor favor, entre em contato ou fale conosco para combinarmos o pagamento. Obrigado! 🙏`
    );
  }

  function enviarCobrancaWhatsApp(clienteId, mensagemEditada = null, metaCobranca = {}) {
    const cliente = buscarClienteInterno(clienteId);
    if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' };

    const saldo = obterSaldo(cliente);
    if (saldo <= 0) return { ok: false, erro: 'Este cliente não possui saldo devedor.' };

    const numero = normalizarTelefoneWhatsApp(cliente.telefone);
    if (!numero) {
      return { ok: false, erro: 'Telefone inválido ou não cadastrado. Informe com DDD.' };
    }

    const texto = String(mensagemEditada ?? montarMensagemCobranca(cliente, metaCobranca)).trim();
    if (!texto) return { ok: false, erro: 'A mensagem de cobrança não pode ficar vazia.' };

    registrarCobrancaLocal(cliente, {
      canal: 'whatsapp',
      valorCentavos: metaCobranca.valorCentavos || saldo,
      diasAtraso: metaCobranca.diasAtraso || 0,
      vencimento: metaCobranca.vencimento || null,
      mensagem: texto,
      status: 'aberta_no_whatsapp'
    });
    salvarCacheLocal();

    const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
    return { ok: true, url };
  }

  function abrirModalCobrancas() {
    renderizarModalCobrancas();
    abrirModal(elementos.modalCobrancas);
  }

  function renderizarModalCobrancas() {
    if (!elementos.listaCobrancas) return;
    const itens = listarCobrancasPendentes();
    if (!itens.length) {
      elementos.listaCobrancas.innerHTML = `
        <div class="fiado-vazio">
          <div aria-hidden="true">✅</div>
          <h3>Nenhuma cobrança pendente</h3>
          <p>Não há clientes com saldo em aberto no momento.</p>
        </div>`;
      return;
    }

    elementos.listaCobrancas.innerHTML = itens.map(item => {
      const statusTxt = item.diasAtraso > 0
        ? `Vencida há ${item.diasAtraso} dia(s)`
        : (item.proximoVencimento ? `Venc. ${formatarData(item.proximoVencimento)}` : 'Em aberto');
      return `
        <article class="fiado-movimento">
          <div class="fiado-movimento-info">
            <strong>${escaparHTML(item.clienteNome)}</strong>
            <small>${escaparHTML(item.telefone || 'Sem telefone')} · ${escaparHTML(statusTxt)}</small>
            <div class="fiado-movimento-acoes" style="gap:7px;flex-wrap:wrap;">
              <button type="button" class="fiado-btn fiado-btn-whatsapp" style="min-height:36px;padding:7px 11px;grid-column:auto;"
                data-acao="cobrar-item"
                data-id="${escaparHTML(item.clienteId)}"
                data-valor="${item.saldoCentavos}"
                data-atraso="${item.diasAtraso}"
                data-vencimento="${escaparHTML(item.proximoVencimento || '')}">💬 Cobrar WhatsApp</button>
              <button type="button" class="fiado-btn fiado-btn-secundario" style="min-height:36px;padding:7px 11px;"
                data-acao="abrir-cliente-cobranca"
                data-id="${escaparHTML(item.clienteId)}">Abrir conta</button>
            </div>
          </div>
          <div class="fiado-movimento-valor fiado-valor-divida">${formatarDinheiro(item.saldoCentavos)}</div>
        </article>`;
    }).join('');
  }

  function gerarRelatorio({ clienteId = null, dataInicio = null, dataFim = null } = {}) {
    const baseClientes = clienteId
      ? clientes.filter(c => String(c.id) === String(clienteId))
      : clientes;

    let totalVendidoC = 0;
    let totalRecebidoC = 0;
    let totalPendenteC = 0;
    let totalVencidoC = 0;

    const vendas = [];
    const recebimentos = [];
    const hoje = dataLocalISO();

    baseClientes.forEach(c => {
      totalPendenteC += Math.max(0, obterSaldo(c));
      const parcelasVencidas = listarParcelasCliente(c).filter(p => p.valorRestanteCentavos > 0 && p.diasAtraso > 0);
      totalVencidoC += parcelasVencidas.reduce((s, p) => s + p.valorRestanteCentavos, 0);

      obterMovimentacoes(c).forEach(m => {
        if (!movimentacaoAtiva(m)) return;
        const d = obterDataMovimento(m);
        if (dataInicio && d && d < dataInicio) return;
        if (dataFim && d && d > dataFim) return;

        const v = valorMovimentoCentavos(m);
        const item = {
          id: m.id,
          clienteId: c.id,
          clienteNome: c.nome,
          data: d,
          dataHora: m.dataHora,
          valorCentavos: v,
          descricao: m.descricao,
          forma: m.forma,
          operador: m.operador || 'Operador'
        };

        if (m.tipo === 'divida') {
          totalVendidoC += v;
          vendas.push(item);
        } else if (m.tipo === 'pagamento') {
          totalRecebidoC += v;
          recebimentos.push(item);
        }
      });
    });

    const maioresDevedores = [...baseClientes]
      .map(c => ({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        saldoCentavos: obterSaldo(c),
        situacao: c.situacao
      }))
      .filter(x => x.saldoCentavos > 0)
      .sort((a, b) => b.saldoCentavos - a.saldoCentavos);

    const inadimplencia = listarCobrancasPendentes()
      .filter(item => (!clienteId || String(item.clienteId) === String(clienteId)) && item.diasAtraso > 0);

    return {
      periodo: { dataInicio: dataInicio || null, dataFim: dataFim || null, geracao: hoje },
      totais: {
        totalVendidoCentavos: totalVendidoC,
        totalRecebidoCentavos: totalRecebidoC,
        totalPendenteCentavos: totalPendenteC,
        totalVencidoCentavos: totalVencidoC
      },
      maioresDevedores,
      vendas: ordenarMovimentacoes(vendas),
      recebimentos: ordenarMovimentacoes(recebimentos),
      inadimplencia
    };
  }

  function obterFiltrosRelatorioUI() {
    return {
      clienteId: elementos.relatorioCliente?.value || null,
      dataInicio: elementos.relatorioInicio?.value || null,
      dataFim: elementos.relatorioFim?.value || null
    };
  }

  function renderizarModalRelatorios() {
    if (!elementos.conteudoRelatorio) return;
    if (elementos.relatorioCliente) {
      const atual = elementos.relatorioCliente.value;
      const opcoes = ['<option value="">Todos os clientes</option>'].concat(
        [...clientes]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          .map(c => `<option value="${escaparHTML(c.id)}">${escaparHTML(c.nome)}</option>`)
      );
      elementos.relatorioCliente.innerHTML = opcoes.join('');
      if (atual) elementos.relatorioCliente.value = atual;
    }

    const rel = gerarRelatorio(obterFiltrosRelatorioUI());
    const topDevedoresHTML = rel.maioresDevedores.length
      ? rel.maioresDevedores.slice(0, 8).map(d =>
          `<div class="fiado-movimento"><div class="fiado-movimento-info"><strong>${escaparHTML(d.nome)}</strong><small>${escaparHTML(d.telefone || 'Sem telefone')} · ${escaparHTML(d.situacao)}</small></div><div class="fiado-movimento-valor fiado-valor-divida">${formatarDinheiro(d.saldoCentavos)}</div></div>`
        ).join('')
      : '<div class="fiado-vazio"><p>Nenhum cliente com saldo pendente no filtro atual.</p></div>';

    elementos.conteudoRelatorio.innerHTML = `
      <div class="fiado-resumo-mensal">
        <div class="fiado-mes-item"><span>Total vendido</span><strong>${formatarDinheiro(rel.totais.totalVendidoCentavos)}</strong></div>
        <div class="fiado-mes-item"><span>Total recebido</span><strong>${formatarDinheiro(rel.totais.totalRecebidoCentavos)}</strong></div>
        <div class="fiado-mes-item"><span>Total pendente</span><strong>${formatarDinheiro(rel.totais.totalPendenteCentavos)}</strong></div>
        <div class="fiado-mes-item final"><span>Total vencido</span><strong>${formatarDinheiro(rel.totais.totalVencidoCentavos)}</strong></div>
      </div>
      <h3 class="fiado-secao-titulo">Maiores devedores</h3>
      <div style="display:grid;gap:8px;">${topDevedoresHTML}</div>
    `;
  }

  function abrirModalRelatorios() {
    if (elementos.relatorioInicio && !elementos.relatorioInicio.value) {
      elementos.relatorioInicio.value = `${mesAtual()}-01`;
    }
    if (elementos.relatorioFim && !elementos.relatorioFim.value) {
      elementos.relatorioFim.value = dataLocalISO();
    }
    renderizarModalRelatorios();
    abrirModal(elementos.modalRelatorios);
  }

  function imprimirRelatorioPDF(filtros = {}) {
    const rel = gerarRelatorio(filtros);
    const periodoLabel = `${filtros.dataInicio ? formatarData(filtros.dataInicio) : 'Início'} até ${filtros.dataFim ? formatarData(filtros.dataFim) : 'Hoje'}`;
    const linhasDevedores = rel.maioresDevedores.map(d =>
      `<tr><td>${escaparHTML(d.nome)}</td><td>${escaparHTML(d.telefone || '—')}</td><td>${escaparHTML(d.situacao)}</td><td>${formatarDinheiro(d.saldoCentavos)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Nenhum cliente com saldo devedor.</td></tr>';

    const linhasVendas = rel.vendas.map(v =>
      `<tr><td>${escaparHTML(formatarData(v.data))}</td><td>${escaparHTML(v.clienteNome)}</td><td>${escaparHTML(v.descricao || 'Compra fiado')}</td><td>${formatarDinheiro(v.valorCentavos)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Nenhuma compra no período.</td></tr>';

    const linhasPagamentos = rel.recebimentos.map(p =>
      `<tr><td>${escaparHTML(formatarData(p.data))}</td><td>${escaparHTML(p.clienteNome)}</td><td>${escaparHTML(nomeFormaPagamento(p.forma))}</td><td>${formatarDinheiro(p.valorCentavos)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Nenhum recebimento no período.</td></tr>';

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Relatório Gerencial — Dr. Troco Fiado</title>
      <style>
        body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#22312a;font-size:12px}
        h1{margin:0 0 6px;font-size:22px} h2{margin:20px 0 8px;font-size:15px}
        .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}
        .card{border:1px solid #d6e4dc;border-radius:8px;padding:10px}
        .card span{display:block;color:#62756b;font-size:11px;margin-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:14px}
        th,td{border-bottom:1px solid #e3ece7;padding:7px;text-align:left}
        th{background:#eaf8f1}
      </style></head><body>
      <h1>Dr. Troco — Relatório do Fiado</h1>
      <p><strong>Período:</strong> ${escaparHTML(periodoLabel)} · <strong>Emitido em:</strong> ${escaparHTML(formatarData(dataLocalISO()))}</p>
      <div class="cards">
        <div class="card"><span>Total vendido</span><strong>${formatarDinheiro(rel.totais.totalVendidoCentavos)}</strong></div>
        <div class="card"><span>Total recebido</span><strong>${formatarDinheiro(rel.totais.totalRecebidoCentavos)}</strong></div>
        <div class="card"><span>Total pendente</span><strong>${formatarDinheiro(rel.totais.totalPendenteCentavos)}</strong></div>
        <div class="card"><span>Total vencido</span><strong>${formatarDinheiro(rel.totais.totalVencidoCentavos)}</strong></div>
      </div>
      <h2>Maiores devedores</h2>
      <table><thead><tr><th>Cliente</th><th>Telefone</th><th>Situação</th><th>Saldo</th></tr></thead><tbody>${linhasDevedores}</tbody></table>
      <h2>Compras no fiado</h2>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>${linhasVendas}</tbody></table>
      <h2>Recebimentos</h2>
      <table><thead><tr><th>Data</th><th>Cliente</th><th>Forma</th><th>Valor</th></tr></thead><tbody>${linhasPagamentos}</tbody></table>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script>
      </body></html>`;

    const janela = window.open('', '_blank');
    if (!janela) { mostrarNotificacao('Permita pop-ups para gerar o relatório em PDF.', true); return false; }
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    return true;
  }

  /* ==========================================================
     RENDERIZAÇÃO
  ========================================================== */

  function atualizarResumoGeral() {
    const ativos = clientes.filter(c => !c.arquivado);
    const qtd = ativos.length;
    const recebido = clientes.reduce((t, c) => t + totalPago(c), 0);
    const aberto = clientes.reduce((t, c) => t + Math.max(0, obterSaldo(c)), 0);
    const cobrancas = listarCobrancasPendentes();
    const vencido = cobrancas.reduce((t, item) => t + (Number(item.totalVencidoCentavos) || 0), 0);
    const inadimplentes = clientes.filter(c => clienteEhInadimplente(c)).length;

    if (elementos.totalClientes) elementos.totalClientes.textContent = String(qtd);
    if (elementos.totalRecebido) elementos.totalRecebido.textContent = formatarDinheiro(recebido);
    if (elementos.totalAberto) elementos.totalAberto.textContent = formatarDinheiro(aberto);
    if (elementos.totalVencido) elementos.totalVencido.textContent = formatarDinheiro(vencido);
    if (elementos.clientesInadimplentes) elementos.clientesInadimplentes.textContent = String(inadimplentes);
  }

  function correspondeFiltroSituacao(c) {
    if (filtroSituacaoAtual === 'todos') return !c.arquivado;
    if (filtroSituacaoAtual === 'arquivado') return Boolean(c.arquivado);
    if (filtroSituacaoAtual === 'bloqueado') return !c.arquivado && c.situacao === 'bloqueado';
    if (filtroSituacaoAtual === 'inadimplente') return clienteEhInadimplente(c);
    if (filtroSituacaoAtual === 'ativo') return !c.arquivado && c.situacao !== 'bloqueado';
    return !c.arquivado;
  }

  function renderizarClientes() {
    if (!elementos.lista) return;
    const busca = normalizarTexto(elementos.busca?.value || '');
    const filtrados = clientes
      .filter(c => {
        if (!busca && !correspondeFiltroSituacao(c)) return false;
        if (busca && filtroSituacaoAtual !== 'arquivado' && c.arquivado) return false;
        if (busca && filtroSituacaoAtual !== 'todos' && !correspondeFiltroSituacao(c)) return false;
        const n = normalizarTexto(c.nome);
        const t = normalizarTexto(c.telefone);
        const e = normalizarTexto(c.endereco);
        return !busca || n.includes(busca) || t.includes(busca) || e.includes(busca);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (elementos.contagem) {
      elementos.contagem.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'}`;
    }

    if (!filtrados.length) {
      const vazio = busca
        ? { icone: '🔎', titulo: 'Nenhum cliente encontrado', desc: 'Tente outro nome, telefone ou endereço.' }
        : { icone: '👥', titulo: 'Nenhum cliente neste filtro', desc: 'Toque em “Cadastrar cliente” ou troque o filtro.' };
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
      const inadimplente = clienteEhInadimplente(c);
      const statusTag = c.arquivado
        ? ' · Arquivado'
        : (c.situacao === 'bloqueado' ? ' · Bloqueado' : (inadimplente ? ' · Inadimplente' : ''));
      return `
        <article class="fiado-cliente-card">
          <div class="fiado-cliente-info">
            <div class="fiado-avatar" aria-hidden="true">👤</div>
            <div class="fiado-cliente-texto">
              <h3>${escaparHTML(c.nome)}${escaparHTML(statusTag)}</h3>
              <p>${escaparHTML(tel)}</p>
              <small>${obterMovimentacoes(c).length} movimentações${c.endereco ? ' · ' + escaparHTML(c.endereco) : ''}</small>
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
    if (elementos.detalhesTelefone) {
      const partes = [c.telefone || 'Telefone não informado'];
      if (c.endereco) partes.push(c.endereco);
      if (c.situacao === 'bloqueado') partes.push('BLOQUEADO');
      if (c.arquivado) partes.push('ARQUIVADO');
      elementos.detalhesTelefone.textContent = partes.join(' · ');
    }
    if (elementos.mesReferencia && !elementos.mesReferencia.value) elementos.mesReferencia.value = mesAtual();
    renderizarDetalhes(c);
    abrirModal(elementos.modalDetalhes);
  }

  function renderizarDetalhes(c) {
    if (!c) return;
    const compras = totalComprado(c);
    const pago = totalPago(c);
    const saldo = obterSaldo(c);
    const limite = obterLimiteCredito(c);
    const disponivel = obterCreditoDisponivel(c);
    const pendentesQtd = quantidadeComprasPendentes(c);

    if (elementos.detalhesSaldo) elementos.detalhesSaldo.textContent = formatarDinheiro(saldo);
    if (elementos.detalhesCompras) elementos.detalhesCompras.textContent = formatarDinheiro(compras);
    if (elementos.detalhesPago) elementos.detalhesPago.textContent = formatarDinheiro(pago);
    if (elementos.detalhesLimite) elementos.detalhesLimite.textContent = limite > 0 ? formatarDinheiro(limite) : 'Sem limite';
    if (elementos.detalhesDisponivel) elementos.detalhesDisponivel.textContent = disponivel === null ? 'Livre' : formatarDinheiro(disponivel);
    if (elementos.detalhesPendentesQtd) elementos.detalhesPendentesQtd.textContent = String(pendentesQtd);

    renderizarResumoMensal(c);
    renderizarParcelas(c);
    renderizarHistorico(c);
  }

  function renderizarParcelas(c) {
    if (!elementos.parcelasLista) return;
    const parcelas = listarParcelasCliente(c);
    if (!parcelas.length) {
      elementos.parcelasLista.innerHTML = `
        <div class="fiado-vazio">
          <p>Nenhuma compra parcelada ou com vencimento cadastrado para este cliente.</p>
        </div>`;
      return;
    }

    elementos.parcelasLista.innerHTML = parcelas.map(p => {
      const pagoP = Number(p.valorPagoCentavos) || 0;
      const restP = Number(p.valorRestanteCentavos) || 0;
      const statusLabel = {
        paga: 'Paga',
        parcial: 'Parcial',
        pendente: 'Pendente',
        vencida: `Vencida (${p.diasAtraso}d)`,
        vencida_parcial: `Vencida parcial (${p.diasAtraso}d)`
      }[p.status] || p.status;

      return `
        <article class="fiado-movimento">
          <div class="fiado-movimento-info">
            <strong>Parcela ${p.numero}/${p.totalParcelas} — ${escaparHTML(statusLabel)}</strong>
            <small>Vencimento: ${escaparHTML(formatarData(p.vencimento))} · ${escaparHTML(p.descricaoCompra)}</small>
            <small>Pago: ${formatarDinheiro(pagoP)} · Restante: ${formatarDinheiro(restP)}</small>
            ${restP > 0 ? `
              <div class="fiado-movimento-acoes" style="gap:6px;flex-wrap:wrap;">
                <button type="button" class="fiado-btn fiado-btn-principal" style="min-height:32px;padding:5px 10px;font-size:11px;"
                  data-acao="pagar-parcela"
                  data-mov-id="${escaparHTML(p.movimentacaoId)}"
                  data-parcela-id="${escaparHTML(p.id)}"
                  data-restante="${restP}"
                  data-numero="${p.numero}"
                  data-total="${p.totalParcelas}">Pagar parcela</button>
                <button type="button" class="fiado-btn fiado-btn-neutro" style="min-height:32px;padding:5px 10px;font-size:11px;"
                  data-acao="alterar-vencimento"
                  data-mov-id="${escaparHTML(p.movimentacaoId)}"
                  data-parcela-id="${escaparHTML(p.id)}"
                  data-vencimento="${escaparHTML(p.vencimento)}">Alterar vencimento</button>
              </div>` : ''}
          </div>
          <div class="fiado-movimento-valor ${restP === 0 ? 'fiado-valor-pago' : 'fiado-valor-divida'}">${formatarDinheiro(p.valorCentavos)}</div>
        </article>`;
    }).join('');
  }

  function renderizarResumoMensal(c) {
    if (!elementos.resumoMensal) return;
    const mes = elementos.mesReferencia?.value || mesAtual();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      elementos.resumoMensal.innerHTML = '<div class="fiado-vazio"><h3>Selecione um mês válido</h3></div>';
      return;
    }
    const movs = obterMovimentacoes(c).filter(movimentacaoAtiva);
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
      if (movimentacaoAtiva(m)) {
        const v = valorMovimentoCentavos(m);
        if (m.tipo === 'divida') saldo += v;
        if (m.tipo === 'pagamento') saldo -= v;
      }
      saldoDepois.set(m.id, saldo);
    });

    elementos.historico.innerHTML = movs.map(m => {
      const ativo = movimentacaoAtiva(m);
      const pag = m.tipo === 'pagamento';
      const v = valorMovimentoCentavos(m);
      const data = obterDataMovimento(m);
      const hora = formatarHora(m.dataHora);
      const statusSuffix = !ativo ? ` (${String(m.statusMovimento).toUpperCase()})` : '';
      const titulo = (pag ? 'Pagamento recebido' : 'Compra fiado') + statusSuffix;
      const classeValor = !ativo ? '' : (pag ? 'fiado-valor-pago' : 'fiado-valor-divida');
      const sinal = pag ? '− ' : '+ ';

      let detalhe = m.descricao || (pag ? 'Pagamento recebido' : 'Compra fiado');
      if (pag && m.forma) detalhe += ' · ' + nomeFormaPagamento(m.forma);
      if (pag && m.observacao) detalhe += ' · ' + m.observacao;
      if (m.operador) detalhe += ' · Op.: ' + m.operador;
      if (!ativo && m.motivoCancelamento) detalhe += ' · Motivo: ' + m.motivoCancelamento;
      if (Array.isArray(m.parcelas) && m.parcelas.length) {
        const qtdPagas = m.parcelas.filter(p => atualizarStatusParcela(p).status === 'paga').length;
        detalhe += ` · Parcelas: ${qtdPagas}/${m.parcelas.length} pagas`;
      }

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
            ${ativo ? `
              <div class="fiado-movimento-acoes">
                <button type="button" class="fiado-btn-mini"
                  data-acao="excluir-movimento"
                  data-id="${escaparHTML(c.id)}"
                  data-movimento-id="${escaparHTML(m.id)}">Cancelar lançamento</button>
              </div>` : ''}
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
    const ativas = movs.filter(movimentacaoAtiva);
    const compras = ativas.reduce((t, m) => m.tipo === 'divida' ? t + valorMovimentoCentavos(m) : t, 0);
    const pagamentos = ativas.reduce((t, m) => m.tipo === 'pagamento' ? t + valorMovimentoCentavos(m) : t, 0);
    const saldo = compras - pagamentos;
    const linhas = ordenarMovimentacoes(movs).map(m => {
      const ativo = movimentacaoAtiva(m);
      const pag = m.tipo === 'pagamento';
      const v = valorMovimentoCentavos(m);
      let desc = m.descricao || (pag ? 'Pagamento recebido' : 'Compra fiado');
      if (pag && m.forma) desc += ' — ' + nomeFormaPagamento(m.forma);
      if (!ativo) desc += ` [${String(m.statusMovimento).toUpperCase()}]`;
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
        ${cliente.endereco ? `<p><strong>Endereço:</strong> ${escaparHTML(cliente.endereco)}</p>` : ''}
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
     COBRANÇA VIA WHATSAPP (MENSAGEM EDITÁVEL ANTES DO ENVIO)
  ========================================================== */

  function normalizarTelefoneWhatsApp(telefone) {
    let numero = String(telefone || '').replace(/\D/g, '');
    if (!numero) return '';
    if (numero.length === 10 || numero.length === 11) {
      numero = '55' + numero;
    }
    if (numero.length < 12 || numero.length > 15) return '';
    return numero;
  }

  function criarModalCobranca() {
    let modal = $('modalCobrancaFiado');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modalCobrancaFiado';
    modal.className = 'fiado-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="fiado-modal-conteudo">
        <div class="fiado-modal-topo">
          <div><h2>Cobrança via WhatsApp</h2><p>Revise ou edite a mensagem antes de abrir o WhatsApp.</p></div>
          <button type="button" class="fiado-btn-fechar" data-fechar-cobranca aria-label="Fechar">×</button>
        </div>
        <form id="formCobrancaFiado" class="fiado-form">
          <div class="fiado-campo">
            <label for="fiadoMensagemCobranca">Mensagem de cobrança</label>
            <textarea id="fiadoMensagemCobranca" name="mensagem" rows="6" required></textarea>
          </div>
          <div class="fiado-acoes-modal">
            <button type="submit" class="fiado-btn fiado-btn-whatsapp" style="grid-column:auto;">💬 Abrir WhatsApp</button>
            <button type="button" class="fiado-btn fiado-btn-neutro" data-fechar-cobranca>Cancelar</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-fechar-cobranca]').forEach(b => b.addEventListener('click', () => fecharModal(modal)));
    modal.addEventListener('click', ev => { if (ev.target === modal) fecharModal(modal); });
    modal.querySelector('#formCobrancaFiado').addEventListener('submit', ev => {
      ev.preventDefault();
      const cid = modal.dataset.clienteId;
      const texto = $('fiadoMensagemCobranca')?.value || '';
      const meta = {
        valorCentavos: Number(modal.dataset.valorCentavos) || 0,
        diasAtraso: Number(modal.dataset.diasAtraso) || 0,
        vencimento: modal.dataset.vencimento || null
      };
      const res = enviarCobrancaWhatsApp(cid, texto, meta);
      if (!res.ok) {
        mostrarNotificacao(res.erro, true);
        return;
      }
      fecharModal(modal);
      renderizarModalCobrancas();
      mostrarNotificacao('WhatsApp aberto com a mensagem de cobrança.');
    });
    return modal;
  }

  function abrirModalMensagemCliente(cliente, opcoes = {}) {
    if (!cliente) { mostrarNotificacao('Cliente não encontrado.', true); return; }
    const saldo = obterSaldo(cliente);
    if (saldo <= 0) { mostrarNotificacao('Este cliente não possui saldo devedor.', true); return; }
    if (!String(cliente.telefone || '').trim()) {
      mostrarNotificacao('Este cliente não possui telefone cadastrado. Edite o cliente e informe um número.', true);
      return;
    }
    if (!normalizarTelefoneWhatsApp(cliente.telefone)) {
      mostrarNotificacao('Telefone inválido. Cadastre com DDD (ex.: 98 99999-9999).', true);
      return;
    }

    const modal = criarModalCobranca();
    modal.dataset.clienteId = cliente.id;
    modal.dataset.valorCentavos = String(opcoes.valorCentavos || saldo);
    modal.dataset.diasAtraso = String(opcoes.diasAtraso || 0);
    modal.dataset.vencimento = String(opcoes.vencimento || '');
    const campoMsg = $('fiadoMensagemCobranca');
    if (campoMsg) campoMsg.value = montarMensagemCobranca(cliente, opcoes);
    abrirModal(modal, campoMsg);
  }

  function cobrarWhatsApp() {
    const cliente = buscarClienteInterno(clienteSelecionadoId);
    abrirModalMensagemCliente(cliente);
  }

  /* ==========================================================
     EVENTOS
  ========================================================== */

  document.querySelectorAll('[data-abrir-cadastro]').forEach(btn => {
    btn.addEventListener('click', () => abrirCadastroCliente());
  });

  document.querySelectorAll('[data-abrir-cobrancas]').forEach(btn => {
    btn.addEventListener('click', abrirModalCobrancas);
  });

  document.querySelectorAll('[data-abrir-relatorios]').forEach(btn => {
    btn.addEventListener('click', abrirModalRelatorios);
  });

  document.querySelectorAll('[data-rolar-para]').forEach(btn => {
    btn.addEventListener('click', () => {
      const alvo = $(btn.getAttribute('data-rolar-para'));
      if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (elementos.filtrosSituacao) {
    elementos.filtrosSituacao.addEventListener('click', ev => {
      const chip = ev.target.closest('[data-filtro-situacao]');
      if (!chip) return;
      filtroSituacaoAtual = chip.dataset.filtroSituacao || 'todos';
      elementos.filtrosSituacao.querySelectorAll('[data-filtro-situacao]').forEach(el => {
        el.classList.toggle('ativo', el === chip);
      });
      renderizarClientes();
    });
  }

  if (elementos.btnFecharCadastro) elementos.btnFecharCadastro.addEventListener('click', fecharCadastro);
  if (elementos.btnCancelarCadastro) elementos.btnCancelarCadastro.addEventListener('click', fecharCadastro);
  if (elementos.formCadastro) elementos.formCadastro.addEventListener('submit', salvarCliente);
  if (elementos.busca) elementos.busca.addEventListener('input', renderizarClientes);

  if (elementos.lista) {
    elementos.lista.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      if (btn.dataset.acao === 'detalhes') abrirDetalhes(btn.dataset.id);
    });
  }

  if (elementos.parcelasLista) {
    elementos.parcelasLista.addEventListener('click', async ev => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn || !clienteSelecionadoId) return;
      const acao = btn.dataset.acao;
      const movId = btn.dataset.movId;
      const parcelaId = btn.dataset.parcelaId;

      if (acao === 'pagar-parcela') {
        const restanteC = Number(btn.dataset.restante) || 0;
        const num = btn.dataset.numero;
        const tot = btn.dataset.total;
        const digitado = window.prompt(
          `Valor a pagar da parcela ${num}/${tot} (restante ${formatarDinheiro(restanteC)}):`,
          (restanteC / 100).toFixed(2)
        );
        if (digitado === null) return;
        try {
          const r = await registrarPagamentoParcela(clienteSelecionadoId, movId, parcelaId, digitado, 'dinheiro');
          if (r && r.sucesso) {
            mostrarNotificacao('Pagamento da parcela registrado!');
            abrirDetalhes(clienteSelecionadoId);
          }
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao pagar parcela.', true);
        }
      } else if (acao === 'alterar-vencimento') {
        const atualVenc = btn.dataset.vencimento || dataLocalISO();
        const novoVenc = window.prompt('Novo vencimento (AAAA-MM-DD):', atualVenc);
        if (!novoVenc) return;
        try {
          await alterarVencimentoParcela(clienteSelecionadoId, movId, parcelaId, novoVenc.trim());
          abrirDetalhes(clienteSelecionadoId);
        } catch (err) {
          mostrarNotificacao(err.message || 'Erro ao alterar vencimento.', true);
        }
      }
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
  if (elementos.btnPagamento) elementos.btnPagamento.addEventListener('click', () => abrirPagamento());
  if (elementos.btnEditarCliente) {
    elementos.btnEditarCliente.addEventListener('click', () => {
      const c = buscarClienteInterno(clienteSelecionadoId);
      if (!c) { mostrarNotificacao('Cliente não encontrado.', true); return; }
      abrirCadastroCliente(c);
    });
  }
  if (elementos.btnWhatsApp) elementos.btnWhatsApp.addEventListener('click', cobrarWhatsApp);
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

  if (elementos.btnFecharCobrancas) {
    elementos.btnFecharCobrancas.addEventListener('click', () => fecharModal(elementos.modalCobrancas));
  }
  if (elementos.listaCobrancas) {
    elementos.listaCobrancas.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao]');
      if (!btn) return;
      const cid = btn.dataset.id;
      if (btn.dataset.acao === 'cobrar-item') {
        const cliente = buscarClienteInterno(cid);
        abrirModalMensagemCliente(cliente, {
          valorCentavos: Number(btn.dataset.valor) || 0,
          diasAtraso: Number(btn.dataset.atraso) || 0,
          vencimento: btn.dataset.vencimento || null
        });
      } else if (btn.dataset.acao === 'abrir-cliente-cobranca') {
        fecharModal(elementos.modalCobrancas);
        abrirDetalhes(cid);
      }
    });
  }

  if (elementos.btnFecharRelatorios) {
    elementos.btnFecharRelatorios.addEventListener('click', () => fecharModal(elementos.modalRelatorios));
  }
  if (elementos.formRelatorio) {
    elementos.formRelatorio.addEventListener('submit', ev => {
      ev.preventDefault();
      renderizarModalRelatorios();
    });
  }
  if (elementos.btnImprimirRelatorio) {
    elementos.btnImprimirRelatorio.addEventListener('click', () => {
      imprimirRelatorioPDF(obterFiltrosRelatorioUI());
    });
  }

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
    garantirCamposExtrasCadastro();
    sincronizarSelectFormas();
    renderizarTudo();
    const c = buscarClienteInterno(clienteSelecionadoId);
    if (c) renderizarDetalhes(c);
  }

  async function inicializar() {
    if (elementos.mesReferencia && !elementos.mesReferencia.value) elementos.mesReferencia.value = mesAtual();

    garantirCamposExtrasCadastro();
    sincronizarSelectFormas();

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
      renderizarTudoInicial();
      console.warn('[Fiado] Modo offline — exibindo cache local.');
      if (erroCarregamento && String(erroCarregamento.message || '').includes('não autenticado')) {
        mostrarNotificacao('Faça login para sincronizar os dados do Fiado com o Supabase.', true);
      } else {
        mostrarNotificacao('Não foi possível conectar ao Supabase. Os dados exibidos podem estar desatualizados.', true);
      }
    }

    console.log('Dr. Troco — módulo Fiado (Supabase) inicializado.');
  }

  /* ==========================================================
     API PÚBLICA
  ========================================================== */

  window.DrTrocoFiado = {
    registrarVendaFiado,
    registrarPagamento: registrarPagamentoAPI,
    registrarPagamentoParcela,
    alterarVencimentoParcela,
    listarParcelasCliente,
    buscarCliente: buscarClienteAPI,
    listarClientes,
    listarClientesComSaldo,
    saldoDevedor: saldoDevedorAPI,
    listarCobrancasPendentes,
    montarMensagemCobranca,
    enviarCobrancaWhatsApp,
    gerarRelatorio,
    imprimirRelatorioPDF,
    atualizar: async () => { await carregarTudo(); renderizarTudoInicial(); },
    abrirDetalhes,
    abrirCadastro: () => abrirCadastroCliente(),
    paraCentavos,
    formatarDinheiro,
    migrarDadosLocais,
    recarregarDoSupabase: carregarTudo,
    estaPronto: () => pronto,
    estornarVendaFiado
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
