// ============================================
// DR. TROCO — FLUXO DE CAIXA
// Vendas, movimentações e saldos sincronizados com Supabase
// via window.DrTrocoDados (dados-supabase.js)
// ============================================

const CHAVE_VENDAS = 'drTroco_vendas';
const CHAVE_MOVIMENTACOES = 'drTroco_movimentacoes';
const CHAVE_SALDOS_INICIAIS = 'drTroco_saldosIniciais';
const CHAVE_CONFIG_CAIXA = 'drTroco_configCaixa';

let tipoMovimentoAtual = 'entrada';


// ============================================
// CONFIGURAÇÕES DE HORÁRIO DE CORTE
// ============================================

function obterConfigCaixa() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CONFIG_CAIXA) || '{"horarioCorte": "04:00"}');
    } catch {
        return { horarioCorte: '04:00' };
    }
}


// ============================================
// FUNÇÕES BÁSICAS E DATA OPERACIONAL
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

function obterDataOperacional(dataCustomizada = new Date()) {
    const config = obterConfigCaixa();
    const [horaCorte, minutoCorte] = (config.horarioCorte || '04:00').split(':').map(Number);

    const d = new Date(dataCustomizada);
    const horaAtualD = d.getHours();
    const minutoAtualD = d.getMinutes();

    if (horaAtualD < horaCorte || (horaAtualD === horaCorte && minutoAtualD < minutoCorte)) {
        d.setDate(d.getDate() - 1);
    }

    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
}

function dataHojeFormatada() {
    const [ano, mes, dia] = obterDataOperacional().split('-');
    return `${dia}/${mes}/${ano}`;
}

function horaAtual() {
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function dataChave() {
    return obterDataOperacional();
}


// ============================================
// ELEMENTOS DA TELA DE FLUXO
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

async function salvarSaldoInicial(valor) {
    const chave = dataChave();

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarSaldoInicial === 'function') {
        const r = await window.DrTrocoDados.salvarSaldoInicial(chave, valor);
        if (!r || !r.ok) {
            throw new Error((r && r.erro) || 'Falha ao salvar saldo inicial.');
        }
        return;
    }

    const saldos = obterSaldosIniciais();
    saldos[chave] = valor;
    localStorage.setItem(CHAVE_SALDOS_INICIAIS, JSON.stringify(saldos));
}

function abrirSaldoInicial() {
    if (valorSaldoInicial) {
        valorSaldoInicial.value = obterSaldoInicialHoje() || '';
    }
    esconderMenuInferior();
    if (modalSaldoInicial) modalSaldoInicial.classList.add('aberto');
    setTimeout(() => { if (valorSaldoInicial) valorSaldoInicial.focus(); }, 150);
}


// ============================================
// ABRIR ENTRADA / SAÍDA
// ============================================

function abrirEntrada() {
    tipoMovimentoAtual = 'entrada';
    if (tituloModalMovimento) tituloModalMovimento.textContent = '➕ Nova entrada';
    if (btnConfirmarMovimento) btnConfirmarMovimento.textContent = 'Registrar entrada';
    limparFormularioMovimento();
    esconderMenuInferior();
    if (modalMovimento) modalMovimento.classList.add('aberto');
    setTimeout(() => { if (valorMovimento) valorMovimento.focus(); }, 150);
}

function abrirSaida() {
    tipoMovimentoAtual = 'saida';
    if (tituloModalMovimento) tituloModalMovimento.textContent = '➖ Nova saída';
    if (btnConfirmarMovimento) btnConfirmarMovimento.textContent = 'Registrar saída';
    limparFormularioMovimento();
    esconderMenuInferior();
    if (modalMovimento) modalMovimento.classList.add('aberto');
    setTimeout(() => { if (valorMovimento) valorMovimento.focus(); }, 150);
}

function limparFormularioMovimento() {
    if (valorMovimento) valorMovimento.value = '';
    if (descricaoMovimento) descricaoMovimento.value = '';
    if (formaPagamentoMovimento) formaPagamentoMovimento.value = 'dinheiro';
}


// ============================================
// FECHAR MODAIS
// ============================================

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('aberto');
    const outroModalAberto = document.querySelector('.modal-fluxo.aberto');
    if (!outroModalAberto) {
        mostrarMenuInferior();
    }
}

document.querySelectorAll('[data-fechar]').forEach(botao => {
    botao.addEventListener('click', () => {
        fecharModal(botao.dataset.fechar);
    });
});

[modalSaldoInicial, modalMovimento].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', evento => {
        if (evento.target === modal) {
            modal.classList.remove('aberto');
            mostrarMenuInferior();
        }
    });
});


// ============================================
// SUBMITS (SALDO INICIAL E MOVIMENTOS)
// ============================================

