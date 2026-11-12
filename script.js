// ============================================================
// DR. TROCO — CALCULADORA DE VENDAS + PDV + FIADO (OTIMIZADO)
// ============================================================

'use strict';

let formaPagamento = 'dinheiro';
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

const CHAVE_VENDAS = 'drTroco_vendas';
const CHAVE_ESTOQUE = 'drTroco_estoque';
const CHAVE_MOVIMENTACOES = 'drTroco_movimentacoes';

// Elementos do DOM principais
const $ = (id) => document.getElementById(id);
const valorContaInput = $('valorConta');
const valorRecebidoInput = $('valorRecebido');
const totalCobrar = $('totalCobrar');
const quantidadeItensVenda = $('quantidadeItensVenda');
const valorTroco = $('valorTroco');
const rowTroco = $('rowTroco');
const groupRecebido = $('groupRecebido');
const btnLimparVenda = $('btnLimparVenda');
const btnRegistrarVenda = $('btnRegistrarVenda');
const btnCancelarVenda = $('btnCancelarVenda');
const btnAdicionarProduto = $('btnAdicionarProduto');
const listaProdutosVenda = $('listaProdutosVenda');
const produtosVendaVazio = $('produtosVendaVazio');
const secaoCedulas = $('secaoCedulas');
const listaCedulas = $('listaCedulas');

// Campos do fiado
const groupFiado = $('groupFiado');
const nomeClienteFiado = $('nomeClienteFiado');
const valorPagoInicialFiado = $('valorEntradaFiado') || $('valorPagoInicialFiado');
const formaPagamentoInicialFiado = $('metodoEntradaFiado') || $('formaPagamentoInicialFiado');
const rowSaldoDevedorFiado = $('rowSaldoDevedorFiado');
const saldoDevedorVenda = $('saldoPendenteFiado') || $('saldoDevedorVenda');

// Elementos do Fiado (Busca)
const buscaClienteFiado = $('buscaClienteFiado');
const listaClientesFiado = $('listaClientesFiado');
const clienteSelecionadoVenda = $('clienteSelecionadoVenda');
const nomeClienteSelecionadoVenda = $('nomeClienteSelecionadoVenda');
const btnTrocarClienteVenda = $('btnTrocarClienteVenda');
let clientesFiadoCache = [];

// Modais
const modalProdutosVenda = $('modalProdutosVenda');
const btnFecharProdutosVenda = $('btnFecharProdutosVenda');
const btnConcluirProdutosVenda = $('btnConcluirProdutosVenda');
const btnAbrirLeitorVenda = $('btnAbrirLeitorVenda');
const buscaProdutoVenda = $('buscaProdutoVenda');
const listaProdutosEstoqueVenda = $('listaProdutosEstoqueVenda');

const modalLeitorVenda = $('modalLeitorVenda');
const btnFecharLeitorVenda = $('btnFecharLeitorVenda');
const btnFecharLeitorVenda2 = $('btnFecharLeitorVenda2');
const videoLeitorVenda = $('videoLeitorVenda');
const molduraLeitorVenda = $('molduraLeitorVenda');
const mensagemLeitorVenda = $('mensagemLeitorVenda');
const statusLeitorVenda = $('statusLeitorVenda');

const modalConfirmarVenda = $('modalConfirmarVenda');
const resumoConfirmacaoVenda = $('resumoConfirmacaoVenda');
const btnFecharConfirmacao = $('btnFecharConfirmacao');
const btnCancelarConfirmacao = $('btnCancelarConfirmacao');
const btnConfirmarVenda = $('btnConfirmarVenda');

// Modais Pix
const modalPix = $('modalPix');
const btnFecharPix = $('btnFecharPix');
const btnGerarQrCodePix = $('btnGerarQrCodePix');

// ------------------------------------------------------------
// Multiestabelecimento & LocalStorage
// ------------------------------------------------------------
function obterComercioIdLocal() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const chave = localStorage.key(i);
            if (chave && chave.startsWith("drTroco_estoque_") && chave !== "drTroco_estoque_legado") {
                return chave.replace("drTroco_estoque_", "");
            }
        }
    } catch (e) {
        console.warn("Erro ao buscar comércio ID:", e);
    }
    return null;
}

function obterChaveEstoqueComercio() {
    const comercioId = obterComercioIdLocal();
    return comercioId ? `${CHAVE_ESTOQUE}_${comercioId}` : CHAVE_ESTOQUE;
}

function obterChaveMovimentacoesEstoqueComercio() {
    const comercioId = obterComercioIdLocal();
    const base = "drTroco_movimentacoesEstoque";
    return comercioId ? `${base}_${comercioId}` : base;
}

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

const obterEstoque = () => lerListaLocalStorage(obterChaveEstoqueComercio());
const salvarEstoque = (estoque) => salvarListaLocalStorage(obterChaveEstoqueComercio(), estoque);

// ------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------
const numeroSeguro = (valor) => {
    const num = typeof valor === 'number' ? valor : parseFloat(String(valor ?? '').replace(',', '.'));
    return Number.isFinite(num) ? Math.max(0, num) : 0;
};

const centavos = (valor) => Math.round((Number(valor) || 0) * 100);

const normalizar = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const formatarReal = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const escaparHTML = (texto) => String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escaparAtributo = (texto) => escaparHTML(texto);

function mostrarElemento(elemento, mostrar, display = 'block') {
    if (!elemento) return;
    elemento.classList.toggle('hidden', !mostrar);
    elemento.style.setProperty('display', mostrar ? display : 'none', 'important');
}

// ------------------------------------------------------------
// Modais
// ------------------------------------------------------------
function abrirModalOverlay(modal, camada = 9999) {
    if (!modal) return false;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);

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

    const algumAberto = [modalProdutosVenda, modalLeitorVenda, modalConfirmarVenda, modalPix].some(m => m && m.classList.contains('aberto') && !m.classList.contains('hidden'));
    document.body.classList.toggle('modal-aberto', algumAberto);
    document.body.style.overflow = algumAberto ? 'hidden' : '';
}

// ------------------------------------------------------------
// Datas e Turno
// ------------------------------------------------------------
function obterDataHoraAtual() {
    const agora = new Date();

    let horaCorte = 4;
    let minutoCorte = 0;
    try {
        const config = JSON.parse(localStorage.getItem('drTroco_configCaixa') || '{}');
        const [h, m] = String(config.horarioCorte || '04:00').split(':').map(Number);
        if (Number.isFinite(h)) horaCorte = h;
        if (Number.isFinite(m)) minutoCorte = m;
    } catch (e) { /* mantém o padrão */ }

    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();

    if (horaAtual < horaCorte || (horaAtual === horaCorte && minutoAtual < minutoCorte)) {
        agora.setDate(agora.getDate() - 1);
    }

    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();

    const hora = String(new Date().getHours()).padStart(2, '0');
    const minuto = String(new Date().getMinutes()).padStart(2, '0');
    const segundo = String(new Date().getSeconds()).padStart(2, '0');

    return {
        data: `${dia}/${mes}/${ano}`,
        dataChave: `${ano}-${mes}-${dia}`,
        hora: `${hora}:${minuto}:${segundo}`
    };
}

