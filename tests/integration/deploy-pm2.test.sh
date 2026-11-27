#!/usr/bin/env bash
set -euo pipefail

script="$(realpath scripts/deploy.sh)"
sandbox="$(mktemp -d)"
export APP_DIR="$sandbox/app" PM2_HOME="$sandbox/pm2" FIXTURE="$sandbox"
export DEPLOY_HEALTH_ATTEMPTS=30 DEPLOY_HEALTH_INTERVAL=0.2
export DEPLOY_INGRESS_READY_FILE="$sandbox/ready"
ingress_port="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
export FIXTURE_WEB_PORT="$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
export DEPLOY_HEALTH_URL="http://127.0.0.1:$FIXTURE_WEB_PORT/login"
real_pm2="$(command -v pm2)"
cleanup() {
  local result=$?
  if ((result)); then
    for log in "$PM2_HOME"/logs/*-error*.log; do
      [[ ! -f "$log" ]] || tail -n 30 "$log"
    done
  fi
  if [[ -s "$sandbox/nginx.pid" ]]; then nginx -p "$sandbox" -c "$sandbox/nginx.conf" -s quit || true; fi
  "$real_pm2" kill >/dev/null 2>&1 || true
  rm -rf -- "$sandbox"
  exit "$result"
}
trap cleanup EXIT
mkdir -p "$APP_DIR/scripts" "$sandbox/bin"
export PATH="$sandbox/bin:$PATH"

sed "s|/run/planimetrika/ready|$DEPLOY_INGRESS_READY_FILE|" scripts/nginx/planimetrika-ingress.conf > "$sandbox/ingress.conf"
cat > "$sandbox/nginx.conf" <<NGINX
pid $sandbox/nginx.pid;
error_log $sandbox/nginx.log;
events {}
http {
  access_log off;
  client_body_temp_path $sandbox/client;
  proxy_temp_path $sandbox/proxy;
  fastcgi_temp_path $sandbox/fastcgi;
  uwsgi_temp_path $sandbox/uwsgi;
  scgi_temp_path $sandbox/scgi;
  server {
    listen 127.0.0.1:$ingress_port;
    server_name planimetrika.test;
    include $sandbox/ingress.conf;
    location / { proxy_pass http://127.0.0.1:$FIXTURE_WEB_PORT; }
  }
  server {
    listen 127.0.0.1:$ingress_port;
    server_name other.test;
    location / { return 200 "other"; }
  }
}
NGINX
nginx -p "$sandbox" -c "$sandbox/nginx.conf"
external() {
  curl -sS --max-time 3 -H "Host: ${1:-planimetrika.test}" "http://127.0.0.1:$ingress_port/" "${@:2}"
}
assert_closed() {
  [[ "$(external planimetrika.test -o /dev/null -w '%{http_code}')" == 503 ]]
  [[ "$(external other.test)" == other ]]
}
wait_for_bot_pause() {
  for ((i=0; i<120; i++)); do
    [[ ! -e "$sandbox/bot-paused" ]] || return 0
    sleep 0.1
  done
  return 1
}

cat > "$APP_DIR/scripts/telegram-poller.ts" <<'JS'
const fs = require("node:fs");
const { TELEGRAM_READY_FILE, TELEGRAM_READY_LAUNCH, FIXTURE } = process.env;
function ready() {
if (!fs.existsSync(FIXTURE + "/fail-bot") || !process.cwd().endsWith(fs.readFileSync(FIXTURE + "/fail-bot", "utf8"))) {
  fs.writeFileSync(TELEGRAM_READY_FILE, JSON.stringify({
    pid: process.pid, release: process.cwd(), launch: TELEGRAM_READY_LAUNCH, readyAt: Date.now(),
  }));
}
}
let marked = false;
setInterval(() => {
  if (marked) return;
  if (fs.existsSync(FIXTURE + "/hold-bot")) {
    fs.writeFileSync(FIXTURE + "/bot-paused", "waiting");
    return;
  }
  ready();
  marked = true;
}, 75);
JS
cat > "$APP_DIR/scripts/web.cjs" <<'JS'
const fs = require("node:fs");
const fixture = process.env.FIXTURE + "/fail-web";
if (fs.existsSync(fixture) && process.cwd().endsWith(fs.readFileSync(fixture, "utf8"))) process.exit(1);
require("node:http").createServer((req, res) => res.end(process.cwd())).listen(Number(process.env.FIXTURE_WEB_PORT), "127.0.0.1");
JS
mkdir -p "$APP_DIR/drizzle" "$APP_DIR/scripts/nginx"
cp drizzle/0056_telegram_binding_period.sql "$APP_DIR/drizzle/"
cp scripts/nginx/planimetrika-ingress.conf "$APP_DIR/scripts/nginx/"
git -C "$APP_DIR" init -q
git -C "$APP_DIR" add .
git -C "$APP_DIR" -c user.name=Fixture -c user.email=fixture@test.local commit -qm fixture
sha="$(git -C "$APP_DIR" rev-parse HEAD)"
project_modules="$(realpath node_modules)"
export project_modules
cat > "$sandbox/bin/npm" <<'JS'
#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
switch (process.argv.slice(2).join(" ")) {
  case "ci": fs.symlinkSync(process.env.project_modules, "node_modules"); break;
  case "run build":
    fs.mkdirSync(".next", { recursive: true });
    fs.writeFileSync(".next/BUILD_ID", "fixture");
    if (process.env.FAIL_COMPONENT) fs.writeFileSync(process.env.FIXTURE + "/fail-" + process.env.FAIL_COMPONENT, path.basename(process.cwd()));
    break;
  case "run start -- --hostname 127.0.0.1": require(path.join(process.cwd(), "scripts/web.cjs")); break;
  default: process.exitCode = 1;
}
JS
cat > "$sandbox/bin/npx" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat > "$sandbox/bin/mv" <<'SH'
#!/usr/bin/env bash
set -eu
if [[ "${INTERRUPT_ACTIVATION:-}" == before && "${@: -1}" == */current ]]; then
  kill -KILL "$PPID"
  exit 137
