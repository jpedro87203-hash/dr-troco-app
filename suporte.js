/* =========================================================
   DR. TROCO — BOTÃO DE SUPORTE FLUTUANTE (VERSÃO SUPABASE)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoSuporteInicializado) return;
  window.__drTrocoSuporteInicializado = true;

  // ⚠️ CONFIGURE AQUI OS SEUS DADOS DE ATENDIMENTO
  const WHATSAPP_SUPORTE = "5598999999999"; // Coloque o DDI + DDD + Número (ex: 55 para Brasil)
  const EMAIL_SUPORTE = "suporte@drtroco.com"; // Coloque o seu e-mail real

  // ==========================================
  // 1. CRIAR ESTILOS DO BOTÃO E DO MODAL
  // ==========================================
  const style = document.createElement('style');
  style.innerHTML = `
    #btn-suporte-flutuante {
      position: fixed;
      bottom: 85px; /* Fica acima do menu inferior */
      left: 15px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #2563eb; /* Azul de suporte */
      color: #fff;
      font-size: 22px;
      border: 0;
      box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3);
      cursor: pointer;
      z-index: 99998;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }
    #btn-suporte-flutuante:active { transform: scale(0.9); }

    .modal-suporte-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-suporte-overlay.aberto { display: flex; }

    .modal-suporte-box {
      background: #fff;
      width: 100%;
      max-width: 400px;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.2);
      text-align: center;
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .modal-suporte-box h2 {
      margin: 0 0 8px;
      color: #1f3028;
      font-size: 20px;
    }
    .modal-suporte-box p {
      margin: 0 0 20px;
      color: #7b898f;
      font-size: 13px;
      line-height: 1.5;
    }

    .btn-suporte-opcao {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px;
      margin-bottom: 12px;
      border: 1px solid #e1e9e5;
      border-radius: 12px;
      background: #f8faf9;
      color: #263640;
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-suporte-opcao:hover { background: #eaf8f1; border-color: #20a767; }
    .btn-suporte-opcao.wa { color: #25D366; border-color: #25D366; background: #f0fdf4; }
    .btn-suporte-opcao.em { color: #2563eb; border-color: #2563eb; background: #eff6ff; }
    .btn-suporte-opcao span.icone { font-size: 24px; }

    .btn-fechar-suporte {
      width: 100%;
      padding: 12px;
      margin-top: 8px;
      border: 0;
      border-radius: 12px;
      background: #f1f5f9;
      color: #64748b;
      font-weight: 700;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // ==========================================
  // 2. CRIAR O BOTÃO FLUTUANTE E O MODAL
  // ==========================================
  function criarElementos() {
    if (document.getElementById('btn-suporte-flutuante')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-suporte-flutuante';
    btn.innerHTML = '💬';
    btn.setAttribute('aria-label', 'Ajuda e Suporte');
    
    const modal = document.createElement('div');
    modal.id = 'modalSuporte';
    modal.className = 'modal-suporte-overlay';
    modal.innerHTML = `
      <div class="modal-suporte-box">
        <div style="font-size: 40px; margin-bottom: 10px;">🤝</div>
        <h2>Precisa de ajuda?</h2>
        <p id="textoSuporte">Buscando seus dados...</p>
        
        <a href="#" id="linkSupWhatsApp" class="btn-suporte-opcao wa" style="display:none;">
          <span class="icone">🟢</span> Falar no WhatsApp
        </a>
        
        <a href="#" id="linkSupEmail" class="btn-suporte-opcao em" style="display:none;">
          <span class="icone">✉️</span> Enviar um E-mail
        </a>
        
        <button type="button" class="btn-fechar-suporte" id="btnFecharSup">Fechar</button>
      </div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(modal);

    btn.addEventListener('click', abrirModal);
    document.getElementById('btnFecharSup').addEventListener('click', fecharModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharModal(); });
  }

  // ==========================================
  // 3. BUSCAR DADOS NO SUPABASE (COM FALLBACK)
  // ==========================================
  async function obterDadosLoja() {
    let dados = {
      nome: "Não informado",
      responsavel: "Não informado",
      telefone: "Não informado",
      endereco: "Não informado",
      cidade: "Não informado",
      estado: "Não informado"
    };

    // Tenta buscar do Supabase primeiro
    try {
      const client = window.supabaseClient;
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session?.user) {
          const { data: membro } = await client.from('membros_comercio')
            .select('comercio_id')
            .eq('usuario_id', session.user.id)
            .eq('ativo', true)
            .single();

          if (membro?.comercio_id) {
            const [comercioRes, detalhesRes] = await Promise.all([
              client.from('comercios').select('nome').eq('id', membro.comercio_id).single(),
              client.from('dados_estabelecimento').select('*').eq('comercio_id', membro.comercio_id).maybeSingle()
            ]);

            if (comercioRes.data) dados.nome = comercioRes.data.nome || dados.nome;
            if (detalhesRes.data) {
              dados.responsavel = detalhesRes.data.responsavel || dados.responsavel;
              dados.telefone = detalhesRes.data.telefone || dados.telefone;
              dados.endereco = detalhesRes.data.endereco || dados.endereco;
              dados.cidade = detalhesRes.data.cidade || dados.cidade;
              dados.estado = detalhesRes.data.estado || dados.estado;
            }
            return dados; // Retorna os dados do Supabase com sucesso
          }
        }
      }
    } catch (e) {
      console.warn("Falha ao buscar dados no Supabase, usando cache local.", e);
    }

    // Fallback: Se falhar (offline) ou não achar, tenta o localStorage
    try {
      const est = JSON.parse(localStorage.getItem('drTroco_estabelecimento') || '{}');
      if (est.nomeEstabelecimento) dados.nome = est.nomeEstabelecimento;
      if (est.responsavelEstabelecimento) dados.responsavel = est.responsavelEstabelecimento;
      if (est.telefoneEstabelecimento) dados.telefone = est.telefoneEstabelecimento;
      if (est.enderecoEstabelecimento) dados.endereco = est.enderecoEstabelecimento;
      if (est.cidadeEstabelecimento) dados.cidade = est.cidadeEstabelecimento;
      if (est.estadoEstabelecimento) dados.estado = est.estadoEstabelecimento;
    } catch (e) {}

    return dados;
  }

  // ==========================================
  // 4. MONTAR A MENSAGEM E ABRIR O MODAL
  // ==========================================
  async function abrirModal() {
    const textoEl = document.getElementById('textoSuporte');
    const btnWa = document.getElementById('linkSupWhatsApp');
    const btnEm = document.getElementById('linkSupEmail');
    
    // Reseta o modal
    document.getElementById('modalSuporte').classList.add('aberto');
    textoEl.textContent = "Buscando seus dados...";
    btnWa.style.display = 'none';
    btnEm.style.display = 'none';

    // Busca os dados
    const dados = await obterDadosLoja();

    // Monta a mensagem
    const texto = `Olá, equipe Dr. Troco! Preciso de suporte.\n\n` +
                  `🏪 *Dados da Loja:*\n` +
                  `*Nome:* ${dados.nome}\n` +
                  `*Responsável:* ${dados.responsavel}\n` +
                  `*Telefone:* ${dados.telefone}\n` +
                  `*Endereço:* ${dados.endereco}, ${dados.cidade} - ${dados.estado}\n\n` +
                  `Como vocês podem me ajudar?`;

    const textoCodificado = encodeURIComponent(texto);
    const assuntoCodificado = encodeURIComponent(`Suporte Dr. Troco - ${dados.nome}`);

    // Atualiza os links
    btnWa.href = `https://wa.me/${WHATSAPP_SUPORTE}?text=${textoCodificado}`;
    btnEm.href = `mailto:${EMAIL_SUPORTE}?subject=${assuntoCodificado}&body=${textoCodificado}`;

    // Exibe os botões
    textoEl.textContent = "Nossa equipe está pronta para te atender. Escolha como deseja falar com o suporte:";
    btnWa.style.display = 'flex';
    btnEm.style.display = 'flex';
  }

  function fecharModal() {
    document.getElementById('modalSuporte').classList.remove('aberto');
  }

  // ==========================================
  // 5. INICIALIZAR
  // ==========================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', criarElementos);
  } else {
    criarElementos();
  }
})();
