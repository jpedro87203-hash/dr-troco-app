
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

  function carregarDados() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE) || "{}");

      campos.forEach((id) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = dados[id] || "";
      });
    } catch (erro) {
      mensagem.textContent =
        "Não foi possível carregar os dados salvos.";
      console.error("Erro ao carregar estabelecimento:", erro);
    }
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();

    const dados = {};

    campos.forEach((id) => {
      const campo = document.getElementById(id);
      dados[id] = campo.value.trim();
    });

    if (!dados.nomeEstabelecimento || !dados.responsavelEstabelecimento) {
      mensagem.textContent =
        "Preencha o nome do estabelecimento e o responsável.";
      return;
    }

    try {
      localStorage.setItem(CHAVE, JSON.stringify(dados));
mensagem.textContent = "Dados salvos com sucesso!";

window.location.href = "painel-lojista.html";
    } catch (erro) {
      mensagem.textContent =
        "Não foi possível salvar. Verifique o armazenamento do navegador.";
      console.error("Erro ao salvar estabelecimento:", erro);
    }
  });

  carregarDados();
});
