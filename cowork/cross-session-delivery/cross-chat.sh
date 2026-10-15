#!/bin/sh
# cross-chat launcher: finds a Node >= 22 runtime and runs the bundled CLI.
# A too-old node on PATH is skipped in favour of the runtime that ships with the client.
# `exec` hands the CLI's own exit code to the caller -- never mask it.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENTRY="$HERE/bin/cross-chat.js"
NEED='process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)'

usable() {
  [ -n "$1" ] && [ -x "$1" ] && "$1" -e "$NEED" >/dev/null 2>&1
}

# 1) node on PATH -- only if it is new enough
if command -v node >/dev/null 2>&1; then
  NODE_ON_PATH=$(command -v node)
  if usable "$NODE_ON_PATH"; then
    exec "$NODE_ON_PATH" "$ENTRY" "$@"
  fi
  echo "[cross-chat] ignoring $NODE_ON_PATH: it is older than Node 22 (the CLI needs node:sqlite)." >&2
fi

# 2) the runtime that ships with the client, then common locations
for candidate in \
  "$CODELY_HOME/node" "$CODELY_HOME/node.exe" \
  "$CODELY_CLI_BASE_DIR"/bin/*/node "$CODELY_CLI_BASE_DIR"/bin/*/node.exe \
  "$CODELY_APP_HOME"/cli/bin/*/node "$CODELY_APP_HOME"/cli/bin/*/node.exe \
  /usr/local/bin/node /opt/homebrew/bin/node
do
  if usable "$candidate"; then
    exec "$candidate" "$ENTRY" "$@"
  fi
done

# 3) right next to a codely CLI on PATH
CODELY_BIN=$(command -v codely 2>/dev/null || true)
if [ -n "$CODELY_BIN" ]; then
  DIR=$(dirname -- "$CODELY_BIN")
  for candidate in "$DIR/node" "$DIR/node.exe"; do
    if usable "$candidate"; then
      exec "$candidate" "$ENTRY" "$@"
    fi
  done
fi

echo "[cross-chat] No usable Node runtime found (need Node 22+). Install Node 22+ or install Tuanjie Cowork, then retry." >&2
exit 127
