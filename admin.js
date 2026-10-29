// ==========================================
// DR. TROCO - PAINEL ADMINISTRATIVO
// ==========================================


// ==========================================
// 1. CONFIGURAÇÃO DO SUPABASE
// ==========================================

const SUPABASE_URL =
    'https://wyeutjahcgqjzalfraup.supabase.co';

const SUPABASE_ANON_KEY =
    'sb_publishable_S_rdGBhmzJrxniwy5Abb7A_tRb3wQsA';

const ID_ADMINISTRADOR =
    'f650eab5-f9e1-467f-a55f-15826c6f092a';

let supabaseClient = null;


// ==========================================
// 2. ELEMENTOS
// ==========================================

let emailAdmin;
let senhaAdmin;
let btnEntrarAdmin;

let areaLogin;
let areaAdmin;

let nomeComercio;
let btnGerarLicenca;

let resultadoLicenca;
let dadosLicenca;

let btnCopiarLicenca;
let btnSairAdmin;

let btnVoltarLogin;
let btnVoltarAdmin;

// Gerenciamento
let pesquisaLicencas;
let btnAtualizarLicencas;
let listaLicencas;

let totalLicencas;
let licencasAtivas;
let licencasExpiradas;
let licencasDesativadas;

let todasLicencas = [];

let ultimaLicenca = '';


// ==========================================
// 3. INICIALIZAÇÃO
// ==========================================

function inicializarAdmin() {

    if (
        typeof window.supabase === 'undefined' ||
        !window.supabase.createClient
    ) {
        alert(
            'ERRO:\n\n' +
            'A biblioteca do Supabase não foi carregada.\n\n' +
            'Verifique sua conexão com a internet.'
        );

        return;
    }

    supabaseClient =
        window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

    // --------------------------------------
    // Elementos
    // --------------------------------------

    emailAdmin =
        document.getElementById('emailAdmin');

    senhaAdmin =
        document.getElementById('senhaAdmin');

    btnEntrarAdmin =
        document.getElementById('btnEntrarAdmin');

    areaLogin =
        document.getElementById('areaLogin');

    areaAdmin =
        document.getElementById('areaAdmin');

    nomeComercio =
        document.getElementById('nomeComercio');

    btnGerarLicenca =
        document.getElementById('btnGerarLicenca');

    resultadoLicenca =
        document.getElementById('resultadoLicenca');

    dadosLicenca =
        document.getElementById('dadosLicenca');

    btnCopiarLicenca =
        document.getElementById('btnCopiarLicenca');

    btnSairAdmin =
        document.getElementById('btnSairAdmin');

    btnVoltarLogin =
        document.getElementById('btnVoltarLogin');

    btnVoltarAdmin =
        document.getElementById('btnVoltarAdmin');


    // Gerenciamento

    pesquisaLicencas =
        document.getElementById('pesquisaLicencas');

    btnAtualizarLicencas =
        document.getElementById('btnAtualizarLicencas');

    listaLicencas =
        document.getElementById('listaLicencas');

    totalLicencas =
        document.getElementById('totalLicencas');

    licencasAtivas =
        document.getElementById('licencasAtivas');

    licencasExpiradas =
        document.getElementById('licencasExpiradas');

    licencasDesativadas =
        document.getElementById('licencasDesativadas');


    // --------------------------------------
    // Eventos
    // --------------------------------------

    if (btnEntrarAdmin) {
        btnEntrarAdmin.addEventListener(
            'click',
            fazerLogin
        );
    }

    if (btnGerarLicenca) {
        btnGerarLicenca.addEventListener(
            'click',
            gerarLicenca
        );
    }

    if (btnCopiarLicenca) {
        btnCopiarLicenca.addEventListener(
            'click',
            copiarLicenca
        );
    }

    if (btnSairAdmin) {
        btnSairAdmin.addEventListener(
            'click',
            sairAdmin
        );
    }

    if (btnVoltarLogin) {
        btnVoltarLogin.addEventListener(
            'click',
            function () {
                window.location.href =
                    'index.html';
            }
        );
    }

    if (btnVoltarAdmin) {
        btnVoltarAdmin.addEventListener(
            'click',
            function () {
                window.location.href =
                    'index.html';
            }
        );
    }

    if (btnAtualizarLicencas) {
        btnAtualizarLicencas.addEventListener(
            'click',
            carregarLicencas
        );
    }

    if (pesquisaLicencas) {
        pesquisaLicencas.addEventListener(
            'input',
            renderizarLicencas
        );
    }


    // --------------------------------------
    // Enter no login
    // --------------------------------------

    if (emailAdmin) {
        emailAdmin.addEventListener(
            'keydown',
            function (event) {

                if (event.key === 'Enter') {
                    event.preventDefault();
                    fazerLogin();
                }

            }
        );
    }

    if (senhaAdmin) {
        senhaAdmin.addEventListener(
            'keydown',
            function (event) {

                if (event.key === 'Enter') {
                    event.preventDefault();
                    fazerLogin();
                }

            }
        );
    }

    verificarSessao();
}