// ------------------------------------------------------------
// Estorno de Estoque (local + Supabase)
// ------------------------------------------------------------
async function reverterEstoquePorVenda(venda) {
    if (!venda?.produtos || !Array.isArray(venda.produtos) || !venda.produtos.length) {
        return { ok: true, produtosEstornados: 0, erros: [] };
    }

    const erros = [];
    let produtosEstornados = 0;

    // 1. Reverter no Supabase (se disponível)
    const podeUsarSupabase =
        window.EstoqueSupabase &&
        typeof window.EstoqueSupabase.obterComercioId === 'function' &&
        typeof window.EstoqueSupabase.salvarProduto === 'function' &&
        typeof window.EstoqueSupabase.salvarMovimentacao === 'function' &&
        typeof window.EstoqueSupabase.carregarProdutos === 'function';

    if (podeUsarSupabase) {
        try {
            await window.EstoqueSupabase.obterComercioId();
            const produtosRemotos = await window.EstoqueSupabase.carregarProdutos();

            for (const itemVendido of venda.produtos) {
                try {
                    const prodRemoto = produtosRemotos.find(p => String(p.id) === String(itemVendido.id));
                    if (!prodRemoto) {
                        erros.push(`Produto "${itemVendido.nome}" não existe mais no Supabase.`);
                        continue;
                    }

                    const qtdAnt = Number(prodRemoto.quantidade) || 0;
                    const qtdNova = qtdAnt + (Number(itemVendido.quantidade) || 0);

                    await window.EstoqueSupabase.salvarProduto({
                        ...prodRemoto,
                        quantidade: qtdNova
                    });

                    const dataHora = obterDataHoraAtual();
                    await window.EstoqueSupabase.salvarMovimentacao({
                        produtoId: prodRemoto.id,
                        produtoNome: prodRemoto.nome,
                        tipo: 'entrada',
                        quantidade: Number(itemVendido.quantidade) || 0,
                        quantidadeAnterior: qtdAnt,
                        quantidadeNova: qtdNova,
                        data: dataHora.dataChave,
                        hora: dataHora.hora
                    });

                    produtosEstornados++;
                } catch (e) {
                    console.error('[Estorno] Erro no produto', itemVendido.nome, e);
                    erros.push(`${itemVendido.nome}: ${e.message}`);
                }
            }
        } catch (e) {
            console.error('[Estorno] Erro ao conectar Supabase:', e);
            erros.push(`Conexão Supabase: ${e.message}`);
        }
    }

    // 2. Reverter no localStorage (sempre)
    const estoque = obterEstoque();
    venda.produtos.forEach(itemVendido => {
        const prod = estoque.find(p => String(p.id) === String(itemVendido.id));
        if (prod) {
            prod.quantidade = numeroSeguro(prod.quantidade) + numeroSeguro(itemVendido.quantidade);
            prod.atualizadoEm = new Date().toISOString();
        }
    });
    salvarEstoque(estoque);

    // 3. Remover movimentações locais de saída dessa venda
    const chaveMovEstoque = obterChaveMovimentacoesEstoqueComercio();
    const movimentacoesEstoque = lerListaLocalStorage(chaveMovEstoque)
        .filter(mov => mov.vendaId !== venda.id);
    localStorage.setItem(chaveMovEstoque, JSON.stringify(movimentacoesEstoque));

    return { ok: erros.length === 0, produtosEstornados, erros };
}
window.reverterEstoquePorVenda = reverterEstoquePorVenda;

