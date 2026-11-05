/* =====================================================
DR. TROCO — HISTÓRICO
Compatível com historico.html
Sincronizado com Supabase via DrTrocoDados (fallback local)
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
"use strict";

const CHAVE_VENDAS = "drTroco_vendas";
const CHAVE_MOVIMENTACOES = "drTroco_movimentacoes";
const CHAVE_SALDOS = "drTroco_saldosIniciais";
const CHAVE_SESSOES = "drTroco_sessoesCaixa";
const CHAVE_CONFIG_CAIXA = "drTroco_configCaixa";

const $ = (id) => document.getElementById(id);

const elementos = {
    filtroData: $("filtroData"),
    btnHoje: $("btnHoje"),
    btnExportarPDF: $("btnExportarPDF"),

    listaHistorico: $("listaHistorico"),
    relatorioHistorico: $("relatorioHistorico"),
    dataRelatorio: $("dataRelatorio"),
    quantidadeLancamentos: $("quantidadeLancamentos"),

    saldoInicial: $("historicoSaldoInicial"),
    saldoFinal: $("historicoSaldoFinal"),
    dinheiro: $("historicoDinheiro"),
    pix: $("historicoPix"),
    debito: $("historicoDebito"),
    credito: $("historicoCredito"),
    total: $("historicoTotal"),
    quantidade: $("historicoQuantidade"),
    entradas: $("historicoEntradas"),
    saidas: $("historicoSaidas"),

    btnNovaEntrada: $("btnNovaEntrada"),
    btnNovaSaida: $("btnNovaSaida"),
    modalMovimentacao: $("modalMovimentacao"),
    formMovimentacao: $("formMovimentacao"),
    tituloModalMovimentacao: $("tituloModalMovimentacao"),
    subtituloModalMovimentacao: $("subtituloModalMovimentacao"),
    iconeModalMovimentacao: $("iconeModalMovimentacao"),
    btnFecharModalMovimentacao: $("btnFecharModalMovimentacao"),
    btnCancelarMovimentacao: $("btnCancelarMovimentacao"),
    valorMovimentacao: $("valorMovimentacao"),
    formaPagamentoMovimentacao: $("formaPagamentoMovimentacao"),
    descricaoMovimentacao: $("descricaoMovimentacao"),

    modalDetalhes: $("modalDetalhesMovimentacao"),
    btnFecharDetalhes: $("btnFecharDetalhes"),
    detalhesIcone: $("detalhesIcone"),
    detalhesTipo: $("detalhesTipo"),
    detalhesValor: $("detalhesValor"),
    detalhesForma: $("detalhesForma"),
    detalhesDescricao: $("detalhesDescricao"),
    detalhesDataHora: $("detalhesDataHora"),
    btnExcluirDetalhe: $("btnExcluirDetalhe"),
    btnEditarDetalhe: $("btnEditarDetalhe"),

    inputHorarioCorte: $("inputHorarioCorte"),
    btnSalvarCorte: $("btnSalvarCorte"),
    statusCaixaHistorico: $("statusCaixaHistorico"),
    btnAbrirCaixaHistorico: $("btnAbrirCaixaHistorico"),
    btnFecharCaixaHistorico: $("btnFecharCaixaHistorico"),
    pdfDataInicio: $("pdfDataInicio"),
    pdfDataFim: $("pdfDataFim"),
    btnExportarPeriodoPDF: $("btnExportarPeriodoPDF")
};

let tipoMovimentacaoAtual = "entrada";
let lancamentoSelecionado = null;
let idMovimentacaoEmEdicao = null;

/* ==========================================================
   CONFIGURAÇÃO DE HORÁRIO DE CORTE E SESSÕES
========================================================== */

function obterConfigCaixa() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CONFIG_CAIXA) || '{"horarioCorte": "04:00"}');
    } catch {
        return { horarioCorte: '04:00' };
    }
}

function salvarConfigCaixa(config) {
    localStorage.setItem(CHAVE_CONFIG_CAIXA, JSON.stringify(config));
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

function obterSessoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SESSOES) || '[]');
    } catch {
        return [];
    }
}

function salvarSessoes(sessoes) {
    localStorage.setItem(CHAVE_SESSOES, JSON.stringify(sessoes));
}

function obterSessaoAtual() {
    const sessoes = obterSessoes();
    return sessoes.find(s => s.status === 'aberto') || null;
}

async function verificarFechamentoAutomatico() {
    const sessao = obterSessaoAtual();
    if (!sessao) return;

    const config = obterConfigCaixa();
    const agora = new Date();
    const horaAtualStr = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');

    if (horaAtualStr === config.horarioCorte) {
        await fecharCaixaAutomatico(sessao);
    }
}

setInterval(() => { verificarFechamentoAutomatico(); }, 30000);

/* =========================
   FUNÇÕES BÁSICAS
========================= */

function lerJSON(chave, padrao = []) {
    try {
        const valor = localStorage.getItem(chave);
        if (!valor) return padrao;
        const resultado = JSON.parse(valor);
        return resultado ?? padrao;
    } catch (erro) {
        console.error("Erro ao ler armazenamento:", chave, erro);
        return padrao;
    }
}

function salvarJSON(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
        return true;
    } catch (erro) {
        console.error("Erro ao salvar:", chave, erro);
        alert("Não foi possível salvar os dados. Verifique o espaço disponível no aparelho.");
        return false;
    }
}

function lerVendas() {
    const dados = lerJSON(CHAVE_VENDAS, []);
    return Array.isArray(dados) ? dados : [];
}

