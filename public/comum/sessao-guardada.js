/* Lido no <head>, antes de a página ser desenhada: marca o <html> com «com-sessao» quando este
   navegador guarda uma sessão. Assim o início já nasce com «Minha conta», e o «Entrar» só aparece
   quando não há sessão nenhuma (ou quando a guardada se mostra inválida: inicio.js). */
(function () {
  'use strict';
  var tem = false;
  try { tem = !!localStorage.getItem('taioe-auth'); } catch (e) {}
  if (tem) document.documentElement.classList.add('com-sessao');
})();
