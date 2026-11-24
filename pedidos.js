/* ============================================================
   DR. TROCO — PEDIDOS ONLINE (DELIVERY)
   Arquivo: pedidos.js
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

  function normalizarTelefone(t) { return String(t || '').replace(/\D/g, ''); }

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
      dataChave: `${ano}-${mes}-${dia}`, dataFormatada: `${dia}/${mes}/${ano}`,
      horaFormatada: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
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
  // BUSCA ROBUSTA DO ID DA LOJA
  // ==========================================================
  async function buscarComercioId() {
    if (comercioIdAtual) return comercioIdAtual;
    
    try {
      // 1. Tenta pela API oficial
      if (window.EstoqueSupabase?.obterComercioId) {
        comercioIdAtual = await window.EstoqueSupabase.obterComercioId();
      }
      
      // 2. Tenta pelo LocalStorage
      if (!comercioIdAtual) {
        comercioIdAtual = localStorage.getItem('drTroco_comercio_id') || localStorage.getItem('comercio_id');
      }

      // 3. Tenta pelo Auth
      if (!comercioIdAtual && window.supabaseClient) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user) {
          const { data } = await window.supabaseClient.from('comercios').select('id').eq('criado_por', user.id).maybeSingle();
          if (data) comercioIdAtual = data.id;
        }
      }
    } catch(e) {
      console.warn('Erro ao buscar ID', e);
    }
    
    return comercioIdAtual;
  }

  // ==========================================================
  // WHATSAPP — MENSAGENS COMPLETAS
  // ==========================================================
  function notificarWhatsApp(id, status) {
    const pedido = pedidosOnline.find(p => String(p.id) === String(id));
    if (!pedido) return;

    const tel = normalizarTelefone(pedido.cliente_telefone);
    if (!tel || tel.length < 10) return;

    const nome = pedido.cliente_nome ? pedido.cliente_nome.split(' ')[0] : 'Cliente';
    const total = formatarDinheiro(pedido.total);
    const idCurto = String(id).slice(0, 4);

    let texto = '';
    if (status === 'preparando') {
      texto = `Olá ${nome}! 👋\n\nSeu pedido *#${idCurto}* foi *ACEITO* e já está sendo preparado com muito carinho. 🧑‍🍳\n\n💰 Valor total: ${total}\n\nAvisaremos aqui assim que sair para entrega!`;
    } else if (status === 'em_rota') {
      texto = `Olá ${nome}! 🛵\n\nSeu pedido *#${idCurto}* acabou de *SAIR PARA ENTREGA*.\n\n📍 Endereço de entrega:\n${pedido.endereco_entrega || 'Não informado'}\n\nFique atento ao telefone e aguarde o entregador!`;
    } else if (status === 'fechada') {
      texto = `Olá ${nome}! ✅\n\nSeu pedido *#${idCurto}* foi entregue com sucesso.\n\nEsperamos que esteja tudo delicioso! 🍔🥤\nObrigado pela preferência e volte sempre!`;
    } else if (status === 'cancelado') {
      texto = `Olá ${nome}, 😔\n\nInfelizmente o seu pedido *#${idCurto}* não pôde ser atendido neste momento.\n\nPor favor, entre em contato com a loja para mais informações ou para verificar o reembolso.`;
    }

    if (!texto) return;
    window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(texto)}`, '_blank');
  }

  window.abrirWhatsCliente = function (id) {
    const pedido = pedidosOnline.find(p => String(p.id) === String(id));
    if (!pedido) return;
    const tel = normalizarTelefone(pedido.cliente_telefone);
    if (!tel) return alert('Este pedido não tem WhatsApp cadastrado.');
    window.open(`https://wa.me/55${tel}`, '_blank');
  };

  // ==========================================================
  // MODAL DE DETALHES
  // ==========================================================
  window.abrirDetalhes = function (id) {
    const p = pedidosOnline.find(x => String(x.id) === String(id));
    if (!p) return;

    document.getElementById('detalhesTitulo').textContent = `Pedido #${String(p.id).slice(0, 4)}`;
    
    const itens = (p.itens || []).map(it => {
      const qtd = it.quantidade || 1;
      const unit = (it.valorUnitarioCentavos || 0) / 100;
      return `<div class="pedido-item-linha"><span>${qtd}x ${escaparHTML(it.nome)}</span><strong>${formatarDinheiro(qtd * unit)}</strong></div>`;
    }).join('');

    const taxa = Number(p.taxa_entrega || 0);
    
    let html = `
      <div class="detalhe-secao">
        <div class="detalhe-titulo">👤 Cliente</div>
        <div class="detalhe-conteudo">
          <strong>${escaparHTML(p.cliente_nome || 'Não informado')}</strong><br>
          📱 ${escaparHTML(p.cliente_telefone || 'Não informado')}
        </div>
      </div>
    `;

    if (p.endereco_entrega) {
      html += `
        <div class="detalhe-secao">
          <div class="detalhe-titulo">📍 Endereço de Entrega</div>
          <div class="detalhe-conteudo endereco">${escaparHTML(p.endereco_entrega)}</div>
        </div>
      `;
    }

    if (p.observacao) {
      html += `
        <div class="detalhe-secao">
          <div class="detalhe-titulo">📝 Observações</div>
          <div class="detalhe-conteudo obs">${escaparHTML(p.observacao)}</div>
        </div>
      `;
    }

    html += `
      <div class="detalhe-secao">
        <div class="detalhe-titulo">🛒 Itens do Pedido</div>
        <div class="detalhe-conteudo">
          ${itens}
          ${taxa > 0 ? `<div class="pedido-item-linha" style="border-top:1px dashed #e2e8f0;margin-top:8px;padding-top:8px;"><span>🛵 Taxa de Entrega</span><strong>${formatarDinheiro(taxa)}</strong></div>` : ''}
          <div class="pedido-item-linha" style="border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;font-size:15px;font-weight:900;">
            <span>Total</span><span>${formatarDinheiro(p.total)}</span>
          </div>
          <div style="margin-top:10px;font-size:12px;color:#64748b;text-align:center;font-weight:800;">
            Pagamento: ${escaparHTML(p.forma_pagamento || 'Não informado').toUpperCase()}
          </div>
        </div>
      </div>
    `;

    document.getElementById('detalhesConteudo').innerHTML = html;
    document.getElementById('modalDetalhes').classList.add('aberto');
  };

  window.fecharDetalhes = function () {
    document.getElementById('modalDetalhes').classList.remove('aberto');
  };

  // ==========================================================
  // BUSCAR PEDIDOS
  // ==========================================================
  async function carregarPedidos() {
    if (!window.supabaseClient) return;

    try {
      await buscarComercioId();
      
      if (!comercioIdAtual) {
        if ($('listaPedidos')) {
          $('listaPedidos').innerHTML = '<div class="vazio"><h3>Loja não identificada</h3><p>Faça login novamente.</p></div>';
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

      const idsAntigos = pedidosOnline.map(p => p.id);
      const temNovo = (data || []).some(p => !idsAntigos.includes(p.id) && p.status === 'aberta');
      if (temNovo && pedidosOnline.length > 0) tocarCampainha();

      pedidosOnline = data || [];
      renderizarPedidos();
    } catch (e) {
      console.warn('[Pedidos] Erro ao buscar:', e);
      if ($('listaPedidos')) {
        $('listaPedidos').innerHTML = '<div class="vazio"><h3>Erro ao carregar</h3><p>Verifique sua conexão.</p></div>';
      }
    }
  }

  // ==========================================================
  // RENDERIZAR
  // ==========================================================
  function renderizarPedidos() {
    const lista = $('listaPedidos');
    if (!lista) return;

    let filtrados = [];
    if (filtroAtual === 'aguardando')   filtrados = pedidosOnline.filter(p => p.status === 'aberta');
    else if (filtroAtual === 'preparando') filtrados = pedidosOnline.filter(p => p.status === 'preparando');
    else if (filtroAtual === 'rota')    filtrados = pedidosOnline.filter(p => p.status === 'em_rota');
    else if (filtroAtual === 'concluidos') filtrados = pedidosOnline.filter(p => p.status === 'fechada');
    else filtrados = pedidosOnline;

    if (!filtrados.length) {
      lista.innerHTML = `<div class="vazio"><h3>Nenhum pedido aqui</h3><p>Os pedidos com status "${filtroAtual}" aparecerão aqui.</p></div>`;
      return;
    }

    lista.innerHTML = filtrados.map(p => {
      const temWhats = !!normalizarTelefone(p.cliente_telefone);
      const btnWhats = temWhats ? `<button class="btn-acao" style="background:#25d366;color:#fff;" onclick="abrirWhatsCliente('${p.id}')">💬 WhatsApp</button>` : '';

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

      const itensArray = p.itens || [];
      const itensResumo = itensArray.slice(0, 2).map(it => {
        return `<div class="pedido-item-linha"><span>${it.quantidade || 1}x ${escaparHTML(it.nome)}</span></div>`;
      }).join('');
      const maisItens = itensArray.length > 2 ? `<div style="font-size:11px;color:#64748b;margin-top:4px;text-align:center;">+ ${itensArray.length - 2} itens...</div>` : '';

      const tagObs = p.observacao ? `<div class="pedido-obs">📝 ${escaparHTML(p.observacao)}</div>` : '';

      return `
        <div class="card-pedido status-${p.status}">
          <div class="pedido-topo">
            <span class="pedido-id">Pedido #${String(p.id).slice(0, 4)}</span>
            <span class="pedido-total">${formatarDinheiro(p.total)}</span>
          </div>
          <div class="pedido-cliente">👤 ${escaparHTML(p.cliente_nome || 'Cliente')}</div>
          <div class="pedido-info">
            <span>💳 ${escaparHTML(p.forma_pagamento || 'Pix')}</span>
          </div>
          
          <button class="btn-detalhes" onclick="abrirDetalhes('${p.id}')">🔍 Ver Detalhes / Endereço</button>
          
          ${tagObs}

          <div class="pedido-itens">
            ${itensResumo}
            ${maisItens}
          </div>

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
        await window.supabaseClient.from('comandas_abertas').update({ status: 'cancelado', atualizado_em: new Date().toISOString() }).eq('id', id);
      } else {
        const { error } = await window.supabaseClient.from('comandas_abertas').update({ status: novoStatus, atualizado_em: new Date().toISOString() }).eq('id', id);
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
    if (!confirm(`Finalizar pedido de ${pedido.cliente_nome}?\n\nIsso dará baixa no estoque e salvará no Histórico.`)) return;

    try {
      const { error } = await window.supabaseClient.from('comandas_abertas').update({ status: 'fechada', atualizado_em: new Date().toISOString() }).eq('id', id);
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
  // BAIXA DE ESTOQUE E HISTÓRICO
  // ==========================================================
  async function darBaixaNoEstoque(pedido) {
    const itens = pedido.itens || [];
    if (!itens.length) return;

    const agregados = new Map();
    itens.forEach(item => {
      if (!item.id) return;
      agregados.set(String(item.id), (agregados.get(String(item.id)) || 0) + (Number(item.quantidade) || 1));
    });

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

    if (window.supabaseClient && comercioIdAtual) {
      try {
        const ids = [...agregados.keys()];
        const { data: remotos, error } = await window.supabaseClient.from('estoque_produtos').select('id, quantidade').eq('comercio_id', comercioIdAtual).in('id', ids);
        if (error) throw error;

        for (const prod of remotos || []) {
          const qtdBaixa = agregados.get(String(prod.id)) || 0;
          if (!qtdBaixa) continue;
          const novaQtd = Math.max(0, Number(prod.quantidade) - qtdBaixa);
          await window.supabaseClient.from('estoque_produtos').update({ quantidade: novaQtd }).eq('id', prod.id).eq('comercio_id', comercioIdAtual);
        }
      } catch (e) {
        console.warn('[Pedidos] Erro baixa nuvem:', e);
      }
    }
  }

  function salvarNoHistorico(pedido) {
    const momento = obterDataHoraOperacional();
    const totalReais = Number(pedido.total) || 0;
    const produtosVenda = (pedido.itens || []).map(it => {
      const qtd = it.quantidade || 1;
      const preco = (it.valorUnitarioCentavos || 0) / 100;
      return { id: it.id, nome: it.nome, quantidade: qtd, preco: preco, custoUnitario: 0, subtotalCusto: 0, lucroItem: preco * qtd, margemPct: 100 };
    });

    const registro = {
      id: gerarId(), tipo: 'venda', categoria: 'venda', origem: 'delivery',
      clienteNome: pedido.cliente_nome, descricao: `Delivery - ${pedido.cliente_nome}`,
      total: totalReais, valor: totalReais, formaPagamento: pedido.forma_pagamento || 'pix',
      produtos: produtosVenda, data: momento.dataFormatada, dataChave: momento.dataChave, dataISO: momento.dataChave, hora: momento.horaFormatada
    };

    try {
      const atual = JSON.parse(localStorage.getItem('drTroco_vendas') || '[]');
      atual.unshift(registro);
      localStorage.setItem('drTroco_vendas', JSON.stringify(atual));
    } catch (e) {}

    if (window.DrTrocoDados?.salvarVenda) window.DrTrocoDados.salvarVenda(registro).catch(e => console.warn(e));
  }

  // ==========================================================
  // DIVULGAÇÃO DO CARDÁPIO (CORRIGIDO)
  // ==========================================================
  async function montarLinkCardapio() {
    try {
      await buscarComercioId(); // Garante que temos o ID

      if (!comercioIdAtual || comercioIdAtual === 'undefined' || comercioIdAtual === 'null') {
        console.warn('ID do comércio não encontrado para gerar link.');
        return null;
      }

      let path = window.location.pathname;
      if (path.includes('pedidos.html')) {
        path = path.replace('pedidos.html', 'cardapio.html');
      } else {
        path = path.substring(0, path.lastIndexOf('/')) + '/cardapio.html';
      }
      
      linkCardapioLoja = window.location.origin + path + '?loja=' + comercioIdAtual;
      return linkCardapioLoja;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  window.copiarLinkCardapio = async function () {
    const link = await montarLinkCardapio();
    if (!link) return alert('Erro: Não foi possível identificar a sua loja. Faça login novamente.');
    
    try {
      await navigator.clipboard.writeText(link);
      alert('Link copiado com sucesso!\n\n' + link);
    } catch (e) {
      prompt('Copie o link abaixo:', link);
    }
  };

  window.baixarQrCardapio = async function () {
    const link = await montarLinkCardapio();
    if (!link) return alert('Erro: Não foi possível identificar a sua loja. Faça login novamente.');
    
    if (typeof window.qrcode !== 'function') return alert('Erro: Biblioteca de QR Code não carregada.');
    
    const qr = window.qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const linkEl = document.createElement('a');
    linkEl.href = qr.createDataURL(8, 0);
    linkEl.download = 'cardapio-qrcode.png';
    document.body.appendChild(linkEl);
    linkEl.click();
    document.body.removeChild(linkEl);
  };

  // ==========================================================
  // INICIALIZAÇÃO E REALTIME
  // ==========================================================
  function iniciarRealtime() {
    if (!window.supabaseClient || !comercioIdAtual) return;
    if (realtimeChannel) { try { window.supabaseClient.removeChannel(realtimeChannel); } catch (e) {} }
    realtimeChannel = window.supabaseClient.channel('pedidos-realtime-' + comercioIdAtual)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas_abertas', filter: `comercio_id=eq.${comercioIdAtual}` }, () => carregarPedidos())
      .subscribe();
  }

  async function inicializar() {
    document.querySelectorAll('.aba-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('ativo'));
        btn.classList.add('ativo');
        filtroAtual = btn.getAttribute('data-filtro') || 'aguardando';
        renderizarPedidos();
      });
    });

    await montarLinkCardapio(); // Pega o ID logo de cara
    carregarPedidos();
    setTimeout(iniciarRealtime, 1500);
    setInterval(carregarPedidos, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializar);
  else inicializar();
})();