function lerMovimentacoes() {
    const dados = lerJSON(CHAVE_MOVIMENTACOES, []);
    return Array.isArray(dados) ? dados : [];
}

function lerSaldos() {
    const dados = lerJSON(CHAVE_SALDOS, {});
    return dados && typeof dados === "object" && !Array.isArray(dados)
        ? dados
        : {};
}

function moeda(valor) {
    const numeroVal = Number(valor);
    return (Number.isFinite(numeroVal) ? numeroVal : 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function numero(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : 0;
    }
    if (valor === null || valor === undefined || valor === "") {
        return 0;
    }
    if (typeof valor === "string") {
        const texto = valor.trim();
        if (texto.includes(",")) {
            const convertido = Number(
                texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
            );
            return Number.isFinite(convertido) ? convertido : 0;
        }
    }
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : 0;
}

function dataISOHoje() {
    return obterDataOperacional();
}

function formatarDataISO(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) {
        return "Data não informada";
    }
    const [ano, mes, dia] = String(iso).split("-");
    return `${dia}/${mes}/${ano}`;
}

function isoParaDataBR(isoStr) {
    if (!isoStr) return "";
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoStr)) return isoStr;
    const partes = isoStr.split("-");
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return isoStr;
}

function obterDataISO(registro) {
    if (!registro || typeof registro !== "object") {
        return "";
    }
    const candidatas = [
        registro.dataChave,
        registro.dataISO,
        registro.data,
        registro.dataVenda,
        registro.dataMovimentacao,
        registro.createdAt,
        registro.timestamp
    ];

    for (const candidata of candidatas) {
        if (!candidata) continue;
        const texto = String(candidata);
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
            return texto;
        }
        const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (br) {
            return `${br[3]}-${br[2]}-${br[1]}`;
        }
        const data = new Date(candidata);
        if (!Number.isNaN(data.getTime())) {
            const ano = data.getFullYear();
            const mes = String(data.getMonth() + 1).padStart(2, "0");
            const dia = String(data.getDate()).padStart(2, "0");
            return `${ano}-${mes}-${dia}`;
        }
    }
    return "";
}

function obterHora(registro) {
    if (registro.hora) return String(registro.hora);
    if (registro.dataHora) {
        const data = new Date(registro.dataHora);
        if (!Number.isNaN(data.getTime())) {
            return data.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit"
            });
        }
    }
    return "";
}

function obterValorVenda(venda) {
    const campos = ["total", "valorTotal", "totalVenda", "valor", "totalPagar", "totalGeral"];
    for (const campo of campos) {
        if (venda[campo] !== undefined && venda[campo] !== null) {
            return numero(venda[campo]);
        }
    }
    return 0;
}

function obterPagamento(registro) {
    const valor = String(
        registro.formaPagamento ??
        registro.pagamento ??
        registro.tipoPagamento ??
        registro.forma_pagamento ??
        "dinheiro"
    ).toLowerCase().trim();

    if (valor.includes("pix")) return "pix";
    if (valor.includes("debit")) return "debito";
    if (valor.includes("credit")) return "credito";
    if (valor.includes("dinheiro") || valor.includes("cash")) return "dinheiro";
    return valor || "dinheiro";
}

function nomePagamento(forma) {
    const nomes = {
        dinheiro: "Dinheiro",
        pix: "PIX",
        debito: "Débito",
        credito: "Crédito"
    };
    return nomes[forma] || forma || "Não informado";
}

function obterDescricao(registro) {
    return String(
        registro.descricao ??
        registro.nome ??
        registro.produto ??
        registro.observacao ??
        registro.itensResumo ??
        "Movimentação"
    );
}

function obterTipoMovimentacao(registro) {
    const tipo = String(
        registro.tipo ??
        registro.tipoMovimentacao ??
        registro.operacao ??
        ""
    ).toLowerCase();

    if (tipo.includes("saida") || tipo.includes("saída")) {
        return "saida";
    }
    return "entrada";
}

function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => {
        const mapa = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };
        return mapa[caractere];
    });
}

function criarId() {
    return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ==========================================================
   GESTÃO DE CAIXA (ABRIR / FECHAR) NO HISTÓRICO
========================================================== */

if (elementos.btnAbrirCaixaHistorico) {
    elementos.btnAbrirCaixaHistorico.addEventListener('click', async () => {
        const sessaoAberta = obterSessaoAtual();
        if (sessaoAberta) {
            alert('Já existe uma sessão de caixa aberta.');
            return;
        }

        const valorAberturaStr = prompt('Informe o valor em dinheiro inicial no caixa:', '0.00');
        if (valorAberturaStr === null) return;

        const valorAbertura = Number(valorAberturaStr.replace(',', '.'));
        if (isNaN(valorAbertura) || valorAbertura < 0) {
            alert('Valor de abertura inválido.');
            return;
        }

        const operador = prompt('Nome do operador (opcional):', '') || 'Operador';
        const dataOp = obterDataOperacional();

        const novaSessao = {
            id: 'sessao-' + Date.now(),
            status: 'aberto',
            dataAbertura: new Date().toISOString(),
            dataOperacional: dataOp,
            valorAbertura: valorAbertura,
            operador: operador
        };

        if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarSessao === 'function') {
            const r = await window.DrTrocoDados.salvarSessao(novaSessao);
            if (!r || !r.ok) {
                alert('Erro ao abrir caixa no Supabase: ' + ((r && r.erro) || ''));
                return;
            }
        } else {
            const sessoes = obterSessoes();
            sessoes.push(novaSessao);
            salvarSessoes(sessoes);
        }

        const saldos = lerSaldos();
        saldos[dataOp] = valorAbertura;
        salvarJSON(CHAVE_SALDOS, saldos);

        if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarSaldoInicial === 'function') {
            try {
                await window.DrTrocoDados.salvarSaldoInicial(dataOp, valorAbertura);
            } catch (err) {
                console.warn('[Histórico] Saldo inicial salvo só localmente:', err);
            }
        }

        alert('Caixa aberto com sucesso!');
        atualizarInterfaceCaixa();
        atualizarHistorico();
    });
}

