/* =========================================================
DR. TROCO — ESTOQUE (estoque.js)
Sincronização Supabase por estabelecimento
========================================================= */

const CHAVE_ESTOQUE = "drTroco_estoque";
const CHAVE_MOVIMENTACOES_ESTOQUE = "drTroco_movimentacoesEstoque";
const CHAVE_BACKUP_ESTOQUE_LEGADO = "drTroco_estoque_backup_antes_supabase_v1";
const CHAVE_BACKUP_MOVIMENTOS_LEGADO = "drTroco_movimentacoes_backup_antes_supabase_v1";

let produtos = [];
let comercioIdEstoque = null;
let estoquePronto = false;
let estoqueCarregando = false;

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

let abrindoLeitorCodigo = false;
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

// Turno noturno inteligente (00:00 às 06:00 pertence ao dia anterior)
function obterDataHoraAtual() {
    const agora = new Date();
    const horaAtual = agora.getHours();
    
    if (horaAtual >= 0 && horaAtual < 6) {
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

function formatarDataBR(data) {
    if (!data) return "";
    const partes = String(data).split("-");
    return partes.length === 3
        ? `${partes[2]}/${partes[1]}/${partes[0]}`
        : String(data);
}

function gerarId() {
    return "prod_" + Date.now().toString(36) + "_" +
        Math.random().toString(36).substring(2, 8);
}

function exigirEstoquePronto() {
    if (estoqueCarregando) {
        alert("O estoque ainda está carregando. Aguarde um instante.");
        return false;
    }
    if (!estoquePronto || !comercioIdEstoque) {
        alert("Não foi possível conectar ao estoque deste estabelecimento. Verifique sua conexão e atualize a página.");
        return false;
    }
    if (!window.EstoqueSupabase) {
        alert("A integração com o Supabase não foi carregada. Confira a ordem dos arquivos JavaScript.");
        return false;
    }
    return true;
}

function chaveEstoqueDoComercio() {
    return comercioIdEstoque
        ? `${CHAVE_ESTOQUE}_${comercioIdEstoque}`
        : null;
}

function chaveMovimentacoesDoComercio() {
    return comercioIdEstoque
        ? `${CHAVE_MOVIMENTACOES_ESTOQUE}_${comercioIdEstoque}`
        : null;
}

/* =========================================================
BACKUP LEGADO
========================================================= */

function preservarEstoqueLegado() {
    try {
        const estoqueAntigo = localStorage.getItem(CHAVE_ESTOQUE);
        const movimentosAntigos = localStorage.getItem(CHAVE_MOVIMENTACOES_ESTOQUE);

        if (
            estoqueAntigo !== null &&
            localStorage.getItem(CHAVE_BACKUP_ESTOQUE_LEGADO) === null
        ) {
            localStorage.setItem(CHAVE_BACKUP_ESTOQUE_LEGADO, estoqueAntigo);
        }

        if (
            movimentosAntigos !== null &&
            localStorage.getItem(CHAVE_BACKUP_MOVIMENTOS_LEGADO) === null
        ) {
            localStorage.setItem(CHAVE_BACKUP_MOVIMENTOS_LEGADO, movimentosAntigos);
        }
    } catch (erro) {
        console.error("Não foi possível criar o backup dos dados antigos:", erro);
    }
}

/* =========================================================
MODAIS
========================================================= */

function abrirModal(id, fecharOutros = true) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (fecharOutros) fecharTodosModais(id);

    modal.classList.add("aberto");
    document.body.classList.add("modal-aberto");

    const conteudo = modal.querySelector(".estoque-modal-conteudo");
    if (conteudo) conteudo.scrollTop = 0;
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
        if (modal.id === "modalLeitorCodigo") pararLeitorCodigo();
        if (modal.id !== excepto) modal.classList.remove("aberto");
    });

    if (!document.querySelector(".estoque-modal.aberto")) {
        document.body.classList.remove("modal-aberto");
    }
}

/* =========================================================
LOCAL CACHE POR ESTABELECIMENTO + SUPABASE
========================================================= */

async function carregarProdutos() {
    estoqueCarregando = true;
    estoquePronto = false;
    preservarEstoqueLegado();

    try {
        if (!window.EstoqueSupabase) {
            throw new Error("estoque-supabase.js não foi carregado.");
        }

        comercioIdEstoque = await window.EstoqueSupabase.obterComercioId();
        if (!comercioIdEstoque) {
            throw new Error("Não foi possível identificar o estabelecimento da conta.");
        }

        const listaRemota = await window.EstoqueSupabase.carregarProdutos();
        produtos = Array.isArray(listaRemota)
            ? listaRemota.map(normalizarProduto)
            : [];

        salvarProdutos();
        estoquePronto = true;
        return true;

    } catch (erro) {
        console.error("Erro ao carregar estoque do Supabase:", erro);

        try {
            const chave = chaveEstoqueDoComercio();
            const dados = chave ? localStorage.getItem(chave) : null;
            const lista = dados ? JSON.parse(dados) : [];
            produtos = Array.isArray(lista) ? lista.map(normalizarProduto) : [];
        } catch (erroCache) {
            console.error("Erro ao carregar cache local:", erroCache);
            produtos = [];
        }

        estoquePronto = false;
        const listaElemento = document.getElementById("listaProdutos");
        if (listaElemento && !produtos.length) {
            listaElemento.innerHTML = `
                <div class="estoque-vazio">
                    <div class="estoque-vazio-icone">☁️</div>
                    <strong>Não foi possível carregar o estoque</strong>
                    <span>Verifique a conexão e atualize a página.</span>
                </div>`;
        }
        return false;

    } finally {
        estoqueCarregando = false;
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();
    }
}

function salvarProdutos() {
    try {
        const chave = chaveEstoqueDoComercio();
        if (!chave) throw new Error("Estabelecimento não identificado.");
        localStorage.setItem(chave, JSON.stringify(produtos));
        return true;
    } catch (erro) {
        console.error("Erro ao salvar cache do estoque:", erro);
        return false;
    }
}

function carregarMovimentacoes() {
    try {
        const chave = chaveMovimentacoesDoComercio();
        if (!chave) return [];
        const dados = localStorage.getItem(chave);
        if (!dados) return [];
        const lista = JSON.parse(dados);
        return Array.isArray(lista) ? lista : [];
    } catch (erro) {
        console.error("Erro ao carregar movimentações:", erro);
        return [];
    }
}

async function salvarMovimentacao(movimento) {
    if (!exigirEstoquePronto()) {
        throw new Error("Estoque ainda não está conectado ao Supabase.");
    }

    try {
        await window.EstoqueSupabase.salvarMovimentacao(movimento);
    } catch (e) {
        console.warn("Aviso ao salvar movimento no Supabase (salvo localmente):", e);
    }

    const chave = chaveMovimentacoesDoComercio();
    const lista = carregarMovimentacoes();
    lista.push(movimento);
    localStorage.setItem(chave, JSON.stringify(lista));
    return true;
}

async function persistirProdutoNaNuvem(produto) {
    if (!exigirEstoquePronto()) {
        throw new Error("Estoque ainda não está conectado ao Supabase.");
    }
    return await window.EstoqueSupabase.salvarProduto(produto);
}

