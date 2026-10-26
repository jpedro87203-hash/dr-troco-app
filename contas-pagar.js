/* =========================================================
   DR. TROCO — CONTAS A PAGAR
   Integração com o Fluxo de Caixa
   Arquivo: contas-pagar.js
   ========================================================= */

'use strict';

(() => {
  const CHAVE_CONTAS = 'drTroco_contasPagar';
  const CHAVE_MOVIMENTACOES = 'drTroco_movimentacoes';

  let filtroAtual = 'pendentes';

  // ---------------------------------------------------------
  // FUNÇÕES BÁSICAS
  // ---------------------------------------------------------

  function lerJSON(chave, padrao) {
    try {
      const dados = JSON.parse(localStorage.getItem(chave));
      return dados === null ? padrao : dados;
    } catch (erro) {
      console.error('Erro ao ler ' + chave, erro);
      return padrao;
    }
  }

  function obterContas() {
    const dados = lerJSON(CHAVE_CONTAS, []);
    return Array.isArray(dados) ? dados : [];
  }

  function salvarContas(contas) {
    localStorage.setItem(CHAVE_CONTAS, JSON.stringify(contas));
  }

  function obterMovimentacoes() {
    const dados = lerJSON(CHAVE_MOVIMENTACOES, []);
    return Array.isArray(dados) ? dados : [];
  }

  function salvarMovimentacoes(movimentacoes) {
    localStorage.setItem(
      CHAVE_MOVIMENTACOES,
      JSON.stringify(movimentacoes)
    );
  }

  function formatarReal(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function dataHojeISO() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
  }

  function dataHojeBR() {
    return new Date().toLocaleDateString('pt-BR');
  }

  function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatarData(dataISO) {
    if (!dataISO) return 'Sem vencimento';

    const partes = dataISO.split('-');

    if (partes.length !== 3) return dataISO;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[caractere]);
  }

  function gerarId() {
    return 'cp-' + Date.now() + '-' +
      Math.random().toString(36).slice(2, 9);
  }

  // ---------------------------------------------------------
  // ESTILOS DA SEÇÃO
  // Não altera o arquivo style.css existente.
  // ---------------------------------------------------------

  function adicionarEstilos() {
    if (document.getElementById('estilosContasPagar')) return;

    const estilo = document.createElement('style');
    estilo.id = 'estilosContasPagar';

    estilo.textContent = `
      .cp-secao {
        margin: 20px 0;
        padding: 18px;
        border-radius: 18px;
        background: var(--card-bg, #fff);
        color: var(--text-color, #203126);
        border: 1px solid #e2eee6;
        box-shadow: 0 4px 16px rgba(20, 80, 45, .07);
      }

      /* Cabeçalho que abre e fecha a seção */
      .cp-cabecalho {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .cp-cabecalho-toggle {
        width: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        text-align: left;
        font: inherit;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      .cp-cabecalho-toggle:focus-visible {
        outline: 2px solid #168b53;
        outline-offset: 5px;
        border-radius: 8px;
      }

      .cp-titulo-cabecalho {
        flex: 1;
        min-width: 0;
      }

      .cp-seta {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        background: #e7f7ed;
        color: #168b53;
        font-size: 23px;
        line-height: 1;
        transition: transform .2s ease;
      }

      .cp-cabecalho-toggle[aria-expanded="true"] .cp-seta {
        transform: rotate(180deg);
      }

      /* Garante que a seção fechada realmente fique oculta */
      #conteudoContasPagar[hidden] {
        display: none !important;
      }

      .cp-icone {
        width: 46px;
        height: 46px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: #e7f7ed;
        font-size: 24px;
        flex-shrink: 0;
      }

      .cp-cabecalho h2 {
        margin: 0;
        font-size: 19px;
      }

      .cp-cabecalho p {
        margin: 5px 0 0;
        font-size: 12px;
        opacity: .72;
      }

      .cp-resumos {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 18px;
      }

      .cp-resumo {
        padding: 12px 8px;
        border-radius: 12px;
        background: #f2f8f4;
        min-width: 0;
      }

      .cp-resumo span {
        display: block;
        font-size: 11px;
        margin-bottom: 7px;
        color: #52685a;
      }

      .cp-resumo strong {
        display: block;
        font-size: 14px;
        overflow-wrap: anywhere;
        color: #176b3a;
      }

      .cp-form {
        display: grid;
        gap: 12px;
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #e4eee7;
        border-radius: 14px;
      }

      .cp-form h3 {
        margin: 0;
        font-size: 16px;
      }

      .cp-campo {
        display: grid;
        gap: 6px;
      }

      .cp-campo label {
        font-size: 13px;
        font-weight: 600;
      }

      .cp-campo input,
      .cp-campo select {
        box-sizing: border-box;
        width: 100%;
        min-height: 44px;
        padding: 10px 12px;
        border: 1px solid #d6e3d9;
        border-radius: 10px;
        background: #fff;
        color: #203126;
        font: inherit;
        font-size: 14px;
      }

      .cp-btn {
        border: 0;
        border-radius: 10px;
        min-height: 42px;
        padding: 10px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .cp-btn-principal {
        background: #168b53;
        color: white;
      }

      .cp-btn-pagar {
        background: #168b53;
        color: white;
        flex: 1;
      }

      .cp-btn-excluir {
        background: #fff0f0;
        color: #b42318;
      }

      .cp-filtros {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
      }

      .cp-filtro {
        flex: 1;
        padding: 10px 6px;
        border: 1px solid #dce8df;
        border-radius: 10px;
        background: #f5f8f6;
        color: #355340;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }

      .cp-filtro.ativo {
        background: #168b53;
        color: white;
        border-color: #168b53;
      }

      .cp-lista {
        display: grid;
        gap: 10px;
      }

      .cp-conta {
        padding: 14px;
        border: 1px solid #e3ece5;
        border-radius: 13px;
        background: #fff;
        color: #203126;
      }

      .cp-conta-topo {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      .cp-conta-nome {
        margin: 0;
        font-size: 15px;
        overflow-wrap: anywhere;
      }

      .cp-conta-valor {
        font-size: 15px;
        font-weight: 800;
        color: #176b3a;
        white-space: nowrap;
      }

      .cp-detalhes {
        display: flex;
        flex-wrap: wrap;
        gap: 7px 12px;
        margin-top: 10px;
        font-size: 12px;
        color: #607166;
      }

      .cp-status {
        display: inline-block;
        margin-top: 10px;
        padding: 5px 8px;
        border-radius: 20px;
        background: #e8f6ed;
        color: #176b3a;
        font-size: 11px;
        font-weight: 700;
      }

      .cp-status.atrasada {
        background: #fff0e8;
        color: #a33a0b;
      }

      .cp-acoes {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .cp-acoes .cp-btn {
        flex: 1;
      }

      .cp-vazio {
        padding: 22px 12px;
        text-align: center;
        border: 1px dashed #d6e3d9;
        border-radius: 12px;
        color: #718076;
        font-size: 13px;
      }

      .cp-nota {
        margin: 14px 0 0;
        font-size: 11px;
        line-height: 1.5;
        color: #718076;
      }

      @media (max-width: 360px) {
        .cp-secao {
          padding: 12px;
        }

        .cp-resumos {
          gap: 5px;
        }

        .cp-resumo {
          padding: 9px 5px;
        }

        .cp-resumo strong {
          font-size: 12px;
        }

        .cp-conta-topo {
          flex-direction: column;
        }

        .cp-cabecalho h2 {
          font-size: 17px;
        }
      }
    `;

    document.head.appendChild(estilo);
  }

  // ---------------------------------------------------------
  // CRIAR A INTERFACE DENTRO DO FLUXO DE CAIXA
  // A seção começa fechada.
  // ---------------------------------------------------------

  function criarInterface() {
    if (document.getElementById('secaoContasPagar')) return;

    const principal = document.querySelector('main');

    if (!principal) {
      console.error(
        'Dr. Troco: não foi encontrado o elemento <main> em fluxo.html.'
      );
      return;
    }

    const secao = document.createElement('section');
    secao.id = 'secaoContasPagar';
    secao.className = 'cp-secao';

    secao.innerHTML = `
      <button
        type="button"
        class="cp-cabecalho cp-cabecalho-toggle"
        id="btnToggleContasPagar"
        aria-expanded="false"
        aria-controls="conteudoContasPagar"
      >
        <span class="cp-icone" aria-hidden="true">🧾</span>

        <span class="cp-titulo-cabecalho">
          <h2>Contas a pagar</h2>
          <p>Organize vencimentos e registre pagamentos no caixa.</p>
        </span>

        <span class="cp-seta" aria-hidden="true">⌄</span>
      </button>

      <div id="conteudoContasPagar" hidden>
        <div class="cp-resumos">
          <div class="cp-resumo">
            <span>Pendentes</span>
            <strong id="cpTotalPendentes">R$ 0,00</strong>
          </div>

          <div class="cp-resumo">
            <span>Atrasadas</span>
            <strong id="cpTotalAtrasadas">R$ 0,00</strong>
          </div>

          <div class="cp-resumo">
            <span>Pagas hoje</span>
            <strong id="cpTotalPagas">R$ 0,00</strong>
          </div>
        </div>

        <form id="cpFormConta" class="cp-form">
          <h3>＋ Cadastrar conta</h3>

          <div class="cp-campo">
            <label for="cpDescricao">Descrição da conta</label>
            <input
              id="cpDescricao"
              name="descricao"
              type="text"
              maxlength="100"
              placeholder="Ex.: fornecedor, energia, aluguel"
              required
            >
          </div>

          <div class="cp-campo">
            <label for="cpValor">Valor (R$)</label>
            <input
              id="cpValor"
              name="valor"
              type="number"
              min="0.01"
              step="0.01"
              inputmode="decimal"
              placeholder="0,00"
              required
            >
          </div>

          <div class="cp-campo">
            <label for="cpVencimento">Data de vencimento</label>
            <input
              id="cpVencimento"
              name="vencimento"
              type="date"
              required
            >
          </div>

          <button class="cp-btn cp-btn-principal" type="submit">
            Salvar conta
          </button>
        </form>

        <div class="cp-filtros">
          <button
            type="button"
            class="cp-filtro ativo"
            data-filtro="pendentes"
          >Pendentes</button>

          <button
            type="button"
            class="cp-filtro"
            data-filtro="pagas"
          >Pagas</button>

          <button
            type="button"
            class="cp-filtro"
            data-filtro="todas"
          >Todas</button>
        </div>

        <div id="cpListaContas" class="cp-lista"></div>

        <p class="cp-nota">
          Uma conta só entra nas saídas do Fluxo de Caixa quando seu
          pagamento é confirmado. Confira o valor e a forma de pagamento
          antes de confirmar.
        </p>
      </div>
    `;

    principal.appendChild(secao);

    // Define a data inicial do formulário.
    document.getElementById('cpVencimento').value = dataHojeISO();

    // Cadastro de contas.
    document.getElementById('cpFormConta')
      .addEventListener('submit', cadastrarConta);

    // Clique no cabeçalho, filtros e botões das contas.
    secao.addEventListener('click', tratarClique);

    // Renderiza os dados mesmo com a seção fechada.
    renderizar();
  }

  // ---------------------------------------------------------
  // CADASTRAR CONTA
  // ---------------------------------------------------------

  function cadastrarConta(evento) {
    evento.preventDefault();

    const descricao = document.getElementById('cpDescricao')
      .value.trim();

    const valor = Number(
      document.getElementById('cpValor').value
    );

    const vencimento = document.getElementById('cpVencimento').value;

    if (!descricao) {
      alert('Informe a descrição da conta.');
      return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      alert('Informe um valor válido maior que zero.');
      return;
    }

    if (!vencimento) {
      alert('Informe a data de vencimento.');
      return;
    }

    const contas = obterContas();

    contas.push({
      id: gerarId(),
      descricao,
      valor: Math.round(valor * 100) / 100,
      vencimento,
      criadaEm: dataHojeISO(),
      paga: false,
      dataPagamento: null,
      formaPagamento: null,
      movimentoId: null
    });

    salvarContas(contas);

    document.getElementById('cpFormConta').reset();
    document.getElementById('cpVencimento').value = dataHojeISO();

    renderizar();

    alert('Conta cadastrada com sucesso!');
  }

  // ---------------------------------------------------------
  // PAGAR CONTA
  // ---------------------------------------------------------

  function pagarConta(id) {
    let contas = obterContas();
    const conta = contas.find(item => item.id === id);

    if (!conta) {
      alert('Conta não encontrada.');
      return;
    }

    if (conta.paga) {
      alert('Esta conta já foi paga.');
      return;
    }

    const forma = document.getElementById('cpMetodo-' + id);

    if (!forma) return;

    const formaPagamento = forma.value;

    const nomeForma = {
      dinheiro: 'Dinheiro',
      pix: 'Pix',
      debito: 'Débito',
      credito: 'Crédito'
    };

    const confirmar = confirm(
      'Confirmar pagamento?\n\n' +
      conta.descricao + '\n' +
      formatarReal(conta.valor) + '\n' +
      'Forma: ' + (nomeForma[formaPagamento] || formaPagamento) + '\n\n' +
      'Será registrada uma saída no Fluxo de Caixa.'
    );

    if (!confirmar) return;

    // Recarrega os dados antes de gravar para reduzir o risco
    // de pagar duas vezes a mesma conta.
    contas = obterContas();

    const contaAtual = contas.find(item => item.id === id);

    if (!contaAtual || contaAtual.paga) {
      alert('Esta conta já foi paga ou não está mais disponível.');
      renderizar();
      return;
    }

    const movimentacoes = obterMovimentacoes();

    const movimentoId = 'conta-pagar-' + contaAtual.id;

    // Proteção contra duplicidade do lançamento vinculado.
    const movimentoExistente = movimentacoes.some(
      movimento => String(movimento.id) === movimentoId
    );

    if (!movimentoExistente) {
      movimentacoes.push({
        id: movimentoId,
        tipo: 'saida',
        descricao: 'Conta a pagar: ' + contaAtual.descricao,
        valor: contaAtual.valor,
        formaPagamento,
        data: dataHojeBR(),
        dataChave: dataHojeISO(),
        hora: horaAtual(),
        origem: 'contas_pagar',
        contaPagarId: contaAtual.id
      });

      salvarMovimentacoes(movimentacoes);
    }

    // A conta é marcada como paga e guarda o ID da saída.
    contaAtual.paga = true;
    contaAtual.dataPagamento = dataHojeISO();
    contaAtual.formaPagamento = formaPagamento;
    contaAtual.movimentoId = movimentoId;

    salvarContas(contas);

    // Atualiza os cartões e a lista do Fluxo de Caixa existente.
    if (typeof window.carregarFluxo === 'function') {
      window.carregarFluxo();
    }

    renderizar();

    alert('Pagamento registrado com sucesso!');
  }

  // ---------------------------------------------------------
  // EXCLUIR CONTA PENDENTE
  // ---------------------------------------------------------

  function excluirConta(id) {
    const contas = obterContas();
    const conta = contas.find(item => item.id === id);

    if (!conta) return;

    if (conta.paga) {
      alert(
        'Esta conta já foi paga. Não é possível excluí-la por aqui.'
      );
      return;
    }

    if (!confirm(
      'Excluir a conta "' + conta.descricao + '"?'
    )) {
      return;
    }

    salvarContas(contas.filter(item => item.id !== id));
    renderizar();
  }

  // ---------------------------------------------------------
  // ABRIR/FECHAR, FILTROS E AÇÕES
  // ---------------------------------------------------------

  function tratarClique(evento) {
    // Abrir ou fechar a seção Contas a pagar.
    const botaoToggle = evento.target.closest('#btnToggleContasPagar');

    if (botaoToggle) {
      const conteudo = document.getElementById('conteudoContasPagar');

      if (!conteudo) return;

      const estaAberto =
        botaoToggle.getAttribute('aria-expanded') === 'true';

      botaoToggle.setAttribute(
        'aria-expanded',
        String(!estaAberto)
      );

      conteudo.hidden = estaAberto;

      return;
    }

    // Filtros: pendentes, pagas e todas.
    const botaoFiltro = evento.target.closest('[data-filtro]');

    if (botaoFiltro) {
      filtroAtual = botaoFiltro.dataset.filtro;

      document.querySelectorAll('.cp-filtro').forEach(botao => {
        botao.classList.toggle(
          'ativo',
          botao.dataset.filtro === filtroAtual
        );
      });

      renderizar();
      return;
    }

    // Confirmar pagamento.
    const botaoPagar = evento.target.closest('[data-cp-pagar]');

    if (botaoPagar) {
      pagarConta(botaoPagar.dataset.cpPagar);
      return;
    }

    // Excluir conta pendente.
    const botaoExcluir = evento.target.closest('[data-cp-excluir]');

    if (botaoExcluir) {
      excluirConta(botaoExcluir.dataset.cpExcluir);
    }
  }

  // ---------------------------------------------------------
  // RESUMOS E LISTAGEM
  // ---------------------------------------------------------

  function renderizar() {
    const lista = document.getElementById('cpListaContas');

    if (!lista) return;

    const contas = obterContas();
    const hoje = dataHojeISO();

    const pendentes = contas.filter(conta => !conta.paga);

    const atrasadas = pendentes.filter(
      conta => conta.vencimento && conta.vencimento < hoje
    );

    const pagasHoje = contas.filter(
      conta => conta.paga && conta.dataPagamento === hoje
    );

    document.getElementById('cpTotalPendentes').textContent =
      formatarReal(
        pendentes.reduce((total, conta) => total + conta.valor, 0)
      );

    document.getElementById('cpTotalAtrasadas').textContent =
      formatarReal(
        atrasadas.reduce((total, conta) => total + conta.valor, 0)
      );

    document.getElementById('cpTotalPagas').textContent =
      formatarReal(
        pagasHoje.reduce((total, conta) => total + conta.valor, 0)
      );

    let exibidas = contas;

    if (filtroAtual === 'pendentes') {
      exibidas = contas.filter(conta => !conta.paga);
    } else if (filtroAtual === 'pagas') {
      exibidas = contas.filter(conta => conta.paga);
    }

    exibidas.sort((a, b) => {
      if (a.paga !== b.paga) return a.paga ? 1 : -1;

      return String(a.vencimento || '')
        .localeCompare(String(b.vencimento || ''));
    });

    if (exibidas.length === 0) {
      const mensagens = {
        pendentes: 'Nenhuma conta pendente cadastrada.',
        pagas: 'Nenhuma conta paga ainda.',
        todas: 'Nenhuma conta cadastrada.'
      };

      lista.innerHTML = `
        <div class="cp-vazio">
          <div style="font-size:25px;margin-bottom:8px">🧾</div>
          ${mensagens[filtroAtual] || mensagens.pendentes}
        </div>
      `;

      return;
    }

    lista.innerHTML = exibidas.map(conta => {
      const atrasada =
        !conta.paga &&
        conta.vencimento &&
        conta.vencimento < hoje;

      let status = 'Pendente';

      if (conta.paga) {
        status = 'Paga';
      } else if (atrasada) {
        status = 'Vencida';
      }

      const statusClasse = atrasada ? ' atrasada' : '';

      const pagamento = conta.paga
        ? `
          <div class="cp-detalhes">
            <span>
              Pagamento:
              ${escaparHTML(formatarData(conta.dataPagamento))}
            </span>

            <span>
              Forma:
              ${escaparHTML(
                conta.formaPagamento || 'Não informada'
              )}
            </span>
          </div>
        `
        : '';

      const idSeguro = escaparHTML(conta.id);

      const acoes = conta.paga
        ? ''
        : `
          <div class="cp-campo" style="margin-top:12px">
            <label for="cpMetodo-${idSeguro}">
              Forma de pagamento
            </label>

            <select id="cpMetodo-${idSeguro}">
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
          </div>

          <div class="cp-acoes">
            <button
              type="button"
              class="cp-btn cp-btn-pagar"
              data-cp-pagar="${idSeguro}"
            >✓ Confirmar pagamento</button>

            <button
              type="button"
              class="cp-btn cp-btn-excluir"
              data-cp-excluir="${idSeguro}"
            >Excluir</button>
          </div>
        `;

      return `
        <article class="cp-conta">
          <div class="cp-conta-topo">
            <h3 class="cp-conta-nome">
              ${escaparHTML(conta.descricao)}
            </h3>

            <strong class="cp-conta-valor">
              ${formatarReal(conta.valor)}
            </strong>
          </div>

          <div class="cp-detalhes">
            <span>
              Vencimento:
              ${escaparHTML(formatarData(conta.vencimento))}
            </span>
          </div>

          <span class="cp-status${statusClasse}">
            ${status}
          </span>

          ${pagamento}
          ${acoes}
        </article>
      `;
    }).join('');
  }

  // ---------------------------------------------------------
  // INICIALIZAÇÃO
  // ---------------------------------------------------------

  function iniciar() {
    adicionarEstilos();
    criarInterface();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