if (elementos.btnFecharCaixaHistorico) {
    elementos.btnFecharCaixaHistorico.addEventListener('click', () => {
        const sessao = obterSessaoAtual();
        if (!sessao) {
            alert('Não há nenhuma sessão de caixa aberta no momento.');
            return;
        }
        fecharCaixaManual(sessao);
    });
}

async function fecharCaixaManual(sessao) {
    const totais = calcularTotaisParaData(sessao.dataOperacional);
    const dinheiroEsperado = sessao.valorAbertura + totais.dinheiro + totais.entradasDinheiro - totais.saidasDinheiro;

    const valorContadoStr = prompt(`CAIXA ESPERADO EM DINHEIRO: R$ ${dinheiroEsperado.toFixed(2)}\n\nInforme quanto dinheiro foi contado fisicamente no caixa:`, dinheiroEsperado.toFixed(2));
    if (valorContadoStr === null) return;

    const valorContado = Number(valorContadoStr.replace(',', '.'));
    if (isNaN(valorContado) || valorContado < 0) {
        alert('Valor contado inválido.');
        return;
    }

    const obs = prompt('Observação do fechamento (opcional):', '') || '';

    sessao.status = 'fechado';
    sessao.dataFechamento = new Date().toISOString();
    sessao.dinheiroEsperado = dinheiroEsperado;
    sessao.valorContado = valorContado;
    sessao.diferenca = valorContado - dinheiroEsperado;
    sessao.observacaoFechamento = obs;
    sessao.totais = totais;

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarSessao === 'function') {
        const r = await window.DrTrocoDados.salvarSessao(sessao);
        if (!r || !r.ok) {
            alert('Erro ao fechar caixa no Supabase: ' + ((r && r.erro) || ''));
            return;
        }
    } else {
        const sessoes = obterSessoes();
        const index = sessoes.findIndex(s => s.id === sessao.id);
        if (index >= 0) sessoes[index] = sessao;
        salvarSessoes(sessoes);
    }

    alert(`Caixa fechado com sucesso!\nDinheiro esperado: R$ ${dinheiroEsperado.toFixed(2)}\nDinheiro contado: R$ ${valorContado.toFixed(2)}\nDiferença: R$ ${sessao.diferenca.toFixed(2)}`);
    atualizarInterfaceCaixa();
    atualizarHistorico();
}

async function fecharCaixaAutomatico(sessao) {
    const totais = calcularTotaisParaData(sessao.dataOperacional);
    const dinheiroEsperado = sessao.valorAbertura + totais.dinheiro + totais.entradasDinheiro - totais.saidasDinheiro;

    sessao.status = 'fechado';
    sessao.dataFechamento = new Date().toISOString();
    sessao.dinheiroEsperado = dinheiroEsperado;
    sessao.valorContado = dinheiroEsperado;
    sessao.diferenca = 0;
    sessao.observacaoFechamento = 'Fechamento automático por horário de corte.';
    sessao.totais = totais;

    if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarSessao === 'function') {
        try {
            await window.DrTrocoDados.salvarSessao(sessao);
        } catch (err) {
            console.warn('[Histórico] Fechamento automático salvo só localmente:', err);
        }
    } else {
        const sessoes = obterSessoes();
        const index = sessoes.findIndex(s => s.id === sessao.id);
        if (index >= 0) sessoes[index] = sessao;
        salvarSessoes(sessoes);
    }
    atualizarInterfaceCaixa();
}

function atualizarInterfaceCaixa() {
    const sessao = obterSessaoAtual();
    if (elementos.statusCaixaHistorico) {
        if (sessao) {
            elementos.statusCaixaHistorico.textContent = 'CAIXA ABERTO';
            elementos.statusCaixaHistorico.className = 'status-caixa aberto';
            if (elementos.btnAbrirCaixaHistorico) elementos.btnAbrirCaixaHistorico.style.display = 'block';
            if (elementos.btnFecharCaixaHistorico) elementos.btnFecharCaixaHistorico.style.display = 'block';
        } else {
            elementos.statusCaixaHistorico.textContent = 'CAIXA FECHADO';
            elementos.statusCaixaHistorico.className = 'status-caixa fechado';
            if (elementos.btnAbrirCaixaHistorico) elementos.btnAbrirCaixaHistorico.style.display = 'block';
            if (elementos.btnFecharCaixaHistorico) elementos.btnFecharCaixaHistorico.style.display = 'none';
        }
    }
}

if (elementos.btnSalvarCorte && elementos.inputHorarioCorte) {
    const configAtual = obterConfigCaixa();
    elementos.inputHorarioCorte.value = configAtual.horarioCorte || "04:00";

    elementos.btnSalvarCorte.addEventListener("click", () => {
        const novoHorario = elementos.inputHorarioCorte.value;
        if (!novoHorario) {
            alert("Selecione um horário válido.");
            return;
        }
        salvarConfigCaixa({ horarioCorte: novoHorario });
        alert("Horário de corte atualizado com sucesso!");
        atualizarHistorico();
    });
}

