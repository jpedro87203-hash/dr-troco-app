
// DR. TROCO — INTEGRAÇÃO DO ESTOQUE COM SUPABASE

window.EstoqueSupabase = (() => {
  const client = window.supabaseClient;

  let comercioIdAtual = null;

  async function obterComercioId() {
    if (!client) {
      throw new Error("Cliente Supabase não foi inicializado.");
    }

    const { data: sessaoData, error: sessaoErro } =
      await client.auth.getSession();

    if (sessaoErro) throw sessaoErro;

    const usuario = sessaoData?.session?.user;
    alert("ID AUTENTICADO: " + (usuario?.id || "NENHUM"));

    if (!usuario) {
      throw new Error("Usuário não autenticado.");
    }
    console.log("USUÁRIO AUTENTICADO:", usuario.id);

    const { data, error } = await client
      .from("membros_comercio")
      .select("comercio_id")
      .eq("usuario_id", usuario.id)
      .eq("ativo", true);

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error("Nenhum estabelecimento ativo encontrado.");
    }

    if (data.length > 1) {
      throw new Error(
        "Esta conta possui mais de um estabelecimento ativo. É necessário selecionar um."
      );
    }

    comercioIdAtual = data[0].comercio_id;
    return comercioIdAtual;
  }

  async function carregarProdutos() {
    const comercioId = await obterComercioId();

    const { data, error } = await client
      .from("estoque_produtos")
      .select("*")
      .eq("comercio_id", comercioId)
      .order("nome", { ascending: true });

    if (error) throw error;

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

  async function salvarProduto(produto) {
    const comercioId = await obterComercioId();

    const registro = {
      id: produto.id,
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

    const { data, error } = await client
      .from("estoque_produtos")
      .upsert(registro, { onConflict: "id" })
      .select()
      .single();

    if (error) throw error;

    return data;
  }

  async function excluirProduto(produtoId) {
    const comercioId = await obterComercioId();

    const { error } = await client
      .from("estoque_produtos")
      .delete()
      .eq("id", produtoId)
      .eq("comercio_id", comercioId);

    if (error) throw error;
  }

  async function salvarMovimentacao(movimento) {
    const comercioId = await obterComercioId();

    const registro = {
      comercio_id: comercioId,
      produto_id: movimento.produtoId,
      produto_nome: movimento.produtoNome,
      tipo: movimento.tipo,
      quantidade: Number(movimento.quantidade) || 0,
      quantidade_anterior: Number(movimento.quantidadeAnterior) || 0,
      quantidade_nova: Number(movimento.quantidadeNova) || 0,
      data: movimento.data || new Date().toISOString().slice(0, 10),
      hora: movimento.hora || new Date().toLocaleTimeString("pt-BR"),
      criado_em: new Date().toISOString()
    };

    const { error } = await client
      .from("estoque_movimentacoes")
      .insert(registro);

    if (error) throw error;
  }

  return {
    obterComercioId,
    carregarProdutos,
    salvarProduto,
    excluirProduto,
    salvarMovimentacao
  };
})();
