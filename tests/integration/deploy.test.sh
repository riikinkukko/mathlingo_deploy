#!/usr/bin/env bash
set -euo pipefail
script="$(realpath scripts/deploy.sh)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export APP_DIR="$tmp/app" MOCK="$tmp/state" DEPLOY_INGRESS_READY_FILE="$tmp/ready"
export DEPLOY_HEALTH_ATTEMPTS=1 DEPLOY_HEALTH_INTERVAL=0
mkdir -p "$APP_DIR/.next" "$MOCK" "$tmp/bin"
export PATH="$tmp/bin:$PATH"
printf 'bootstrap\n' > "$APP_DIR/.next/BUILD_ID"
mkdir -p "$APP_DIR/drizzle" "$APP_DIR/scripts/nginx"
cp drizzle/0056_telegram_binding_period.sql "$APP_DIR/drizzle/"
cp scripts/nginx/planimetrika-ingress.conf "$APP_DIR/scripts/nginx/"
git -C "$APP_DIR" init -q
git -C "$APP_DIR" add drizzle scripts/nginx
git -C "$APP_DIR" -c user.name=Fixture -c user.email=fixture@test.local commit -qm fixture
sha="$(git -C "$APP_DIR" rev-parse HEAD)"

cat > "$tmp/bin/npm" <<'MOCK_SCRIPT'
#!/usr/bin/env bash
set -eu
if [[ "$*" == "run build" ]]; then
  [[ "${FAIL_BUILD:-0}" != 1 ]] || exit 1
  mkdir -p .next
  printf 'built\n' > .next/BUILD_ID
fi
MOCK_SCRIPT
cat > "$tmp/bin/npx" <<'MOCK_SCRIPT'
#!/usr/bin/env bash
set -eu
[[ ! -e "$MOCK/planimetrika" && ! -e "$MOCK/planimetrika-tg" ]]
if [[ "$*" == *check-unlink-release.ts ]]; then
  [[ "${MISSING_GUARD:-0}" != 1 ]]
  exit
fi
printf 'migrated\n' >> "$MOCK/migrations"
[[ "${FAIL_MIGRATION:-0}" != 1 ]]
MOCK_SCRIPT
cat > "$tmp/bin/curl" <<'MOCK_SCRIPT'
#!/usr/bin/env bash
test -s "$MOCK/planimetrika"
MOCK_SCRIPT
cat > "$tmp/bin/pm2" <<'MOCK_SCRIPT'
#!/usr/bin/env bash
set -eu
case "$1" in
  jlist)
    node -e 'const f=require("node:fs"); console.log(JSON.stringify(["planimetrika","planimetrika-tg"].filter(n=>f.existsSync(process.env.MOCK+"/"+n)).map(name=>({name,pid:123,pm2_env:{status:"online",pm_uptime:100,pm_cwd:f.readFileSync(process.env.MOCK+"/"+name,"utf8").trim()}}))))'
    ;;
  delete) rm -f "$MOCK/$2" ;;
  start)
    while (($#)); do
      case "$1" in --name) name="$2"; shift ;; --cwd) cwd="$2"; shift ;; esac
      shift
    done
    [[ -s "$cwd/.next/BUILD_ID" ]]
    if [[ "$name" == planimetrika ]]; then
      [[ ! -e "$MOCK/planimetrika-tg" ]]
    else
      [[ "$(cat "$MOCK/planimetrika")" == "$cwd" ]]
      if [[ "${FAIL_BOT:-0}" == 1 && ! -e "$MOCK/failed" ]]; then
        touch "$MOCK/failed"
        # The marker exists, but was written by an older launch.
        printf '{"pid":123,"release":"%s","launch":"stale","readyAt":101}\n' "$cwd" > "$TELEGRAM_READY_FILE"
      else
        printf '{"pid":123,"release":"%s","launch":"%s","readyAt":101}\n' "$cwd" "$TELEGRAM_READY_LAUNCH" > "$TELEGRAM_READY_FILE"
      fi
    fi
    printf '%s\n' "$cwd" > "$MOCK/$name"
    ;;
  ping) ;;
  save)
    if [[ -n "${INTERRUPT:-}" && "${POINT:-}" == before-save && -f "$MOCK/planimetrika-tg" && ! -e "$MOCK/interrupted" ]]; then
      touch "$MOCK/interrupted"; kill "-$INTERRUPT" "$PPID"
    fi
    : > "$MOCK/dump"
    for app in planimetrika planimetrika-tg; do
      if [[ -f "$MOCK/$app" ]]; then cat "$MOCK/$app" >> "$MOCK/dump"; fi
    done
    if [[ -n "${INTERRUPT:-}" && "${POINT:-}" == after-save && -f "$MOCK/planimetrika-tg" && ! -e "$MOCK/interrupted" ]]; then
      touch "$MOCK/interrupted"; kill "-$INTERRUPT" "$PPID"
    fi
    ;;
  *) exit 1 ;;
