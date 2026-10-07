/* Página inicial. Quem nunca entrou não baixa o supabase-js: só com a sessão guardada a
   página carrega o SDK e o módulo para mostrar «Olá, nome» (TaioeCarregarHub, em
   /comum/lingua-perfil.js). Com perfil, vale a língua dele. */
(function () {
  'use strict';
  var tem = false;
  try { tem = !!localStorage.getItem('taioe-auth'); } catch (e) {}
  if (!tem) return;

  TaioeCarregarHub()
    .then(async function () {
      TaioeSessao.aoSair(function () { location.reload(); });
      var sessao = await TaioeHub.sessaoAtual();
      if (!sessao) return;
      var perfil = null;
      try { perfil = await TaioeHub.lerPerfil(); } catch (e) { /* offline: fica o email */ }
      TaioeHub.linguaDoPerfil(perfil);
      TaioeI18n.marcar('ola', 'inicio.ola', { nome: perfil ? perfil.nome : sessao.user.email });
      TaioeHub.mostrar('entrar', false);
      TaioeHub.mostrar('conta', true);
      TaioeHub.mostrar('logado', true);
    })
    .catch(function () { /* sem SDK, a página continua funcionando com o «Entrar» */ });
})();