/* =========================================================
NORMALIZAÇÃO
========================================================= */

function normalizarProduto(produto) {
    const tipo = produto.tipo || produto.tipoProduto || "nao_perecivel";
    const codigoSalvo = produto.codigo ?? produto.codigoProduto ?? "";

    return {
        id: produto.id || gerarId(),
        nome: String(produto.nome ?? produto.nomeProduto ?? "").trim(),
        codigo: String(codigoSalvo).trim(),
        preco: numeroSeguro(produto.preco ?? produto.precoUnitario ?? produto.precoProduto),
        tipo,
        estoqueMinimo: Math.max(0, Math.floor(numeroSeguro(produto.estoqueMinimo ?? produto.estoque_minimo, 5))),
        quantidade: Math.max(0, Math.floor(numeroSeguro(produto.quantidade ?? produto.estoque ?? produto.quantidadeInicial))),
        validade: produto.validade || "",
        foto: produto.foto || produto.imagem || "",
        criadoEm: produto.criadoEm || produto.criado_em || new Date().toISOString(),
        atualizadoEm: produto.atualizadoEm || produto.atualizado_em || new Date().toISOString()
    };
}

/* =========================================================
STATUS
========================================================= */

function obterStatusProduto(produto) {
    const quantidade = numeroSeguro(produto.quantidade);
    const minimo = numeroSeguro(produto.estoqueMinimo);

    if (quantidade <= 0) return { classe: "zero", texto: "Sem estoque" };

    if (produto.validade && produto.tipo === "perecivel") {
        const hoje = obterDataHoje();
        if (produto.validade < hoje) return { classe: "vencido", texto: "Vencido" };

        const hojeData = new Date(hoje + "T00:00:00");
        const validadeData = new Date(produto.validade + "T00:00:00");
        const diferenca = Math.ceil((validadeData - hojeData) / (1000 * 60 * 60 * 24));

        if (diferenca <= 30) return { classe: "a-vencer", texto: "A vencer" };
    }

    if (quantidade <= minimo) return { classe: "baixo", texto: "Estoque baixo" };
    return { classe: "normal", texto: "Normal" };
}

/* =========================================================
FILTROS E BUSCA
========================================================= */

function produtoPassaFiltro(produto) {
    const status = obterStatusProduto(produto);
    if (filtroAtual === "todos") return true;
    if (filtroAtual === "baixo") return status.classe === "baixo";
    if (filtroAtual === "zero") return status.classe === "zero";
    if (filtroAtual === "vencer") return status.classe === "a-vencer" || status.classe === "vencido";
    return true;
}

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
    const totalUnidades = produtos.reduce((total, produto) => total + numeroSeguro(produto.quantidade), 0);
    const totalBaixo = produtos.filter(produto => {
        const status = obterStatusProduto(produto);
        return status.classe === "baixo" || status.classe === "zero";
    }).length;
    const totalValor = produtos.reduce((total, produto) => total + numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade), 0);

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

    const produtosFiltrados = produtos.filter(produto => produtoPassaFiltro(produto) && produtoPassaBusca(produto));
    const contador = document.getElementById("estoqueContador");

    if (contador) {
        contador.textContent = `${produtosFiltrados.length} ${produtosFiltrados.length === 1 ? "produto" : "produtos"}`;
    }

    if (produtosFiltrados.length === 0) {
        lista.innerHTML = `
            <div class="estoque-vazio">
                <div class="estoque-vazio-icone">📦</div>
                <strong>Nenhum produto encontrado</strong>
                <span>Cadastre um produto ou altere os filtros.</span>
            </div>`;
        return;
    }

    lista.innerHTML = produtosFiltrados.map(renderizarProduto).join("");
    lista.querySelectorAll(".estoque-produto").forEach(card => {
        card.addEventListener("click", () => abrirDetalhes(card.dataset.id));
    });
}

function renderizarProduto(produto) {
    const status = obterStatusProduto(produto);
    const inicial = String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";
    const foto = produto.foto
        ? `<img src="${escaparHTML(produto.foto)}" alt="${escaparHTML(produto.nome)}">`
        : `<div class="estoque-inicial">${escaparHTML(inicial)}</div>`;
    const codigo = produto.codigo ? `Código: ${escaparHTML(produto.codigo)}` : "Sem código";
    const unidade = produto.tipo === "perecivel" ? "Perecível" : "Não perecível";

    return `
        <article class="estoque-produto" data-id="${escaparHTML(produto.id)}" tabindex="0" role="button" aria-label="Abrir detalhes de ${escaparHTML(produto.nome)}">
            <div class="estoque-foto">${foto}</div>
            <div class="estoque-produto-info">
                <strong>${escaparHTML(produto.nome)}</strong>
                <small>${codigo} · ${unidade}</small>
                <div class="estoque-preco">${formatarReal(produto.preco)} <span>/un.</span></div>
            </div>
            <div class="estoque-produto-direita">
                <span class="estoque-qtd-label">Estoque</span>
                <span class="estoque-qtd">${numeroSeguro(produto.quantidade)} <small>un.</small></span>
                <span class="estoque-status ${status.classe}">${status.texto}</span>
            </div>
            <div class="estoque-seta">›</div>
        </article>`;
}

/* =========================================================
CADASTRO E EDIÇÃO
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
    setTimeout(() => document.getElementById("nomeProduto")?.focus(), 150);
}

function abrirEdicaoProduto(id) {
    const produto = produtos.find(item => String(item.id) === String(id));
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
    if (quantidade) {
        quantidade.value = produto.quantidade;
        quantidade.disabled = true;
    }
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
    setTimeout(() => nome?.focus(), 150);
}

async function salvarProduto(event) {
    if (event) event.preventDefault();
    if (!exigirEstoquePronto()) return;

    const id = document.getElementById("produtoId")?.value.trim();
    const nome = document.getElementById("nomeProduto")?.value.trim();
    const campoCodigo = document.getElementById("codigoProduto");
    const codigoCampo = campoCodigo ? String(campoCodigo.value || "").trim() : "";
    const codigo = codigoCampo || String(codigoBarrasLido || "").trim();
    const preco = numeroSeguro(document.getElementById("precoProduto")?.value);
    const tipo = document.getElementById("tipoProduto")?.value || "nao_perecivel";
    const estoqueMinimo = Math.max(0, Math.floor(numeroSeguro(document.getElementById("estoqueMinimo")?.value, 5)));
    const quantidadeInput = document.getElementById("quantidadeInicial");
    const quantidade = Math.max(0, Math.floor(numeroSeguro(quantidadeInput?.value)));
    const validade = document.getElementById("validadeProduto")?.value || "";

    if (!nome) {
        alert("Digite o nome do produto.");
        document.getElementById("nomeProduto")?.focus();
        return;
    }
    if (preco < 0) {
        alert("O preço não pode ser negativo.");
        return;
    }

    const dataHora = obterDataHoraAtual();
    const estadoAnterior = produtos.map(produto => ({ ...produto }));
    let produtoSalvo = null;
    let eraNovo = false;

    if (id) {
        const indice = produtos.findIndex(produto => String(produto.id) === String(id));
        if (indice === -1) {
            alert("Produto não encontrado.");
            return;
        }
        produtos[indice] = {
            ...produtos[indice], nome, codigo: String(codigo), preco, tipo,
            estoqueMinimo, validade, atualizadoEm: new Date().toISOString()
        };
        if (window._estoqueFotoSelecionada !== undefined) {
            produtos[indice].foto = window._estoqueFotoSelecionada;
        }
        produtoSalvo = produtos[indice];
    } else {
        eraNovo = true;
        produtoSalvo = {
            id: gerarId(), nome, codigo: String(codigo), preco, tipo,
            estoqueMinimo, quantidade, validade,
            foto: window._estoqueFotoSelecionada || "",
            criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString()
        };
        produtos.push(produtoSalvo);
    }

    if (quantidadeInput) quantidadeInput.disabled = false;

    try {
        await persistirProdutoNaNuvem(produtoSalvo);

        if (eraNovo && produtoSalvo.quantidade > 0) {
            await salvarMovimentacao({
                id: gerarId(), produtoId: produtoSalvo.id,
                produtoNome: produtoSalvo.nome, tipo: "cadastro",
                quantidade: produtoSalvo.quantidade,
                quantidadeAnterior: 0,
                quantidadeNova: produtoSalvo.quantidade,
                data: dataHora.dataChave,
                hora: dataHora.hora
            });
        }

        salvarProdutos();
        window._estoqueFotoSelecionada = undefined;
        codigoBarrasLido = "";
        fecharModal("modalProduto");
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();

    } catch (erro) {
        console.error("Erro ao salvar produto no Supabase:", erro);
        produtos = estadoAnterior;

        salvarProdutos();
        alert("Não foi possível salvar o produto no servidor.\n\n" + (erro.message || "Erro desconhecido."));
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();
    }
}

/* =========================================================
FOTO E TIPO DO PRODUTO
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
                    const escala = Math.min(tamanhoMaximo / largura, tamanhoMaximo / altura);
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
            imagem.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

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
MOVIMENTOS DE ESTOQUE
========================================================= */

