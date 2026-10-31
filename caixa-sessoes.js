/* DR. TROCO — SESSÕES DE CAIXA
   Persistência local compatível com os dados atuais. */
(() => {
  'use strict';
  const KEY = 'drTroco_sessoesCaixa';
  const SALES = 'drTroco_vendas';
  const MOVES = 'drTroco_movimentacoes';
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || ''); return v ?? fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const now = () => new Date();
  const id = () => `cx-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const sessions = () => read(KEY, []);
  const current = () => sessions().find(s => s.status === 'aberto') || null;
  const sales = () => read(SALES, []);
  const moves = () => read(MOVES, []);
  const forma = v => ({dinheiro:'Dinheiro',pix:'Pix',debito:'Débito',credito:'Crédito'}[v] || v || 'Outros');
  function totals(session) {
    const sid = session.id;
    const ss = sales().filter(v => v.caixaSessaoId === sid);
    const mm = moves().filter(m => m.caixaSessaoId === sid);
    const t = {dinheiro:0,pix:0,debito:0,credito:0,outros:0,fiado:0,entradas:0,saidas:0,reforcos:0,sangrias:0,vendas:ss.length};
    ss.forEach(v => {
      if (v.formaPagamento === 'fiado') {
        t.fiado += money(v.total ?? v.valorConta);
        return;
      }
      const f = ['dinheiro','pix','debito','credito'].includes(v.formaPagamento) ? v.formaPagamento : 'outros';
      t[f] += money(v.total ?? v.valorConta);
    });
    mm.forEach(m => {
      const val = money(m.valor);
      const f = ['dinheiro','pix','debito','credito'].includes(m.formaPagamento) ? m.formaPagamento : 'outros';
      if (m.tipo === 'entrada') {
        t.entradas += val;
        if (f === 'dinheiro') t.reforcos += val;
      } else if (m.tipo === 'saida') {
        t.saidas += val;
        if (f === 'dinheiro') t.sangrias += val;
      }
    });
    t.dinheiro = money(t.dinheiro);
    t.totalVendas = money(t.dinheiro + t.pix + t.debito + t.credito + t.outros + t.fiado);
    t.caixaEsperado = money(Number(session.valorAbertura) + t.dinheiro +
      mm.filter(m => m.tipo === 'entrada' && (!m.formaPagamento || m.formaPagamento === 'dinheiro')).reduce((a,m)=>a+money(m.valor),0) -
      mm.filter(m => m.tipo === 'saida' && (!m.formaPagamento || m.formaPagamento === 'dinheiro')).reduce((a,m)=>a+money(m.valor),0));
    return t;
  }
  function requireOpen() {
    if (current()) return true;
    alert('O caixa está fechado. Abra uma sessão de caixa antes de registrar vendas ou movimentações.');
    if (location.pathname.endsWith('fluxo.html')) document.getElementById('btnAbrirSessaoCaixa')?.click();
    else location.href = 'fluxo.html';
    return false;
  }
  function attachSale(venda) {
    const s = current();
    if (!s) throw new Error('Não existe sessão de caixa aberta.');
    venda.caixaSessaoId = s.id;
    venda.caixaSessaoNumero = s.numero;
  }
  function attachMovement(movimento) {
    const s = current();
    if (!s) throw new Error('Não existe sessão de caixa aberta.');
    movimento.caixaSessaoId = s.id;
    movimento.caixaSessaoNumero = s.numero;
  }
  function render() {
    const s = current();
    const status = document.getElementById('statusSessaoCaixa');
    const openBtn = document.getElementById('btnAbrirSessaoCaixa');
    const closeBtn = document.getElementById('btnFecharSessaoCaixa');
    const card = document.getElementById('painelSessaoCaixa');
    if (!status) return;
    if (!s) {
      status.textContent = 'CAIXA FECHADO';
      status.className = 'status-caixa fechado';
      openBtn.hidden = false; closeBtn.hidden = true; card.hidden = true;
      renderHistory();
      return;
    }
    const t = totals(s);
    status.textContent = `CAIXA ABERTO · Sessão ${s.numero}`;
    status.className = 'status-caixa aberto';
    openBtn.hidden = true; closeBtn.hidden = false; card.hidden = false;
    document.getElementById('sessaoAberturaInfo').textContent =
      `Aberto em ${new Date(s.abertoEm).toLocaleString('pt-BR')}`;
    document.getElementById('sessaoValorAbertura').textContent = brl(s.valorAbertura);
    document.getElementById('sessaoVendasTotal').textContent = brl(t.totalVendas);
    document.getElementById('sessaoCaixaEsperado').textContent = brl(t.caixaEsperado);
    document.getElementById('sessaoPagamentosResumo').textContent =
      `Dinheiro ${brl(t.dinheiro)} · Pix ${brl(t.pix)} · Débito ${brl(t.debito)} · Crédito ${brl(t.credito)} · Outras ${brl(t.outros)} · Fiado ${brl(t.fiado)}`;
    renderHistory();
  }
  function renderHistory() {
    const list = document.getElementById('listaSessoesCaixa');
    if (!list) return;
    const filter = document.getElementById('filtroDataSessoesCaixa')?.value || '';
    const items = history().filter(s => !filter || String(s.abertoEm || '').slice(0,10) === filter);
    list.innerHTML = items.length ? items.map(s => {
      const closed = s.status === 'fechado';
      const f = s.fechamento || {};
      const date = new Date(s.abertoEm).toLocaleString('pt-BR');
      const closeDate = s.fechadoEm ? new Date(s.fechadoEm).toLocaleString('pt-BR') : 'Em andamento';
      const result = closed ? (f.resultado === 'exato' ? 'Conferido' : f.resultado === 'sobra' ? 'Sobra' : 'Falta') : 'Aberto';
      return `<article class="resumo-card" style="margin-bottom:9px">
        <strong>Sessão ${s.numero} · ${closed ? 'Fechada' : 'Aberta'}</strong>
        <span style="display:block;margin:6px 0">Abertura: ${date} · Fechamento: ${closeDate}</span>
        <span style="display:block">Operador: ${escapeHTML(s.operador || 'Não informado')}</span>
        <span style="display:block">Abertura: ${brl(s.valorAbertura)} · Total de vendas: ${brl(f.totalVendas || 0)}</span>
        ${closed ? `<span style="display:block">Esperado: ${brl(f.caixaEsperado)} · Contado: ${brl(f.dinheiroContado)} · ${result}: ${brl(Math.abs(f.diferenca || 0))}</span>` : ''}
        ${s.observacao ? `<span style="display:block">Obs.: ${escapeHTML(s.observacao)}</span>` : ''}
        ${closed && f.observacao ? `<span style="display:block">Fechamento: ${escapeHTML(f.observacao)}</span>` : ''}
      </article>`;
    }).join('') : '<div class="movimentacoes-vazio"><strong>Nenhuma sessão encontrada</strong><span>As aberturas e fechamentos aparecerão aqui.</span></div>';
  }
  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const brl = n => money(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function openSession(valor, operador, observacao) {
    if (current()) throw new Error('Já existe um caixa aberto.');
    if (!Number.isFinite(valor) || valor < 0) throw new Error('Informe um valor inicial válido.');
    const all = sessions();
    const s = {id:id(), numero:all.length+1, status:'aberto', abertoEm:now().toISOString(),
      valorAbertura:money(valor), operador:operador.trim(), observacao:observacao.trim(),
      fechadoEm:null, fechamento:null,
      auditoria:[{acao:'abertura', em:now().toISOString(), operador:operador.trim()}]};
    all.push(s); write(KEY, all); render(); window.carregarFluxo?.(); return s;
  }
  function closeSession(contado, observacao) {
    const s = current();
    if (!s) throw new Error('Não há caixa aberto.');
    if (!Number.isFinite(contado) || contado < 0) throw new Error('Informe o dinheiro contado.');
    const t = totals(s);
    const diferenca = money(contado - t.caixaEsperado);
    const all = sessions();
    const i = all.findIndex(x => x.id === s.id);
    const fechadoEm = now().toISOString();
    all[i] = {...s, status:'fechado', fechadoEm,
      fechamento:{...t, dinheiroContado:money(contado), diferenca,
        resultado:diferenca===0?'exato':diferenca>0?'sobra':'falta',
        observacao:observacao.trim(), fechadoPor:s.operador || ''},
      auditoria:[...(s.auditoria || []), {acao:'fechamento', em:fechadoEm,
        valorEsperado:t.caixaEsperado, dinheiroContado:money(contado), diferenca}]};
    write(KEY, all); render(); window.carregarFluxo?.(); return all[i];
  }
  function history() { return sessions().slice().reverse(); }
  function init() {
    document.getElementById('filtroDataSessoesCaixa')?.addEventListener('change', renderHistory);
    document.getElementById('btnImprimirSessoesCaixa')?.addEventListener('click', () => window.print());
    document.getElementById('btnAbrirSessaoCaixa')?.addEventListener('click', () => {
      const m=document.getElementById('modalAbrirSessaoCaixa'); if(m)m.classList.add('ativo');
    });
    document.getElementById('btnFecharModalAbrirCaixa')?.addEventListener('click',()=>document.getElementById('modalAbrirSessaoCaixa')?.classList.remove('ativo'));
    document.getElementById('formAbrirSessaoCaixa')?.addEventListener('submit',e=>{
      e.preventDefault();
      try {
        openSession(Number(document.getElementById('valorAberturaCaixa').value),
          document.getElementById('operadorAberturaCaixa').value,
          document.getElementById('obsAberturaCaixa').value);
        e.target.reset(); document.getElementById('modalAbrirSessaoCaixa').classList.remove('ativo');
      } catch(err){ alert(err.message); }
    });
    document.getElementById('btnFecharSessaoCaixa')?.addEventListener('click',()=>{
      const s=current(); if(!s)return;
      const t=totals(s);
      document.getElementById('fechamentoEsperadoCaixa').textContent=brl(t.caixaEsperado);
      document.getElementById('fechamentoResumoCaixa').textContent =
        `Vendas: ${t.vendas} · Total: ${brl(t.totalVendas)} · Dinheiro: ${brl(t.dinheiro)} · Pix: ${brl(t.pix)} · Débito: ${brl(t.debito)} · Crédito: ${brl(t.credito)} · Fiado: ${brl(t.fiado)} · Entradas: ${brl(t.entradas)} · Saídas: ${brl(t.saidas)}`;
      document.getElementById('modalFecharSessaoCaixa').classList.add('ativo');
    });
    document.getElementById('btnCancelarFechamentoCaixa')?.addEventListener('click',()=>document.getElementById('modalFecharSessaoCaixa')?.classList.remove('ativo'));
    document.getElementById('formFecharSessaoCaixa')?.addEventListener('submit',e=>{
      e.preventDefault();
      try {
        const f=closeSession(Number(document.getElementById('valorContadoCaixa').value),document.getElementById('obsFechamentoCaixa').value);
        document.getElementById('modalFecharSessaoCaixa').classList.remove('ativo');
        alert(f.fechamento.resultado === 'exato' ? 'Caixa fechado. Os valores conferem.' : `Caixa fechado. ${f.fechamento.resultado === 'sobra' ? 'Sobra' : 'Falta'} de ${brl(Math.abs(f.fechamento.diferenca))}.`);
        render();
      } catch(err){alert(err.message);}
    });
    render();
  }
  window.DrTrocoCaixa = {current, requireOpen, attachSale, attachMovement, totals, history, render, sessions, openSession, closeSession};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
