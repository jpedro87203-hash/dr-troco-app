/* =========================================================
DR. TROCO — ESTOQUE (estoque.js)
========================================================= */

const CHAVE_ESTOQUE = "drTroco_estoque";
const CHAVE_MOVIMENTACOES_ESTOQUE = "drTroco_movimentacoesEstoque";

let produtos = [];

let produtoDetalhesAtual = null;
let produtoQuantidadeAtual = null;
let produtoExclusaoAtual = null;
let produtoSelecionadoMovimento = null;

let tipoMovimentoAtual = "entrada";
let filtroAtual = "todos";

/* =========================================================
LEITOR DE CÓDIGO DE BARRAS — CONTROLE
========================================================= */

let streamLeitorCodigo = null;
let detectorCodigoBarras = null;
let lendoCodigoBarras = false;
let frameLeituraCodigo = null;
let codigoBarrasLido = "";
let formatosSuportadosCache = null;

let abrindoLeitorCodigo = false;
let processandoCodigoBarras = false;
let detectorEmExecucao = false;
let ultimoCodigoDetectado = "";
let tempoUltimaLeitura = 0;
let sessaoLeitorCodigo = 0;

/* =========================================================
UTILITÁRIOS
========================================================= */

function numeroSeguro(valor, padrao = 0) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : padrao;
}

