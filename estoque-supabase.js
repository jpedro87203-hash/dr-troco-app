
// ======================================================
// DR. TROCO — INTEGRAÇÃO DO ESTOQUE COM SUPABASE
// ======================================================

window.EstoqueSupabase = (() => {

  let comercioIdAtual = null;
  let usuarioIdAtual = null;

  // ----------------------------------------------------
  // CLIENTE SUPABASE
  // ----------------------------------------------------

  function obterCliente() {
    const client = window.supabaseClient;

    if (!client) {
      throw new Error(
        "Cliente Supabase não foi inicializado. Verifique supabase.js."
      );
    }

    return client;
  }

  // ----------------------------------------------------
  // IDENTIFICAR USUÁRIO E ESTABELECIMENTO
  // ----------------------------------------------------

  async function obterComercioId() {
    const client = obterCliente();

    const {
      data: sessaoData,
      error: sessaoErro
    } = await client.auth.getSession();

    if (sessaoErro) {
      throw new Error(
        "Erro ao verificar a sessão: " + sessaoErro.message
      );
    }

    const usuario = sessaoData?.session?.user;

    if (!usuario) {
      comercioIdAtual = null;
      usuarioIdAtual = null;

      throw new Error(
        "Usuário não autenticado. Entre novamente na sua conta."
      );
    }

    // Reutiliza o estabelecimento se a conta for a mesma.
    if (
      comercioIdAtual &&
      usuarioIdAtual === usuario.id
    ) {
      return comercioIdAtual;
    }

    const {
      data,
      error
    } = await client
      .from("membros_comercio")
      .select("comercio_id")
      .eq("usuario_id", usuario.id)
      .eq("ativo", true);

    if (error) {
      console.error(
        "Erro ao consultar membros_comercio:",
        error
      );

      throw new Error(
        "Não foi possível consultar o vínculo do estabelecimento: " +
        error.message
      );
    }

    if (!data || data.length === 0) {
      throw new Error(
        "Nenhum estabelecimento ativo foi encontrado para esta sessão."
      );
    }

    if (data.length > 1) {
      throw new Error(
        "Esta conta possui mais de um estabelecimento ativo. " +
        "É necessário selecionar um."
      );
    }

    comercioIdAtual = data[0].comercio_id;
    usuarioIdAtual = usuario.id;

    console.log(
      "Estabelecimento identificado:",
      comercioIdAtual
    );

    return comercioIdAtual;
  }

  // ----------------------------------------------------
  // CARREGAR PRODUTOS
  // ----------------------------------------------------

  async function carregarProdutos(comercioIdInformado = null) {
    const client = obterCliente();

    const comercioId =
      comercioIdInformado || await obterComercioId();

    const {
      data,
      error
    } = await client
      .from("estoque_produtos")
      .select("*")
      .eq("comercio_id", comercioId)
      .order("nome", { ascending: true });

    if (error) {
      console.error(
        "Erro ao carregar produtos:",
        error
      );

      throw new Error(
        "Falha ao carregar produtos: " + error.message
      );
    }

    return (data || []).map(p => ({
      id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      preco: p.preco,
      tipo: p.tipo,
      estoqueMinimo: p.estoque_minimo,
      quantidade: p.quantidade,
      validade: p.validade,
      foto: p.foto,
      criadoEm: p.criado_em,
      atualizadoEm: p.atualizado_em
    }));
  }

  // ----------------------------------------------------
  // SALVAR OU ATUALIZAR PRODUTO
  // ----------------------------------------------------

  async function salvarProduto(produto) {
    const client = obterCliente();
    const comercioId = await obterComercioId();

    if (!produto || !produto.nome) {
      throw new Error(
        "Os dados do produto estão incompletos."
      );
    }

    const registro = {
      comercio_id: comercioId,
      nome: produto.nome,
      codigo: produto.codigo || null,
      preco: Number(produto.preco) || 0,
      tipo: produto.tipo || null,
      estoque_minimo: Number(produto.estoqueMinimo) || 0,
      quantidade: Number(produto.quantidade) || 0,
      validade: produto.validade || null,
      foto: produto.foto || null,
      criado_em: produto.criadoEm || new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    if (produto.id) {
      registro.id = produto.id;
    }

    const {
      data,
      error
    } = await client
      .from("estoque_produtos")
      .upsert(registro, {
        onConflict: "id"
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Erro ao salvar produto:",
        error
      );

      throw new Error(
        "Não foi possível salvar o produto: " + error.message
      );
    }

    return data;
  }

  // ----------------------------------------------------
  // EXCLUIR PRODUTO
  // ----------------------------------------------------

  async function excluirProduto(produtoId) {
    const client = obterCliente();
    const comercioId = await obterComercioId();

    if (!produtoId) {
      throw new Error("ID do produto não informado.");
    }

    const {
      error
    } = await client
      .from("estoque_produtos")
      .delete()
      .eq("id", produtoId)
      .eq("comercio_id", comercioId);

    if (error) {
      console.error(
        "Erro ao excluir produto:",
        error
      );

      throw new Error(
        "Não foi possível excluir o produto: " + error.message
      );
    }
  }

  // ----------------------------------------------------
  // SALVAR MOVIMENTAÇÃO
  // ----------------------------------------------------

  async function salvarMovimentacao(movimento) {
    const client = obterCliente();
    const comercioId = await obterComercioId();

    if (!movimento) {
      throw new Error(
        "Dados da movimentação não informados."
      );
    }

    const registro = {
      comercio_id: comercioId,
      produto_id: movimento.produtoId,
      produto_nome: movimento.produtoNome,
      tipo: movimento.tipo,
      quantidade: Number(movimento.quantidade) || 0,
      quantidade_anterior:
        Number(movimento.quantidadeAnterior) || 0,
      quantidade_nova:
        Number(movimento.quantidadeNova) || 0,
      data:
        movimento.data ||
        new Date().toISOString().slice(0, 10),
      hora:
        movimento.hora ||
        new Date().toLocaleTimeString("pt-BR"),
      criado_em: new Date().toISOString()
    };

    const {
      error
    } = await client
      .from("estoque_movimentacoes")
      .insert(registro);

    if (error) {
      console.error(
        "Erro ao salvar movimentação:",
        error
      );

      throw new Error(
        "Não foi possível registrar a movimentação: " +
        error.message
      );
    }
  }

  // ----------------------------------------------------
  // CARREGAR HISTÓRICO DE MOVIMENTAÇÕES
  // Aceita filtro por data inicial e data final.
  // Carrega em páginas para não limitar o histórico.
  // ----------------------------------------------------

  async function carregarMovimentacoes(opcoes = {}) {
    const client = obterCliente();
    const comercioId = await obterComercioId();

    const dataInicial = opcoes.dataInicial || null;
    const dataFinal = opcoes.dataFinal || null;

    const formatoData = /^\d{4}-\d{2}-\d{2}$/;

    if (
      dataInicial &&
      !formatoData.test(dataInicial)
    ) {
      throw new Error("Data inicial inválida.");
    }

    if (
      dataFinal &&
      !formatoData.test(dataFinal)
    ) {
      throw new Error("Data final inválida.");
    }

    if (
      dataInicial &&
      dataFinal &&
      dataInicial > dataFinal
    ) {
      throw new Error(
        "A data inicial não pode ser posterior à data final."
      );
    }

    const tamanhoPagina = 1000;
    let inicio = 0;
    let registros = [];

    while (true) {
      let consulta = client
        .from("estoque_movimentacoes")
        .select("*")
        .eq("comercio_id", comercioId);

      if (dataInicial) {
        consulta = consulta.gte("data", dataInicial);
      }

      if (dataFinal) {
        consulta = consulta.lte("data", dataFinal);
      }

      consulta = consulta
        .order("criado_em", { ascending: false })
        .range(inicio, inicio + tamanhoPagina - 1);

      const {
        data,
        error
      } = await consulta;

      if (error) {
        console.error(
          "Erro ao carregar movimentações:",
          error
        );

        throw new Error(
          "Não foi possível carregar o histórico: " +
          error.message
        );
      }

      const pagina = data || [];

      registros = registros.concat(pagina);

      if (pagina.length < tamanhoPagina) {
        break;
      }

      inicio += tamanhoPagina;
    }

    return registros.map(m => ({
      id: m.id,
      comercioId: m.comercio_id,
      produtoId: m.produto_id,
      produtoNome: m.produto_nome,
      tipo: m.tipo,
      quantidade: Number(m.quantidade) || 0,
      quantidadeAnterior:
        Number(m.quantidade_anterior) || 0,
      quantidadeNova:
        Number(m.quantidade_nova) || 0,
      data: m.data,
      hora: m.hora,
      criadoEm: m.criado_em
    }));
  }

  // ----------------------------------------------------
  // LIMPAR ESTABELECIMENTO EM CASO DE TROCA DE CONTA
  // ----------------------------------------------------

  function limparComercioAtual() {
    comercioIdAtual = null;
    usuarioIdAtual = null;
  }

  // ----------------------------------------------------
  // FUNÇÕES DISPONÍVEIS PARA estoque.js
  // ----------------------------------------------------

  return {
    obterComercioId,
    carregarProdutos,
    salvarProduto,
    excluirProduto,
    salvarMovimentacao,
    carregarMovimentacoes,
    limparComercioAtual
  };

})();