const nomeFormaPagamento = (metodo) => ({ dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado' })[String(metodo || '').toLowerCase()] || 'Dinheiro';

// ------------------------------------------------------------
// Integração Pix (QR Code)
// ------------------------------------------------------------
function obterConfigPix() {
    try {
        const config = JSON.parse(localStorage.getItem('drTroco_configPix') || '{}');
        if (config.chave) return config;
    } catch (e) {}
    return { chave: '', nome: '', cidade: '' };
}

function gerarPayloadPix(chave, nome, cidade, valor) {
    function getTLV(id, value) {
        return id + value.length.toString().padStart(2, '0') + value;
    }
    let payload = '';
    payload += getTLV('00', '01');
    let merchantAccount = getTLV('00', 'br.gov.bcb.pix') + getTLV('01', chave);
    payload += getTLV('26', merchantAccount);
    payload += getTLV('52', '0000');
    payload += getTLV('53', '986');
    payload += getTLV('54', valor.toFixed(2));
    payload += getTLV('58', 'BR');
    payload += getTLV('59', nome.substring(0, 25).toUpperCase() || 'LOJA');
    payload += getTLV('60', cidade.substring(0, 15).toUpperCase() || 'SAO PAULO');
    let additionalData = getTLV('05', '***');
    payload += getTLV('62', additionalData);
    payload += '6304';

    // Calcula CRC16
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    payload += (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    return payload;
}

function abrirModalPix(valor) {
    const config = obterConfigPix();

    if (!config.chave) {
        alert('Chave Pix não configurada!\n\nVá no Painel do Lojista (aba Recebimento Pix) para configurar sua chave e poder gerar o QR Code.');
        return;
    }

    if (typeof window.qrcode === 'undefined') {
        alert('Erro: Biblioteca geradora de QR Code não carregou. Verifique sua conexão com a internet e recarregue a página.');
        return;
    }

    const payload = gerarPayloadPix(config.chave, config.nome, config.cidade, valor);

    // Gera o QR Code
    const qr = window.qrcode(0, 'L');
    qr.addData(payload);
    qr.make();

    const imgContainer = $('pixQrCodeImg');
    if (imgContainer) imgContainer.innerHTML = qr.createImgTag(6, 10);

    const valorExibicao = $('pixValorExibicao');
    if (valorExibicao) valorExibicao.textContent = `Valor: ${formatarReal(valor)}`;

    // Configura o botão de copiar
    const btnCopiar = $('btnCopiarPix');
    if (btnCopiar) {
        btnCopiar.onclick = () => {
            navigator.clipboard.writeText(payload).then(() => {
                alert('Código Pix copiado!');
            }).catch(err => {
                console.error('Erro ao copiar:', err);
                alert('Não foi possível copiar automaticamente. Selecione o código manualmente.');
            });
        };
    }

    abrirModalOverlay(modalPix, 10003);
}

// ------------------------------------------------------------
// Busca de Clientes do Fiado
// ------------------------------------------------------------
async function carregarClientesFiado() {
    if (!window.DrTrocoFiado || typeof window.DrTrocoFiado.listarClientes !== 'function') return;
    try {
        const lista = await window.DrTrocoFiado.listarClientes();
        clientesFiadoCache = lista || [];
    } catch (e) {
        console.warn('Erro ao carregar clientes do fiado:', e);
    }
}

function renderizarListaClientes(termo = '') {
    if (!listaClientesFiado) return;
    const termoNorm = normalizar(termo);
    
    const filtrados = clientesFiadoCache.filter(c => normalizar(c.nome).includes(termoNorm));
    
    if (!filtrados.length) {
        listaClientesFiado.innerHTML = '<div style="padding:14px;text-align:center;color:#7b898f;font-size:12px;">Nenhum cliente encontrado.</div>';
        listaClientesFiado.classList.remove('hidden');
        return;
    }

    listaClientesFiado.innerHTML = filtrados.map(c => `
        <div class="cliente-item-fiado" data-id="${escaparAtributo(c.id)}" data-nome="${escaparAtributo(c.nome)}">
            <strong>${escaparHTML(c.nome)}</strong>
            <small>${escaparHTML(c.telefone || 'Sem telefone')}</small>
        </div>
    `).join('');

    listaClientesFiado.classList.remove('hidden');

    listaClientesFiado.querySelectorAll('.cliente-item-fiado').forEach(item => {
        item.addEventListener('click', () => {
            selecionarClienteFiado(item.dataset.id, item.dataset.nome);
        });
    });
}

function selecionarClienteFiado(id, nome) {
    if (nomeClienteFiado) nomeClienteFiado.value = nome;
    if (nomeClienteSelecionadoVenda) nomeClienteSelecionadoVenda.textContent = nome;
    
    if (clienteSelecionadoVenda) clienteSelecionadoVenda.classList.remove('hidden');
    if (buscaClienteFiado) {
        buscaClienteFiado.value = '';
        buscaClienteFiado.closest('.busca-cliente-wrapper').classList.add('hidden');
    }
    if (listaClientesFiado) listaClientesFiado.classList.add('hidden');
    
    atualizarTela();
}

function limparClienteFiado() {
    if (nomeClienteFiado) nomeClienteFiado.value = '';
    if (clienteSelecionadoVenda) clienteSelecionadoVenda.classList.add('hidden');
    if (buscaClienteFiado) {
        buscaClienteFiado.value = '';
        buscaClienteFiado.closest('.busca-cliente-wrapper').classList.remove('hidden');
    }
}

// ------------------------------------------------------------
// Inicialização e Eventos
// ------------------------------------------------------------
function iniciarCalculadora() {
    if (!totalCobrar) return;
    fecharModalOverlay(modalConfirmarVenda);
    fecharModalOverlay(modalProdutosVenda);
    fecharModalOverlay(modalPix);
    pararLeitorVenda();
    configurarEventos();

    if (valorContaInput) valorContaInput.disabled = false;
    formaPagamento = 'dinheiro';
    atualizarBotoesPagamento();
    renderizarProdutosVenda();
    atualizarTela();
}

function configurarEventos() {
    if (eventosConfigurados) return;
    eventosConfigurados = true;

    [valorContaInput, valorRecebidoInput, nomeClienteFiado, valorPagoInicialFiado].forEach(el => el?.addEventListener('input', atualizarTela));
    formaPagamentoInicialFiado?.addEventListener('change', atualizarTela);

    document.querySelectorAll('.btn-payment').forEach(botao => {
        botao.addEventListener('click', (e) => {
            e.preventDefault();
            const metodo = String(botao.dataset.method || '').toLowerCase();
            if (['dinheiro', 'pix', 'debito', 'credito', 'fiado'].includes(metodo)) {
                formaPagamento = metodo;
                atualizarBotoesPagamento();
                atualizarTela();
            }
        });
    });

    // Eventos da busca de cliente fiado
    buscaClienteFiado?.addEventListener('input', (e) => renderizarListaClientes(e.target.value));
    buscaClienteFiado?.addEventListener('focus', async () => {
        if (clientesFiadoCache.length === 0) await carregarClientesFiado();
        renderizarListaClientes(buscaClienteFiado.value);
    });
    btnTrocarClienteVenda?.addEventListener('click', () => {
        limparClienteFiado();
        buscaClienteFiado?.focus();
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.busca-cliente-wrapper')) {
            listaClientesFiado?.classList.add('hidden');
        }
    });

    btnAdicionarProduto?.addEventListener('click', (e) => { e.preventDefault(); abrirModalProdutos(); });
    btnFecharProdutosVenda?.addEventListener('click', () => fecharModalOverlay(modalProdutosVenda));
    btnConcluirProdutosVenda?.addEventListener('click', () => fecharModalOverlay(modalProdutosVenda));
    btnAbrirLeitorVenda?.addEventListener('click', abrirLeitorVenda);

    btnFecharLeitorVenda?.addEventListener('click', () => fecharLeitorVenda(true));
    btnFecharLeitorVenda2?.addEventListener('click', () => fecharLeitorVenda(true));

    buscaProdutoVenda?.addEventListener('input', (e) => renderizarProdutosEstoqueVenda(e.target.value));

    listaProdutosEstoqueVenda?.addEventListener('click', (e) => {
        const botao = e.target.closest('[data-acao-produto]');
        if (!botao) return;
        e.preventDefault();
        e.stopPropagation();
        const id = botao.dataset.produtoEstoqueId;
        if (botao.dataset.acaoProduto === 'adicionar') adicionarProdutoVenda(id);
        if (botao.dataset.acaoProduto === 'diminuir') diminuirProdutoModal(id);
    });

    btnLimparVenda?.addEventListener('click', limparVenda);
    btnRegistrarVenda?.addEventListener('click', abrirConfirmacaoVenda);
    btnCancelarVenda?.addEventListener('click', limparVenda);
    btnFecharConfirmacao?.addEventListener('click', () => fecharModalOverlay(modalConfirmarVenda));
    btnCancelarConfirmacao?.addEventListener('click', () => fecharModalOverlay(modalConfirmarVenda));
    btnConfirmarVenda?.addEventListener('click', confirmarVenda);

    modalProdutosVenda?.addEventListener('click', (e) => { if (e.target === modalProdutosVenda) fecharModalOverlay(modalProdutosVenda); });
    modalLeitorVenda?.addEventListener('click', (e) => { if (e.target === modalLeitorVenda) fecharLeitorVenda(true); });
    modalConfirmarVenda?.addEventListener('click', (e) => { if (e.target === modalConfirmarVenda) fecharModalOverlay(modalConfirmarVenda); });

    if (btnFecharPix) {
        btnFecharPix.addEventListener('click', () => fecharModalOverlay(modalPix));
    }
    modalPix?.addEventListener('click', (e) => { if (e.target === modalPix) fecharModalOverlay(modalPix); });

    listaProdutosVenda?.addEventListener('click', (e) => {
        const botao = e.target.closest('[data-acao]');
        if (!botao) return;
        alterarQuantidadeProduto(botao.dataset.id, botao.dataset.acao);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (modalPix?.classList.contains('aberto')) fecharModalOverlay(modalPix);
        else if (modalLeitorVenda?.classList.contains('aberto')) fecharLeitorVenda(true);
        else if (modalConfirmarVenda?.classList.contains('aberto')) fecharModalOverlay(modalConfirmarVenda);
        else if (modalProdutosVenda?.classList.contains('aberto')) fecharModalOverlay(modalProdutosVenda);
    });
}

// ------------------------------------------------------------
// Pagamentos e Interface
// ------------------------------------------------------------
function atualizarBotoesPagamento() {
    document.querySelectorAll('.btn-payment').forEach(botao => {
        const selecionado = String(botao.dataset.method || '').toLowerCase() === formaPagamento;
        botao.classList.toggle('ativo', selecionado);
        botao.classList.toggle('selected', selecionado);
        botao.setAttribute('aria-pressed', selecionado ? 'true' : 'false');
        botao.style.setProperty('background-color', selecionado ? '#20a66a' : '#ffffff', 'important');
        botao.style.setProperty('color', selecionado ? '#ffffff' : '#5f6972', 'important');
        botao.style.setProperty('border-color', selecionado ? '#20a66a' : '#dfe4e7', 'important');
        botao.style.setProperty('box-shadow', selecionado ? '0 6px 15px rgba(32,166,106,0.25)' : 'none', 'important');
    });
}

const calcularTotaisProdutos = () => produtosVenda.reduce((soma, p) => soma + centavos(numeroSeguro(p.preco) * numeroSeguro(p.quantidade)), 0) / 100;

function atualizarTela() {
    const totalProdutos = calcularTotaisProdutos();
    const valorAvulso = numeroSeguro(valorContaInput?.value);
    const total = Math.round((totalProdutos + valorAvulso) * 100) / 100;

    if (totalCobrar) totalCobrar.textContent = formatarReal(total);

    const qtdProdutos = produtosVenda.reduce((soma, p) => soma + numeroSeguro(p.quantidade), 0);
    const qtdTotal = qtdProdutos + (valorAvulso > 0 ? 1 : 0);
    if (quantidadeItensVenda) quantidadeItensVenda.textContent = `${qtdTotal} ${qtdTotal === 1 ? 'item' : 'itens'}`;

    const ehDinheiro = formaPagamento === 'dinheiro';
    const ehFiado = formaPagamento === 'fiado';

    mostrarElemento(groupRecebido, ehDinheiro, 'block');
    if (valorRecebidoInput) valorRecebidoInput.disabled = !ehDinheiro;

    mostrarElemento(groupFiado, ehFiado, 'block');
    if (ehFiado && clientesFiadoCache.length === 0) carregarClientesFiado();
    mostrarElemento(rowSaldoDevedorFiado, ehFiado, 'flex');

    if (ehFiado) {
        const pago = numeroSeguro(valorPagoInicialFiado?.value);
        const saldo = Math.max(0, Math.round((total - pago) * 100) / 100);
        if (saldoDevedorVenda) saldoDevedorVenda.textContent = formatarReal(saldo);
        if (valorTroco) valorTroco.textContent = formatarReal(0);
        mostrarElemento(rowTroco, false);
        mostrarElemento(secaoCedulas, false);
    } else if (ehDinheiro) {
        const recebido = numeroSeguro(valorRecebidoInput?.value);
        const troco = Math.max(0, Math.round((recebido - total) * 100) / 100);
        mostrarElemento(rowTroco, total > 0 && recebido >= total, 'flex');
        if (valorTroco) valorTroco.textContent = formatarReal(troco);

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

    if (btnRegistrarVenda) btnRegistrarVenda.disabled = total <= 0 || vendaEmProcessamento;
}

// ------------------------------------------------------------
// Produtos e Estoque na Venda
// ------------------------------------------------------------
function abrirModalProdutos() {
    if (!modalProdutosVenda) return;
    if (modalLeitorVenda?.classList.contains('aberto')) fecharLeitorVenda(false);
    if (buscaProdutoVenda) buscaProdutoVenda.value = '';
    renderizarProdutosEstoqueVenda();
    if (abrirModalOverlay(modalProdutosVenda, 9999)) {
        setTimeout(() => buscaProdutoVenda?.focus(), 100);
    }
}

function renderizarProdutosEstoqueVenda(termoBusca = '') {
    if (!listaProdutosEstoqueVenda) return;
    const estoque = obterEstoque();
    const termo = normalizar(termoBusca);

    const disponiveis = estoque.filter(p => numeroSeguro(p.quantidade) > 0 && (!termo || normalizar(p.nome).includes(termo) || normalizar(p.codigo).includes(termo)));

    if (!disponiveis.length) {
        listaProdutosEstoqueVenda.innerHTML = `
            <div class="produtos-venda-vazio">
                <div class="icone-vazio">📦</div>
                <strong>Nenhum produto encontrado</strong>
                <p>${estoque.length === 0 ? 'Cadastre produtos no estoque primeiro.' : 'Não há produtos disponíveis para venda.'}</p>
            </div>`;
        return;
    }

    listaProdutosEstoqueVenda.innerHTML = disponiveis.map(produto => {
        const id = String(produto.id);
        const naVenda = produtosVenda.find(item => String(item.id) === id);
        const qtdNaVenda = naVenda ? numeroSeguro(naVenda.quantidade) : 0;
        const foto = produto.foto ? `<img src="${escaparAtributo(produto.foto)}" alt="${escaparAtributo(produto.nome)}">` : '<span>📦</span>';

        return `
            <div class="produto-estoque-venda-item produto-card">
                <div class="produto-estoque-venda-foto produto-foto">${foto}</div>
                <div class="produto-estoque-venda-info produto-info">
                    <strong>${escaparHTML(produto.nome)}</strong>
                    <small>Estoque: ${numeroSeguro(produto.quantidade)}</small>
                    <strong class="produto-estoque-venda-preco produto-preco">${formatarReal(produto.preco)}</strong>
                </div>
                <div class="produto-estoque-venda-acoes controle-quantidade">
                    <button type="button" class="btn-produto-menos" data-acao-produto="diminuir" data-produto-estoque-id="${escaparAtributo(id)}" ${qtdNaVenda <= 0 ? 'disabled' : ''}>−</button>
                    <span class="quantidade-produto-modal">${qtdNaVenda}</span>
                    <button type="button" class="btn-produto-mais" data-acao-produto="adicionar" data-produto-estoque-id="${escaparAtributo(id)}">+</button>
                </div>
            </div>`;
    }).join('');
}

function adicionarProdutoVenda(id) {
    const itemEstoque = obterEstoque().find(p => String(p.id) === String(id));
    if (!itemEstoque || numeroSeguro(itemEstoque.quantidade) <= 0) {
        alert('Produto sem estoque ou não encontrado.');
        return false;
    }

    const disponivel = numeroSeguro(itemEstoque.quantidade);
    const existente = produtosVenda.find(p => String(p.id) === String(id));

    if (existente) {
        if (existente.quantidade >= disponivel) {
            alert('A quantidade selecionada atingiu o limite do estoque.');
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
    const produto = produtosVenda.find(item => String(item.id) === String(id));
    if (!produto) return;
    produto.quantidade--;
    if (produto.quantidade <= 0) {
        produtosVenda = produtosVenda.filter(item => String(item.id) !== String(id));
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
        }
        return;
    }

    if (produtosVendaVazio) mostrarElemento(produtosVendaVazio, false);

    listaProdutosVenda.innerHTML = produtosVenda.map(produto => {
        const subtotal = numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade);
        const imagem = produto.foto ? `<img src="${escaparAtributo(produto.foto)}" alt="${escaparAtributo(produto.nome)}">` : '<span>📦</span>';

        return `
            <div class="item-produto-venda">
                <div class="item-produto-imagem">${imagem}</div>
                <div class="item-produto-info">
                    <strong>${escaparHTML(produto.nome)}</strong>
                    ${produto.codigo ? `<small>Código: ${escaparHTML(produto.codigo)}</small>` : ''}
                    <span>${formatarReal(produto.preco)}</span>
                </div>
                <div class="item-produto-controles">
                    <button type="button" class="btn-quantidade" data-acao="diminuir" data-id="${escaparAtributo(produto.id)}">−</button>
                    <strong>${produto.quantidade}</strong>
                    <button type="button" class="btn-quantidade" data-acao="aumentar" data-id="${escaparAtributo(produto.id)}">+</button>
                </div>
                <div class="item-produto-subtotal">
                    <strong>${formatarReal(subtotal)}</strong>
                    <button type="button" class="btn-remover-produto" data-acao="remover" data-id="${escaparAtributo(produto.id)}" aria-label="Remover">🗑️</button>
                </div>
            </div>`;
    }).join('');
}

function alterarQuantidadeProduto(id, acao) {
    const produto = produtosVenda.find(item => String(item.id) === String(id));
    if (!produto) return;

    if (acao === 'aumentar') {
        const doEstoque = obterEstoque().find(item => String(item.id) === String(id));
        if (!doEstoque || produto.quantidade >= numeroSeguro(doEstoque.quantidade)) {
            alert('Não há mais unidades disponíveis no estoque.');
            return;
        }
        produto.quantidade++;
    } else if (acao === 'diminuir') {
        produto.quantidade--;
        if (produto.quantidade <= 0) produtosVenda = produtosVenda.filter(item => String(item.id) !== String(id));
    } else if (acao === 'remover') {
        produtosVenda = produtosVenda.filter(item => String(item.id) !== String(id));
    }

    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda(buscaProdutoVenda?.value || '');
    atualizarTela();
}

const encontrarProdutoPorCodigo = (codigo) => {
    const alvo = String(codigo || '').trim();
    return alvo ? obterEstoque().find(item => String(item.codigo || '').trim() === alvo) || null : null;
};

// ------------------------------------------------------------
// Leitor de Código de Barras
// ------------------------------------------------------------
async function abrirLeitorVenda() {
    if (abrindoLeitorVenda || lendoCodigoVenda) return;
    if (!navigator.mediaDevices?.getUserMedia || !('BarcodeDetector' in window)) {
        alert('Leitor de código de barras não suportado neste navegador.');
        return;
    }

    abrindoLeitorVenda = true;
    try {
        modalProdutosEstavaAbertoAntesLeitor = modalProdutosVenda?.classList.contains('aberto') && !modalProdutosVenda.classList.contains('hidden');
        if (modalProdutosEstavaAbertoAntesLeitor) fecharModalOverlay(modalProdutosVenda);
        pararLeitorVenda();

        abrirModalOverlay(modalLeitorVenda, 10002);
        if (mensagemLeitorVenda) { mensagemLeitorVenda.textContent = 'Iniciando câmera...'; mensagemLeitorVenda.style.display = 'flex'; }
        if (videoLeitorVenda) videoLeitorVenda.style.display = 'none';
        if (molduraLeitorVenda) molduraLeitorVenda.style.display = 'none';

        prepararSomLeitor();
        detectorLeitorVenda = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93'] });

        streamLeitorVenda = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        videoLeitorVenda.setAttribute('playsinline', '');
        videoLeitorVenda.muted = true;
        videoLeitorVenda.srcObject = streamLeitorVenda;

        await new Promise(resolve => {
            if (videoLeitorVenda.readyState >= 1) return resolve();
            videoLeitorVenda.addEventListener('loadedmetadata', resolve, { once: true });
        });

        await videoLeitorVenda.play();
        videoLeitorVenda.style.setProperty('display', 'block', 'important');
        videoLeitorVenda.style.setProperty('width', '100%', 'important');
        videoLeitorVenda.style.setProperty('height', '280px', 'important');
        videoLeitorVenda.style.setProperty('object-fit', 'cover', 'important');

        if (mensagemLeitorVenda) mensagemLeitorVenda.style.display = 'none';
        if (molduraLeitorVenda) molduraLeitorVenda.style.display = 'block';
        if (statusLeitorVenda) statusLeitorVenda.textContent = 'Aponte a câmera para o código';

        lendoCodigoVenda = true;
        detectarCodigoVenda();
    } catch (erro) {
        console.error('Erro ao abrir leitor:', erro);
        pararLeitorVenda();
        if (mensagemLeitorVenda) {
            mensagemLeitorVenda.textContent = 'Permita o acesso à câmera para usar o leitor.';
            mensagemLeitorVenda.style.display = 'flex';
        }
    } finally {
        abrindoLeitorVenda = false;
    }
}

async function detectarCodigoVenda() {
    if (!lendoCodigoVenda || !detectorLeitorVenda || !videoLeitorVenda || videoLeitorVenda.readyState < 2) {
        if (lendoCodigoVenda) frameLeituraVenda = requestAnimationFrame(detectarCodigoVenda);
        return;
    }

    try {
        const resultados = await detectorLeitorVenda.detect(videoLeitorVenda);
        if (resultados?.length) {
            const codigo = String(resultados[0].rawValue || '').trim();
            if (codigo) processarCodigoLidoVenda(codigo);
        }
    } catch (e) {}

    if (lendoCodigoVenda) frameLeituraVenda = requestAnimationFrame(detectarCodigoVenda);
}

function processarCodigoLidoVenda(codigo) {
    const agora = Date.now();
    if (codigo === codigoUltimoLidoVenda && agora - tempoUltimoCodigoVenda < 1000) return;
    codigoUltimoLidoVenda = codigo;
    tempoUltimoCodigoVenda = agora;

    const produto = encontrarProdutoPorCodigo(codigo);
    if (!produto || !adicionarProdutoVenda(produto.id)) {
        emitirSomErroVenda();
        if (statusLeitorVenda) statusLeitorVenda.textContent = `Código ${codigo} não encontrado`;
        return;
    }

    emitirSomLeitor();
    if (statusLeitorVenda) statusLeitorVenda.textContent = `${produto.nome} — ${formatarReal(produto.preco)}`;
}

function prepararSomLeitor() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && !audioContextVenda) audioContextVenda = new AudioCtx();
        if (audioContextVenda?.state === 'suspended') audioContextVenda.resume();
    } catch (e) {}
}