function abrirMovimento(tipo) {
    if (!estoquePronto) {
        alert("O estoque deste estabelecimento ainda não foi carregado.");
        return;
    }
    tipoMovimentoAtual = tipo === "saida" ? "saida" : "entrada";
    produtoSelecionadoMovimento = null;

    const titulo = document.getElementById("tituloModalMovimento");
    const busca = document.getElementById("buscaMovimento");
    const quantidade = document.getElementById("quantidadeMovimento");
    const selecionado = document.getElementById("produtoSelecionadoMovimento");

    if (titulo) titulo.textContent = tipoMovimentoAtual === "saida" ? "Saída de estoque" : "Entrada de estoque";
    if (busca) busca.value = "";
    if (quantidade) quantidade.value = "";
    if (selecionado) selecionado.classList.remove("mostrar");

    renderizarSelecaoProdutos();
    atualizarBotaoMovimento();
    abrirModal("modalMovimento");
    setTimeout(() => busca?.focus(), 150);
}

function renderizarSelecaoProdutos() {
    const lista = document.getElementById("listaSelecaoProdutos");
    if (!lista) return;
    const campo = document.getElementById("buscaMovimento");
    const busca = campo ? campo.value.trim().toLowerCase() : "";

    const filtrados = produtos.filter(produto => {
        if (!busca) return true;
        return String(produto.nome || "").toLowerCase().includes(busca) ||
            String(produto.codigo || "").toLowerCase().includes(busca);
    });

    if (filtrados.length === 0) {
        lista.innerHTML = `
            <div class="estoque-vazio" style="min-height:130px">
                <div class="estoque-vazio-icone">🔎</div>
                <strong>Nenhum produto encontrado</strong>
                <span>Tente outro nome ou código.</span>
            </div>`;
        return;
    }

    lista.innerHTML = filtrados.map(produto => {
        const inicial = String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";
        const foto = produto.foto ? `<img src="${escaparHTML(produto.foto)}" alt="">` : escaparHTML(inicial);
        const classeBotao = tipoMovimentoAtual === "saida" ? "saida" : "";
        return `
            <div class="estoque-selecao-item">
                <div class="estoque-selecao-foto">${foto}</div>
                <div class="estoque-selecao-info">
                    <strong>${escaparHTML(produto.nome)}</strong>
                    <small>Estoque: ${numeroSeguro(produto.quantidade)} un.</small>
                </div>
                <button type="button" class="estoque-add-produto ${classeBotao}"
                    data-selecionar-produto="${escaparHTML(produto.id)}"
                    aria-label="Selecionar ${escaparHTML(produto.nome)}">+</button>
            </div>`;
    }).join("");

    lista.querySelectorAll("[data-selecionar-produto]").forEach(botao => {
        botao.addEventListener("click", event => {
            event.stopPropagation();
            selecionarProdutoMovimento(botao.dataset.selecionarProduto);
        });
    });
}

function selecionarProdutoMovimento(id) {
    const produto = produtos.find(item => String(item.id) === String(id));
    if (!produto) return;
    produtoSelecionadoMovimento = produto;

    const bloco = document.getElementById("produtoSelecionadoMovimento");
    const nome = document.getElementById("nomeSelecionadoMovimento");
    const estoque = document.getElementById("estoqueAtualMovimento");
    const quantidade = document.getElementById("quantidadeMovimento");

    if (nome) nome.textContent = produto.nome;
    if (estoque) estoque.textContent = `Estoque atual: ${numeroSeguro(produto.quantidade)} unidade(s)`;
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
    botao.textContent = tipoMovimentoAtual === "saida" ? "Registrar saída" : "Registrar entrada";
}

async function confirmarMovimento() {
    if (!exigirEstoquePronto()) return;
    if (!produtoSelecionadoMovimento) {
        alert("Selecione um produto primeiro.");
        return;
    }

    const campo = document.getElementById("quantidadeMovimento");
    const quantidade = Math.floor(numeroSeguro(campo?.value));
    if (quantidade <= 0) {
        alert("Informe uma quantidade maior que zero.");
        campo?.focus();
        return;
    }

    const produto = produtos.find(item => String(item.id) === String(produtoSelecionadoMovimento.id));
    if (!produto) {
        alert("Produto não encontrado.");
        return;
    }

    if (tipoMovimentoAtual === "saida" && quantidade > numeroSeguro(produto.quantidade)) {
        alert(`Não há estoque suficiente.\n\nEstoque atual: ${produto.quantidade} unidade(s).`);
        campo?.focus();
        return;
    }

    const dataHora = obterDataHoraAtual();
    const quantidadeAnterior = numeroSeguro(produto.quantidade);
    const quantidadeNova = tipoMovimentoAtual === "entrada"
        ? quantidadeAnterior + quantidade
        : quantidadeAnterior - quantidade;

    produto.quantidade = quantidadeNova;
    produto.atualizadoEm = new Date().toISOString();

    try {
        await persistirProdutoNaNuvem(produto);
        await salvarMovimentacao({
            id: gerarId(), produtoId: produto.id, produtoNome: produto.nome,
            tipo: tipoMovimentoAtual, quantidade, quantidadeAnterior,
            quantidadeNova, data: dataHora.dataChave,
            hora: dataHora.hora
        });
        salvarProdutos();
        fecharModal("modalMovimento");
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();

        if (produtoDetalhesAtual && String(produtoDetalhesAtual.id) === String(produto.id)) {
            produtoDetalhesAtual = produto;
            abrirDetalhes(produto.id);
        }
    } catch (erro) {
        console.error("Erro ao registrar movimentação:", erro);
        alert("Não foi possível confirmar a movimentação no servidor.");
    }
}

