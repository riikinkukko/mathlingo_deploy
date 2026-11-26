#!/usr/bin/env bash
set -euo pipefail
script="$(realpath scripts/deploy.sh)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export APP_DIR="$tmp/app" MOCK="$tmp/state"
export DEPLOY_HEALTH_ATTEMPTS=1 DEPLOY_HEALTH_INTERVAL=0
mkdir -p "$APP_DIR/.next" "$MOCK" "$tmp/bin"
export PATH="$tmp/bin:$PATH"
printf 'bootstrap\n' > "$APP_DIR/.next/BUILD_ID"
git -C "$APP_DIR" init -q
git -C "$APP_DIR" -c user.name=Fixture -c user.email=fixture@test.local commit --allow-empty -qm fixture
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
    node -e 'const f=require("node:fs"); console.log(JSON.stringify(["planimetrika","planimetrika-tg"].filter(n=>f.existsSync(process.env.MOCK+"/"+n)).map(name=>({name,pm2_env:{status:"online"}}))))'
    ;;
  delete) rm -f "$MOCK/$2" ;;
  start)
    name="$4"
    cwd="$6"
    [[ -s "$cwd/.next/BUILD_ID" ]]
    if [[ "$name" == planimetrika ]]; then
      [[ ! -e "$MOCK/planimetrika-tg" ]]
    else
      [[ "$(cat "$MOCK/planimetrika")" == "$cwd" ]]
      if [[ "${FAIL_BOT:-0}" == 1 && ! -e "$MOCK/failed" ]]; then
        touch "$MOCK/failed"
        if [[ -n "${TELEGRAM_READY_FILE:-}" ]]; then
          printf '%s\n' "$cwd" > "$MOCK/$name"
          exit 0
        fi
        exit 1
      fi
      if [[ -n "${TELEGRAM_READY_FILE:-}" ]]; then printf '123\n' > "$TELEGRAM_READY_FILE"; fi
    fi
    printf '%s\n' "$cwd" > "$MOCK/$name"
    ;;
  save) ;;
  *) exit 1 ;;
esac
MOCK_SCRIPT
chmod +x "$tmp/bin/"*
printf '%s\n' "$APP_DIR" > "$MOCK/planimetrika"
printf '%s\n' "$APP_DIR" > "$MOCK/planimetrika-tg"

if FAIL_BUILD=1 bash "$script" "$sha"; then exit 1; fi
[[ "$(cat "$MOCK/planimetrika")" == "$APP_DIR" && ! -e "$MOCK/migrations" ]]
if FAIL_MIGRATION=1 bash "$script" "$sha"; then exit 1; fi
[[ "$(cat "$MOCK/planimetrika-tg")" == "$APP_DIR" ]]
if FAIL_BOT=1 bash "$script" "$sha"; then exit 1; fi
[[ "$(cat "$MOCK/planimetrika")" == "$APP_DIR" && "$(cat "$MOCK/planimetrika-tg")" == "$APP_DIR" ]]
bash "$script" "$sha"
previous="$(cat "$APP_DIR/.releases/current")"
[[ "$(cat "$MOCK/planimetrika")" == "$previous" && "$(cat "$MOCK/planimetrika-tg")" == "$previous" ]]
rm "$MOCK/failed"
if FAIL_BOT=1 bash "$script" "$sha"; then exit 1; fi
[[ "$(cat "$APP_DIR/.releases/current")" == "$previous" && "$(cat "$MOCK/planimetrika-tg")" == "$previous" ]]
bash "$script" "$sha"
[[ -s "$previous/.next/BUILD_ID" && -s "$APP_DIR/.next/BUILD_ID" ]]
if MISSING_GUARD=1 bash "$script" "$sha"; then exit 1; fi
[[ ! -e "$MOCK/planimetrika" && ! -e "$MOCK/planimetrika-tg" ]]
bash "$script" "$sha"
echo "Release rehearsal passed: build, migration and bot failure, rollback and retry."