esac
MOCK_SCRIPT
cat > "$tmp/bin/mv" <<'MOCK_SCRIPT'
#!/usr/bin/env bash
set -eu
/bin/mv "$@"
if [[ -n "${INTERRUPT:-}" && "${POINT:-}" == after-current && "${@: -1}" == */current && ! -e "$MOCK/interrupted" ]]; then
  touch "$MOCK/interrupted"; kill "-$INTERRUPT" "$PPID"
fi
MOCK_SCRIPT
chmod +x "$tmp/bin/"*
current="$APP_DIR/.releases/current"
journal="$APP_DIR/.releases/switching"
printf '%s\n' "$APP_DIR" > "$MOCK/planimetrika"
printf '%s\n' "$APP_DIR" > "$MOCK/planimetrika-tg"

assert_pair() {
  local release
  release="$(cat "$current")"
  [[ ! -e "$journal" && "$(cat "$DEPLOY_INGRESS_READY_FILE")" == "$release" && "$(cat "$MOCK/planimetrika")" == "$release" && "$(cat "$MOCK/planimetrika-tg")" == "$release" ]]
  [[ "$(cat "$MOCK/dump")" == "$release"$'\n'"$release" ]]
}

if FAIL_BUILD=1 bash "$script" "$sha"; then exit 1; fi
[[ "$(cat "$MOCK/planimetrika")" == "$APP_DIR" && ! -e "$MOCK/migrations" ]]
if FAIL_MIGRATION=1 bash "$script" "$sha"; then exit 1; fi
[[ ! -e "$MOCK/planimetrika" && ! -e "$MOCK/planimetrika-tg" && ! -e "$current" ]]
bash "$script" "$sha"
assert_pair
for signal in TERM KILL; do
  for point in before-save after-save after-current; do
    rm -f "$MOCK/interrupted" "$MOCK/failed"
    if INTERRUPT="$signal" POINT="$point" bash "$script" "$sha"; then exit 1; fi
    [[ -e "$MOCK/interrupted" ]]
    if [[ "$signal" == TERM ]]; then assert_pair; else [[ -e "$journal" ]]; fi
    expected="$(cat "$current")"
    if FAIL_BUILD=1 bash "$script" "$sha"; then exit 1; fi
    assert_pair
    [[ "$(cat "$current")" == "$expected" ]]
  done
done
rm -f "$MOCK/failed"
expected="$(cat "$current")"
if FAIL_BOT=1 bash "$script" "$sha"; then exit 1; fi
assert_pair
[[ "$(cat "$current")" == "$expected" ]]
if MISSING_GUARD=1 bash "$script" "$sha"; then exit 1; fi
[[ ! -e "$MOCK/planimetrika" && ! -e "$MOCK/planimetrika-tg" ]]
bash "$script" "$sha"
assert_pair
echo "Release recovery passed: TERM and KILL around save/current, stale marker, rollback and retry."
