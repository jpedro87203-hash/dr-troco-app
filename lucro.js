/* =========================================================
   DR. TROCO — ESTIMATIVA DE LUCRO (SUPABASE)
   Fontes:
     - fornecedores / fornecedor_compras (Supabase) → custos
     - contas_pagar (Supabase) → despesas pagas
     - drTroco_vendas (localStorage) → vendas
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoLucroInicializado) return;
  window.__drTrocoLucroInicializado = true;

  const CHAVE_VENDAS = 'drTroco_vendas';
  const CHAVE_ESTOQUE_BASE = 'drTroco_estoque';

  const $ = (id) => document.getElementById(id);

  function lerJSON(chave, padrao) {
    try {
      const bruto = localStorage.getItem(chave);
      if (!bruto) return padrao;
      const dados = JSON.parse(bruto);
      return dados === null ? padrao : dados;
    } catch (e) { return padrao; }
  }

  function obterVendas() {
    const d = lerJSON(CHAVE_VENDAS, []);
    return Array.isArray(d) ? d : [];
  }

  function obterComercioIdLocal() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave && chave.startsWith(CHAVE_ESTOQUE_BASE + '_') &&
            chave !== CHAVE_ESTOQUE_BASE + '_legado') {
          return chave.replace(CHAVE_ESTOQUE_BASE + '_', '');
        }
      }
    } catch (e) {}
    return null;
  }

  function obterEstoque() {
    const cid = obterComercioIdLocal();
    const chave = cid ? `${CHAVE_ESTOQUE_BASE}_${cid}` : CHAVE_ESTOQUE_BASE;
    const d = lerJSON(chave, []);
    return Array.isArray(d) ? d : [];
  }

  function formatarReal(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function dataHojeISO() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function inicioMesISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function formatarDataISO(d) {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function normalizar(txt) {
    return String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase();
  }

  function escaparHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  async function garantirDados() {
    // Aguarda fornecedores e contas carregarem (APIs expostas pelos módulos)
    const tarefas = [];
    if (window.DrTrocoFornecedores?.carregar) tarefas.push(window.DrTrocoFornecedores.carregar());
    if (window.DrTrocoContas?.carregar) tarefas.push(window.DrTrocoContas.carregar());
    try { await Promise.all(tarefas); }
    catch (e) { console.warn('[Lucro] Falha ao preparar dados:', e); }
  }

  function construirMapaCustos() {
    if (window.DrTrocoFornecedores?.mapaCustos) {
      try { return window.DrTrocoFornecedores.mapaCustos(); }
      catch (e) { console.warn('[Lucro] mapaCustos falhou:', e); }
    }
    return new Map();
  }

  // Converte o custo cadastrado no estoque para custo de UMA unidade.
  // precoCusto representa o custo da embalagem inteira.
  function obterCustoUnitarioEstoque(produto) {
    if (!produto) return 0;

    const custo = Number(produto.precoCusto ?? produto.preco_custo ?? 0);
    const embalagemInformada = Number(
      produto.qtdEmbalagem ?? produto.qtd_embalagem ?? 1
    );
    const quantidadeEmbalagem =
      Number.isFinite(embalagemInformada) && embalagemInformada > 0
        ? embalagemInformada
        : 1;

    if (!Number.isFinite(custo) || custo <= 0) return 0;
    return custo / quantidadeEmbalagem;
  }

  function obterDataISO(valor) {
    if (!valor) return '';
    const texto = String(valor).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);

    const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brasileira) return `${brasileira[3]}-${brasileira[2]}-${brasileira[1]}`;

    return '';
  }

  function calcularLucro(inicio, fim) {
    const vendas = obterVendas();
    const estoque = obterEstoque();
    const contas = window.DrTrocoContas?.listar ? window.DrTrocoContas.listar() : [];
    const mapaCustos = construirMapaCustos();

    const estoqueMap = new Map();
    estoque.forEach(p => {
      if (p?.id !== undefined && p?.id !== null) {
        estoqueMap.set(String(p.id), p);
      }
    });

    const vendasPeriodo = vendas.filter(v => {
      const iso = obterDataISO(v.dataChave || v.data);
      return iso && iso >= inicio && iso <= fim;
    });

    let totalVendido = 0;
    let custoTotal = 0;
    const semCusto = new Map();

    vendasPeriodo.forEach(venda => {
      const total = Number(venda.total ?? venda.valorConta ?? 0);
      if (Number.isFinite(total)) totalVendido += total;

      const itens = Array.isArray(venda.produtos) ? venda.produtos : [];

      itens.forEach(item => {
        const qtd = Number(item.quantidade) || 0;
        if (qtd <= 0) return;

        const idProduto = item.id ?? item.produtoId ?? item.produto_id;
        const prodEstoque = idProduto !== undefined && idProduto !== null
          ? estoqueMap.get(String(idProduto))
          : null;

        let custoUnit = 0;

        // 1. Prioridade: custo unitário gravado na própria venda.
        // Isso preserva o lucro histórico mesmo após alteração no estoque.
        const custoHistorico = Number(
          item.custoUnitario ?? item.custo_unitario ?? 0
        );
        if (Number.isFinite(custoHistorico) && custoHistorico > 0) {
          custoUnit = custoHistorico;
        }

        // 2. Fallback: custo unitário atual do estoque.
        if (custoUnit <= 0 && prodEstoque) {
          custoUnit = obterCustoUnitarioEstoque(prodEstoque);
        }

        // 3. Último fallback: última compra do fornecedor.
        // fornecedores.js já registra precoUnitario por unidade.
        if (custoUnit <= 0) {
          const chaveProduto = normalizar(
            item.nome || item.produto || prodEstoque?.nome
          );
          const noMapa = mapaCustos.get(chaveProduto);
          const custoFornecedor = Number(noMapa?.preco || 0);

          if (Number.isFinite(custoFornecedor) && custoFornecedor > 0) {
            custoUnit = custoFornecedor;
          }
        }

        if (custoUnit <= 0) {
          const chave = String(
            item.nome || item.produto || prodEstoque?.nome || 'Desconhecido'
          );
          const atual = semCusto.get(chave) || 0;
          semCusto.set(chave, atual + (Number(item.preco) || 0) * qtd);
        }

        custoTotal += custoUnit * qtd;
      });
    });

    const contasPeriodo = (Array.isArray(contas) ? contas : []).filter(c => {
      const dataPagamento = obterDataISO(c.dataPagamento || c.data_pagamento);
      return Boolean(c.paga) &&
        dataPagamento >= inicio &&
        dataPagamento <= fim;
    });

    const totalContas = contasPeriodo.reduce((s, c) => {
      const valor = Number(c.valor || 0);
      return s + (Number.isFinite(valor) ? valor : 0);
    }, 0);

    return {
      totalVendido,
      custoTotal,
      lucroBruto: totalVendido - custoTotal,
      totalContas,
      lucroLiquido: totalVendido - custoTotal - totalContas,
      quantidadeVendas: vendasPeriodo.length,
      semCusto: Array.from(semCusto.entries()).map(([nome, valor]) => ({ nome, valor }))
    };
  }

  /* ---- UI ---- */

  function adicionarEstilos() {
    if (document.getElementById('estilosLucro')) return;
    const s = document.createElement('style');
    s.id = 'estilosLucro';
    s.textContent = `
      .lcr-form { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
      .lcr-campo { display:grid; gap:6px; }
      .lcr-campo label { font-size:12px; font-weight:700; color:#34483d; }
      .lcr-campo input {
        min-height:42px; padding:10px 12px; border:1px solid #d6e3d9;
        border-radius:10px; background:#fff; color:#203126;
        font:inherit; font-size:14px; box-sizing:border-box; }
      .lcr-campo input:focus {
        outline:none; border-color:#20a767;
        box-shadow:0 0 0 3px rgba(32,167,103,.12); }
      .lcr-atalhos { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
      .lcr-atalho { flex:1; min-width:90px; padding:8px;
        border:1px solid #d6e3d9; border-radius:10px; background:#f5f9f6;
        color:#168b53; font:inherit; font-size:11px; font-weight:700;
        cursor:pointer; }
      .lcr-atalho:active { transform:scale(.97); }
      .lcr-resumo { display:grid; gap:8px; margin-bottom:14px; }
      .lcr-item { display:flex; justify-content:space-between;
        align-items:center; gap:10px; padding:12px 14px;
        border-radius:12px; background:#f7faf8; border:1px solid #e3ece5; }
      .lcr-item-label { color:#4b5f53; font-size:12px; font-weight:600; }
      .lcr-item-valor { color:#1f3028; font-size:15px; font-weight:900;
        white-space:nowrap; overflow-wrap:anywhere; }
      .lcr-item.destaque {
        background:linear-gradient(135deg,#eaf8f1,#dcf0e5); border-color:#c0e5d0; }
      .lcr-item.destaque .lcr-item-label { color:#176b3a; }
      .lcr-item.destaque .lcr-item-valor { color:#0f7a44; font-size:17px; }
      .lcr-item.negativo .lcr-item-valor { color:#b42318; }
      .lcr-aviso { padding:12px 14px; border-radius:12px; background:#fff7e0;
        border:1px solid #f0e0a8; color:#745600; font-size:12px;
        line-height:1.5; margin-bottom:14px; }
      .lcr-aviso b { color:#5d4300; }
      .lcr-aviso ul { margin:8px 0 0; padding-left:20px; }
      .lcr-aviso li { margin:4px 0; }
      .lcr-nota { margin-top:10px; padding:10px 12px; border-radius:10px;
        background:#f5f9f6; color:#607166; font-size:11px; line-height:1.5; }
      .lcr-carregando { padding:20px; text-align:center; color:#718076; font-size:13px; }
      @media (max-width:360px){ .lcr-form { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(s);
  }

  function renderizar() {
    const area = $('lucroArea');
    if (!area) return;

    area.innerHTML = `
      <div class="lcr-form">
        <div class="lcr-campo">
          <label for="lcrInicio">Data inicial</label>
          <input type="date" id="lcrInicio" value="${inicioMesISO()}">
        </div>
        <div class="lcr-campo">
          <label for="lcrFim">Data final</label>
          <input type="date" id="lcrFim" value="${dataHojeISO()}">
        </div>
      </div>
      <div class="lcr-atalhos">
        <button type="button" class="lcr-atalho" data-periodo="hoje">Hoje</button>
        <button type="button" class="lcr-atalho" data-periodo="semana">7 dias</button>
        <button type="button" class="lcr-atalho" data-periodo="mes">Este mês</button>
        <button type="button" class="lcr-atalho" data-periodo="ano">Este ano</button>
      </div>
      <div id="lcrResultado"><div class="lcr-carregando">⏳ Carregando...</div></div>
    `;

    $('lcrInicio').addEventListener('change', renderizarResultado);
    $('lcrFim').addEventListener('change', renderizarResultado);

    area.querySelectorAll('[data-periodo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hoje = new Date();
        const periodos = {
          hoje: () => {
            $('lcrInicio').value = dataHojeISO();
            $('lcrFim').value = dataHojeISO();
          },
          semana: () => {
            const d = new Date(hoje);
            d.setDate(d.getDate() - 6);
            $('lcrInicio').value = formatarDataISO(d);
            $('lcrFim').value = dataHojeISO();
          },
          mes: () => {
            $('lcrInicio').value = inicioMesISO();
            $('lcrFim').value = dataHojeISO();
          },
          ano: () => {
            $('lcrInicio').value = `${hoje.getFullYear()}-01-01`;
            $('lcrFim').value = dataHojeISO();
          }
        };
        (periodos[btn.dataset.periodo] || periodos.mes)();
        renderizarResultado();
      });
    });

    garantirDados().then(renderizarResultado);
  }

  function renderizarResultado() {
    const alvo = $('lcrResultado');
    if (!alvo) return;
    const inicio = $('lcrInicio').value;
    const fim = $('lcrFim').value;
    if (!inicio || !fim) {
      alvo.innerHTML = '<div class="lcr-nota">Informe o período.</div>';
      return;
    }
    if (inicio > fim) {
      alvo.innerHTML = '<div class="lcr-aviso"><b>Data inicial maior que a final.</b> Ajuste.</div>';
      return;
    }

    const r = calcularLucro(inicio, fim);
    const aviso = r.semCusto.length
      ? `<div class="lcr-aviso">
          <b>Atenção:</b> ${r.semCusto.length} produto(s) sem custo cadastrado.
          O lucro bruto pode estar inflado. Cadastre a compra em
          <b>Fornecedores → Compra</b>.
          <ul>
            ${r.semCusto.slice(0, 6).map(p =>
              `<li>${escaparHTML(p.nome)} — ${formatarReal(p.valor)} em vendas</li>`
            ).join('')}
            ${r.semCusto.length > 6
              ? `<li>…e mais ${r.semCusto.length - 6}</li>` : ''}
          </ul>
        </div>`
      : '';

    alvo.innerHTML = `
      ${aviso}
      <div class="lcr-resumo">
        <div class="lcr-item">
          <span class="lcr-item-label">Total vendido (${r.quantidadeVendas} venda${r.quantidadeVendas === 1 ? '' : 's'})</span>
          <span class="lcr-item-valor">${formatarReal(r.totalVendido)}</span>
        </div>
        <div class="lcr-item">
          <span class="lcr-item-label">Custo dos produtos vendidos</span>
          <span class="lcr-item-valor">− ${formatarReal(r.custoTotal)}</span>
        </div>
        <div class="lcr-item destaque">
          <span class="lcr-item-label">Lucro bruto</span>
          <span class="lcr-item-valor">${formatarReal(r.lucroBruto)}</span>
        </div>
        <div class="lcr-item">
          <span class="lcr-item-label">Contas pagas no período</span>
          <span class="lcr-item-valor">− ${formatarReal(r.totalContas)}</span>
        </div>
        <div class="lcr-item destaque ${r.lucroLiquido < 0 ? 'negativo' : ''}">
          <span class="lcr-item-label">Lucro líquido</span>
          <span class="lcr-item-valor">${formatarReal(r.lucroLiquido)}</span>
        </div>
      </div>
      <div class="lcr-nota">
        <b>Como é calculado:</b> o sistema prioriza o custo unitário salvo
        no momento da venda. Se não existir, usa o custo unitário do estoque
        (custo da embalagem dividido pela quantidade) e, por último, a última
        compra registrada em <b>Fornecedores</b>. Vendas fiadas contam como venda do período.
      </div>
    `;
  }

  function iniciar() {
    adicionarEstilos();
    renderizar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
