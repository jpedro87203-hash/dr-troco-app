/* =========================================================
   DR. TROCO — FORNECEDORES
   Cadastro de fornecedores e registro de compras
   Armazenamento: localStorage (drTroco_fornecedores)
   ========================================================= */

'use strict';

(() => {
  const CHAVE = 'drTroco_fornecedores';
  const CHAVE_ESTOQUE_BASE = 'drTroco_estoque';

  const $ = (id) => document.getElementById(id);

  function lerFornecedores() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return [];
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? dados : [];
    } catch (erro) {
      console.error('Erro ao ler fornecedores:', erro);
      return [];
    }
  }

  function salvarFornecedores(lista) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista));
      return true;
    } catch (erro) {
      console.error('Erro ao salvar fornecedores:', erro);
      alert('Não foi possível salvar. Verifique o espaço do navegador.');
      return false;
    }
  }

  function gerarId() {
    return 'forn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function formatarReal(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL'
    });
  }

  function formatarData(iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  }

  function dataHojeISO() {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }

  function normalizar(txt) {
    return String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase();
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

  function obterChaveEstoque() {
    const cid = obterComercioIdLocal();
    return cid ? `${CHAVE_ESTOQUE_BASE}_${cid}` : CHAVE_ESTOQUE_BASE;
  }

  function listarProdutosEstoque() {
    try {
      const bruto = localStorage.getItem(obterChaveEstoque());
      if (!bruto) return [];
      const dados = JSON.parse(bruto);
      return Array.isArray(dados) ? dados : [];
    } catch (e) {
      return [];
    }
  }

  // Injeta estilos isolados com prefixo "frn-"
  function adicionarEstilos() {
    if (document.getElementById('estilosFornecedores')) return;
    const estilo = document.createElement('style');
    estilo.id = 'estilosFornecedores';
    estilo.textContent = `
      .frn-topo {
        display: flex;
        gap: 8px;
        margin-bottom: 14px;
      }

      .frn-btn {
        flex: 1;
        min-height: 42px;
        border: 0;
        border-radius: 10px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .frn-btn-principal {
        background: #168b53;
        color: #fff;
      }

      .frn-btn-secundario {
        background: #eef4f0;
        color: #168b53;
        border: 1px solid #d6e3d9;
      }

      .frn-form {
        display: grid;
        gap: 12px;
        padding: 14px;
        margin-bottom: 14px;
        border: 1px solid #e4eee7;
        border-radius: 13px;
        background: #fafcfb;
      }

      .frn-form h3 {
        margin: 0;
        font-size: 14px;
        color: #1f3028;
      }

      .frn-campo {
        display: grid;
        gap: 6px;
      }

      .frn-campo label {
        font-size: 12px;
        font-weight: 700;
        color: #34483d;
      }

      .frn-campo input,
      .frn-campo textarea,
      .frn-campo select {
        box-sizing: border-box;
        width: 100%;
        min-height: 42px;
        padding: 10px 12px;
        border: 1px solid #d6e3d9;
        border-radius: 10px;
        background: #fff;
        color: #203126;
        font: inherit;
        font-size: 14px;
      }

      .frn-campo input:focus,
      .frn-campo textarea:focus {
        outline: none;
        border-color: #20a767;
        box-shadow: 0 0 0 3px rgba(32, 167, 103, .12);
      }

      .frn-form-acoes {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }

      .frn-form-acoes .frn-btn {
        flex: 1;
      }

      .frn-lista {
        display: grid;
        gap: 10px;
      }

      .frn-card {
        padding: 14px;
        border: 1px solid #e3ece5;
        border-radius: 13px;
        background: #fff;
      }

      .frn-card-topo {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
      }

      .frn-nome {
        margin: 0;
        color: #1f3028;
        font-size: 15px;
        overflow-wrap: anywhere;
      }

      .frn-total {
        color: #176b3a;
        font-size: 15px;
        font-weight: 900;
        white-space: nowrap;
      }

      .frn-contato {
        margin: 8px 0 0;
        color: #607166;
        font-size: 12px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .frn-contato b { color: #1f3028; }

      .frn-detalhes {
        margin-top: 12px;
      }

      .frn-detalhes summary {
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        color: #168b53;
        padding: 6px 0;
        list-style: none;
      }

      .frn-detalhes summary::-webkit-details-marker { display: none; }

      .frn-detalhes summary::after {
        content: "▾";
        margin-left: 6px;
        display: inline-block;
        transition: transform .2s;
      }

      .frn-detalhes[open] summary::after {
        transform: rotate(180deg);
      }

      .frn-compras {
        display: grid;
        gap: 8px;
        padding-top: 8px;
      }

      .frn-compra {
        padding: 10px 12px;
        border-radius: 10px;
        background: #f5f9f6;
        font-size: 12px;
        color: #4b5f53;
        line-height: 1.5;
      }

      .frn-compra-topo {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 4px;
      }

      .frn-compra-nome {
        font-weight: 700;
        color: #1f3028;
        overflow-wrap: anywhere;
      }

      .frn-compra-total {
        font-weight: 900;
        color: #176b3a;
        white-space: nowrap;
      }

      .frn-acoes {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .frn-acoes .frn-btn {
        flex: 1;
      }

      .frn-btn-perigo {
        background: #fff0f0;
        color: #b42318;
        border: 1px solid #f0d8d8;
      }

      .frn-vazio {
        padding: 22px 12px;
        text-align: center;
        border: 1px dashed #d6e3d9;
        border-radius: 12px;
        color: #718076;
        font-size: 13px;
      }
    `;
    document.head.appendChild(estilo);
  }

  /* =========================================================
     RENDERIZAÇÃO
  ========================================================== */

  let editandoId = null;
  let compraFornecedorId = null;

  function renderizar() {
    const area = $('fornecedoresArea');
    if (!area) return;

    const fornecedores = lerFornecedores();

    area.innerHTML = `
      <div class="frn-topo">
        <button type="button" class="frn-btn frn-btn-principal" id="frnBtnNovo">
          ＋ Novo fornecedor
        </button>
      </div>

      <div id="frnFormArea"></div>
      <div id="frnLista" class="frn-lista"></div>
    `;

    $('frnBtnNovo').addEventListener('click', () => abrirFormularioFornecedor(null));

    if (fornecedores.length === 0) {
      $('frnLista').innerHTML = `
        <div class="frn-vazio">
          <div style="font-size:26px;margin-bottom:8px">📦</div>
          Nenhum fornecedor cadastrado.
          <br>
          Toque em <b>＋ Novo fornecedor</b> para começar.
        </div>`;
      return;
    }

    // Ordena por nome
    fornecedores.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

    $('frnLista').innerHTML = fornecedores.map(f => renderizarCard(f)).join('');

    // Liga eventos
    fornecedores.forEach(f => {
      const card = document.querySelector(`[data-forn-id="${f.id}"]`);
      if (!card) return;

      card.querySelector('[data-acao="editar"]')?.addEventListener('click', () => {
        abrirFormularioFornecedor(f);
      });
      card.querySelector('[data-acao="comprar"]')?.addEventListener('click', () => {
        abrirFormularioCompra(f.id);
      });
      card.querySelector('[data-acao="excluir"]')?.addEventListener('click', () => {
        excluirFornecedor(f.id);
      });
    });
  }

  function renderizarCard(f) {
    const compras = Array.isArray(f.compras) ? f.compras : [];
    const total = compras.reduce((s, c) => s + Number(c.quantidade || 0) * Number(c.precoUnitario || 0), 0);

    const contatos = [];
    if (f.telefone) contatos.push(`📞 ${escaparHTML(f.telefone)}`);
    if (f.email) contatos.push(`✉️ ${escaparHTML(f.email)}`);

    const comprasHtml = compras.length === 0
      ? '<div class="frn-compra">Nenhuma compra registrada ainda.</div>'
      : [...compras].reverse().map(c => `
        <div class="frn-compra">
          <div class="frn-compra-topo">
            <span class="frn-compra-nome">${escaparHTML(c.produto)}</span>
            <span class="frn-compra-total">${formatarReal(Number(c.quantidade) * Number(c.precoUnitario))}</span>
          </div>
          <span>${Number(c.quantidade)} × ${formatarReal(c.precoUnitario)} · ${formatarData(c.data)}</span>
          ${c.observacao ? `<div style="margin-top:4px">${escaparHTML(c.observacao)}</div>` : ''}
        </div>`).join('');

    return `
      <article class="frn-card" data-forn-id="${escaparHTML(f.id)}">
        <div class="frn-card-topo">
          <h3 class="frn-nome">${escaparHTML(f.nome)}</h3>
          <span class="frn-total">${formatarReal(total)}</span>
        </div>
        ${contatos.length ? `<p class="frn-contato">${contatos.join(' · ')}</p>` : ''}

        <details class="frn-detalhes">
          <summary>Histórico de compras (${compras.length})</summary>
          <div class="frn-compras">${comprasHtml}</div>
        </details>

        <div class="frn-acoes">
          <button type="button" class="frn-btn frn-btn-principal" data-acao="comprar">＋ Compra</button>
          <button type="button" class="frn-btn frn-btn-secundario" data-acao="editar">Editar</button>
          <button type="button" class="frn-btn frn-btn-perigo" data-acao="excluir">Excluir</button>
        </div>
      </article>`;
  }

  /* =========================================================
     FORMULÁRIO DE FORNECEDOR
  ========================================================== */

  function abrirFormularioFornecedor(fornecedor) {
    const area = $('frnFormArea');
    if (!area) return;

    editandoId = fornecedor ? fornecedor.id : null;

    area.innerHTML = `
      <form class="frn-form" id="frnFormFornecedor">
        <h3>${fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>

        <div class="frn-campo">
          <label for="frnNome">Nome *</label>
          <input id="frnNome" type="text" maxlength="120" required
            value="${escaparHTML(fornecedor?.nome || '')}"
            placeholder="Ex.: Distribuidora Central">
        </div>

        <div class="frn-campo">
          <label for="frnTelefone">Telefone (opcional)</label>
          <input id="frnTelefone" type="tel" maxlength="30"
            value="${escaparHTML(fornecedor?.telefone || '')}"
            placeholder="(98) 99999-9999">
        </div>

        <div class="frn-campo">
          <label for="frnEmail">E-mail (opcional)</label>
          <input id="frnEmail" type="email" maxlength="120"
            value="${escaparHTML(fornecedor?.email || '')}"
            placeholder="contato@fornecedor.com">
        </div>

        <div class="frn-form-acoes">
          <button type="button" class="frn-btn frn-btn-secundario" id="frnCancelar">Cancelar</button>
          <button type="submit" class="frn-btn frn-btn-principal">Salvar</button>
        </div>
      </form>`;

    $('frnCancelar').addEventListener('click', () => {
      area.innerHTML = '';
      editandoId = null;
    });

    $('frnFormFornecedor').addEventListener('submit', salvarFornecedor);
    $('frnNome').focus();
  }

  function salvarFornecedor(evento) {
    evento.preventDefault();

    const nome = $('frnNome').value.trim();
    const telefone = $('frnTelefone').value.trim();
    const email = $('frnEmail').value.trim();

    if (!nome) {
      alert('Informe o nome do fornecedor.');
      $('frnNome').focus();
      return;
    }

    const lista = lerFornecedores();

    if (editandoId) {
      const idx = lista.findIndex(f => f.id === editandoId);
      if (idx >= 0) {
        lista[idx].nome = nome;
        lista[idx].telefone = telefone;
        lista[idx].email = email;
      }
    } else {
      lista.push({
        id: gerarId(),
        nome,
        telefone,
        email,
        compras: [],
        criadoEm: new Date().toISOString()
      });
    }

    if (salvarFornecedores(lista)) {
      editandoId = null;
      renderizar();
    }
  }

  function excluirFornecedor(id) {
    const lista = lerFornecedores();
    const f = lista.find(x => x.id === id);
    if (!f) return;

    if (!confirm(`Excluir o fornecedor "${f.nome}"?\n\nO histórico de compras dele também será apagado.`)) {
      return;
    }

    if (salvarFornecedores(lista.filter(x => x.id !== id))) {
      renderizar();
    }
  }

  /* =========================================================
     FORMULÁRIO DE COMPRA
  ========================================================== */

  function abrirFormularioCompra(fornecedorId) {
    const lista = lerFornecedores();
    const fornecedor = lista.find(f => f.id === fornecedorId);
    if (!fornecedor) return;

    compraFornecedorId = fornecedorId;

    const produtos = listarProdutosEstoque();
    const opcoes = produtos
      .map(p => `<option value="${escaparHTML(p.nome)}">`)
      .join('');

    const area = $('frnFormArea');
    area.innerHTML = `
      <form class="frn-form" id="frnFormCompra">
        <h3>＋ Nova compra — ${escaparHTML(fornecedor.nome)}</h3>

        <div class="frn-campo">
          <label for="frnProduto">Produto comprado *</label>
          <input id="frnProduto" type="text" maxlength="120" required
            list="frnListaProdutos" autocomplete="off"
            placeholder="Ex.: Arroz 5kg">
          <datalist id="frnListaProdutos">${opcoes}</datalist>
        </div>

        <div class="frn-campo">
          <label for="frnQtd">Quantidade *</label>
          <input id="frnQtd" type="number" min="1" step="1" required value="1">
        </div>

        <div class="frn-campo">
          <label for="frnPreco">Preço unitário de compra (R$) *</label>
          <input id="frnPreco" type="number" min="0.01" step="0.01"
            inputmode="decimal" required placeholder="0,00">
        </div>

        <div class="frn-campo">
          <label for="frnData">Data da compra</label>
          <input id="frnData" type="date" value="${dataHojeISO()}" required>
        </div>

        <div class="frn-campo">
          <label for="frnObs">Observação (opcional)</label>
          <textarea id="frnObs" maxlength="200" rows="2"
            placeholder="Nota fiscal, condições, etc."></textarea>
        </div>

        <div class="frn-form-acoes">
          <button type="button" class="frn-btn frn-btn-secundario" id="frnCancelarCompra">Cancelar</button>
          <button type="submit" class="frn-btn frn-btn-principal">Registrar compra</button>
        </div>
      </form>`;

    $('frnCancelarCompra').addEventListener('click', () => {
      area.innerHTML = '';
      compraFornecedorId = null;
    });

    $('frnFormCompra').addEventListener('submit', salvarCompra);
    $('frnProduto').focus();
  }

  function salvarCompra(evento) {
    evento.preventDefault();

    const produto = $('frnProduto').value.trim();
    const quantidade = Number($('frnQtd').value);
    const precoUnitario = Number($('frnPreco').value);
    const data = $('frnData').value;
    const observacao = $('frnObs').value.trim();

    if (!produto) { alert('Informe o nome do produto.'); return; }
    if (!Number.isFinite(quantidade) || quantidade <= 0) { alert('Informe a quantidade.'); return; }
    if (!Number.isFinite(precoUnitario) || precoUnitario <= 0) { alert('Informe o preço unitário.'); return; }
    if (!data) { alert('Informe a data da compra.'); return; }

    const lista = lerFornecedores();
    const fornecedor = lista.find(f => f.id === compraFornecedorId);
    if (!fornecedor) return;

    if (!Array.isArray(fornecedor.compras)) fornecedor.compras = [];

    fornecedor.compras.push({
      id: 'compra-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      produto,
      quantidade,
      precoUnitario: Math.round(precoUnitario * 100) / 100,
      data,
      observacao,
      criadoEm: new Date().toISOString()
    });

    if (salvarFornecedores(lista)) {
      // Aviso informativo se o produto existe no estoque
      const produtos = listarProdutosEstoque();
      const existe = produtos.find(p => normalizar(p.nome) === normalizar(produto));
      if (!existe) {
        alert(
          'Compra registrada!\n\n' +
          'Atenção: o produto "' + produto + '" não está cadastrado no estoque. ' +
          'O lucro será calculado normalmente, mas o produto não aparecerá para venda ' +
          'até você cadastrá-lo em Estoque.'
        );
      }

      compraFornecedorId = null;
      renderizar();
    }
  }

  /* =========================================================
     INICIALIZAÇÃO
  ========================================================== */

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
