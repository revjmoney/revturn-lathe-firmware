#!/usr/bin/env python3
"""REVTURN screen on the S9: serves the lathe screen and speaks the same protocol as the ESP32 lathe, so the screen
runs unchanged against revturnd (grblHAL on Linux).

  http://<board>:8000/lathe.html   the REVTURN lathe screen (also / and /index.html)
  http://<board>:8000/files...     the WebUI file API the screen uses (list, upload, delete), files in FILES_DIR
  http://<board>:8000/<name>       read a stored file (setup.json, programs)
  ws://<board>:81/                 the grbl stream in binary frames (ESP3D WebUI style), text frames currentID/activeID
  $F=/name                         runs a stored program: the bridge streams it to grblHAL (send/response) and adds
                                   |SD:pct,/name to status reports, like grblHAL's SD card plugin

by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later."""
import base64
import hashlib
import http.server
import json
import os
import re
import socket
import struct
import threading
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
HTTP_PORT = int(os.environ.get('REVTURN_HTTP_PORT', '8000'))
WS_PORT = int(os.environ.get('REVTURN_WS_PORT', '81'))
GRBL = ('127.0.0.1', 23)
FILES_DIR = os.environ.get('REVTURN_FILES', '/var/lib/revturn/files')
SCREEN = os.path.join(HERE, 'lathe.html.gz')
GUID = b'258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
NAME_RE = re.compile(r'^[A-Za-z0-9._ ()+-]{1,64}$')
os.makedirs(FILES_DIR, exist_ok=True)


def human(n):
    for unit, k in (('GB', 1 << 30), ('MB', 1 << 20), ('KB', 1 << 10)):
        if n >= k:
            return '%.2f %s' % (n / k, unit)
    return '%d B' % n


def listing():
    files = []
    for n in sorted(os.listdir(FILES_DIR)):
        p = os.path.join(FILES_DIR, n)
        if os.path.isfile(p):
            st = os.stat(p)
            files.append({'name': n, 'shortname': n, 'size': human(st.st_size), 'datetime': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.st_mtime))})
    sv = os.statvfs(FILES_DIR)
    total, free = sv.f_blocks * sv.f_frsize, sv.f_bavail * sv.f_frsize
    used = total - free
    return {'files': files, 'path': '/', 'total': human(total), 'used': human(used),
            'occupation': str(round(100 * used / total)) if total else '0', 'status': 'ok'}


def safe_name(n):
    n = urllib.parse.unquote(n).lstrip('/')
    return n if NAME_RE.match(n) and n not in ('.', '..') else None


def file_path(n, prefix=''):
    """The full path of file n in FILES_DIR, or None if it would land anywhere else."""
    # Names are already limited by NAME_RE (no slashes, never . or ..). The prefix test below is the form
    # CodeQL's path-injection query recognizes as a guard; the dirname test keeps files out of subfolders.
    root = os.path.realpath(FILES_DIR)
    p = os.path.realpath(os.path.join(root, prefix + n))
    if not p.startswith(root + os.sep):
        return None
    if os.path.dirname(p) != root:
        return None
    return p


def boundary_of(ctype):
    """The multipart boundary from a Content-Type header (plain string work, no regex)."""
    for part in ctype.split(';'):
        k, _, v = part.strip().partition('=')
        if k.lower() == 'boundary' and v:
            return v.strip().strip('"')
    return None


