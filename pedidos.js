/* ============================================================
   DR. TROCO — PEDIDOS ONLINE (DELIVERY)
   Arquivo: pedidos.js  —  versão atualizada
============================================================ */
'use strict';

(() => {
  let pedidosOnline = [];
  let filtroAtual = 'aguardando';
  let linkCardapioLoja = '';
  let comercioIdAtual = null;
  let realtimeChannel = null;

  const $ = id => document.getElementById(id);

  // ==========================================================
  // FUNÇÕES BÁSICAS
  // ==========================================================
  function formatarDinheiro(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escaparHTML(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function normalizarTelefone(t) {
    return String(t || '').replace(/\D/g, '');
  }

  function gerarId() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function obterDataHoraOperacional() {
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    return {
      dataChave: `${ano}-${mes}-${dia}`,
      dataFormatada: `${dia}/${mes}/${ano}`,
      horaFormatada: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`,
      horaCompleta: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`
    };
  }

  function tocarCampainha() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(); osc.stop(ctx.currentTime + 0.5);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) {}
  }

  // ==========================================================
  // WHATSAPP — NOTIFICAÇÃO AUTOMÁTICA AO CLIENTE
  // ==========================================================
  function notificarWhatsApp(id, status) {
    const pedido = pedidosOnline.find(p => String(p.id) === String(id));
    if (!pedido) return;

    const tel = normalizarTelefone(pedido.cliente_telefone);
    if (!tel || tel.length < 10) return;

    const mensagens = {
      preparando: `👨‍🍳 Seu pedido #${String(id).slice(0, 4)} foi ACEITO e já está sendo preparado!`,
      em_rota: `🛵 Seu pedido #${String(id).slice(0, 4)} SAIU PARA ENTREGA! Já está a caminho.`,
      fechada: `✅ Pedido #${String(id).slice(0, 4)} finalizado. Obrigado pela preferência!`,
      cancelado: `❌ Infelizmente seu pedido #${String(id).slice(0, 4)} não pôde ser atendido. Entre em contato com a loja.`
    };

    const texto = mensagens[status];
    if (!texto) return;

    const msg = encodeURIComponent(texto);
    window.open(`https://wa.me/55${tel}?text=${msg}`, '_blank');
  }

  window.abrirWhatsCliente = function (id) {
    const pedido = pedidosOnline.find(p => String(p.id) === String(id));
    if (!pedido) return;
    const tel = normalizarTelefone(pedido.cliente_telefone);
    if (!tel) return alert('Este pedido não tem WhatsApp cadastrado.');
    const msg = encodeURIComponent(
      `Olá ${pedido.cliente_nome || ''}! Sobre seu pedido #${String(id).slice(0, 4)}...`
    );
    window.open(`https://wa.me/55${tel}?text=${msg}`, '_blank');
  };

  // ==========================================================
  // BUSCAR PEDIDOS NO SUPABASE
  // ==========================================================
  async function carregarPedidos() {
    if (!window.supabaseClient) return;

    try {
      if (window.EstoqueSupabase?.obterComercioId) {
        comercioIdAtual = await window.EstoqueSupabase.obterComercioId();
      }

      if (!comercioIdAtual) {
        if ($('listaPedidos')) {
          $('listaPedidos').innerHTML =
            '<div class="vazio"><h3>Loja não identificada</h3><p>Faça login novamente.</p></div>';
        }
        return;
      }

      const { data, error } = await window.supabaseClient
        .from('comandas_abertas')
        .select('*')
        .eq('origem', 'cardapio')
        .eq('comercio_id', comercioIdAtual)
        .neq('status', 'cancelado')
        .order('atualizado_em', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Campainha se chegou pedido novo
      const idsAntigos = pedidosOnline.map(p => p.id);
      const temNovo = (data || []).some(p => !idsAntigos.includes(p.id) && p.status === 'aberta');
      if (temNovo && pedidosOnline.length > 0) tocarCampainha();

      pedidosOnline = data || [];
      renderizarPedidos();
    } catch (e) {
      console.warn('[Pedidos] Erro ao buscar:', e);
      if ($('listaPedidos')) {
        $('listaPedidos').innerHTML =
          '<div class="vazio"><h3>Erro ao carregar</h3><p>Verifique sua conexão.</p></div>';
      }
    }
  }

  // ==========================================================
  // RENDERIZAR NA TELA
  // ==========================================================
  function renderizarPedidos() {
    const lista = $('listaPedidos');
    if (!lista) return;

    let filtrados = [];
    if (filtroAtual === 'aguardando')   filtrados = pedidosOnline.filter(p => p.status === 'aberta');
    else if (filtroAtual === 'preparando') filtrados = pedidosOnline.filter(p => p.status === 'preparando');
    else if (filtroAtual === 'rota')    filtrados = pedidosOnline.filter(p => p.status === 'em_rota');
    else if (filtroAtual === 'concluidos') filtrados = pedidosOnline.filter(p => p.status === 'fechada');
    else filtrados = pedidosOnline; // "todos"

    if (!filtrados.length) {
      lista.innerHTML = `<div class="vazio"><h3>Nenhum pedido aqui</h3><p>Os pedidos com status "${filtroAtual}" aparecerão aqui.</p></div>`;
      return;
    }

    lista.innerHTML = filtrados.map(p => {
      const itensHtml = (p.itens || []).map(it => {
        const qtd = it.quantidade || 1;
        const unit = (it.valorUnitarioCentavos || 0) / 100;
        return `<div class="pedido-item-linha"><span>${qtd}x ${escaparHTML(it.nome)}</span><strong>${formatarDinheiro(qtd * unit)}</strong></div>`;
      }).join('');

      const taxa = Number(p.taxa_entrega || 0);
      const taxaHtml = taxa > 0
        ? `<div class="pedido-item-linha" style="border-top:1px dashed #e2e8f0;margin-top:6px;padding-top:6px;color:#64748b;"><span>🛵 Taxa de entrega</span><strong>${formatarDinheiro(taxa)}</strong></div>`
        : '';

      const temWhats = !!normalizarTelefone(p.cliente_telefone);
      const btnWhats = temWhats
        ? `<button class="btn-acao" style="background:#25d366;color:#fff;" onclick="abrirWhatsCliente('${p.id}')">💬 WhatsApp</button>`
        : '';

      let botoes = '';
      if (p.status === 'aberta') {
        botoes = `
          <button class="btn-acao btn-recusar" onclick="alterarStatusPedido('${p.id}', 'cancelado')">❌ Recusar</button>
          <button class="btn-acao btn-aceitar" onclick="alterarStatusPedido('${p.id}', 'preparando')">👨‍🍳 Aceitar</button>
        `;
      } else if (p.status === 'preparando') {
        botoes = `
          ${btnWhats}
          <button class="btn-acao btn-rota" onclick="alterarStatusPedido('${p.id}', 'em_rota')">🛵 Saiu p/ Entrega</button>
        `;
      } else if (p.status === 'em_rota') {
        botoes = `
          ${btnWhats}
          <button class="btn-acao btn-finalizar" onclick="finalizarPedido('${p.id}')">✅ Finalizar</button>
        `;
      } else if (p.status === 'fechada') {
        botoes = `
          ${btnWhats}
          <button class="btn-acao" style="background:#f1f5f9;color:#475569;" onclick="alterarStatusPedido('${p.id}', 'arquivar')">🗄️ Arquivar</button>
        `;
      }

      return `
        <div class="card-pedido status-${p.status}">
          <div class="pedido-topo">
            <span class="pedido-id">Pedido #${String(p.id).slice(0, 4)}</span>
            <span class="pedido-total">${formatarDinheiro(p.total)}</span>
          </div>
          <div class="pedido-cliente">👤 ${escaparHTML(p.cliente_nome || 'Cliente')}</div>
          <div class="pedido-info">
            <span>💳 ${escaparHTML(p.forma_pagamento || 'Pix')}</span>
            ${temWhats ? `<span>📱 ${escaparHTML(p.cliente_telefone)}</span>` : ''}
          </div>
          ${p.observacao ? `<div class="pedido-obs">📝 ${escaparHTML(p.observacao)}</div>` : ''}

          <div class="pedido-itens">${itensHtml}${taxaHtml}</div>

          <div class="pedido-acoes">${botoes}</div>
        </div>
      `;
    }).join('');
  }

  // ==========================================================
  // AÇÕES DOS PEDIDOS
  // ==========================================================
  window.alterarStatusPedido = async function (id, novoStatus) {
    try {
      if (novoStatus === 'cancelado') {
        if (!confirm('Tem certeza que deseja recusar este pedido?')) return;
        notificarWhatsApp(id, 'cancelado');
        await window.supabaseClient.from('comandas_abertas').delete().eq('id', id);
        alert('Pedido recusado e removido.');
      } else if (novoStatus === 'arquivar') {
        await window.supabaseClient
          .from('comandas_abertas')
          .update({ status: 'cancelado', atualizado_em: new Date().toISOString() })
          .eq('id', id);
      } else {
        const { error } = await window.supabaseClient
          .from('comandas_abertas')
          .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        notificarWhatsApp(id, novoStatus);
      }
      carregarPedidos();
    } catch (e) {
      alert('Erro ao atualizar o pedido: ' + e.message);
    }
  };

  window.finalizarPedido = async function (id) {
    const pedido = pedidosOnline.find(p => String(p.id) === String(id));
    if (!pedido) return;

    if (!confirm(`Finalizar pedido de ${pedido.cliente_nome}?\n\nIsso dará baixa no estoque e salvará no Histórico de Vendas.`)) return;

    try {
      const { error } = await window.supabaseClient
        .from('comandas_abertas')
        .update({ status: 'fechada', atualizado_em: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      await darBaixaNoEstoque(pedido);
      salvarNoHistorico(pedido);
      notificarWhatsApp(id, 'fechada');

      alert('Pedido finalizado com sucesso!');
      carregarPedidos();
    } catch (e) {
      alert('Erro ao finalizar: ' + e.message);
    }
  };

  // ==========================================================
  // BAIXA DE ESTOQUE (LOCAL + SUPABASE DIRETO)
  // ==========================================================
  async function darBaixaNoEstoque(pedido) {
    const itens = pedido.itens || [];
    if (!itens.length) return;

    const agregados = new Map();
    itens.forEach(item => {
      if (!item.id) return;
      agregados.set(String(item.id), (agregados.get(String(item.id)) || 0) + (Number(item.quantidade) || 1));
    });

    // --- Baixa local (compatibilidade) ---
    let chaveEstoque = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('drTroco_estoque_') && !k.includes('_backup_')) { chaveEstoque = k; break; }
    }
    if (chaveEstoque) {
      try {
        const lista = JSON.parse(localStorage.getItem(chaveEstoque) || '[]');
        agregados.forEach((qtd, pid) => {
          const prod = lista.find(p => String(p.id) === pid);
          if (prod) prod.quantidade = Math.max(0, Number(prod.quantidade) - qtd);
        });
        localStorage.setItem(chaveEstoque, JSON.stringify(lista));
      } catch (e) {}
    }

    // --- Baixa direta no Supabase (tabela estoque_produtos) ---
    if (window.supabaseClient && comercioIdAtual) {
      try {
        const ids = [...agregados.keys()];
        const { data: remotos, error } = await window.supabaseClient
          .from('estoque_produtos')
          .select('id, quantidade')
          .eq('comercio_id', comercioIdAtual)
          .in('id', ids);

        if (error) throw error;

        for (const prod of remotos || []) {
          const qtdBaixa = agregados.get(String(prod.id)) || 0;
          if (!qtdBaixa) continue;
          const novaQtd = Math.max(0, Number(prod.quantidade) - qtdBaixa);
          await window.supabaseClient
            .from('estoque_produtos')
            .update({ quantidade: novaQtd })
            .eq('id', prod.id)
            .eq('comercio_id', comercioIdAtual);
        }
      } catch (e) {
        console.warn('[Pedidos] Erro baixa nuvem:', e);
      }
    }
  }

  // ==========================================================
  // HISTÓRICO DE VENDAS
  // ==========================================================
  function salvarNoHistorico(pedido) {
    const momento = obterDataHoraOperacional();
    const totalReais = Number(pedido.total) || 0;

    const produtosVenda = (pedido.itens || []).map(it => {
      const qtd = it.quantidade || 1;
      const preco = (it.valorUnitarioCentavos || 0) / 100;
      return {
        id: it.id, nome: it.nome, quantidade: qtd, preco: preco,
        custoUnitario: 0, subtotalCusto: 0, lucroItem: preco * qtd, margemPct: 100
      };
    });

    const registro = {
      id: gerarId(),
      tipo: 'venda', categoria: 'venda', origem: 'delivery',
      clienteNome: pedido.cliente_nome,
      descricao: `Delivery - ${pedido.cliente_nome}`,
      total: totalReais, valor: totalReais,
      formaPagamento: pedido.forma_pagamento || 'pix',
      produtos: produtosVenda,
      data: momento.dataFormatada, dataChave: momento.dataChave, dataISO: momento.dataChave,
      hora: momento.horaFormatada
    };

    try {
      const atual = JSON.parse(localStorage.getItem('drTroco_vendas') || '[]');
      atual.unshift(registro);
      localStorage.setItem('drTroco_vendas', JSON.stringify(atual));
    } catch (e) {}

    if (window.DrTrocoDados?.salvarVenda) {
      window.DrTrocoDados.salvarVenda(registro).catch(e => console.warn(e));
    }
  }

  // ==========================================================
  // DIVULGAÇÃO DO CARDÁPIO (LINK E QR CODE)
  // ==========================================================
  async function montarLinkCardapio() {
    try {
      if (!comercioIdAtual && window.EstoqueSupabase?.obterComercioId) {
        comercioIdAtual = await window.EstoqueSupabase.obterComercioId();
      }
      if (!comercioIdAtual) {
        console.warn('ID do comércio não encontrado.');
        return;
      }

      let path = window.location.pathname;
      if (path.includes('pedidos.html')) path = path.replace('pedidos.html', 'cardapio.html');
      else path = '/cardapio.html';

      linkCardapioLoja = window.location.origin + path + '?loja=' + comercioIdAtual;
    } catch (e) {
      console.error(e);
    }
  }

  window.copiarLinkCardapio = async function () {
    if (!linkCardapioLoja) await montarLinkCardapio();
    if (!linkCardapioLoja) return alert('Erro ao gerar link. Verifique a conexão.');

    try {
      await navigator.clipboard.writeText(linkCardapioLoja);
      alert('Link copiado com sucesso!\n\nCole no WhatsApp ou Instagram.\n\n' + linkCardapioLoja);
    } catch (e) {
      prompt('Copie o link abaixo:', linkCardapioLoja);
    }
  };

  window.baixarQrCardapio = async function () {
    if (!linkCardapioLoja) await montarLinkCardapio();
    if (!linkCardapioLoja) return alert('Erro ao gerar link.');

    if (typeof window.qrcode !== 'function') {
      alert('Erro: Biblioteca de QR Code não carregada. Verifique sua internet.');
      return;
    }

    const qr = window.qrcode(0, 'M');
    qr.addData(linkCardapioLoja);
    qr.make();
    const qrDataUrl = qr.createDataURL(8, 0);

    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = 'cardapio-qrcode.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================================
  // REALTIME (SUPABASE)
  // ==========================================================
  function iniciarRealtime() {
    if (!window.supabaseClient || !comercioIdAtual) return;
    if (realtimeChannel) {
      try { window.supabaseClient.removeChannel(realtimeChannel); } catch (e) {}
    }
    realtimeChannel = window.supabaseClient
      .channel('pedidos-realtime-' + comercioIdAtual)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comandas_abertas', filter: `comercio_id=eq.${comercioIdAtual}` },
        () => carregarPedidos()
      )
      .subscribe();
  }

  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================
  function inicializar() {
    document.querySelectorAll('.aba-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('ativo'));
        btn.classList.add('ativo');
        filtroAtual = btn.getAttribute('data-filtro') || 'aguardando';
        renderizarPedidos();
      });
    });

    montarLinkCardapio();
    carregarPedidos();

    // Realtime (espera carregar o comercioId)
    setTimeout(iniciarRealtime, 1500);

    // Fallback por polling
    setInterval(carregarPedidos, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializar);
  else inicializar();
})();