/* =========================
   SALDO INICIAL
========================= */

function obterSaldoInicial(dataISO) {
    const saldos = lerSaldos();

    if (typeof saldos[dataISO] === "number" || typeof saldos[dataISO] === "string") {
        return numero(saldos[dataISO]);
    }

    if (saldos[dataISO] && typeof saldos[dataISO] === "object") {
        return numero(
            saldos[dataISO].saldoInicial ??
            saldos[dataISO].saldo ??
            saldos[dataISO].valor
        );
    }

    if (saldos.saldos && saldos.saldos[dataISO] !== undefined) {
        return numero(saldos.saldos[dataISO]);
    }

    if (saldos.data === dataISO) {
        return numero(saldos.saldoInicial ?? saldos.saldo ?? saldos.valor);
    }

    return 0;
}

/* =========================
   LISTA DE LANÇAMENTOS
========================= */

function criarRegistroVenda(venda, indice) {
    return {
        categoria: "venda",
        tipo: "venda",
        id: venda.id ?? venda.vendaId ?? `venda_${indice}`,
        original: venda,
        dataISO: obterDataISO(venda),
        valor: obterValorVenda(venda),
        forma: obterPagamento(venda),
        descricao: obterDescricao(venda),
        hora: obterHora(venda)
    };
}

function criarRegistroMovimentacao(movimento, indice) {
    const tipo = obterTipoMovimentacao(movimento);
    return {
        categoria: tipo,
        tipo,
        id: movimento.id ?? movimento.movimentacaoId ?? `mov_${indice}`,
        original: movimento,
        dataISO: obterDataISO(movimento),
        valor: numero(movimento.valor),
        forma: obterPagamento(movimento),
        descricao: obterDescricao(movimento),
        hora: obterHora(movimento)
    };
}

function obterRegistrosDoDia(dataISO) {
    const vendas = lerVendas()
        .map(criarRegistroVenda)
        .filter(registro => registro.dataISO === dataISO);

    const movimentacoes = lerMovimentacoes()
        .map(criarRegistroMovimentacao)
        .filter(registro => registro.dataISO === dataISO);

    return [...vendas, ...movimentacoes].sort((a, b) => {
        const horaA = a.hora || "";
        const horaB = b.hora || "";
        return horaB.localeCompare(horaA);
    });
}

function calcularTotaisParaData(dataISO) {
    const registros = obterRegistrosDoDia(dataISO);
    const vendas = registros.filter(item => item.categoria === "venda");
    const entradas = registros.filter(item => item.categoria === "entrada");
    const saidas = registros.filter(item => item.categoria === "saida");

    const totalVendido = vendas.reduce((soma, item) => soma + item.valor, 0);

    const dinheiro = vendas
        .filter(item => item.forma === "dinheiro")
        .reduce((soma, item) => soma + item.valor, 0);

    const pix = vendas
        .filter(item => item.forma === "pix")
        .reduce((soma, item) => soma + item.valor, 0);

    const debito = vendas
        .filter(item => item.forma === "debito")
        .reduce((soma, item) => soma + item.valor, 0);

    const credito = vendas
        .filter(item => item.forma === "credito")
        .reduce((soma, item) => soma + item.valor, 0);

    const totalEntradas = entradas.reduce((soma, item) => soma + item.valor, 0);
    const totalSaidas = saidas.reduce((soma, item) => soma + item.valor, 0);

    const saldoInicial = obterSaldoInicial(dataISO);

    const entradasDinheiro = entradas
        .filter(item => item.forma === "dinheiro")
        .reduce((soma, item) => soma + item.valor, 0);

    const saidasDinheiro = saidas
        .filter(item => item.forma === "dinheiro")
        .reduce((soma, item) => soma + item.valor, 0);

    const saldoFinalCaixa =
        saldoInicial + dinheiro + entradasDinheiro - saidasDinheiro;

    return {
        saldoInicial,
        dinheiro,
        pix,
        debito,
        credito,
        totalVendido,
        quantidadeVendas: vendas.length,
        entradas: totalEntradas,
        saidas: totalSaidas,
        entradasDinheiro,
        saidasDinheiro,
        saldoFinalCaixa,
        vendas,
        movimentacoes: [...entradas, ...saidas]
    };
}

/* =========================
   RESUMO FINANCEIRO
========================= */

function atualizarResumo(registros, dataISO) {
    const totais = calcularTotaisParaData(dataISO);

    elementos.saldoInicial.textContent = moeda(totais.saldoInicial);
    elementos.saldoFinal.textContent = moeda(totais.saldoFinalCaixa);
    elementos.dinheiro.textContent = moeda(totais.dinheiro);
    elementos.pix.textContent = moeda(totais.pix);
    elementos.debito.textContent = moeda(totais.debito);
    elementos.credito.textContent = moeda(totais.credito);
    elementos.total.textContent = moeda(totais.totalVendido);
    elementos.quantidade.textContent = `${totais.quantidadeVendas} venda${totais.quantidadeVendas === 1 ? "" : "s"}`;
    elementos.entradas.textContent = moeda(totais.entradas);
    elementos.saidas.textContent = moeda(totais.saidas);

    if (elementos.quantidadeLancamentos) {
        elementos.quantidadeLancamentos.textContent =
            `${registros.length} registro${registros.length === 1 ? "" : "s"}`;
    }

    if (elementos.dataRelatorio) {
        elementos.dataRelatorio.textContent =
            `Relatório de ${formatarDataISO(dataISO)}`;
    }
}