// ==========================================
// 4. VERIFICAR SESSÃO
// ==========================================

async function verificarSessao() {

    if (!supabaseClient) return;

    try {

        const resultado =
            await supabaseClient.auth.getUser();

        const user =
            resultado.data
                ? resultado.data.user
                : null;

        if (!user) {
            mostrarLogin();
            return;
        }

        if (user.id !== ID_ADMINISTRADOR) {

            await supabaseClient.auth.signOut();

            mostrarLogin();

            return;
        }

        mostrarPainelAdmin();

    } catch (erro) {

        console.error(
            'Erro ao verificar sessão:',
            erro
        );

        mostrarLogin();
    }
}


// ==========================================
// 5. LOGIN
// ==========================================

async function fazerLogin() {

    if (!supabaseClient) {
        alert('O Supabase não foi carregado.');
        return;
    }

    if (!emailAdmin || !senhaAdmin) {
        alert(
            'Os campos de login não foram encontrados.'
        );
        return;
    }

    const email =
        emailAdmin.value
            .trim()
            .toLowerCase();

    const senha =
        senhaAdmin.value;

    if (!email) {

        alert(
            'Digite o e-mail do administrador.'
        );

        emailAdmin.focus();

        return;
    }

    if (!senha) {

        alert('Digite a senha.');

        senhaAdmin.focus();

        return;
    }

    if (btnEntrarAdmin) {

        btnEntrarAdmin.disabled = true;

        btnEntrarAdmin.innerHTML =
            '<span>⏳</span>' +
            '<span>Entrando...</span>';
    }

    try {

        const resultado =
            await supabaseClient.auth
                .signInWithPassword({
                    email: email,
                    password: senha
                });

        const data =
            resultado.data;

        const error =
            resultado.error;

        if (error) {

            console.error(
                'Erro Supabase:',
                error
            );

            alert(
                'NÃO FOI POSSÍVEL ENTRAR.\n\n' +
                'Mensagem:\n' +
                (error.message || 'Sem mensagem') +
                '\n\nCódigo:\n' +
                (error.code || 'Não informado') +
                '\n\nStatus:\n' +
                (error.status || 'Não informado')
            );

            return;
        }

        const user =
            data && data.user
                ? data.user
                : null;

        if (!user) {

            alert(
                'O Supabase não retornou o usuário.'
            );

            return;
        }

        if (user.id !== ID_ADMINISTRADOR) {

            await supabaseClient.auth.signOut();

            alert(
                'ACESSO NEGADO.\n\n' +
                'Este usuário não é o administrador autorizado.'
            );

            return;
        }

        alert(
            'Login realizado com sucesso!'
        );

        mostrarPainelAdmin();

    } catch (erro) {

        console.error(
            'Erro inesperado no login:',
            erro
        );

        alert(
            'ERRO AO REALIZAR LOGIN.\n\n' +
            (erro.message || erro)
        );

    } finally {

        if (btnEntrarAdmin) {

            btnEntrarAdmin.disabled = false;

            btnEntrarAdmin.innerHTML =
                '<span>🔐</span>' +
                '<span>Entrar</span>';
        }
    }
}