function escaparHTML(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatarReal(valor) {
    return numeroSeguro(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function obterDataHoje() {
    const agora = new Date();

    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
}

function formatarDataBR(data) {
    if (!data) return "";

    const partes = String(data).split("-");

    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    return String(data);
}

function gerarId() {
    return (
        "prod_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).substring(2, 8)
    );
}

/* =========================================================
MODAIS
========================================================= */

function abrirModal(id, fecharOutros = true) {
    const modal = document.getElementById(id);

    if (!modal) return;

    if (fecharOutros) {
        fecharTodosModais(id);
    }

    modal.classList.add("aberto");
    document.body.classList.add("modal-aberto");

    const conteudo = modal.querySelector(".estoque-modal-conteudo");

    if (conteudo) {
        conteudo.scrollTop = 0;
    }
}

function fecharModal(id) {
    const modal = document.getElementById(id);

    if (!modal) return;

    if (id === "modalLeitorCodigo") {
        fecharLeitorCodigo();
        return;
    }

    modal.classList.remove("aberto");

    setTimeout(() => {
        if (!document.querySelector(".estoque-modal.aberto")) {
            document.body.classList.remove("modal-aberto");
        }
    }, 0);
}

function fecharTodosModais(excepto = null) {
    document.querySelectorAll(".estoque-modal.aberto").forEach(modal => {
        if (modal.id === "modalLeitorCodigo") {
            pararLeitorCodigo();
        }

        if (modal.id !== excepto) {
            modal.classList.remove("aberto");
        }
    });

    if (!document.querySelector(".estoque-modal.aberto")) {
        document.body.classList.remove("modal-aberto");
    }
}

/* =========================================================
LOCAL STORAGE
========================================================= */

function carregarProdutos() {
    try {
        const dados = localStorage.getItem(CHAVE_ESTOQUE);

        if (!dados) {
            produtos = [];
            return;
        }

        const lista = JSON.parse(dados);

        produtos = Array.isArray(lista)
            ? lista.map(normalizarProduto)
            : [];

    } catch (erro) {
        console.error("Erro ao carregar estoque:", erro);
        produtos = [];
    }
}

function salvarProdutos() {
    try {
        localStorage.setItem(
            CHAVE_ESTOQUE,
            JSON.stringify(produtos)
        );

        return true;

    } catch (erro) {
        console.error("Erro ao salvar estoque:", erro);

        alert(
            "Não foi possível salvar o estoque neste dispositivo."
        );

        return false;
    }
}

function carregarMovimentacoes() {
    try {
        const dados = localStorage.getItem(
            CHAVE_MOVIMENTACOES_ESTOQUE
        );

        if (!dados) return [];

        const lista = JSON.parse(dados);

        return Array.isArray(lista) ? lista : [];

    } catch (erro) {
        console.error("Erro ao carregar movimentações:", erro);
        return [];
    }
}

function salvarMovimentacao(movimento) {
    try {
        const lista = carregarMovimentacoes();

        lista.push(movimento);

        localStorage.setItem(
            CHAVE_MOVIMENTACOES_ESTOQUE,
            JSON.stringify(lista)
        );

    } catch (erro) {
        console.error("Erro ao salvar movimentação:", erro);
    }
}

/* =========================================================
NORMALIZAÇÃO
========================================================= */

function normalizarProduto(produto) {
    const tipo =
        produto.tipo ||
        produto.tipoProduto ||
        "nao_perecivel";

    const codigoSalvo =
        produto.codigo ??
        produto.codigoProduto ??
        "";

    return {
        id: produto.id || gerarId(),

        nome: String(
            produto.nome ??
            produto.nomeProduto ??
            ""
        ).trim(),

        codigo: String(codigoSalvo).trim(),

        preco: numeroSeguro(
            produto.preco ??
            produto.precoUnitario ??
            produto.precoProduto
        ),

        tipo,

        estoqueMinimo: Math.max(
            0,
            Math.floor(
                numeroSeguro(produto.estoqueMinimo, 5)
            )
        ),

        quantidade: Math.max(
            0,
            Math.floor(
                numeroSeguro(
                    produto.quantidade ??
                    produto.estoque ??
                    produto.quantidadeInicial
                )
            )
        ),

        validade: produto.validade || "",

        foto: produto.foto || produto.imagem || "",

        criadoEm: produto.criadoEm || new Date().toISOString(),

        atualizadoEm: produto.atualizadoEm || new Date().toISOString()
    };
}

/* =========================================================
STATUS
========================================================= */

function obterStatusProduto(produto) {
    const quantidade = numeroSeguro(produto.quantidade);
    const minimo = numeroSeguro(produto.estoqueMinimo);

    if (quantidade <= 0) {
        return {
            classe: "zero",
            texto: "Sem estoque"
        };
    }

    if (produto.validade && produto.tipo === "perecivel") {
        const hoje = obterDataHoje();

        if (produto.validade < hoje) {
            return {
                classe: "vencido",
                texto: "Vencido"
            };
        }

        const hojeData = new Date(hoje + "T00:00:00");
        const validadeData = new Date(produto.validade + "T00:00:00");

        const diferenca = Math.ceil(
            (validadeData - hojeData) / (1000 * 60 * 60 * 24)
        );

        if (diferenca <= 30) {
            return {
                classe: "a-vencer",
                texto: "A vencer"
            };
        }
    }

    if (quantidade <= minimo) {
        return {
            classe: "baixo",
            texto: "Estoque baixo"
        };
    }

    return {
        classe: "normal",
        texto: "Normal"
    };
}

/* =========================================================
FILTROS
========================================================= */

function produtoPassaFiltro(produto) {
    const status = obterStatusProduto(produto);

    if (filtroAtual === "todos") return true;

    if (filtroAtual === "baixo") {
        return status.classe === "baixo";
    }

    if (filtroAtual === "zero") {
        return status.classe === "zero";
    }

    if (filtroAtual === "vencer") {
        return (
            status.classe === "a-vencer" ||
            status.classe === "vencido"
        );
    }

    return true;
}

/* =========================================================
BUSCA
========================================================= */

function obterTextoBusca() {
    const campo = document.getElementById("buscaProduto");

    return campo ? campo.value.trim().toLowerCase() : "";
}

function produtoPassaBusca(produto) {
    const busca = obterTextoBusca();

    if (!busca) return true;

    const nome = String(produto.nome || "").toLowerCase();
    const codigo = String(produto.codigo || "").toLowerCase();

    return nome.includes(busca) || codigo.includes(busca);
}

/* =========================================================
KPIs
========================================================= */

function atualizarKPIs() {
    const totalProdutos = produtos.length;

    const totalUnidades = produtos.reduce(
        (total, produto) =>
            total + numeroSeguro(produto.quantidade),
        0
    );

    const totalBaixo = produtos.filter(produto => {
        const status = obterStatusProduto(produto);

        return (
            status.classe === "baixo" ||
            status.classe === "zero"
        );
    }).length;

    const totalValor = produtos.reduce(
        (total, produto) =>
            total + (
                numeroSeguro(produto.preco) *
                numeroSeguro(produto.quantidade)
            ),
        0
    );

    const elementoProdutos = document.getElementById("estoqueTotalProdutos");
    const elementoUnidades = document.getElementById("estoqueTotalUnidades");
    const elementoBaixo = document.getElementById("estoqueTotalBaixo");
    const elementoValor = document.getElementById("estoqueTotalValor");

    if (elementoProdutos) elementoProdutos.textContent = totalProdutos;
    if (elementoUnidades) elementoUnidades.textContent = totalUnidades;
    if (elementoBaixo) elementoBaixo.textContent = totalBaixo;
    if (elementoValor) elementoValor.textContent = formatarReal(totalValor);
}

/* =========================================================
LISTA DE PRODUTOS
========================================================= */

function renderizarProdutos() {
    const lista = document.getElementById("listaProdutos");

    if (!lista) return;

    const produtosFiltrados = produtos.filter(
        produto =>
            produtoPassaFiltro(produto) &&
            produtoPassaBusca(produto)
    );

    const contador = document.getElementById("estoqueContador");

    if (contador) {
        contador.textContent =
            `${produtosFiltrados.length} ${
                produtosFiltrados.length === 1 ? "produto" : "produtos"
            }`;
    }

    if (produtosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="estoque-vazio">
                <div class="estoque-vazio-icone">📦</div>
                <strong>Nenhum produto encontrado</strong>
                <span>Cadastre um produto ou altere os filtros.</span>
            </div>
        `;

        return;
    }

    lista.innerHTML = produtosFiltrados.map(renderizarProduto).join("");

    lista.querySelectorAll(".estoque-produto").forEach(card => {
        card.addEventListener("click", () => {
            abrirDetalhes(card.dataset.id);
        });
    });
}

function renderizarProduto(produto) {
    const status = obterStatusProduto(produto);

    const inicial =
        String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";

    const foto = produto.foto
        ? `
            <img
                src="${escaparHTML(produto.foto)}"
                alt="${escaparHTML(produto.nome)}"
            >
        `
        : `
            <div class="estoque-inicial">
                ${escaparHTML(inicial)}
            </div>
        `;

    const codigo = produto.codigo
        ? `Código: ${escaparHTML(produto.codigo)}`
        : "Sem código";

    const unidade = produto.tipo === "perecivel"
        ? "Perecível"
        : "Não perecível";

    return `
        <article
            class="estoque-produto"
            data-id="${escaparHTML(produto.id)}"
            tabindex="0"
            role="button"
            aria-label="Abrir detalhes de ${escaparHTML(produto.nome)}"
        >
            <div class="estoque-foto">${foto}</div>

            <div class="estoque-produto-info">
                <strong>${escaparHTML(produto.nome)}</strong>
                <small>${codigo} · ${unidade}</small>

                <div class="estoque-preco">
                    ${formatarReal(produto.preco)}
                    <span>/un.</span>
                </div>
            </div>

            <div class="estoque-produto-direita">
                <span class="estoque-qtd-label">Estoque</span>

                <span class="estoque-qtd">
                    ${numeroSeguro(produto.quantidade)}
                    <small>un.</small>
                </span>

                <span class="estoque-status ${status.classe}">
                    ${status.texto}
                </span>
            </div>

            <div class="estoque-seta">›</div>
        </article>
    `;
}

/* =========================================================
NOVO PRODUTO
========================================================= */

function abrirCadastroProduto() {
    const form = document.getElementById("formProduto");

    if (form) form.reset();

    const produtoId = document.getElementById("produtoId");
    const titulo = document.getElementById("tituloModalProduto");
    const quantidade = document.getElementById("quantidadeInicial");
    const estoqueMinimo = document.getElementById("estoqueMinimo");
    const campoValidade = document.getElementById("campoValidade");
    const validade = document.getElementById("validadeProduto");
    const preview = document.getElementById("previewFoto");
    const previewImg = document.getElementById("previewFotoImg");
    const campoCodigo = document.getElementById("codigoProduto");

    if (produtoId) produtoId.value = "";
    if (titulo) titulo.textContent = "Cadastrar produto";
    if (quantidade) quantidade.value = "0";
    if (estoqueMinimo) estoqueMinimo.value = "5";
    if (campoValidade) campoValidade.style.display = "";
    if (validade) validade.value = "";
    if (preview) preview.style.display = "none";
    if (previewImg) previewImg.src = "";

    window._estoqueFotoSelecionada = undefined;

    codigoBarrasLido = "";

    if (campoCodigo) campoCodigo.value = "";

    abrirModal("modalProduto");

    setTimeout(() => {
        document.getElementById("nomeProduto")?.focus();
    }, 150);
}

/* =========================================================
EDITAR PRODUTO
========================================================= */

function abrirEdicaoProduto(id) {
    const produto = produtos.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    const produtoId = document.getElementById("produtoId");
    const nome = document.getElementById("nomeProduto");
    const codigo = document.getElementById("codigoProduto");
    const preco = document.getElementById("precoProduto");
    const tipo = document.getElementById("tipoProduto");
    const minimo = document.getElementById("estoqueMinimo");
    const quantidade = document.getElementById("quantidadeInicial");
    const validade = document.getElementById("validadeProduto");
    const titulo = document.getElementById("tituloModalProduto");
    const preview = document.getElementById("previewFoto");
    const previewImg = document.getElementById("previewFotoImg");

    if (produtoId) produtoId.value = produto.id;
    if (nome) nome.value = produto.nome;

    const valorCodigo = String(produto.codigo || "").trim();

    if (codigo) codigo.value = valorCodigo;

    codigoBarrasLido = valorCodigo;

    if (preco) preco.value = produto.preco;
    if (tipo) tipo.value = produto.tipo;
    if (minimo) minimo.value = produto.estoqueMinimo;
    if (quantidade) quantidade.value = produto.quantidade;
    if (validade) validade.value = produto.validade || "";
    if (titulo) titulo.textContent = "Editar produto";

    if (produto.foto && preview && previewImg) {
        previewImg.src = produto.foto;
        preview.style.display = "flex";

    } else if (preview && previewImg) {
        preview.style.display = "none";
        previewImg.src = "";
    }

    window._estoqueFotoSelecionada = undefined;

    abrirModal("modalProduto");

    setTimeout(() => {
        if (nome) nome.focus();
    }, 150);
}

/* =========================================================
SALVAR PRODUTO
========================================================= */

function salvarProduto(event) {
    if (event) event.preventDefault();

    const id = document.getElementById("produtoId")?.value.trim();
    const nome = document.getElementById("nomeProduto")?.value.trim();

    const campoCodigo = document.getElementById("codigoProduto");

    const codigoCampo = campoCodigo
        ? String(campoCodigo.value || "").trim()
        : "";

    const codigo = codigoCampo || String(codigoBarrasLido || "").trim();

    const preco = numeroSeguro(
        document.getElementById("precoProduto")?.value
    );

    const tipo = document.getElementById("tipoProduto")?.value || "nao_perecivel";

    const estoqueMinimo = Math.max(
        0,
        Math.floor(
            numeroSeguro(
                document.getElementById("estoqueMinimo")?.value,
                5
            )
        )
    );

    const quantidade = Math.max(
        0,
        Math.floor(
            numeroSeguro(
                document.getElementById("quantidadeInicial")?.value
            )
        )
    );

    const validade =
        document.getElementById("validadeProduto")?.value || "";

    if (!nome) {
        alert("Digite o nome do produto.");
        document.getElementById("nomeProduto")?.focus();
        return;
    }

    if (preco < 0) {
        alert("O preço não pode ser negativo.");
        return;
    }

    const agora = new Date().toISOString();

    if (id) {
        const indice = produtos.findIndex(
            produto => String(produto.id) === String(id)
        );

        if (indice === -1) {
            alert("Produto não encontrado.");
            return;
        }

        const produtoAntigo = produtos[indice];

        produtos[indice] = {
            ...produtoAntigo,
            nome,
            codigo: String(codigo),
            preco,
            tipo,
            estoqueMinimo,
            quantidade,
            validade,
            atualizadoEm: agora
        };

        const foto = window._estoqueFotoSelecionada;

        if (foto !== undefined) {
            produtos[indice].foto = foto;
        }

    } else {
        const novoProduto = {
            id: gerarId(),
            nome,
            codigo: String(codigo),
            preco,
            tipo,
            estoqueMinimo,
            quantidade,
            validade,
            foto: window._estoqueFotoSelecionada || "",
            criadoEm: agora,
            atualizadoEm: agora
        };

        produtos.push(novoProduto);

        salvarMovimentacao({
            id: gerarId(),
            produtoId: novoProduto.id,
            produtoNome: novoProduto.nome,
            tipo: "cadastro",
            quantidade: novoProduto.quantidade,
            data: obterDataHoje(),
            hora: new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit"
            })
        });
    }

    const salvo = salvarProdutos();

    if (!salvo) return;

    carregarProdutos();

    window._estoqueFotoSelecionada = undefined;
    codigoBarrasLido = "";

    fecharModal("modalProduto");

    atualizarKPIs();
    renderizarProdutos();
}

/* =========================================================
FOTO DO PRODUTO
========================================================= */

function configurarFotoProduto() {
    const input = document.getElementById("fotoProduto");

    if (!input) return;

    input.addEventListener("change", event => {
        const arquivo = event.target.files?.[0];

        if (!arquivo) return;

        if (!arquivo.type.startsWith("image/")) {
            alert("Selecione uma imagem válida.");
            input.value = "";
            return;
        }

        const leitor = new FileReader();

        leitor.onload = function () {
            const imagem = new Image();

            imagem.onload = function () {
                const tamanhoMaximo = 700;

                let largura = imagem.width;
                let altura = imagem.height;

                if (largura > tamanhoMaximo || altura > tamanhoMaximo) {
                    const escala = Math.min(
                        tamanhoMaximo / largura,
                        tamanhoMaximo / altura
                    );

                    largura = Math.round(largura * escala);
                    altura = Math.round(altura * escala);
                }

                const canvas = document.createElement("canvas");

                canvas.width = largura;
                canvas.height = altura;

                const contexto = canvas.getContext("2d");

                contexto.drawImage(imagem, 0, 0, largura, altura);

                const fotoReduzida = canvas.toDataURL("image/jpeg", 0.78);

                window._estoqueFotoSelecionada = fotoReduzida;

                const preview = document.getElementById("previewFoto");
                const previewImg = document.getElementById("previewFotoImg");

                if (preview && previewImg) {
                    previewImg.src = fotoReduzida;
                    preview.style.display = "flex";
                }
            };

            imagem.onerror = function () {
                alert("Não foi possível carregar a imagem.");
            };

            imagem.src = leitor.result;
        };

        leitor.onerror = function () {
            alert("Não foi possível ler a imagem.");
        };

        leitor.readAsDataURL(arquivo);
    });
}

/* =========================================================
TIPO DO PRODUTO
========================================================= */

function configurarTipoProduto() {
    const tipo = document.getElementById("tipoProduto");
    const campo = document.getElementById("campoValidade");

    if (!tipo || !campo) return;

    function atualizar() {
        if (tipo.value === "perecivel") {
            campo.style.display = "";

        } else {
            campo.style.display = "none";

            const validade = document.getElementById("validadeProduto");

            if (validade) validade.value = "";
        }
    }

    tipo.addEventListener("change", atualizar);

    atualizar();
}

/* =========================================================
MOVIMENTO DE ESTOQUE
========================================================= */

function abrirMovimento(tipo) {
    tipoMovimentoAtual = tipo === "saida" ? "saida" : "entrada";
    produtoSelecionadoMovimento = null;

    const titulo = document.getElementById("tituloModalMovimento");
    const busca = document.getElementById("buscaMovimento");
    const quantidade = document.getElementById("quantidadeMovimento");
    const selecionado = document.getElementById("produtoSelecionadoMovimento");

    if (titulo) {
        titulo.textContent = tipoMovimentoAtual === "saida"
            ? "Saída de estoque"
            : "Entrada de estoque";
    }

    if (busca) busca.value = "";
    if (quantidade) quantidade.value = "";

    if (selecionado) selecionado.classList.remove("mostrar");

    renderizarSelecaoProdutos();
    atualizarBotaoMovimento();

    abrirModal("modalMovimento");

    setTimeout(() => {
        if (busca) busca.focus();
    }, 150);
}

function renderizarSelecaoProdutos() {
    const lista = document.getElementById("listaSelecaoProdutos");

    if (!lista) return;

    const campo = document.getElementById("buscaMovimento");

    const busca = campo
        ? campo.value.trim().toLowerCase()
        : "";

    const filtrados = produtos.filter(produto => {
        if (!busca) return true;

        const nome = String(produto.nome || "").toLowerCase();
        const codigo = String(produto.codigo || "").toLowerCase();

        return nome.includes(busca) || codigo.includes(busca);
    });

    if (filtrados.length === 0) {
        lista.innerHTML = `
            <div class="estoque-vazio" style="min-height:130px">
                <div class="estoque-vazio-icone">🔎</div>
                <strong>Nenhum produto encontrado</strong>
                <span>Tente outro nome ou código.</span>
            </div>
        `;

        return;
    }

    lista.innerHTML = filtrados.map(produto => {
        const inicial =
            String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";

        const foto = produto.foto
            ? `<img src="${escaparHTML(produto.foto)}" alt="">`
            : escaparHTML(inicial);

        const classeBotao = tipoMovimentoAtual === "saida" ? "saida" : "";

        return `
            <div class="estoque-selecao-item">
                <div class="estoque-selecao-foto">${foto}</div>

                <div class="estoque-selecao-info">
                    <strong>${escaparHTML(produto.nome)}</strong>
                    <small>Estoque: ${numeroSeguro(produto.quantidade)} un.</small>
                </div>

                <button
                    type="button"
                    class="estoque-add-produto ${classeBotao}"
                    data-selecionar-produto="${escaparHTML(produto.id)}"
                    aria-label="Selecionar ${escaparHTML(produto.nome)}"
                >+</button>
            </div>
        `;
    }).join("");

    lista.querySelectorAll("[data-selecionar-produto]").forEach(botao => {
        botao.addEventListener("click", event => {
            event.stopPropagation();

            selecionarProdutoMovimento(
                botao.dataset.selecionarProduto
            );
        });
    });
}

function selecionarProdutoMovimento(id) {
    const produto = produtos.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    produtoSelecionadoMovimento = produto;

    const bloco = document.getElementById("produtoSelecionadoMovimento");
    const nome = document.getElementById("nomeSelecionadoMovimento");
    const estoque = document.getElementById("estoqueAtualMovimento");
    const quantidade = document.getElementById("quantidadeMovimento");

    if (nome) nome.textContent = produto.nome;

    if (estoque) {
        estoque.textContent =
            `Estoque atual: ${numeroSeguro(produto.quantidade)} unidade(s)`;
    }

    if (bloco) bloco.classList.add("mostrar");

    if (quantidade) {
        quantidade.value = "";
        quantidade.focus();
    }

    atualizarBotaoMovimento();
}

function atualizarBotaoMovimento() {
    const botao = document.getElementById("btnConfirmarMovimento");

    if (!botao) return;

    botao.textContent = tipoMovimentoAtual === "saida"
        ? "Registrar saída"
        : "Registrar entrada";
}

function confirmarMovimento() {
    if (!produtoSelecionadoMovimento) {
        alert("Selecione um produto primeiro.");
        return;
    }

    const campo = document.getElementById("quantidadeMovimento");

    const quantidade = Math.floor(
        numeroSeguro(campo?.value)
    );

    if (quantidade <= 0) {
        alert("Informe uma quantidade maior que zero.");
        campo?.focus();
        return;
    }

    const produto = produtos.find(
        item =>
            String(item.id) ===
            String(produtoSelecionadoMovimento.id)
    );

    if (!produto) {
        alert("Produto não encontrado.");
        return;
    }

    if (
        tipoMovimentoAtual === "saida" &&
        quantidade > numeroSeguro(produto.quantidade)
    ) {
        alert(
            `Não há estoque suficiente.\n\nEstoque atual: ${produto.quantidade} unidade(s).`
        );

        campo?.focus();
        return;
    }

    const quantidadeAnterior = numeroSeguro(produto.quantidade);

    if (tipoMovimentoAtual === "entrada") {
        produto.quantidade = quantidadeAnterior + quantidade;
    } else {
        produto.quantidade = quantidadeAnterior - quantidade;
    }

    produto.atualizadoEm = new Date().toISOString();

    const salvo = salvarProdutos();

    if (!salvo) return;

    salvarMovimentacao({
        id: gerarId(),
        produtoId: produto.id,
        produtoNome: produto.nome,
        tipo: tipoMovimentoAtual,
        quantidade,
        quantidadeAnterior,
        quantidadeNova: produto.quantidade,
        data: obterDataHoje(),
        hora: new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    carregarProdutos();

    fecharModal("modalMovimento");

    atualizarKPIs();
    renderizarProdutos();

    if (
        produtoDetalhesAtual &&
        String(produtoDetalhesAtual.id) === String(produto.id)
    ) {
        produtoDetalhesAtual = produto;
        abrirDetalhes(produto.id);
    }
}

/* =========================================================
DETALHES DO PRODUTO
========================================================= */

function abrirDetalhes(id) {
    const produto = produtos.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    produtoDetalhesAtual = produto;

    const container = document.getElementById("detalhesProduto");

    if (!container) return;

    const status = obterStatusProduto(produto);

    const inicial =
        String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";

    const foto = produto.foto
        ? `<img src="${escaparHTML(produto.foto)}" alt="${escaparHTML(produto.nome)}">`
        : `<div class="estoque-inicial">${escaparHTML(inicial)}</div>`;

    const validade = produto.validade
        ? formatarDataBR(produto.validade)
        : "Não informada";

    const tipo = produto.tipo === "perecivel"
        ? "Perecível"
        : "Não perecível";

    container.innerHTML = `
        <div class="estoque-detalhes-topo">
            <div class="estoque-foto estoque-detalhes-foto">${foto}</div>

            <div class="estoque-detalhes-titulo">
                <h4>${escaparHTML(produto.nome)}</h4>

                <div class="estoque-detalhes-codigo">
                    ${
                        produto.codigo
                            ? `Código: ${escaparHTML(produto.codigo)}`
                            : "Sem código"
                    }
                </div>

                <div class="estoque-detalhes-preco">
                    ${formatarReal(produto.preco)}
                    <span>/ unidade</span>
                </div>
            </div>
        </div>

        <div class="estoque-status-detalhes ${status.classe}">
            ${status.texto}
        </div>

        <div class="estoque-detalhes">
            <div class="estoque-detalhe">
                <small>Quantidade</small>
                <strong>${numeroSeguro(produto.quantidade)} un.</strong>
            </div>

            <div class="estoque-detalhe">
                <small>Estoque mínimo</small>
                <strong>${numeroSeguro(produto.estoqueMinimo)} un.</strong>
            </div>

            <div class="estoque-detalhe">
                <small>Tipo</small>
                <strong>${tipo}</strong>
            </div>

            <div class="estoque-detalhe">
                <small>Validade</small>
                <strong>${validade}</strong>
            </div>

            <div class="estoque-detalhe">
                <small>Valor em estoque</small>
                <strong>
                    ${formatarReal(
                        numeroSeguro(produto.preco) *
                        numeroSeguro(produto.quantidade)
                    )}
                </strong>
            </div>

            <div class="estoque-detalhe">
                <small>Código</small>
                <strong>
                    ${produto.codigo ? escaparHTML(produto.codigo) : "—"}
                </strong>
            </div>
        </div>

        <button
            id="btnAjustarQuantidadeInterno"
            type="button"
            class="estoque-ajuste-btn"
        >🔢 Ajustar quantidade</button>
    `;

    const botaoAjuste = document.getElementById(
        "btnAjustarQuantidadeInterno"
    );

    if (botaoAjuste) {
        botaoAjuste.addEventListener("click", () => {
            abrirAjusteQuantidade(produto.id);
        });
    }

    abrirModal("modalDetalhes");
}

/* =========================================================
AJUSTE DE QUANTIDADE
========================================================= */

function abrirAjusteQuantidade(id) {
    const produto = produtos.find(
        item => String(item.id) === String(id)
    );

    if (!produto) return;

    produtoQuantidadeAtual = produto;

    const nome = document.getElementById("nomeProdutoQuantidade");
    const atual = document.getElementById("quantidadeAtualProduto");
    const nova = document.getElementById("novaQuantidadeProduto");

    if (nome) nome.textContent = produto.nome;

    if (atual) {
        atual.textContent = `${numeroSeguro(produto.quantidade)} un.`;
    }

    if (nova) {
        nova.value = numeroSeguro(produto.quantidade);
        nova.focus();
        nova.select();
    }

    fecharModal("modalDetalhes");
    abrirModal("modalQuantidade");
}

function confirmarAjusteQuantidade() {
    if (!produtoQuantidadeAtual) return;

    const campo = document.getElementById("novaQuantidadeProduto");

    const novaQuantidade = Math.floor(
        numeroSeguro(campo?.value)
    );

    if (novaQuantidade < 0) {
        alert("A quantidade não pode ser negativa.");
        return;
    }

    const produto = produtos.find(
        item => String(item.id) === String(produtoQuantidadeAtual.id)
    );

    if (!produto) {
        alert("Produto não encontrado.");
        return;
    }

    const quantidadeAnterior = numeroSeguro(produto.quantidade);

    produto.quantidade = novaQuantidade;
    produto.atualizadoEm = new Date().toISOString();

    const salvo = salvarProdutos();

    if (!salvo) return;

    salvarMovimentacao({
        id: gerarId(),
        produtoId: produto.id,
        produtoNome: produto.nome,
        tipo: "ajuste",
        quantidadeAnterior,
        quantidadeNova: novaQuantidade,
        data: obterDataHoje(),
        hora: new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    carregarProdutos();

    produtoQuantidadeAtual =
        produtos.find(item => String(item.id) === String(produto.id)) || null;

    fecharModal("modalQuantidade");

    atualizarKPIs();
    renderizarProdutos();

    setTimeout(() => {
        abrirDetalhes(produto.id);
    }, 100);
}

/* =========================================================
EXCLUSÃO DE PRODUTO
========================================================= */

function abrirConfirmacaoExclusao() {
    if (!produtoDetalhesAtual) return;

    produtoExclusaoAtual = produtoDetalhesAtual;

    const nome = document.getElementById("nomeExcluirProduto");

    if (nome) nome.textContent = produtoDetalhesAtual.nome;

    fecharModal("modalDetalhes");
    abrirModal("modalExcluir");
}

function confirmarExclusao() {
    if (!produtoExclusaoAtual) return;

    const id = produtoExclusaoAtual.id;

    const produtoExistente = produtos.find(
        produto => String(produto.id) === String(id)
    );

    if (!produtoExistente) {
        fecharModal("modalExcluir");
        return;
    }

    produtos = produtos.filter(
        produto => String(produto.id) !== String(id)
    );

    const salvo = salvarProdutos();

    if (!salvo) return;

    salvarMovimentacao({
        id: gerarId(),
        produtoId: id,
        produtoNome: produtoExistente.nome,
        tipo: "exclusao",
        quantidade: produtoExistente.quantidade,
        data: obterDataHoje(),
        hora: new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        })
    });

    carregarProdutos();

    produtoDetalhesAtual = null;
    produtoQuantidadeAtual = null;
    produtoExclusaoAtual = null;

    fecharModal("modalExcluir");

    atualizarKPIs();
    renderizarProdutos();
}

/* =========================================================
BUSCA PRINCIPAL
========================================================= */

function configurarBusca() {
    const campo = document.getElementById("buscaProduto");
    const limpar = document.getElementById("btnLimparBusca");

    if (campo) {
        campo.addEventListener("input", renderizarProdutos);
    }

    if (limpar) {
        limpar.addEventListener("click", () => {
            if (campo) campo.value = "";

            renderizarProdutos();
            campo?.focus();
        });
    }
}

/* =========================================================
FILTROS
========================================================= */

function configurarFiltros() {
    document.querySelectorAll("[data-filtro-estoque]").forEach(botao => {
        botao.addEventListener("click", () => {
            filtroAtual = botao.dataset.filtroEstoque || "todos";

            document.querySelectorAll("[data-filtro-estoque]").forEach(item => {
                item.classList.toggle("ativo", item === botao);
            });

            renderizarProdutos();
        });
    });
}

/* =========================================================
LEITOR — PARAR CÂMERA E LIMPAR RECURSOS
========================================================= */

function pararLeitorCodigo() {
    /*
     * Invalida callbacks assíncronos de uma sessão anterior.
     */
    sessaoLeitorCodigo++;

    lendoCodigoBarras = false;
    detectorEmExecucao = false;

    if (frameLeituraCodigo !== null) {
        cancelAnimationFrame(frameLeituraCodigo);
        frameLeituraCodigo = null;
    }

    if (streamLeitorCodigo) {
        streamLeitorCodigo.getTracks().forEach(track => {
            try {
                track.stop();
            } catch (erro) {
                console.warn("Erro ao parar câmera:", erro);
            }
        });

        streamLeitorCodigo = null;
    }

    const video = document.getElementById("videoLeitorCodigo");

    if (video) {
        try {
            video.pause();
        } catch (erro) {
            // Ignora falha ao pausar.
        }

        video.srcObject = null;

        video.style.setProperty("display", "none", "important");
        video.style.setProperty("visibility", "hidden", "important");
        video.style.setProperty("opacity", "0", "important");
    }

    const moldura = document.getElementById("molduraCodigoBarras");

    if (moldura) {
        moldura.style.setProperty("display", "none", "important");
    }

    abrindoLeitorCodigo = false;
}

/* =========================================================
DETECTOR DE CÓDIGO DE BARRAS
========================================================= */

async function criarDetectorCodigoBarras() {
    if (typeof window.BarcodeDetector === "undefined") {
        return null;
    }

    try {
        if (!formatosSuportadosCache) {
            const formatosDesejados = [
                "ean_13",
                "ean_8",
                "upc_a",
                "upc_e",
                "code_128",
                "code_39",
                "code_93",
                "itf",
                "codabar"
            ];

            if (
                typeof window.BarcodeDetector.getSupportedFormats === "function"
            ) {
                const suportados =
                    await window.BarcodeDetector.getSupportedFormats();

                formatosSuportadosCache = formatosDesejados.filter(
                    formato => suportados.includes(formato)
                );

            } else {
                formatosSuportadosCache = formatosDesejados;
            }
        }

        if (formatosSuportadosCache.length === 0) {
            return null;
        }

        return new window.BarcodeDetector({
            formats: formatosSuportadosCache
        });

    } catch (erro) {
        console.error(
            "Erro ao criar detector de código de barras:",
            erro
        );

        return null;
    }
}

/* =========================================================
AJUSTES DE CÂMERA — FOCO, ZOOM E ILUMINAÇÃO
========================================================= */

async function otimizarCameraLeitor() {
    if (!streamLeitorCodigo) return;

    const faixa = streamLeitorCodigo.getVideoTracks()[0];

    if (!faixa) return;

    try {
        const capacidades = typeof faixa.getCapabilities === "function"
            ? faixa.getCapabilities()
            : {};

        const configuracao = {};

        /*
         * Usa foco contínuo se o aparelho permitir.
         */
        if (
            capacidades.focusMode &&
            capacidades.focusMode.includes("continuous")
        ) {
            configuracao.focusMode = "continuous";
        }

        /*
         * Alguns dispositivos permitem foco próximo.
         * Só aplica quando o recurso é realmente suportado.
         */
        if (
            capacidades.focusMode &&
            capacidades.focusMode.includes("single-shot")
        ) {
            configuracao.focusMode = "continuous";
        }

        /*
         * Zoom moderado: aproxima a imagem sem exagerar
         * e sem depender de zoom digital em todos os celulares.
         */
        if (
            capacidades.zoom &&
            Number.isFinite(capacidades.zoom.min) &&
            Number.isFinite(capacidades.zoom.max)
        ) {
            const minimo = capacidades.zoom.min;
            const maximo = capacidades.zoom.max;

            const zoomDesejado = Math.min(
                maximo,
                Math.max(minimo, 1.3)
            );

            configuracao.zoom = zoomDesejado;
        }

        if (Object.keys(configuracao).length > 0) {
            await faixa.applyConstraints({
                advanced: [configuracao]
            });
        }

    } catch (erro) {
        /*
         * Nem todos os aparelhos oferecem esses controles.
         * A câmera continua funcionando com a configuração padrão.
         */
        console.info(
            "Alguns ajustes automáticos de câmera não estão disponíveis:",
            erro
        );
    }
}

async function alternarLuzLeitor(ativar) {
    if (!streamLeitorCodigo) {
        return false;
    }

    const faixa = streamLeitorCodigo.getVideoTracks()[0];

    if (!faixa || typeof faixa.getCapabilities !== "function") {
        return false;
    }

    try {
        const capacidades = faixa.getCapabilities();

        if (!capacidades.torch) {
            return false;
        }

        await faixa.applyConstraints({
            advanced: [{ torch: Boolean(ativar) }]
        });

        return true;

    } catch (erro) {
        console.info("Lanterna indisponível:", erro);
        return false;
    }
}

/* =========================================================
DETECÇÃO AUTOMÁTICA — CONTÍNUA E SEM SOBREPOSIÇÃO
========================================================= */

async function iniciarDeteccaoCodigoBarras() {
    if (!streamLeitorCodigo) return;

    if (!detectorCodigoBarras) {
        detectorCodigoBarras = await criarDetectorCodigoBarras();
    }

    const video = document.getElementById("videoLeitorCodigo");
    const mensagem = document.getElementById("mensagemLeitorCodigo");

    if (!video) return;

    if (!detectorCodigoBarras) {
        if (mensagem) {
            mensagem.style.setProperty("display", "flex", "important");

            mensagem.innerHTML = `
                <div style="padding:20px;text-align:center;line-height:1.5">
                    <strong>Leitura automática indisponível</strong>
                    <br><br>
                    Este navegador não oferece suporte à leitura automática.
                    Você pode digitar o código no campo do produto ou usar
                    um leitor USB/Bluetooth.
                </div>
            `;
        }

        return;
    }

    const sessaoAtual = sessaoLeitorCodigo;

    lendoCodigoBarras = true;
    processandoCodigoBarras = false;
    detectorEmExecucao = false;
    ultimoCodigoDetectado = "";
    tempoUltimaLeitura = 0;

    let ultimaVerificacao = 0;

    async function procurarCodigo() {
        if (
            !lendoCodigoBarras ||
            sessaoAtual !== sessaoLeitorCodigo
        ) {
            return;
        }

        /*
         * Só agenda o próximo quadro depois de terminar
         * a tentativa atual, evitando chamadas concorrentes.
         */
        if (
            !streamLeitorCodigo ||
            !video.srcObject ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
        ) {
            if (lendoCodigoBarras) {
                frameLeituraCodigo =
                    requestAnimationFrame(procurarCodigo);
            }

            return;
        }

        const agora = Date.now();

        /*
         * Pequeno intervalo entre tentativas para reduzir
         * uso excessivo da CPU sem deixar a leitura lenta.
         */
        if (agora - ultimaVerificacao < 90) {
            frameLeituraCodigo =
                requestAnimationFrame(procurarCodigo);

            return;
        }

        ultimaVerificacao = agora;

        if (detectorEmExecucao) {
            frameLeituraCodigo =
                requestAnimationFrame(procurarCodigo);

            return;
        }

        detectorEmExecucao = true;

        try {
            const resultados = await detectorCodigoBarras.detect(video);

            /*
             * Se o leitor foi fechado durante a detecção,
             * ignora o resultado atrasado.
             */
            if (
                !lendoCodigoBarras ||
                sessaoAtual !== sessaoLeitorCodigo ||
                processandoCodigoBarras ||
                !resultados ||
                resultados.length === 0
            ) {
                return;
            }

            const resultado = resultados.find(item => {
                return item && item.rawValue;
            });

            const codigo = resultado
                ? String(resultado.rawValue).trim()
                : "";

            if (!codigo) return;

            const instante = Date.now();

            /*
             * Bloqueia repetição do mesmo resultado durante
             * uma leitura já iniciada.
             */
            if (
                codigo === ultimoCodigoDetectado &&
                instante - tempoUltimaLeitura < 1200
            ) {
                return;
            }

            ultimoCodigoDetectado = codigo;
            tempoUltimaLeitura = instante;

            /*
             * Bloqueio imediato: impede dois resultados
             * de preencherem o campo ao mesmo tempo.
             */
            processandoCodigoBarras = true;

            codigoEncontrado(codigo);

        } catch (erro) {
            /*
             * Falha em um quadro não encerra o leitor.
             * A próxima tentativa será feita normalmente.
             */
        } finally {
            detectorEmExecucao = false;

            if (
                lendoCodigoBarras &&
                sessaoAtual === sessaoLeitorCodigo
            ) {
                frameLeituraCodigo =
                    requestAnimationFrame(procurarCodigo);
            }
        }
    }

    procurarCodigo();
}

/* =========================================================
CÓDIGO ENCONTRADO
========================================================= */

function codigoEncontrado(codigo) {
    if (
        !lendoCodigoBarras ||
        !processandoCodigoBarras
    ) {
        return;
    }

    if (codigo === undefined || codigo === null) {
        processandoCodigoBarras = false;
        return;
    }

    const codigoLimpo = String(codigo).trim();

    if (!codigoLimpo) {
        processandoCodigoBarras = false;
        return;
    }

    codigoBarrasLido = codigoLimpo;

    lendoCodigoBarras = false;

    if (frameLeituraCodigo !== null) {
        cancelAnimationFrame(frameLeituraCodigo);
        frameLeituraCodigo = null;
    }

    const campoCodigo = document.getElementById("codigoProduto");

    if (campoCodigo) {
        campoCodigo.value = codigoLimpo;

        campoCodigo.dispatchEvent(
            new Event("input", { bubbles: true })
        );

        campoCodigo.dispatchEvent(
            new Event("change", { bubbles: true })
        );
    }

    pararLeitorCodigo();

    const modalLeitor = document.getElementById("modalLeitorCodigo");

    if (modalLeitor) {
        modalLeitor.classList.remove("aberto");
        modalLeitor.style.removeProperty("z-index");
        modalLeitor.style.removeProperty("position");
        modalLeitor.style.removeProperty("inset");
    }

    const modalCadastro = document.getElementById("modalProduto");

    if (modalCadastro) {
        modalCadastro.classList.add("aberto");
        modalCadastro.style.setProperty("z-index", "1000", "important");
    }

    document.body.classList.add("modal-aberto");

    setTimeout(() => {
        const campo = document.getElementById("codigoProduto");

        if (campo) {
            campo.value = codigoLimpo;
            campo.focus();

            try {
                campo.setSelectionRange(
                    campo.value.length,
                    campo.value.length
                );
            } catch (erro) {
                // Alguns tipos de campo não permitem seleção de texto.
            }
        }

        processandoCodigoBarras = false;

    }, 100);
}

/* =========================================================
ABRIR LEITOR — CÂMERA TRASEIRA
========================================================= */

async function abrirLeitorCodigo() {
    if (abrindoLeitorCodigo) return;

    abrindoLeitorCodigo = true;

    const modalLeitor = document.getElementById("modalLeitorCodigo");
    const video = document.getElementById("videoLeitorCodigo");
    const mensagem = document.getElementById("mensagemLeitorCodigo");
    const moldura = document.getElementById("molduraCodigoBarras");
    const modalCadastro = document.getElementById("modalProduto");

    if (!modalLeitor || !video || !mensagem) {
        abrindoLeitorCodigo = false;

        console.error(
            "Elementos do leitor de código não encontrados."
        );

        alert("Não foi possível localizar os elementos do leitor.");

        return;
    }

    if (modalLeitor.parentElement !== document.body) {
        document.body.appendChild(modalLeitor);
    }

    pararLeitorCodigo();

    abrindoLeitorCodigo = true;
    lendoCodigoBarras = false;
    processandoCodigoBarras = false;
    detectorEmExecucao = false;
    ultimoCodigoDetectado = "";
    tempoUltimaLeitura = 0;
    codigoBarrasLido = "";

    const sessaoSolicitada = sessaoLeitorCodigo;

    if (modalCadastro) {
        modalCadastro.classList.add("aberto");
        modalCadastro.style.setProperty("z-index", "1000", "important");
    }

    modalLeitor.classList.add("aberto");

    modalLeitor.style.setProperty("z-index", "99999", "important");
    modalLeitor.style.setProperty("position", "fixed", "important");
    modalLeitor.style.setProperty("inset", "0", "important");

    document.body.classList.add("modal-aberto");

    const conteudo = modalLeitor.querySelector(".estoque-modal-conteudo");

    if (conteudo) {
        conteudo.scrollTop = 0;
        conteudo.style.setProperty("position", "relative", "important");
        conteudo.style.setProperty("z-index", "100000", "important");
    }

    const area = document.getElementById("areaLeitorCodigo");

    if (area) {
        area.style.setProperty("position", "relative", "important");
        area.style.setProperty("z-index", "100001", "important");
        area.style.setProperty("overflow", "hidden", "important");
    }

    mensagem.textContent = "Abrindo câmera...";

    mensagem.style.setProperty("display", "flex", "important");
    mensagem.style.setProperty("position", "absolute", "important");
    mensagem.style.setProperty("inset", "0", "important");
    mensagem.style.setProperty("align-items", "center", "important");
    mensagem.style.setProperty("justify-content", "center", "important");
    mensagem.style.setProperty("z-index", "4", "important");

    video.style.setProperty("display", "none", "important");
    video.style.setProperty("visibility", "hidden", "important");
    video.style.setProperty("opacity", "0", "important");
    video.style.setProperty("position", "relative", "important");
    video.style.setProperty("z-index", "2", "important");
    video.style.setProperty("width", "100%", "important");
    video.style.setProperty("height", "300px", "important");
    video.style.setProperty("object-fit", "contain", "important");
    video.style.setProperty("background", "#111", "important");

    if (moldura) {
        moldura.style.setProperty("display", "none", "important");
        moldura.style.setProperty("position", "absolute", "important");
        moldura.style.setProperty("z-index", "3", "important");
        moldura.style.setProperty("pointer-events", "none", "important");
    }

    try {
        if (
            !navigator.mediaDevices ||
            typeof navigator.mediaDevices.getUserMedia !== "function"
        ) {
            throw new Error("A câmera não é suportada neste navegador.");
        }

        /*
         * Resolução ideal maior para ajudar a capturar
         * códigos pequenos. O aparelho pode escolher
         * outra resolução compatível.
         */
        const novoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 30 }
            },
            audio: false
        });

        if (!modalLeitor.classList.contains("aberto")) {
            novoStream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch (erro) {
                    // Ignora erro ao encerrar a câmera.
                }
            });

            abrindoLeitorCodigo = false;
            return;
        }

        streamLeitorCodigo = novoStream;

        video.setAttribute("playsinline", "true");
        video.setAttribute("autoplay", "true");
        video.setAttribute("muted", "true");

        video.playsInline = true;
        video.autoplay = true;
        video.muted = true;
        video.srcObject = streamLeitorCodigo;

        /*
         * Aguarda a câmera fornecer metadados ou imagem.
         */
        await new Promise(resolve => {
            let finalizado = false;

            const concluir = () => {
                if (finalizado) return;

                finalizado = true;

                video.removeEventListener("loadedmetadata", concluir);
                video.removeEventListener("loadeddata", concluir);

                clearTimeout(temporizador);

                resolve();
            };

            const temporizador = setTimeout(concluir, 5000);

            video.addEventListener("loadedmetadata", concluir, {
                once: true
            });

            video.addEventListener("loadeddata", concluir, {
                once: true
            });
        });

        if (
            !modalLeitor.classList.contains("aberto") ||
            !streamLeitorCodigo
        ) {
            pararLeitorCodigo();
            return;
        }

        await video.play();

        if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth === 0 ||
            video.videoHeight === 0
        ) {
            await new Promise(resolve => {
                let finalizado = false;

                const concluir = () => {
                    if (finalizado) return;

                    finalizado = true;

                    video.removeEventListener("loadeddata", concluir);
                    clearTimeout(temporizador);

                    resolve();
                };

                const temporizador = setTimeout(concluir, 2500);

                video.addEventListener("loadeddata", concluir, {
                    once: true
                });
            });
        }

        if (
            !modalLeitor.classList.contains("aberto") ||
            !streamLeitorCodigo
        ) {
            pararLeitorCodigo();
            return;
        }

        /*
         * Tenta ativar foco contínuo e zoom quando disponíveis.
         */
        await otimizarCameraLeitor();

        video.style.setProperty("display", "block", "important");
        video.style.setProperty("visibility", "visible", "important");
        video.style.setProperty("opacity", "1", "important");
        video.style.setProperty("position", "relative", "important");
        video.style.setProperty("z-index", "2", "important");
        video.style.setProperty("width", "100%", "important");
        video.style.setProperty("height", "300px", "important");
        video.style.setProperty("object-fit", "contain", "important");

        mensagem.style.setProperty("display", "none", "important");

        if (moldura) {
            moldura.style.setProperty("display", "block", "important");
            moldura.style.setProperty("z-index", "3", "important");
        }

        /*
         * Começa a detecção após a imagem estar disponível.
         */
        await iniciarDeteccaoCodigoBarras();

    } catch (erro) {
        console.error("Erro ao abrir câmera:", erro);

        pararLeitorCodigo();

        modalLeitor.classList.add("aberto");
        modalLeitor.style.setProperty("z-index", "99999", "important");

        mensagem.style.setProperty("display", "flex", "important");
        mensagem.style.setProperty("position", "absolute", "important");
        mensagem.style.setProperty("inset", "0", "important");
        mensagem.style.setProperty("z-index", "4", "important");

        let detalhe = "";

        if (
            erro &&
            (
                erro.name === "NotAllowedError" ||
                erro.name === "PermissionDeniedError"
            )
        ) {
            detalhe =
                "Verifique se o navegador tem permissão para acessar a câmera.";

        } else if (
            erro &&
            (
                erro.name === "NotFoundError" ||
                erro.name === "DevicesNotFoundError"
            )
        ) {
            detalhe =
                "Nenhuma câmera compatível foi encontrada no dispositivo.";

        } else if (erro && erro.name === "NotReadableError") {
            detalhe =
                "A câmera pode estar sendo usada por outro aplicativo.";

        } else {
            detalhe =
                "Confira as permissões da câmera e tente novamente.";
        }

        mensagem.innerHTML = `
            <div
                style="
                    padding:25px;
                    text-align:center;
                    color:#ffffff;
                    line-height:1.5;
                "
            >
                <strong
                    style="
                        display:block;
                        margin-bottom:8px;
                        font-size:15px;
                    "
                >
                    Não foi possível abrir a câmera.
                </strong>

                ${escaparHTML(detalhe)}

                <br><br>

                Se aparecer uma solicitação de permissão,
                toque em <strong>Permitir</strong>.
            </div>
        `;

    } finally {
        abrindoLeitorCodigo = false;
    }
}

/* =========================================================
FECHAR LEITOR
========================================================= */

function fecharLeitorCodigo() {
    pararLeitorCodigo();

    processandoCodigoBarras = false;
    detectorEmExecucao = false;

    const modalLeitor = document.getElementById("modalLeitorCodigo");

    if (modalLeitor) {
        modalLeitor.classList.remove("aberto");
        modalLeitor.style.removeProperty("z-index");
        modalLeitor.style.removeProperty("position");
        modalLeitor.style.removeProperty("inset");
    }

    const modalCadastro = document.getElementById("modalProduto");

    if (
        modalCadastro &&
        modalCadastro.classList.contains("aberto")
    ) {
        modalCadastro.style.setProperty("z-index", "1000", "important");

        document.body.classList.add("modal-aberto");

        setTimeout(() => {
            const campo = document.getElementById("codigoProduto");

            if (campo) {
                if (codigoBarrasLido) {
                    campo.value = codigoBarrasLido;
                }

                campo.focus();
            }
        }, 100);

        return;
    }

    if (!document.querySelector(".estoque-modal.aberto")) {
        document.body.classList.remove("modal-aberto");
    }
}

/* =========================================================
FECHAMENTO DOS MODAIS
========================================================= */

function configurarFechamentoModais() {
    document.addEventListener("click", event => {
        const botao = event.target.closest("[data-fechar]");

        if (botao) {
            event.preventDefault();
            event.stopPropagation();

            const id = botao.getAttribute("data-fechar");

            if (id === "modalLeitorCodigo") {
                fecharLeitorCodigo();
            } else if (id) {
                fecharModal(id);
            }

            return;
        }

        const modal = event.target.closest(".estoque-modal");

        if (modal && event.target === modal) {
            if (modal.id === "modalLeitorCodigo") {
                fecharLeitorCodigo();
            } else {
                fecharModal(modal.id);
            }
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        const modal = document.querySelector(".estoque-modal.aberto");

        if (!modal) return;

        if (modal.id === "modalLeitorCodigo") {
            fecharLeitorCodigo();
        } else {
            fecharModal(modal.id);
        }
    });
}

/* =========================================================
CONFIGURAÇÕES DE BOTÕES
========================================================= */

function configurarBotoes() {
    const cadastrar = document.getElementById("btnCadastrarProduto");
    const entrada = document.getElementById("btnEntradaEstoque");
    const saida = document.getElementById("btnSaidaEstoque");

    const btnConfirmarMovimento =
        document.getElementById("btnConfirmarMovimento");

    const editarDetalhes = document.getElementById("btnEditarDetalhes");
    const excluirDetalhes = document.getElementById("btnExcluirDetalhes");

    const confirmarQuantidade =
        document.getElementById("btnConfirmarQuantidade");

    const btnConfirmarExclusao =
        document.getElementById("btnConfirmarExclusao");

    const form = document.getElementById("formProduto");
    const lerCodigo = document.getElementById("btnLerCodigoBarras");
    const fecharLeitor = document.getElementById("btnFecharLeitorCodigo");

    if (cadastrar) {
        cadastrar.addEventListener("click", abrirCadastroProduto);
    }

    if (entrada) {
        entrada.addEventListener("click", () => abrirMovimento("entrada"));
    }

    if (saida) {
        saida.addEventListener("click", () => abrirMovimento("saida"));
    }

    if (btnConfirmarMovimento) {
        btnConfirmarMovimento.addEventListener(
            "click",
            confirmarMovimento
        );
    }

    if (editarDetalhes) {
        editarDetalhes.addEventListener("click", () => {
            if (!produtoDetalhesAtual) return;

            const id = produtoDetalhesAtual.id;

            fecharModal("modalDetalhes");
            abrirEdicaoProduto(id);
        });
    }

    if (excluirDetalhes) {
        excluirDetalhes.addEventListener(
            "click",
            abrirConfirmacaoExclusao
        );
    }

    if (confirmarQuantidade) {
        confirmarQuantidade.addEventListener(
            "click",
            confirmarAjusteQuantidade
        );
    }

    if (btnConfirmarExclusao) {
        btnConfirmarExclusao.addEventListener(
            "click",
            confirmarExclusao
        );
    }

    if (form) {
        form.addEventListener("submit", salvarProduto);
    }

    if (lerCodigo) {
        lerCodigo.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            abrirLeitorCodigo();
        });
    }

    if (fecharLeitor) {
        fecharLeitor.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            fecharLeitorCodigo();
        });
    }
}

/* =========================================================
BUSCA DE MOVIMENTO
========================================================= */

function configurarBuscaMovimento() {
    const campo = document.getElementById("buscaMovimento");

    if (!campo) return;

    campo.addEventListener("input", renderizarSelecaoProdutos);
}

/* =========================================================
TECLADO DA LISTA
========================================================= */

function configurarTecladoLista() {
    const lista = document.getElementById("listaProdutos");

    if (!lista) return;

    lista.addEventListener("keydown", event => {
        const card = event.target.closest(".estoque-produto");

        if (!card) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            abrirDetalhes(card.dataset.id);
        }
    });
}

/* =========================================================
LIMPEZA DA CÂMERA
========================================================= */

function configurarLimpezaCamera() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            pararLeitorCodigo();
            processandoCodigoBarras = false;
            detectorEmExecucao = false;
        }
    });

    window.addEventListener("pagehide", () => {
        pararLeitorCodigo();
        processandoCodigoBarras = false;
        detectorEmExecucao = false;
    });
}

/* =========================================================
INICIALIZAÇÃO
========================================================= */

function inicializarEstoque() {
    carregarProdutos();

    atualizarKPIs();
    renderizarProdutos();

    configurarBotoes();
    configurarBusca();
    configurarBuscaMovimento();
    configurarFiltros();
    configurarFechamentoModais();
    configurarFotoProduto();
    configurarTipoProduto();
    configurarTecladoLista();
    configurarLimpezaCamera();

    atualizarBotaoMovimento();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        inicializarEstoque
    );
} else {
    inicializarEstoque();
}