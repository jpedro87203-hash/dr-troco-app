// =====================================================
// DR. TROCO
// SISTEMA DE LICENÇA COM SUPABASE
// =====================================================

const CHAVE_LICENCA = 'drTroco_licenca';


// =====================================================
// CONFIGURAÇÃO DO SUPABASE
// =====================================================

const SUPABASE_URL =
    'https://wgfltbowqvyruwdhgjgb.supabase.co';

const SUPABASE_ANON_KEY =
    'sb_publishable_o8FPOzZMSuJTzRy1j-q_Kw_oXT75y-_';


const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


// =====================================================
// ELEMENTOS DA PÁGINA
// =====================================================

const codigoLicenca =
    document.getElementById('codigoLicenca');

const btnAtivarLicenca =
    document.getElementById('btnAtivarLicenca');

const textoStatusLicenca =
    document.getElementById('textoStatusLicenca');


// =====================================================
// CONVERTER DATA DO SUPABASE
// YYYY-MM-DD
// PARA DATA REAL
// =====================================================

function converterDataBanco(dataTexto) {

    if (!dataTexto) {
        return null;
    }

    const partes =
        String(dataTexto).split('-');

    if (partes.length !== 3) {
        return null;
    }

    const ano = Number(partes[0]);
    const mes = Number(partes[1]) - 1;
    const dia = Number(partes[2]);

    const data =
        new Date(ano, mes, dia);

    if (isNaN(data.getTime())) {
        return null;
    }

    data.setHours(23, 59, 59, 999);

    return data;
}


// =====================================================
// FORMATAR DATA
// =====================================================

function formatarData(data) {

    if (!data) {
        return 'Não informado';
    }

    const dia =
        String(data.getDate())
            .padStart(2, '0');

    const mes =
        String(data.getMonth() + 1)
            .padStart(2, '0');

    const ano =
        data.getFullYear();

    return `${dia}/${mes}/${ano}`;
}


// =====================================================
// VERIFICAR SE LICENÇA ESTÁ VÁLIDA
// =====================================================

function verificarLicenca(licenca) {

    if (!licenca) {
        return false;
    }

    if (!licenca.validade) {
        return false;
    }

    if (licenca.ativa === false) {
        return false;
    }

    const dataVencimento =
        converterDataBanco(
            licenca.validade
        );

    if (!dataVencimento) {
        return false;
    }

    const agora =
        new Date();

    return agora <= dataVencimento;
}


// =====================================================
// MOSTRAR LICENÇA SALVA
// =====================================================

function mostrarLicenca() {

    const dados =
        localStorage.getItem(
            CHAVE_LICENCA
        );


    if (!dados) {

        textoStatusLicenca.innerHTML =
            '🔴 Nenhuma licença ativada.';

        return;
    }


    try {

        const licenca =
            JSON.parse(dados);


        const ativa =
            verificarLicenca(licenca);


        const dataInicio =
            licenca.inicio
                ? converterDataBanco(
                    licenca.inicio
                )
                : null;


        const dataValidade =
            licenca.validade
                ? converterDataBanco(
                    licenca.validade
                )
                : null;


        const inicio =
            formatarData(
                dataInicio
            );


        const validade =
            formatarData(
                dataValidade
            );


        if (ativa) {

            textoStatusLicenca.innerHTML =

                `🟢 Licença ativa<br><br>` +

                `<strong>Código:</strong> ` +
                `${licenca.codigo}<br>` +

                `<strong>Comércio:</strong> ` +
                `${licenca.comercio}<br>` +

                `<strong>Plano:</strong> ` +
                `${licenca.plano || 'Mensal'}<br>` +

                `<strong>Início:</strong> ` +
                `${inicio}<br>` +

                `<strong>Válida até:</strong> ` +
                `${validade}`;

        } else {

            textoStatusLicenca.innerHTML =

                `🔴 Licença expirada<br><br>` +

                `<strong>Código:</strong> ` +
                `${licenca.codigo}<br>` +

                `<strong>Comércio:</strong> ` +
                `${licenca.comercio}<br>` +

                `<strong>Vencida em:</strong> ` +
                `${validade}<br><br>` +

                `Renove sua licença para continuar ` +
                `utilizando o Dr. Troco.`;
        }


    } catch (erro) {

        console.error(
            'Erro ao ler licença:',
            erro
        );

        textoStatusLicenca.innerHTML =
            '🔴 Não foi possível verificar a licença.';
    }
}


