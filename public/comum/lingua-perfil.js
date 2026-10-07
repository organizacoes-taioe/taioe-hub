/* Para as páginas que não carregam o hub.js de saída (início, 404, termos, privacidade).
   TaioeCarregarHub() baixa, uma vez só, o supabase-js, o módulo de sessão e o hub.js.
   Se a pessoa troca a língua no seletor e tem sessão guardada, carrega o hub e grava a língua
   no perfil; quem nunca entrou não baixa nada. Depois que o hub.js carrega, ele mesmo grava. */
(function () {
  'use strict';
  var promessa = null;

  function carregar(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = falha;
      document.body.appendChild(s);
    });
  }

  window.TaioeCarregarHub = function () {
    if (window.TaioeHub) return Promise.resolve();
    if (!promessa) {
      promessa = carregar('/comum/vendor/supabase-js-2.117.2.js')
        .then(function () { return carregar('/comum/taioe-sessao.js'); })
        .then(function () { return carregar('/comum/hub.js'); });
      promessa.catch(function () { promessa = null; });
    }
    return promessa;
  };

  TaioeI18n.aoEscolher(function (lingua) {
    if (window.TaioeHub) return;                           // o hub.js já tem o seu ouvinte
    var tem = false;
    try { tem = !!localStorage.getItem('taioe-auth'); } catch (e) {}
    if (!tem) return;
    window.TaioeCarregarHub()
      .then(function () { return TaioeHub.gravarLingua(lingua); })
      .catch(function () { /* sem rede: fica a língua deste navegador */ });
  });
})();