// ==========================================
// 6. MOSTRAR LOGIN
// ==========================================

function mostrarLogin() {

    if (areaLogin) {
        areaLogin.style.display = 'block';
    }

    if (areaAdmin) {
        areaAdmin.style.display = 'none';
    }
}


// ==========================================
// 7. MOSTRAR PAINEL
// ==========================================

function mostrarPainelAdmin() {

    if (areaLogin) {
        areaLogin.style.display = 'none';
    }

    if (areaAdmin) {
        areaAdmin.style.display = 'block';
    }

    if (nomeComercio) {
        nomeComercio.focus();
    }

    // Carregar licenças automaticamente
    carregarLicencas();
}


// ==========================================
// 8. GERAR CÓDIGO
// ==========================================

function gerarCodigoLicenca() {

    const caracteres =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    function parte() {

        let resultado = '';

        for (let i = 0; i < 4; i++) {

            const indice =
                Math.floor(
                    Math.random() *
                    caracteres.length
                );

            resultado +=
                caracteres[indice];
        }

        return resultado;
    }

    return (
        'DT-' +
        parte() +
        '-' +
        parte()
    );
}


// ==========================================
// 9. DATA ISO
// ==========================================

function dataISO(data) {

    const ano =
        data.getFullYear();

    const mes =
        String(
            data.getMonth() + 1
        ).padStart(2, '0');

    const dia =
        String(
            data.getDate()
        ).padStart(2, '0');

    return (
        ano +
        '-' +
        mes +
        '-' +
        dia
    );
}


// ==========================================
// 10. DATA BR
// ==========================================

function dataBR(dataISOTexto) {

    if (!dataISOTexto) {
        return '';
    }

    const partes =
        String(dataISOTexto)
            .split('-');

    if (partes.length !== 3) {
        return dataISOTexto;
    }

    return (
        partes[2] +
        '/' +
        partes[1] +
        '/' +
        partes[0]
    );
}


// ==========================================
// 11. GERAR LICENÇA
// ==========================================