// =====================================================
// CONSULTAR LICENÇA NO SUPABASE
// =====================================================

async function consultarLicenca(codigo) {

    const resultado =
        await supabaseClient.rpc(
            'verificar_licenca',
            {
                codigo_informado:
                    codigo
            }
        );


    const data =
        resultado.data;

    const error =
        resultado.error;


    if (error) {

        console.error(
            'Erro Supabase:',
            error
        );

        throw error;
    }


    if (!data || data.length === 0) {

        return null;
    }


    return data[0];
}


// =====================================================
// ATIVAR LICENÇA
// =====================================================

if (btnAtivarLicenca) {

    btnAtivarLicenca.addEventListener(
        'click',
        async function() {

            const codigo =
                codigoLicenca.value
                    .trim()
                    .toUpperCase();


            if (!codigo) {

                alert(
                    'Digite o código da licença.'
                );

                codigoLicenca.focus();

                return;
            }


            // =========================================
            // DESABILITAR BOTÃO
            // =========================================

            btnAtivarLicenca.disabled =
                true;


            btnAtivarLicenca.innerHTML =
                '<span>⏳</span>' +
                '<span>Verificando...</span>';


            try {

                // =====================================
                // CONSULTAR SUPABASE
                // =====================================

                const licenca =
                    await consultarLicenca(
                        codigo
                    );


                // =====================================
                // CÓDIGO NÃO ENCONTRADO
                // =====================================

                if (!licenca) {

                    alert(
                        'Código de licença inválido.'
                    );

                    return;
                }


                // =====================================
                // LICENÇA DESATIVADA
                // =====================================

                if (licenca.ativa === false) {

                    alert(
                        'Esta licença está desativada.'
                    );

                    return;
                }


                // =====================================
                // LICENÇA EXPIRADA
                // =====================================

                if (!verificarLicenca(licenca)) {
    localStorage.removeItem(CHAVE_LICENCA);

    mostrarLicenca();

    alert('Esta licença está expirada.');
    return;
                }


                // =====================================
                // SALVAR LICENÇA NO CELULAR
                // =====================================

                const licencaLocal = {

                    codigo:
                        licenca.codigo,

                    comercio:
                        licenca.comercio,

                    plano:
                        licenca.plano,

                    inicio:
                        licenca.inicio,

                    validade:
                        licenca.validade,

                    ativa:
                        licenca.ativa

                };


                localStorage.setItem(
                    CHAVE_LICENCA,
                    JSON.stringify(
                        licencaLocal
                    )
                );


                // =====================================
                // SUCESSO
                // =====================================

                alert('Licença ativada com sucesso!');

codigoLicenca.value = '';

window.location.href = 'index.html';


            } catch (erro) {

                console.error(
                    'Erro ao ativar licença:',
                    erro
                );

                alert(
                    'ERRO DO SUPABASE:\n\n' +
                    'Mensagem: ' +
                    (erro.message || 'Sem mensagem') +
                    '\n\nCódigo: ' +
                    (erro.code || 'Sem código') +
                    '\n\nDetalhes: ' +
                    (erro.details || 'Sem detalhes')
                );

            } finally {

                btnAtivarLicenca.disabled =
                    false;


                btnAtivarLicenca.innerHTML =
                    '<span>✓</span>' +
                    '<span>Ativar licença</span>';
            }

        }
    );
}


// =====================================================
// INICIALIZAÇÃO
// =====================================================

mostrarLicenca();
