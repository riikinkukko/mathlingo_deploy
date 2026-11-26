#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "${APP_DIR:-/var/www/planimetrika}" && pwd -P)"
target="${1:?usage: deploy.sh <commit SHA>}"
[[ "$target" =~ ^[0-9a-f]{40}$ ]] || exit 2
web=planimetrika
bot=planimetrika-tg
releases="$root/.releases"
health_url="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3000/login}"
checks="${DEPLOY_HEALTH_ATTEMPTS:-50}"
interval="${DEPLOY_HEALTH_INTERVAL:-2}"
mkdir -p "$releases"
exec 9>"$releases/deploy.lock"
flock -n 9 || { echo "Другой выпуск выполняется" >&2; exit 1; }

previous="$root"
if [[ -f "$releases/current" ]]; then
  IFS= read -r previous < "$releases/current"
  [[ "$previous" == "$releases/"* && -f "$previous/.next/BUILD_ID" ]] || exit 1
fi
candidate="$(mktemp -d "$releases/$target.XXXXXX")"
ready="$candidate/.telegram-ready"
switching=0

status() {
  pm2 jlist | node -e '
    const name=process.argv[1];
    const apps=JSON.parse(require("node:fs").readFileSync(0,"utf8")).filter(p=>p.name===name);
    console.log(apps.length===0 ? "absent" : apps.length===1 ? apps[0].pm2_env.status : "multiple");
  ' "$1"
}

stop() {
  local name="$1" current
  current="$(status "$name")" || return 1
  if [[ "$current" != absent ]]; then
    pm2 delete "$name" || return 1
    [[ "$(status "$name")" == absent ]] || return 1
  fi
}

start_web() {
  pm2 start npm --name "$web" --cwd "$1" -- run start
}

start_bot() {
  TELEGRAM_READY_FILE="$2" pm2 start npm --name "$bot" --cwd "$1" -- run telegram:poll
}

wait_web() {
  local i
  for ((i=0; i<checks; i++)); do
    if [[ "$(status "$web")" == online ]] && curl -fsS --max-time 3 "$health_url" >/dev/null; then return 0; fi
    sleep "$interval"
  done
  return 1
}

wait_bot() {
  local marker="$1" i
  for ((i=0; i<checks; i++)); do
    if [[ "$(status "$bot")" == online && ( -z "$marker" || -s "$marker" ) ]]; then return 0; fi
    sleep "$interval"
  done
  return 1
}

rollback() {
  local result=$?
  trap - EXIT INT TERM
  if ((switching)); then
    echo "Выпуск не прошёл, восстанавливаем согласованную версию: $previous" >&2
    local previous_marker=""
    if [[ "$previous" != "$root" ]]; then
      previous_marker="$previous/.telegram-ready"
      rm -f "$previous_marker"
    fi
    if stop "$bot" && stop "$web" && npx --no-install tsx scripts/check-unlink-release.ts &&
      [[ -f "$previous/.next/BUILD_ID" ]] &&
      start_web "$previous" && wait_web &&
      start_bot "$previous" "$previous_marker" && wait_bot "$previous_marker" && pm2 save --force; then
      echo "Веб и воркер восстановлены" >&2
    else
      stop "$bot" || true
      stop "$web" || true
      pm2 save --force || true
      echo "Откат не подтверждён. Проверьте PM2 перед восстановлением сервиса." >&2
    fi
  fi
  exit "$result"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Подготовка изолированной сборки $target"
git -C "$root" archive "$target" | tar -x -C "$candidate"
for file in .env .env.local .env.production .env.production.local; do
  [[ ! -f "$root/$file" ]] || ln -s "$root/$file" "$candidate/$file"
done
cd "$candidate"
npm ci
npm run build
[[ -s .next/BUILD_ID ]]

switching=1
stop "$bot"
stop "$web"
# Forward-only. Rollback restores processes, keeping 0053 and 0054 in the database.
npx --no-install drizzle-kit migrate
npx --no-install tsx scripts/check-unlink-release.ts
start_web "$candidate"
wait_web
start_bot "$candidate" "$ready"
wait_bot "$ready"
wait_web
pm2 save --force
printf '%s\n' "$candidate" > "$releases/current.new"
mv "$releases/current.new" "$releases/current"
switching=0
echo "Веб и воркер проверены. Предыдущая версия сохранена: $previous"
