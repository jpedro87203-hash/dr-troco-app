document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const CHAVE = "drTroco_estabelecimento";

  const form = document.getElementById("formEstabelecimento");
  const mensagem = document.getElementById("mensagemEstabelecimento");

  const campos = [
    "nomeEstabelecimento",
    "responsavelEstabelecimento",
    "telefoneEstabelecimento",
    "emailEstabelecimento",
    "enderecoEstabelecimento",
    "cidadeEstabelecimento",
    "estadoEstabelecimento"
  ];

  // Carrega os dados já cadastrados
  function carregarDados() {
    try {
      const dados = JSON.parse(
        localStorage.getItem(CHAVE) || "{}"
      );

      campos.forEach((id) => {
        const campo = document.getElementById(id);

        if (campo) {
          campo.value = dados[id] || "";
        }
      });
    } catch (erro) {
      if (mensagem) {
        mensagem.textContent =
          "Não foi possível carregar os dados salvos.";
      }

      console.error(
        "Erro ao carregar estabelecimento:",
        erro
      );
    }
  }

  // Salva os dados e abre o painel do lojista
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const dados = {};

    campos.forEach((id) => {
      const campo = document.getElementById(id);

      dados[id] = campo ? campo.value.trim() : "";
    });

    // Verifica os campos obrigatórios
    if (
      !dados.nomeEstabelecimento ||
      !dados.responsavelEstabelecimento
    ) {
      mensagem.textContent =
        "Preencha o nome do estabelecimento e o responsável.";
      return;
    }

    try {
      // Salva as informações no navegador
      localStorage.setItem(
        CHAVE,
        JSON.stringify(dados)
      );

      // Confirma o salvamento
      mensagem.textContent =
        "Dados salvos com sucesso!";

      // Redireciona para o painel do lojista
      window.location.href = "painel-lojista.html";

    } catch (erro) {
      mensagem.textContent =
        "Não foi possível salvar. Verifique o armazenamento do navegador.";

      console.error(
        "Erro ao salvar estabelecimento:",
        erro
      );
    }
  });

  // Inicialização
  carregarDados();
});