function emitirTom(frequencia, frequenciaFinal, duracao, volume = 0.15) {
    try {
        prepararSomLeitor();
        if (!audioContextVenda) return;
        const agora = audioContextVenda.currentTime;
        const osc = audioContextVenda.createOscillator();
        const ganho = audioContextVenda.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequencia, agora);
        if (frequenciaFinal) osc.frequency.exponentialRampToValueAtTime(frequenciaFinal, agora + duracao * 0.8);

        ganho.gain.setValueAtTime(0.0001, agora);
        ganho.gain.exponentialRampToValueAtTime(volume, agora + 0.01);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao);

        osc.connect(ganho);
        ganho.connect(audioContextVenda.destination);
        osc.start(agora);
        osc.stop(agora + duracao + 0.01);
    } catch (e) {}
}

const emitirSomLeitor = () => emitirTom(1250, 850, 0.085, 0.18);
const emitirSomErroVenda = () => emitirTom(300, 220, 0.18, 0.12);

function pararLeitorVenda() {
    lendoCodigoVenda = false;
    if (frameLeituraVenda) cancelAnimationFrame(frameLeituraVenda);
    frameLeituraVenda = null;

    if (streamLeitorVenda) {
        streamLeitorVenda.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
        streamLeitorVenda = null;
    }

    if (videoLeitorVenda) {
        try { videoLeitorVenda.pause(); } catch(e){}
        videoLeitorVenda.srcObject = null;
        videoLeitorVenda.style.setProperty('display', 'none', 'important');
    }
    detectorLeitorVenda = null;
    codigoUltimoLidoVenda = '';
}

