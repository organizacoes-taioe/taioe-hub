/* Página inicial. Quem nunca entrou não baixa o supabase-js: só com a sessão guardada a
   página carrega o SDK e o módulo para mostrar «Olá, nome» (TaioeCarregarHub, em
   /comum/lingua-perfil.js). Com perfil, vale a língua dele. «Entrar» ou «Minha conta» já vem
   decidido pelo /comum/sessao-guardada.js; aqui só se desfaz o «Minha conta» quando a sessão
   guardada não vale mais. */
(function () {
  'use strict';
  var tem = false;
  try { tem = !!localStorage.getItem('taioe-auth'); } catch (e) {}
  if (!tem) return;

  TaioeCarregarHub()
    .then(async function () {
      TaioeSessao.aoSair(function () { location.reload(); });
      var r = await TaioeSessao.cliente().auth.getSession(), sessao = r.data && r.data.session;
      /* sem sessão e sem erro: confirmado que não há conta aqui. Com erro (sem rede para renovar),
         fica o «Minha conta» */
      if (!sessao) { if (!r.error) document.documentElement.classList.remove('com-sessao'); return; }
      var perfil = null;
      try { perfil = await TaioeHub.lerPerfil(); } catch (e) { /* offline: fica o email */ }
      TaioeHub.linguaDoPerfil(perfil);
      TaioeI18n.marcar('ola', 'inicio.ola', { nome: perfil ? perfil.nome : sessao.user.email });
      TaioeHub.mostrar('logado', true);
    })
    .catch(function () { /* sem SDK (offline): fica o «Minha conta», e a /conta/ resolve */ });
})();
