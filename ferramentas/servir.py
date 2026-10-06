"""Serve os três sites juntos em http://localhost:8777, como em produção:
/cards → taioe/cards/public, /biblioteca → taioe/biblioteca/public, o resto → taioe/hub/public.

    python hub/ferramentas/servir.py

- não sai das pastas (recusa barra invertida e letra de drive, que no Windows escapariam);
- só atende o próprio Host, o que barra DNS rebinding;
- no localhost o módulo de sessão fala com o Supabase local (supabase start, no taioe-infra).
Não aplica o _headers: a CSP é conferida nos previews e em produção.
"""
import http.server
import os
from urllib.parse import unquote, urlsplit

B = os.path.dirname(os.path.abspath(__file__))
HUB = os.path.realpath(os.path.join(B, '..', 'public'))
APPS = {  # pastas irmãs: taioe/hub, taioe/cards, taioe/biblioteca
    '/cards': os.path.realpath(os.path.join(B, '..', '..', 'cards', 'public')),
    '/biblioteca': os.path.realpath(os.path.join(B, '..', '..', 'biblioteca', 'public')),
}
HOSTS = {'localhost:8777', '127.0.0.1:8777'}
PROIBIDO = os.path.join(HUB, '__proibido__')  # não existe: vira 404


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'}

    def send_head(self):
        if self.headers.get('Host') not in HOSTS:
            self.send_error(403)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def translate_path(self, path):
        p = unquote(urlsplit(path).path)
        raiz = HUB
        for pref, d in APPS.items():
            if p == pref or p.startswith(pref + '/'):
                raiz = d
                break
        partes = [s for s in p.split('/') if s not in ('', '.', '..')]
        if any('\\' in s or ':' in s for s in partes):
            return PROIBIDO
        final = os.path.realpath(os.path.join(raiz, *partes))
        try:
            if os.path.commonpath([final, raiz]) != raiz:
                return PROIBIDO
        except ValueError:  # drives diferentes no Windows
            return PROIBIDO
        return final


if __name__ == '__main__':
    print('Taioé local em http://localhost:8777/  (Ctrl+C para parar)')
    http.server.ThreadingHTTPServer(('127.0.0.1', 8777), H).serve_forever()
