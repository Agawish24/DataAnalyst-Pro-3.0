#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "[start.sh] Root dir: $ROOT_DIR"

echo "[start.sh] Starting Python analytics service on port 8000..."
cd "$ROOT_DIR/python-service"
python3 app.py &
PYTHON_PID=$!
echo "[start.sh] Python PID: $PYTHON_PID"

echo "[start.sh] Waiting for Python service to be ready (up to 60s)..."
PYTHON_READY=0
for i in $(seq 1 60); do
  if ! kill -0 $PYTHON_PID 2>/dev/null; then
    echo "[start.sh] ERROR: Python process died before becoming ready."
    exit 1
  fi
  if python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)" > /dev/null 2>&1; then
    echo "[start.sh] Python service ready after ${i}s."
    PYTHON_READY=1
    break
  fi
  sleep 1
done

if [ $PYTHON_READY -eq 0 ]; then
  echo "[start.sh] ERROR: Python service did not become ready within 60s. Aborting."
  kill $PYTHON_PID 2>/dev/null
  exit 1
fi

cd "$ROOT_DIR"
echo "[start.sh] Starting Node.js backend on port ${PORT:-3001}..."
node server/src/index.js &
NODE_PID=$!
echo "[start.sh] Node.js PID: $NODE_PID"

cleanup() {
  echo "[start.sh] Shutting down..."
  kill $PYTHON_PID $NODE_PID 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT

wait $NODE_PID
echo "[start.sh] Node.js exited. Stopping Python..."
kill $PYTHON_PID 2>/dev/null
