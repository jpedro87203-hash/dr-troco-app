```javascript
        return nomes[forma] || forma || "Não informado";
    }

    function obterDescricao(registro) {
        return String(
            registro.descricao ??
            registro.nome ??
            registro.produtoNome ??
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

        if (tipo.includes("saida") || tipo.includes("saída")) return "saida";
        return "entrada";
    }

    function obterTipoEstoque(movimento) {
        const tipo = String(movimento?.tipo || "").toLowerCase().trim();

        if (tipo.includes("saida") || tipo.includes("saída")) return "saida";
        if (tipo.includes("entrada")) return "entrada";
        if (tipo.includes("ajuste")) return "ajuste";
        if (tipo.includes("cadastro")) return "cadastro";
        if (tipo.includes("exclusao") || tipo.includes("exclusão")) return "exclusao";

        return tipo || "movimentacao";
    }

    function ehRegistroEstoque(registro) {
        return registro?.categoria === "estoque";
    }

    function obterQuantidadeTexto(registro) {
        const quantidade = numero(registro.quantidade);
        return `${quantidade} ${quantidade === 1 ? "unidade" : "unidades"}`;
    }

    function obterVariacaoEstoque(registro) {
        const anterior = registro.quantidadeAnterior;
        const nova = registro.quantidadeNova;

        if (anterior === undefined || nova === undefined) return "";

        return `Estoque: ${numero(anterior)} → ${numero(nova)} unidades`;
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

    function criarRegistroMovimentacaoEstoque(item, indice) {
        const movimento = item.movimento;

        return {
            categoria: "estoque",
            tipo: "estoque",
            tipoEstoque: obterTipoEstoque(movimento),
            id: movimento.id ?? `estoque_${indice}`,
            original: movimento,
            chaveOrigem: item.chave,
            indiceOrigem: item.indice,
            dataISO: obterDataISO(movimento),
            hora: obterHora(movimento),
            descricao: obterDescricao(movimento),
            quantidade: numero(movimento.quantidade),
            quantidadeAnterior: movimento.quantidadeAnterior,
            quantidadeNova: movimento.quantidadeNova,
            valor: 0,
            forma: "estoque"
        };
    }

    function obterRegistrosDoDia(dataISO) {
        const vendas = lerVendas()
            .map(criarRegistroVenda)
            .filter(registro => registro.dataISO === dataISO);

        const movimentacoes = lerMovimentacoes()
            .map(criarRegistroMovimentacao)
            .filter(registro => registro.dataISO === dataISO);

        const movimentacoesEstoque = lerMovimentacoesEstoque()
            .map(criarRegistroMovimentacaoEstoque)
            .filter(registro => registro.dataISO === dataISO);

        return [...vendas, ...movimentacoes, ...movimentacoesEstoque].sort((a, b) => {
            const horaA = a.hora || "";
            const horaB = b.hora || "";
            return horaB.localeCompare(horaA);
        });
    }

    /* =========================
       RESUMO FINANCEIRO
       Movimentações de estoque NÃO entram nos valores do caixa.
    ========================= */

    function atualizarResumo(registros, dataISO) {
        const registrosFinanceiros = registros.filter(item => !ehRegistroEstoque(item));
        const vendas = registrosFinanceiros.filter(item => item.categoria === "venda");
        const entradas = registrosFinanceiros.filter(item => item.categoria === "entrada");
        const saidas = registrosFinanceiros.filter(item => item.categoria === "saida");

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

        const saldoFinal = saldoInicial + dinheiro + entradasDinheiro - saidasDinheiro;

        if (elementos.saldoInicial) elementos.saldoInicial.textContent = moeda(saldoInicial);
        if (elementos.saldoFinal) elementos.saldoFinal.textContent = moeda(saldoFinal);
        if (elementos.dinheiro) elementos.dinheiro.textContent = moeda(dinheiro);
        if (elementos.pix) elementos.pix.textContent = moeda(pix);
        if (elementos.debito) elementos.debito.textContent = moeda(debito);
        if (elementos.credito) elementos.credito.textContent = moeda(credito);
        if (elementos.total) elementos.total.textContent = moeda(totalVendido);

        if (elementos.quantidade) {
            elementos.quantidade.textContent = `${vendas.length} venda${vendas.length === 1 ? "" : "s"}`;
        }

        if (elementos.entradas) elementos.entradas.textContent = moeda(totalEntradas);
        if (elementos.saidas) elementos.saidas.textContent = moeda(totalSaidas);

        if (elementos.quantidadeLancamentos) {
            elementos.quantidadeLancamentos.textContent =
                `${registros.length} registro${registros.length === 1 ? "" : "s"}`;
        }

        if (elementos.dataRelatorio) {
            elementos.dataRelatorio.textContent = `Relatório de ${formatarDataISO(dataISO)}`;
        }
    }

    /* =========================
       RENDERIZAR HISTÓRICO
    ========================= */

    function iconeRegistro(registro) {
        if (registro.categoria === "venda") return "🧾";

        if (ehRegistroEstoque(registro)) {
            if (registro.tipoEstoque === "entrada") return "📥";
            if (registro.tipoEstoque === "saida") return "📤";
            if (registro.tipoEstoque === "ajuste") return "🔧";
            if (registro.tipoEstoque === "cadastro") return "📦";
            if (registro.tipoEstoque === "exclusao") return "🗑️";
            return "📦";
        }

        if (registro.categoria === "entrada") return "↗";
        return "↘";
    }

    function nomeTipoRegistro(registro) {
        if (registro.categoria === "venda") return "Venda";

        if (ehRegistroEstoque(registro)) {
            const nomes = {
                entrada: "Entrada no estoque",
                saida: "Saída do estoque",
                ajuste: "Ajuste de estoque",
                cadastro: "Cadastro de produto",
                exclusao: "Exclusão de produto"
            };
            return nomes[registro.tipoEstoque] || "Movimentação de estoque";
        }

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
            const ehEstoque = ehRegistroEstoque(registro);
            const ehSaida = registro.categoria === "saida" ||
                (ehEstoque && registro.tipoEstoque === "saida");
            const corValor = ehSaida ? "#d94b4b" : "#168b53";
            const sinal = registro.categoria === "saida" ? "− " :
                registro.categoria === "entrada" ? "+ " : "";

            const detalhes = ehEstoque
                ? ["Estoque", formatarDataISO(registro.dataISO), registro.hora].filter(Boolean).join(" · ")
                : [nomePagamento(registro.forma), formatarDataISO(registro.dataISO), registro.hora].filter(Boolean).join(" · ");

            const valorExibido = ehEstoque
                ? obterQuantidadeTexto(registro)
                : `${sinal}${moeda(registro.valor)}`;

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

                    <strong class="valor-lancamento" style="color:${corValor}">
                        ${escaparHTML(valorExibido)}
                    </strong>

                    ${ehEstoque ? "" : `
                        <button type="button"
                                class="lixeira-historico"
                                data-indice="${indice}"
                                aria-label="Excluir lançamento">
                            🗑
                        </button>
                    `}
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
            if (elementos.filtroData) elementos.filtroData.value = dataISOHoje();
            atualizarHistorico();
        });
    }

    /* =========================
       MODAL DE ENTRADA / SAÍDA (CRIAÇÃO E EDIÇÃO)
    ========================= */

    function abrirModalMovimentacao(tipo, movimentacaoParaEditar = null) {
        tipoMovimentacaoAtual = tipo;
        idMovimentacaoEmEdicao = movimentacaoParaEditar
            ? (movimentacaoParaEditar.original?.id ?? movimentacaoParaEditar.id)
            : null;

        if (elementos.formMovimentacao) elementos.formMovimentacao.reset();

        if (movimentacaoParaEditar) {
            if (elementos.tituloModalMovimentacao) {
                elementos.tituloModalMovimentacao.textContent =
                    tipo === "entrada" ? "Editar entrada" : "Editar saída";
            }

            if (elementos.subtituloModalMovimentacao) {
                elementos.subtituloModalMovimentacao.textContent =
                    "Altere os dados da movimentação.";
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

        elementos.modalMovimentacao?.classList.add("ativo");
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
        if (evento.target === elementos.modalMovimentacao) fecharModalMovimentacao();
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
                const indice = movimentacoes.findIndex(item =>
                    String(item.id) === String(idMovimentacaoEmEdicao)
                );

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

        if (elementos.detalhesIcone) elementos.detalhesIcone.textContent = iconeRegistro(registro);
        if (elementos.detalhesTipo) elementos.detalhesTipo.textContent = nomeTipoRegistro(registro);

        const sinal = registro.categoria === "saida" ? "− " :
            registro.categoria === "entrada" ? "+ " : "";

        if (elementos.detalhesValor) {
            elementos.detalhesValor.textContent = ehRegistroEstoque(registro)
                ? obterQuantidadeTexto(registro)
                : sinal + moeda(registro.valor);
        }

        if (elementos.detalhesForma) {
            elementos.detalhesForma.textContent = ehRegistroEstoque(registro)
                ? obterVariacaoEstoque(registro) || "Movimentação de estoque"
                : nomePagamento(registro.forma);
        }

        if (elementos.detalhesDescricao) {
            elementos.detalhesDescricao.textContent = registro.descricao || "Sem descrição";
        }

        if (elementos.detalhesDataHora) {
            elementos.detalhesDataHora.textContent =
                `${formatarDataISO(registro.dataISO)}${registro.hora ? " às " + registro.hora : ""}`;
        }

        const ehMovimentacaoManual =
            registro.categoria === "entrada" || registro.categoria === "saida";

        if (elementos.btnExcluirDetalhe) {
            elementos.btnExcluirDetalhe.style.display = ehRegistroEstoque(registro) ? "none" : "";
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
        if (evento.target === elementos.modalDetalhes) fecharDetalhes();
    });

    /* =========================
       EXCLUIR REGISTRO (VENDA OU MOVIMENTAÇÃO FINANCEIRA)
    ========================= */

    function excluirRegistro(registro) {
        if (!registro || ehRegistroEstoque(registro)) return;

        const nomeTipo = registro.categoria === "venda"
            ? "esta venda"
            : (registro.categoria === "entrada" ? "esta entrada" : "esta saída");

        const confirmado = confirm(
            `Deseja excluir ${nomeTipo}?\n\n${registro.descricao}\n${moeda(registro.valor)}`
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
        if (lancamentoSelecionado) excluirRegistro(lancamentoSelecionado);
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
       EXPORTAR PDF COM DADOS DO ESTABELECIMENTO
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

        const nomeArquivo =
            `Dr-Troco-Historico-${dataISO.split("-").reverse().join("-")}.pdf`;

        // Dados cadastrados na página estabelecimento.html
        let estabelecimento = {};

        try {
            estabelecimento = JSON.parse(
                localStorage.getItem("drTroco_estabelecimento") || "{}"
            );

            if (
                !estabelecimento ||
                typeof estabelecimento !== "object" ||
                Array.isArray(estabelecimento)
            ) {
                estabelecimento = {};
            }
        } catch (erro) {
            console.error("Erro ao ler dados do estabelecimento:", erro);
            estabelecimento = {};
        }

        const dadosEstabelecimento = [
            estabelecimento.nomeEstabelecimento,
            estabelecimento.responsavelEstabelecimento
                ? `Responsável: ${estabelecimento.responsavelEstabelecimento}`
                : "",
            estabelecimento.telefoneEstabelecimento
                ? `Telefone: ${estabelecimento.telefoneEstabelecimento}`
                : "",
            estabelecimento.emailEstabelecimento
                ? `E-mail: ${estabelecimento.emailEstabelecimento}`
                : "",
            estabelecimento.enderecoEstabelecimento,
            [
                estabelecimento.cidadeEstabelecimento,
                estabelecimento.estadoEstabelecimento
            ].filter(Boolean).join(" - ")
        ].filter(valor => String(valor || "").trim());

        const jsPDF = window.jspdf?.jsPDF || window.jsPDF;

        const saldoInicial = obterSaldoInicial(dataISO);
        const registrosFinanceiros = registros.filter(item => !ehRegistroEstoque(item));
        const vendas = registrosFinanceiros.filter(item => item.categoria === "venda");
        const entradas = registrosFinanceiros.filter(item => item.categoria === "entrada");
        const saidas = registrosFinanceiros.filter(item => item.categoria === "saida");
        const movimentacoesEstoque = registros.filter(ehRegistroEstoque);

        const totalDinheiro = vendas
            .filter(item => item.forma === "dinheiro")
            .reduce((soma, item) => soma + item.valor, 0);

        const entradasDinheiro = entradas
            .filter(item => item.forma === "dinheiro")
            .reduce((soma, item) => soma + item.valor, 0);

        const saidasDinheiro = saidas
            .filter(item => item.forma === "dinheiro")
            .reduce((soma, item) => soma + item.valor, 0);

        const saldoFinal =
            saldoInicial + totalDinheiro + entradasDinheiro - saidasDinheiro;

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

        function descricaoRegistroPDF(registro) {
            if (ehRegistroEstoque(registro)) {
                return `${nomeTipoRegistro(registro)} | ${registro.descricao} | ${obterQuantidadeTexto(registro)} | ${obterVariacaoEstoque(registro)} | ${registro.hora || "Sem horário"}`;
            }

            return `${nomeTipoRegistro(registro)} | ${registro.descricao} | ${nomePagamento(registro.forma)} | ${registro.hora || "Sem horário"} | ${moeda(registro.valor)}`;
        }

        // Tenta gerar o PDF diretamente com jsPDF
        if (jsPDF) {
            try {
                const doc = new jsPDF({ unit: "mm", format: "a4" });
                const larguraPagina = doc.internal.pageSize.getWidth();
                const alturaPagina = doc.internal.pageSize.getHeight();
                const margem = 14;
                const larguraTexto = larguraPagina - margem * 2;
                let y = 18;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(19);
                doc.setTextColor(32, 167, 103);
                doc.text("Dr. Troco — Histórico", margem, y);
                y += 9;

                // Cabeçalho do estabelecimento
                if (dadosEstabelecimento.length > 0) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(12);
                    doc.setTextColor(38, 54, 64);

                    const nome = dadosEstabelecimento[0];
                    const linhasNome = doc.splitTextToSize(String(nome), larguraTexto);
                    doc.text(linhasNome, margem, y);
                    y += linhasNome.length * 5 + 1;

                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(9);
                    doc.setTextColor(80, 90, 85);

                    dadosEstabelecimento.slice(1).forEach(informacao => {
                        const linhas = doc.splitTextToSize(String(informacao), larguraTexto);

                        if (y + linhas.length * 4 > alturaPagina - 20) {
                            doc.addPage();
                            y = 18;
                        }

                        doc.text(linhas, margem, y);
                        y += linhas.length * 4 + 1;
                    });

                    y += 3;
                }

                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(80, 90, 85);
                doc.text(
                    `Data do relatório: ${formatarDataISO(dataISO)}`,
                    margem,
                    y
                );
                y += 9;

                // Resumo financeiro
                doc.setFontSize(11);
                doc.setTextColor(38, 54, 64);

                linhasResumo.forEach(linha => {
                    if (y > alturaPagina - 20) {
                        doc.addPage();
                        y = 18;
                    }

                    doc.text(linha, margem, y);
                    y += 7;
                });

                y += 5;

                if (y > alturaPagina - 25) {
                    doc.addPage();
                    y = 18;
                }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(13);
                doc.text("Registros do dia", margem, y);
                y += 8;

                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);

                if (registros.length === 0) {
                    doc.text("Nenhuma movimentação nesta data.", margem, y);
                }

                registros.forEach(registro => {
                    const linhas = doc.splitTextToSize(
                        descricaoRegistroPDF(registro),
                        larguraTexto
                    );

                    const alturaBloco = linhas.length * 5 + 3;

                    if (y + alturaBloco > alturaPagina - 15) {
                        doc.addPage();
                        y = 18;
                    }

                    doc.text(linhas, margem, y);
                    y += alturaBloco;
                });

                if (movimentacoesEstoque.length > 0) {
                    y += 3;

                    if (y > alturaPagina - 20) {
                        doc.addPage();
                        y = 18;
                    }

                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(8);
                    doc.text(
                        "As movimentações de estoque são informativas e não compõem o resumo financeiro do caixa.",
                        margem,
                        y
                    );
                }

                doc.save(nomeArquivo);
                return;

            } catch (erro) {
                console.error("Erro ao criar PDF:", erro);
                alert(
                    "Não foi possível criar o PDF diretamente. " +
                    "O navegador tentará abrir a impressão."
                );
            }
        }

        // Alternativa: abrir a versão para impressão
        const janela = window.open("", "_blank");

        if (!janela) {
            alert(
                "O navegador bloqueou a janela de impressão. " +
                "Permita pop-ups e tente novamente."
            );
            return;
        }

        const linhasHTML = registros.map(registro => {
            const ehEstoque = ehRegistroEstoque(registro);

            const detalhe = ehEstoque
                ? `${obterQuantidadeTexto(registro)} · ${obterVariacaoEstoque(registro)}`
                : nomePagamento(registro.forma);

            const valorExibido = ehEstoque ? "—" : moeda(registro.valor);

            return `
                <tr>
                    <td>${escaparHTML(nomeTipoRegistro(registro))}</td>
                    <td>${escaparHTML(registro.descricao)}</td>
                    <td>${escaparHTML(detalhe)}</td>
                    <td>${escaparHTML(registro.hora || "—")}</td>
                    <td>${escaparHTML(valorExibido)}</td>
                </tr>
            `;
        }).join("");

        const dadosEstabelecimentoHTML = dadosEstabelecimento
            .map((informacao, indice) => indice === 0
                ? `<h2>${escaparHTML(informacao)}</h2>`
                : `<p>${escaparHTML(informacao)}</p>`
            ).join("");

        janela.document.write(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${escaparHTML(nomeArquivo)}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 25px;
                        color: #263640;
                    }

                    h1 {
                        color: #168b53;
                        margin-bottom: 8px;
                    }

                    h2 {
                        font-size: 17px;
                        margin: 12px 0 6px;
                    }

                    p {
                        color: #52635b;
                        margin: 4px 0;
                        font-size: 12px;
                        overflow-wrap: anywhere;
                    }

                    .resumo {
                        margin-top: 18px;
                        padding: 12px;
                        background: #eaf8f1;
                        border-radius: 6px;
                    }

                    .resumo p {
                        margin: 7px 0;
                    }

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

                    th {
                        background: #eaf8f1;
                    }

                    .nota {
                        margin-top: 14px;
                        font-size: 10px;
                        color: #667;
                    }

                    @media print {
                        body {
                            padding: 0;
                        }

                        tr {
                            break-inside: avoid;
                        }
                    }
                </style>
            </head>
            <body>
                <h1>Dr. Troco — Histórico</h1>

                ${dadosEstabelecimentoHTML}

                <p>
                    Data do relatório:
                    ${escaparHTML(formatarDataISO(dataISO))}
                </p>

                <p>Quantidade de registros: ${registros.length}</p>

                <section class="resumo">
                    <strong>Resumo financeiro</strong>
                    ${linhasResumo.map(linha =>
                        `<p>${escaparHTML(linha)}</p>`
                    ).join("")}
                </section>

                <table>
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Descrição / Produto</th>
                            <th>Pagamento / Quantidade</th>
                            <th>Hora</th>
                            <th>Valor financeiro</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${linhasHTML || `
                            <tr>
                                <td colspan="5">Nenhum registro nesta data.</td>
                            </tr>
                        `}
                    </tbody>
                </table>

                ${movimentacoesEstoque.length > 0
                    ? '<p class="nota">As movimentações de estoque são informativas e não compõem o resumo financeiro do caixa.</p>'
                    : ''}

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
    
