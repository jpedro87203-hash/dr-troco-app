// ============================================
// DR. TROCO — FLUXO DE CAIXA
// ============================================

const CHAVE_VENDAS = 'drTroco_vendas';
const CHAVE_MOVIMENTACOES = 'drTroco_movimentacoes';
const CHAVE_SALDOS_INICIAIS = 'drTroco_saldosIniciais';

let tipoMovimentoAtual = 'entrada';


// ============================================
// FUNÇÕES BÁSICAS
// ============================================

function obterVendas() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_VENDAS) || '[]');
    } catch {
        return [];
    }
}

function obterMovimentacoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_MOVIMENTACOES) || '[]');
    } catch {
        return [];
    }
}

function obterSaldosIniciais() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SALDOS_INICIAIS) || '{}');
    } catch {
        return {};
    }
}

function formatarReal(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function dataHoje() {
    const hoje = new Date();
    return hoje.toLocaleDateString('pt-BR');
}

function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function dataChave() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
}


// ============================================
// ELEMENTOS
// ============================================

const saldoCaixa = document.getElementById('saldoCaixa');
const saldoInicialEl = document.getElementById('saldoInicial');
const totalEntradasCaixa = document.getElementById('totalEntradasCaixa');
const totalSaidasCaixa = document.getElementById('totalSaidasCaixa');

const totalDinheiro = document.getElementById('totalDinheiro');
const totalPix = document.getElementById('totalPix');
const totalDebito = document.getElementById('totalDebito');
const totalCredito = document.getElementById('totalCredito');

const totalVendas = document.getElementById('totalVendas');
const quantidadeVendas = document.getElementById('quantidadeVendas');

const listaMovimentacoes = document.getElementById('listaMovimentacoes');
const dataFluxo = document.getElementById('dataFluxo');


// ============================================
// MODAIS
// ============================================

const modalSaldoInicial = document.getElementById('modalSaldoInicial');
const modalMovimento = document.getElementById('modalMovimento');

const formSaldoInicial = document.getElementById('formSaldoInicial');
const formMovimento = document.getElementById('formMovimento');

const valorSaldoInicial = document.getElementById('valorSaldoInicial');
const valorMovimento = document.getElementById('valorMovimento');

const descricaoMovimento = document.getElementById('descricaoMovimento');
const formaPagamentoMovimento = document.getElementById('formaPagamentoMovimento');

const tituloModalMovimento = document.getElementById('tituloModalMovimento');
const btnConfirmarMovimento = document.getElementById('btnConfirmarMovimento');


// ============================================
// CONTROLE DO MENU INFERIOR
// ============================================

function mostrarMenuInferior() {
    document.body.classList.remove('modal-aberto');
}

function esconderMenuInferior() {
    document.body.classList.add('modal-aberto');
}


// ============================================
// FORMA DE PAGAMENTO
// ============================================

function nomeFormaPagamento(forma) {
    const nomes = {
        dinheiro: 'Dinheiro',
        pix: 'Pix',
        debito: 'Débito',
        credito: 'Crédito'
    };

    return nomes[forma] || forma;
}


// ============================================
// SALDO INICIAL
// ============================================

function obterSaldoInicialHoje() {
    const saldos = obterSaldosIniciais();

    return Number(saldos[dataChave()] || 0);
}

function salvarSaldoInicial(valor) {
    const saldos = obterSaldosIniciais();

    saldos[dataChave()] = valor;

    localStorage.setItem(
        CHAVE_SALDOS_INICIAIS,
        JSON.stringify(saldos)
    );
}


// ============================================
// ABRIR SALDO INICIAL
// ============================================

function abrirSaldoInicial() {
    valorSaldoInicial.value = obterSaldoInicialHoje() || '';

    esconderMenuInferior();

    modalSaldoInicial.classList.add('aberto');

    setTimeout(() => {
        valorSaldoInicial.focus();
    }, 150);
}


