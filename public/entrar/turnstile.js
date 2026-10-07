/* Turnstile em modo explícito, comum a /entrar/ e /entrar/excluir/. O widget fica escondido
   e só aparece se a Cloudflare precisar de uma interação. TaioeTurnstile.token() devolve uma
   promessa com o token mais recente; depois de usado, chame reiniciar(). */
(function () {
  'use strict';
  var idWidget = null, atual = null, esperando = [];

  function entregar(t) {
    atual = t;
    esperando.splice(0).forEach(function (fn) { fn(t); });
  }

  window.taioeTurnstilePronto = function () {
    var sitekey = TaioeSessao.sitekeyTurnstile();
    if (!sitekey || !document.getElementById('turnstile')) return;
    idWidget = window.turnstile.render('#turnstile', {
      sitekey: sitekey,
      language: { pt: 'pt-br', es: 'es', en: 'en' }[TaioeI18n.lingua()] || 'auto',
      appearance: 'interaction-only',
      callback: entregar,
      'expired-callback': function () { atual = null; },
      'error-callback': function () { atual = null; }
    });
  };

  window.TaioeTurnstile = {
    token: function () {
      if (atual) return Promise.resolve(atual);
      return new Promise(function (ok) { esperando.push(ok); });
    },
    reiniciar: function () {
      atual = null;
      if (idWidget !== null && window.turnstile) window.turnstile.reset(idWidget);
    }
  };
})();