fi
/bin/mv "$@"
if [[ "${INTERRUPT_ACTIVATION:-}" == after && "${@: -1}" == */current ]]; then kill -KILL "$PPID"; fi
SH
chmod +x "$sandbox/bin/"*
current="$APP_DIR/.releases/current"
journal="$APP_DIR/.releases/switching"
if bash "$script" --recover-only; then exit 1; fi
[[ ! -e "$current" ]]
assert_closed
touch "$sandbox/hold-bot"
bash "$script" "$sha" &
release_pid=$!
wait_for_bot_pause
curl -fsS "$DEPLOY_HEALTH_URL" >/dev/null
assert_closed
rm "$sandbox/hold-bot" "$sandbox/bot-paused"
wait "$release_pid"
before="$(cat "$current")"
assert_pair() {
  local dir="$1"
  [[ "$(cat "$current")" == "$dir" && ! -e "$journal" ]]
  [[ "$(external)" == "$dir" && "$(external other.test)" == other ]]
  pm2 jlist | node -e '
    const fs=require("node:fs"), assert=require("node:assert/strict");
    const live=JSON.parse(fs.readFileSync(0,"utf8"));
    const saved=JSON.parse(fs.readFileSync(process.env.PM2_HOME+"/dump.pm2","utf8"));
    for(const name of ["planimetrika","planimetrika-tg"]) {
      const app=live.find(p=>p.name===name);
      assert.equal(app?.pm2_env?.status,"online");
      assert.equal(app.pm2_env.pm_cwd,process.argv[1]);
      assert.equal(saved.find(p=>p.name===name)?.pm_cwd,process.argv[1]);
    }
  ' "$dir"
}
assert_pair "$before"

if FAIL_COMPONENT=web bash "$script" "$sha"; then exit 1; fi
assert_pair "$before"

FAIL_COMPONENT=bot bash "$script" "$sha" &
release_pid=$!
saw_candidate=false
for ((i=0; i<100; i++)); do
  backend="$(curl -fsS --max-time 1 "$DEPLOY_HEALTH_URL" 2>/dev/null || true)"
  if [[ -n "$backend" && "$backend" != "$before" ]]; then
    assert_closed
    saw_candidate=true
    break
  fi
  sleep 0.1
done
[[ "$saw_candidate" == true ]]
if wait "$release_pid"; then exit 1; fi
assert_pair "$before"

for point in before after; do
  if INTERRUPT_ACTIVATION="$point" bash "$script" "$sha"; then exit 1; fi
  committed="$(cat "$current")"
  [[ -s "$journal" ]]
  if [[ "$point" == before ]]; then [[ "$committed" == "$before" ]]; else [[ "$committed" != "$before" ]]; fi
  assert_closed
  pm2 kill
  touch "$sandbox/hold-bot"
  bash "$script" --recover-only &
  release_pid=$!
  wait_for_bot_pause
  curl -fsS "$DEPLOY_HEALTH_URL" >/dev/null
  assert_closed
  rm "$sandbox/hold-bot" "$sandbox/bot-paused"
  wait "$release_pid"
  assert_pair "$committed"
done

echo "Real PM2 recovered matching live and saved pairs after KILL and daemon shutdown, with ingress closed throughout."
