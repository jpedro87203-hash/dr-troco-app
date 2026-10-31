/* ============================================================
   DR. TROCO — CONTROLE DE FIADO
   Arquivo: fiado.js
   Compatível com: fiado.html
   Armazenamento: localStorage
   Valores monetários: cálculos em centavos
   Sem cobrança de juros
============================================================ */

'use strict';

(() => {
  // Evita inicializar o módulo duas vezes.
  if (window.__drTrocoFiadoInicializado) return;
  window.__drTrocoFiadoInicializado = true;

  /* ==========================================================
     1. CONFIGURAÇÕES E ELEMENTOS
  ========================================================== */

  const CHAVE_CLIENTES = 'drTroco_fiadoClientes';

  const $ = id => document.getElementById(id);

  const elementos = {
    totalClientes: $('fiadoTotalClientes'),
    totalRecebido: $('fiadoTotalRecebido'),
    totalAberto: $('fiadoTotalAberto'),

    busca: $('fiadoBuscaCliente'),
    contagem: $('fiadoContagemClientes'),
    lista: $('fiadoListaClientes'),

    modalCadastro: $('modalCadastroFiado'),
    formCadastro: $('formCadastroCliente'),
    nome: $('fiadoNomeCliente'),
    telefone: $('fiadoTelefoneCliente'),

    modalDetalhes: $('modalDetalhesFiado'),
    detalhesNome: $('fiadoDetalhesNome'),
    detalhesTelefone: $('fiadoDetalhesTelefone'),
    detalhesSaldo: $('fiadoDetalhesSaldo'),
    detalhesCompras: $('fiadoDetalhesCompras'),
    detalhesPago: $('fiadoDetalhesPago'),

    mesReferencia: $('fiadoMesReferencia'),
    resumoMensal: $('fiadoResumoMensal'),
    periodoExtrato: $('fiadoPeriodoExtrato'),
    historico: $('fiadoHistoricoCliente'),

    btnComprar: $('btnAdicionarDividaFiado'),
    btnPagamento: $('btnRegistrarPagamentoFiado'),
    btnPDF: $('btnExportarFiadoPDF'),
    btnExcluirCliente: $('btnExcluirClienteFiado'),

    btnFecharDetalhes: $('btnFecharDetalhesFiado'),
    btnFecharDetalhes2: $('btnFecharDetalhesFiado2'),

    modalPagamento: $('modalPagamentoFiado'),
    formPagamento: $('formPagamentoFiado'),
    valorPagamento: $('fiadoValorPagamento'),
    formaPagamento: $('fiadoFormaPagamento'),
    observacaoPagamento: $('fiadoObservacaoPagamento'),

    btnFecharPagamento: $('btnFecharPagamentoFiado'),
    btnCancelarPagamento: $('btnCancelarPagamentoFiado'),

    notificacao: $('fiadoNotificacao')
  };

  let clientes = carregarClientes();
  let clienteSelecionadoId = null;
  let temporizadorNotificacao = null;

  /* ==========================================================
     2. FUNÇÕES UTILITÁRIAS
  ========================================================== */

  function gerarId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return Date.now().toString(36) +
      Math.random().toString(36).slice(2, 12);
  }

  function agoraISO() {
    return new Date().toISOString();
  }

  function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
  }

  function mesAtual() {
    return dataLocalISO().slice(0, 7);
  }

  function obterDataMovimento(movimento) {
    const valor = movimento.data || movimento.dataHora;

    if (!valor) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
      return String(valor);
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) return '';

    return dataLocalISO(data);
  }

  function formatarData(valor) {
    if (!valor) return 'Data não informada';

    const texto = String(valor);
    const dataISO = /^\d{4}-\d{2}-\d{2}/.test(texto)
      ? texto.slice(0, 10)
      : obterDataMovimento({ data: texto });

    if (!dataISO) return 'Data não informada';

    const partes = dataISO.split('-');

    if (partes.length !== 3) return 'Data não informada';

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function formatarHora(valor) {
    if (!valor) return '';

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) return '';

    return data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatarMes(mes) {
    if (!/^\d{4}-\d{2}$/.test(String(mes))) {
      return String(mes || '');
    }

    const [ano, numeroMes] = mes.split('-');

    const data = new Date(Number(ano), Number(numeroMes) - 1, 1);

    return data.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });
  }

  function formatarDinheiro(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function paraCentavos(valor) {
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) return 0;
      return Math.round(valor * 100);
    }

    if (typeof valor !== 'string') return 0;

    let texto = valor.trim();

    if (!texto) return 0;

    texto = texto.replace(/[R$\s]/g, '');

    if (texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    }

    const numero = Number(texto);

    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caractere]);
  }

  function normalizarTexto(valor) {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('pt-BR');
  }

  function obterSaldo(cliente) {
    return totalComprado(cliente) - totalPago(cliente);
  }

  function obterMovimentacoes(cliente) {
    if (!Array.isArray(cliente.movimentacoes)) {
      cliente.movimentacoes = [];
    }

    return cliente.movimentacoes;
  }

  function ordenarMovimentacoes(movimentacoes) {
    return [...movimentacoes].sort((a, b) => {
      const dataA = new Date(a.dataHora || a.data || 0).getTime();
      const dataB = new Date(b.dataHora || b.data || 0).getTime();

      if (dataA !== dataB) return dataB - dataA;

      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }

  function obterTipo(movimento) {
    const tipo = normalizarTexto(movimento.tipo || movimento.operacao || '');

    if (
      tipo.includes('pagamento') ||
      tipo.includes('recebimento') ||
      tipo === 'pago'
    ) {
      return 'pagamento';
    }

    if (
      tipo.includes('divida') ||
      tipo.includes('compra') ||
      tipo.includes('venda')
    ) {
      return 'divida';
    }

    return '';
  }

  function valorMovimentoCentavos(movimento) {
    if (Number.isInteger(movimento.valorCentavos)) {
      return movimento.valorCentavos;
    }

    return paraCentavos(movimento.valor ?? movimento.valorTotal ?? 0);
  }

  function totalPorTipo(cliente, tipo) {
    return obterMovimentacoes(cliente).reduce((total, movimento) => {
      if (obterTipo(movimento) !== tipo) return total;

      return total + valorMovimentoCentavos(movimento);
    }, 0);
  }

  function totalComprado(cliente) {
    return totalPorTipo(cliente, 'divida');
  }

  function totalPago(cliente) {
    return totalPorTipo(cliente, 'pagamento');
  }

  function buscarClienteInterno(id) {
    return clientes.find(cliente => String(cliente.id) === String(id)) || null;
  }

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function mostrarNotificacao(mensagem, erro = false) {
    const elemento = elementos.notificacao;

    if (!elemento) {
      console.log('[Dr. Troco — Fiado]', mensagem);
      return;
    }

    clearTimeout(temporizadorNotificacao);

    elemento.textContent = mensagem;
    elemento.classList.toggle('erro', erro);
    elemento.classList.add('visivel');

    temporizadorNotificacao = setTimeout(() => {
      elemento.classList.remove('visivel');
    }, 3200);
  }

  function confirmar(mensagem) {
    return window.confirm(mensagem);
  }

  /* ==========================================================
     3. CARREGAR, NORMALIZAR E SALVAR DADOS
  ========================================================== */

  function normalizarMovimentacao(movimento) {
    const item = { ...movimento };

    item.id = item.id || gerarId();

    item.tipo = obterTipo(item) || 'divida';

    if (!item.dataHora) {
      item.dataHora = item.data
        ? `${item.data}T12:00:00`
        : agoraISO();
    }

    item.valorCentavos = valorMovimentoCentavos(item);

    if (item.valorCentavos < 0) {
      item.valorCentavos = Math.abs(item.valorCentavos);
    }

    item.valor = item.valorCentavos / 100;

    item.data = obterDataMovimento(item) || dataLocalISO();

    if (item.tipo === 'pagamento') {
      item.forma = item.forma || item.formaPagamento || 'dinheiro';
    }

    return item;
  }

  function normalizarCliente(cliente) {
    const item = { ...cliente };

    item.id = item.id || gerarId();
    item.nome = String(item.nome || item.nomeCliente || '').trim();
    item.telefone = String(item.telefone || '').trim();

    if (!Array.isArray(item.movimentacoes)) {
      item.movimentacoes = [];
    }

    item.movimentacoes = item.movimentacoes.map(normalizarMovimentacao);

    item.criadoEm = item.criadoEm || item.dataCadastro || agoraISO();
    item.atualizadoEm = item.atualizadoEm || item.criadoEm;

    return item;
  }

  function carregarClientes() {
    try {
      const bruto = localStorage.getItem(CHAVE_CLIENTES);

      if (!bruto) return [];

      const dados = JSON.parse(bruto);

      if (!Array.isArray(dados)) return [];

      return dados
        .filter(item => item && typeof item === 'object')
        .map(normalizarCliente)
        .filter(cliente => cliente.nome);
    } catch (erro) {
      console.error('Erro ao carregar clientes do fiado:', erro);
      return [];
    }
  }

  function salvarClientes() {
    try {
      localStorage.setItem(CHAVE_CLIENTES, JSON.stringify(clientes));
      return true;
    } catch (erro) {
      console.error('Erro ao salvar clientes do fiado:', erro);

      mostrarNotificacao(
        'Não foi possível salvar os dados. Verifique o espaço disponível no aparelho.',
        true
      );

      return false;
    }
  }

  function salvarEAtualizar() {
    if (!salvarClientes()) return false;

    renderizarTudo();

    return true;
  }

  /* ==========================================================
     4. MODAIS
  ========================================================== */

  function abrirModal(modal, campoInicial) {
    if (!modal) return;

    modal.classList.add('aberto');
    modal.setAttribute('aria-hidden', 'false');

    document.body.style.overflow = 'hidden';

    if (campoInicial) {
      setTimeout(() => campoInicial.focus(), 80);
    }
  }

  function fecharModal(modal) {
    if (!modal) return;

    modal.classList.remove('aberto');
    modal.setAttribute('aria-hidden', 'true');

    if (!document.querySelector('.fiado-modal.aberto')) {
      document.body.style.overflow = '';
    }
  }

  function fecharDetalhes() {
    fecharModal(elementos.modalDetalhes);
    clienteSelecionadoId = null;
  }

  function fecharPagamento() {
    fecharModal(elementos.modalPagamento);

    if (elementos.formPagamento) {
      elementos.formPagamento.reset();
    }
  }

  function fecharTodosModais() {
    document.querySelectorAll('.fiado-modal.aberto').forEach(modal => {
      fecharModal(modal);
    });

    clienteSelecionadoId = null;
  }

  document.querySelectorAll('.fiado-modal').forEach(modal => {
    modal.addEventListener('click', evento => {
      if (evento.target === modal) {
        fecharModal(modal);

        if (modal === elementos.modalDetalhes) {
          clienteSelecionadoId = null;
        }
      }
    });
  });

  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape') {
      fecharTodosModais();
    }
  });

  /* ==========================================================
     5. CADASTRO E EDIÇÃO DE CLIENTES
  ========================================================== */

  function abrirCadastroCliente(cliente = null) {
    if (!elementos.formCadastro) return;

    elementos.formCadastro.reset();

    let titulo = $('tituloCadastroFiado');
    let botaoSalvar = elementos.formCadastro.querySelector('[type="submit"]');

    if (cliente) {
      elementos.nome.value = cliente.nome;
      elementos.telefone.value = cliente.telefone || '';

      if (titulo) titulo.textContent = 'Editar cliente';
      if (botaoSalvar) botaoSalvar.textContent = 'Salvar alterações';

      elementos.formCadastro.dataset.editarId = cliente.id;
    } else {
      if (titulo) titulo.textContent = 'Cadastrar cliente';
      if (botaoSalvar) botaoSalvar.textContent = '＋ Salvar cliente';

      delete elementos.formCadastro.dataset.editarId;
    }

    abrirModal(elementos.modalCadastro, elementos.nome);
  }

  function salvarCliente(evento) {
    evento.preventDefault();

    const nome = elementos.nome.value.trim();
    const telefone = elementos.telefone.value.trim();
    const idEdicao = elementos.formCadastro.dataset.editarId;

    if (!nome) {
      mostrarNotificacao('Digite o nome do cliente.', true);
      elementos.nome.focus();
      return;
    }

    const nomeNormalizado = normalizarTexto(nome);

    const duplicado = clientes.find(cliente =>
      normalizarTexto(cliente.nome) === nomeNormalizado &&
      String(cliente.id) !== String(idEdicao || '')
    );

    if (duplicado) {
      if (!confirmar(
        'Já existe um cliente com esse nome. Deseja cadastrar mesmo assim?'
      )) {
        return;
      }
    }

    if (idEdicao) {
      const cliente = buscarClienteInterno(idEdicao);

      if (!cliente) {
        mostrarNotificacao('Cliente não encontrado.', true);
        return;
      }

      cliente.nome = nome;
      cliente.telefone = telefone;
      cliente.atualizadoEm = agoraISO();

      if (!salvarEAtualizar()) return;

      fecharModal(elementos.modalCadastro);
      mostrarNotificacao('Dados do cliente atualizados!');
      return;
    }

    const novoCliente = {
      id: gerarId(),
      nome,
      telefone,
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
      movimentacoes: []
    };

    clientes.push(novoCliente);

    if (!salvarEAtualizar()) {
      clientes.pop();
      return;
    }

    fecharModal(elementos.modalCadastro);

    mostrarNotificacao('Cliente cadastrado com sucesso!');
  }

  function editarCliente(id) {
    const cliente = buscarClienteInterno(id);

    if (!cliente) {
      mostrarNotificacao('Cliente não encontrado.', true);
      return;
    }

    abrirCadastroCliente(cliente);
  }

  function excluirCliente(id) {
    const cliente = buscarClienteInterno(id);

    if (!cliente) {
      mostrarNotificacao('Cliente não encontrado.', true);
      return;
    }

    const saldo = obterSaldo(cliente);

    let mensagem = `Deseja excluir o cliente "${cliente.nome}"?`;

    if (saldo > 0) {
      mensagem += '\n\nEste cliente ainda possui saldo devedor de ' +
        formatarDinheiro(saldo) + '.';
    }

    mensagem += '\n\nEsta ação apagará o histórico desse cliente deste módulo.';

    if (!confirmar(mensagem)) return;

    const indice = clientes.findIndex(item =>
      String(item.id) === String(id)
    );

    if (indice < 0) return;

    const removido = clientes.splice(indice, 1)[0];

    if (!salvarEAtualizar()) {
      clientes.splice(indice, 0, removido);
      return;
    }

    fecharModal(elementos.modalDetalhes);
    clienteSelecionadoId = null;

    mostrarNotificacao('Cliente excluído.');
  }

  /* ==========================================================
     6. COMPRAS FIADO
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
          <div>
            <h2>Registrar compra fiado</h2>
            <p>Informe o valor da compra do cliente.</p>
          </div>
          <button type="button"
            class="fiado-btn-fechar"
            data-fechar-compra
            aria-label="Fechar compra">×</button>
        </div>

        <form id="formNovaDividaFiado" class="fiado-form">
          <div class="fiado-campo">
            <label for="fiadoValorDivida">Valor da compra (R$) *</label>
            <input id="fiadoValorDivida"
              name="valor"
              type="number"
              min="0.01"
              step="0.01"
              inputmode="decimal"
              placeholder="0,00"
              required>
          </div>

          <div class="fiado-campo">
            <label for="fiadoDescricaoDivida">Descrição da compra (opcional)</label>
            <textarea id="fiadoDescricaoDivida"
              name="descricao"
              maxlength="300"
              rows="3"
              placeholder="Produtos ou detalhes da compra"></textarea>
          </div>

          <button type="submit"
            class="fiado-btn fiado-btn-principal">Salvar compra</button>

          <button type="button"
            class="fiado-btn fiado-btn-neutro"
            data-fechar-compra>Cancelar</button>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-fechar-compra]').forEach(botao => {
      botao.addEventListener('click', () => fecharModal(modal));
    });

    modal.addEventListener('click', evento => {
      if (evento.target === modal) fecharModal(modal);
    });

    modal.querySelector('#formNovaDividaFiado').addEventListener(
      'submit',
      registrarCompraManual
    );

    return modal;
  }

  function registrarCompraManual(evento) {
    evento.preventDefault();

    const modal = $('modalNovaDividaFiado');
    const campoValor = $('fiadoValorDivida');
    const campoDescricao = $('fiadoDescricaoDivida');

    const valorCentavos = paraCentavos(campoValor.value);

    if (valorCentavos <= 0) {
      mostrarNotificacao('Informe um valor de compra válido.', true);
      campoValor.focus();
      return;
    }

    const cliente = buscarClienteInterno(clienteSelecionadoId);

    if (!cliente) {
      mostrarNotificacao('Selecione um cliente válido.', true);
      fecharModal(modal);
      return;
    }

    const descricao = campoDescricao.value.trim();

    const movimento = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos,
      valor: valorCentavos / 100,
      descricao: descricao || 'Compra fiado',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'manual'
    };

    cliente.movimentacoes.push(movimento);
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.pop();
      return;
    }

    fecharModal(modal);

    mostrarNotificacao(
      'Compra registrada: ' + formatarDinheiro(valorCentavos)
    );

    abrirDetalhes(cliente.id);
  }

  function adicionarDivida(id, valor, descricao = 'Compra fiado', dados = {}) {
    const cliente = buscarClienteInterno(id);

    if (!cliente) return false;

    const valorCentavos = paraCentavos(valor);

    if (valorCentavos <= 0) return false;

    const movimento = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos,
      valor: valorCentavos / 100,
      descricao: String(descricao || 'Compra fiado').trim(),
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: dados.origem || 'integracao',
      vendaId: dados.vendaId || null
    };

    cliente.movimentacoes.push(movimento);
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.pop();
      return false;
    }

    return true;
  }

  function abrirCompra() {
    if (!clienteSelecionadoId) {
      mostrarNotificacao('Selecione um cliente.', true);
      return;
    }

    const modal = criarModalCompra();

    const form = $('formNovaDividaFiado');

    if (form) form.reset();

    abrirModal(modal, $('fiadoValorDivida'));
  }

  /* ==========================================================
     7. PAGAMENTOS (Registrados exclusivamente no Histórico do Cliente)
  ========================================================== */

  function abrirPagamento() {
    const cliente = buscarClienteInterno(clienteSelecionadoId);

    if (!cliente) {
      mostrarNotificacao('Selecione um cliente.', true);
      return;
    }

    const saldo = obterSaldo(cliente);

    if (saldo <= 0) {
      mostrarNotificacao('Este cliente não possui saldo devedor.', true);
      return;
    }

    if (elementos.formPagamento) {
      elementos.formPagamento.reset();
    }

    abrirModal(elementos.modalPagamento, elementos.valorPagamento);
  }

  function registrarPagamento(evento) {
    evento.preventDefault();

    const cliente = buscarClienteInterno(clienteSelecionadoId);

    if (!cliente) {
      mostrarNotificacao('Cliente não encontrado.', true);
      return;
    }

    const valorCentavos = paraCentavos(elementos.valorPagamento.value);
    const saldoAtual = obterSaldo(cliente);

    if (valorCentavos <= 0) {
      mostrarNotificacao('Informe um valor válido.', true);
      elementos.valorPagamento.focus();
      return;
    }

    if (valorCentavos > saldoAtual) {
      mostrarNotificacao(
        'O pagamento não pode ser maior que a dívida atual (' +
        formatarDinheiro(saldoAtual) + ').',
        true
      );
      elementos.valorPagamento.focus();
      return;
    }

    const forma = elementos.formaPagamento.value;

    const formasPermitidas = ['dinheiro', 'pix', 'debito', 'credito'];

    if (!formasPermitidas.includes(forma)) {
      mostrarNotificacao('Selecione uma forma de pagamento válida.', true);
      return;
    }

    const observacao = elementos.observacaoPagamento.value.trim();

    const movimento = {
      id: gerarId(),
      tipo: 'pagamento',
      valorCentavos,
      valor: valorCentavos / 100,
      forma,
      observacao,
      descricao: 'Pagamento recebido',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'manual'
    };

    cliente.movimentacoes.push(movimento);
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.pop();
      return;
    }

    fecharPagamento();

    mostrarNotificacao(
      'Pagamento registrado: ' + formatarDinheiro(valorCentavos)
    );

    abrirDetalhes(cliente.id);
  }

  function registrarPagamentoAPI(id, valor, forma = 'dinheiro', observacao = '') {
    const cliente = buscarClienteInterno(id);

    if (!cliente) return false;

    const valorCentavos = paraCentavos(valor);

    if (valorCentavos <= 0 || valorCentavos > obterSaldo(cliente)) {
      return false;
    }

    if (!['dinheiro', 'pix', 'debito', 'credito'].includes(forma)) {
      return false;
    }

    const movimento = {
      id: gerarId(),
      tipo: 'pagamento',
      valorCentavos,
      valor: valorCentavos / 100,
      forma,
      observacao: String(observacao || ''),
      descricao: 'Pagamento recebido',
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'integracao'
    };

    cliente.movimentacoes.push(movimento);
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.pop();
      return false;
    }

    return true;
  }

  /* ==========================================================
     8. RESUMO GERAL
  ========================================================== */

  function atualizarResumoGeral() {
    const quantidade = clientes.length;

    const recebido = clientes.reduce(
      (total, cliente) => total + totalPago(cliente),
      0
    );

    const aberto = clientes.reduce(
      (total, cliente) => total + obterSaldo(cliente),
      0
    );

    if (elementos.totalClientes) {
      elementos.totalClientes.textContent = String(quantidade);
    }

    if (elementos.totalRecebido) {
      elementos.totalRecebido.textContent = formatarDinheiro(recebido);
    }

    if (elementos.totalAberto) {
      elementos.totalAberto.textContent = formatarDinheiro(aberto);
    }
  }

  /* ==========================================================
     9. LISTA DE CLIENTES E BUSCA
  ========================================================== */

  function renderizarClientes() {
    if (!elementos.lista) return;

    const busca = normalizarTexto(elementos.busca?.value || '');

    const filtrados = clientes
      .filter(cliente => {
        const nome = normalizarTexto(cliente.nome);
        const telefone = normalizarTexto(cliente.telefone);

        return nome.includes(busca) || telefone.includes(busca);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    if (elementos.contagem) {
      elementos.contagem.textContent =
        `${filtrados.length} ${filtrados.length === 1 ? 'cliente' : 'clientes'}`;
    }

    if (!filtrados.length) {
      const vazio = busca
        ? {
            icone: '🔎',
            titulo: 'Nenhum cliente encontrado',
            descricao: 'Tente buscar por outro nome ou telefone.'
          }
        : {
            icone: '👥',
            titulo: 'Nenhum cliente cadastrado',
            descricao: 'Toque em “Cadastrar cliente” para começar.'
          };

      elementos.lista.innerHTML = `
        <div class="fiado-vazio">
          <div aria-hidden="true">${vazio.icone}</div>
          <h3>${vazio.titulo}</h3>
          <p>${vazio.descricao}</p>
        </div>
      `;

      return;
    }

    elementos.lista.innerHTML = filtrados.map(cliente => {
      const saldo = obterSaldo(cliente);
      const telefone = cliente.telefone || 'Telefone não informado';

      return `
        <article class="fiado-cliente-card">
          <div class="fiado-cliente-info">
            <div class="fiado-avatar" aria-hidden="true">👤</div>

            <div class="fiado-cliente-texto">
              <h3>${escaparHTML(cliente.nome)}</h3>
              <p>${escaparHTML(telefone)}</p>
              <small>${obterMovimentacoes(cliente).length} movimentações</small>
            </div>
          </div>

          <div class="fiado-cliente-saldo">
            <span>Saldo devedor</span>
            <strong>${formatarDinheiro(saldo)}</strong>
          </div>

          <button type="button"
            class="fiado-btn fiado-btn-secundario"
            data-acao="detalhes"
            data-id="${escaparHTML(cliente.id)}">
            Ver detalhes
          </button>
        </article>
      `;
    }).join('');
  }

  /* ==========================================================
     10. DETALHES DO CLIENTE
  ========================================================== */

  function abrirDetalhes(id) {
    const cliente = buscarClienteInterno(id);

    if (!cliente) {
      mostrarNotificacao('Cliente não encontrado.', true);
      return;
    }

    clienteSelecionadoId = cliente.id;

    if (elementos.detalhesNome) {
      elementos.detalhesNome.textContent = cliente.nome;
    }

    if (elementos.detalhesTelefone) {
      elementos.detalhesTelefone.textContent =
        cliente.telefone || 'Telefone não informado';
    }

    if (elementos.mesReferencia && !elementos.mesReferencia.value) {
      elementos.mesReferencia.value = mesAtual();
    }

    renderizarDetalhes(cliente);

    abrirModal(elementos.modalDetalhes);
  }

  function renderizarDetalhes(cliente) {
    if (!cliente) return;

    const compras = totalComprado(cliente);
    const pago = totalPago(cliente);
    const saldo = obterSaldo(cliente);

    if (elementos.detalhesSaldo) {
      elementos.detalhesSaldo.textContent = formatarDinheiro(saldo);
    }

    if (elementos.detalhesCompras) {
      elementos.detalhesCompras.textContent = formatarDinheiro(compras);
    }

    if (elementos.detalhesPago) {
      elementos.detalhesPago.textContent = formatarDinheiro(pago);
    }

    renderizarResumoMensal(cliente);
    renderizarHistorico(cliente);
  }

  /* ==========================================================
     11. RESUMO MENSAL
     O saldo anterior é o resultado de todas as movimentações
     anteriores ao primeiro dia do mês selecionado.
     Não há juros.
  ========================================================== */

  function renderizarResumoMensal(cliente) {
    if (!elementos.resumoMensal) return;

    const mes = elementos.mesReferencia?.value || mesAtual();

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      elementos.resumoMensal.innerHTML = `
        <div class="fiado-vazio">
          <h3>Selecione um mês válido</h3>
        </div>
      `;
      return;
    }

    const movimentacoes = obterMovimentacoes(cliente);

    const anteriores = movimentacoes.filter(movimento => {
      const data = obterDataMovimento(movimento);
      return data && data.slice(0, 7) < mes;
    });

    const doMes = movimentacoes.filter(movimento => {
      const data = obterDataMovimento(movimento);
      return data && data.slice(0, 7) === mes;
    });

    const saldoAnterior = anteriores.reduce((saldo, movimento) => {
      const valor = valorMovimentoCentavos(movimento);
      const tipo = obterTipo(movimento);

      if (tipo === 'divida') return saldo + valor;
      if (tipo === 'pagamento') return saldo - valor;

      return saldo;
    }, 0);

    const comprasMes = doMes.reduce((total, movimento) => {
      return obterTipo(movimento) === 'divida'
        ? total + valorMovimentoCentavos(movimento)
        : total;
    }, 0);

    const pagamentosMes = doMes.reduce((total, movimento) => {
      return obterTipo(movimento) === 'pagamento'
        ? total + valorMovimentoCentavos(movimento)
        : total;
    }, 0);

    const saldoFinal = saldoAnterior + comprasMes - pagamentosMes;

    const itens = [
      {
        titulo: 'Saldo anterior',
        valor: saldoAnterior,
        classe: ''
      },
      {
        titulo: 'Compras do mês',
        valor: comprasMes,
        classe: ''
      },
      {
        titulo: 'Pagamentos do mês',
        valor: pagamentosMes,
        classe: ''
      },
      {
        titulo: 'Saldo final do mês',
        valor: saldoFinal,
        classe: 'final'
      }
    ];

    elementos.resumoMensal.innerHTML = itens.map(item => `
      <div class="fiado-mes-item ${item.classe}">
        <span>${item.titulo}</span>
        <strong>${formatarDinheiro(item.valor)}</strong>
      </div>
    `).join('');
  }

  /* ==========================================================
     12. HISTÓRICO DE MOVIMENTAÇÕES
  ========================================================== */

  function renderizarHistorico(cliente) {
    if (!elementos.historico) return;

    const movimentacoes = ordenarMovimentacoes(
      obterMovimentacoes(cliente)
    );

    if (!movimentacoes.length) {
      elementos.historico.innerHTML = `
        <div class="fiado-vazio">
          <div aria-hidden="true">📋</div>
          <h3>Nenhuma movimentação</h3>
          <p>As compras e os pagamentos aparecerão aqui.</p>
        </div>
      `;

      return;
    }

    let saldoAcumulado = 0;

    const cronologicas = [...movimentacoes].reverse();

    const saldosDepois = new Map();

    cronologicas.forEach(movimento => {
      const valor = valorMovimentoCentavos(movimento);
      const tipo = obterTipo(movimento);

      if (tipo === 'divida') saldoAcumulado += valor;
      if (tipo === 'pagamento') saldoAcumulado -= valor;

      saldosDepois.set(movimento.id, saldoAcumulado);
    });

    elementos.historico.innerHTML = movimentacoes.map(movimento => {
      const tipo = obterTipo(movimento);
      const valor = valorMovimentoCentavos(movimento);
      const data = obterDataMovimento(movimento);
      const hora = formatarHora(movimento.dataHora);

      const pagamento = tipo === 'pagamento';

      const titulo = pagamento
        ? 'Pagamento recebido'
        : 'Compra fiado';

      const classeValor = pagamento
        ? 'fiado-valor-pago'
        : 'fiado-valor-divida';

      const sinal = pagamento ? '− ' : '+ ';

      let detalhe = movimento.descricao || titulo;

      if (pagamento && movimento.forma) {
        const formas = {
          dinheiro: 'Dinheiro',
          pix: 'Pix',
          debito: 'Cartão de débito',
          credito: 'Cartão de crédito'
        };

        detalhe += ' · ' + (formas[movimento.forma] || movimento.forma);
      }

      if (pagamento && movimento.observacao) {
        detalhe += ' · ' + movimento.observacao;
      }

      const saldoApos = saldosDepois.get(movimento.id) ?? 0;

      return `
        <article class="fiado-movimento">
          <div class="fiado-movimento-info">
            <strong>${escaparHTML(titulo)}</strong>

            <small>
              ${escaparHTML(formatarData(data))}
              ${hora ? ' · ' + escaparHTML(hora) : ''}
            </small>

            <small>${escaparHTML(detalhe)}</small>

            <span class="fiado-saldo-apos">
              Saldo após movimentação:
              <strong>${formatarDinheiro(saldoApos)}</strong>
            </span>

            <div class="fiado-movimento-acoes">
              <button type="button"
                class="fiado-btn-mini"
                data-acao="excluir-movimento"
                data-id="${escaparHTML(cliente.id)}"
                data-movimento-id="${escaparHTML(movimento.id)}">
                Excluir lançamento
              </button>
            </div>
          </div>

          <div class="fiado-movimento-valor ${classeValor}">
            ${sinal}${formatarDinheiro(valor)}
          </div>
        </article>
      `;
    }).join('');
  }

  /* ==========================================================
     13. EXCLUIR UMA MOVIMENTAÇÃO
  ========================================================== */

  function excluirMovimentacao(clienteId, movimentoId) {
    const cliente = buscarClienteInterno(clienteId);

    if (!cliente) {
      mostrarNotificacao('Cliente não encontrado.', true);
      return;
    }

    const indice = obterMovimentacoes(cliente).findIndex(
      movimento => String(movimento.id) === String(movimentoId)
    );

    if (indice < 0) {
      mostrarNotificacao('Movimentação não encontrada.', true);
      return;
    }

    const movimento = cliente.movimentacoes[indice];
    const tipo = obterTipo(movimento);

    const descricao = tipo === 'pagamento'
      ? 'pagamento'
      : 'compra fiado';

    if (!confirmar(
      `Deseja excluir este lançamento de ${descricao}?\n\n` +
      'O saldo do cliente será recalculado.'
    )) {
      return;
    }

    const removido = cliente.movimentacoes.splice(indice, 1)[0];
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.splice(indice, 0, removido);
      return;
    }

    mostrarNotificacao('Lançamento excluído.');

    renderizarDetalhes(cliente);
  }

  /* ==========================================================
     14. EXTRATO PARA IMPRIMIR OU SALVAR COMO PDF
  ========================================================== */

  function gerarExtratoHTML(cliente, movimentacoes, tituloPeriodo) {
    const compras = movimentacoes.reduce((total, movimento) => {
      return obterTipo(movimento) === 'divida'
        ? total + valorMovimentoCentavos(movimento)
        : total;
    }, 0);

    const pagamentos = movimentacoes.reduce((total, movimento) => {
      return obterTipo(movimento) === 'pagamento'
        ? total + valorMovimentoCentavos(movimento)
        : total;
    }, 0);

    const saldo = compras - pagamentos;

    const linhas = ordenarMovimentacoes(movimentacoes).map(movimento => {
      const pagamento = obterTipo(movimento) === 'pagamento';
      const valor = valorMovimentoCentavos(movimento);

      let descricao = movimento.descricao ||
        (pagamento ? 'Pagamento recebido' : 'Compra fiado');

      if (pagamento && movimento.forma) {
        descricao += ' — ' + movimento.forma;
      }

      return `
        <tr>
          <td>${escaparHTML(formatarData(obterDataMovimento(movimento)))}</td>
          <td>${escaparHTML(descricao)}</td>
          <td>${pagamento ? formatarDinheiro(valor) : '—'}</td>
          <td>${pagamento ? '—' : formatarDinheiro(valor)}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Extrato Fiado — ${escaparHTML(cliente.nome)}</title>

        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 24px;
            color: #263640;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }
          header {
            padding-bottom: 16px;
            border-bottom: 2px solid #168b53;
          }
          h1 { margin: 0 0 7px; font-size: 23px; }
          h2 { margin: 0 0 8px; font-size: 15px; }
          p { margin: 4px 0; line-height: 1.5; }
          .resumo {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 9px;
            margin: 18px 0;
          }
          .item {
            padding: 12px;
            border: 1px solid #dce7e0;
            border-radius: 9px;
          }
          .item span {
            display: block;
            margin-bottom: 7px;
            color: #718078;
          }
          .item strong { font-size: 14px; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            padding: 9px 7px;
            border-bottom: 1px solid #e1eae5;
            text-align: left;
            vertical-align: top;
            overflow-wrap: anywhere;
          }
          th { background: #eaf8f1; }
          footer {
            margin-top: 22px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            color: #718078;
            font-size: 10px;
          }
          @media print {
            body { padding: 0; }
            .resumo { break-inside: avoid; }
            tr { break-inside: avoid; }
          }
          @media(max-width:480px) {
            body { padding: 12px; }
            .resumo { grid-template-columns: 1fr; }
            th, td { padding: 7px 4px; font-size: 10px; }
          }
        </style>
      </head>

      <body>
        <header>
          <h1>Dr. Troco — Extrato do Fiado</h1>
          <p><strong>Cliente:</strong> ${escaparHTML(cliente.nome)}</p>
          <p><strong>Telefone:</strong> ${escaparHTML(cliente.telefone || 'Não informado')}</p>
          <p><strong>Período:</strong> ${escaparHTML(tituloPeriodo)}</p>
          <p><strong>Emitido em:</strong> ${escaparHTML(formatarData(dataLocalISO()))}</p>
        </header>

        <section class="resumo">
          <div class="item">
            <span>Total comprado no período</span>
            <strong>${formatarDinheiro(compras)}</strong>
          </div>

          <div class="item">
            <span>Total pago no período</span>
            <strong>${formatarDinheiro(pagamentos)}</strong>
          </div>

          <div class="item">
            <span>Saldo líquido do período</span>
            <strong>${formatarDinheiro(saldo)}</strong>
          </div>
        </section>

        <h2>Movimentações</h2>

        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Pagamento</th>
              <th>Compra</th>
            </tr>
          </thead>
          <tbody>
            ${linhas || '<tr><td colspan="4">Nenhuma movimentação no período.</td></tr>'}
          </tbody>
        </table>

        <footer>
          Relatório gerado pelo Dr. Troco. Os valores são apresentados sem juros.
          O saldo líquido deste extrato considera apenas as movimentações incluídas
          no período selecionado.
        </footer>

        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.print();
            }, 350);
          });
        <\/script>
      </body>
      </html>
    `;
  }

  function exportarPDF() {
    const cliente = buscarClienteInterno(clienteSelecionadoId);

    if (!cliente) {
      mostrarNotificacao('Selecione um cliente.', true);
      return;
    }

    const periodo = elementos.periodoExtrato?.value || 'mes';

    let movimentacoes = obterMovimentacoes(cliente);
    let tituloPeriodo = 'Todo o histórico';

    if (periodo === 'mes') {
      const mes = elementos.mesReferencia?.value || mesAtual();

      movimentacoes = movimentacoes.filter(movimento => {
        const data = obterDataMovimento(movimento);
        return data && data.slice(0, 7) === mes;
      });

      tituloPeriodo = formatarMes(mes);
    }

    const html = gerarExtratoHTML(
      cliente,
      movimentacoes,
      tituloPeriodo
    );

    const janela = window.open('', '_blank');

    if (!janela) {
      mostrarNotificacao(
        'O navegador bloqueou a janela. Permita pop-ups para gerar o extrato.',
        true
      );
      return;
    }

    janela.document.open();
    janela.document.write(html);
    janela.document.close();
  }

  /* ==========================================================
     15. INTEGRAÇÃO COM A CALCULADORA E OUTROS MÓDULOS
  ========================================================== */

  function registrarVendaFiado(dados) {
    if (!dados || typeof dados !== 'object') {
      return { sucesso: false, erro: 'Dados da venda inválidos.' };
    }

    const idCliente =
      dados.clienteId ??
      dados.idCliente ??
      dados.cliente_id;

    const cliente = buscarClienteInterno(idCliente);

    if (!cliente) {
      return {
        sucesso: false,
        erro: 'Cliente do fiado não encontrado.'
      };
    }

    const valor = dados.valor ?? dados.total ?? dados.valorTotal;
    const valorCentavos = paraCentavos(valor);

    if (valorCentavos <= 0) {
      return {
        sucesso: false,
        erro: 'O valor da venda é inválido.'
      };
    }

    const descricao =
      dados.descricao ||
      dados.produtos ||
      dados.nomeProduto ||
      'Venda registrada pela calculadora';

    const movimento = {
      id: gerarId(),
      tipo: 'divida',
      valorCentavos,
      valor: valorCentavos / 100,
      descricao: String(descricao),
      data: dataLocalISO(),
      dataHora: agoraISO(),
      origem: 'calculadora',
      vendaId: dados.vendaId || dados.idVenda || null
    };

    cliente.movimentacoes.push(movimento);
    cliente.atualizadoEm = agoraISO();

    if (!salvarEAtualizar()) {
      cliente.movimentacoes.pop();

      return {
        sucesso: false,
        erro: 'Não foi possível salvar a venda fiado.'
      };
    }

    return {
      sucesso: true,
      clienteId: cliente.id,
      movimentoId: movimento.id,
      saldoDevedor: obterSaldo(cliente) / 100
    };
  }

  function listarClientes() {
    return clonar(clientes);
  }

  function buscarClienteAPI(id) {
    const cliente = buscarClienteInterno(id);

    return cliente ? clonar(cliente) : null;
  }

  function saldoDevedorAPI(id) {
    const cliente = buscarClienteInterno(id);

    return cliente ? obterSaldo(cliente) / 100 : null;
  }

  function listarClientesComSaldo() {
    return clientes.map(cliente => ({
      id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      saldoDevedor: obterSaldo(cliente) / 100
    }));
  }

  /* ==========================================================
     16. EVENTOS
  ========================================================== */

  if (elementos.formCadastro) {
    elementos.formCadastro.addEventListener('submit', salvarCliente);
  }

  if (elementos.busca) {
    elementos.busca.addEventListener('input', renderizarClientes);
  }

  if (elementos.lista) {
    elementos.lista.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-acao]');

      if (!botao) return;

      const acao = botao.dataset.acao;

      if (acao === 'detalhes') {
        abrirDetalhes(botao.dataset.id);
      }

      if (acao === 'excluir-movimento') {
        excluirMovimentacao(
          botao.dataset.id,
          botao.dataset.movimentoId
        );
      }
    });
  }

  if (elementos.historico) {
    elementos.historico.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-acao]');

      if (!botao) return;

      if (botao.dataset.acao === 'excluir-movimento') {
        excluirMovimentacao(
          botao.dataset.id,
          botao.dataset.movimentoId
        );
      }
    });
  }

  if (elementos.btnComprar) {
    elementos.btnComprar.addEventListener('click', abrirCompra);
  }

  if (elementos.btnPagamento) {
    elementos.btnPagamento.addEventListener('click', abrirPagamento);
  }

  if (elementos.formPagamento) {
    elementos.formPagamento.addEventListener('submit', registrarPagamento);
  }

  if (elementos.btnPDF) {
    elementos.btnPDF.addEventListener('click', exportarPDF);
  }

  if (elementos.btnExcluirCliente) {
    elementos.btnExcluirCliente.addEventListener('click', () => {
      if (clienteSelecionadoId) {
        excluirCliente(clienteSelecionadoId);
      }
    });
  }

  if (elementos.btnFecharDetalhes) {
    elementos.btnFecharDetalhes.addEventListener('click', fecharDetalhes);
  }

  if (elementos.btnFecharDetalhes2) {
    elementos.btnFecharDetalhes2.addEventListener('click', fecharDetalhes);
  }

  if (elementos.btnFecharPagamento) {
    elementos.btnFecharPagamento.addEventListener('click', fecharPagamento);
  }

  if (elementos.btnCancelarPagamento) {
    elementos.btnCancelarPagamento.addEventListener('click', fecharPagamento);
  }

  if (elementos.mesReferencia) {
    elementos.mesReferencia.addEventListener('change', () => {
      const cliente = buscarClienteInterno(clienteSelecionadoId);

      if (cliente) renderizarResumoMensal(cliente);
    });
  }

  /* ==========================================================
     17. API PÚBLICA DO MÓDULO
     Permite que outros arquivos consultem ou registrem
     movimentações sem manipular diretamente o localStorage.
  ========================================================== */

  window.DrTrocoFiado = {
    registrarVendaFiado,
    registrarPagamento: registrarPagamentoAPI,

    buscarCliente: buscarClienteAPI,
    listarClientes,
    listarClientesComSaldo,
    saldoDevedor: saldoDevedorAPI,

    atualizar: renderizarTudo,

    abrirDetalhes,
    abrirCadastro: () => abrirCadastroCliente(),

    // Conversão monetária para uso pelos demais módulos.
    paraCentavos,
    formatarDinheiro
  };

  /* ==========================================================
     18. ATUALIZAÇÃO GERAL
  ========================================================== */

  function renderizarTudo() {
    atualizarResumoGeral();
    renderizarClientes();

    const cliente = buscarClienteInterno(clienteSelecionadoId);

    if (cliente && elementos.modalDetalhes?.classList.contains('aberto')) {
      renderizerDetalhes(cliente);
    }
  }

  /* ==========================================================
     19. INICIALIZAÇÃO
  ========================================================== */

  function inicializar() {
    if (elementos.mesReferencia && !elementos.mesReferencia.value) {
      elementos.mesReferencia.value = mesAtual();
    }

    renderizarTudo();

    console.log('Dr. Troco — módulo Fiado inicializado.');
  }

  inicializar();

})();