// ============================================
// ABRIR ENTRADA
// ============================================

function abrirEntrada() {

    if (window.DrTrocoCaixa && !window.DrTrocoCaixa.requireOpen()) {
        return;
    }

    tipoMovimentoAtual = 'entrada';

    tituloModalMovimento.textContent = '➕ Nova entrada';
    btnConfirmarMovimento.textContent = 'Registrar entrada';

    limparFormularioMovimento();

    esconderMenuInferior();

    modalMovimento.classList.add('aberto');

    setTimeout(() => {
        valorMovimento.focus();
    }, 150);
}


// ============================================
// ABRIR SAÍDA
// ============================================

function abrirSaida() {

    if (window.DrTrocoCaixa && !window.DrTrocoCaixa.requireOpen()) {
        return;
    }

    tipoMovimentoAtual = 'saida';

    tituloModalMovimento.textContent = '➖ Nova saída';
    btnConfirmarMovimento.textContent = 'Registrar saída';

    limparFormularioMovimento();

    esconderMenuInferior();

    modalMovimento.classList.add('aberto');

    setTimeout(() => {
        valorMovimento.focus();
    }, 150);
}


// ============================================
// LIMPAR FORMULÁRIO
// ============================================

function limparFormularioMovimento() {
    valorMovimento.value = '';
    descricaoMovimento.value = '';
    formaPagamentoMovimento.value = 'dinheiro';
}


// ============================================
// FECHAR MODAIS
// ============================================

function fecharModal(id) {
    const modal = document.getElementById(id);

    if (!modal) {
        return;
    }

    modal.classList.remove('aberto');

    const outroModalAberto = document.querySelector(
        '.modal-fluxo.aberto'
    );

    if (!outroModalAberto) {
        mostrarMenuInferior();
    }
}


// ============================================
// BOTÕES DE FECHAR
// ============================================

document.querySelectorAll('[data-fechar]').forEach(botao => {

    botao.addEventListener('click', () => {
        fecharModal(botao.dataset.fechar);
    });

});


// ============================================
// FECHAR CLICANDO FORA
// ============================================

[
    modalSaldoInicial,
    modalMovimento
].forEach(modal => {

    if (!modal) {
        return;
    }

    modal.addEventListener('click', evento => {

        if (evento.target === modal) {
            modal.classList.remove('aberto');
            mostrarMenuInferior();
        }

    });

});


// ============================================
// SALVAR SALDO INICIAL
// ============================================

if (formSaldoInicial) {

    formSaldoInicial.addEventListener('submit', evento => {

        evento.preventDefault();

        const valor = Number(
            String(valorSaldoInicial.value).replace(',', '.')
        );

        if (isNaN(valor) || valor < 0) {
            alert('Digite um valor válido.');
            return;
        }

        salvarSaldoInicial(valor);

        fecharModal('modalSaldoInicial');

        carregarFluxo();

    });

}


// ============================================
// SALVAR MOVIMENTAÇÃO
// ============================================

if (formMovimento) {

    formMovimento.addEventListener('submit', evento => {

        evento.preventDefault();

        const valor = Number(
            String(valorMovimento.value).replace(',', '.')
        );

        if (isNaN(valor) || valor <= 0) {
            alert('Digite um valor válido.');
            return;
        }

        const forma = formaPagamentoMovimento.value;

        const descricao = descricaoMovimento.value.trim() ||
            (
                tipoMovimentoAtual === 'entrada'
                    ? 'Entrada manual'
                    : 'Saída manual'
            );

        const movimentacoes = obterMovimentacoes();

        const novoMovimento = {
            id: Date.now(),
            data: dataHoje(),
            dataChave: dataChave(),
            hora: horaAtual(),
            tipo: tipoMovimentoAtual,
            valor: valor,
            descricao: descricao,
            formaPagamento: forma,
            formaPagamentoNome: nomeFormaPagamento(forma)
        };

        // Vincula a movimentação à sessão aberta.
        if (window.DrTrocoCaixa) {
            try {
                window.DrTrocoCaixa.attachMovement(novoMovimento);
            } catch (erro) {
                alert(erro.message);
                return;
            }
        }

        movimentacoes.push(novoMovimento);

        localStorage.setItem(
            CHAVE_MOVIMENTACOES,
            JSON.stringify(movimentacoes)
        );

        fecharModal('modalMovimento');

        carregarFluxo();

    });

}


