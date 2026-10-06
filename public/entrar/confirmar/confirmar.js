/* /entrar/confirmar/#token_hash=…&type=email: destino do botão do email.
   Não verifica ao carregar: os antivírus de email abrem os links sozinhos e queimariam o
   token de uso único. Só o clique em «Entrar neste aparelho» confirma. */
(function () {
  'use strict';
  var H = TaioeHub;
  var frag = new URLSearchParams(location.hash.slice(1));
  var tokenHash = frag.get('token_hash');
  // tira o token da barra de endereço, do histórico e de qualquer cópia do link
  history.replaceState(null, '', location.pathname);

  if (!tokenHash) { H.mostrar('sem-token', true); return; }

  (async function () {
    var sessao = await H.sessaoAtual();
    if (sessao) {
      H.$('email-atual').textContent = sessao.user.email;
      H.mostrar('outra-sessao', true);
    }
    H.mostrar('pronto', true);
    H.$('entrar').focus();
  })();

  H.$('entrar').addEventListener('click', async function () {
    var botao = this;
    botao.disabled = true;
    H.avisar('aviso', 'Entrando…');
    try {
      var r = await TaioeSessao.cliente().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (r.error) {
        H.avisar('aviso', 'Este botão já foi usado ou venceu (vale 15 minutos e uma vez só). Peça um código novo em Entrar.', 'erro');
        return;
      }
      H.avisar('aviso', 'Você entrou como ' + r.data.user.email + '.', 'ok');
      await H.depoisDoLogin();
    } catch (e) {
      H.avisar('aviso', H.mensagemDeErro(e), 'erro');
      botao.disabled = false;
    }
  });
})();
