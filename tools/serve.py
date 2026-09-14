#!/usr/bin/env python3
"""
Serves the project over HTTPS on your machine, because phone browsers only
hand out the camera on a secure origin.

    python3 tools/serve.py            # https://<your-ip>:8443
    python3 tools/serve.py --port 9000
    python3 tools/serve.py --http     # plain http, fine for ?preview on desktop

A self-signed certificate is generated on first run into tools/.dev-cert/.
Your phone will warn that the certificate is not trusted — tap through it
("Advanced" → "Proceed"). That warning is expected and only affects this
local test server, not your deployed site.
"""

import argparse
import http.server
import os
import socket
import ssl
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CERT_DIR = os.path.join(os.path.dirname(__file__), ".dev-cert")
CERT = os.path.join(CERT_DIR, "cert.pem")
KEY = os.path.join(CERT_DIR, "key.pem")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def ensure_cert():
    if os.path.exists(CERT) and os.path.exists(KEY):
        return True
    os.makedirs(CERT_DIR, exist_ok=True)
    ip = lan_ip()
    cmd = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", KEY, "-out", CERT, "-days", "365",
        "-subj", "/CN=" + ip,
        "-addext", f"subjectAltName=IP:{ip},IP:127.0.0.1,DNS:localhost",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except Exception as e:
        print("could not create a certificate:", e)
        print("install openssl, or run with --http and use ?preview on desktop")
        return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--http", action="store_true")
    a = ap.parse_args()

    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", a.port), Handler)
    scheme = "http"

    if not a.http:
        if not ensure_cert():
            return
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(CERT, KEY)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    ip = lan_ip()
    print(f"\n  serving {ROOT}")
    print(f"  phone   {scheme}://{ip}:{a.port}/")
    print(f"  desktop {scheme}://localhost:{a.port}/?preview=1")
    print("  ctrl-c to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
