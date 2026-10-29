
(() => {
  // Oculta o aplicativo enquanto verifica o login.
  document.documentElement.style.visibility = "hidden";

  const ID_ADMINISTRADOR = "f650eab5-f9e1-467f-a55f-15826c6f092a";

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

      document.documentElement.style.visibility = "visible";
    } catch (erro) {
      console.error("Erro ao verificar login:", erro);
      window.location.replace("login.html");
    }
  }

  verificarLogin();
})();