/* =========================================================
DETALHES, AJUSTE E EXCLUSÃO
========================================================= */

function abrirDetalhes(id) {
    const produto = produtos.find(item => String(item.id) === String(id));
    if (!produto) return;
    produtoDetalhesAtual = produto;

    const container = document.getElementById("detalhesProduto");
    if (!container) return;

    const status = obterStatusProduto(produto);
    const inicial = String(produto.nome || "?").trim().charAt(0).toUpperCase() || "?";
    const foto = produto.foto
        ? `<img src="${escaparHTML(produto.foto)}" alt="${escaparHTML(produto.nome)}">`
        : `<div class="estoque-inicial">${escaparHTML(inicial)}</div>`;
    const validade = produto.validade ? formatarDataBR(produto.validade) : "Não informada";
    const tipo = produto.tipo === "perecivel" ? "Perecível" : "Não perecível";

    container.innerHTML = `
        <div class="estoque-detalhes-topo">
            <div class="estoque-foto estoque-detalhes-foto">${foto}</div>
            <div class="estoque-detalhes-titulo">
                <h4>${escaparHTML(produto.nome)}</h4>
                <div class="estoque-detalhes-codigo">${produto.codigo ? `Código: ${escaparHTML(produto.codigo)}` : "Sem código"}</div>
                <div class="estoque-detalhes-preco">${formatarReal(produto.preco)} <span>/ unidade</span></div>
            </div>
        </div>
        <div class="estoque-status-detalhes ${status.classe}">${status.texto}</div>
        <div class="estoque-detalhes">
            <div class="estoque-detalhe"><small>Quantidade</small><strong>${numeroSeguro(produto.quantidade)} un.</strong></div>
            <div class="estoque-detalhe"><small>Estoque mínimo</small><strong>${numeroSeguro(produto.estoqueMinimo)} un.</strong></div>
            <div class="estoque-detalhe"><small>Tipo</small><strong>${tipo}</strong></div>
            <div class="estoque-detalhe"><small>Validade</small><strong>${validade}</strong></div>
            <div class="estoque-detalhe"><small>Valor em estoque</small><strong>${formatarReal(numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade))}</strong></div>
            <div class="estoque-detalhe"><small>Código</small><strong>${produto.codigo ? escaparHTML(produto.codigo) : "—"}</strong></div>
        </div>
        <button id="btnAjustarQuantidadeInterno" type="button" class="estoque-ajuste-btn">🔢 Ajustar quantidade</button>`;

    document.getElementById("btnAjustarQuantidadeInterno")?.addEventListener("click", () => abrirAjusteQuantidade(produto.id));
    abrirModal("modalDetalhes");
}

function abrirAjusteQuantidade(id) {
    const produto = produtos.find(item => String(item.id) === String(id));
    if (!produto) return;
    produtoQuantidadeAtual = produto;

    const nome = document.getElementById("nomeProdutoQuantidade");
    const atual = document.getElementById("quantidadeAtualProduto");
    const nova = document.getElementById("novaQuantidadeProduto");
    if (nome) nome.textContent = produto.nome;
    if (atual) atual.textContent = `${numeroSeguro(produto.quantidade)} un.`;
    if (nova) {
        nova.value = numeroSeguro(produto.quantidade);
        nova.focus();
        nova.select();
    }
    fecharModal("modalDetalhes");
    abrirModal("modalQuantidade");
}

async function confirmarAjusteQuantidade() {
    if (!exigirEstoquePronto()) return;
    if (!produtoQuantidadeAtual) return;

    const campo = document.getElementById("novaQuantidadeProduto");
    const novaQuantidade = Math.floor(numeroSeguro(campo?.value));
    if (novaQuantidade < 0) {
        alert("A quantidade não pode ser negativa.");
        return;
    }

    const produto = produtos.find(item => String(item.id) === String(produtoQuantidadeAtual.id));
    if (!produto) return;

    const dataHora = obterDataHoraAtual();
    const quantidadeAnterior = numeroSeguro(produto.quantidade);
    produto.quantidade = novaQuantidade;
    produto.atualizadoEm = new Date().toISOString();

    try {
        await persistirProdutoNaNuvem(produto);
        await salvarMovimentacao({
            id: gerarId(), produtoId: produto.id, produtoNome: produto.nome,
            tipo: "ajuste", quantidade: Math.abs(novaQuantidade - quantidadeAnterior),
            quantidadeAnterior, quantidadeNova: novaQuantidade,
            data: dataHora.dataChave,
            hora: dataHora.hora
        });
        salvarProdutos();
        fecharModal("modalQuantidade");
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();
        setTimeout(() => abrirDetalhes(produto.id), 100);
    } catch (erro) {
        console.error("Erro ao ajustar quantidade:", erro);
        alert("Não foi possível registrar o ajuste.");
    }
}

function abrirConfirmacaoExclusao() {
    if (!produtoDetalhesAtual) return;
    produtoExclusaoAtual = produtoDetalhesAtual;
    const nome = document.getElementById("nomeExcluirProduto");
    if (nome) nome.textContent = produtoDetalhesAtual.nome;
    fecharModal("modalDetalhes");
    abrirModal("modalExcluir");
}

async function confirmarExclusao() {
    if (!exigirEstoquePronto()) return;
    if (!produtoExclusaoAtual) return;

    const id = produtoExclusaoAtual.id;
    const produtoExistente = produtos.find(produto => String(produto.id) === String(id));
    if (!produtoExistente) {
        fecharModal("modalExcluir");
        return;
    }

    const dataHora = obterDataHoraAtual();
    produtos = produtos.filter(produto => String(produto.id) !== String(id));

    try {
        await window.EstoqueSupabase.excluirProduto(id);
        await salvarMovimentacao({
            id: gerarId(), produtoId: id, produtoNome: produtoExistente.nome,
            tipo: "exclusao", quantidade: produtoExistente.quantidade,
            quantidadeAnterior: produtoExistente.quantidade, quantidadeNova: 0,
            data: dataHora.dataChave,
            hora: dataHora.hora
        });
        salvarProdutos();
        produtoDetalhesAtual = null;
        produtoQuantidadeAtual = null;
        produtoExclusaoAtual = null;
        fecharModal("modalExcluir");
        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();
    } catch (erro) {
        console.error("Erro ao excluir produto:", erro);
        alert("Não foi possível concluir a exclusão.");
    }
}

/* =========================================================
HISTÓRICO DE MOVIMENTAÇÕES — APENAS ENTRADAS E SAÍDAS (COLAPSÁVEL)
========================================================= */

function alternarHistoricoMovimentacoes() {
    const container = document.getElementById("containerHistoricoMovimentacoes");
    const botao = document.getElementById("btnToggleHistorico");
    if (!container || !botao) return;

    if (container.style.display === "none") {
        container.style.display = "flex";
        botao.textContent = "Ocultar ▲";
        renderizarHistoricoMovimentacoes();
    } else {
        container.style.display = "none";
        botao.textContent = "Ver histórico ▼";
    }
}