/* =========================
   RENDERIZAR HISTÓRICO
========================= */

function iconeRegistro(registro) {
    if (registro.categoria === "venda") return "🧾";
    if (registro.categoria === "entrada") return "↗";
    return "↘";
}

function nomeTipoRegistro(registro) {
    if (registro.categoria === "venda") return "Venda";
    if (registro.categoria === "entrada") return "Entrada no caixa";
    return "Saída do caixa";
}

function renderizarHistorico(registros) {
    if (!elementos.listaHistorico) return;

    if (registros.length === 0) {
        elementos.listaHistorico.innerHTML = `
            <div class="historico-vazio">
                <span class="icone">🧾</span>
                <strong>Nenhuma movimentação encontrada</strong>
                <p>Não existem registros para a data selecionada.</p>
            </div>
        `;
        return;
    }

    elementos.listaHistorico.innerHTML = registros.map((registro, indice) => {
        const corValor = registro.categoria === "saida" ? "#d94b4b" : "#168b53";
        const sinal = registro.categoria === "saida" ? "− " :
            registro.categoria === "entrada" ? "+ " : "";

        const detalhes = [
            nomePagamento(registro.forma),
            formatarDataISO(registro.dataISO),
            registro.hora
        ].filter(Boolean).join(" · ");

        return `
            <article class="item-historico"
                     data-indice="${indice}"
                     role="button"
                     tabindex="0"
                     aria-label="Ver detalhes: ${escaparHTML(nomeTipoRegistro(registro))}">

                <div class="icone-lancamento">
                    ${iconeRegistro(registro)}
                </div>

                <div class="info-lancamento">
                    <span class="titulo-lancamento">
                        ${escaparHTML(registro.descricao || nomeTipoRegistro(registro))}
                    </span>

                    <span class="detalhes-lancamento">
                        ${escaparHTML(nomeTipoRegistro(registro))} ·
                        ${escaparHTML(detalhes)}
                    </span>
                </div>

                <strong class="valor-lancamento"
                        style="color:${corValor}">
                    ${sinal}${moeda(registro.valor)}
                </strong>

                <button type="button"
                        class="lixeira-historico"
                        data-indice="${indice}"
                        aria-label="Excluir lançamento">
                    🗑
                </button>
            </article>
        `;
    }).join("");

    elementos.listaHistorico.querySelectorAll(".item-historico").forEach(item => {
        item.addEventListener("click", evento => {
            if (evento.target.closest(".lixeira-historico")) return;
            const indice = Number(item.dataset.indice);
            abrirDetalhes(registros[indice]);
        });

        item.addEventListener("keydown", evento => {
            if (evento.target !== item) return;
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                const indice = Number(item.dataset.indice);
                abrirDetalhes(registros[indice]);
            }
        });
    });

    elementos.listaHistorico.querySelectorAll(".lixeira-historico").forEach(botao => {
        botao.addEventListener("click", evento => {
            evento.stopPropagation();
            const indice = Number(botao.dataset.indice);
            const registro = registros[indice];
            if (registro) excluirRegistro(registro);
        });
    });
}

function atualizarHistorico() {
    const dataISO = elementos.filtroData?.value || dataISOHoje();
    const registros = obterRegistrosDoDia(dataISO);

    atualizarResumo(registros, dataISO);
    renderizarHistorico(registros);
}

/* =========================
   FILTRO DE DATA
========================= */

if (elementos.filtroData) {
    elementos.filtroData.value = dataISOHoje();
    elementos.filtroData.addEventListener("change", atualizarHistorico);
}

if (elementos.btnHoje) {
    elementos.btnHoje.addEventListener("click", () => {
        if (elementos.filtroData) {
            elementos.filtroData.value = dataISOHoje();
        }
        atualizarHistorico();
    });
}

/* =========================
   MODAL DE ENTRADA / SAÍDA
========================= */

function abrirModalMovimentacao(tipo, movimentacaoParaEditar = null) {
    tipoMovimentacaoAtual = tipo;
    idMovimentacaoEmEdicao = movimentacaoParaEditar ? (movimentacaoParaEditar.original?.id ?? movimentacaoParaEditar.id) : null;

    if (elementos.formMovimentacao) {
        elementos.formMovimentacao.reset();
    }

    if (movimentacaoParaEditar) {
        if (elementos.tituloModalMovimentacao) {
            elementos.tituloModalMovimentacao.textContent = tipo === "entrada" ? "Editar entrada" : "Editar saída";
        }
        if (elementos.subtituloModalMovimentacao) {
            elementos.subtituloModalMovimentacao.textContent = "Altere os dados da movimentação.";
        }
        if (elementos.valorMovimentacao) {
            elementos.valorMovimentacao.value = movimentacaoParaEditar.valor;
        }
        if (elementos.formaPagamentoMovimentacao) {
            elementos.formaPagamentoMovimentacao.value = movimentacaoParaEditar.forma;
        }
        if (elementos.descricaoMovimentacao) {
            elementos.descricaoMovimentacao.value = movimentacaoParaEditar.descricao;
        }
    } else {
        if (elementos.tituloModalMovimentacao) {
            elementos.tituloModalMovimentacao.textContent =
                tipo === "entrada" ? "Nova entrada" : "Nova saída";
        }
        if (elementos.subtituloModalMovimentacao) {
            elementos.subtituloModalMovimentacao.textContent =
                tipo === "entrada"
                    ? "Registre um valor que entrou no caixa."
                    : "Registre um valor que saiu do caixa.";
        }
    }

    if (elementos.iconeModalMovimentacao) {
        elementos.iconeModalMovimentacao.textContent =
            tipo === "entrada" ? "↗" : "↘";
    }

    if (elementos.modalMovimentacao) {
        elementos.modalMovimentacao.classList.add("ativo");
    }

    setTimeout(() => elementos.valorMovimentacao?.focus(), 100);
}

