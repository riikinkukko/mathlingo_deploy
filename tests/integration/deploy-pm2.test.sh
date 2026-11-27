#!/usr/bin/env bash
set -euo pipefail

script="$(realpath scripts/deploy.sh)"
sandbox="$(mktemp -d)"
export APP_DIR="$sandbox/app" PM2_HOME="$sandbox/pm2" FIXTURE="$sandbox"
export DEPLOY_HEALTH_ATTEMPTS=18 DEPLOY_HEALTH_INTERVAL=0.2
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
  "$real_pm2" kill >/dev/null 2>&1 || true
  rm -rf -- "$sandbox"
  exit "$result"
}
trap cleanup EXIT
mkdir -p "$APP_DIR/scripts" "$sandbox/bin"
export PATH="$sandbox/bin:$PATH"
cat > "$APP_DIR/scripts/telegram-poller.ts" <<'JS'
const fs = require("node:fs");
const { TELEGRAM_READY_FILE, TELEGRAM_READY_LAUNCH, FIXTURE } = process.env;
if (!fs.existsSync(FIXTURE + "/fail-bot") || !process.cwd().endsWith(fs.readFileSync(FIXTURE + "/fail-bot", "utf8"))) {
  fs.writeFileSync(TELEGRAM_READY_FILE, JSON.stringify({
    pid: process.pid, release: process.cwd(), launch: TELEGRAM_READY_LAUNCH, readyAt: Date.now(),
  }));
}
setInterval(() => {}, 1000);
JS
cat > "$APP_DIR/scripts/web.cjs" <<'JS'
const fs = require("node:fs");
const fixture = process.env.FIXTURE + "/fail-web";
if (fs.existsSync(fixture) && process.cwd().endsWith(fs.readFileSync(fixture, "utf8"))) process.exit(1);
require("node:http").createServer((req, res) => res.end("fixture")).listen(Number(process.env.FIXTURE_WEB_PORT), "127.0.0.1");
JS
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
  case "run start": require(path.join(process.cwd(), "scripts/web.cjs")); break;
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
/bin/mv "$@"
if [[ "${INTERRUPT_ACTIVATION:-}" == yes && "${@: -1}" == */current ]]; then
  kill -KILL "$PPID"
fi
SH
chmod +x "$sandbox/bin/"*
current="$APP_DIR/.releases/current"
journal="$APP_DIR/.releases/switching"
if bash "$script" --recover-only; then exit 1; fi
[[ ! -e "$current" ]]
bash "$script" "$sha"
before="$(cat "$current")"
assert_pair() {
  local dir="$1"
  [[ "$(cat "$current")" == "$dir" && ! -e "$journal" ]]
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
for component in web bot; do
  if FAIL_COMPONENT="$component" bash "$script" "$sha"; then exit 1; fi
  assert_pair "$before"
done
if INTERRUPT_ACTIVATION=yes bash "$script" "$sha"; then exit 1; fi
candidate="$(cat "$current")"
[[ "$candidate" != "$before" && -s "$journal" ]]
pm2 kill
bash "$script" --recover-only
assert_pair "$candidate"
echo "Real PM2 recovered matching live and saved pairs after KILL and daemon shutdown."
