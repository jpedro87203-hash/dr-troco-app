(() => {
  // Oculta o aplicativo enquanto verifica o login.
  document.documentElement.style.visibility = "hidden";

  const ID_ADMINISTRADOR = "f650eab5-f9e1-467f-a55f-15826c6f092a";

  // Páginas que NÃO exigem licença ativa
  const pagina = window.location.pathname.split("/").pop();
  const PAGINAS_LIVRES = ["licenca.html", "login.html"];

  function licencaValida(licenca) {
    if (!licenca || licenca.ativa !== true || !licenca.validade) return false;
    const [ano, mes, dia] = String(licenca.validade).split("-").map(Number);
    const vencimento = new Date(ano, mes - 1, dia, 23, 59, 59, 999);
    if (isNaN(vencimento.getTime())) return false;
    return new Date() <= vencimento;
  }

  async function verificarLogin() {
    try {
      const client = window.supabaseClient;

      if (!client) {
        window.location.replace("login.html");
        return;
      }

      const { data, error } = await client.auth.getSession();

      if (error || !data.session) {
        window.location.replace("login.html");
        return;
      }

      const usuario = data.session.user;
      const ehAdministrador = usuario.id === ID_ADMINISTRADOR;

      // Registra o estado para uso na interface.
      document.documentElement.dataset.admin = String(ehAdministrador);

      // Exibe o botão somente para o administrador,
      // caso ele já exista na página.
      const botaoLicencas = document.getElementById(
        "botao-controle-licencas"
      );

      if (botaoLicencas) {
        botaoLicencas.hidden = !ehAdministrador;
      }

      // Verificação de licença (administrador e páginas livres passam)
      if (!ehAdministrador && !PAGINAS_LIVRES.includes(pagina)) {
        const resposta = await client.rpc("minha_licenca");

        if (!resposta.error) {
          const licenca =
            resposta.data && resposta.data.length ? resposta.data[0] : null;

          if (!licencaValida(licenca)) {
            window.location.replace("licenca.html");
            return;
          }
        } else {
          // Sem conexão ou erro temporário: não trava a venda do comércio
          console.error("Não foi possível verificar a licença:", resposta.error);
        }
      }

      document.documentElement.style.visibility = "visible";
    } catch (erro) {
      console.error("Erro ao verificar login:", erro);
      window.location.replace("login.html");
    }
  }

  verificarLogin();
})();