function renderizarHistoricoMovimentacoes() {
    const container = document.getElementById("listaHistoricoMovimentacoes");
    if (!container) return;

    const todasMovimentacoes = carregarMovimentacoes();

    // Filtra para mostrar APENAS "entrada" e "saida"
    const movimentacoes = todasMovimentacoes.filter(mov => {
        const tipo = String(mov.tipo || "").toLowerCase();
        return tipo === "entrada" || tipo === "saida";
    }).slice().reverse(); // Mais recentes primeiro

    if (!movimentacoes.length) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #78848b; font-size: 13px;">
                Nenhuma entrada ou saída registada ainda.
            </div>`;
        return;
    }

    container.innerHTML = movimentacoes.map(mov => {
        const quando = obterDataHoraRelatorio(mov);
        const tipo = String(mov.tipo || "").toLowerCase();
        const ehEntrada = tipo === "entrada";
        const corTipo = ehEntrada ? "#218653" : "#d9534f";
        const icone = ehEntrada ? "📥" : "📤";

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border: 1px solid #e1e8ed; border-radius: 12px; background: #f9fbfc; gap: 10px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px;">
                    <span style="font-size: 20px;">${icone}</span>
                    <div>
                        <strong style="display: block; color: #253542; font-size: 14px;">${escaparHTML(mov.produtoNome || "Produto")}</strong>
                        <small style="color: #667581;">${quando.data} às ${quando.hora} · <span style="color: ${corTipo}; font-weight: bold;">${obterRotuloTipoMovimento(mov.tipo)}</span></small>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 16px;">
                    <strong style="font-size: 14px; color: #253542;">Qtd: ${numeroSeguro(mov.quantidade)}</strong>
                    
                    <div style="display: flex; gap: 6px;">
                        <button type="button" onclick="editarMovimentoEstoque('${mov.id}')" style="background: #eef4f8; border: 1px solid #ccd6dd; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: bold; color: #3b5998;" title="Editar Quantidade">✏️ Editar</button>
                        <button type="button" onclick="excluirMovimentoEstoque('${mov.id}')" style="background: #fdf2f2; border: 1px solid #f5c6cb; border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: bold; color: #d9534f;" title="Excluir e Estornar">🗑️ Excluir</button>
                    </div>
                </div>
            </div>`;
    }).join("");
}

async function excluirMovimentoEstoque(idMovimento) {
    if (!exigirEstoquePronto()) return;
    if (!confirm("Tem certeza que deseja excluir esta movimentação? O estoque do produto será revertido.")) return;

    let movimentacoes = carregarMovimentacoes();
    const mov = movimentacoes.find(m => String(m.id) === String(idMovimento));
    if (!mov) {
        alert("Movimentação não encontrada.");
        return;
    }

    const produto = produtos.find(p => String(p.id) === String(mov.produtoId));
    if (produto) {
        const qtdMov = numeroSeguro(mov.quantidade);
        const tipo = String(mov.tipo).toLowerCase();

        if (tipo === "entrada" || tipo === "cadastro") {
            produto.quantidade = Math.max(0, numeroSeguro(produto.quantidade) - qtdMov);
        } else if (tipo === "saida") {
            produto.quantidade = numeroSeguro(produto.quantidade) + qtdMov;
        }
        produto.atualizadoEm = new Date().toISOString();
        
        try {
            await persistirProdutoNaNuvem(produto);
        } catch (e) {
            console.error("Erro ao atualizar estoque na nuvem ao excluir movimento:", e);
        }
    }

    movimentacoes = movimentacoes.filter(m => String(m.id) !== String(idMovimento));
    localStorage.setItem(chaveMovimentacoesDoComercio(), JSON.stringify(movimentacoes));
    salvarProdutos();

    atualizarKPIs();
    renderizarProdutos();
    renderizarHistoricoMovimentacoes();
    alert("Movimentação excluída e estoque estornado com sucesso!");
}

async function editarMovimentoEstoque(idMovimento) {
    if (!exigirEstoquePronto()) return;

    const movimentacoes = carregarMovimentacoes();
    const mov = movimentacoes.find(m => String(m.id) === String(idMovimento));
    if (!mov) {
        alert("Movimentação não encontrada.");
        return;
    }

    const novaQtdStr = prompt(`Editar quantidade movimentada para "${mov.produtoNome}":`, mov.quantidade);
    if (novaQtdStr === null) return;

    const novaQtd = Math.floor(numeroSeguro(novaQtdStr));
    if (novaQtd <= 0) {
        alert("A quantidade deve ser maior que zero. Se quiser anular, utilize o botão Excluir.");
        return;
    }

    const produto = produtos.find(p => String(p.id) === String(mov.produtoId));
    if (!produto) {
        alert("O produto associado a esta movimentação já não existe no estoque.");
        return;
    }

    const qtdAntigaMov = numeroSeguro(mov.quantidade);
    const diferenca = novaQtd - qtdAntigaMov;
    const tipo = String(mov.tipo).toLowerCase();

    if (tipo === "entrada" || tipo === "cadastro") {
        produto.quantidade = Math.max(0, numeroSeguro(produto.quantidade) + diferenca);
    } else if (tipo === "saida") {
        const novoEstoque = numeroSeguro(produto.quantidade) - diferenca;
        if (novoEstoque < 0) {
            alert("Ajuste inválido: a quantidade de saída excede o estoque disponível.");
            return;
        }
        produto.quantidade = novoEstoque;
    }

    produto.atualizadoEm = new Date().toISOString();
    mov.quantidade = novaQtd;
    mov.quantidadeNova = produto.quantidade;

    try {
        await persistirProdutoNaNuvem(produto);
        localStorage.setItem(chaveMovimentacoesDoComercio(), JSON.stringify(movimentacoes));
        salvarProdutos();

        atualizarKPIs();
        renderizarProdutos();
        renderizarHistoricoMovimentacoes();
        alert("Movimentação e estoque atualizados com sucesso!");
    } catch (e) {
        console.error("Erro ao atualizar movimentação:", e);
        alert("Erro ao atualizar no servidor.");
    }
}

/* =========================================================
LEITOR DE CÓDIGO DE BARRAS
========================================================= */

function pararLeitorCodigo() {
    sessaoLeitorCodigo++;
    lendoCodigoBarras = false;

    if (frameLeituraCodigo !== null) {
        cancelAnimationFrame(frameLeituraCodigo);
        frameLeituraCodigo = null;
    }

    if (streamLeitorCodigo) {
        streamLeitorCodigo.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
        });
        streamLeitorCodigo = null;
    }

    const video = document.getElementById("videoLeitorCodigo");
    if (video) {
        try { video.pause(); } catch (e) {}
        video.srcObject = null;
    }
    abrindoLeitorCodigo = false;
}

async function criarDetectorCodigoBarras() {
    if (typeof window.BarcodeDetector === "undefined") return null;
    try {
        return new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
    } catch (e) {
        return null;
    }
}

