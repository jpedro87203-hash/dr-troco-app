
/* =========================================================
   DR. TROCO — BACKUP E RESTAURAÇÃO
   Arquivo: backup.js
   Versão do backup: 1
   ========================================================= */

'use strict';

(() => {
  const VERSAO_BACKUP = 1;

  // Todas as chaves de dados identificadas no aplicativo.
  const CHAVES = {
    vendas: 'drTroco_vendas',
    movimentacoes: 'drTroco_movimentacoes',
    saldosIniciais: 'drTroco_saldosIniciais',
    estoque: 'drTroco_estoque',
    movimentacoesEstoque: 'drTroco_movimentacoesEstoque',
    fiadoClientes: 'drTroco_fiadoClientes',
    contasPagar: 'drTroco_contasPagar'
  };

  const CHAVES_LISTAS = [
    CHAVES.vendas,
    CHAVES.movimentacoes,
    CHAVES.estoque,
    CHAVES.movimentacoesEstoque,
    CHAVES.fiadoClientes,
    CHAVES.contasPagar
  ];

  // ---------------------------------------------------------
  // UTILITÁRIOS
  // ---------------------------------------------------------

  function mostrarMensagem(mensagem) {
    alert('Dr. Troco\n\n' + mensagem);
  }

  function dadosPadrao(chave) {
    return chave === CHAVES.saldosIniciais ? {} : [];
  }

  function validarTipos(dados) {
    for (const chave of CHAVES_LISTAS) {
      if (!Array.isArray(dados[chave])) {
        throw new Error(
          'A estrutura dos dados "' + chave + '" é inválida.'
        );
      }
    }

    const saldos = dados[CHAVES.saldosIniciais];

    if (
      saldos === null ||
      typeof saldos !== 'object'
    ) {
      throw new Error(
        'A estrutura dos saldos iniciais é inválida.'
      );
    }

    return true;
  }

  // ---------------------------------------------------------
  // LER OS DADOS DO APLICATIVO
  // ---------------------------------------------------------

  function obterDadosAtuais() {
    const dados = {};

    for (const chave of Object.values(CHAVES)) {
      const valorSalvo = localStorage.getItem(chave);

      if (valorSalvo === null) {
        dados[chave] = dadosPadrao(chave);
        continue;
      }

      try {
        dados[chave] = JSON.parse(valorSalvo);
      } catch (erro) {
        throw new Error(
          'Não foi possível ler "' + chave + '". ' +
          'O backup foi cancelado para proteger seus dados.'
        );
      }
    }

    validarTipos(dados);

    return dados;
  }

  // ---------------------------------------------------------
  // GERAR E BAIXAR O ARQUIVO JSON
  // ---------------------------------------------------------

  function exportarBackup() {
    try {
      const backup = {
        aplicativo: 'Dr. Troco',
        tipo: 'backup-dados',
        versao: VERSAO_BACKUP,
        criadoEm: new Date().toISOString(),
        dados: obterDadosAtuais()
      };

      const conteudo = JSON.stringify(backup, null, 2);

      const arquivo = new Blob(
        [conteudo],
        { type: 'application/json;charset=utf-8' }
      );

      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');

      const data = new Date();
      const dataHora = [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, '0'),
        String(data.getDate()).padStart(2, '0'),
        '-',
        String(data.getHours()).padStart(2, '0'),
        String(data.getMinutes()).padStart(2, '0'),
        String(data.getSeconds()).padStart(2, '0')
      ].join('');

      link.href = url;
      link.download = 'Dr-Troco-Backup-' + dataHora + '.json';

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);

      mostrarMensagem(
        'O arquivo de backup foi preparado. ' +
        'Confira se ele foi salvo ou baixado no seu celular.'
      );

      return true;

    } catch (erro) {
      console.error('Erro ao criar backup:', erro);

      mostrarMensagem(
        erro.message ||
        'Não foi possível criar o backup.'
      );

      return false;
    }
  }

  // ---------------------------------------------------------
  // LER O ARQUIVO SELECIONADO
  // Compatibilidade com navegadores móveis.
  // ---------------------------------------------------------

  function lerArquivo(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();

      leitor.onload = () => resolve(String(leitor.result || ''));

      leitor.onerror = () => {
        reject(new Error('Não foi possível ler o arquivo selecionado.'));
      };

      leitor.readAsText(arquivo);
    });
  }

  // ---------------------------------------------------------
  // VALIDAR O BACKUP IMPORTADO
  // ---------------------------------------------------------

  function validarBackup(backup) {
    if (
      !backup ||
      typeof backup !== 'object' ||
      Array.isArray(backup)
    ) {
      throw new Error('O conteúdo do arquivo não é válido.');
    }

    if (backup.aplicativo !== 'Dr. Troco') {
      throw new Error(
        'Este arquivo não foi identificado como backup do Dr. Troco.'
      );
    }

    if (backup.tipo !== 'backup-dados') {
      throw new Error('O tipo de arquivo não é um backup reconhecido.');
    }

    if (backup.versao !== VERSAO_BACKUP) {
      throw new Error(
        'Versão de backup não compatível com esta versão do aplicativo.'
      );
    }

    if (
      !backup.dados ||
      typeof backup.dados !== 'object' ||
      Array.isArray(backup.dados)
    ) {
      throw new Error('O arquivo não contém os dados esperados.');
    }

    for (const chave of Object.values(CHAVES)) {
      if (
        !Object.prototype.hasOwnProperty.call(
          backup.dados,
          chave
        )
      ) {
        throw new Error(
          'O backup está incompleto. Falta a seção "' + chave + '".'
        );
      }
    }

    validarTipos(backup.dados);

    return true;
  }

  // ---------------------------------------------------------
  // RESTAURAR OS DADOS
  // Valida antes de substituir e tenta reverter em caso de erro.
  // ---------------------------------------------------------

  async function restaurarArquivo(arquivo) {
    if (!arquivo) return false;

    try {
      const texto = await lerArquivo(arquivo);
      let backup;

      try {
        backup = JSON.parse(texto);
      } catch (erro) {
        throw new Error(
          'O arquivo não contém um JSON válido.'
        );
      }

      validarBackup(backup);

      const confirmar = confirm(
        'ATENÇÃO — RESTAURAR BACKUP\n\n' +
        'Os dados atuais do Dr. Troco serão substituídos ' +
        'pelos dados desse arquivo.\n\n' +
        'Antes de continuar, confirme que você tem um backup ' +
        'recente dos dados atuais.\n\n' +
        'Deseja realmente continuar?'
      );

      if (!confirmar) return false;

      // Guarda os valores atuais para tentar reverter
      // caso algum armazenamento falhe durante a restauração.
      const anteriores = {};

      for (const chave of Object.values(CHAVES)) {
        anteriores[chave] = localStorage.getItem(chave);
      }

      try {
        for (const chave of Object.values(CHAVES)) {
          localStorage.setItem(
            chave,
            JSON.stringify(backup.dados[chave])
          );
        }
      } catch (erroGravacao) {
        let reversaoCompleta = true;

        for (const chave of Object.values(CHAVES)) {
          try {
            if (anteriores[chave] === null) {
              localStorage.removeItem(chave);
            } else {
              localStorage.setItem(
                chave,
                anteriores[chave]
              );
            }
          } catch (erroReversao) {
            reversaoCompleta = false;
            console.error(
              'Falha ao restaurar o valor anterior de ' + chave,
              erroReversao
            );
          }
        }

        if (!reversaoCompleta) {
          throw new Error(
            'O armazenamento apresentou uma falha durante a restauração, ' +
            'e não foi possível reverter todos os dados. ' +
            'Não feche a página; procure recuperar espaço no navegador ' +
            'e mantenha o arquivo de backup original.'
          );
        }

        throw new Error(
          'Não foi possível gravar todos os dados. ' +
          'Os valores anteriores foram restaurados. ' +
          'Verifique o espaço disponível no navegador.'
        );
      }

      mostrarMensagem(
        'Backup restaurado com sucesso! ' +
        'O aplicativo será atualizado.'
      );

      window.location.reload();

      return true;

    } catch (erro) {
      console.error('Erro ao restaurar backup:', erro);

      mostrarMensagem(
        erro.message ||
        'Não foi possível restaurar o backup.'
      );

      return false;
    }
  }

  // ---------------------------------------------------------
  // ABRIR O SELETOR DE ARQUIVOS DO CELULAR
  // ---------------------------------------------------------

  function selecionarArquivoEImportar() {
    const seletor = document.createElement('input');

    seletor.type = 'file';
    seletor.accept = '.json,application/json';
    seletor.style.display = 'none';

    document.body.appendChild(seletor);

    seletor.addEventListener('change', async () => {
      const arquivo = seletor.files && seletor.files[0];

      if (arquivo) {
        await restaurarArquivo(arquivo);
      }

      seletor.remove();
    });

    seletor.addEventListener('cancel', () => {
      seletor.remove();
    });

    seletor.click();
  }

  // ---------------------------------------------------------
  // API PÚBLICA PARA A INTERFACE
  // Será chamada pelos botões adicionados ao index.html.
  // ---------------------------------------------------------

  window.DrTrocoBackup = Object.freeze({
    exportar: exportarBackup,
    selecionarArquivoEImportar: selecionarArquivoEImportar,
    restaurarArquivo: restaurarArquivo
  });

  console.log('Dr. Troco: módulo de backup carregado.');

})();
