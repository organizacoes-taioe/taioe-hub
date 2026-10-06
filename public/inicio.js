/* Página inicial. Quem nunca entrou não baixa o supabase-js: só com a sessão guardada a
   página carrega o SDK e o módulo para mostrar «Olá, nome». */
(function () {
  'use strict';
  var tem = false;
  try { tem = !!localStorage.getItem('taioe-auth'); } catch (e) {}
  if (!tem) return;

  function carregar(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = falha;
      document.body.appendChild(s);
    });
  }

  carregar('/comum/vendor/supabase-js-2.117.2.js')
    .then(function () { return carregar('/comum/taioe-sessao.js'); })
    .then(function () { return carregar('/comum/hub.js'); })
    .then(async function () {
      TaioeSessao.aoSair(function () { location.reload(); });
      var sessao = await TaioeHub.sessaoAtual();
      if (!sessao) return;
      var perfil = null;
      try { perfil = await TaioeHub.lerPerfil(); } catch (e) { /* offline: fica o email */ }
      TaioeHub.$('ola').textContent = 'Olá, ' + (perfil ? perfil.nome : sessao.user.email);
      TaioeHub.mostrar('entrar', false);
      TaioeHub.mostrar('conta', true);
      TaioeHub.mostrar('logado', true);
    })
    .catch(function () { /* sem SDK, a página continua funcionando com o «Entrar» */ });
})();