# ---------------------------------------------------------------- HTTP
class Http(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def send(self, code, body, kind='application/json', extra=()):
        b = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path in ('/', '/index.html', '/lathe.html'):
            return self.send(200, open(SCREEN, 'rb').read(), 'text/html; charset=utf-8', [('Content-Encoding', 'gzip')])
        if u.path == '/files':
            if q.get('action') == 'delete':
                n = safe_name(q.get('filename', ''))
                p = file_path(n) if n else None
                if p and os.path.isfile(p):
                    os.remove(p)
            return self.send(200, listing())
        n = safe_name(u.path)
        p = file_path(n) if n else None
        if p and os.path.isfile(p):
            with open(p, 'rb') as f:
                return self.send(200, f.read(), 'text/plain; charset=utf-8')
        return self.send(404, {'status': 'not found'})

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != '/files':
            return self.send(404, {'status': 'not found'})
        body = self.rfile.read(int(self.headers.get('Content-Length', 0) or 0))
        b = boundary_of(self.headers.get('Content-Type', ''))
        if not b:
            return self.send(400, {'status': 'no multipart boundary'})
        for part in body.split(b'--' + b.encode()):
            head, _, data = part.partition(b'\r\n\r\n')
            fm = re.search(rb'filename="([^"]*)"', head)
            if fm:
                n = safe_name(fm.group(1).decode('utf-8', 'replace'))
                dest = file_path(n) if n else None
                tmp = file_path(n, '.') if n else None
                if not dest or not tmp:
                    return self.send(400, {'status': 'bad file name'})
                tmp += '.part'
                with open(tmp, 'wb') as f:
                    f.write(data[:-2] if data.endswith(b'\r\n') else data)
                os.replace(tmp, dest)
        return self.send(200, listing())


# ---------------------------------------------------------------- WebSocket <-> grblHAL
def ws_recv(sock):
    def need(n):
        b = b''
        while len(b) < n:
            c = sock.recv(n - len(b))
            if not c:
                raise ConnectionError
            b += c
        return b
    h = need(2)
    op, ln = h[0] & 15, h[1] & 127
    if ln == 126:
        ln = struct.unpack('>H', need(2))[0]
    elif ln == 127:
        ln = struct.unpack('>Q', need(8))[0]
    mask = need(4) if h[1] & 128 else b'\0\0\0\0'
    d = bytearray(need(ln))
    for i in range(ln):
        d[i] ^= mask[i & 3]
    return op, bytes(d)


def ws_send(sock, data, op=2):
    n = len(data)
    head = bytes([128 | op]) + (bytes([n]) if n < 126 else bytes([126]) + struct.pack('>H', n) if n < 65536
                                else bytes([127]) + struct.pack('>Q', n))
    sock.sendall(head + data)


clients, clients_lock, next_id = [], threading.Lock(), [0]


class Client:
    def __init__(self, sock):
        self.sock, self.lock = sock, threading.Lock()
        next_id[0] += 1
        self.id = str(next_id[0])
        self.grbl = socket.create_connection(GRBL, 5)
        self.grbl.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.job = None          # a $F program being streamed

    def send_ws(self, data, op=2):
        with self.lock:
            ws_send(self.sock, data, op)


def broadcast_text(text):
    with clients_lock:
        for c in clients:
            try:
                c.send_ws(text.encode(), 1)
            except OSError:
                pass


class Job:
    """Stream a stored program to grblHAL, one line per ok (simple send/response)."""

    def __init__(self, client, name):
        self.client, self.name = client, name
        with open(file_path(name), encoding='utf-8', errors='replace') as f:
            self.lines = [l.strip() for l in f]
        self.lines = [l for l in self.lines if l and not l.startswith(('%', ';'))]
        self.sent = 0
        self.acks = threading.Semaphore(1)
        self.stop = False

    def start(self):
        # started only after client.job points at it: the first line's ok must find the job, or the job waits forever
        threading.Thread(target=self.run, daemon=True).start()

    def pct(self):
        return round(100 * self.sent / max(1, len(self.lines)), 1)

    def run(self):
        try:
            for line in self.lines:
                while not self.acks.acquire(timeout=0.2):
                    if self.stop:
                        return
                if self.stop:
                    return
                self.client.grbl.sendall(line.encode() + b'\n')
                self.sent += 1
            self.acks.acquire(timeout=600)                        # the last ok
        finally:
            if self.client.job is self:
                self.client.job = None


def grbl_reader(c):
    """grblHAL -> this WebSocket client. During a $F job its oks pace the job and are not passed on."""
    buf = b''
    try:
        while True:
            d = c.grbl.recv(4096)
            if not d:
                break
            buf += d
            out = b''
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                s = line.rstrip(b'\r')
                job = c.job
                if job and (s == b'ok' or s.startswith(b'error')):
                    if s.startswith(b'error'):
                        job.stop = True
                        out += s + b'\r\n'
                    job.acks.release()
                    continue
                if job and s.startswith(b'<') and s.endswith(b'>'):
                    s = s[:-1] + ('|SD:%.1f,/%s>' % (job.pct(), job.name)).encode()
                out += s + b'\r\n'
            if out:
                c.send_ws(out)
    except OSError:
        pass


def ws_client(sock):
    c = Client(sock)
    with clients_lock:
        clients.append(c)
    c.send_ws(('currentID:%s' % c.id).encode(), 1)
    broadcast_text('activeID:%s' % c.id)                           # the newest screen takes control, like ESP3D
    threading.Thread(target=grbl_reader, args=(c,), daemon=True).start()
    pending = b''
    try:
        while True:
            op, data = ws_recv(sock)
            if op == 8:
                break
            if op == 9:
                c.send_ws(data, 10)
                continue
            if op == 1:                                             # text: PING etc.
                continue
            pending += data
            raw = b''
            for b in data:                                          # realtime bytes go straight through
                if b in (0x18,):
                    if c.job:
                        c.job.stop = True
                        c.job = None
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                s = line.strip()
                m = re.match(rb'^\$F=/?(.+)$', s)
                if m and safe_name(m.group(1).decode('utf-8', 'replace')):
                    n = safe_name(m.group(1).decode())
                    if file_path(n) and os.path.isfile(file_path(n)):
                        c.send_ws(b'ok\r\n')
                        c.job = Job(c, n)
                        c.job.start()
                    else:
                        c.send_ws(b'error:60\r\n')                 # file not found
                    continue
                raw += line + b'\n'
            # realtime characters (single bytes such as ?, !, ~, 0x18, 0x84..) are not newline terminated
            if pending and all(b == 0x3F or b == 0x21 or b == 0x7E or b == 0x18 or b >= 0x80 for b in pending):
                raw += pending
                pending = b''
            if raw:
                c.grbl.sendall(raw)
    except (OSError, ConnectionError):
        pass
    with clients_lock:
        if c in clients:
            clients.remove(c)
    if c.job:
        c.job.stop = True
    for s in (c.grbl, sock):
        try:
            s.close()
        except OSError:
            pass
    with clients_lock:
        if clients:
            broadcast_text('activeID:%s' % clients[-1].id)


def ws_server():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('0.0.0.0', WS_PORT))
    srv.listen(8)
    while True:
        sock, _ = srv.accept()
        threading.Thread(target=ws_handshake, args=(sock,), daemon=True).start()


def ws_handshake(sock):
    try:
        req = b''
        while b'\r\n\r\n' not in req:
            d = sock.recv(4096)
            if not d:
                return
            req += d
        key = re.search(rb'Sec-WebSocket-Key: *([^\r\n]+)', req, re.I)
        if not key:
            sock.close()
            return
        acc = base64.b64encode(hashlib.sha1(key.group(1).strip() + GUID).digest())
        proto = re.search(rb'Sec-WebSocket-Protocol: *([^\r\n,]+)', req, re.I)
        sock.sendall(b'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                     b'Sec-WebSocket-Accept: ' + acc + b'\r\n' +
                     (b'Sec-WebSocket-Protocol: ' + proto.group(1).strip() + b'\r\n' if proto else b'') + b'\r\n')
        ws_client(sock)
    except OSError:
        pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    threading.Thread(target=ws_server, daemon=True).start()
    print('[orphan] REVTURN screen on the S9 | by JMSCNC, makers of RotatoCAM | http :%d  ws :%d' % (HTTP_PORT, WS_PORT), flush=True)
    Server(('0.0.0.0', HTTP_PORT), Http).serve_forever()