async function iniciarDeteccaoCodigoBarras() {
    if (!streamLeitorCodigo) return;
    if (!detectorCodigoBarras) detectorCodigoBarras = await criarDetectorCodigoBarras();

    const video = document.getElementById("videoLeitorCodigo");
    if (!video || !detectorCodigoBarras) return;

    const sessaoAtual = sessaoLeitorCodigo;
    lendoCodigoBarras = true;

    async function procurarCodigo() {
        if (!lendoCodigoBarras || sessaoAtual !== sessaoLeitorCodigo) return;
        try {
            const resultados = await detectorCodigoBarras.detect(video);
            if (resultados?.length) {
                const codigo = String(resultados[0].rawValue || "").trim();
                if (codigo) {
                    codigoEncontrado(codigo);
                    return;
                }
            }
        } catch (e) {}

        if (lendoCodigoBarras) {
            frameLeituraCodigo = requestAnimationFrame(procurarCodigo);
        }
    }
    procurarCodigo();
}

function codigoEncontrado(codigo) {
    codigoBarrasLido = codigo;
    pararLeitorCodigo();
    fecharModal("modalLeitorCodigo");

    const campoCodigo = document.getElementById("codigoProduto");
    if (campoCodigo) {
        campoCodigo.value = codigo;
        campoCodigo.focus();
    }
}

async function abrirLeitorCodigo() {
    if (abrindoLeitorCodigo) return;
    abrindoLeitorCodigo = true;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }
        });
        streamLeitorCodigo = stream;
        
        abrirModal("modalLeitorCodigo");
        const video = document.getElementById("videoLeitorCodigo");
        if (video) {
            video.srcObject = stream;
            await video.play();
            iniciarDeteccaoCodigoBarras();
        }
    } catch (e) {
        alert("Não foi possível acessar a câmera.");
    } finally {
        abrindoLeitorCodigo = false;
    }
}

function fecharLeitorCodigo() {
    pararLeitorCodigo();
    fecharModal("modalLeitorCodigo");
}

/* =========================================================
RELATÓRIO DO ESTOQUE — EXPORTAÇÃO EM PDF COM FILTRO DE DATA
========================================================= */

function obterRotuloTipoMovimento(tipo) {
    const rotulos = {
        cadastro: "Cadastro",
        entrada: "Entrada",
        saida: "Saída",
        ajuste: "Ajuste",
        exclusao: "Exclusão"
    };
    return rotulos[String(tipo || "").toLowerCase()] || String(tipo || "Movimentação");
}

function obterDataHoraRelatorio(movimento) {
    const dataOriginal = movimento?.data || movimento?.created_at || "";
    const horaOriginal = movimento?.hora || "";
    let data = "—";
    let hora = "—";

    if (dataOriginal) {
        const valor = String(dataOriginal);
        const dataParte = valor.includes("T") ? valor.split("T")[0] : valor;
        data = formatarDataBR(dataParte);
    }
    if (horaOriginal) hora = String(horaOriginal).slice(0, 8);
    return { data, hora };
}

function configurarBotaoExportarPDF() {
    const acoes = document.querySelector(".estoque-acoes");
    if (!acoes || document.getElementById("containerExportarPDF")) return;

    const container = document.createElement("div");
    container.id = "containerExportarPDF";
    container.style.gridColumn = "1 / -1";
    container.style.display = "flex";
    container.style.gap = "8px";
    container.style.alignItems = "center";
    container.style.flexWrap = "wrap";
    container.style.marginTop = "4px";

    const inputData = document.createElement("input");
    inputData.type = "date";
    inputData.id = "filtroDataRelatorioPDF";
    inputData.value = obterDataHoje();
    inputData.style.flex = "1";
    inputData.style.minWidth = "140px";
    inputData.style.height = "46px";
    inputData.style.padding = "0 12px";
    inputData.style.borderRadius = "10px";
    inputData.style.border = "1px solid #cdebd8";
    inputData.style.background = "#fff";
    inputData.style.color = "#176b45";
    inputData.style.fontWeight = "bold";
    inputData.style.fontSize = "14px";
    inputData.style.boxSizing = "border-box";

    const botao = document.createElement("button");
    botao.id = "btnExportarEstoquePDF";
    botao.type = "button";
    botao.className = "estoque-acao";
    botao.innerHTML = '<span class="simbolo">📄</span> Exportar PDF do Dia';
    botao.style.flex = "2";
    botao.style.minHeight = "46px";
    botao.style.color = "#176b45";
    botao.style.background = "#eaf7ef";
    botao.style.border = "1px solid #cdebd8";
    botao.style.boxShadow = "none";
    botao.style.fontWeight = "900";
    botao.addEventListener("click", exportarRelatorioEstoquePDF);

    container.appendChild(inputData);
    container.appendChild(botao);
    acoes.appendChild(container);
}

