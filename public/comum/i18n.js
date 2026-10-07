/* Línguas da interface da Taioé: 'pt', 'es' ou 'en'. Sem dependências. Carregado antes dos
   outros scripts da página, logo depois de /comum/textos-i18n.js (os dicionários).
   A língua: (1) localStorage 'taioe:lingua', se existir; (2) senão, a primeira de
   navigator.languages que comece por pt, es ou en; (3) senão, 'pt'. A chave é a mesma nos
   Cards (mesma origem), então o que se escolhe aqui vale lá, e vice-versa.

   No HTML:
     data-i18n="chave"              troca o textContent
     data-i18n-html="chave"         troca o innerHTML, só com HTML do próprio dicionário
     data-i18n-attr="title:chave;aria-label:chave2"
     data-i18n-vars='{"email":"…"}' valores para «{email}»; no modo html eles entram escapados
   «{x:data}» formata uma data ISO (aaaa-mm-dd) na língua atual.
   Texto mudado pelo JS usa marcar(el, chave, vars), para continuar certo se a língua mudar. */
(function () {
  'use strict';
  var CHAVE = 'taioe:lingua', LINGUAS = ['pt', 'es', 'en'];
  var LANG_HTML = { pt: 'pt-BR', es: 'es', en: 'en' };
  var h = location.hostname;
  var DEV = h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /\.workers\.dev$/.test(h);
  var avisadas = {}, ouvintes = [], ligado = false;

  function tem(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function valida(l) { return LINGUAS.indexOf(l) >= 0 ? l : null; }
  function guardada() { try { return valida(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
  function doNavegador() {
    var ls = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < ls.length; i++) {
      var l = valida(String(ls[i] || '').slice(0, 2).toLowerCase());
      if (l) return l;
    }
    return 'pt';
  }

  var atual = guardada() || doNavegador();

  function dic(l) { var d = window.TaioeTextos; return d && d[l] ? d[l] : null; }

  // O texto cru da chave na língua atual; sem ela, o do português; sem nenhum, null.
  function bruto(chave) {
    if (tem(dic(atual), chave)) return dic(atual)[chave];
    if (DEV && !avisadas[atual + ' ' + chave]) {
      avisadas[atual + ' ' + chave] = true;
      console.warn('i18n: falta a chave «' + chave + '» em «' + atual + '»');
    }
    return tem(dic('pt'), chave) ? dic('pt')[chave] : null;
  }

  function data(iso) {
    var p = String(iso || '').slice(0, 10).split('-');
    if (p.length !== 3) return String(iso || '');
    if (atual === 'en') {
      try {
        return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]))
          .toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
      } catch (e) { /* cai no formato de baixo */ }
    }
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function escapar(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function interpolar(texto, vars, html) {
    return texto.replace(/\{([A-Za-z0-9_]+)(?::([a-z]+))?\}/g, function (todo, nome, formato) {
      var v = tem(vars, nome) && vars[nome] != null ? String(vars[nome]) : '';
      if (formato === 'data') v = data(v);
      return html ? escapar(v) : v;
    });
  }

  function t(chave, vars) {
    var b = bruto(chave);
    return b === null ? chave : interpolar(b, vars, false);
  }

  function varsDe(el) {
    var v = el.getAttribute('data-i18n-vars');
    if (!v) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }

  function traduzir(el) {
    var k, b, vars = varsDe(el);
    if ((k = el.getAttribute('data-i18n')) && (b = bruto(k)) !== null) el.textContent = interpolar(b, vars, false);
    if ((k = el.getAttribute('data-i18n-html')) && (b = bruto(k)) !== null) el.innerHTML = interpolar(b, vars, true);
    if ((k = el.getAttribute('data-i18n-attr'))) {
      k.split(';').forEach(function (par) {
        var i = par.indexOf(':');
        if (i < 1) return;
        var tx = bruto(par.slice(i + 1).trim());
        if (tx !== null) el.setAttribute(par.slice(0, i).trim(), interpolar(tx, vars, false));
      });
    }
  }

  function marcarRaiz() {
    var r = document.documentElement;
    r.lang = LANG_HTML[atual];
    LINGUAS.forEach(function (l) { r.classList.toggle('lingua-' + l, l === atual); });
  }

  function aplicar(raiz) {
    raiz = raiz || document;
    var sel = '[data-i18n],[data-i18n-html],[data-i18n-attr]';
    if (raiz.nodeType === 1 && raiz.matches(sel)) traduzir(raiz);
    Array.prototype.forEach.call(raiz.querySelectorAll(sel), traduzir);
    Array.prototype.forEach.call(raiz.querySelectorAll('select[data-seletor-lingua]'), function (s) { s.value = atual; });
    if (raiz === document || raiz === document.documentElement) marcarRaiz();
    ligar();
  }

  // Muda o texto de um elemento pela chave, guardando a chave e os valores no próprio elemento.
  // Sem chave, esvazia. html = true usa innerHTML (o HTML do dicionário, valores escapados).
  function marcar(el, chave, vars, html) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    el.removeAttribute('data-i18n');
    el.removeAttribute('data-i18n-html');
    el.removeAttribute('data-i18n-vars');
    if (!chave) { el.textContent = ''; return; }
    el.setAttribute(html ? 'data-i18n-html' : 'data-i18n', chave);
    if (vars) el.setAttribute('data-i18n-vars', JSON.stringify(vars));
    traduzir(el);
  }

  function trocar(l) {
    if (l === atual) return false;
    atual = l;
    aplicar(document);
    try { document.dispatchEvent(new CustomEvent('taioe:lingua', { detail: { lingua: l } })); } catch (e) {}
    return true;
  }

  // Grava a língua e reaplica os textos. Devolve true se mudou.
  function definir(l) {
    l = valida(l);
    if (!l) return false;
    try { localStorage.setItem(CHAVE, l); } catch (e) {}
    return trocar(l);
  }

  // Quem quer saber quando a pessoa escolhe no seletor (o hub grava no perfil).
  function aoEscolher(fn) { ouvintes.push(fn); }

  function ligar() {
    if (ligado) return;
    ligado = true;
    document.addEventListener('change', function (ev) {
      var s = ev.target;
      if (!s || !s.matches || !s.matches('select[data-seletor-lingua]')) return;
      if (!definir(s.value)) return;
      ouvintes.slice().forEach(function (fn) { try { fn(atual, s); } catch (e) {} });
    });
    window.addEventListener('storage', function (ev) {      // trocou noutra aba
      if (ev.key === CHAVE) trocar(valida(ev.newValue) || doNavegador());
    });
  }

  window.TaioeI18n = { LINGUAS: LINGUAS.slice(), lingua: function () { return atual; }, definir: definir,
    t: t, aplicar: aplicar, marcar: marcar, aoEscolher: aoEscolher, data: data };

  marcarRaiz();
  if (document.body) aplicar(document);
  else document.addEventListener('DOMContentLoaded', function () { aplicar(document); });
})();
