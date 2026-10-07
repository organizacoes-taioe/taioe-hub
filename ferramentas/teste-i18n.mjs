// Confere as línguas da interface (pt, es, en):
//  - as três línguas têm as mesmas chaves, os mesmos «{x}» e as mesmas marcas HTML;
//  - toda chave usada no HTML e no JS existe, e toda chave do dicionário é usada;
//  - o texto em português do HTML é igual ao do dicionário (o HTML é o que se vê sem JS);
//  - nenhum texto visível nem atributo (aria-label, title, placeholder, alt, description)
//    ficou sem chave, e nenhuma string em português ficou solta no JS;
//  - toda página tem o seletor de língua e carrega textos-i18n.js e i18n.js antes dos outros;
//  - nada de script ou estilo inline (CSP).
// public/admin/ fica de fora (só em português). Os documentos legais ficam em português
// dentro de <div lang="pt-BR">.          Rodar:  node hub/ferramentas/teste-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const LINGUAS = ['pt', 'es', 'en'];
const PREFIXOS = /^(comum|erro|inicio|p404|entrar|cadastro|confirmar|excluir|conta|legal)\./;
const LIVRES = new Set(['Taioé', 'Taioé Cards', 'contato@taioe.com.br', 'Português', 'Español', 'English', '·']);
const VAZIOS = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'wbr']);
const ATRIBUTOS = ['aria-label', 'title', 'placeholder', 'alt'];
// strings do JS que não aparecem para a pessoa
const JS_LIVRES = new Set(['use strict', 'taioe-sessao: host sem ambiente']);

let falhas = 0;
const falha = (...m) => { falhas++; console.log('FALHA', ...m); };

const janela = {};
vm.runInContext(readFileSync(join(PUBLIC, 'comum/textos-i18n.js'), 'utf8'), vm.createContext({ window: janela }));
const D = janela.TaioeTextos;

// 1. as três línguas
const chaves = Object.keys(D.pt);
const vars = (s) => [...s.matchAll(/\{([A-Za-z0-9_]+)(?::[a-z]+)?\}/g)].map((m) => m[0]).sort().join(' ');
const marcas = (s) => [...s.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>/gi)]
  .map((m) => `<${m[1]}${m[2]} ${(/\shref="([^"]*)"/.exec(m[3]) || [])[1] || ''}>`).join('');
for (const l of LINGUAS) {
  for (const k of Object.keys(D[l])) if (!(k in D.pt)) falha(`«${k}» existe em ${l} e não em pt`);
  for (const k of chaves) {
    if (!(k in D[l])) { falha(`falta «${k}» em ${l}`); continue; }
    if (!PREFIXOS.test(k)) falha(`chave fora dos prefixos: «${k}»`);
    if (vars(D[l][k]) !== vars(D.pt[k])) falha(`«${k}» em ${l}: valores ${vars(D[l][k])} ≠ ${vars(D.pt[k])}`);
    if (marcas(D[l][k]) !== marcas(D.pt[k])) falha(`«${k}» em ${l}: HTML diferente do pt`);
    if (l === 'es' && /\b(vosotros|vuestr[oa]s?|coger)\b/i.test(D[l][k])) falha(`«${k}» em es: palavra a evitar`);
  }
}
const mesoclise = /[A-Za-zÀ-ÿ]+-(lo|la|los|las|o|a|os|as|me|te|se|lhe|lhes|nos|vos|no|na)-(ei|as|á|ás|emos|eis|ão|ia|ias|íamos|íeis|iam)\b/;
for (const k of chaves) if (mesoclise.test(D.pt[k])) falha(`mesóclise em «${k}»`);

// 2. os arquivos
function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'admin' || n === 'vendor' || n === 'fontes' ? [] : arquivos(p);
    return [p];
  });
}
const todos = arquivos(PUBLIC);
const usadas = new Set();
const norm = (s) => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
const semMarcas = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const interpolar = (s, v, html) => s.replace(/\{([A-Za-z0-9_]+)(?::[a-z]+)?\}/g,
  (x, n) => { const r = v && v[n] != null ? String(v[n]) : ''; return html ? esc(r) : r; });