function fecharModalMovimentacao() {
    elementos.modalMovimentacao?.classList.remove("ativo");
    idMovimentacaoEmEdicao = null;
}

elementos.btnNovaEntrada?.addEventListener("click", () => {
    abrirModalMovimentacao("entrada");
});

elementos.btnNovaSaida?.addEventListener("click", () => {
    abrirModalMovimentacao("saida");
});

elementos.btnFecharModalMovimentacao?.addEventListener("click", fecharModalMovimentacao);
elementos.btnCancelarMovimentacao?.addEventListener("click", fecharModalMovimentacao);

elementos.modalMovimentacao?.addEventListener("click", evento => {
    if (evento.target === elementos.modalMovimentacao) {
        fecharModalMovimentacao();
    }
});

if (elementos.formMovimentacao) {
    elementos.formMovimentacao.addEventListener("submit", async evento => {
        evento.preventDefault();

        const valor = numero(elementos.valorMovimentacao?.value);
        const forma = elementos.formaPagamentoMovimentacao?.value || "dinheiro";
        const descricao = elementos.descricaoMovimentacao?.value.trim();

        if (!Number.isFinite(valor) || valor <= 0) {
            alert("Informe um valor maior que zero.");
            elementos.valorMovimentacao?.focus();
            return;
        }

        if (!descricao) {
            alert("Informe uma descrição para a movimentação.");
            elementos.descricaoMovimentacao?.focus();
            return;
        }

        const movimentacoes = lerMovimentacoes();

        if (idMovimentacaoEmEdicao) {
            const indice = movimentacoes.findIndex(item => String(item.id) === String(idMovimentacaoEmEdicao));
            if (indice < 0) {
                alert("Não foi possível localizar a movimentação para editar.");
                return;
            }

            const atualizado = {
                ...movimentacoes[indice],
                tipo: tipoMovimentacaoAtual,
                valor,
                formaPagamento: forma,
                descricao
            };

            if (window.DrTrocoDados && typeof window.DrTrocoDados.atualizarMovimentacao === 'function') {
                const r = await window.DrTrocoDados.atualizarMovimentacao(atualizado);
                if (!r || !r.ok) {
                    alert('Erro ao atualizar no Supabase: ' + ((r && r.erro) || ''));
                    return;
                }
            } else {
                movimentacoes[indice] = atualizado;
                if (!salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes)) return;
            }

            fecharModalMovimentacao();
            atualizarHistorico();
            alert("Movimentação atualizada com sucesso!");
        } else {
            const dataISO = elementos.filtroData?.value || dataISOHoje();
            const agora = new Date();

            const movimento = {
                id: criarId(),
                tipo: tipoMovimentacaoAtual,
                valor,
                formaPagamento: forma,
                descricao,
                data: formatarDataISO(dataISO),
                dataChave: dataISO,
                hora: agora.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit"
                })
            };

            if (window.DrTrocoDados && typeof window.DrTrocoDados.salvarMovimentacao === 'function') {
                const r = await window.DrTrocoDados.salvarMovimentacao(movimento);
                if (!r || !r.ok) {
                    movimentacoes.push(movimento);
                    salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes);
                    console.warn('[Histórico] Movimentação salva só localmente:', r && r.erro);
                }
            } else {
                movimentacoes.push(movimento);
                if (!salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes)) return;
            }

            fecharModalMovimentacao();
            atualizarHistorico();

            alert(
                tipoMovimentacaoAtual === "entrada"
                    ? "Entrada registrada com sucesso!"
                    : "Saída registrada com sucesso!"
            );
        }

        idMovimentacaoEmEdicao = null;
    });
}

/* =========================
   DETALHES DO LANÇAMENTO
========================= */

function abrirDetalhes(registro) {
    if (!registro || !elementos.modalDetalhes) return;

    lancamentoSelecionado = registro;
    elementos.detalhesIcone.textContent = iconeRegistro(registro);
    elementos.detalhesTipo.textContent = nomeTipoRegistro(registro);

    const sinal = registro.categoria === "saida" ? "− " :
        registro.categoria === "entrada" ? "+ " : "";

    elementos.detalhesValor.textContent = sinal + moeda(registro.valor);
    elementos.detalhesForma.textContent = nomePagamento(registro.forma);
    elementos.detalhesDescricao.textContent = registro.descricao || "Sem descrição";
    elementos.detalhesDataHora.textContent =
        `${formatarDataISO(registro.dataISO)}${registro.hora ? " às " + registro.hora : ""}`;

    const ehMovimentacaoManual = registro.categoria === "entrada" || registro.categoria === "saida";

    if (elementos.btnExcluirDetalhe) {
        elementos.btnExcluirDetalhe.style.display = "";
    }

    if (elementos.btnEditarDetalhe) {
        elementos.btnEditarDetalhe.style.display = ehMovimentacaoManual ? "" : "none";
    }

    elementos.modalDetalhes.classList.add("ativo");
}

function fecharDetalhes() {
    elementos.modalDetalhes?.classList.remove("ativo");
    lancamentoSelecionado = null;
}

