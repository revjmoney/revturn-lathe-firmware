#!/bin/sh
# REVTURN on the Antminer S9 (Orphan): build revturnd on the board and install it as the Orphan core
# "orphan_revturn". Run ON the S9, from a clone of this repo:   sh s9/install.sh
# by JMSCNC, makers of RotatoCAM. [Rev. J. Money - 2026] GPL-3.0-or-later.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
DEST=${DEST:-/opt/ardzy/projects/orphan_revturn}

command -v ardzy >/dev/null || { echo "This needs an S9 running Orphan (the 'ardzy' tool loads the FPGA design)."; exit 1; }
command -v gcc >/dev/null && command -v make >/dev/null || { echo "Needs gcc and make:  apt install build-essential"; exit 1; }

echo "== building revturnd (grblHAL core from main/grbl + s9/driver.c)"
make -C "$HERE" -j2

echo "== installing to $DEST"
mkdir -p "$DEST/s9" /var/lib/revturn/files
cp "$HERE/revturnd" "$DEST/revturnd.new" && mv -f "$DEST/revturnd.new" "$DEST/revturnd"   # works while it runs
cp "$HERE/orphan/main.py" "$HERE/orphan/project.json" "$DEST/"
cp "$HERE"/fpga/*.v "$HERE/fpga/pins.xdc" "$HERE/fpga/orphan_revturn.bit" "$HERE/fpga/stepgen_test.py" "$DEST/"
cp "$HERE/revturn_web.py" "$HERE/www/lathe.html.gz" "$DEST/s9/"
# stepgen_test.py uses Orphan's register library; every Orphan core folder carries a copy
[ -f "$DEST/blocks.py" ] || cp "$(ls /opt/ardzy/projects/*/blocks.py | head -1)" "$DEST/" 2>/dev/null || true

echo "== done. Start (or restart) it:   ardzy load orphan_revturn"
echo "   screen: http://revturn.local:8000/lathe.html    gSender/ioSender: Network (Telnet) revturn.local port 23"