function fecharLeitorVenda(reabrirProdutos = false) {
    const estavaAberto = modalLeitorVenda?.classList.contains('aberto');
    pararLeitorVenda();
    fecharModalOverlay(modalLeitorVenda);

    if (reabrirProdutos && estavaAberto && modalProdutosEstavaAbertoAntesLeitor && modalProdutosVenda) {
        abrirModalOverlay(modalProdutosVenda, 9999);
        setTimeout(() => buscaProdutoVenda?.focus(), 100);
    }
    modalProdutosEstavaAbertoAntesLeitor = false;
}

// ------------------------------------------------------------
// Registro e Confirmação de Venda
// ------------------------------------------------------------
function calcularResumoVenda() {
    const totalProdutos = calcularTotaisProdutos();
    const valorAvulso = numeroSeguro(valorContaInput?.value);
    const total = Math.round((totalProdutos + valorAvulso) * 100) / 100;

    let recebido = total, troco = 0, clienteNome = '', pagamentoInicial = 0, saldoDevedor = 0, formaPagamentoRecebido = '';

    if (formaPagamento === 'dinheiro') {
        recebido = numeroSeguro(valorRecebidoInput?.value);
        troco = Math.max(0, Math.round((recebido - total) * 100) / 100);
    } else if (formaPagamento === 'fiado') {
        clienteNome = String(nomeClienteFiado?.value || '').trim();
        pagamentoInicial = numeroSeguro(valorPagoInicialFiado?.value);
        formaPagamentoRecebido = String(formaPagamentoInicialFiado?.value || 'dinheiro').toLowerCase();
        recebido = pagamentoInicial;
        saldoDevedor = Math.max(0, Math.round((total - pagamentoInicial) * 100) / 100);
    }

    return { valorConta: valorAvulso, valorAvulso, totalProdutos, total, recebido, troco, formaPagamento, clienteNome, pagamentoInicial, saldoDevedor, formaPagamentoRecebido };
}

function validarResumoVenda(resumo) {
    if (resumo.total <= 0) {
        alert('Informe o valor da compra ou adicione produtos.');
        return false;
    }
    if (resumo.formaPagamento === 'dinheiro' && resumo.recebido < resumo.total) {
        alert('O valor recebido é menor que o total.');
        return false;
    }
    if (resumo.formaPagamento === 'fiado') {
        if (!resumo.clienteNome) {
            alert('Informe o nome do cliente.');
            nomeClienteFiado?.focus();
            return false;
        }
        if (resumo.pagamentoInicial > resumo.total) {
            alert('O pagamento inicial não pode ser maior que o total.');
            valorPagoInicialFiado?.focus();
            return false;
        }
    }

    const estoque = obterEstoque();
    for (const item of produtosVenda) {
        const prod = estoque.find(r => String(r.id) === String(item.id));
        if (!prod || numeroSeguro(prod.quantidade) < numeroSeguro(item.quantidade)) {
            alert(`Estoque insuficiente para "${item.nome}".`);
            return false;
        }
    }
    return true;
}

function abrirConfirmacaoVenda() {
    const resumo = calcularResumoVenda();
    if (!validarResumoVenda(resumo)) return;
    if (!modalConfirmarVenda || !resumoConfirmacaoVenda) return;

    resumoConfirmacaoVenda.innerHTML = criarResumoConfirmacao(resumo);

    // Mostra ou esconde o botão do Pix
    if (btnGerarQrCodePix) {
        if (resumo.formaPagamento === 'pix') {
            btnGerarQrCodePix.style.display = 'flex';
            btnGerarQrCodePix.onclick = () => abrirModalPix(resumo.total);
        } else {
            btnGerarQrCodePix.style.display = 'none';
        }
    }

    abrirModalOverlay(modalConfirmarVenda, 10001);
}

function criarResumoConfirmacao(resumo) {
    let html = `<div class="resumo-confirmacao-linha"><span>Pagamento</span><strong>${nomeFormaPagamento(resumo.formaPagamento)}</strong></div>`;
    if (resumo.formaPagamento === 'fiado') html += `<div class="resumo-confirmacao-linha"><span>Cliente</span><strong>${escaparHTML(resumo.clienteNome)}</strong></div>`;
    if (resumo.valorAvulso > 0) html += `<div class="resumo-confirmacao-linha"><span>Valor avulso</span><strong>${formatarReal(resumo.valorAvulso)}</strong></div>`;

    if (produtosVenda.length) {
        html += '<div class="resumo-confirmacao-produtos"><strong>Produtos</strong>';
        produtosVenda.forEach(p => {
            html += `<div class="resumo-produto"><span>${escaparHTML(p.nome)} × ${p.quantidade}</span><strong>${formatarReal(p.preco * p.quantidade)}</strong></div>`;
        });
        html += '</div>';
    }

    html += `<div class="resumo-confirmacao-total"><span>Total</span><strong>${formatarReal(resumo.total)}</strong></div>`;
    if (resumo.formaPagamento === 'dinheiro') {
        html += `<div class="resumo-confirmacao-linha"><span>Recebido</span><strong>${formatarReal(resumo.recebido)}</strong></div>`;
        html += `<div class="resumo-confirmacao-linha troco"><span>Troco</span><strong>${formatarReal(resumo.troco)}</strong></div>`;
    } else if (resumo.formaPagamento === 'fiado') {
        html += `<div class="resumo-confirmacao-linha"><span>Pago na hora</span><strong>${formatarReal(resumo.pagamentoInicial)}</strong></div>`;
        html += `<div class="resumo-confirmacao-linha saldo-devedor"><span>Saldo Devedor</span><strong>${formatarReal(resumo.saldoDevedor)}</strong></div>`;
    }
    return html;
}