">${formatarReal(preco)}</td>
                <td class="numero">${formatarReal(preco * quantidade)}</td>
                <td>${escaparHTML(status.texto)}</td>
                <td>${produto.validade ? formatarDataBR(produto.validade) : "—"}</td>
            </tr>`;
    }).join("");

    const linhasMovimentacoes = movimentacoes.map(movimento => {
        const quando = obterDataHoraRelatorio(movimento);
        return `
            <tr>
                <td>${escaparHTML(quando.data)}</td>
                <td>${escaparHTML(quando.hora)}</td>
                <td>${escaparHTML(obterRotuloTipoMovimento(movimento.tipo))}</td>
                <td>${escaparHTML(movimento.produtoNome || movimento.nomeProduto || "Produto não informado")}</td>
                <td class="numero">${numeroSeguro(movimento.quantidade)}</td>
                <td class="numero">${movimento.quantidadeAnterior === undefined ? "—" : numeroSeguro(movimento.quantidadeAnterior)}</td>
                <td class="numero">${movimento.quantidadeNova === undefined ? "—" : numeroSeguro(movimento.quantidadeNova)}</td>
            </tr>`;
    }).join("");

    const geradoEm = new Date().toLocaleString("pt-BR");
    const rotuloPeriodoFiltro = dataSelecionada ? `Data selecionada: ${formatarDataBR(dataSelecionada)}` : "Todas as datas";

    const janela = window.open("", "_blank");
    if (!janela) {
        alert("O navegador bloqueou a janela do relatório. Permita pop-ups para este aplicativo e tente novamente.");
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de Estoque - Dr. Troco</title>
<style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #253542; margin: 0; font-size: 10px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #218653; padding-bottom: 12px; margin-bottom: 14px; }
    h1 { margin: 0 0 4px; color: #176b45; font-size: 22px; }
    h2 { margin: 22px 0 9px; color: #176b45; font-size: 15px; page-break-after: avoid; }
    p { margin: 3px 0; color: #667581; }
    .gerado { text-align: right; white-space: nowrap; }
    .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .kpi { border: 1px solid #dce8e1; background: #f4faf6; border-radius: 7px; padding: 10px; }
    .kpi span { display: block; color: #64756c; font-size: 9px; font-weight: bold; }
    .kpi strong { display: block; margin-top: 5px; color: #176b45; font-size: 16px; }
    .mov-resumo { display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0 12px; }
    .mov-resumo span { padding: 6px 9px; border: 1px solid #dfe7e3; border-radius: 5px; background: #f8faf9; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    thead { display: table-header-group; }
    th { background: #176b45; color: #fff; text-align: left; font-weight: bold; }
    th, td { border: 1px solid #dbe2e6; padding: 6px 7px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f6f8f7; }
    .numero { text-align: right; white-space: nowrap; }
    .vazio { padding: 14px; text-align: center; border: 1px dashed #cbd5d0; color: #697781; }
    .nota { margin-top: 14px; padding: 9px; background: #fff8e8; border: 1px solid #eedeb1; color: #725c28; border-radius: 5px; }
    footer { margin-top: 18px; border-top: 1px solid #dbe2e6; padding-top: 7px; color: #78848b; font-size: 8px; }
    .acoes { margin: 0 0 14px; }
    .acoes button { background: #176b45; color: #fff; border: 0; border-radius: 6px; padding: 9px 14px; font-weight: bold; }
    @media print { .acoes { display: none; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="acoes"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div>
<header>
    <div>
        <h1>Dr. Troco — Relatório de Estoque</h1>
        <p>Posição atual do estoque e histórico de movimentações (${escaparHTML(rotuloPeriodoFiltro)})</p>
        <p>Estabelecimento: ${escaparHTML(String(comercioIdEstoque))}</p>
    </div>
    <div class="gerado"><strong>Relatório gerado em</strong><p>${escaparHTML(geradoEm)}</p></div>

function exportarRelatorioEstoquePDF() {
    if (!estoquePronto || !comercioIdEstoque) {
        alert("O estoque precisa estar conectado para gerar o relatório. Verifique a conexão e atualize a página.");
        return;
    }

    const inputData = document.getElementById("filtroDataRelatorioPDF");
    const dataSelecionada = inputData ? inputData.value : "";

    let movimentacoes = carregarMovimentacoes();

    // FILTRA APENAS ENTRADAS E SAÍDAS E A DATA SELECIONADA
    movimentacoes = movimentacoes.filter(mov => {
        const tipo = String(mov?.tipo || "").toLowerCase();
        const ehEntradaOuSaida = tipo === "entrada" || tipo === "saida";
        const passaData = !dataSelecionada || String(mov?.data || "").trim() === dataSelecionada;
        return ehEntradaOuSaida && passaData;
    });

    movimentacoes.sort((a, b) => {
        const dataA = `${a?.data || ""} ${a?.hora || ""}`;
        const dataB = `${b?.data || ""} ${b?.hora || ""}`;
        return dataB.localeCompare(dataA);
    });

    const totalProdutos = produtos.length;
    const totalUnidades = produtos.reduce((soma, produto) => soma + numeroSeguro(produto.quantidade), 0);
    const totalValor = produtos.reduce((soma, produto) => soma + numeroSeguro(produto.preco) * numeroSeguro(produto.quantidade), 0);
    const totalAtencao = produtos.filter(produto => {
        const status = obterStatusProduto(produto);
        return status.classe === "baixo" || status.classe === "zero" || status.classe === "vencido" || status.classe === "a-vencer";
    }).length;

    // Contagem apenas para o resumo do PDF
    const contagemMovimentos = {
        entrada: movimentacoes.filter(m => String(m?.tipo).toLowerCase() === "entrada").length,
        saida: movimentacoes.filter(m => String(m?.tipo).toLowerCase() === "saida").length,
        total: movimentacoes.length
    };

    const linhasProdutos = produtos.slice().sort((a, b) =>
        String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
    ).map(produto => {
        const status = obterStatusProduto(produto);
        const quantidade = numeroSeguro(produto.quantidade);
        const preco = numeroSeguro(produto.preco);
        const tipo = produto.tipo === "perecivel" ? "Perecível" : "Não perecível";
        return `
            <tr>
                <td>${escaparHTML(produto.nome || "—")}</td>
                <td>${escaparHTML(produto.codigo || "—")}</td>
                <td>${tipo}</td>
                <td class="numero">${quantidade}</td>
                <td class="numero">${numeroSeguro(produto.estoqueMinimo)}</td>
                <td class="numero">${formatarReal(preco)}</td>
                <td class="numero">${formatarReal(preco * quantidade)}</td>
                <td>${escaparHTML(status.texto)}</td>
                <td>${produto.validade ? formatarDataBR(produto.validade) : "—"}</td>
            </tr>`;
    }).join("");

    const linhasMovimentacoes = movimentacoes.map(movimento => {
        const quando = obterDataHoraRelatorio(movimento);
        return `
            <tr>
                <td>${escaparHTML(quando.data)}</td>
                <td>${escaparHTML(quando.hora)}</td>
                <td>${escaparHTML(obterRotuloTipoMovimento(movimento.tipo))}</td>
                <td>${escaparHTML(movimento.produtoNome || movimento.nomeProduto || "Produto não informado")}</td>
                <td class="numero">${numeroSeguro(movimento.quantidade)}</td>
                <td class="numero">${movimento.quantidadeAnterior === undefined ? "—" : numeroSeguro(movimento.quantidadeAnterior)}</td>
                <td class="numero">${movimento.quantidadeNova === undefined ? "—" : numeroSeguro(movimento.quantidadeNova)}</td>
            </tr>`;
    }).join("");

    const geradoEm = new Date().toLocaleString("pt-BR");
    const rotuloPeriodoFiltro = dataSelecionada ? `Data selecionada: ${formatarDataBR(dataSelecionada)}` : "Todas as datas";

    const janela = window.open("", "_blank");
    if (!janela) {
        alert("O navegador bloqueou a janela do relatório. Permita pop-ups para este aplicativo e tente novamente.");
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de Estoque - Dr. Troco</title>
<style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #253542; margin: 0; font-size: 10px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #218653; padding-bottom: 12px; margin-bottom: 14px; }
    h1 { margin: 0 0 4px; color: #176b45; font-size: 22px; }
    h2 { margin: 22px 0 9px; color: #176b45; font-size: 15px; page-break-after: avoid; }
    p { margin: 3px 0; color: #667581; }
    .gerado { text-align: right; white-space: nowrap; }
    .resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
    .kpi { border: 1px solid #dce8e1; background: #f4faf6; border-radius: 7px; padding: 10px; }
    .kpi span { display: block; color: #64756c; font-size: 9px; font-weight: bold; }
    .kpi strong { display: block; margin-top: 5px; color: #176b45; font-size: 16px; }
    .mov-resumo { display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0 12px; }
    .mov-resumo span { padding: 6px 9px; border: 1px solid #dfe7e3; border-radius: 5px; background: #f8faf9; }
    table { width: 100%; border-collapse: collapse; table-layout: auto; }
    thead { display: table-header-group; }
    th { background: #176b45; color: #fff; text-align: left; font-weight: bold; }
    th, td { border: 1px solid #dbe2e6; padding: 6px 7px; vertical-align: top; }
    tbody tr:nth-child(even) { background: #f6f8f7; }
    .numero { text-align: right; white-space: nowrap; }
    .vazio { padding: 14px; text-align: center; border: 1px dashed #cbd5d0; color: #697781; }
    .nota { margin-top: 14px; padding: 9px; background: #fff8e8; border: 1px solid #eedeb1; color: #725c28; border-radius: 5px; }
    footer { margin-top: 18px; border-top: 1px solid #dbe2e6; padding-top: 7px; color: #78848b; font-size: 8px; }
    .acoes { margin: 0 0 14px; }
    .acoes button { background: #176b45; color: #fff; border: 0; border-radius: 6px; padding: 9px 14px; font-weight: bold; }
    @media print { .acoes { display: none; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="acoes"><button onclick="window.print()">Imprimir / Salvar como PDF</button></div>
<header>
    <div>
        <h1>Dr. Troco — Relatório de Estoque</h1>
        <p>Posição atual do estoque e histórico de movimentações (${escaparHTML(rotuloPeriodoFiltro)})</p>
        <p>Estabelecimento: ${escaparHTML(String(comercioIdEstoque))}</p>
    </div>
    <div class="gerado"><strong>Relatório gerado em</strong><p>${escaparHTML(geradoEm)}</p></div>
</header>
<section class="resumo">
    <div class="kpi"><span>PRODUTOS CADASTRADOS</span><strong>${totalProdutos}</strong></div>
    <div class="kpi"><span>UNIDADES EM ESTOQUE</span><strong>${totalUnidades}</strong></div>
    <div class="kpi"><span>VALOR ESTIMADO DO ESTOQUE</span><strong>${formatarReal(totalValor)}</strong></div>
    <div class="kpi"><span>PRODUTOS QUE EXIGEM ATENÇÃO</span><strong>${totalAtencao}</strong></div>
</section>
<h2>Resumo das entradas e saídas (${escaparHTML(rotuloPeriodoFiltro)})</h2>
<div class="mov-resumo">
    <span>Entradas: <strong>${contagemMovimentos.entrada}</strong></span>
    <span>Saídas: <strong>${contagemMovimentos.saida}</strong></span>
    <span>Total no período: <strong>${contagemMovimentos.total}</strong></span>
</div>
<h2>Produtos e posição atual</h2>
${produtos.length ? `<table><thead><tr><th>Produto</th><th>Código</th><th>Tipo</th><th>Qtd.</th><th>Mínimo</th><th>Preço un.</th><th>Valor total</th><th>Status</th><th>Validade</th></tr></thead><tbody>${linhasProdutos}</tbody></table>` : '<div class="vazio">Nenhum produto cadastrado.</div>'}
<h2>Histórico de entradas e saídas (${escaparHTML(rotuloPeriodoFiltro)})</h2>
${movimentacoes.length ? `<table><thead><tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Produto</th><th>Qtd. mov.</th><th>Qtd. anterior</th><th>Qtd. nova</th></tr></thead><tbody>${linhasMovimentacoes}</tbody></table>` : '<div class="vazio">Nenhuma entrada ou saída registada para a data selecionada.</div>'}
<div class="nota"><strong>Observação:</strong> o relatório exibe a posição atual do stock e as movimentações de entradas e saídas filtradas para o dia escolhido.</div>
<footer>Dr. Troco • Relatório gerado localmente em ${escaparHTML(geradoEm)}</footer>
</body>
</html>`;

    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    janela.focus();
    setTimeout(() => {
        try { janela.print(); }
        catch (erro) { console.error("Não foi possível abrir a impressão do relatório:", erro); }
    }, 500);
}

