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
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if ! kill -0 "$server_pid" 2>/dev/null; then
  echo "STACKSHIFT_ROUTE_ROOT=failed"
  tail -n 30 /tmp/stackshift-server.log
  exit 0
fi

node <<'NODE'
const routes = JSON.parse(Buffer.from(process.env.STACKSHIFT_EXPECTED_ROUTES || "W10=", "base64").toString("utf8"));
(async () => {
  let allPassed = true;
  for (const [index, route] of routes.entries()) {
    let passed = false;
    try {
      const response = await fetch(new URL(route, "http://127.0.0.1:3000"));
      passed = response.status === 200;
    } catch {}
    console.log(`STACKSHIFT_ROUTE_${index}=${passed ? "passed" : "failed"}`);
    if (route === "/") console.log(`STACKSHIFT_ROUTE_ROOT=${passed ? "passed" : "failed"}`);
    allPassed &&= passed;
  }
  process.exitCode = allPassed ? 0 : 1;
})().catch(() => { process.exitCode = 1; });
NODE
route_status=$?
if [ "$route_status" -ne 0 ]; then
  tail -n 30 /tmp/stackshift-server.log
fi
exit 0
