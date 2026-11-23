"""[orphan] REVTURN on the S9: grblHAL (revturnd) on the ARM + the REVTURN FPGA step generator, and the REVTURN
lathe screen, exactly like the ESP32 lathe:
  http://revturn.local:8000/lathe.html   the screen (also http://<board ip>:8000)
  telnet/TCP revturn.local:23            the grbl stream (gSender, ioSender: "Network / Telnet", port 23)
  ws://revturn.local:81/                 the screen's live link
The board's own name stays orphan.local; this program answers revturn.local itself (mDNS).
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
NAME = b'revturn'


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 9))          # no packet is sent: this only picks the outgoing interface
        return s.getsockname()[0]
    finally:
        s.close()


def mdns_answer(ip):
    """An mDNS response packet: revturn.local A <ip>, TTL 120, cache-flush."""
    name = bytes([len(NAME)]) + NAME + bytes([5]) + b'local' + bytes([0])
    return (struct.pack('>6H', 0, 0x8400, 0, 1, 0, 0) + name +
            struct.pack('>HHIH', 1, 0x8001, 120, 4) + socket.inet_aton(ip))


def asks_for_us(pkt):
    """True if this mDNS query asks for revturn.local (A or ANY)."""
    if len(pkt) < 12 or pkt[2] & 0x80:       # responses are not questions
        return False
    qd = struct.unpack('>H', pkt[4:6])[0]
    i = 12
    for _ in range(qd):
        labels = []
        while i < len(pkt) and pkt[i]:
            if pkt[i] & 0xC0:                # compressed name: not ours
                i += 1
                labels = None
                break
            labels.append(pkt[i + 1:i + 1 + pkt[i]].lower())
            i += 1 + pkt[i]
        i += 1
        if i + 4 > len(pkt):
            return False
        qtype = struct.unpack('>H', pkt[i:i + 2])[0]
        i += 4
        if labels == [NAME, b'local'] and qtype in (1, 255):
            return True
    return False


def mdns_responder():
    """Answers 'revturn.local' itself (avahi refuses a second name for the board's own address: 'Local name
    collision'). Shares UDP 5353 with avahi, which keeps answering orphan.local."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, 'SO_REUSEPORT'):
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    s.bind(('', 5353))
    s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, socket.inet_aton('224.0.0.251') + socket.inet_aton('0.0.0.0'))
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 255)
    group = ('224.0.0.251', 5353)
    for _ in range(2):                       # announce
        s.sendto(mdns_answer(my_ip()), group)
        time.sleep(1)
    while True:
        pkt, src = s.recvfrom(9000)
        if asks_for_us(pkt):
            ans = mdns_answer(my_ip())
            s.sendto(ans, group)
            if src[1] != 5353:               # one-shot (legacy) query: answer it directly too
                s.sendto(pkt[:2] + ans[2:], src)


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
print('[orphan] REVTURN | by JMSCNC, makers of RotatoCAM | screen http://revturn.local:8000  grbl tcp :23  ws :81', flush=True)
revturn_web.Server(('0.0.0.0', revturn_web.HTTP_PORT), revturn_web.Http).serve_forever()