if (formSaldoInicial) {
    formSaldoInicial.addEventListener('submit', async evento => {
        evento.preventDefault();
        const valor = Number(String(valorSaldoInicial.value).replace(',', '.'));
        if (isNaN(valor) || valor < 0) {
            alert('Digite um valor válido.');
            return;
        }

        const btn = evento.target.querySelector('button[type="submit"]');
        const textoOriginal = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

        try {
            await salvarSaldoInicial(valor);
            fecharModal('modalSaldoInicial');
            carregarFluxo();
        } catch (err) {
            console.error('[Fluxo] Falha ao salvar saldo inicial:', err);
            alert('Não foi possível salvar o saldo inicial.\n' + (err.message || ''));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoOriginal || 'Salvar saldo inicial'; }
        }
    });
}

if (formMovimento) {
    formMovimento.addEventListener('submit', async evento => {
        evento.preventDefault();
        const valor = Number(String(valorMovimento.value).replace(',', '.'));
        if (isNaN(valor) || valor <= 0) {
            alert('Digite um valor válido.');
            return;
        }
        const forma = formaPagamentoMovimento ? formaPagamentoMovimento.value : 'dinheiro';
        const descricao = descricaoMovimento.value.trim() ||
            (tipoMovimentoAtual === 'entrada' ? 'Entrada manual' : 'Saída manual');

        const novoMovimento = {
            id: String(Date.now()),
            data: dataHojeFormatada(),
            dataChave: dataChave(),
            hora: horaAtual(),
            tipo: tipoMovimentoAtual,
            valor: valor,
            descricao: descricao,
            formaPagamento: forma,
            formaPagamentoNome: nomeFormaPagamento(forma)
        };

        try {
            if (window.DrTrocoCaixa && typeof window.DrTrocoCaixa.current === 'function') {
                const sessaoAtual = window.DrTrocoCaixa.current();
                if (sessaoAtual) {
                    novoMovimento.caixaSessaoId = sessaoAtual.id;
                    novoMovimento.caixaSessaoNumero = sessaoAtual.numero;
                }
            }
        } catch (e) {}

        const btn = evento.target.querySelector('button[type="submit"]');
        const textoOriginal = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

        try {
            if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarMovimentacao === 'function') {
                const r = await window.DrTrocoDados.salvarMovimentacao(novoMovimento);
                if (!r || !r.ok) {
                    console.warn('[Fluxo] Movimentação salva apenas localmente:', r && r.erro);
                }
            } else {
                const movimentacoes = obterMovimentacoes();
                movimentacoes.push(novoMovimento);
                localStorage.setItem(CHAVE_MOVIMENTACOES, JSON.stringify(movimentacoes));
            }

            fecharModal('modalMovimento');
            carregarFluxo();
        } catch (err) {
            console.error('[Fluxo] Falha ao registrar movimentação:', err);
            alert('Não foi possível registrar a movimentação.\n' + (err.message || ''));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
        }
    });
}


// ============================================
// BOTÕES PRINCIPAIS
// ============================================

const btnSaldoInicial = document.getElementById('btnSaldoInicial');
const btnAdicionarEntrada = document.getElementById('btnAdicionarEntrada');
const btnAdicionarSaida = document.getElementById('btnAdicionarSaida');

if (btnSaldoInicial) btnSaldoInicial.addEventListener('click', abrirSaldoInicial);
if (btnAdicionarEntrada) btnAdicionarEntrada.addEventListener('click', abrirEntrada);
if (btnAdicionarSaida) btnAdicionarSaida.addEventListener('click', abrirSaida);


// ============================================
// CALCULAR FLUXO DO DIA
// ============================================

function carregarFluxo() {
    const vendas = obterVendas();
    const movimentacoes = obterMovimentacoes();

    const hojeStr = dataHojeFormatada();
    const chaveHoje = dataChave();

    if (dataFluxo) {
        dataFluxo.textContent = hojeStr;
    }

    const vendasHoje = vendas.filter(venda => venda.data === hojeStr || venda.dataChave === chaveHoje);

    let dinheiro = 0;
    let pix = 0;
    let debito = 0;
    let credito = 0;

    vendasHoje.forEach(venda => {
        const valor = Number(venda.total || venda.valorConta || 0);
        if (venda.formaPagamento === 'dinheiro') dinheiro += valor;
        else if (venda.formaPagamento === 'pix') pix += valor;
        else if (venda.formaPagamento === 'debito') debito += valor;
        else if (venda.formaPagamento === 'credito') credito += valor;
    });

    const movimentosHoje = movimentacoes.filter(movimento => {
        return movimento.data === hojeStr || movimento.dataChave === chaveHoje;
    });

    const saldoInicial = obterSaldoInicialHoje();

    const entradasDinheiro = movimentosHoje
        .filter(m => m.tipo === 'entrada' && (!m.formaPagamento || m.formaPagamento === 'dinheiro'))
        .reduce((t, m) => t + Number(m.valor || 0), 0);

    const saidasDinheiro = movimentosHoje
        .filter(m => m.tipo === 'saida' && (!m.formaPagamento || m.formaPagamento === 'dinheiro'))
        .reduce((t, m) => t + Number(m.valor || 0), 0);

    const saldoCaixaAtual = saldoInicial + dinheiro + entradasDinheiro - saidasDinheiro;

    if (saldoCaixa) saldoCaixa.textContent = formatarReal(saldoCaixaAtual);
    if (saldoInicialEl) saldoInicialEl.textContent = formatarReal(saldoInicial);
    if (totalEntradasCaixa) totalEntradasCaixa.textContent = formatarReal(dinheiro + entradasDinheiro);
    if (totalSaidasCaixa) totalSaidasCaixa.textContent = formatarReal(saidasDinheiro);

    if (totalDinheiro) totalDinheiro.textContent = formatarReal(dinheiro);
    if (totalPix) totalPix.textContent = formatarReal(pix);
    if (totalDebito) totalDebito.textContent = formatarReal(debito);
    if (totalCredito) totalCredito.textContent = formatarReal(credito);

    const totalVendido = dinheiro + pix + debito + credito;
    if (totalVendas) totalVendas.textContent = formatarReal(totalVendido);
    if (quantidadeVendas) quantidadeVendas.textContent = vendasHoje.length;

    renderizarMovimentacoes(movimentosHoje);
}