// ============================================
// BOTÕES PRINCIPAIS
// ============================================

const btnSaldoInicial = document.getElementById('btnSaldoInicial');

const btnAdicionarEntrada = document.getElementById('btnAdicionarEntrada');

const btnAdicionarSaida = document.getElementById('btnAdicionarSaida');


if (btnSaldoInicial) {
    btnSaldoInicial.addEventListener('click', abrirSaldoInicial);
}

if (btnAdicionarEntrada) {
    btnAdicionarEntrada.addEventListener('click', abrirEntrada);
}

if (btnAdicionarSaida) {
    btnAdicionarSaida.addEventListener('click', abrirSaida);
}


// ============================================
// CALCULAR FLUXO
// ============================================

function carregarFluxo() {

    const vendas = obterVendas();
    const movimentacoes = obterMovimentacoes();

    const hoje = dataHoje();
    const chaveHoje = dataChave();

    if (dataFluxo) {
        dataFluxo.textContent = hoje;
    }


    // ========================================
    // VENDAS DE HOJE
    // ========================================

    const vendasHoje = vendas.filter(
        venda => venda.data === hoje
    );

    let dinheiro = 0;
    let pix = 0;
    let debito = 0;
    let credito = 0;

    vendasHoje.forEach(venda => {

        const valor = Number(
            venda.total ||
            venda.valorConta ||
            0
        );

        if (venda.formaPagamento === 'dinheiro') {
            dinheiro += valor;
        } else if (venda.formaPagamento === 'pix') {
            pix += valor;
        } else if (venda.formaPagamento === 'debito') {
            debito += valor;
        } else if (venda.formaPagamento === 'credito') {
            credito += valor;
        }

    });


    // ========================================
    // MOVIMENTAÇÕES DE HOJE
    // ========================================

    const movimentosHoje = movimentacoes.filter(movimento => {

        return (
            movimento.data === hoje ||
            movimento.dataChave === chaveHoje
        );

    });

    let entradas = 0;
    let saidas = 0;

    movimentosHoje.forEach(movimento => {

        const valor = Number(movimento.valor || 0);

        if (movimento.tipo === 'entrada') {
            entradas += valor;
        } else if (movimento.tipo === 'saida') {
            saidas += valor;
        }

    });


    // ========================================
    // DINHEIRO FÍSICO
    // ========================================

    const saldoInicial = obterSaldoInicialHoje();

    const entradasDinheiro = movimentosHoje
        .filter(movimento =>
            movimento.tipo === 'entrada' &&
            (
                movimento.formaPagamento === 'dinheiro' ||
                !movimento.formaPagamento
            )
        )
        .reduce(
            (total, movimento) =>
                total + Number(movimento.valor || 0),
            0
        );

    const saidasDinheiro = movimentosHoje
        .filter(movimento =>
            movimento.tipo === 'saida' &&
            (
                movimento.formaPagamento === 'dinheiro' ||
                !movimento.formaPagamento
            )
        )
        .reduce(
            (total, movimento) =>
                total + Number(movimento.valor || 0),
            0
        );

    const saldoCaixaAtual =
        saldoInicial +
        dinheiro +
        entradasDinheiro -
        saidasDinheiro;


    // ========================================
    // ATUALIZAR TELA
    // ========================================

    if (saldoCaixa) {
        saldoCaixa.textContent = formatarReal(saldoCaixaAtual);
    }

    if (saldoInicialEl) {
        saldoInicialEl.textContent = formatarReal(saldoInicial);
    }

    if (totalEntradasCaixa) {
        totalEntradasCaixa.textContent = formatarReal(
            dinheiro + entradasDinheiro
        );
    }

    if (totalSaidasCaixa) {
        totalSaidasCaixa.textContent = formatarReal(saidasDinheiro);
    }

    if (totalDinheiro) {
        totalDinheiro.textContent = formatarReal(dinheiro);
    }

    if (totalPix) {
        totalPix.textContent = formatarReal(pix);
    }

    if (totalDebito) {
        totalDebito.textContent = formatarReal(debito);
    }

    if (totalCredito) {
        totalCredito.textContent = formatarReal(credito);
    }

    const totalVendido =
        dinheiro +
        pix +
        debito +
        credito;

    if (totalVendas) {
        totalVendas.textContent = formatarReal(totalVendido);
    }

    if (quantidadeVendas) {
        quantidadeVendas.textContent = vendasHoje.length;
    }

    renderizarMovimentacoes(movimentosHoje);


    // ========================================
    // INTEGRAÇÃO COM SESSÃO DE CAIXA
    // ========================================

    const sessaoAtual = window.DrTrocoCaixa?.current();

    if (sessaoAtual) {

        const resumoSessao =
            window.DrTrocoCaixa.totals(sessaoAtual);

        const movimentosSessao = obterMovimentacoes().filter(
            movimento =>
                movimento.caixaSessaoId === sessaoAtual.id
        );

        const entradasDinheiroSessao = movimentosSessao
            .filter(m =>
                m.tipo === 'entrada' &&
                (
                    !m.formaPagamento ||
                    m.formaPagamento === 'dinheiro'
                )
            )
            .reduce(
                (soma, m) => soma + Number(m.valor || 0),
                0
            );

        const saidasDinheiroSessao = movimentosSessao
            .filter(m =>
                m.tipo === 'saida' &&
                (
                    !m.formaPagamento ||
                    m.formaPagamento === 'dinheiro'
                )
            )
            .reduce(
                (soma, m) => soma + Number(m.valor || 0),
                0
            );

        if (saldoCaixa) {
            saldoCaixa.textContent =
                formatarReal(resumoSessao.caixaEsperado);
        }

        if (saldoInicialEl) {
            saldoInicialEl.textContent =
                formatarReal(sessaoAtual.valorAbertura);
        }

        if (totalEntradasCaixa) {
            totalEntradasCaixa.textContent =
                formatarReal(
                    resumoSessao.dinheiro +
                    entradasDinheiroSessao
                );
        }

        if (totalSaidasCaixa) {
            totalSaidasCaixa.textContent =
                formatarReal(saidasDinheiroSessao);
        }

        if (totalDinheiro) {
            totalDinheiro.textContent =
                formatarReal(resumoSessao.dinheiro);
        }

        if (totalPix) {
            totalPix.textContent =
                formatarReal(resumoSessao.pix);
        }

        if (totalDebito) {
            totalDebito.textContent =
                formatarReal(resumoSessao.debito);
        }

        if (totalCredito) {
            totalCredito.textContent =
                formatarReal(resumoSessao.credito);
        }

        if (totalVendas) {
            totalVendas.textContent =
                formatarReal(resumoSessao.totalVendas);
        }

        if (quantidadeVendas) {
            quantidadeVendas.textContent =
                resumoSessao.vendas;
        }

        renderizarMovimentacoes(movimentosSessao);

    }

}