elementos.btnFecharDetalhes?.addEventListener("click", fecharDetalhes);

elementos.modalDetalhes?.addEventListener("click", evento => {
    if (evento.target === elementos.modalDetalhes) {
        fecharDetalhes();
    }
});

/* =========================
   EXCLUIR REGISTRO
========================= */

async function excluirRegistro(registro) {
    if (!registro) return;

    const nomeTipo = registro.categoria === "venda" ? "esta venda" :
        (registro.categoria === "entrada" ? "esta entrada" : "esta saída");

    const confirmado = confirm(
        `Deseja excluir ${nomeTipo}?\n\n` +
        `${registro.descricao}\n${moeda(registro.valor)}`
    );

    if (!confirmado) return;

    const idParaExcluir = registro.id ?? registro.original?.id ?? registro.original?.vendaId;

    if (registro.categoria === "venda") {
        if (window.DrTrocoDados && typeof window.DrTrocoDados.excluirVenda === 'function') {
            const r = await window.DrTrocoDados.excluirVenda(idParaExcluir);
            if (!r || !r.ok) {
                alert('Erro ao excluir venda no Supabase: ' + ((r && r.erro) || ''));
                return;
            }
        } else {
            const vendas = lerVendas();
            const original = registro.original;
            let indice = vendas.findIndex(item =>
                String(item.id ?? item.vendaId) === String(original?.id ?? original?.vendaId) &&
                (original?.id !== undefined || original?.vendaId !== undefined)
            );

            if (indice < 0) {
                indice = vendas.findIndex(item =>
                    obterDataISO(item) === registro.dataISO &&
                    obterValorVenda(item) === registro.valor &&
                    obterPagamento(item) === registro.forma &&
                    obterDescricao(item) === registro.descricao
                );
            }

            if (indice < 0) {
                alert("Não foi possível localizar esta venda para excluir.");
                return;
            }

            vendas.splice(indice, 1);
            if (!salvarJSON(CHAVE_VENDAS, vendas)) return;
        }
    } else {
        if (window.DrTrocoDados && typeof window.DrTrocoDados.excluirMovimentacao === 'function') {
            const r = await window.DrTrocoDados.excluirMovimentacao(idParaExcluir);
            if (!r || !r.ok) {
                alert('Erro ao excluir no Supabase: ' + ((r && r.erro) || ''));
                return;
            }
        } else {
            const movimentacoes = lerMovimentacoes();
            const original = registro.original;
            let indice = movimentacoes.findIndex(item =>
                String(item.id) === String(original?.id) && original?.id !== undefined
            );

            if (indice < 0) {
                indice = movimentacoes.findIndex(item =>
                    obterDataISO(item) === registro.dataISO &&
                    numero(item.valor) === registro.valor &&
                    obterTipoMovimentacao(item) === registro.categoria &&
                    obterDescricao(item) === registro.descricao &&
                    obterPagamento(item) === registro.forma
                );
            }

            if (indice < 0) {
                alert("Não foi possível localizar este lançamento para excluir.");
                return;
            }

            movimentacoes.splice(indice, 1);
            if (!salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes)) return;
        }
    }

    fecharDetalhes();
    atualizarHistorico();
    alert("Registro excluído com sucesso!");
}

elementos.btnExcluirDetalhe?.addEventListener("click", () => {
    if (lancamentoSelecionado) {
        excluirRegistro(lancamentoSelecionado);
    }
});

elementos.btnEditarDetalhe?.addEventListener("click", () => {
    if (!lancamentoSelecionado) return;
    const registro = lancamentoSelecionado;

    if (registro.categoria !== "entrada" && registro.categoria !== "saida") {
        alert("Apenas entradas e saídas manuais podem ser editadas.");
        return;
    }

    fecharDetalhes();
    abrirModalMovimentacao(registro.categoria, registro);
});

/* ==========================================================
   EXPORTAÇÃO DE PDF
========================================================== */

if (elementos.btnExportarPeriodoPDF) {
    elementos.btnExportarPeriodoPDF.addEventListener("click", () => {
        const inicio = elementos.pdfDataInicio ? elementos.pdfDataInicio.value : '';
        const fim = elementos.pdfDataFim ? elementos.pdfDataFim.value : '';

        if (!inicio || !fim) {
            alert('Selecione a data inicial e a data final.');
            return;
        }

        if (inicio > fim) {
            alert('A data inicial não pode ser superior à data final.');
            return;
        }

        gerarPDFIntervalo(inicio, fim);
    });
}

