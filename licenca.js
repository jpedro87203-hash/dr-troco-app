// =====================================================
// DR. TROCO - ATIVAÇÃO DE LICENÇA
// Usa o cliente criado em supabase.js (projeto atual)
// A licença fica ligada ao usuário logado, no servidor
// =====================================================

const client = window.supabaseClient;

const codigoLicenca = document.getElementById('codigoLicenca');
const btnAtivarLicenca = document.getElementById('btnAtivarLicenca');
const textoStatusLicenca = document.getElementById('textoStatusLicenca');

// Limpa o dado antigo que ficava salvo no celular
localStorage.removeItem('drTroco_licenca');


// ---------- Utilitários ----------

function escapar(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function converterDataBanco(dataTexto) {
    if (!dataTexto) return null;
    const p = String(dataTexto).split('-');
    if (p.length !== 3) return null;
    const data = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(data.getTime())) return null;
    data.setHours(23, 59, 59, 999);
    return data;
}

function formatarData(data) {
    if (!data) return 'Não informado';
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}/${data.getFullYear()}`;
}

function licencaValida(licenca) {
    if (!licenca || licenca.ativa === false) return false;
    const venc = converterDataBanco(licenca.validade);
    if (!venc) return false;
    return new Date() <= venc;
}

function traduzirErro(erro) {
    const msg = String((erro && erro.message) || '');
    if (msg.includes('codigo_invalido')) return 'Código de licença inválido.';
    if (msg.includes('licenca_desativada')) return 'Esta licença está desativada.';
    if (msg.includes('licenca_expirada')) return 'Esta licença está expirada.';
    if (msg.includes('codigo_em_uso')) return 'Este código já está sendo usado por outra conta.';
    if (msg.includes('nao_autenticado')) return 'Você precisa entrar na sua conta primeiro.';
    return 'Não foi possível concluir. ' + (msg || 'Tente novamente.');
}


// ---------- Mostrar status da licença do usuário ----------

async function mostrarLicenca() {
    try {
        const { data, error } = await client.rpc('minha_licenca');

        if (error) throw error;

        const licenca = data && data.length ? data[0] : null;

        if (!licenca) {
            textoStatusLicenca.innerHTML = '🔴 Nenhuma licença ativada.';
            return;
        }

        const inicio = formatarData(converterDataBanco(licenca.inicio));
        const validade = formatarData(converterDataBanco(licenca.validade));

        if (licencaValida(licenca)) {
            textoStatusLicenca.innerHTML =
                `🟢 Licença ativa<br><br>` +
                `<strong>Código:</strong> ${escapar(licenca.codigo)}<br>` +
                `<strong>Comércio:</strong> ${escapar(licenca.comercio)}<br>` +
                `<strong>Plano:</strong> ${escapar(licenca.plano || 'Mensal')}<br>` +
                `<strong>Início:</strong> ${inicio}<br>` +
                `<strong>Válida até:</strong> ${validade}`;
        } else {
            textoStatusLicenca.innerHTML =
                `🔴 Licença expirada ou desativada<br><br>` +
                `<strong>Código:</strong> ${escapar(licenca.codigo)}<br>` +
                `<strong>Comércio:</strong> ${escapar(licenca.comercio)}<br>` +
                `<strong>Vencida em:</strong> ${validade}<br><br>` +
                `Renove sua licença para continuar usando o Dr. Troco.`;
        }
    } catch (erro) {
        console.error('Erro ao ler licença:', erro);
        textoStatusLicenca.innerHTML = '🔴 Não foi possível verificar a licença.';
    }
}


// ---------- Ativar licença ----------

if (btnAtivarLicenca) {
    btnAtivarLicenca.addEventListener('click', async function () {

        const codigo = codigoLicenca.value.trim().toUpperCase();

        if (!codigo) {
            alert('Digite o código da licença.');
            codigoLicenca.focus();
            return;
        }

        btnAtivarLicenca.disabled = true;
        btnAtivarLicenca.innerHTML =
            '<span>⏳</span><span>Verificando...</span>';

        try {
            const { data, error } = await client.rpc('ativar_licenca', {
                p_codigo: codigo
            });

            if (error) throw error;

            if (!data || data.length === 0) {
                alert('Não foi possível ativar a licença.');
                return;
            }

            alert('Licença ativada com sucesso!');
            codigoLicenca.value = '';
            window.location.href = 'index.html';

        } catch (erro) {
            console.error('Erro ao ativar licença:', erro);
            alert(traduzirErro(erro));

        } finally {
            btnAtivarLicenca.disabled = false;
            btnAtivarLicenca.innerHTML =
                '<span>✓</span><span>Ativar licença</span>';
        }
    });
}


// ---------- Início ----------

mostrarLicenca();