// ============================================
// RENDERIZAR MOVIMENTAÇÕES
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

    movimentacoes.slice().reverse().forEach(movimento => {
        const item = document.createElement('div');
        item.className = `movimentacao-item ${movimento.tipo === 'entrada' ? 'movimentacao-entrada' : 'movimentacao-saida'}`;

        const ehEntrada = movimento.tipo === 'entrada';
        const sinal = ehEntrada ? '+' : '−';
        const classe = ehEntrada ? 'entrada' : 'saida';
        const icone = ehEntrada ? '↙' : '↗';
        const descricao = movimento.descricao || (ehEntrada ? 'Entrada' : 'Saída');
        const forma = movimento.formaPagamentoNome || (movimento.formaPagamento ? nomeFormaPagamento(movimento.formaPagamento) : 'Dinheiro');
        const hora = movimento.hora || '';

        item.innerHTML = `
            <div class="movimentacao-icone ${classe}" aria-hidden="true">${icone}</div>
            <div class="movimentacao-info">
                <strong class="movimentacao-descricao">${escaparHTML(descricao)}</strong>
                <div class="movimentacao-detalhes">
                    <span class="movimentacao-forma">${escaparHTML(forma)}</span>
                    ${hora ? `<span class="movimentacao-separador">•</span><span class="movimentacao-hora">${escaparHTML(hora)}</span>` : ''}
                </div>
                <span class="movimentacao-tipo ${classe}">${ehEntrada ? 'Entrada registrada' : 'Saída registrada'}</span>
            </div>
            <div class="movimentacao-lateral">
                <strong class="movimentacao-valor ${classe}">${sinal} ${formatarReal(movimento.valor)}</strong>
                <button type="button" class="btn-excluir-movimento" data-id="${escaparHTML(movimento.id)}" title="Excluir movimentação" aria-label="Excluir movimentação">
                    <span aria-hidden="true">🗑️</span>
                </button>
            </div>
        `;
        listaMovimentacoes.appendChild(item);
    });

    listaMovimentacoes.querySelectorAll('.btn-excluir-movimento').forEach(botao => {
        botao.addEventListener('click', () => {
            excluirMovimentacao(botao.dataset.id);
        });
    });
}


// ============================================
// SEGURANÇA E EXCLUSÃO
// ============================================

function escaparHTML(texto) {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function excluirMovimentacao(id) {
    if (!confirm('Excluir esta movimentação?')) return;

    try {
        if (window.DrTrocoDados && typeof window.DrTrocoDados.excluirMovimentacao === 'function') {
            const r = await window.DrTrocoDados.excluirMovimentacao(id);
            if (!r || !r.ok) {
                alert('Não foi possível excluir no servidor.\n' + ((r && r.erro) || ''));
                return;
            }
        } else {
            const movimentacoes = obterMovimentacoes();
            const novas = movimentacoes.filter(m => String(m.id) !== String(id));
            localStorage.setItem(CHAVE_MOVIMENTACOES, JSON.stringify(novas));
        }
        carregarFluxo();
    } catch (err) {
        console.error('[Fluxo] Falha ao excluir movimentação:', err);
        alert('Erro ao excluir movimentação.\n' + (err.message || ''));
    }
}


// ============================================
// INICIAR
// ============================================

// Renderiza imediatamente com o que está no cache local
carregarFluxo();

// Sincroniza com o Supabase e re-renderiza SEMPRE (mesmo se retornar false)
if (window.DrTrocoDados) {
    // Escuta qualquer sincronização (mesmo parcial)
    if (typeof window.DrTrocoDados.onSync === 'function') {
        window.DrTrocoDados.onSync(() => {
            console.log('[Fluxo] onSync disparado — re-renderizando');
            carregarFluxo();
        });
    }

    // Dispara sincronização inicial
    if (typeof window.DrTrocoDados.sincronizar === 'function') {
        window.DrTrocoDados.sincronizar()
            .then(resultado => {
                console.log('[Fluxo] Sync finalizado. Resultado:', resultado);
                // Re-renderiza de qualquer forma (segurança dupla)
                carregarFluxo();
            })
            .catch(err => {
                console.warn('[Fluxo] Sync falhou:', err);
                carregarFluxo();
            });
    }
}