// ============================================
// RENDERIZAR MOVIMENTAÇÕES — VISUAL MELHORADO
// ============================================

function renderizarMovimentacoes(movimentacoes) {

    if (!listaMovimentacoes) return;

    if (!movimentacoes.length) {

        listaMovimentacoes.innerHTML = `
            <div class="movimentacoes-vazio">
                <div>📋</div>
                <strong>Nenhuma movimentação</strong>
                <span>As entradas e saídas aparecerão aqui.</span>
            </div>
        `;

        return;
    }

    listaMovimentacoes.innerHTML = '';

    movimentacoes
        .slice()
        .reverse()
        .forEach(movimento => {

            const item = document.createElement('div');

            item.className =
                `movimentacao-item ${
                    movimento.tipo === 'entrada'
                        ? 'movimentacao-entrada'
                        : 'movimentacao-saida'
                }`;

            const ehEntrada =
                movimento.tipo === 'entrada';

            const sinal = ehEntrada ? '+' : '−';
            const classe = ehEntrada ? 'entrada' : 'saida';
            const icone = ehEntrada ? '↙' : '↗';

            const descricao = movimento.descricao ||
                (ehEntrada ? 'Entrada' : 'Saída');

            const forma = movimento.formaPagamentoNome ||
                (
                    movimento.formaPagamento
                        ? nomeFormaPagamento(movimento.formaPagamento)
                        : 'Dinheiro'
                );

            const hora = movimento.hora || '';

            item.innerHTML = `
                <div class="movimentacao-icone ${classe}"
                     aria-hidden="true">
                    ${icone}
                </div>

                <div class="movimentacao-info">
                    <strong class="movimentacao-descricao">
                        ${escaparHTML(descricao)}
                    </strong>

                    <div class="movimentacao-detalhes">
                        <span class="movimentacao-forma">
                            ${escaparHTML(forma)}
                        </span>

                        ${hora ? `
                            <span class="movimentacao-separador">•</span>
                            <span class="movimentacao-hora">
                                ${escaparHTML(hora)}
                            </span>
                        ` : ''}
                    </div>

                    <span class="movimentacao-tipo ${classe}">
                        ${ehEntrada
                            ? 'Entrada registrada'
                            : 'Saída registrada'}
                    </span>
                </div>

                <div class="movimentacao-lateral">
                    <strong class="movimentacao-valor ${classe}">
                        ${sinal} ${formatarReal(movimento.valor)}
                    </strong>

                    <button
                        type="button"
                        class="btn-excluir-movimento"
                        data-id="${escaparHTML(movimento.id)}"
                        title="Excluir movimentação"
                        aria-label="Excluir movimentação: ${escaparHTML(descricao)}">
                        <span aria-hidden="true">🗑️</span>
                    </button>
                </div>
            `;

            listaMovimentacoes.appendChild(item);

        });

    listaMovimentacoes
        .querySelectorAll('.btn-excluir-movimento')
        .forEach(botao => {

            botao.addEventListener('click', () => {
                excluirMovimentacao(botao.dataset.id);
            });

        });

}


// ============================================
// SEGURANÇA
// ============================================

function escaparHTML(texto) {

    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

}


// ============================================
// EXCLUIR MOVIMENTAÇÃO
// ============================================

function excluirMovimentacao(id) {

    const registro = obterMovimentacoes().find(
        m => String(m.id) === String(id)
    );

    if (registro?.caixaSessaoId) {

        alert(
            'Esta movimentação está vinculada a uma sessão de caixa. Não exclua o lançamento; registre uma movimentação de ajuste para manter a conferência.'
        );

        return;
    }

    const confirmar = confirm(
        'Excluir esta movimentação?'
    );

    if (!confirmar) {
        return;
    }

    const movimentacoes = obterMovimentacoes();

    const novasMovimentacoes = movimentacoes.filter(
        movimento =>
            String(movimento.id) !== String(id)
    );

    localStorage.setItem(
        CHAVE_MOVIMENTACOES,
        JSON.stringify(novasMovimentacoes)
    );

    carregarFluxo();

}


// ============================================
// INICIAR
// ============================================

carregarFluxo();
