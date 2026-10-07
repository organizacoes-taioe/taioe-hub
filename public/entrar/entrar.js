/* /entrar/: email → código → depoisDoLogin(). Formulário único «entrar ou criar conta»: a
   resposta é a mesma para email novo ou antigo, para ninguém descobrir quem tem conta. */
(function () {
  'use strict';
  var H = TaioeHub, I = TaioeI18n, t = I.t, sb = TaioeSessao.cliente(), email = '', relogio = null;

  var params = new URLSearchParams(location.search);
  if (params.has('voltar')) H.guardarVoltar(params.get('voltar'));

  function passo(qual) {
    ['ja-logado', 'passo-email', 'passo-codigo'].forEach(function (id) { H.mostrar(id, id === qual); });
    var foco = { 'passo-email': 'email', 'passo-codigo': 'codigo' }[qual];
    if (foco) H.$(foco).focus();
  }

  function contarParaReenviar() {
    var restam = 60, botao = H.$('reenviar'), texto = H.$('espera');
    botao.disabled = true;
    clearInterval(relogio);
    relogio = setInterval(function () {
      restam--;
      I.marcar(texto, restam > 0 ? 'entrar.espera' : null, { n: restam });
      if (restam <= 0) { clearInterval(relogio); botao.disabled = false; }
    }, 1000);
    I.marcar(texto, 'entrar.espera', { n: 60 });
  }

  async function pedirCodigo(avisoId) {
    H.avisar(avisoId, t('comum.robo'));
    var captchaToken = await TaioeTurnstile.token();
    H.avisar(avisoId, t('comum.enviando'));
    var r = await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true, captchaToken: captchaToken } });
    TaioeTurnstile.reiniciar();
    if (r.error) { H.avisar(avisoId, H.mensagemDeErro(r.error), 'erro'); return false; }
    H.avisar(avisoId, '');
    return true;
  }

  H.$('form-email').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var campo = H.$('email');
    email = campo.value.trim().toLowerCase();
    if (!campo.checkValidity() || !email) { H.avisar('aviso-email', t('comum.email-invalido'), 'erro'); return; }
    H.$('enviar').disabled = true;
    try {
      if (await pedirCodigo('aviso-email')) {
        I.marcar('para-email', 'entrar.codigo-explica', { email: email }, true);
        H.$('codigo').value = '';
        passo('passo-codigo');
        contarParaReenviar();
      }
    } finally { H.$('enviar').disabled = false; }
  });

  H.$('form-codigo').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var token = H.$('codigo').value.replace(/\D/g, '');
    if (token.length !== 6) { H.avisar('aviso-codigo', t('comum.codigo-6'), 'erro'); return; }
    H.$('verificar').disabled = true;
    H.avisar('aviso-codigo', t('comum.conferindo'));
    try {
      var r = await sb.auth.verifyOtp({ email: email, token: token, type: 'email' });
      if (r.error) { H.avisar('aviso-codigo', H.mensagemDeErro(r.error), 'erro'); return; }
      H.avisar('aviso-codigo', t('entrar.pronto'), 'ok');
      await H.depoisDoLogin();
    } catch (e) {
      H.avisar('aviso-codigo', H.mensagemDeErro(e), 'erro');
    } finally { H.$('verificar').disabled = false; }
  });

  H.$('codigo').addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 6);
    if (v !== this.value) this.value = v;
    if (v.length === 6) H.$('form-codigo').requestSubmit();
  });

  H.$('reenviar').addEventListener('click', async function () {
    if (await pedirCodigo('aviso-codigo')) {
      H.avisar('aviso-codigo', t('entrar.codigo-novo'), 'ok');
      contarParaReenviar();
    }
  });

  H.$('outro-email').addEventListener('click', function () { clearInterval(relogio); passo('passo-email'); });

  H.$('continuar').addEventListener('click', function () {
    H.depoisDoLogin().catch(function (e) { alert(H.mensagemDeErro(e)); });
  });
  H.$('outra-conta').addEventListener('click', async function () {
    await TaioeSessao.sair(false);
    passo('passo-email');
  });

  (async function () {
    var sessao = await H.sessaoAtual();
    if (sessao) {
      I.marcar('ja-email', 'entrar.ja-email', { email: sessao.user.email }, true);
      passo('ja-logado');
    } else {
      passo('passo-email');
    }
  })();
})();
