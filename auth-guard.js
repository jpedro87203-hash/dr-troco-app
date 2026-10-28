
(() => {
  // Oculta o aplicativo enquanto verifica o login.
  document.documentElement.style.visibility = "hidden";

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

      document.documentElement.style.visibility = "visible";
    } catch (erro) {
      console.error("Erro ao verificar login:", erro);
      window.location.replace("login.html");
    }
  }

  verificarLogin();
})();