async function gerarLicenca() {

    if (!supabaseClient) {

        alert(
            'O Supabase não está disponível.'
        );

        return;
    }

    if (!nomeComercio) {

        alert(
            'Campo do comércio não encontrado.'
        );

        return;
    }

    const comercio =
        nomeComercio.value.trim();

    if (!comercio) {

        alert(
            'Informe o nome do comércio.'
        );

        nomeComercio.focus();

        return;
    }

    // --------------------------------------
    // Verificar administrador
    // --------------------------------------

    try {

        const resultado =
            await supabaseClient.auth.getUser();

        const user =
            resultado.data
                ? resultado.data.user
                : null;

        if (!user) {

            alert(
                'Sua sessão expirou. Faça login novamente.'
            );

            mostrarLogin();

            return;
        }

        if (user.id !== ID_ADMINISTRADOR) {

            await supabaseClient.auth.signOut();

            alert(
                'Acesso não autorizado.'
            );

            mostrarLogin();

            return;
        }

    } catch (erro) {

        alert(
            'Não foi possível verificar o administrador.\n\n' +
            (erro.message || erro)
        );

        return;
    }

    if (btnGerarLicenca) {

        btnGerarLicenca.disabled = true;

        btnGerarLicenca.innerHTML =
            '<span>⏳</span>' +
            '<span>Gerando...</span>';
    }

    try {

        const hoje =
            new Date();

        const inicio =
            dataISO(hoje);

        const validadeData =
            new Date(hoje);

        validadeData.setDate(
            validadeData.getDate() + 30
        );

        const validade =
            dataISO(validadeData);

        const codigo =
            gerarCodigoLicenca();

        const resultado =
            await supabaseClient.rpc(
                'admin_criar_licenca',
                {
                    p_codigo: codigo,
                    p_comercio: comercio,
                    p_plano: 'mensal',
                    p_inicio: inicio,
                    p_validade: validade
                }
            );

        const error =
            resultado.error;

        if (error) {

            console.error(
                'Erro ao criar licença:',
                error
            );

            alert(
                'ERRO AO GERAR LICENÇA.\n\n' +
                'Mensagem:\n' +
                (error.message || 'Sem mensagem') +
                '\n\nCódigo:\n' +
                (error.code || 'Não informado') +
                '\n\nDetalhes:\n' +
                (error.details || 'Sem detalhes') +
                '\n\nDica:\n' +
                (error.hint || 'Sem dica')
            );

            return;
        }

        // ----------------------------------
        // Resultado
        // ----------------------------------

        ultimaLicenca =
            'Dr. Troco\n' +
            'Comércio: ' +
            comercio +
            '\n' +
            'Código: ' +
            codigo +
            '\n' +
            'Plano: Mensal\n' +
            'Início: ' +
            dataBR(inicio) +
            '\n' +
            'Validade: ' +
            dataBR(validade);

        if (dadosLicenca) {

            dadosLicenca.innerHTML =
                '<strong>Comércio:</strong> ' +
                escaparHTML(comercio) +
                '<br>' +

                '<strong>Código:</strong> ' +
                '<b style="font-size:1.2em;">' +
                escaparHTML(codigo) +
                '</b>' +
                '<br>' +

                '<strong>Plano:</strong> Mensal' +
                '<br>' +

                '<strong>Início:</strong> ' +
                dataBR(inicio) +
                '<br>' +

                '<strong>Validade:</strong> ' +
                dataBR(validade);
        }

        if (resultadoLicenca) {
            resultadoLicenca.style.display = 'block';
        }

        // Atualizar lista
        await carregarLicencas();

        // Limpar campo
        nomeComercio.value = '';

        alert(
            'Licença gerada com sucesso!'
        );

    } catch (erro) {

        console.error(
            'Erro inesperado:',
            erro
        );

        alert(
            'ERRO AO GERAR LICENÇA.\n\n' +
            (erro.message || erro)
        );

    } finally {

        if (btnGerarLicenca) {

            btnGerarLicenca.disabled = false;

            btnGerarLicenca.innerHTML =
                '<span>🔑</span>' +
                '<span>Gerar licença mensal</span>';
        }
    }
}


// ==========================================
// 12. ESCAPAR HTML
// ==========================================