/* =========================================================
CONFIGURAÇÕES E INICIALIZAÇÃO
========================================================= */

function configurarBotoes() {
    const cadastrar = document.getElementById("btnCadastrarProduto");
    const entrada = document.getElementById("btnEntradaEstoque");
    const saida = document.getElementById("btnSaidaEstoque");
    const btnConfirmarMovimento = document.getElementById("btnConfirmarMovimento");
    const editarDetalhes = document.getElementById("btnEditarDetalhes");
    const excluirDetalhes = document.getElementById("btnExcluirDetalhes");
    const confirmarQuantidade = document.getElementById("btnConfirmarQuantidade");
    const btnConfirmarExclusao = document.getElementById("btnConfirmarExclusao");
    const form = document.getElementById("formProduto");
    const lerCodigo = document.getElementById("btnLerCodigoBarras");
    const fecharLeitor = document.getElementById("btnFecharLeitorCodigo");
    
    configurarBotaoExportarPDF();

    if (cadastrar) cadastrar.addEventListener("click", abrirCadastroProduto);
    if (entrada) entrada.addEventListener("click", () => abrirMovimento("entrada"));
    if (saida) saida.addEventListener("click", () => abrirMovimento("saida"));
    if (btnConfirmarMovimento) btnConfirmarMovimento.addEventListener("click", confirmarMovimento);

    if (editarDetalhes) {
        editarDetalhes.addEventListener("click", () => {
            if (!produtoDetalhesAtual) return;
            const id = produtoDetalhesAtual.id;
            fecharModal("modalDetalhes");
            abrirEdicaoProduto(id);
        });
    }

    if (excluirDetalhes) excluirDetalhes.addEventListener("click", abrirConfirmacaoExclusao);
    if (confirmarQuantidade) confirmarQuantidade.addEventListener("click", confirmarAjusteQuantidade);
    if (btnConfirmarExclusao) btnConfirmarExclusao.addEventListener("click", confirmarExclusao);
    if (form) form.addEventListener("submit", salvarProduto);

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

function configurarBusca() {
    const campo = document.getElementById("buscaProduto");
    const limpar = document.getElementById("btnLimparBusca");
    if (campo) campo.addEventListener("input", renderizarProdutos);
    if (limpar) {
        limpar.addEventListener("click", () => {
            if (campo) campo.value = "";
            renderizarProdutos();
            campo?.focus();
        });
    }
}

function configurarBuscaMovimento() {
    const campo = document.getElementById("buscaMovimento");
    if (campo) campo.addEventListener("input", renderizarSelecaoProdutos);
}

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

function configurarFechamentoModais() {
    document.addEventListener("click", event => {
        const botao = event.target.closest("[data-fechar]");
        if (botao) {
            event.preventDefault();
            event.stopPropagation();
            const id = botao.getAttribute("data-fechar");
            if (id === "modalLeitorCodigo") fecharLeitorCodigo();
            else if (id) fecharModal(id);
            return;
        }

        const modal = event.target.closest(".estoque-modal");
        if (modal && event.target === modal) {
            if (modal.id === "modalLeitorCodigo") fecharLeitorCodigo();
            else fecharModal(modal.id);
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const modal = document.querySelector(".estoque-modal.aberto");
        if (!modal) return;
        if (modal.id === "modalLeitorCodigo") fecharLeitorCodigo();
        else fecharModal(modal.id);
    });
}

async function inicializarEstoque() {
    estoqueCarregando = true;
    const lista = document.getElementById("listaProdutos");
    if (lista) {
        lista.innerHTML = `
            <div class="estoque-vazio">
                <div class="estoque-vazio-icone">☁️</div>
                <strong>Carregando estoque...</strong>
                <span>Buscando os produtos deste estabelecimento.</span>
            </div>`;
    }

    configurarBotoes();
    configurarBusca();
    configurarBuscaMovimento();
    configurarFiltros();
    configurarFechamentoModais();
    configurarFotoProduto();
    configurarTipoProduto();
    atualizarBotaoMovimento();

    await carregarProdutos();
    renderizarHistoricoMovimentacoes();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializarEstoque);
} else {
    inicializarEstoque();
}
