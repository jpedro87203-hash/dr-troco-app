
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const CHAVE = "drTroco_estabelecimento";
  const form = document.getElementById("formEstabelecimento");
  const mensagem = document.getElementById("mensagemEstabelecimento");
  const botao = form?.querySelector('button[type="submit"]');

  const campos = [
    "nomeEstabelecimento",
    "responsavelEstabelecimento",
    "telefoneEstabelecimento",
    "emailEstabelecimento",
    "enderecoEstabelecimento",
    "cidadeEstabelecimento",
    "estadoEstabelecimento"
  ];

  if (!form || !mensagem) {
    console.error("Formulário de estabelecimento não encontrado.");
    return;
  }

  function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto;
    mensagem.style.color = erro ? "#b42318" : "#168b53";
  }

  function preencherCampos(dados = {}) {
    campos.forEach((id) => {
      const campo = document.getElementById(id);
      if (campo && dados[id] !== undefined) {
        campo.value = dados[id] || "";
      }
    });
  }

  function lerDadosFormulario() {
    const dados = {};
    campos.forEach((id) => {
      const campo = document.getElementById(id);
      dados[id] = campo ? campo.value.trim() : "";
    });
    return dados;
  }

  function dadosDoBanco(comercio, detalhes) {
    return {
      nomeEstabelecimento: comercio.nome || "",
      responsavelEstabelecimento: detalhes?.responsavel || "",
      telefoneEstabelecimento: detalhes?.telefone || "",
      emailEstabelecimento: detalhes?.email || "",
      enderecoEstabelecimento: detalhes?.endereco || "",
      cidadeEstabelecimento: detalhes?.cidade || "",
      estadoEstabelecimento: detalhes?.estado || ""
    };
  }

  async function obterComercio(client, usuarioId) {
    const { data, error } = await client
      .from("membros_comercio")
      .select("comercio_id, papel")
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(
        "Sua conta não possui vínculo ativo com um comércio."
      );
    }

    if (data.length > 1) {
      throw new Error(
        "Sua conta possui mais de um comércio. É necessário escolher qual deseja editar."
      );
    }

    return data[0];
  }

  async function carregarDados() {
    // Exibe primeiro a cópia local, se existir.
    try {
      preencherCampos(JSON.parse(localStorage.getItem(CHAVE) || "{}"));
    } catch (erro) {
      console.warn("Não foi possível ler a cópia local:", erro);
    }

    const client = window.supabaseClient;

    if (!client) {
      mostrarMensagem("Supabase não carregado. Confira a conexão.", true);
      return;
    }

    try {
      const { data: sessaoData, error: sessaoErro } =
        await client.auth.getSession();

      if (sessaoErro) throw sessaoErro;

      const usuario = sessaoData.session?.user;

      if (!usuario) {
        mostrarMensagem(
          "Entre na sua conta antes de carregar os dados.",
          true
        );
        return;
      }

      const membro = await obterComercio(client, usuario.id);

      const { data: comercio, error: comercioErro } = await client
        .from("comercios")
        .select("id, nome")
        .eq("id", membro.comercio_id)
        .single();

      if (comercioErro) throw comercioErro;

      const { data: detalhes, error: detalhesErro } = await client
        .from("dados_estabelecimento")
        .select(
          "responsavel, telefone, email, endereco, cidade, estado"
        )
        .eq("comercio_id", membro.comercio_id)
        .maybeSingle();

      if (detalhesErro) throw detalhesErro;

      const dados = dadosDoBanco(comercio, detalhes);
      preencherCampos(dados);
      localStorage.setItem(CHAVE, JSON.stringify(dados));

      mostrarMensagem("Dados carregados do Supabase.");
    } catch (erro) {
      console.error("Erro ao carregar estabelecimento:", erro);
      mostrarMensagem(
        erro.message || "Não foi possível carregar os dados da nuvem.",
        true
      );
    }
  }

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const dados = lerDadosFormulario();

    if (!dados.nomeEstabelecimento || !dados.responsavelEstabelecimento) {
      mostrarMensagem(
        "Preencha o nome do estabelecimento e o responsável.",
        true
      );
      return;
    }

    // Mantém uma cópia local antes de tentar enviar à nuvem.
    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch (erro) {
      mostrarMensagem(
        "Não foi possível salvar a cópia local neste navegador.",
        true
      );
      return;
    }

    const client = window.supabaseClient;

    if (!client) {
      mostrarMensagem(
        "Cópia local salva, mas o Supabase não foi carregado.",
        true
      );
      return;
    }

    if (botao) {
      botao.disabled = true;
      botao.textContent = "Salvando...";
    }

    try {
      const { data: sessaoData, error: sessaoErro } =
        await client.auth.getSession();

      if (sessaoErro) throw sessaoErro;

      const usuario = sessaoData.session?.user;

      if (!usuario) {
        throw new Error("Entre na sua conta antes de salvar na nuvem.");
      }

      const membro = await obterComercio(client, usuario.id);
      const comercioId = membro.comercio_id;

      // Atualiza o nome do comércio.
      const { data: comercioAtualizado, error: nomeErro } = await client
        .from("comercios")
        .update({ nome: dados.nomeEstabelecimento })
        .eq("id", comercioId)
        .select("id");

      if (nomeErro) throw nomeErro;

      if (!comercioAtualizado || comercioAtualizado.length === 0) {
        throw new Error(
          "O nome não foi atualizado. Confira a permissão de administrador."
        );
      }

      // Salva os demais dados vinculados ao mesmo comércio.
      const { error: detalhesErro } = await client
        .from("dados_estabelecimento")
        .upsert(
          {
            comercio_id: comercioId,
            responsavel: dados.responsavelEstabelecimento,
            telefone: dados.telefoneEstabelecimento,
            email: dados.emailEstabelecimento,
            endereco: dados.enderecoEstabelecimento,
            cidade: dados.cidadeEstabelecimento,
            estado: dados.estadoEstabelecimento,
            atualizado_em: new Date().toISOString()
          },
          { onConflict: "comercio_id" }
        );

      if (detalhesErro) throw detalhesErro;

      mostrarMensagem("Dados salvos no Supabase com sucesso!");
      window.location.href = "painel-lojista.html";
    } catch (erro) {
      console.error("Erro ao salvar no Supabase:", erro);
      mostrarMensagem(
        "A cópia local foi mantida, mas o salvamento na nuvem falhou: " +
          (erro.message || "erro desconhecido"),
        true
      );
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.textContent = "Salvar dados";
      }
    }
  });

  carregarDados();
});

