// ============================================================
// DR. TROCO — CALCULADORA DE VENDAS + PDV + FIADO
// ============================================================

'use strict';

let formaPagamento = 'dinheiro';

const CHAVE_VENDAS = 'drTroco_vendas';
const CHAVE_ESTOQUE = 'drTroco_estoque';
const CHAVE_MOVIMENTACOES = 'drTroco_movimentacoes';

let produtosVenda = [];
let streamLeitorVenda = null;
let detectorLeitorVenda = null;
let lendoCodigoVenda = false;
let frameLeituraVenda = null;
let abrindoLeitorVenda = false;
let codigoUltimoLidoVenda = '';
let tempoUltimoCodigoVenda = 0;
let audioContextVenda = null;
let modalProdutosEstavaAbertoAntesLeitor = false;
let eventosConfigurados = false;
let vendaEmProcessamento = false;

// Elementos principais
const valorContaInput = document.getElementById('valorConta');
const valorRecebidoInput = document.getElementById('valorRecebido');
const totalCobrar = document.getElementById('totalCobrar');
const quantidadeItensVenda = document.getElementById('quantidadeItensVenda');
const valorTroco = document.getElementById('valorTroco');
const rowTroco = document.getElementById('rowTroco');
const groupRecebido = document.getElementById('groupRecebido');
const btnLimparVenda = document.getElementById('btnLimparVenda');
const btnRegistrarVenda = document.getElementById('btnRegistrarVenda');
const btnCancelarVenda = document.getElementById('btnCancelarVenda');
const btnAdicionarProduto = document.getElementById('btnAdicionarProduto');
const listaProdutosVenda = document.getElementById('listaProdutosVenda');
const produtosVendaVazio = document.getElementById('produtosVendaVazio');
const secaoCedulas = document.getElementById('secaoCedulas');
const listaCedulas = document.getElementById('listaCedulas');

// Campos do fiado
const groupFiado = document.getElementById('groupFiado');
const nomeClienteFiado = document.getElementById('nomeClienteFiado');
const valorPagoInicialFiado = document.getElementById('valorPagoInicialFiado');
const formaPagamentoInicialFiado = document.getElementById('formaPagamentoInicialFiado');
const rowSaldoDevedorFiado = document.getElementById('rowSaldoDevedorFiado');
const saldoDevedorVenda = document.getElementById('saldoDevedorVenda');

// Modal de produtos
const modalProdutosVenda = document.getElementById('modalProdutosVenda');
const btnFecharProdutosVenda = document.getElementById('btnFecharProdutosVenda');
const btnConcluirProdutosVenda = document.getElementById('btnConcluirProdutosVenda');
const btnAbrirLeitorVenda = document.getElementById('btnAbrirLeitorVenda');
const buscaProdutoVenda = document.getElementById('buscaProdutoVenda');
const listaProdutosEstoqueVenda = document.getElementById('listaProdutosEstoqueVenda');

// Modal do leitor
const modalLeitorVenda = document.getElementById('modalLeitorVenda');
const btnFecharLeitorVenda = document.getElementById('btnFecharLeitorVenda');
const btnFecharLeitorVenda2 = document.getElementById('btnFecharLeitorVenda2');
const areaLeitorVenda = document.getElementById('areaLeitorVenda');
const videoLeitorVenda = document.getElementById('videoLeitorVenda');
const molduraLeitorVenda = document.getElementById('molduraLeitorVenda');
const mensagemLeitorVenda = document.getElementById('mensagemLeitorVenda');
const statusLeitorVenda = document.getElementById('statusLeitorVenda');

// Modal de confirmação
const modalConfirmarVenda = document.getElementById('modalConfirmarVenda');
const resumoConfirmacaoVenda = document.getElementById('resumoConfirmacaoVenda');
const btnFecharConfirmacao = document.getElementById('btnFecharConfirmacao');
const btnCancelarConfirmacao = document.getElementById('btnCancelarConfirmacao');
const btnConfirmarVenda = document.getElementById('btnConfirmarVenda');

// ------------------------------------------------------------
// Funções básicas
// ------------------------------------------------------------
function numeroSeguro(valor) {
    const numero = typeof valor === 'number'
        ? valor
        : parseFloat(String(valor ?? '').replace(',', '.'));

    return Number.isFinite(numero) ? Math.max(0, numero) : 0;
}

function centavos(valor) {
    return Math.round((Number(valor) || 0) * 100);
}

