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
3. **Armazenamento:** tudo o que um app grava no navegador leva o prefixo dele (`hub:`, `cards:`, `biblioteca:`), em localStorage, IndexedDB, Cache Storage, BroadcastChannel e Web Locks.
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

## Deploy

Workers Builds, a cada push na `main`: comando de build vazio, deploy com `npx wrangler deploy`. Nas outras branches, `npx wrangler versions upload`.

Use sempre `wrangler.jsonc`, nunca TOML.
