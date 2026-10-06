// Testa TaioeSessao.destinoSeguro contra as formas conhecidas de fuga da origem.
// Rodar depois de qualquer mudança no módulo de sessão:  node hub/ferramentas/teste-destino.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const arquivo = fileURLToPath(new URL('../public/comum/taioe-sessao.js', import.meta.url));
const janela = { localStorage: { getItem: () => null } };
const ctx = vm.createContext({ window: janela, localStorage: janela.localStorage, URL,
  location: { origin: 'https://taioe.com.br', hostname: 'taioe.com.br', pathname: '/', search: '' } });
vm.runInContext(readFileSync(arquivo, 'utf8'), ctx);
const { destinoSeguro } = janela.TaioeSessao;

let falhas = 0;
const fugas = ['//evil.com', '/.//evil.com', '/cards/..//evil.com', '/%2e//evil.com', '/\\evil.com',
  'https://evil.com/', 'javascript:alert(1)', '/entrar/?x=1', '/cards/../entrar/', '\\\\evil.com',
  '/cards/%2e%2e/%2e%2e//evil.com', '/\t/evil.com', ''];
for (const v of fugas) {
  const r = destinoSeguro(v);
  if (r !== '/') { falhas++; console.log('FALHOU', JSON.stringify(v), '→', r); }
}
const fica = [['/cards/', '/cards/'], ['/biblioteca/x/?a=1', '/biblioteca/x/?a=1'], ['/%2F%2Fevil.com', '/%2F%2Fevil.com']];
for (const [v, esperado] of fica) {
  const r = destinoSeguro(v);
  if (r !== esperado) { falhas++; console.log('FALHOU', JSON.stringify(v), '→', r); }
}
console.log(falhas ? `${falhas} falha(s)` : `ok: ${fugas.length} fugas barradas, ${fica.length} destinos válidos mantidos`);
process.exit(falhas ? 1 : 0);