const attr = (a, nome) => {
  const m = a.match(new RegExp(`(?:^|\\s)${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  return m ? (m[2] ?? m[3]) : null;
};
const usar = (onde, k) => { usadas.add(k); if (!(k in D.pt)) falha(`${onde}: chave inexistente «${k}»`); };

for (const p of todos.filter((f) => f.endsWith('.html'))) {
  const nome = relative(PUBLIC, p).replace(/\\/g, '/');
  const html = readFileSync(p, 'utf8');
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) falha(`${nome}: <script> inline`);
  if (/<style[\s>]/i.test(html) || /\sstyle\s*=/i.test(html)) falha(`${nome}: estilo inline`);
  if (/\son[a-z]+\s*=/i.test(html)) falha(`${nome}: atributo on…= (script inline)`);
  if (!/<footer class="rodape">[^]*<select data-seletor-lingua>[^]*<\/footer>/.test(html)) falha(`${nome}: sem seletor de língua no rodapé`);
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  if (scripts[0] !== '/comum/textos-i18n.js' || scripts[1] !== '/comum/i18n.js') falha(`${nome}: textos-i18n.js e i18n.js devem vir antes dos outros scripts`);

  const pilha = [];
  const re = /<!--[^]*?-->|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!')) continue;
    if (m[4] !== undefined) {                                   // texto
      const tx = m[4].replace(/\s+/g, ' ').trim();
      const dentro = pilha.some((e) => e.traduz || e.livre);
      if (tx && /\p{L}/u.test(tx) && !dentro && !LIVRES.has(tx)) falha(`${nome}: texto sem chave: «${tx}»`);
      continue;
    }
    const [, fecha, tagM, atrs] = m;
    const tag = tagM.toLowerCase();
    if (fecha) {
      let i = pilha.length - 1;
      while (i >= 0 && pilha[i].tag !== tag) i--;
      if (i < 0) continue;
      const e = pilha[i];
      pilha.length = i;
      const dentro = html.slice(e.fim, m.index);
      const v = e.vars ? JSON.parse(e.vars) : null;
      if (e.k && e.k in D.pt && norm(semMarcas(dentro)) !== norm(interpolar(D.pt[e.k], v, false)))
        falha(`${nome}: o texto de «${e.k}» no HTML difere do dicionário pt:\n   html: ${norm(semMarcas(dentro))}\n   pt:   ${norm(interpolar(D.pt[e.k], v, false))}`);
      if (e.kh && e.kh in D.pt && norm(dentro) !== norm(interpolar(D.pt[e.kh], v, true)))
        falha(`${nome}: o HTML de «${e.kh}» difere do dicionário pt:\n   html: ${norm(dentro)}\n   pt:   ${norm(interpolar(D.pt[e.kh], v, true))}`);
      continue;
    }
    const k = attr(atrs, 'data-i18n'), kh = attr(atrs, 'data-i18n-html'), ka = attr(atrs, 'data-i18n-attr');
    if (k) usar(nome, k);
    if (kh) usar(nome, kh);
    const traduzidos = new Set();
    if (ka) for (const par of ka.split(';')) {
      const [a, c] = par.split(':').map((x) => x.trim());
      traduzidos.add(a); usar(nome, c);
      if (attr(atrs, a) !== null && c in D.pt && attr(atrs, a) !== D.pt[c]) falha(`${nome}: ${a} difere de «${c}» no pt`);
    }
    for (const a of ATRIBUTOS) {
      const val = attr(atrs, a);
      if (val && /\p{L}/u.test(val) && !traduzidos.has(a) && !LIVRES.has(val)) falha(`${nome}: ${a}="${val}" sem chave`);
    }
    if (tag === 'meta' && attr(atrs, 'name') === 'description' && !traduzidos.has('content')) falha(`${nome}: description sem chave`);
    const lang = attr(atrs, 'lang');
    if (VAZIOS.has(tag) || /\/\s*$/.test(atrs)) continue;
    pilha.push({ tag, k, kh, vars: attr(atrs, 'data-i18n-vars'), traduz: !!(k || kh),
      livre: tag === 'script' || tag === 'style' || tag === 'option' || (tag !== 'html' && lang === 'pt-BR'),
      fim: m.index + m[0].length });
  }
}

// 3. o JS: chaves usadas e nenhuma string em português solta
const semComentarios = (s) => s.replace(/\/\*[^]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
for (const p of todos.filter((f) => f.endsWith('.js') && !/textos-i18n\.js$|i18n\.js$/.test(f))) {
  const nome = relative(PUBLIC, p).replace(/\\/g, '/');
  const js = semComentarios(readFileSync(p, 'utf8'));
  for (const [, , s] of js.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    if (PREFIXOS.test(s) && /^[a-z0-9]+\.[a-z0-9-]+$/.test(s)) usar(nome, s);
    else if (JS_LIVRES.has(s)) continue;
    else if (/[À-ÿ…«»]/.test(s) || /\p{L}{2,} \p{L}{2,}/u.test(s)) falha(`${nome}: texto sem chave no JS: '${s}'`);
  }
}
for (const k of chaves) if (!usadas.has(k)) falha(`chave sem uso: «${k}»`);

console.log(falhas ? `${falhas} falha(s)` : `ok: ${chaves.length} chaves × ${LINGUAS.length} línguas, ${todos.filter((f) => f.endsWith('.html')).length} páginas conferidas`);
process.exit(falhas ? 1 : 0);
