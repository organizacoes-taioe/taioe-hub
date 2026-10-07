# taioe-hub

Página inicial, login e conta de **taioe.com.br**. Worker da Cloudflare só com arquivos estáticos: publica a pasta `public/` e mais nada.

O plano da plataforma está em `PLANO.md`, na pasta `taioe/`, que não é repositório.

## Contrato da origem

Os três sites dividem a mesma origem (`https://taioe.com.br`). Cada repositório publica só o seu prefixo:

| caminho | repositório | como chega |
|---|---|---|
| `/cards`, `/cards/...` | `taioe-cards` | route `taioe.com.br/cards*` |
| `/biblioteca`, `/biblioteca/...` | `taioe-biblioteca` | route `taioe.com.br/biblioteca*` |
| todo o resto | `taioe-hub` | Custom Domain `taioe.com.br` |

1. **Prefixos:** nenhum caminho do hub começa com `cards` ou `biblioteca`. Cada repositório declara nas routes só o próprio prefixo.
2. **Sessão:** as chaves `taioe-auth` e `taioe-auth-*` do armazenamento são do módulo de sessão, e ninguém mais as usa.
3. **Armazenamento:** tudo o que um app grava no navegador leva o prefixo dele (`hub:`, `cards:`, `biblioteca:`), em localStorage, IndexedDB, Cache Storage, BroadcastChannel e Web Locks. A única chave comum é `taioe:lingua` (a língua da interface, abaixo); «apagar também os dados deste aparelho» apaga o prefixo `taioe:` junto com os outros.
4. **Proibido:**
   - `localStorage.clear()`;
   - cookies;
   - o cabeçalho `Service-Worker-Allowed`;
   - scripts e estilos inline;
   - scripts de terceiros (a única exceção é o Turnstile, só em `/entrar/`);
   - beacons de estatística.
5. **Service worker** só em `/<app>/sw.js`, com escopo `/<app>/`. O hub não tem service worker nem manifest.
6. **supabase-js:** a mesma versão nos três repositórios, com o sha256 anotado aqui e conferido pelo CI de cada um.
7. **Routes:** depois de todo deploy que mexer em `wrangler.jsonc`, e uma vez por mês, confira que existem **exatamente duas**: `taioe.com.br/cards*` → `taioe-cards` e `taioe.com.br/biblioteca*` → `taioe-biblioteca`.
8. **Administração:** não existe tela de administração no site.

## Línguas da interface

O hub e os Cards têm interface em português, espanhol e inglês; a Biblioteca, só em português. O módulo é `public/comum/i18n.js` (`window.TaioeI18n`: `lingua()`, `definir(l)`, `t(chave, vars)`, `aplicar(raiz)`, `marcar(el, chave, vars, html)`) e os textos ficam em `public/comum/textos-i18n.js`, com as mesmas chaves nas três línguas. Os dois vêm antes de qualquer outro script da página.

- **Qual língua:** `localStorage['taioe:lingua']`, se existir; senão a primeira de `navigator.languages` que comece por `pt`, `es` ou `en`; senão `pt`. A chave é a mesma nos Cards.
- **Com login:** ao entrar, vale `conta.perfis.lingua_interface` (e ela vai para o localStorage). Trocar no seletor, logado, grava no perfil (`hub.js`; nas páginas sem `hub.js`, `comum/lingua-perfil.js` o carrega só se houver sessão). O cadastro grava a língua em que a pessoa se cadastrou.
- **No HTML:** `data-i18n`, `data-i18n-html` (só HTML do dicionário; valores de `data-i18n-vars` entram escapados) e `data-i18n-attr="aria-label:chave"`. O texto em português fica escrito no HTML, igual ao do dicionário. Texto que o JS muda usa `marcar()`, para continuar certo quando a língua muda.
- **Seletor:** `<select data-seletor-lingua>` no rodapé de todas as páginas (menos `/admin/`, só em português) e em Minha conta.
- **Documentos legais:** ficam em português, dentro de `<div lang="pt-BR">`; em espanhol e inglês aparece no topo um aviso de que a versão oficial é a portuguesa.

Depois de mexer em textos ou telas: `node hub/ferramentas/teste-i18n.mjs` (chaves nas três línguas, nada sem chave, nada inline).

## Arquivos comuns (cópias idênticas nos três repositórios)

| arquivo | sha256 |
|---|---|
| `public/comum/vendor/supabase-js-2.117.2.js` (UMD do npm, integridade conferida) | `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd` |
| `public/comum/taioe-sessao.js` (contrato v1) | `f5e6246142d41d3bff5e7c8b08e82284690f3a492169593b938a6347788cc8e3` |

Nos apps, as cópias ficam em `public/<app>/vendor/` e `public/<app>/js/`. O workflow **Cópias** de cada repositório confere estes valores; ao mudar um arquivo, mude o valor aqui e nos três workflows, no mesmo dia.

## Rodar no computador

1. No `taioe-infra`: `supabase start` (o Supabase local, com o Mailpit em http://127.0.0.1:54324).
2. Na pasta `taioe`: `python hub/ferramentas/servir.py` e abrir http://localhost:8777/.
3. O código de acesso chega no Mailpit. No localhost, o Turnstile usa a chave de teste oficial, que sempre passa.

Depois de mexer no módulo de sessão: `node hub/ferramentas/teste-destino.mjs`.

## Deploy

Workers Builds, a cada push na `main`: comando de build vazio, deploy com `npx wrangler deploy`. Nas outras branches, `npx wrangler versions upload`.

Use sempre `wrangler.jsonc`, nunca TOML.
