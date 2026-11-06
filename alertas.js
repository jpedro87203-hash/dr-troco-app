/* =========================================================
   DR. TROCO — ALERTAS DO PAINEL
   Fontes:
     - contas_pagar (Supabase, via DrTrocoContas)
     - estoque_produtos (Supabase, via EstoqueSupabase)
     - fiado_clientes + fiado_movimentacoes (Supabase direto)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoAlertasInicializado) return;
  window.__drTrocoAlertasInicializado = true;

  const $ = (id) => document.getElementById(id);
  const area = $('alertasArea');
  if (!area) return;

  const estado = {
    carregando: false,
    usuario: null,
    alertas: {
      contas: { vencidas: [], vencendo: [], totalVencidas: 0, totalVencendo: 0 },
      estoque: { semEstoque: [], baixo: [] },
      validade: { vencidos: [], vencendo: [] },
      fiado: { antigos: [], totalDevido: 0 }
    }
  };

  /* ---------- Utilitários ---------- */

  function dataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function adicionarDias(iso, dias) {
    const [a, m, d] = iso.split('-').map(Number);
    const data = new Date(a, m - 1, d);
    data.setDate(data.getDate() + dias);
    return dataLocalISO(data);
  }

  function diferencaDias(isoA, isoB) {
    const [a1, m1, d1] = isoA.split('-').map(Number);
    const [a2, m2, d2] = isoB.split('-').map(Number);
    const a = new Date(a1, m1 - 1, d1);
    const b = new Date(a2, m2 - 1, d2);
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  }

  function formatarReal(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async function obterUsuario() {
    if (estado.usuario) return estado.usuario;
    const { data: { user }, error } = await window.supabaseClient.auth.getUser();
    if (error || !user) throw new Error('Usuário não autenticado.');
    estado.usuario = user;
    return user;
  }

  /* ---------- Carregadores ---------- */

  async function carregarContas() {
    if (window.DrTrocoContas?.carregar) {
      try { await window.DrTrocoContas.carregar(); } catch (_) {}
    }
    const contas = window.DrTrocoContas?.listar ? window.DrTrocoContas.listar() : [];
    const hoje = dataLocalISO();
    const limite = adicionarDias(hoje, 7);

    const vencidas = contas.filter(c => !c.paga && c.vencimento && c.vencimento < hoje);
    const vencendo = contas.filter(c => !c.paga && c.vencimento && c.vencimento >= hoje && c.vencimento <= limite);

    return {
      vencidas,
      vencendo,
      totalVencidas: vencidas.reduce((s, c) => s + Number(c.valor || 0), 0),
      totalVencendo: vencendo.reduce((s, c) => s + Number(c.valor || 0), 0)
    };
  }

  async function carregarEstoque() {
    if (!window.EstoqueSupabase || typeof window.EstoqueSupabase.carregarProdutos !== 'function') {
      return { semEstoque: [], baixo: [], vencidos: [], vencendo: [] };
    }
    try {
      const produtos = await window.EstoqueSupabase.carregarProdutos();
      const hoje = dataLocalISO();
      const limite = adicionarDias(hoje, 30);

      const semEstoque = produtos.filter(p => Number(p.quantidade) === 0);
      const baixo = produtos.filter(p =>
        Number(p.quantidade) > 0 &&
        Number(p.quantidade) <= Number(p.estoqueMinimo || 0)
      );

      const vencidos = produtos.filter(p =>
        p.validade && p.tipo === 'perecivel' && p.validade < hoje
      );
      const vencendo = produtos.filter(p =>
        p.validade && p.tipo === 'perecivel' && p.validade >= hoje && p.validade <= limite
      );

      return { semEstoque, baixo, vencidos, vencendo };
    } catch (err) {
      console.warn('[Alertas] Estoque não carregou:', err);
      return { semEstoque: [], baixo: [], vencidos: [], vencendo: [] };
    }
  }

  async function carregarFiado() {
    try {
      const user = await obterUsuario();
      const supa = window.supabaseClient;
      const hoje = dataLocalISO();

      const [cliResp, movResp] = await Promise.all([
        supa.from('fiado_clientes').select('id, nome, telefone').eq('usuario_id', user.id),
        supa.from('fiado_movimentacoes').select('cliente_id, tipo, valor_centavos, data').eq('usuario_id', user.id)
      ]);

      if (cliResp.error) throw cliResp.error;
      if (movResp.error) throw movResp.error;

      const clientes = cliResp.data || [];
      const movs = movResp.data || [];

      const porCliente = new Map();
      movs.forEach(m => {
        const k = String(m.cliente_id);
        if (!porCliente.has(k)) porCliente.set(k, []);
        porCliente.get(k).push(m);
      });

      const antigos = [];

      for (const cli of clientes) {
        const lista = porCliente.get(String(cli.id)) || [];
        if (!lista.length) continue;

        let dividas = 0, pagamentos = 0;
        let ultimaCompra = null;

        lista.forEach(m => {
          const v = Number(m.valor_centavos) || 0;
          if (m.tipo === 'divida') {
            dividas += v;
            const d = String(m.data || '').slice(0, 10);
            if (d && (!ultimaCompra || d > ultimaCompra)) ultimaCompra = d;
          } else if (m.tipo === 'pagamento') {
            pagamentos += v;
          }
        });

        const saldo = dividas - pagamentos;
        if (saldo <= 0 || !ultimaCompra) continue;

        const dias = diferencaDias(hoje, ultimaCompra);
        if (dias >= 30) {
          antigos.push({
            id: cli.id,
            nome: cli.nome,
            telefone: cli.telefone || '',
            saldo: saldo / 100,
            dias
          });
        }
      }

      antigos.sort((a, b) => b.dias - a.dias);

      return {
        antigos,
        totalDevido: antigos.reduce((s, c) => s + c.saldo, 0)
      };
    } catch (err) {
      console.warn('[Alertas] Fiado não carregou:', err);
      return { antigos: [], totalDevido: 0 };
    }
  }

  /* ---------- Renderização ---------- */

  function corAlerta(tipo) {
    if (tipo === 'critico') return { bg: '#fff0f0', borda: '#f0d8d8', texto: '#b42318', icone: '🚨' };
    if (tipo === 'aviso')   return { bg: '#fff7e0', borda: '#f0e0a8', texto: '#745600', icone: '⚠️' };
    return { bg: '#eaf8f1', borda: '#c0e5d0', texto: '#0f7a44', icone: '✓' };
  }

  function card(titulo, detalhe, valor, tipo, acaoHtml) {
    const c = corAlerta(tipo);
    return `
      <div class="alerta-item" style="
        display:flex; align-items:flex-start; gap:12px;
        padding:14px; margin-bottom:10px;
        border:1px solid ${c.borda}; border-radius:14px;
        background:${c.bg};
      ">
        <div style="font-size:22px; line-height:1; flex-shrink:0; margin-top:2px;">${c.icone}</div>
        <div style="flex:1; min-width:0;">
          <div style="color:${c.texto}; font-size:14px; font-weight:900; margin-bottom:4px; line-height:1.3;">
            ${titulo}
          </div>
          <div style="color:#5b6b5f; font-size:12px; line-height:1.5; margin-bottom:${valor || acaoHtml ? '8px' : '0'};">
            ${detalhe}
          </div>
          ${valor ? `<div style="color:${c.texto}; font-size:13px; font-weight:900; margin-bottom:${acaoHtml ? '10px' : '0'};">${valor}</div>` : ''}
          ${acaoHtml || ''}
        </div>
      </div>
    `;
  }

  function linkAcao(texto, href) {
    return `<a href="${href}" style="
      display:inline-block; padding:7px 12px;
      background:#168b53; color:#fff; border-radius:9px;
      text-decoration:none; font-size:12px; font-weight:700;
    ">${texto} →</a>`;
  }

  function botaoAcao(texto, acaoId) {
    return `<button type="button" data-acao-id="${acaoId}" style="
      padding:7px 12px; background:#168b53; color:#fff;
      border:0; border-radius:9px;
      font-size:12px; font-weight:700; cursor:pointer;
    ">${texto} →</button>`;
  }

  function renderizar() {
    if (!area) return;

    const { contas, estoque, validade, fiado } = estado.alertas;
    const cards = [];

    if (contas.vencidas.length > 0) {
      cards.push(card(
        `${contas.vencidas.length} conta${contas.vencidas.length > 1 ? 's' : ''} vencida${contas.vencidas.length > 1 ? 's' : ''}`,
        'Pagamento em atraso. Regularize para evitar juros.',
        formatarReal(contas.totalVencidas),
        'critico',
        botaoAcao('Ver contas', 'rolar-contas')
      ));
    }

    if (contas.vencendo.length > 0) {
      cards.push(card(
        `${contas.vencendo.length} conta${contas.vencendo.length > 1 ? 's' : ''} vencendo em até 7 dias`,
        'Fique atento ao prazo de pagamento.',
        formatarReal(contas.totalVencendo),
        'aviso',
        botaoAcao('Ver contas', 'rolar-contas')
      ));
    }

    if (estoque.semEstoque.length > 0) {
      cards.push(card(
        `${estoque.semEstoque.length} produto${estoque.semEstoque.length > 1 ? 's' : ''} sem estoque`,
        'Sem unidades disponíveis para venda.',
        '',
        'critico',
        linkAcao('Ir ao estoque', 'estoque.html')
      ));
    }

    if (estoque.baixo.length > 0) {
      cards.push(card(
        `${estoque.baixo.length} produto${estoque.baixo.length > 1 ? 's' : ''} com estoque baixo`,
        'Reponha antes de acabar.',
        '',
        'aviso',
        linkAcao('Ir ao estoque', 'estoque.html')
      ));
    }

    if (validade.vencidos.length > 0) {
      cards.push(card(
        `${validade.vencidos.length} produto${validade.vencidos.length > 1 ? 's' : ''} vencido${validade.vencidos.length > 1 ? 's' : ''}`,
        'Retire das prateleiras para não vender.',
        '',
        'critico',
        linkAcao('Ir ao estoque', 'estoque.html')
      ));
    }

    if (validade.vencendo.length > 0) {
      cards.push(card(
        `${validade.vencendo.length} produto${validade.vencendo.length > 1 ? 's' : ''} vencendo em até 30 dias`,
        'Priorize a venda desses itens.',
        '',
        'aviso',
        linkAcao('Ir ao estoque', 'estoque.html')
      ));
    }

    if (fiado.antigos.length > 0) {
      cards.push(card(
        `${fiado.antigos.length} cliente${fiado.antigos.length > 1 ? 's' : ''} devendo há 30+ dias`,
        'Considere fazer uma cobrança pelo WhatsApp dentro do Fiado.',
        formatarReal(fiado.totalDevido),
        'aviso',
        linkAcao('Ir ao Fiado', 'fiado.html')
      ));
    }

    const totalAlertas =
      contas.vencidas.length +
      contas.vencendo.length +
      estoque.semEstoque.length +
      estoque.baixo.length +
      validade.vencidos.length +
      validade.vencendo.length +
      fiado.antigos.length;

    const contador = $('alertasContador');
    if (contador) {
      if (totalAlertas === 0) {
        contador.textContent = '✓';
        contador.style.background = '#eaf8f1';
        contador.style.color = '#0f7a44';
      } else {
        contador.textContent = String(totalAlertas);
        contador.style.background = '#fff0f0';
        contador.style.color = '#b42318';
      }
    }

    if (cards.length === 0) {
      area.innerHTML = `
        <div style="
          padding:20px; text-align:center; border-radius:14px;
          background:#eaf8f1; border:1px solid #c0e5d0; color:#0f7a44;
        ">
          <div style="font-size:30px; margin-bottom:8px;">✓</div>
          <div style="font-size:14px; font-weight:900; margin-bottom:4px;">Tudo em ordem!</div>
          <div style="font-size:12px; opacity:.85;">Nenhum alerta no momento.</div>
        </div>
      `;
      return;
    }

    area.innerHTML = cards.join('');

    // Handlers dos botões "Ver contas"
    area.querySelectorAll('[data-acao-id="rolar-contas"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const alvo = document.getElementById('secaoContasPagar');
        if (!alvo) return;
        const btnToggle = alvo.querySelector('#btnToggleContasPagar');
        if (btnToggle && btnToggle.getAttribute('aria-expanded') !== 'true') btnToggle.click();
        alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  async function carregarTudo() {
    if (estado.carregando) return;
    estado.carregando = true;

    if (area) {
      area.innerHTML = `<div style="padding:15px; text-align:center; color:#7b898f; font-size:13px;">⏳ Analisando dados...</div>`;
    }

    try {
      const [contas, estoque, fiado] = await Promise.all([
        carregarContas(),
        carregarEstoque(),
        carregarFiado()
      ]);

      estado.alertas = {
        contas: {
          vencidas: contas.vencidas || [],
          vencendo: contas.vencendo || [],
          totalVencidas: contas.totalVencidas || 0,
          totalVencendo: contas.totalVencendo || 0
        },
        estoque: {
          semEstoque: estoque.semEstoque || [],
          baixo: estoque.baixo || []
        },
        validade: {
          vencidos: estoque.vencidos || [],
          vencendo: estoque.vencendo || []
        },
        fiado: {
          antigos: fiado.antigos || [],
          totalDevido: fiado.totalDevido || 0
        }
      };

      renderizar();
    } catch (err) {
      console.error('[Alertas] Erro ao carregar:', err);
      if (area) {
        area.innerHTML = `<div style="padding:15px; text-align:center; border-radius:14px; background:#fff0f0; border:1px solid #f0d8d8; color:#b42318; font-size:12px;">Não foi possível carregar os alertas.</div>`;
      }
    } finally {
      estado.carregando = false;
    }
  }

  function iniciar() {
    if (!window.supabaseClient) return;
    if (!area) return;

    carregarTudo();

    // Recarrega quando a aba volta a ficar visível
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        estado.usuario = null;
        carregarTudo();
      }
    });

    window.DrTrocoAlertas = {
      recarregar: carregarTudo,
      resumo: () => JSON.parse(JSON.stringify(estado.alertas))
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
