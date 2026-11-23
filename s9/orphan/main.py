"""[orphan] REVTURN on the S9: grblHAL (revturnd) on the ARM + the REVTURN FPGA step generator, and the REVTURN
lathe screen, exactly like the ESP32 lathe:
  http://revturn.local:8000/lathe.html   the screen (also http://<board ip>:8000)
  telnet/TCP revturn.local:23            the grbl stream (gSender, ioSender: "Network / Telnet", port 23)
  ws://revturn.local:81/                 the screen's live link
The board's own name stays orphan.local; this program answers revturn-s9.local, and revturn.local too while no other
machine (the ESP32 REVTURN lathe, also called revturn) is answering that name.
by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later."""
import atexit
import os
import socket
import struct
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = b'revturn'        # the ESP32 REVTURN lathe uses this name too: only taken while no other machine answers it
OWN = b'revturn-s9'        # always answered by this board
names = {OWN}
names_lock = threading.Lock()
GROUP = ('224.0.0.251', 5353)


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 9))          # no packet is sent: this only picks the outgoing interface
        return s.getsockname()[0]
    finally:
        s.close()


def enc(name):
    return bytes([len(name)]) + name + bytes([5]) + b'local' + bytes([0])


def mdns_answer(name, ip):
    """An mDNS response packet: <name>.local A <ip>, TTL 120, cache-flush."""
    return (struct.pack('>6H', 0, 0x8400, 0, 1, 0, 0) + enc(name) +
            struct.pack('>HHIH', 1, 0x8001, 120, 4) + socket.inet_aton(ip))


def mdns_query(name):
    return struct.pack('>6H', 0, 0, 1, 0, 0, 0) + enc(name) + struct.pack('>HH', 1, 1)


def read_name(pkt, i):
    """(labels, next index) of a DNS name at i, following compression pointers."""
    labels, end, hops = [], None, 0
    while i < len(pkt) and hops < 20:
        n = pkt[i]
        if n == 0:
            i += 1
            break
        if n & 0xC0 == 0xC0:
            if i + 1 >= len(pkt):
                break
            if end is None:
                end = i + 2
            i = (n & 0x3F) << 8 | pkt[i + 1]
            hops += 1
            continue
        labels.append(pkt[i + 1:i + 1 + n].lower())
        i += 1 + n
    return labels, (end if end is not None else i)


def parse(pkt):
    """(is_response, [(name, qtype)] questions, [(name, ip)] A answers). Raises on garbage."""
    qd, an, ns, ar = struct.unpack('>4H', pkt[4:12])
    i, qs, ans = 12, [], []
    for _ in range(qd):
        labels, i = read_name(pkt, i)
        qs.append((labels, struct.unpack('>H', pkt[i:i + 2])[0]))
        i += 4
    for _ in range(an + ns + ar):
        labels, i = read_name(pkt, i)
        rtype, _, _, rdlen = struct.unpack('>HHIH', pkt[i:i + 10])
        i += 10
        if rtype == 1 and rdlen == 4:
            ans.append((labels, socket.inet_ntoa(pkt[i:i + 4])))
        i += rdlen
    return bool(pkt[2] & 0x80), qs, ans


def mdns_socket():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, 'SO_REUSEPORT'):
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    s.bind(('', 5353))
    s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, socket.inet_aton('224.0.0.251') + socket.inet_aton('0.0.0.0'))
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
    return s


def shared_name_free(s, ip):
    """Ask 3 times for revturn.local; free if nobody else answers within about 1 s (mDNS probing, RFC 6762 8.1)."""
    for _ in range(3):
        s.sendto(mdns_query(SHARED), GROUP)
        end = time.time() + 0.35
        while time.time() < end:
            s.settimeout(max(0.01, end - time.time()))
            try:
                pkt, _ = s.recvfrom(9000)
                resp, _, ans = parse(pkt)
            except (socket.timeout, struct.error, IndexError):
                continue
            if resp and any(n == [SHARED, b'local'] and a != ip for n, a in ans):
                return False
    return True


def mdns_responder():
    """Answers revturn-s9.local, and revturn.local while no other machine (the ESP32 lathe) has it. avahi refuses a
    second name for the board's own address ('Local name collision'), so this shares UDP 5353 with avahi, which keeps
    answering orphan.local."""
    s = mdns_socket()
    ip = my_ip()
    if shared_name_free(s, ip):
        with names_lock:
            names.add(SHARED)
    print('[orphan] REVTURN answers %s' % ', '.join(n.decode() + '.local' for n in sorted(names)), flush=True)
    s.settimeout(None)
    for _ in range(2):                       # announce
        for n in list(names):
            s.sendto(mdns_answer(n, ip), GROUP)
        time.sleep(1)
    while True:
        pkt, src = s.recvfrom(9000)
        try:
            resp, qs, ans = parse(pkt)
        except (struct.error, IndexError):
            continue
        ip = my_ip()
        if resp:
            # another machine says it is revturn.local (the ESP32 lathe came on): give the shared name back
            if SHARED in names and any(n == [SHARED, b'local'] and a != ip for n, a in ans):
                with names_lock:
                    names.discard(SHARED)
                print('[orphan] another machine is revturn.local (%s): this board stays revturn-s9.local' %
                      next(a for n, a in ans if n == [SHARED, b'local']), flush=True)
            continue
        for labels, qtype in qs:
            if qtype in (1, 255) and len(labels) == 2 and labels[1] == b'local' and labels[0] in names:
                ans_pkt = mdns_answer(labels[0], ip)
                s.sendto(ans_pkt, GROUP)
                if src[1] != 5353:           # one-shot (legacy) query: answer it directly too
                    s.sendto(pkt[:2] + ans_pkt[2:], src)


def stop():
    if proc.poll() is None:
        proc.terminate()


subprocess.run(['pkill', '-x', 'revturnd'])
proc = subprocess.Popen([os.path.join(HERE, 'revturnd')], cwd=HERE)
atexit.register(stop)
for _ in range(50):                          # wait for grblHAL's port 23
    try:
        socket.create_connection(('127.0.0.1', 23), 0.2).close()
        break
    except OSError:
        if proc.poll() is not None:
            sys.exit('revturnd stopped: is the orphan_revturn FPGA core loaded?')
        time.sleep(0.1)
threading.Thread(target=mdns_responder, daemon=True).start()
sys.path.insert(0, os.path.join(HERE, 's9'))
os.environ.setdefault('REVTURN_FILES', '/var/lib/revturn/files')
import revturn_web                           # noqa: E402  (serves forever)
revturn_web.threading.Thread(target=revturn_web.ws_server, daemon=True).start()
print('[orphan] REVTURN | by JMSCNC, makers of RotatoCAM | screen http://revturn-s9.local:8000  grbl tcp :23  ws :81', flush=True)
revturn_web.Server(('0.0.0.0', revturn_web.HTTP_PORT), revturn_web.Http).serve_forever()
