#!/bin/sh
set -u

tar -xf - -C /workspace || {
  echo "STACKSHIFT_BUILD=not-run"
  echo "STACKSHIFT_ROUTE_ROOT=not-run"
  echo "Input archive could not be unpacked."
  exit 0
}
ln -s /opt/stackshift/node_modules /workspace/node_modules

if npm run build -- --webpack > /tmp/stackshift-build.log 2>&1; then
  echo "STACKSHIFT_BUILD=passed"
else
  echo "STACKSHIFT_BUILD=failed"
  echo "STACKSHIFT_ROUTE_ROOT=not-run"
  tail -n 50 /tmp/stackshift-build.log
  exit 0
fi

npm run start -- --hostname 127.0.0.1 --port 3000 > /tmp/stackshift-server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

attempt=0
while [ "$attempt" -lt 20 ]; do
  if node -e 'fetch("http://127.0.0.1:3000/").then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))'; then
    echo "STACKSHIFT_ROUTE_ROOT=passed"
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "STACKSHIFT_ROUTE_ROOT=failed"
tail -n 30 /tmp/stackshift-server.log
exit 0
