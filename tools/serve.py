"""Локальный сервер для разработки.

    python3 tools/serve.py [порт]           → http://localhost:5173/
    python3 tools/serve.py [порт] --pages   → http://localhost:5173/ekonomia/ (как на GitHub Pages)

Отличия от `python3 -m http.server`: большая очередь соединений (браузер грузит
десятки модулей параллельно) и заголовок no-cache, чтобы правки были видны сразу.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES_BASE = "/ekonomia"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".js": "text/javascript"}
    base = ""

    def do_GET(self):
        if self.base:
            if self.path in ("/", self.base):
                self.send_response(301)
                self.send_header("Location", self.base + "/")
                self.end_headers()
                return
            if not self.path.startswith(self.base + "/"):
                self.send_error(404)
                return
            self.path = self.path[len(self.base):]
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


class Server(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 5173
    Handler.base = PAGES_BASE if "--pages" in sys.argv else ""
    httpd = Server(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    print(f"Открой http://localhost:{port}{Handler.base}/")
    httpd.serve_forever()