// ------------------------------------------------------------
// Helper: reverter estoque no Supabase após falha na venda
// ------------------------------------------------------------
async function reverterEstoqueSupabase(estoqueBaixado) {
    if (!Array.isArray(estoqueBaixado) || !estoqueBaixado.length) return;
    if (!window.EstoqueSupabase || typeof window.EstoqueSupabase.salvarProduto !== 'function') {
        console.warn('[Venda/rollback] EstoqueSupabase indisponível — não foi possível reverter.');
        return;
    }

    for (const item of estoqueBaixado) {
        try {
            await window.EstoqueSupabase.salvarProduto({
                id: item.produtoOriginal.id,
                nome: item.produtoOriginal.nome,
                codigo: item.produtoOriginal.codigo,
                preco: item.produtoOriginal.preco,
                tipo: item.produtoOriginal.tipo,
                estoqueMinimo: item.produtoOriginal.estoqueMinimo,
                quantidade: numeroSeguro(item.produtoOriginal.quantidade),
                validade: item.produtoOriginal.validade,
                foto: item.produtoOriginal.foto,
                criadoEm: item.produtoOriginal.criadoEm
            });
        } catch (e) {
            console.error('[Venda/rollback] Falha ao reverter estoque de', item.id, e);
        }
    }
}

// ------------------------------------------------------------
// CONFIRMAÇÃO DE VENDA — INTEGRAÇÃO COM FIADO, SUPABASE E ESTOQUE
// ------------------------------------------------------------
async function confirmarVenda() {
    if (vendaEmProcessamento) return;

    const resumo = calcularResumoVenda();
    if (!validarResumoVenda(resumo)) return;

    vendaEmProcessamento = true;
    if (btnConfirmarVenda) btnConfirmarVenda.disabled = true;

    const isFiado = resumo.formaPagamento === 'fiado';
    let clienteFiado = null;

    // ETAPA 1 — Se for fiado, localizar o cliente cadastrado
    if (isFiado) {
        if (!window.DrTrocoFiado || typeof window.DrTrocoFiado.listarClientes !== 'function') {
            alert('O módulo Fiado não foi carregado corretamente. Recarregue a página.');
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }

        let lista;
        try {
            lista = await window.DrTrocoFiado.listarClientes();
        } catch (err) {
            console.error('Falha ao consultar clientes do Fiado:', err);
            alert(
                'Não foi possível consultar os clientes do Fiado.\n\n' +
                'Verifique a conexão com a internet e tente novamente.\n' +
                'A venda NÃO foi registrada.'
            );
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }

        const alvo = normalizar(resumo.clienteNome);
        const encontrados = (lista || []).filter(c => normalizar(c.nome) === alvo);

        if (encontrados.length === 0) {
            alert(
                'Nenhum cliente cadastrado no Fiado com esse nome.\n\n' +
                'Abra o módulo Fiado e cadastre o cliente antes de realizar uma venda fiada.'
            );
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }

        if (encontrados.length > 1) {
            alert(
                'Há mais de um cliente cadastrado com esse nome no Fiado.\n\n' +
                'Resolva a duplicidade no módulo Fiado antes de continuar.'
            );
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }

        clienteFiado = encontrados[0];
    }

    // ETAPA 2 — validar estoque local
    const estoqueOriginal = obterEstoque();
    const estoqueAtualizado = JSON.parse(JSON.stringify(estoqueOriginal));

    for (const item of produtosVenda) {
        const prod = estoqueAtualizado.find(r => String(r.id) === String(item.id));
        if (!prod || numeroSeguro(prod.quantidade) < numeroSeguro(item.quantidade)) {
            alert(`Estoque insuficiente para "${item.nome}".`);
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }
        prod.quantidade = Math.max(0, numeroSeguro(prod.quantidade) - numeroSeguro(item.quantidade));
        prod.atualizadoEm = new Date().toISOString();
    }

    const dataHora = obterDataHoraAtual();
    const idVenda = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // ======================================================
    // ETAPA 2.5 — NOVO: baixar estoque no Supabase
    // ======================================================
    const estoqueBaixadoSupabase = [];
    let offlineDetectado = false;

    const podeUsarSupabaseEstoque =
        window.EstoqueSupabase &&
        typeof window.EstoqueSupabase.obterComercioId === 'function' &&
        typeof window.EstoqueSupabase.salvarProduto === 'function' &&
        typeof window.EstoqueSupabase.salvarMovimentacao === 'function';

    if (podeUsarSupabaseEstoque && produtosVenda.length > 0) {
        try {
            // Identifica o estabelecimento (usa cache interno após a 1ª vez)
            await window.EstoqueSupabase.obterComercioId();

            for (const item of produtosVenda) {
                const prodOriginal = estoqueOriginal.find(r => String(r.id) === String(item.id));
                if (!prodOriginal) {
                    throw new Error(`Produto "${item.nome}" não encontrado no estoque.`);
                }

                const qtdAnt = numeroSeguro(prodOriginal.quantidade);
                const qtdNova = Math.max(0, qtdAnt - numeroSeguro(item.quantidade));

                // (1) Atualiza a quantidade do produto no Supabase
                await window.EstoqueSupabase.salvarProduto({
                    id: prodOriginal.id,
                    nome: prodOriginal.nome,
                    codigo: prodOriginal.codigo,
                    preco: prodOriginal.preco,
                    tipo: prodOriginal.tipo,
                    estoqueMinimo: prodOriginal.estoqueMinimo,
                    quantidade: qtdNova,
                    validade: prodOriginal.validade,
                    foto: prodOriginal.foto,
                    criadoEm: prodOriginal.criadoEm
                });

                // (2) Registra a movimentação de saída no Supabase
                await window.EstoqueSupabase.salvarMovimentacao({
                    produtoId: prodOriginal.id,
                    produtoNome: prodOriginal.nome,
                    tipo: 'saida',
                    quantidade: numeroSeguro(item.quantidade),
                    quantidadeAnterior: qtdAnt,
                    quantidadeNova: qtdNova,
                    data: dataHora.dataChave,
                    hora: dataHora.hora
                });

                // Guarda para rollback caso algo falhe depois
                estoqueBaixadoSupabase.push({
                    id: prodOriginal.id,
                    produtoOriginal: { ...prodOriginal }
                });
            }
        } catch (erro) {
            console.error('[Venda] Falha ao baixar estoque no Supabase:', erro);

            // Rollback do que já foi baixado
            await reverterEstoqueSupabase(estoqueBaixadoSupabase);
            estoqueBaixadoSupabase.length = 0;

            // Distingue erro de rede (offline) de erro de servidor
            const msg = String((erro && erro.message) || '').toLowerCase();
            offlineDetectado =
                !navigator.onLine ||
                msg.includes('network') ||
                msg.includes('failed to fetch') ||
                msg.includes('fetch failed') ||
                msg.includes('offline') ||
                msg.includes('load failed');

            if (!offlineDetectado) {
                alert(
                    'Não foi possível baixar o estoque no servidor.\n\n' +
                    (erro.message || 'Erro desconhecido') +
                    '\n\nA venda NÃO foi registrada.'
                );
                vendaEmProcessamento = false;
                if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
                return;
            }

            console.warn('[Venda] Modo offline: baixa de estoque no Supabase ignorada nesta venda.');
        }
    }

    // ETAPA 3 — registrar DÍVIDA no Fiado (com rollback de estoque se falhar)
    if (isFiado) {
        try {
            const r = await window.DrTrocoFiado.registrarVendaFiado({
                clienteId: clienteFiado.id,
                valor: resumo.total,
                descricao: `Venda #${idVenda}`,
                vendaId: idVenda,
                origem: 'pdv'
            });
            if (!r || !r.sucesso) throw new Error((r && r.erro) || 'Falha ao registrar dívida.');
        } catch (err) {
            console.error('Erro ao registrar dívida no Fiado:', err);

            if (estoqueBaixadoSupabase.length > 0) {
                console.warn('[Venda] Revertendo estoque no Supabase pois o fiado falhou...');
                await reverterEstoqueSupabase(estoqueBaixadoSupabase);
                estoqueBaixadoSupabase.length = 0;
            }

            alert(
                'Não foi possível registrar a dívida no Fiado.\n\n' +
                'A venda NÃO foi concluída.\n\n' + (err.message || '')
            );
            vendaEmProcessamento = false;
            if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
            return;
        }
    }

    // ETAPA 4 — registrar PAGAMENTO INICIAL no Fiado (se houve entrada)
    if (isFiado && resumo.pagamentoInicial > 0) {
        try {
            const r = await window.DrTrocoFiado.registrarPagamento(
                clienteFiado.id,
                resumo.pagamentoInicial,
                resumo.formaPagamentoRecebido,
                `Pagamento inicial da venda #${idVenda}`,
                idVenda
            );
            if (!r || !r.sucesso) throw new Error((r && r.erro) || 'Falha ao registrar pagamento inicial.');
        } catch (err) {
            console.error('Erro ao registrar pagamento inicial no Fiado:', err);
            alert(
                'A dívida foi registrada, mas o pagamento inicial não pôde ser gravado.\n\n' +
                'Abra o Fiado, verifique o histórico do cliente e registre o ' +
                'pagamento manualmente se necessário.\n\n' + (err.message || '')
            );
        }
    }

    // ETAPA 5 — baixar estoque local + registrar movimentação de estoque
    const chaveMovEstoque = obterChaveMovimentacoesEstoqueComercio();
    let movimentacoesEstoque = lerListaLocalStorage(chaveMovEstoque);

    produtosVenda.forEach(item => {
        const pOrig = estoqueOriginal.find(r => String(r.id) === String(item.id));
        const qtdAnt = pOrig ? numeroSeguro(pOrig.quantidade) : 0;
        movimentacoesEstoque.push({
            id: `mov_venda_${idVenda}_${item.id}`,
            vendaId: idVenda,
            produtoId: item.id,
            produtoNome: item.nome,
            tipo: "saida",
            quantidade: numeroSeguro(item.quantidade),
            quantidadeAnterior: qtdAnt,
            quantidadeNova: Math.max(0, qtdAnt - numeroSeguro(item.quantidade)),
            data: dataHora.dataChave,
            hora: dataHora.hora
        });
    });
    localStorage.setItem(chaveMovEstoque, JSON.stringify(movimentacoesEstoque));

    // ETAPA 6 — montar registro da venda
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
        valorBase: resumo.total,
        total: resumo.total,
        valorRecebido: isFiado ? resumo.pagamentoInicial : resumo.recebido,
        troco: isFiado ? 0 : resumo.troco,
        produtos: produtosVenda.map(p => ({
            id: p.id, nome: p.nome, codigo: p.codigo, preco: p.preco, quantidade: p.quantidade,
            subtotal: Math.round(numeroSeguro(p.preco) * numeroSeguro(p.quantidade) * 100) / 100
        }))
    };

    // Anexa sessão de caixa se houver
    try {
        if (window.DrTrocoCaixa && typeof window.DrTrocoCaixa.current === 'function') {
            const sessaoAtual = window.DrTrocoCaixa.current();
            if (sessaoAtual) {
                venda.caixaSessaoId = sessaoAtual.id;
                venda.caixaSessaoNumero = sessaoAtual.numero;
            }
        }
    } catch (e) {}

    let movimentacaoInicial = null;

    if (isFiado) {
        const pago = Math.round(resumo.pagamentoInicial * 100) / 100;
        const saldo = Math.max(0, Math.round((resumo.total - pago) * 100) / 100);
        venda.clienteId = clienteFiado.id;
        venda.clienteNome = clienteFiado.nome;
        venda.fiado = {
            clienteId: clienteFiado.id,
            clienteNome: clienteFiado.nome,
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
                formaPagamentoNome: nomeFormaPagamento(resumo.formaPagamentoRecebido),
                data: dataHora.data,
                dataChave: dataHora.dataChave,
                hora: dataHora.hora,
                tipo: 'pagamento_inicial'
            });

            movimentacaoInicial = {
                id: `fiado-${idVenda}-${Date.now()}`,
                tipo: 'entrada',
                valor: pago,
                formaPagamento: resumo.formaPagamentoRecebido,
                formaPagamentoNome: nomeFormaPagamento(resumo.formaPagamentoRecebido),
                descricao: `Pagamento inicial do fiado — ${clienteFiado.nome}`,
                data: dataHora.data,
                dataChave: dataHora.dataChave,
                hora: dataHora.hora,
                origem: 'pagamento_fiado_inicial',
                fiadoId: idVenda,
                vendaId: idVenda
            };
            if (venda.caixaSessaoId) {
                movimentacaoInicial.caixaSessaoId = venda.caixaSessaoId;
                movimentacaoInicial.caixaSessaoNumero = venda.caixaSessaoNumero;
            }
        }
    }

    // ETAPA 7 — persistir estoque local (não crítico)
    try {
        if (!salvarEstoque(estoqueAtualizado)) {
            console.warn('[Venda] Falha ao salvar estoque local.');
        }
    } catch (err) {
        console.warn('[Venda] Erro ao salvar estoque:', err);
    }

    // ETAPA 8 — gravar venda + movimentação (Supabase via DrTrocoDados ou fallback local)
    let vendaOk = false;

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarVenda === 'function') {
        try {
            const r = await window.DrTrocoDados.salvarVenda(venda);
            vendaOk = !!(r && r.ok);

            if (!vendaOk) {
                console.warn('[Venda] Venda salva apenas no aparelho:', r && r.erro);

                // ROLLBACK: venda não foi pro Supabase, estoque não deveria ter ido
                if (estoqueBaixadoSupabase.length > 0) {
                    console.warn('[Venda] Revertendo estoque no Supabase pois a venda falhou...');
                    await reverterEstoqueSupabase(estoqueBaixadoSupabase);
                    estoqueBaixadoSupabase.length = 0;
                }
            }
        } catch (err) {
            console.error('[Venda] Erro ao salvar via DrTrocoDados:', err);
            if (estoqueBaixadoSupabase.length > 0) {
                await reverterEstoqueSupabase(estoqueBaixadoSupabase);
                estoqueBaixadoSupabase.length = 0;
            }
        }

        if (movimentacaoInicial && typeof window.DrTrocoDados.salvarMovimentacao === 'function') {
            try {
                await window.DrTrocoDados.salvarMovimentacao(movimentacaoInicial);
            } catch (err) {
                console.error('[Venda] Erro ao salvar movimentação inicial:', err);
            }
        }
    } else {
        // Fallback: apenas localStorage
        const vendas = lerListaLocalStorage(CHAVE_VENDAS);
        localStorage.setItem(CHAVE_VENDAS, JSON.stringify([...vendas, venda]));
        if (movimentacaoInicial) {
            const movs = lerListaLocalStorage(CHAVE_MOVIMENTACOES);
            movs.push(movimentacaoInicial);
            localStorage.setItem(CHAVE_MOVIMENTACOES, JSON.stringify(movs));
        }
        vendaOk = true;
    }

    // ETAPA 9 — finalizar
    fecharModalOverlay(modalConfirmarVenda);

    if (vendaOk) {
        alert(isFiado
            ? `Venda fiada registrada para ${clienteFiado.nome}!`
            : 'Venda registrada com sucesso!');
    } else if (offlineDetectado) {
        alert(
            'Você está offline. A venda foi salva no aparelho e o estoque foi baixado localmente.\n\n' +
            'Quando a conexão voltar, a venda será sincronizada.'
        );
    } else {
        alert(
            'A venda foi salva no aparelho, mas o envio para a nuvem falhou.\n\n' +
            'Ela será sincronizada automaticamente quando a conexão voltar.'
        );
    }

    vendaEmProcessamento = false;
    if (btnConfirmarVenda) btnConfirmarVenda.disabled = false;
    limparVenda();
}