function gerarPDFIntervalo(dataInicioISO, dataFimISO) {
    let atual = new Date(dataInicioISO + 'T00:00:00');
    const fim = new Date(dataFimISO + 'T00:00:00');

    let acumuladoDinheiro = 0;
    let acumuladoPix = 0;
    let acumuladoDebito = 0;
    let acumuladoCredito = 0;
    let acumuladoVendasTotal = 0;
    let acumuladoEntradas = 0;
    let acumuladoSaidas = 0;
    let htmlLinhas = '';

    while (atual <= fim) {
        const iso = atual.toISOString().slice(0, 10);
        const totais = calcularTotaisParaData(iso);

        acumuladoDinheiro += totais.dinheiro;
        acumuladoPix += totais.pix;
        acumuladoDebito += totais.debito;
        acumuladoCredito += totais.credito;
        acumuladoVendasTotal += totais.totalVendido;
        acumuladoEntradas += totais.entradas;
        acumuladoSaidas += totais.saidas;

        htmlLinhas += `
            <tr>
                <td><strong>${isoParaDataBR(iso)}</strong></td>
                <td>${moeda(totais.saldoFinalCaixa)}</td>
                <td>${moeda(totais.totalVendido)} (${totais.quantidadeVendas}v)</td>
                <td>${moeda(totais.dinheiro)}</td>
                <td>${moeda(totais.pix)}</td>
                <td>${moeda(totais.entradas)}</td>
                <td>${moeda(totais.saidas)}</td>
            </tr>
        `;

        atual.setDate(atual.getDate() + 1);
    }

    let estabelecimento = {};
    try {
        estabelecimento = JSON.parse(localStorage.getItem("drTroco_estabelecimento") || "{}");
    } catch {
        estabelecimento = {};
    }

    const dadosEstabelecimento = [
        estabelecimento.nomeEstabelecimento,
        estabelecimento.responsavelEstabelecimento ? `Responsável: ${estabelecimento.responsavelEstabelecimento}` : "",
        estabelecimento.telefoneEstabelecimento ? `Telefone: ${estabelecimento.telefoneEstabelecimento}` : "",
        estabelecimento.emailEstabelecimento ? `E-mail: ${estabelecimento.emailEstabelecimento}` : "",
        estabelecimento.enderecoEstabelecimento,
        [estabelecimento.cidadeEstabelecimento, estabelecimento.estadoEstabelecimento].filter(Boolean).join(" - ")
    ].filter(valor => String(valor || "").trim());

    const dadosEstabelecimentoHTML = dadosEstabelecimento
        .map((informacao, indice) => indice === 0 ? `<h2>${escaparHTML(informacao)}</h2>` : `<p>${escaparHTML(informacao)}</p>`)
        .join("");

    const janela = window.open("", "_blank");
    if (!janela) {
        alert("O navegador bloqueou a janela pop-up. Permita pop-ups e tente novamente.");
        return;
    }

    janela.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Relatório Dr. Troco — Período</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 25px; color: #263640; font-size: 12px; }
                h1 { color: #168b53; margin-bottom: 5px; font-size: 20px; }
                h2 { font-size: 17px; margin: 12px 0 6px; }
                p { color: #52635b; margin: 4px 0; font-size: 12px; }
                .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
                .card { border: 1px solid #ddd; padding: 10px; border-radius: 8px; background: #f9f9f9; }
                .card span { display: block; font-size: 10px; color: #777; font-weight: bold; }
                .card strong { font-size: 14px; color: #168b53; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
                th { background: #eaf8f1; color: #168b53; }
            </style>
        </head>
        <body>
            <h1>Dr. Troco — Relatório Consolidado de Período</h1>
            ${dadosEstabelecimentoHTML}
            <p>Período de: <strong>${isoParaDataBR(dataInicioISO)}</strong> até <strong>${isoParaDataBR(dataFimISO)}</strong></p>

            <div class="resumo">
                <div class="card"><span>TOTAL VENDIDO</span><strong>${moeda(acumuladoVendasTotal)}</strong></div>
                <div class="card"><span>DINHEIRO</span><strong>${moeda(acumuladoDinheiro)}</strong></div>
                <div class="card"><span>PIX</span><strong>${moeda(acumuladoPix)}</strong></div>
                <div class="card"><span>ENTRADAS / SAÍDAS</span><strong>${moeda(acumuladoEntradas - acumuladoSaidas)}</strong></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Saldo Caixa</th>
                        <th>Vendas</th>
                        <th>Dinheiro</th>
                        <th>Pix</th>
                        <th>Entradas</th>
                        <th>Saídas</th>
                    </tr>
                </thead>
                <tbody>
                    ${htmlLinhas}
                </tbody>
            </table>

            <script>
                window.onload = () => { setTimeout(() => window.print(), 300); };
            </script>
        </body>
        </html>
    `);
    janela.document.close();
}

async function exportarPDF() {
    const dataISO = elementos.filtroData?.value || dataISOHoje();
    const registros = obterRegistrosDoDia(dataISO);
    gerarPDFIntervalo(dataISO, dataISO);
}

elementos.btnExportarPDF?.addEventListener("click", exportarPDF);

/* =========================
   TECLA ESC FECHA OS MODAIS
========================= */

document.addEventListener("keydown", evento => {
    if (evento.key !== "Escape") return;
    fecharModalMovimentacao();
    fecharDetalhes();
});

/* =========================
   INICIALIZAÇÃO
   Renderiza com cache local, depois sincroniza e re-renderiza SEMPRE
========================= */

atualizarInterfaceCaixa();
atualizarHistorico();

if (window.DrTrocoDados) {
    // Escuta qualquer sincronização (mesmo parcial) e re-renderiza
    if (typeof window.DrTrocoDados.onSync === 'function') {
        window.DrTrocoDados.onSync(() => {
            console.log('[Histórico] onSync disparado — re-renderizando');
            atualizarHistorico();
            atualizarInterfaceCaixa();
        });
    }

    // Dispara sincronização inicial (sempre re-renderiza ao final)
    if (typeof window.DrTrocoDados.sincronizar === 'function') {
        window.DrTrocoDados.sincronizar()
            .then(resultado => {
                console.log('[Histórico] Sync finalizado. Resultado:', resultado);
                atualizarHistorico();
                atualizarInterfaceCaixa();
            })
            .catch(err => {
                console.warn('[Histórico] Sync falhou:', err);
                atualizarHistorico();
                atualizarInterfaceCaixa();
            });
    }
}

});
