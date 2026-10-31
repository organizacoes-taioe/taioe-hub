/* /entrar/excluir/: exclusão da conta «em poucos cliques», confirmada por um código novo
   no email (PLANO, seção 8; o código de 4 dígitos da função acesso, que aqui não cria conta). Fica em /entrar/ porque precisa do Turnstile, e a CSP só o
   libera aqui. O pedido vai para conta.pedidos_exclusao; o cron apaga em até 2 minutos. */
(function () {
  'use strict';
  var H = TaioeHub, I = TaioeI18n, t = I.t, sb = TaioeSessao.cliente(), email = '';

  function passo(qual) {
    ['carregando', 'passo-pedir', 'passo-confirmar', 'feito'].forEach(function (id) { H.mostrar(id, id === qual); });
  }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (!sessao) { TaioeSessao.irParaEntrar(); return; }
    email = sessao.user.email;
    I.marcar('email', 'excluir.explica', { email: email }, true);
    passo('passo-pedir');
  })();

  H.$('pedir').addEventListener('click', async function () {
    var botao = this;
    botao.disabled = true;
    H.avisar('aviso-pedir', t('comum.robo'));
    try {
      var captchaToken = await TaioeTurnstile.token();
      H.avisar('aviso-pedir', t('comum.enviando'));
      var r;
      try { r = await TaioeAcesso.pedir(email, captchaToken); }
      catch (e) { H.avisar('aviso-pedir', H.mensagemDeErro(e), 'erro'); return; }
      finally { TaioeTurnstile.reiniciar(); }
      if (!r || !r.ok) { H.avisar('aviso-pedir', TaioeAcesso.mensagem(r), 'erro'); return; }
      passo('passo-confirmar');
      H.$('codigo').focus();
    } finally { botao.disabled = false; }
  });

  H.$('codigo').addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 4);
    if (v !== this.value) this.value = v;
  });

  H.$('form-codigo').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var token = H.$('codigo').value;
    if (token.length !== 4) { H.avisar('aviso-confirmar', t('comum.codigo-4'), 'erro'); return; }
    if (!H.$('certeza').checked) { H.avisar('aviso-confirmar', t('excluir.marque'), 'erro'); return; }
    H.$('excluir').disabled = true;
    H.avisar('aviso-confirmar', t('comum.conferindo'));
    try {
      var r = await TaioeAcesso.verificar(email, token, false);
      if (!r || !r.ok) { H.avisar('aviso-confirmar', TaioeAcesso.mensagem(r), 'erro'); return; }
      await TaioeAcesso.entrar(r);
      var p = await sb.schema('conta').rpc('pedir_exclusao');
      if (p.error) { H.avisar('aviso-confirmar', H.mensagemDeErro(p.error), 'erro'); return; }
      await H.apagarDadosDoAparelho();
      await TaioeSessao.sair(false);
      passo('feito');
    } catch (e) {
      H.avisar('aviso-confirmar', H.mensagemDeErro(e), 'erro');
    } finally { H.$('excluir').disabled = false; }
  });
})();
