/* =========================================================
   DR. TROCO — GRÁFICOS DO PAINEL (Chart.js)
   ========================================================= */

'use strict';

(() => {
  if (window.__drTrocoGraficosInicializado) return;
  window.__drTrocoGraficosInicializado = true;

  let chartLinha = null;
  let chartPizza = null;
  let chartBarras = null;

  // Cores padrão do Dr. Troco
  const COR_VERDE = '#20a767';
  const COR_VERDE_ESCURO = '#168b53';
  const COR_AZUL = '#3b82f6';
  const COR_LARANJA = '#f59e0b';
  const COR_VERMELHO = '#ef4444';
  const COR_ROXO = '#8b5cf6';

  function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Pega os últimos 7 dias (do mais antigo para o mais recente)
  function obterUltimos7Dias() {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      dias.push({
        label: `${dia}/${mes}`,
        chave: `${ano}-${mes}-${dia}`
      });
    }
    return dias;
  }

  async function carregarDadosGraficos() {
    try {
      // 1. Buscar Vendas (via cache/supabase do DrTrocoDados)
      let vendas = [];
      if (window.DrTrocoDados && typeof window.DrTrocoDados.vendas === 'function') {
        vendas = window.DrTrocoDados.vendas();
      } else {
        vendas = JSON.parse(localStorage.getItem('drTroco_vendas') || '[]');
      }

      // 2. Buscar Mapa de Custos dos Fornecedores
      let mapaCustos = new Map();
      if (window.DrTrocoFornecedores && typeof window.DrTrocoFornecedores.mapaCustos === 'function') {
        mapaCustos = window.DrTrocoFornecedores.mapaCustos();
      }

      // Função auxiliar para normalizar nome de produto (para cruzar com fornecedor)
      const normalizar = (txt) => String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

      // =====================================================
      // PREPARAR GRÁFICO 1: FATURAMENTO E LUCRO (7 DIAS)
      // =====================================================
      const dias = obterUltimos7Dias();
      const labelsDias = dias.map(d => d.label);
      const dataFaturamento = [];
      const dataLucro = [];

      dias.forEach(dia => {
        const vendasDoDia = vendas.filter(v => v.dataChave === dia.chave || v.data === dia.label || v.data === dia.chave.replace(/-/g, '/'));
        
        let faturamento = 0;
        let lucro = 0;

        vendasDoDia.forEach(v => {
          faturamento += Number(v.total) || 0;
          
          // Cálculo do lucro por produto
          if (Array.isArray(v.produtos)) {
            v.produtos.forEach(p => {
              const precoVenda = Number(p.preco) || 0;
              const qtd = Number(p.quantidade) || 0;
              const custoUnitario = mapaCustos.get(normalizar(p.nome))?.preco || 0; // Se não achar o custo, é 0
              
              const receitaItem = precoVenda * qtd;
              const custoItem = custoUnitario * qtd;
              
              // O lucro é a receita menos o custo. Se não tiver custo, o lucro é igual à receita.
              lucro += (receitaItem - custoItem);
            });
          } else if (v.valorAvulso > 0) {
             // Venda avulsa (não tem produto) conta como 100% de lucro
             lucro += Number(v.valorAvulso) || 0;
          }
        });

        dataFaturamento.push(faturamento);
        dataLucro.push(Math.max(0, lucro)); // Evita mostrar lucro negativo se custo for maior
      });

      // =====================================================
      // PREPARAR GRÁFICO 2: FORMAS DE PAGAMENTO
      // =====================================================
      const totaisPagamento = { dinheiro: 0, pix: 0, debito: 0, credito: 0, fiado: 0 };
      vendas.forEach(v => {
        const forma = String(v.formaPagamento || 'dinheiro').toLowerCase();
        if (totaisPagamento[forma] !== undefined) {
          totaisPagamento[forma] += Number(v.total) || 0;
        }
      });

      // =====================================================
      // PREPARAR GRÁFICO 3: TOP 5 PRODUTOS MAIS VENDIDOS
      // =====================================================
      const contagemProdutos = {};
      vendas.forEach(v => {
        if (Array.isArray(v.produtos)) {
          v.produtos.forEach(p => {
            const nome = p.nome || 'Desconhecido';
            if (!contagemProdutos[nome]) contagemProdutos[nome] = { qtd: 0, faturamento: 0 };
            contagemProdutos[nome].qtd += Number(p.quantidade) || 0;
            contagemProdutos[nome].faturamento += (Number(p.preco) || 0) * (Number(p.quantidade) || 0);
          });
        }
      });

      // Ordena pelos mais vendidos e pega os 5 primeiros
      const topProdutos = Object.entries(contagemProdutos)
        .sort((a, b) => b[1].qtd - a[1].qtd)
        .slice(0, 5);

      const labelsProdutos = topProdutos.map(p => p[0]);
      const dataQtdProdutos = topProdutos.map(p => p[1].qtd);

      // =====================================================
      // RENDERIZAR OS GRÁFICOS
      // =====================================================
      desenharGraficoLinha(labelsDias, dataFaturamento, dataLucro);
      desenharGraficoPizza(totaisPagamento);
      desenharGraficoBarras(labelsProdutos, dataQtdProdutos);

    } catch (erro) {
      console.error('[Gráficos] Erro ao carregar:', erro);
    }
  }

  // ----------------------------------------------------
  // GRÁFICO 1: LINHA (Faturamento vs Lucro)
  // ----------------------------------------------------
  function desenharGraficoLinha(labels, faturamento, lucro) {
    const ctx = document.getElementById('graficoLinhaVendas');
    if (!ctx) return;

    if (chartLinha) chartLinha.destroy(); // Destrói o antigo antes de criar um novo

    chartLinha = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Faturamento (R$)',
            data: faturamento,
            borderColor: COR_AZUL,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: COR_AZUL
          },
          {
            label: 'Lucro Estimado (R$)',
            data: lucro,
            borderColor: COR_VERDE,
            backgroundColor: 'rgba(32, 167, 103, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointBackgroundColor: COR_VERDE
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${formatarMoeda(context.raw)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => 'R$ ' + value, font: { size: 10 } }
          },
          x: { ticks: { font: { size: 10 } } }
        }
      }
    });
  }

  // ----------------------------------------------------
  // GRÁFICO 2: PIZZA (Formas de Pagamento)
  // ----------------------------------------------------
  function desenharGraficoPizza(totais) {
    const ctx = document.getElementById('graficoPizzaPagamentos');
    if (!ctx) return;

    if (chartPizza) chartPizza.destroy();

    const labels = [];
    const data = [];
    const cores = [];

    if (totais.dinheiro > 0) { labels.push('Dinheiro'); data.push(totais.dinheiro); cores.push(COR_VERDE); }
    if (totais.pix > 0) { labels.push('Pix'); data.push(totais.pix); cores.push(COR_AZUL); }
    if (totais.debito > 0) { labels.push('Débito'); data.push(totais.debito); cores.push(COR_LARANJA); }
    if (totais.credito > 0) { labels.push('Crédito'); data.push(totais.credito); cores.push(COR_ROXO); }
    if (totais.fiado > 0) { labels.push('Fiado'); data.push(totais.fiado); cores.push(COR_VERMELHO); }

    if (labels.length === 0) {
      labels.push('Sem vendas');
      data.push(1);
      cores.push('#e5e7eb');
    }

    chartPizza = new Chart(ctx, {
      type: 'doughnut', // Doughnut é mais moderno que pizza
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: cores,
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%', // Deixa o buraco no meio
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = data.reduce((a, b) => a + b, 0);
                const valor = context.raw;
                const porcentagem = total > 0 ? Math.round((valor / total) * 100) : 0;
                return ` ${context.label}: ${formatarMoeda(valor)} (${porcentagem}%)`;
              }
            }
          }
        }
      }
    });
  }

  // ----------------------------------------------------
  // GRÁFICO 3: BARRAS HORIZONTAIS (Top Produtos)
  // ----------------------------------------------------
  function desenharGraficoBarras(labels, data) {
    const ctx = document.getElementById('graficoBarrasProdutos');
    if (!ctx) return;

    if (chartBarras) chartBarras.destroy();

    // Se não tiver produtos, exibe mensagem falsa
    if (labels.length === 0) {
      labels.push('Nenhuma venda registrada');
      data.push(0);
    }

    chartBarras = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Qtd. Vendida',
          data: data,
          backgroundColor: COR_VERDE_ESCURO,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y', // Transforma em barras horizontais
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return ` ${context.raw} unidades`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { stepSize: 1, font: { size: 10 } }
          },
          y: {
            ticks: { font: { size: 11, weight: 'bold' } }
          }
        }
      }
    });
  }

  // ----------------------------------------------------
  // INICIALIZAÇÃO
  // ----------------------------------------------------
  function iniciarGraficos() {
    if (!document.getElementById('graficoLinhaVendas')) return; // Sai se não estiver na página do painel
    
    // Espera o Supabase e os dados estarem prontos
    setTimeout(() => {
      carregarDadosGraficos();
    }, 1000);

    // Botão de atualizar manualmente
    document.getElementById('btnAtualizarGraficos')?.addEventListener('click', (e) => {
      e.preventDefault();
      carregarDadosGraficos();
      e.target.textContent = '⏳ ...';
      setTimeout(() => e.target.textContent = '🔄 Atualizar', 1000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarGraficos);
  } else {
    iniciarGraficos();
  }
})();