function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatarReal(valor) {
    const numero = Number.isFinite(Number(valor)) ? Number(valor) : 0;

    return numero.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function escaparHTML(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escaparAtributo(texto) {
    return escaparHTML(texto);
}

function mostrarElemento(elemento, mostrar, display = 'block') {
    if (!elemento) return;

    elemento.classList.toggle('hidden', !mostrar);
    elemento.style.setProperty(
        'display',
        mostrar ? display : 'none',
        'important'
    );
}

// ------------------------------------------------------------
// CONTROLE DOS MODAIS
// Corrige problemas de corte, sobreposição e visibilidade.
// ------------------------------------------------------------
function abrirModalOverlay(modal, camada = 9999) {
    if (!modal) {
        console.error('Não foi possível abrir o modal: elemento inexistente.');
        return false;
    }

    // Evita que o modal seja cortado por outro container da página.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    modal.classList.add('aberto');
    modal.setAttribute('aria-hidden', 'false');

    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('inset', '0', 'important');
    modal.style.setProperty('width', '100%', 'important');
    modal.style.setProperty('height', '100%', 'important');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', String(camada), 'important');

    document.body.classList.add('modal-aberto');
    document.body.style.overflow = 'hidden';

    return true;
}

function fecharModalOverlay(modal) {
    if (!modal) return;

    modal.classList.remove('aberto');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.setProperty('display', 'none', 'important');

    verificarModaisAbertos();
}

// ------------------------------------------------------------
// LocalStorage
// ------------------------------------------------------------
function lerListaLocalStorage(chave) {
    try {
        const valor = localStorage.getItem(chave);

        if (!valor) return [];

        const dados = JSON.parse(valor);
        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        console.error(`Erro ao ler ${chave}:`, erro);
        return [];
    }
}

function salvarListaLocalStorage(chave, dados) {
    try {
        localStorage.setItem(chave, JSON.stringify(dados));
        return true;
    } catch (erro) {
        console.error(`Erro ao salvar ${chave}:`, erro);
        return false;
    }
}

function obterEstoque() {
    return lerListaLocalStorage(CHAVE_ESTOQUE);
}

function salvarEstoque(estoque) {
    return salvarListaLocalStorage(CHAVE_ESTOQUE, estoque);
}

// ------------------------------------------------------------
// Data e hora
// ------------------------------------------------------------
function obterDataHoraAtual() {
    const agora = new Date();

    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();

    const hora = String(agora.getHours()).padStart(2, '0');
    const minuto = String(agora.getMinutes()).padStart(2, '0');
    const segundo = String(agora.getSeconds()).padStart(2, '0');

    return {
        data: `${dia}/${mes}/${ano}`,
        dataChave: `${ano}-${mes}-${dia}`,
        hora: `${hora}:${minuto}:${segundo}`
    };
}

function nomeFormaPagamento(metodo) {
    const nomes = {
        dinheiro: 'Dinheiro',
        pix: 'Pix',
        debito: 'Débito',
        credito: 'Crédito',
        fiado: 'Fiado'
    };

    return nomes[String(metodo || '').toLowerCase()] || 'Dinheiro';
}

function corrigirCamposRecebido() {
    const secaoValorConta = valorContaInput?.closest('.valor-avulso');

    if (secaoValorConta) {
        mostrarElemento(secaoValorConta, true, 'block');
    }

    if (valorContaInput) {
        valorContaInput.disabled = false;
    }
}

// ------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------
function iniciarCalculadora() {
    if (!totalCobrar) {
        console.error(
            'O elemento totalCobrar não foi encontrado. Confira o calculadora.html.'
        );
        return;
    }

    fecharConfirmacao();
    fecharModalProdutos();
    fecharLeitorVenda(false);

    configurarEventos();
    corrigirCamposRecebido();

    formaPagamento = 'dinheiro';

    atualizarBotoesPagamento();
    renderizarProdutosVenda();
    atualizarTela();
}

// ------------------------------------------------------------
// Eventos
// ------------------------------------------------------------
function configurarEventos() {
    if (eventosConfigurados) return;

    eventosConfigurados = true;

    valorContaInput?.addEventListener('input', atualizarTela);
    valorRecebidoInput?.addEventListener('input', atualizarTela);
    nomeClienteFiado?.addEventListener('input', atualizarTela);
    valorPagoInicialFiado?.addEventListener('input', atualizarTela);
    formaPagamentoInicialFiado?.addEventListener('change', atualizarTela);

    document.querySelectorAll('.btn-payment').forEach(botao => {
        botao.addEventListener('click', event => {
            event.preventDefault();

            const metodo = String(botao.dataset.method || '').toLowerCase();

            if (![
                'dinheiro',
                'pix',
                'debito',
                'credito',
                'fiado'
            ].includes(metodo)) {
                return;
            }

            formaPagamento = metodo;

            atualizarBotoesPagamento();
            atualizarTela();
        });
    });

    btnAdicionarProduto?.addEventListener('click', event => {
        event.preventDefault();
        abrirModalProdutos();
    });

    btnFecharProdutosVenda?.addEventListener(
        'click',
        fecharModalProdutos
    );

    btnConcluirProdutosVenda?.addEventListener(
        'click',
        fecharModalProdutos
    );

    btnAbrirLeitorVenda?.addEventListener(
        'click',
        abrirLeitorVenda
    );

    btnFecharLeitorVenda?.addEventListener(
        'click',
        () => fecharLeitorVenda(true)
    );

    btnFecharLeitorVenda2?.addEventListener(
        'click',
        () => fecharLeitorVenda(true)
    );

    buscaProdutoVenda?.addEventListener('input', function () {
        renderizarProdutosEstoqueVenda(this.value);
    });

    listaProdutosEstoqueVenda?.addEventListener('click', event => {
        const botao = event.target.closest('[data-acao-produto]');
        if (!botao) return;

        event.preventDefault();
        event.stopPropagation();

        const id = botao.dataset.produtoEstoqueId;
        const acao = botao.dataset.acaoProduto;

        if (acao === 'adicionar') adicionarProdutoVenda(id);
        if (acao === 'diminuir') diminuirProdutoModal(id);
    });

    btnLimparVenda?.addEventListener('click', limparVenda);
    btnRegistrarVenda?.addEventListener('click', abrirConfirmacaoVenda);
    btnCancelarVenda?.addEventListener('click', limparVenda);
    btnFecharConfirmacao?.addEventListener('click', fecharConfirmacao);
    btnCancelarConfirmacao?.addEventListener('click', fecharConfirmacao);
    btnConfirmarVenda?.addEventListener('click', confirmarVenda);

    modalProdutosVenda?.addEventListener('click', event => {
        if (event.target === modalProdutosVenda) {
            fecharModalProdutos();
        }
    });

    modalLeitorVenda?.addEventListener('click', event => {
        if (event.target === modalLeitorVenda) {
            fecharLeitorVenda(true);
        }
    });

    modalConfirmarVenda?.addEventListener('click', event => {
        if (event.target === modalConfirmarVenda) {
            fecharConfirmacao();
        }
    });

    listaProdutosVenda?.addEventListener('click', event => {
        const botao = event.target.closest('[data-acao]');
        if (!botao) return;

        const id = botao.dataset.id;

        if (id) {
            alterarQuantidadeProduto(id, botao.dataset.acao);
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;

        if (modalLeitorVenda?.classList.contains('aberto')) {
            fecharLeitorVenda(true);
            return;
        }

        if (modalConfirmarVenda?.classList.contains('aberto')) {
            fecharConfirmacao();
            return;
        }

        if (modalProdutosVenda?.classList.contains('aberto')) {
            fecharModalProdutos();
        }
    });
}
// ------------------------------------------------------------
// Botões e resumo visual de pagamento
// ------------------------------------------------------------
function atualizarBotoesPagamento() {
    document.querySelectorAll('.btn-payment').forEach(botao => {
        const selecionado =
            String(botao.dataset.method || '').toLowerCase() === formaPagamento;

        botao.classList.toggle('ativo', selecionado);
        botao.classList.toggle('selected', selecionado);
        botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');
        botao.setAttribute('aria-selected', selecionado ? 'true' : 'false');

        botao.style.setProperty(
            'background-color',
            selecionado ? '#20a66a' : '#ffffff',
            'important'
        );
        botao.style.setProperty(
            'color',
            selecionado ? '#ffffff' : '#5f6972',
            'important'
        );
        botao.style.setProperty(
            'border-color',
            selecionado ? '#20a66a' : '#dfe4e7',
            'important'
        );
        botao.style.setProperty(
            'box-shadow',
            selecionado ? '0 6px 15px rgba(32,166,106,0.25)' : 'none',
            'important'
        );
    });
}

function calcularTotaisProdutos() {
    return produtosVenda.reduce((soma, produto) => {
        return soma + centavos(
            numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade)
        );
    }, 0) / 100;
}

function obterTotalVenda() {
    return calcularTotaisProdutos() + numeroSeguro(valorContaInput?.value);
}

function obterResumoFiado(total) {
    const pago = numeroSeguro(valorPagoInicialFiado?.value);

    return {
        pago,
        saldo: Math.max(0, Math.round((total - pago) * 100) / 100)
    };
}

function atualizarTela() {
    const totalProdutos = calcularTotaisProdutos();
    const valorAvulso = numeroSeguro(valorContaInput?.value);
    const total = Math.round((totalProdutos + valorAvulso) * 100) / 100;

    if (totalCobrar) {
        totalCobrar.textContent = formatarReal(total);
    }

    const quantidadeProdutos = produtosVenda.reduce(
        (soma, produto) => soma + numeroSeguro(produto.quantidade),
        0
    );

    const quantidadeTotal = quantidadeProdutos + (valorAvulso > 0 ? 1 : 0);

    if (quantidadeItensVenda) {
        quantidadeItensVenda.textContent =
            `${quantidadeTotal} ${quantidadeTotal === 1 ? 'item' : 'itens'}`;
    }

    const ehDinheiro = formaPagamento === 'dinheiro';
    const ehFiado = formaPagamento === 'fiado';

    mostrarElemento(groupRecebido, ehDinheiro, 'block');

    if (valorRecebidoInput) {
        valorRecebidoInput.disabled = !ehDinheiro;
    }

    mostrarElemento(groupFiado, ehFiado, 'block');
    mostrarElemento(rowSaldoDevedorFiado, ehFiado, 'flex');

    if (ehFiado) {
        const dados = obterResumoFiado(total);

        if (saldoDevedorVenda) {
            saldoDevedorVenda.textContent = formatarReal(dados.saldo);
        }

        if (valorTroco) {
            valorTroco.textContent = formatarReal(0);
        }

        mostrarElemento(rowTroco, false);
        mostrarElemento(secaoCedulas, false);

    } else if (ehDinheiro) {
        const recebido = numeroSeguro(valorRecebidoInput?.value);
        const troco = Math.max(
            0,
            Math.round((recebido - total) * 100) / 100
        );

        mostrarElemento(
            rowTroco,
            total > 0 && recebido >= total,
            'flex'
        );

        if (valorTroco) {
            valorTroco.textContent = formatarReal(troco);
        }

        if (troco > 0) {
            mostrarElemento(secaoCedulas, true, 'block');
            gerarSugestoesTroco(troco);
        } else {
            mostrarElemento(secaoCedulas, false);
        }

    } else {
        mostrarElemento(rowTroco, false);
        mostrarElemento(secaoCedulas, false);
    }

    if (btnRegistrarVenda) {
        btnRegistrarVenda.disabled = total <= 0 || vendaEmProcessamento;
    }
}

// ------------------------------------------------------------
// Modal e lista de produtos do estoque
// ------------------------------------------------------------
function abrirModalProdutos() {
    if (!modalProdutosVenda) {
        console.error(
            'Modal de produtos não encontrado. Confira id="modalProdutosVenda" no calculadora.html.'
        );

        alert('Não foi possível abrir os produtos. Confira o modal no calculadora.html.');
        return;
    }

    if (modalLeitorVenda?.classList.contains('aberto')) {
        fecharLeitorVenda(false);
    }

    if (buscaProdutoVenda) {
        buscaProdutoVenda.value = '';
    }

    renderizarProdutosEstoqueVenda();

    if (!abrirModalOverlay(modalProdutosVenda, 9999)) {
        return;
    }

    setTimeout(() => buscaProdutoVenda?.focus(), 100);
}

function fecharModalProdutos() {
    fecharModalOverlay(modalProdutosVenda);
}

function renderizarProdutosEstoqueVenda(termoBusca = '') {
    if (!listaProdutosEstoqueVenda) return;

    const estoque = obterEstoque();
    const termo = normalizar(termoBusca);

    const disponiveis = estoque.filter(produto => {
        const temEstoque = numeroSeguro(produto.quantidade) > 0;

        const corresponde =
            !termo ||
            normalizar(produto.nome).includes(termo) ||
            normalizar(produto.codigo).includes(termo);

        return temEstoque && corresponde;
    });

    if (!disponiveis.length) {
        listaProdutosEstoqueVenda.innerHTML = `
            <div class="produtos-venda-vazio">
                <div class="icone-vazio">📦</div>
                <strong>Nenhum produto encontrado</strong>
                <p>${estoque.length === 0
                    ? 'Cadastre produtos no estoque primeiro.'
                    : 'Não há produtos disponíveis para venda.'}</p>
            </div>
        `;
        return;
    }

    listaProdutosEstoqueVenda.innerHTML = disponiveis.map(produto => {
        const id = String(produto.id);

        const naVenda = produtosVenda.find(
            item => String(item.id) === id
        );

        const quantidadeNaVenda = naVenda
            ? numeroSeguro(naVenda.quantidade)
            : 0;

        const foto = produto.foto
            ? `<img src="${escaparAtributo(produto.foto)}" alt="${escaparAtributo(produto.nome || 'Produto')}">`
            : '<span aria-hidden="true">📦</span>';

        return `
            <div class="produto-estoque-venda-item produto-card">
                <div class="produto-estoque-venda-foto produto-foto">
                    ${foto}
                </div>

                <div class="produto-estoque-venda-info produto-info">
                    <strong>${escaparHTML(produto.nome || 'Produto sem nome')}</strong>

                    <small>
                        Código: ${escaparHTML(produto.codigo || '—')}
                        · Estoque: ${numeroSeguro(produto.quantidade)}
                    </small>

                    <strong class="produto-estoque-venda-preco produto-preco">
                        ${formatarReal(produto.preco)}
                    </strong>
                </div>

                <div class="produto-estoque-venda-acoes controle-quantidade">
                    <button
                        type="button"
                        class="btn-produto-menos"
                        data-acao-produto="diminuir"
                        data-produto-estoque-id="${escaparAtributo(id)}"
                        ${quantidadeNaVenda <= 0 ? 'disabled' : ''}
                    >−</button>

                    <span class="quantidade-produto-modal">
                        ${quantidadeNaVenda}
                    </span>

                    <button
                        type="button"
                        class="btn-produto-mais"
                        data-acao-produto="adicionar"
                        data-produto-estoque-id="${escaparAtributo(id)}"
                    >+</button>
                </div>
            </div>
        `;
    }).join('');
}

function adicionarProdutoVenda(id) {
    const estoque = obterEstoque();

    const itemEstoque = estoque.find(
        produto => String(produto.id) === String(id)
    );

    if (!itemEstoque) {
        alert('Produto não encontrado no estoque.');
        return false;
    }

    const disponivel = numeroSeguro(itemEstoque.quantidade);

    if (disponivel <= 0) {
        alert('Esse produto está sem estoque.');
        return false;
    }

    const existente = produtosVenda.find(
        produto => String(produto.id) === String(id)
    );

    if (existente) {
        if (existente.quantidade >= disponivel) {
            alert('A quantidade selecionada já atingiu o estoque disponível.');
            return false;
        }

        existente.quantidade++;

    } else {
        produtosVenda.push({
            id: itemEstoque.id,
            nome: itemEstoque.nome || 'Produto',
            codigo: itemEstoque.codigo || '',
            preco: numeroSeguro(itemEstoque.preco),
            foto: itemEstoque.foto || '',
            quantidade: 1,
            estoqueDisponivel: disponivel
        });
    }

    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda(buscaProdutoVenda?.value || '');
    atualizarTela();

    return true;
}

function diminuirProdutoModal(id) {
    const produto = produtosVenda.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    produto.quantidade--;

    if (produto.quantidade <= 0) {
        produtosVenda = produtosVenda.filter(
            item => String(item.id) !== String(id)
        );
    }

    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda(buscaProdutoVenda?.value || '');
    atualizarTela();
}

function renderizarProdutosVenda() {
    if (!listaProdutosVenda) return;

    if (!produtosVenda.length) {
        listaProdutosVenda.innerHTML = '';

        if (produtosVendaVazio) {
            listaProdutosVenda.appendChild(produtosVendaVazio);
            mostrarElemento(produtosVendaVazio, true, 'block');
        } else {
            listaProdutosVenda.innerHTML = `
                <div class="produtos-venda-vazio">
                    <div class="icone-carrinho">🛒</div>
                    <strong>Nenhum produto adicionado</strong>
                    <p>Adicione produtos pelo código de barras ou pela busca.</p>
                </div>
            `;
        }

        return;
    }

    if (produtosVendaVazio) {
        mostrarElemento(produtosVendaVazio, false);
    }

    listaProdutosVenda.innerHTML = produtosVenda.map(produto => {
        const subtotal =
            numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade);

        const imagem = produto.foto
            ? `<img src="${escaparAtributo(produto.foto)}" alt="${escaparAtributo(produto.nome)}">`
            : '<span>📦</span>';

        return `
            <div class="item-produto-venda">
                <div class="item-produto-imagem">${imagem}</div>

                <div class="item-produto-info">
                    <strong>${escaparHTML(produto.nome)}</strong>
                    ${produto.codigo
                        ? `<small>Código: ${escaparHTML(produto.codigo)}</small>`
                        : ''}
                    <span>${formatarReal(produto.preco)}</span>
                </div>

                <div class="item-produto-controles">
                    <button
                        type="button"
                        class="btn-quantidade"
                        data-acao="diminuir"
                        data-id="${escaparAtributo(produto.id)}"
                    >−</button>

                    <strong>${produto.quantidade}</strong>

                    <button
                        type="button"
                        class="btn-quantidade"
                        data-acao="aumentar"
                        data-id="${escaparAtributo(produto.id)}"
                    >+</button>
                </div>

                <div class="item-produto-subtotal">
                    <strong>${formatarReal(subtotal)}</strong>

                    <button
                        type="button"
                        class="btn-remover-produto"
                        data-acao="remover"
                        data-id="${escaparAtributo(produto.id)}"
                        aria-label="Remover produto"
                    >🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function alterarQuantidadeProduto(id, acao) {
    const produto = produtosVenda.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    if (acao === 'aumentar') {
        const doEstoque = obterEstoque().find(
            item => String(item.id) === String(id)
        );

        if (
            !doEstoque ||
            produto.quantidade >= numeroSeguro(doEstoque.quantidade)
        ) {
            alert('Não há mais unidades disponíveis no estoque.');
            return;
        }

        produto.quantidade++;

    } else if (acao === 'diminuir') {
        produto.quantidade--;

        if (produto.quantidade <= 0) {
            produtosVenda = produtosVenda.filter(
                item => String(item.id) !== String(id)
            );
        }

    } else if (acao === 'remover') {
        produtosVenda = produtosVenda.filter(
            item => String(item.id) !== String(id)
        );
    }

    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda(buscaProdutoVenda?.value || '');
    atualizarTela();
}

function encontrarProdutoPorCodigo(codigo) {
    const alvo = String(codigo || '').trim();

    if (!alvo) return null;

    return obterEstoque().find(
        item => String(item.codigo || '').trim() === alvo
    ) || null;
}
// ------------------------------------------------------------
// Leitor de código de barras
// ------------------------------------------------------------
async function abrirLeitorVenda() {
    if (abrindoLeitorVenda || lendoCodigoVenda) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        alert('A câmera não está disponível neste navegador.');
        return;
    }

    if (!('BarcodeDetector' in window)) {
        alert('Este navegador não oferece suporte ao leitor automático de código de barras.');
        return;
    }

    abrindoLeitorVenda = true;

    try {
        modalProdutosEstavaAbertoAntesLeitor =
            !!modalProdutosVenda &&
            modalProdutosVenda.classList.contains('aberto') &&
            !modalProdutosVenda.classList.contains('hidden');

        if (modalProdutosEstavaAbertoAntesLeitor) {
            fecharModalProdutos();
        }

        pararLeitorVenda();

        if (!modalLeitorVenda) {
            throw new Error('Modal do leitor não encontrado no calculadora.html.');
        }

        abrirModalOverlay(modalLeitorVenda, 10002);

        if (mensagemLeitorVenda) {
            mensagemLeitorVenda.textContent = 'Iniciando câmera...';
            mensagemLeitorVenda.style.display = 'flex';
        }

        if (videoLeitorVenda) {
            videoLeitorVenda.style.display = 'none';
        }

        if (molduraLeitorVenda) {
            molduraLeitorVenda.style.display = 'none';
        }

        prepararSomLeitor();

        detectorLeitorVenda = new BarcodeDetector({
            formats: [
                'ean_13',
                'ean_8',
                'upc_a',
                'upc_e',
                'code_128',
                'code_39',
                'code_93'
            ]
        });

        streamLeitorVenda = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        if (!videoLeitorVenda) {
            throw new Error('Elemento de vídeo não encontrado.');
        }

        videoLeitorVenda.setAttribute('playsinline', '');
        videoLeitorVenda.muted = true;
        videoLeitorVenda.srcObject = streamLeitorVenda;

        await new Promise(resolve => {
            if (videoLeitorVenda.readyState >= 1) {
                resolve();
                return;
            }

            videoLeitorVenda.addEventListener(
                'loadedmetadata',
                resolve,
                { once: true }
            );
        });

        await videoLeitorVenda.play();

        videoLeitorVenda.style.setProperty('display', 'block', 'important');
        videoLeitorVenda.style.setProperty('visibility', 'visible', 'important');
        videoLeitorVenda.style.setProperty('width', '100%', 'important');
        videoLeitorVenda.style.setProperty('height', '280px', 'important');
        videoLeitorVenda.style.setProperty('object-fit', 'cover', 'important');

        if (mensagemLeitorVenda) {
            mensagemLeitorVenda.style.display = 'none';
        }

        if (molduraLeitorVenda) {
            molduraLeitorVenda.style.display = 'block';
        }

        if (statusLeitorVenda) {
            statusLeitorVenda.textContent = 'Aponte a câmera para o código';
        }

        lendoCodigoVenda = true;
        detectarCodigoVenda();

    } catch (erro) {
        console.error('Erro ao abrir leitor:', erro);

        pararLeitorVenda();

        if (mensagemLeitorVenda) {
            mensagemLeitorVenda.textContent = obterMensagemErroCamera(erro);
            mensagemLeitorVenda.style.display = 'flex';
        }

        if (statusLeitorVenda) {
            statusLeitorVenda.textContent = 'Não foi possível iniciar a câmera';
        }

        if (modalLeitorVenda) {
            abrirModalOverlay(modalLeitorVenda, 10002);
        }

    } finally {
        abrindoLeitorVenda = false;
    }
}

function obterMensagemErroCamera(erro) {
    if (erro?.name === 'NotAllowedError') {
        return 'Permita o acesso à câmera para usar o leitor.';
    }

    if (erro?.name === 'NotFoundError') {
        return 'Nenhuma câmera foi encontrada neste aparelho.';
    }

    if (erro?.name === 'NotReadableError') {
        return 'A câmera está sendo usada por outro aplicativo.';
    }

    return 'Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.';
}

async function detectarCodigoVenda() {
    if (!lendoCodigoVenda || !detectorLeitorVenda || !videoLeitorVenda) {
        return;
    }

    if (videoLeitorVenda.readyState < 2) {
        frameLeituraVenda = requestAnimationFrame(detectarCodigoVenda);
        return;
    }

    try {
        const resultados = await detectorLeitorVenda.detect(videoLeitorVenda);

        if (resultados?.length) {
            const codigo = String(resultados[0].rawValue || '').trim();

            if (codigo) {
                processarCodigoLidoVenda(codigo);
            }
        }

    } catch (erro) {
        console.warn('Erro na leitura do código:', erro);
    }

    if (lendoCodigoVenda) {
        frameLeituraVenda = requestAnimationFrame(detectarCodigoVenda);
    }
}

function processarCodigoLidoVenda(codigo) {
    const agora = Date.now();

    if (
        codigo === codigoUltimoLidoVenda &&
        agora - tempoUltimoCodigoVenda < 1000
    ) {
        return;
    }

    codigoUltimoLidoVenda = codigo;
    tempoUltimoCodigoVenda = agora;

    const produto = encontrarProdutoPorCodigo(codigo);

    if (!produto) {
        emitirSomErroVenda();

        if (statusLeitorVenda) {
            statusLeitorVenda.textContent =
                `Código ${codigo} não encontrado no estoque`;
        }

        setTimeout(() => {
            if (lendoCodigoVenda && statusLeitorVenda) {
                statusLeitorVenda.textContent =
                    'Aponte a câmera para o próximo produto';
            }
        }, 1600);

        return;
    }

    if (!adicionarProdutoVenda(produto.id)) {
        emitirSomErroVenda();
        return;
    }

    emitirSomLeitor();

    if (statusLeitorVenda) {
        statusLeitorVenda.textContent =
            `${produto.nome} — ${formatarReal(produto.preco)}`;
    }

    setTimeout(() => {
        if (lendoCodigoVenda && statusLeitorVenda) {
            statusLeitorVenda.textContent =
                'Aponte para o próximo código';
        }
    }, 900);
}

function prepararSomLeitor() {
    try {
        const AudioCtx =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioCtx) return;

        if (!audioContextVenda) {
            audioContextVenda = new AudioCtx();
        }

        if (audioContextVenda.state === 'suspended') {
            audioContextVenda.resume();
        }

    } catch (erro) {
        console.warn('Som do leitor indisponível:', erro);
    }
}

function emitirTom(
    frequencia,
    frequenciaFinal,
    duracao,
    volume = 0.15
) {
    try {
        prepararSomLeitor();

        if (!audioContextVenda) return;

        const agora = audioContextVenda.currentTime;
        const oscilador = audioContextVenda.createOscillator();
        const ganho = audioContextVenda.createGain();

        oscilador.type = 'sine';
        oscilador.frequency.setValueAtTime(frequencia, agora);

        if (frequenciaFinal) {
            oscilador.frequency.exponentialRampToValueAtTime(
                frequenciaFinal,
                agora + duracao * 0.8
            );
        }

        ganho.gain.setValueAtTime(0.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(
            volume,
            agora + 0.01
        );
        ganho.gain.exponentialRampToValueAtTime(
            0.0001,
            agora + duracao
        );

        oscilador.connect(ganho);
        ganho.connect(audioContextVenda.destination);

        oscilador.start(agora);
        oscilador.stop(agora + duracao + 0.01);

    } catch (erro) {
        console.warn('Não foi possível emitir som:', erro);
    }
}

function emitirSomLeitor() {
    emitirTom(1250, 850, 0.085, 0.18);
}

function emitirSomErroVenda() {
    emitirTom(300, 220, 0.18, 0.12);
}

function pararLeitorVenda() {
    lendoCodigoVenda = false;

    if (frameLeituraVenda) {
        cancelAnimationFrame(frameLeituraVenda);
    }

    frameLeituraVenda = null;

    if (streamLeitorVenda) {
        streamLeitorVenda.getTracks().forEach(track => {
            try {
                track.stop();
            } catch (_) {}
        });
    }

    streamLeitorVenda = null;

    if (videoLeitorVenda) {
        try {
            videoLeitorVenda.pause();
        } catch (_) {}

        videoLeitorVenda.srcObject = null;
        videoLeitorVenda.style.setProperty('display', 'none', 'important');
        videoLeitorVenda.style.setProperty('visibility', 'hidden', 'important');
    }

    if (molduraLeitorVenda) {
        molduraLeitorVenda.style.display = 'none';
    }

    detectorLeitorVenda = null;
    codigoUltimoLidoVenda = '';
    tempoUltimoCodigoVenda = 0;
}

function fecharLeitorVenda(reabrirProdutos = false) {
    const estavaAberto =
        !!modalLeitorVenda &&
        modalLeitorVenda.classList.contains('aberto') &&
        !modalLeitorVenda.classList.contains('hidden');

    pararLeitorVenda();
    fecharModalOverlay(modalLeitorVenda);

    if (
        reabrirProdutos &&
        estavaAberto &&
        modalProdutosEstavaAbertoAntesLeitor &&
        modalProdutosVenda
    ) {
        abrirModalOverlay(modalProdutosVenda, 9999);
        setTimeout(() => buscaProdutoVenda?.focus(), 100);
    }

    modalProdutosEstavaAbertoAntesLeitor = false;
}

// ------------------------------------------------------------
// Resumo e confirmação da venda
// ------------------------------------------------------------
function calcularResumoVenda() {
    const totalProdutos = calcularTotaisProdutos();
    const valorAvulso = numeroSeguro(valorContaInput?.value);
    const total = Math.round((totalProdutos + valorAvulso) * 100) / 100;

    let recebido = total;
    let troco = 0;
    let clienteNome = '';
    let pagamentoInicial = 0;
    let saldoDevedor = 0;
    let formaPagamentoRecebido = '';

    if (formaPagamento === 'dinheiro') {
        recebido = numeroSeguro(valorRecebidoInput?.value);

        troco = Math.max(
            0,
            Math.round((recebido - total) * 100) / 100
        );

    } else if (formaPagamento === 'fiado') {
        clienteNome = String(nomeClienteFiado?.value || '').trim();
        pagamentoInicial = numeroSeguro(valorPagoInicialFiado?.value);

        formaPagamentoRecebido = String(
            formaPagamentoInicialFiado?.value || 'dinheiro'
        ).toLowerCase();

        recebido = pagamentoInicial;

        saldoDevedor = Math.max(
            0,
            Math.round((total - pagamentoInicial) * 100) / 100
        );
    }

    return {
        valorConta: valorAvulso,
        valorAvulso,
        totalProdutos,
        valorBase: total,
        taxa: 0,
        total,
        recebido,
        troco,
        formaPagamento,
        clienteNome,
        pagamentoInicial,
        saldoDevedor,
        formaPagamentoRecebido
    };
}

function validarEstoqueVenda() {
    const estoque = obterEstoque();

    for (const item of produtosVenda) {
        const produto = estoque.find(
            registro => String(registro.id) === String(item.id)
        );

        if (!produto) {
            alert(`O produto "${item.nome}" não está mais no estoque.`);
            return false;
        }

        if (
            numeroSeguro(produto.quantidade) <
            numeroSeguro(item.quantidade)
        ) {
            alert(`Estoque insuficiente para "${item.nome}".`);
            return false;
        }
    }

    return true;
}

function validarResumoVenda(resumo) {
    if (resumo.total <= 0) {
        alert('Informe o valor da compra ou adicione pelo menos um produto.');
        return false;
    }

    if (
        resumo.formaPagamento === 'dinheiro' &&
        resumo.recebido < resumo.total
    ) {
        alert('O valor recebido é menor que o total da venda.');
        return false;
    }

    if (resumo.formaPagamento === 'fiado') {
        if (!resumo.clienteNome) {
            alert('Informe o nome do cliente para registrar uma venda fiada.');
            nomeClienteFiado?.focus();
            return false;
        }

        if (resumo.pagamentoInicial > resumo.total) {
            alert('O valor pago na hora não pode ser maior que o total da venda fiada.');
            valorPagoInicialFiado?.focus();
            return false;
        }

        if (![
            'dinheiro',
            'pix',
            'debito',
            'credito'
        ].includes(resumo.formaPagamentoRecebido)) {
            alert('Selecione uma forma válida para o pagamento inicial.');
            return false;
        }
    }

    return validarEstoqueVenda();
}

function abrirConfirmacaoVenda() {
    const resumo = calcularResumoVenda();

    if (!validarResumoVenda(resumo)) return;

    if (!modalConfirmarVenda || !resumoConfirmacaoVenda) {
        console.error(
            'Modal/resumo da confirmação não encontrado. Confira os IDs modalConfirmarVenda e resumoConfirmacaoVenda no calculadora.html.'
        );

        alert('A confirmação não abriu. Confira o modal de confirmação no calculadora.html.');
        return;
    }

    resumoConfirmacaoVenda.innerHTML = criarResumoConfirmacao(resumo);

    abrirModalOverlay(modalConfirmarVenda, 10001);
}

function linhaResumo(rotulo, valor, extraClasse = '') {
    return `
        <div class="resumo-confirmacao-linha ${extraClasse}">
            <span>${escaparHTML(rotulo)}</span>
            <strong>${escaparHTML(valor)}</strong>
        </div>
    `;
}

function criarResumoConfirmacao(resumo) {
    let html = linhaResumo(
        'Pagamento',
        nomeFormaPagamento(resumo.formaPagamento)
    );

    if (resumo.formaPagamento === 'fiado') {
        html += linhaResumo('Cliente', resumo.clienteNome);
    }

    if (resumo.valorAvulso > 0) {
        html += linhaResumo(
            'Valor adicional / venda avulsa',
            formatarReal(resumo.valorAvulso)
        );
    }

    if (produtosVenda.length) {
        html += '<div class="resumo-confirmacao-produtos"><strong>Produtos</strong>';

        produtosVenda.forEach(produto => {
            const subtotal =
                numeroSeguro(produto.preco) *
                numeroSeguro(produto.quantidade);

            html += `
                <div class="resumo-produto">
                    <span>${escaparHTML(produto.nome)} × ${numeroSeguro(produto.quantidade)}</span>
                    <strong>${formatarReal(subtotal)}</strong>
                </div>
            `;
        });

        html += '</div>';
    }

    html += `
        <div class="resumo-confirmacao-total">
            <span>Total da venda</span>
            <strong>${formatarReal(resumo.total)}</strong>
        </div>
    `;

    if (resumo.formaPagamento === 'dinheiro') {
        html += linhaResumo(
            'Dinheiro recebido',
            formatarReal(resumo.recebido)
        );

        html += linhaResumo(
            'Troco',
            formatarReal(resumo.troco),
            'troco'
        );

    } else if (resumo.formaPagamento === 'fiado') {
        html += linhaResumo(
            'Pago na hora',
            `${formatarReal(resumo.pagamentoInicial)} (${nomeFormaPagamento(resumo.formaPagamentoRecebido)})`
        );

        html += linhaResumo(
            'Saldo devedor',
            formatarReal(resumo.saldoDevedor),
            'saldo-devedor'
        );

        html += `
            <p class="aviso-fiado">
                Sem juros. O saldo será atualizado conforme os pagamentos do cliente.
            </p>
        `;
    }

    return html;
}

function fecharConfirmacao() {
    fecharModalOverlay(modalConfirmarVenda);
}
// ------------------------------------------------------------
// Movimentações de pagamentos de fiado
// ------------------------------------------------------------
function criarMovimentacaoPagamentoFiado(
    venda,
    valor,
    forma,
    descricao,
    dataHora,
    origem
) {
    return {
        id: `fiado-${venda.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipo: 'entrada',
        valor: Math.round(valor * 100) / 100,
        formaPagamento: forma,
        formaPagamentoNome: nomeFormaPagamento(forma),
        descricao,
        data: dataHora.data,
        dataChave: dataHora.dataChave,
        hora: dataHora.hora,
        origem: origem || 'pagamento_fiado',
        fiadoId: venda.id,
        vendaId: venda.id
    };
}

// ------------------------------------------------------------
// Confirmar e registrar venda
// ------------------------------------------------------------
function confirmarVenda() {
    if (vendaEmProcessamento) return;

    const resumo = calcularResumoVenda();

    if (!validarResumoVenda(resumo)) return;

    vendaEmProcessamento = true;

    if (btnConfirmarVenda) {
        btnConfirmarVenda.disabled = true;
    }

    const estoqueOriginal = obterEstoque();
    const estoqueAtualizado = JSON.parse(JSON.stringify(estoqueOriginal));

    // Confere e atualiza o estoque antes de concluir a venda.
    for (const item of produtosVenda) {
        const produto = estoqueAtualizado.find(
            registro => String(registro.id) === String(item.id)
        );

        if (
            !produto ||
            numeroSeguro(produto.quantidade) < numeroSeguro(item.quantidade)
        ) {
            alert(`Estoque insuficiente para "${item.nome}". Confira a venda novamente.`);

            vendaEmProcessamento = false;

            if (btnConfirmarVenda) {
                btnConfirmarVenda.disabled = false;
            }

            return;
        }

        produto.quantidade = Math.max(
            0,
            numeroSeguro(produto.quantidade) -
            numeroSeguro(item.quantidade)
        );

        produto.atualizadoEm = new Date().toISOString();
    }

    const dataHora = obterDataHoraAtual();

    const idVenda =
        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const isFiado = resumo.formaPagamento === 'fiado';

    const venda = {
        id: idVenda,
        data: dataHora.data,
        dataChave: dataHora.dataChave,
        hora: dataHora.hora,

        formaPagamento: resumo.formaPagamento,
        formaPagamentoNome: nomeFormaPagamento(resumo.formaPagamento),

        valorConta: resumo.valorConta,
        valorAvulso: resumo.valorAvulso,
        totalProdutos: resumo.totalProdutos,
        valorBase: resumo.valorBase,
        taxaCredito: 0,
        total: resumo.total,

        valorRecebido: isFiado
            ? resumo.pagamentoInicial
            : resumo.recebido,

        troco: isFiado ? 0 : resumo.troco,

        produtos: produtosVenda.map(produto => ({
            id: produto.id,
            nome: produto.nome,
            codigo: produto.codigo,
            preco: produto.preco,
            quantidade: produto.quantidade,
            subtotal: Math.round(
                numeroSeguro(produto.preco) *
                numeroSeguro(produto.quantidade) *
                100
            ) / 100
        }))
    };

    let movimentacoes = lerListaLocalStorage(CHAVE_MOVIMENTACOES);
    let movimentacaoInicial = null;

    if (isFiado) {
        const pago = Math.round(resumo.pagamentoInicial * 100) / 100;

        const saldo = Math.max(
            0,
            Math.round((resumo.total - pago) * 100) / 100
        );

        venda.clienteNome = resumo.clienteNome;

        venda.fiado = {
            clienteNome: resumo.clienteNome,
            valorOriginal: resumo.total,
            totalPago: pago,
            saldoDevedor: saldo,
            status: saldo <= 0 ? 'pago' : 'pendente',
            pagamentos: []
        };

        if (pago > 0) {
            venda.fiado.pagamentos.push({
                id: `pg-${idVenda}-inicial`,
                valor: pago,
                formaPagamento: resumo.formaPagamentoRecebido,
                formaPagamentoNome: nomeFormaPagamento(
                    resumo.formaPagamentoRecebido
                ),
                data: dataHora.data,
                dataChave: dataHora.dataChave,
                hora: dataHora.hora,
                tipo: 'pagamento_inicial'
            });

            movimentacaoInicial = criarMovimentacaoPagamentoFiado(
                venda,
                pago,
                resumo.formaPagamentoRecebido,
                `Pagamento inicial do fiado — ${resumo.clienteNome}`,
                dataHora,
                'pagamento_fiado_inicial'
            );

            movimentacoes.push(movimentacaoInicial);
        }
    }

    const vendas = lerListaLocalStorage(CHAVE_VENDAS);
    const vendasNovas = [...vendas, venda];

    // Guarda os dados anteriores para permitir restauração em caso de erro.
    const vendasAntes = localStorage.getItem(CHAVE_VENDAS);
    const estoqueAntes = localStorage.getItem(CHAVE_ESTOQUE);
    const movimentosAntes = localStorage.getItem(CHAVE_MOVIMENTACOES);

    try {
        localStorage.setItem(
            CHAVE_VENDAS,
            JSON.stringify(vendasNovas)
        );

        if (isFiado && movimentacaoInicial) {
            localStorage.setItem(
                CHAVE_MOVIMENTACOES,
                JSON.stringify(movimentacoes)
            );
        }

        if (!salvarEstoque(estoqueAtualizado)) {
            throw new Error('Não foi possível salvar o estoque.');
        }

    } catch (erro) {
        try {
            restaurarChaveLocalStorage(CHAVE_VENDAS, vendasAntes);
            restaurarChaveLocalStorage(CHAVE_MOVIMENTACOES, movimentosAntes);
            restaurarChaveLocalStorage(CHAVE_ESTOQUE, estoqueAntes);

        } catch (erroRollback) {
            console.error(
                'Falha ao restaurar dados após erro:',
                erroRollback
            );
        }

        console.error('Erro ao registrar venda:', erro);

        alert(
            'Não foi possível salvar a venda e atualizar os dados. ' +
            'Confira o estoque antes de tentar novamente.'
        );

        vendaEmProcessamento = false;

        if (btnConfirmarVenda) {
            btnConfirmarVenda.disabled = false;
        }

        return;
    }

    fecharConfirmacao();

    if (isFiado) {
        alert(
            `Venda fiada registrada para ${resumo.clienteNome}.\n` +
            `Total: ${formatarReal(resumo.total)}\n` +
            `Pago: ${formatarReal(resumo.pagamentoInicial)}\n` +
            `Saldo devedor: ${formatarReal(resumo.saldoDevedor)}`
        );
    } else {
        alert('Venda registrada com sucesso!');
    }

    vendaEmProcessamento = false;

    if (btnConfirmarVenda) {
        btnConfirmarVenda.disabled = false;
    }

    limparVenda();
}

// ------------------------------------------------------------
// Restauração de dados
// ------------------------------------------------------------
function restaurarChaveLocalStorage(chave, valorAnterior) {
    if (valorAnterior === null || valorAnterior === undefined) {
        localStorage.removeItem(chave);
    } else {
        localStorage.setItem(chave, valorAnterior);
    }
}

// ------------------------------------------------------------
// Limpar venda atual
// ------------------------------------------------------------
function limparVenda() {
    produtosVenda = [];

    if (valorContaInput) valorContaInput.value = '';
    if (valorRecebidoInput) valorRecebidoInput.value = '';
    if (nomeClienteFiado) nomeClienteFiado.value = '';

    if (valorPagoInicialFiado) {
        valorPagoInicialFiado.value = '0';
    }

    if (formaPagamentoInicialFiado) {
        formaPagamentoInicialFiado.value = 'dinheiro';
    }

    formaPagamento = 'dinheiro';

    atualizarBotoesPagamento();
    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda();

    fecharModalProdutos();
    fecharLeitorVenda(false);
    fecharConfirmacao();

    atualizarTela();
}

// ------------------------------------------------------------
// Estado dos modais e rolagem da página
// ------------------------------------------------------------
function verificarModaisAbertos() {
    const modais = [
        modalProdutosVenda,
        modalLeitorVenda,
        modalConfirmarVenda
    ];

    const algumAberto = modais.some(modal =>
        modal &&
        modal.classList.contains('aberto') &&
        !modal.classList.contains('hidden')
    );

    document.body.classList.toggle('modal-aberto', algumAberto);

    // Só desbloqueia a página quando todos os modais estiverem fechados.
    document.body.style.overflow = algumAberto ? 'hidden' : '';
}

// ------------------------------------------------------------
// Denominações e sugestões de troco
// ------------------------------------------------------------
const denominacoesTroco = [
    { valor: 200, nome: 'R$ 200', tipo: 'cédula', simbolo: '💵' },
    { valor: 100, nome: 'R$ 100', tipo: 'cédula', simbolo: '💵' },
    { valor: 50, nome: 'R$ 50', tipo: 'cédula', simbolo: '💵' },
    { valor: 20, nome: 'R$ 20', tipo: 'cédula', simbolo: '💵' },
    { valor: 10, nome: 'R$ 10', tipo: 'cédula', simbolo: '💵' },
    { valor: 5, nome: 'R$ 5', tipo: 'cédula', simbolo: '💵' },
    { valor: 2, nome: 'R$ 2', tipo: 'cédula', simbolo: '💵' },
    { valor: 1, nome: 'R$ 1', tipo: 'moeda', simbolo: '🪙' },
    { valor: 0.50, nome: 'R$ 0,50', tipo: 'moeda', simbolo: '🪙' },
    { valor: 0.25, nome: 'R$ 0,25', tipo: 'moeda', simbolo: '🪙' },
    { valor: 0.10, nome: 'R$ 0,10', tipo: 'moeda', simbolo: '🪙' },
    { valor: 0.05, nome: 'R$ 0,05', tipo: 'moeda', simbolo: '🪙' },
    { valor: 0.01, nome: 'R$ 0,01', tipo: 'moeda', simbolo: '🪙' }
];

function calcularMelhorTroco(valorCentavos, bloqueadas = []) {
    if (
        !Number.isInteger(valorCentavos) ||
        valorCentavos < 0 ||
        valorCentavos > 200000
    ) {
        return null;
    }

    const bloqueadasSet = new Set(bloqueadas);
    const infinito = 999999;

    const dp = new Array(valorCentavos + 1).fill(infinito);
    const anterior = new Array(valorCentavos + 1).fill(null);

    dp[0] = 0;

    for (let valor = 1; valor <= valorCentavos; valor++) {
        for (let i = 0; i < denominacoesTroco.length; i++) {
            if (bloqueadasSet.has(i)) continue;

            const denom = Math.round(
                denominacoesTroco[i].valor * 100
            );

            if (denom > valor || dp[valor - denom] === infinito) {
                continue;
            }

            const qtd = dp[valor - denom] + 1;

            if (qtd < dp[valor]) {
                dp[valor] = qtd;
                anterior[valor] = i;
            }
        }
    }

    if (dp[valorCentavos] === infinito) {
        return null;
    }

    const quantidades = new Array(denominacoesTroco.length).fill(0);
    let restante = valorCentavos;

    while (restante > 0) {
        const indice = anterior[restante];

        if (indice === null || indice === undefined) {
            return null;
        }

        const denom = Math.round(
            denominacoesTroco[indice].valor * 100
        );

        quantidades[indice]++;
        restante -= denom;
    }

    return denominacoesTroco
        .map((item, index) =>
            quantidades[index] > 0
                ? { ...item, quantidade: quantidades[index] }
                : null
        )
        .filter(Boolean);
}

function gerarSugestoesTroco(valor) {
    if (!listaCedulas) return;

    const valorCentavos = centavos(numeroSeguro(valor));

    if (valorCentavos <= 0) {
        listaCedulas.innerHTML = '';
        return;
    }

    const sugestoes = [];
    const primeira = calcularMelhorTroco(valorCentavos);

    if (primeira) {
        sugestoes.push(primeira);
    }

    for (
        let i = 0;
        i < denominacoesTroco.length && sugestoes.length < 3;
        i++
    ) {
        const alternativa = calcularMelhorTroco(valorCentavos, [i]);

        if (!alternativa) continue;

        const assinatura = alternativa
            .map(item => `${item.nome}x${item.quantidade}`)
            .join('|');

        const jaExiste = sugestoes.some(lista =>
            lista
                .map(item => `${item.nome}x${item.quantidade}`)
                .join('|') === assinatura
        );

        if (!jaExiste) {
            sugestoes.push(alternativa);
        }
    }

    renderizarSugestoesTroco(sugestoes);
}

function renderizarSugestoesTroco(sugestoes) {
    if (!listaCedulas) return;

    if (!sugestoes.length) {
        listaCedulas.innerHTML =
            '<p>Não foi possível montar uma sugestão de troco.</p>';
        return;
    }

    listaCedulas.innerHTML = sugestoes.map((sugestao, index) => {
        const totalPecas = sugestao.reduce(
            (soma, item) => soma + item.quantidade,
            0
        );

        return `
            <div
                class="sugestao-troco${index === 0 ? ' destaque' : ''}"
                style="
                    margin-bottom:14px;
                    padding:14px;
                    border-radius:16px;
                    border:${index === 0
                        ? '2px solid #20a66a'
                        : '1px solid #dfe4e7'};
                    background:${index === 0 ? '#effaf5' : '#fff'};
                "
            >
                <div style="
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:10px;
                ">
                    <strong style="font-size:18px;color:#27343d">
                        ${index === 0 ? '⭐ Opção 1' : `Opção ${index + 1}`}
                    </strong>

                    <small>
                        ${totalPecas} ${totalPecas === 1 ? 'peça' : 'peças'}
                    </small>
                </div>

                <div style="display:flex;flex-direction:column;gap:6px">
                    ${sugestao.map(item => `
                        <div style="
                            display:grid;
                            grid-template-columns:32px 1fr auto;
                            align-items:center;
                            gap:8px;
                            padding:9px 10px;
                            border-radius:10px;
                            background:#f5f6f7;
                        ">
                            <strong>${item.quantidade}×</strong>
                            <span>
                                ${item.simbolo}
                                <strong>${item.nome}</strong>
                            </span>
                            <span style="font-size:13px;color:#78838a">
                                ${item.tipo}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// ------------------------------------------------------------
// Iniciar calculadora
// ------------------------------------------------------------
if (document.readyState === 'loading') {
    document.addEventListener(
        'DOMContentLoaded',
        iniciarCalculadora,
        { once: true }
    );
} else {
    iniciarCalculadora();
}