function limparVenda() {
    produtosVenda = [];
    if (valorContaInput) valorContaInput.value = '';
    if (valorRecebidoInput) valorRecebidoInput.value = '';
    if (nomeClienteFiado) nomeClienteFiado.value = '';
    limparClienteFiado();
    if (valorPagoInicialFiado) valorPagoInicialFiado.value = '0';
    if (formaPagamentoInicialFiado) formaPagamentoInicialFiado.value = 'dinheiro';

    formaPagamento = 'dinheiro';
    atualizarBotoesPagamento();
    renderizarProdutosVenda();
    renderizarProdutosEstoqueVenda();
    fecharModalOverlay(modalProdutosVenda);
    fecharModalOverlay(modalPix);
    pararLeitorVenda();
    fecharModalOverlay(modalConfirmarVenda);
    atualizarTela();
}

// ------------------------------------------------------------
// Sugestões de Troco com Imagens
// ------------------------------------------------------------
const denominacoesTroco = [
    { valor: 200, nome: 'R$ 200', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-200.jpg' },
    { valor: 100, nome: 'R$ 100', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-100.jpg' },
    { valor: 50, nome: 'R$ 50', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-50.jpg' },
    { valor: 20, nome: 'R$ 20', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-20.jpg' },
    { valor: 10, nome: 'R$ 10', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-10.jpg' },
    { valor: 5, nome: 'R$ 5', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-5.jpg' },
    { valor: 2, nome: 'R$ 2', tipo: 'cédula', simbolo: '💵', imagem: 'cedulas/cedula-2.jpg' },
    { valor: 1, nome: 'R$ 1', tipo: 'moeda', simbolo: '🪙', imagem: 'cedulas/moeda-100c.jpg' },
    { valor: 0.50, nome: 'R$ 0,50', tipo: 'moeda', simbolo: '🪙', imagem: 'cedulas/moeda-50c.jpg' },
    { valor: 0.25, nome: 'R$ 0,25', tipo: 'moeda', simbolo: '🪙', imagem: '', rotulo: '25c' },
    { valor: 0.10, nome: 'R$ 0,10', tipo: 'moeda', simbolo: '🪙', imagem: '', rotulo: '10c' },
    { valor: 0.05, nome: 'R$ 0,05', tipo: 'moeda', simbolo: '🪙', imagem: '', rotulo: '5c' },
    { valor: 0.01, nome: 'R$ 0,01', tipo: 'moeda', simbolo: '🪙', imagem: '', rotulo: '1c' }
];

function calcularMelhorTroco(valorCentavos, bloqueadas = []) {
    if (!Number.isInteger(valorCentavos) || valorCentavos < 0 || valorCentavos > 200000) return null;
    const bloqueadasSet = new Set(bloqueadas);
    const infinito = 999999;
    const dp = new Array(valorCentavos + 1).fill(infinito);
    const anterior = new Array(valorCentavos + 1).fill(null);
    dp[0] = 0;

    for (let valor = 1; valor <= valorCentavos; valor++) {
        for (let i = 0; i < denominacoesTroco.length; i++) {
            if (bloqueadasSet.has(i)) continue;
            const denom = Math.round(denominacoesTroco[i].valor * 100);
            if (denom > valor || dp[valor - denom] === infinito) continue;
            const qtd = dp[valor - denom] + 1;
            if (qtd < dp[valor]) {
                dp[valor] = qtd;
                anterior[valor] = i;
            }
        }
    }

    if (dp[valorCentavos] === infinito) return null;

    const quantidades = new Array(denominacoesTroco.length).fill(0);
    let restante = valorCentavos;
    while (restante > 0) {
        const indice = anterior[restante];
        if (indice === null) return null;
        quantidades[indice]++;
        restante -= Math.round(denominacoesTroco[indice].valor * 100);
    }

    return denominacoesTroco.map((item, idx) => quantidades[idx] > 0 ? { ...item, quantidade: quantidades[idx] } : null).filter(Boolean);
}

function gerarSugestoesTroco(valor) {
    if (!listaCedulas) return;
    const valorCentavos = centavos(numeroSeguro(valor));
    if (valorCentavos <= 0) { listaCedulas.innerHTML = ''; return; }

    const sugestoes = [];
    const primeira = calcularMelhorTroco(valorCentavos);
    if (primeira) sugestoes.push(primeira);

    for (let i = 0; i < denominacoesTroco.length && sugestoes.length < 3; i++) {
        const alternativa = calcularMelhorTroco(valorCentavos, [i]);
        if (!alternativa) continue;
        const assinatura = alternativa.map(item => `${item.nome}x${item.quantidade}`).join('|');
        if (!sugestoes.some(s => s.map(item => `${item.nome}x${item.quantidade}`).join('|') === assinatura)) {
            sugestoes.push(alternativa);
        }
    }
    renderizarSugestoesTroco(sugestoes);
}

const ERRO_IMAGEM_TROCO = "this.style.display='none';this.nextElementSibling.style.display='flex';";

function criarPecaTroco(item) {
    const ehMoeda = item.tipo === 'moeda';
    const nome = escaparHTML(item.nome);
    const empilhada = !ehMoeda && item.quantidade > 1;
    let visual = '';

    if (!ehMoeda) {
        const sombra = empilhada ? '5px 5px 0 -1px #c5ccd1, 10px 10px 0 -2px #dde2e6, 0 3px 8px rgba(0,0,0,0.2)' : '0 3px 8px rgba(0,0,0,0.25)';
        visual = `
            <div style="position:relative;width:100%;box-sizing:border-box;padding:0 ${empilhada ? 10 : 0}px ${empilhada ? 10 : 0}px 0;">
                <img src="${escaparAtributo(item.imagem)}" alt="${escaparAtributo(item.nome)}" onerror="${ERRO_IMAGEM_TROCO}" style="display:block;width:100%;height:auto;border-radius:8px;box-shadow:${sombra};">
                <div style="display:none;align-items:center;justify-content:center;aspect-ratio:2/1;border-radius:8px;background:#e8efe9;color:#27343d;font-weight:700;">${item.simbolo} ${nome}</div>
            </div>`;
    } else if (item.imagem) {
        visual = `
            <div style="position:relative;width:64px;height:64px;">
                <img src="${escaparAtributo(item.imagem)}" alt="${escaparAtributo(item.nome)}" onerror="${ERRO_IMAGEM_TROCO}" style="display:block;width:64px;height:64px;border-radius:50%;object-fit:cover;box-shadow:0 3px 8px rgba(0,0,0,0.25);">
                <div style="display:none;width:64px;height:64px;border-radius:50%;align-items:center;justify-content:center;background:#e8efe9;font-size:26px;">${item.simbolo}</div>
            </div>`;
    } else {
        visual = `<div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 30%, #e0a86a, #a8692f);border:3px solid #c98a4b;box-sizing:border-box;box-shadow:0 3px 8px rgba(0,0,0,0.25);color:#fff;font-weight:800;font-size:16px;">${escaparHTML(item.rotulo || '')}</div>`;
    }

    return `
        <div style="position:relative;width:${ehMoeda ? '72px' : 'calc(50% - 6px)'};box-sizing:border-box;display:flex;flex-direction:column;align-items:${ehMoeda ? 'center' : 'stretch'};gap:6px;">
            <div style="position:relative;">
                ${visual}
                <span style="position:absolute;top:-8px;right:-6px;min-width:28px;height:28px;padding:0 6px;border-radius:14px;border:2px solid #fff;background:#20a66a;color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">${item.quantidade}×</span>
            </div>
            <strong style="font-size:13px;color:#27343d;text-align:center;">${nome}</strong>
        </div>`;
}

function renderizarSugestoesTroco(sugestoes) {
    if (!listaCedulas) return;
    if (!sugestoes.length) { listaCedulas.innerHTML = '<p>Não foi possível montar sugestões de troco.</p>'; return; }

    listaCedulas.innerHTML = sugestoes.map((sugestao, idx) => {
        const totalPecas = sugestao.reduce((s, i) => s + i.quantidade, 0);
        return `
            <div class="sugestao-troco${idx === 0 ? ' destaque' : ''}" style="margin-bottom:14px;padding:14px;border-radius:16px;border:${idx === 0 ? '2px solid #20a66a' : '1px solid #dfe4e7'};background:${idx === 0 ? '#effaf5' : '#fff'};">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <strong style="font-size:18px;color:#27343d">${idx === 0 ? '⭐ Opção 1' : `Opção ${idx + 1}`}</strong>
                    <small>${totalPecas} ${totalPecas === 1 ? 'peça' : 'peças'}</small>
                </div>
                <div style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:18px 12px;">
                    ${sugestao.map(criarPecaTroco).join('')}
                </div>
            </div>`;
    }).join('');
}

// Inicializador automático
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarCalculadora, { once: true });
} else {
    iniciarCalculadora();
                                          }
