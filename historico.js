/* =====================================================
   DR. TROCO — HISTÓRICO
   Compatível com historico.html
   Armazenamento original preservado
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const CHAVE_VENDAS = "drTroco_vendas";
    const CHAVE_MOVIMENTACOES = "drTroco_movimentacoes";
    const CHAVE_SALDOS = "drTroco_saldosIniciais";

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
        btnEditarDetalhe: $("btnEditarDetalhe")
    };

    let tipoMovimentacaoAtual = "entrada";
    let lancamentoSelecionado = null;
    let idMovimentacaoEmEdicao = null;

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
        const numero = Number(valor);

        return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
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
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, "0");
        const dia = String(agora.getDate()).padStart(2, "0");

        return `${ano}-${mes}-${dia}`;
    }

    function formatarDataISO(iso) {
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) {
            return "Data não informada";
        }

        const [ano, mes, dia] = String(iso).split("-");
        return `${dia}/${mes}/${ano}`;
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
        const campos = [
            "total",
            "valorTotal",
            "totalVenda",
            "valor",
            "totalPagar",
            "totalGeral"
        ];

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

    /* =========================
       RESUMO FINANCEIRO
    ========================= */

    function atualizarResumo(registros, dataISO) {
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

        const saldoFinal =
            saldoInicial + dinheiro + entradasDinheiro - saidasDinheiro;

        elementos.saldoInicial.textContent = moeda(saldoInicial);
        elementos.saldoFinal.textContent = moeda(saldoFinal);
        elementos.dinheiro.textContent = moeda(dinheiro);
        elementos.pix.textContent = moeda(pix);
        elementos.debito.textContent = moeda(debito);
        elementos.credito.textContent = moeda(credito);
        elementos.total.textContent = moeda(totalVendido);
        elementos.quantidade.textContent = `${vendas.length} venda${vendas.length === 1 ? "" : "s"}`;
        elementos.entradas.textContent = moeda(totalEntradas);
        elementos.saidas.textContent = moeda(totalSaidas);

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
       MODAL DE ENTRADA / SAÍDA (CRIAÇÃO E EDIÇÃO)
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

    elementos.btnFecharModalMovimentacao?.addEventListener(
        "click",
        fecharModalMovimentacao
    );

    elementos.btnCancelarMovimentacao?.addEventListener(
        "click",
        fecharModalMovimentacao
    );

    elementos.modalMovimentacao?.addEventListener("click", evento => {
        if (evento.target === elementos.modalMovimentacao) {
            fecharModalMovimentacao();
        }
    });

    if (elementos.formMovimentacao) {
        elementos.formMovimentacao.addEventListener("submit", evento => {
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

                movimentacoes[indice] = {
                    ...movimentacoes[indice],
                    tipo: tipoMovimentacaoAtual,
                    valor,
                    formaPagamento: forma,
                    descricao
                };

                if (!salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes)) return;

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

                movimentacoes.push(movimento);

                if (!salvarJSON(CHAVE_MOVIMENTACOES, movimentacoes)) return;

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
            elementos.btnExcluirDetalhe.style.display = ""; // Disponível para todos os registros
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
       EXCLUIR REGISTRO (VENDA OU MOVIMENTAÇÃO)
    ========================= */

    function excluirRegistro(registro) {
        if (!registro) return;

        const nomeTipo = registro.categoria === "venda" ? "esta venda" :
            (registro.categoria === "entrada" ? "esta entrada" : "esta saída");

        const confirmado = confirm(
            `Deseja excluir ${nomeTipo}?\n\n` +
            `${registro.descricao}\n${moeda(registro.valor)}`
        );

        if (!confirmado) return;

        if (registro.categoria === "venda") {
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

        fecharDetalhes();
        atualizarHistorico();

        alert("Registro excluído com sucesso!");
    }

    elementos.btnExcluirDetalhe?.addEventListener("click", () => {
        if (lancamentoSelecionado) {
            excluirRegistro(lancamentoSelecionado);
        }
    });

    /* =========================
       EDITAR MOVIMENTAÇÃO NOS DETALHES
    ========================= */

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

    /* =========================
       EXPORTAR PDF
    ========================= */

    async function exportarPDF() {
        const dataISO = elementos.filtroData?.value || dataISOHoje();
        const registros = obterRegistrosDoDia(dataISO);

        if (registros.length === 0) {
            const continuar = confirm(
                "Não existem movimentações nesta data. Deseja gerar o relatório mesmo assim?"
            );

            if (!continuar) return;
        }

        const nomeArquivo = `Dr-Troco-Historico-${dataISO.split("-").reverse().join("-")}.pdf`;

        const jsPDF =
            window.jspdf?.jsPDF ||
            window.jsPDF;

        if (jsPDF) {
            try {
                const doc = new jsPDF({ unit: "mm", format: "a4" });

                let y = 18;

                doc.setFontSize(19);
                doc.setTextColor(32, 167, 103);
                doc.text("Dr. Troco — Histórico", 14, y);

                y += 9;
                doc.setFontSize(11);
                doc.setTextColor(80, 90, 85);
                doc.text(`Data: ${formatarDataISO(dataISO)}`, 14, y);

                y += 10;

                const saldoInicial = obterSaldoInicial(dataISO);
                const vendas = registros.filter(item => item.categoria === "venda");
                const entradas = registros.filter(item => item.categoria === "entrada");
                const saidas = registros.filter(item => item.categoria === "saida");

                const totalDinheiro = vendas
                    .filter(item => item.forma === "dinheiro")
                    .reduce((soma, item) => soma + item.valor, 0);

                const entradasDinheiro = entradas
                    .filter(item => item.forma === "dinheiro")
                    .reduce((soma, item) => soma + item.valor, 0);

                const saidasDinheiro = saidas
                    .filter(item => item.forma === "dinheiro")
                    .reduce((soma, item) => soma + item.valor, 0);

                const saldoFinal = saldoInicial + totalDinheiro +
                    entradasDinheiro - saidasDinheiro;

                const totalVendido = vendas.reduce((soma, item) => soma + item.valor, 0);
                const totalEntradas = entradas.reduce((soma, item) => soma + item.valor, 0);
                const totalSaidas = saidas.reduce((soma, item) => soma + item.valor, 0);

                const linhasResumo = [
                    `Saldo inicial: ${moeda(saldoInicial)}`,
                    `Total vendido: ${moeda(totalVendido)}`,
                    `Entradas: ${moeda(totalEntradas)}`,
                    `Saídas: ${moeda(totalSaidas)}`,
                    `Saldo final físico: ${moeda(saldoFinal)}`
                ];

                doc.setFontSize(11);
                doc.setTextColor(38, 54, 64);

                linhasResumo.forEach(linha => {
                    doc.text(linha, 14, y);
                    y += 7;
                });

                y += 5;
                doc.setFontSize(13);
                doc.setFont(undefined, "bold");
                doc.text("Movimentações", 14, y);
                y += 8;

                doc.setFont(undefined, "normal");
                doc.setFontSize(9);

                registros.forEach(registro => {
                    if (y > 275) {
                        doc.addPage();
                        y = 18;
                    }

                    const texto =
                        `${nomeTipoRegistro(registro)} | ${registro.descricao} | ` +
                        `${nomePagamento(registro.forma)} | ${moeda(registro.valor)}`;

                    const linhas = doc.splitTextToSize(texto, 180);

                    doc.text(linhas, 14, y);
                    y += linhas.length * 5 + 2;
                });

                doc.save(nomeArquivo);
                return;
            } catch (erro) {
                console.error("Erro ao criar PDF:", erro);
                alert("Não foi possível criar o PDF. O navegador tentará abrir a impressão.");
            }
        }

        const janela = window.open("", "_blank");

        if (!janela) {
            alert("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
            return;
        }

        const linhasHTML = registros.map(registro => `
            <tr>
                <td>${escaparHTML(nomeTipoRegistro(registro))}</td>
                <td>${escaparHTML(registro.descricao)}</td>
                <td>${escaparHTML(nomePagamento(registro.forma))}</td>
                <td>${escaparHTML(registro.hora || "—")}</td>
                <td>${escaparHTML(moeda(registro.valor))}</td>
            </tr>
        `).join("");

        janela.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>${escaparHTML(nomeArquivo)}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 25px;
                        color: #263640;
                    }
                    h1 { color: #168b53; }
                    p { color: #52635b; }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        padding: 9px 6px;
                        border-bottom: 1px solid #ddd;
                        text-align: left;
                        font-size: 11px;
                        overflow-wrap: anywhere;
                    }
                    th { background: #eaf8f1; }
                    @media print {
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <h1>Dr. Troco — Histórico</h1>
                <p>Data: ${escaparHTML(formatarDataISO(dataISO))}</p>
                <p>Registros: ${registros.length}</p>

                <table>
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Descrição</th>
                            <th>Pagamento</th>
                            <th>Hora</th>
                            <th>Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasHTML || '<tr><td colspan="5">Nenhum registro nesta data.</td></tr>'}
                    </tbody>
                </table>

                <script>
                    window.onload = function() {
                        window.print();
                    };
                <\/script>
            </body>
            </html>
        `);

        janela.document.close();
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
    ========================= */

    atualizarHistorico();

});
