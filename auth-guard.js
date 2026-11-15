(() => {
  document.documentElement.style.visibility = "hidden";
  const ID_ADMINISTRADOR = "f650eab5-f9e1-467f-a55f-15826c6f092a";
  const pagina = window.location.pathname.split("/").pop();
  const PAGINAS_LIVRES = ["licenca.html", "login.html"];

  function licencaValida(licenca) {
    if (!licenca || licenca.ativa !== true || !licenca.validade) return false;
    const [ano, mes, dia] = String(licenca.validade).split("-").map(Number);
    const vencimento = new Date(ano, mes - 1, dia, 23, 59, 59, 999);
    return !isNaN(vencimento.getTime()) && new Date() <= vencimento;
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
      document.documentElement.dataset.admin = String(ehAdministrador);

      const botaoLicencas = document.getElementById("botao-controle-licencas");
      if (botaoLicencas) botaoLicencas.hidden = !ehAdministrador;

      if (!ehAdministrador && !PAGINAS_LIVRES.includes(pagina)) {
        try {
          const resposta = await client.rpc("minha_licenca");
          
          if (resposta.error) throw new Error(resposta.error.message);

          const licenca = resposta.data && resposta.data.length ? resposta.data[0] : null;
          
          if (!licencaValida(licenca)) {
            window.location.replace("licenca.html");
            return;
          }
          
          // Salva a data do último check com sucesso para modo offline
          localStorage.setItem('drTroco_ultimoCheckLicenca', Date.now().toString());
          
        } catch (err) {
          console.warn("Falha ao verificar licença online:", err);
          
          // Fallback Offline: Permite acesso se checou nos últimos 1 dia
          const ultimoCheck = parseInt(localStorage.getItem('drTroco_ultimoCheckLicenca') || '0', 10);
          const umDia = 24 * 60 * 60 * 1000;
          
          if (Date.now() - ultimoCheck > umDia) {
            alert("Sem conexão com a internet. Não foi possível validar sua licença.");
            window.location.replace("licenca.html");
            return;
          }
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