function escaparHTML(texto) {

    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// ==========================================
// 13. COPIAR LICENÇA
// ==========================================

async function copiarLicenca() {

    if (!ultimaLicenca) {

        alert(
            'Nenhuma licença foi gerada ainda.'
        );

        return;
    }

    if (
        navigator.clipboard &&
        navigator.clipboard.writeText
    ) {

        try {

            await navigator.clipboard.writeText(
                ultimaLicenca
            );

            alert(
                'Dados da licença copiados!'
            );

            return;

        } catch (erro) {

            console.warn(
                'Clipboard não disponível:',
                erro
            );
        }
    }

    const textarea =
        document.createElement('textarea');

    textarea.value =
        ultimaLicenca;

    textarea.style.position =
        'fixed';

    textarea.style.left =
        '-9999px';

    document.body.appendChild(
        textarea
    );

    textarea.focus();

    textarea.select();

    try {

        document.execCommand('copy');

        alert(
            'Dados da licença copiados!'
        );

    } catch (erro) {

        alert(
            'Não foi possível copiar automaticamente.\n\n' +
            ultimaLicenca
        );
    }

    document.body.removeChild(
        textarea
    );
}


// ==========================================
// 14. VERIFICAR ADMINISTRADOR
// ==========================================

async function verificarAdministrador() {

    if (!supabaseClient) {
        return false;
    }

    try {

        const resultado =
            await supabaseClient.auth.getUser();

        const user =
            resultado.data
                ? resultado.data.user
                : null;

        if (
            !user ||
            user.id !== ID_ADMINISTRADOR
        ) {

            return false;
        }

        return true;

    } catch (erro) {

        console.error(
            'Erro ao verificar administrador:',
            erro
        );

        return false;
    }
}


// ==========================================
// 15. CARREGAR LICENÇAS
// ==========================================

async function carregarLicencas() {

    if (!supabaseClient || !listaLicencas) {
        return;
    }

    const autorizado =
        await verificarAdministrador();

    if (!autorizado) {

        mostrarLogin();

        return;
    }

    listaLicencas.innerHTML =
        '<div style="' +
        'padding:15px;' +
        'text-align:center;' +
        'color:#777;">' +
        '⏳ Carregando licenças...' +
        '</div>';

    try {

        const resultado =
            await supabaseClient.rpc(
                'admin_listar_licencas'
            );

        const data =
            resultado.data;

        const error =
            resultado.error;

        if (error) {

            console.error(
                'Erro ao listar licenças:',
                error
            );

            listaLicencas.innerHTML =
                '<div style="' +
                'padding:15px;' +
                'text-align:center;' +
                'color:#b00020;">' +
                'Erro ao carregar licenças.' +
                '</div>';

            alert(
                'ERRO AO CARREGAR LICENÇAS.\n\n' +
                (error.message || 'Sem mensagem')
            );

            return;
        }

        todasLicencas =
            Array.isArray(data)
                ? data
                : [];

        atualizarResumo();

        renderizarLicencas();

    } catch (erro) {

        console.error(
            'Erro inesperado:',
            erro
        );

        listaLicencas.innerHTML =
            '<div style="' +
            'padding:15px;' +
            'text-align:center;' +
            'color:#b00020;">' +
            'Erro inesperado ao carregar.' +
            '</div>';
    }
}


// ==========================================
// 16. VERIFICAR STATUS
// ==========================================

function obterStatusLicenca(licenca) {

    if (!licenca.ativa) {

        return {
            tipo: 'desativada',
            texto: 'Desativada'
        };
    }

    const hoje =
        new Date();

    hoje.setHours(
        0, 0, 0, 0
    );

    const validade =
        new Date(
            String(licenca.validade) +
            'T00:00:00'
        );

    validade.setHours(
        0, 0, 0, 0
    );

    if (validade < hoje) {

        return {
            tipo: 'expirada',
            texto: 'Expirada'
        };
    }

    return {
        tipo: 'ativa',
        texto: 'Ativa'
    };
}


// ==========================================
// 17. DIAS RESTANTES
// ==========================================

function diasRestantes(licenca) {

    const hoje =
        new Date();

    hoje.setHours(
        0, 0, 0, 0
    );

    const validade =
        new Date(
            String(licenca.validade) +
            'T00:00:00'
        );

    validade.setHours(
        0, 0, 0, 0
    );

    const diferenca =
        validade.getTime() -
        hoje.getTime();

    return Math.ceil(
        diferenca /
        (1000 * 60 * 60 * 24)
    );
}


// ==========================================
// 18. ATUALIZAR RESUMO
// ==========================================

function atualizarResumo() {

    if (!Array.isArray(todasLicencas)) {
        return;
    }

    let ativas = 0;
    let expiradas = 0;
    let desativadas = 0;

    todasLicencas.forEach(
        function (licenca) {

            const status =
                obterStatusLicenca(
                    licenca
                );

            if (status.tipo === 'ativa') {
                ativas++;
            }

            else if (
                status.tipo === 'expirada'
            ) {
                expiradas++;
            }

            else {
                desativadas++;
            }

        }
    );

    if (totalLicencas) {
        totalLicencas.textContent =
            todasLicencas.length;
    }

    if (licencasAtivas) {
        licencasAtivas.textContent =
            ativas;
    }

    if (licencasExpiradas) {
        licencasExpiradas.textContent =
            expiradas;
    }

    if (licencasDesativadas) {
        licencasDesativadas.textContent =
            desativadas;
    }
}


// ==========================================
// 19. RENDERIZAR LISTA
// ==========================================

function renderizarLicencas() {

    if (!listaLicencas) {
        return;
    }

    const pesquisa =
        pesquisaLicencas
            ? pesquisaLicencas.value
                .trim()
                .toLowerCase()
            : '';

    const filtradas =
        todasLicencas.filter(
            function (licenca) {

                if (!pesquisa) {
                    return true;
                }

                const comercio =
                    String(
                        licenca.comercio || ''
                    ).toLowerCase();

                const codigo =
                    String(
                        licenca.codigo || ''
                    ).toLowerCase();

                return (
                    comercio.includes(pesquisa) ||
                    codigo.includes(pesquisa)
                );
            }
        );

    if (!filtradas.length) {

        listaLicencas.innerHTML =
            '<div style="' +
            'padding:20px;' +
            'text-align:center;' +
            'color:#777;">' +
            'Nenhuma licença encontrada.' +
            '</div>';

        return;
    }

    let html = '';

    filtradas.forEach(
        function (licenca) {

            const status =
                obterStatusLicenca(
                    licenca
                );

            const dias =
                diasRestantes(
                    licenca
                );

            let textoDias = '';

            if (status.tipo === 'ativa') {

                if (dias === 0) {

                    textoDias =
                        'Vence hoje';

                } else {

                    textoDias =
                        dias +
                        (
                            dias === 1
                                ? ' dia restante'
                                : ' dias restantes'
                        );
                }

            }

            else if (
                status.tipo === 'expirada'
            ) {

                const atrasado =
                    Math.abs(dias);

                textoDias =
                    'Expirada há ' +
                    atrasado +
                    (
                        atrasado === 1
                            ? ' dia'
                            : ' dias'
                    );

            }

            else {

                textoDias =
                    'Acesso bloqueado';
            }

            let corStatus =
                '#198754';

            if (
                status.tipo === 'expirada'
            ) {

                corStatus =
                    '#b26a00';

            }

            if (
                status.tipo === 'desativada'
            ) {

                corStatus =
                    '#b00020';
            }

            html +=

                '<div style="' +
                'padding:15px;' +
                'margin-bottom:12px;' +
                'border:1px solid #ddd;' +
                'border-radius:14px;' +
                'background:#fff;' +
                'box-sizing:border-box;' +
                '">' +

                '<div style="' +
                'display:flex;' +
                'justify-content:space-between;' +
                'gap:10px;' +
                'align-items:flex-start;' +
                'flex-wrap:wrap;' +
                'margin-bottom:10px;' +
                '">' +

                '<div style="' +
                'min-width:0;' +
                'flex:1;' +
                '">' +

                '<strong style="font-size:1.05em;">' +
                escaparHTML(
                    licenca.comercio || ''
                ) +
                '</strong>' +

                '<div style="' +
                'margin-top:5px;' +
                'font-weight:bold;' +
                'word-break:break-word;' +
                '">' +

                escaparHTML(
                    licenca.codigo || ''
                ) +

                '</div>' +

                '</div>' +

                '<div style="' +
                'padding:5px 9px;' +
                'border-radius:20px;' +
                'font-size:.85em;' +
                'font-weight:bold;' +
                'color:white;' +
                'background:' +
                corStatus +
                ';">' +

                escaparHTML(
                    status.texto
                ) +

                '</div>' +

                '</div>' +

                '<div style="' +
                'line-height:1.8;' +
                'font-size:.92em;' +
                'color:#444;' +
                '">' +

                '<div>' +
                '<strong>Plano:</strong> ' +
                escaparHTML(
                    licenca.plano || ''
                ) +
                '</div>' +

                '<div>' +
                '<strong>Início:</strong> ' +
                dataBR(
                    licenca.inicio
                ) +
                '</div>' +

                '<div>' +
                '<strong>Validade:</strong> ' +
                dataBR(
                    licenca.validade
                ) +
                '</div>' +

                '<div>' +
                '<strong>Status:</strong> ' +
                escaparHTML(
                    textoDias
                ) +
                '</div>' +

                '</div>' +

                '<div style="' +
                'display:grid;' +
                'grid-template-columns:repeat(2,minmax(0,1fr));' +
                'gap:8px;' +
                'margin-top:12px;' +
                '">' +

                '<button ' +
                'type="button" ' +
                'data-acao="copiar" ' +
                'data-id="' +
                escaparHTML(
                    licenca.id
                ) +
                '" ' +
                'class="btn-primary" ' +
                'style="padding:10px;">' +
                '📋 Copiar' +
                '</button>' +

                '<button ' +
                'type="button" ' +
                'data-acao="renovar" ' +
                'data-id="' +
                escaparHTML(
                    licenca.id
                ) +
                '" ' +
                'class="btn-primary" ' +
                'style="padding:10px;">' +
                '🔄 Renovar' +
                '</button>' +

                (
                    licenca.ativa
                        ? (
                            '<button ' +
                            'type="button" ' +
                            'data-acao="desativar" ' +
                            'data-id="' +
                            escaparHTML(
                                licenca.id
                            ) +
                            '" ' +
                            'class="btn-cancelar-venda" ' +
                            'style="padding:10px;">' +
                            '🔒 Desativar' +
                            '</button>'
                        )
                        : (
                            '<button ' +
                            'type="button" ' +
                            'data-acao="reativar" ' +
                            'data-id="' +
                            escaparHTML(
                                licenca.id
                            ) +
                            '" ' +
                            'class="btn-primary" ' +
                            'style="padding:10px;">' +
                            '🟢 Reativar' +
                            '</button>'
                        )
                ) +

                '<button ' +
                'type="button" ' +
                'data-acao="excluir" ' +
                'data-id="' +
                escaparHTML(
                    licenca.id
                ) +
                '" ' +
                'class="btn-cancelar-venda" ' +
                'style="padding:10px;">' +
                '🗑️ Excluir' +
                '</button>' +

                '</div>' +

                '</div>';
        }
    );

    listaLicencas.innerHTML =
        html;

    // --------------------------------------
    // Eventos dos botões
    // --------------------------------------

    const botoes =
        listaLicencas.querySelectorAll(
            '[data-acao]'
        );

    botoes.forEach(
        function (botao) {

            botao.addEventListener(
                'click',
                function () {

                    const acao =
                        botao.getAttribute(
                            'data-acao'
                        );

                    const id =
                        botao.getAttribute(
                            'data-id'
                        );

                    executarAcaoLicenca(
                        acao,
                        id
                    );

                }
            );

        }
    );
}


// ==========================================
// 20. EXECUTAR AÇÃO
// ==========================================

async function executarAcaoLicenca(
    acao,
    id
) {

    if (!id) {
        return;
    }

    const licenca =
        todasLicencas.find(
            function (item) {
                return item.id === id;
            }
        );

    if (!licenca) {

        alert(
            'Licença não encontrada.'
        );

        return;
    }


    // --------------------------------------
    // COPIAR
    // --------------------------------------

    if (acao === 'copiar') {

        const texto =
            'Dr. Troco\n' +
            'Comércio: ' +
            licenca.comercio +
            '\n' +
            'Código: ' +
            licenca.codigo +
            '\n' +
            'Plano: ' +
            licenca.plano +
            '\n' +
            'Início: ' +
            dataBR(licenca.inicio) +
            '\n' +
            'Validade: ' +
            dataBR(licenca.validade);

        try {

            if (
                navigator.clipboard &&
                navigator.clipboard.writeText
            ) {

                await navigator.clipboard.writeText(
                    texto
                );

            } else {

                const textarea =
                    document.createElement(
                        'textarea'
                    );

                textarea.value =
                    texto;

                document.body.appendChild(
                    textarea
                );

                textarea.select();

                document.execCommand(
                    'copy'
                );

                document.body.removeChild(
                    textarea
                );
            }

            alert(
                'Dados da licença copiados!'
            );

        } catch (erro) {

            alert(
                'Não foi possível copiar.\n\n' +
                texto
            );
        }

        return;
    }


    // --------------------------------------
    // RENOVAR
    // --------------------------------------

    if (acao === 'renovar') {

        const confirmar =
            confirm(
                'Renovar a licença de "' +
                licenca.comercio +
                '" por 30 dias?'
            );

        if (!confirmar) {
            return;
        }

        try {

            const resultado =
                await supabaseClient.rpc(
                    'admin_renovar_licenca',
                    {
                        p_id: id
                    }
                );

            if (resultado.error) {

                throw resultado.error;
            }

            alert(
                'Licença renovada com sucesso!\n\n' +
                'Nova validade: ' +
                dataBR(
                    resultado.data
                )
            );

            await carregarLicencas();

        } catch (erro) {

            console.error(
                'Erro ao renovar:',
                erro
            );

            alert(
                'ERRO AO RENOVAR LICENÇA.\n\n' +
                (erro.message || erro)
            );
        }

        return;
    }


    // --------------------------------------
    // DESATIVAR
    // --------------------------------------

    if (acao === 'desativar') {

        const confirmar =
            confirm(
                'Desativar a licença de "' +
                licenca.comercio +
                '"?\n\n' +
                'O cliente perderá o acesso ao aplicativo.'
            );

        if (!confirmar) {
            return;
        }

        try {

            const resultado =
                await supabaseClient.rpc(
                    'admin_desativar_licenca',
                    {
                        p_id: id
                    }
                );

            if (resultado.error) {
                throw resultado.error;
            }

            alert(
                'Licença desativada com sucesso.'
            );

            await carregarLicencas();

        } catch (erro) {

            console.error(
                'Erro ao desativar:',
                erro
            );

            alert(
                'ERRO AO DESATIVAR LICENÇA.\n\n' +
                (erro.message || erro)
            );
        }

        return;
    }


    // --------------------------------------
    // REATIVAR
    // --------------------------------------

    if (acao === 'reativar') {

        const confirmar =
            confirm(
                'Reativar a licença de "' +
                licenca.comercio +
                '"?'
            );

        if (!confirmar) {
            return;
        }

        try {

            const resultado =
                await supabaseClient.rpc(
                    'admin_reativar_licenca',
                    {
                        p_id: id
                    }
                );

            if (resultado.error) {
                throw resultado.error;
            }

            alert(
                'Licença reativada com sucesso.'
            );

            await carregarLicencas();

        } catch (erro) {

            console.error(
                'Erro ao reativar:',
                erro
            );

            alert(
                'ERRO AO REATIVAR LICENÇA.\n\n' +
                (erro.message || erro)
            );
        }

        return;
    }


    // --------------------------------------
    // EXCLUIR
    // --------------------------------------

    if (acao === 'excluir') {

        const confirmar =
            confirm(
                'EXCLUIR DEFINITIVAMENTE?\n\n' +
                'Comércio: ' +
                licenca.comercio +
                '\n' +
                'Código: ' +
                licenca.codigo +
                '\n\n' +
                'Esta ação não pode ser desfeita.'
            );

        if (!confirmar) {
            return;
        }

        try {

            const resultado =
                await supabaseClient.rpc(
                    'admin_excluir_licenca',
                    {
                        p_id: id
                    }
                );

            if (resultado.error) {
                throw resultado.error;
            }

            alert(
                'Licença excluída com sucesso.'
            );

            await carregarLicencas();

        } catch (erro) {

            console.error(
                'Erro ao excluir:',
                erro
            );

            alert(
                'ERRO AO EXCLUIR LICENÇA.\n\n' +
                (erro.message || erro)
            );
        }
    }
}


// ==========================================
// 21. SAIR
// ==========================================

async function sairAdmin() {

    if (supabaseClient) {

        try {

            await supabaseClient.auth.signOut();

        } catch (erro) {

            console.error(
                'Erro ao sair:',
                erro
            );
        }
    }

    ultimaLicenca = '';

    todasLicencas = [];

    if (nomeComercio) {
        nomeComercio.value = '';
    }

    if (resultadoLicenca) {
        resultadoLicenca.style.display = 'none';
    }

    if (dadosLicenca) {
        dadosLicenca.innerHTML = '';
    }

    if (listaLicencas) {
        listaLicencas.innerHTML = '';
    }

    mostrarLogin();
}


// ==========================================
// 22. ERRO GLOBAL
// ==========================================

window.addEventListener(
    'error',
    function (evento) {

        console.error(
            'Erro JavaScript:',
            evento.error || evento.message
        );

    }
);


// ==========================================
// 23. INICIAR
// ==========================================

if (
    document.readyState === 'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        inicializarAdmin
    );

} else {

    inicializarAdmin();

    }
