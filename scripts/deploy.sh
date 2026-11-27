#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "${APP_DIR:-/var/www/planimetrika}" && pwd -P)"
target="${1:?usage: deploy.sh <commit SHA | --recover-only>}"
[[ "$target" == --recover-only || "$target" =~ ^[0-9a-f]{40}$ ]] || exit 2
web=planimetrika
bot=planimetrika-tg
releases="$root/.releases"
journal="$releases/switching"
current="$releases/current"
ingress_ready="${DEPLOY_INGRESS_READY_FILE:-/run/planimetrika/ready}"
health_url="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3000/login}"
checks="${DEPLOY_HEALTH_ATTEMPTS:-50}"
interval="${DEPLOY_HEALTH_INTERVAL:-2}"
mkdir -p "$releases"
exec 9>"$releases/deploy.lock"
flock -n 9 || { echo "Другой выпуск выполняется" >&2; exit 1; }

# An admitted recovery must close ingress even when PM2 cannot start.
if [[ "$target" == --recover-only || -f "$journal" ]]; then
  rm -f -- "$ingress_ready"
  sync -f "$(dirname -- "$ingress_ready")"
fi

# Atomic, durable files on the same filesystem as the release directories.
publish() {
  local file="$1"
  shift
  printf '%s\n' "$@" > "$file.new"
  sync -f "$file.new"
  mv -f "$file.new" "$file"
  sync -f "$(dirname -- "$file")"
}

close_ingress() {
  rm -f -- "$ingress_ready" && sync -f "$(dirname -- "$ingress_ready")"
}

open_ingress() {
  local dir="$1"
  [[ ! -e "$journal" && -f "$current" && "$(cat "$current")" == "$dir" ]] || return 1
  publish "$ingress_ready" "$dir"
}

safe_release() {
  local dir="$1"
  [[ "$dir" == "$releases/"* && -s "$dir/.next/BUILD_ID" && -s "$dir/.rollback-compatible" &&
     "$(realpath -- "$dir")" == "$dir" ]] &&
    grep -Eq '^telegram-report-v2 [0-9a-f]{40}$' "$dir/.rollback-compatible"
}

pm2() { command pm2 "$@" 9>&-; }

process_info() {
  pm2 jlist | node -e '
    const name=process.argv[1];
    const apps=JSON.parse(require("node:fs").readFileSync(0,"utf8")).filter(p=>p.name===name);
    if (apps.length!==1) {
      console.log(apps.length ? "multiple" : "absent");
    } else {
      const p=apps[0];
      console.log(JSON.stringify([p.pm2_env.status,p.pm2_env.pm_cwd,p.pid,p.pm2_env.pm_uptime]));
    }
  ' "$1"
}

stop() {
  local name="$1" info
  info="$(process_info "$name")" || return 1
  if [[ "$info" != absent ]]; then
    pm2 delete "$name" || return 1
    [[ "$(process_info "$name")" == absent ]] || return 1
  fi
}

stop_pair() {
  stop "$bot" && stop "$web"
}

start_web() {
  pm2 start npm --name "$web" --cwd "$1" -- run start -- --hostname 127.0.0.1 9>&-
}

start_bot() {
  local dir="$1" launch="$2"
  TELEGRAM_READY_FILE="$dir/.telegram-ready" TELEGRAM_READY_LAUNCH="$launch" \
    pm2 start "$dir/scripts/telegram-poller.ts" --interpreter node --node-args="--import tsx" \
      --name "$bot" --cwd "$dir" 9>&-
}

wait_web() {
  local dir="$1" i info
  for ((i=0; i<checks; i++)); do
    if info="$(process_info "$web")" && node -e '
      const p=JSON.parse(process.argv[1]);
      process.exit(p[0]==="online" && p[1]===process.argv[2] && p[2]>0 ? 0 : 1);
    ' "$info" "$dir" 2>/dev/null && curl -fsS --max-time 3 "$health_url" >/dev/null; then return 0; fi
    sleep "$interval"
  done
  return 1
}

wait_bot() {
  local dir="$1" launch="$2" i info
  for ((i=0; i<checks; i++)); do
    if info="$(process_info "$bot")" && node -e '
      const p=JSON.parse(process.argv[1]);
      const r=JSON.parse(require("node:fs").readFileSync(process.argv[2]+"/.telegram-ready","utf8"));
      process.exit(p[0]==="online" && p[1]===process.argv[2] && p[2]>0 &&
        r.release===p[1] && r.pid===p[2] && r.launch===process.argv[3] && Number.isFinite(p[3]) && r.readyAt>=p[3] ? 0 : 1);
    ' "$info" "$dir" "$launch" 2>/dev/null; then return 0; fi
    sleep "$interval"
  done
  return 1
}

activate() {
  local dir="$1" launch
  launch="$(node -p 'require("node:crypto").randomUUID()')" || return 1
  rm -f -- "$dir/.telegram-ready" || return 1
  start_web "$dir" && wait_web "$dir" && start_bot "$dir" "$launch" &&
    wait_bot "$dir" "$launch" && wait_web "$dir" && wait_bot "$dir" "$launch" || return 1
  active_launch="$launch"
}

clear_journal() {
  rm -f -- "$journal" && sync -f "$releases"
}

recover() {
  local old next committed="" restore="" entry
  close_ingress || return 1
  {
    IFS= read -r old && IFS= read -r next
  } < "$journal" || return 1
  if [[ -f "$current" ]]; then
    IFS= read -r committed < "$current" || return 1
  fi
  if [[ -n "$next" && "$committed" == "$next" ]] && safe_release "$next"; then
    restore="$next"
  elif [[ "$committed" == "$old" ]]; then
    restore="$old"
  else
    return 1
  fi

  # Compare persisted intent with both live PM2 entries, then rebuild the pair.
  # Save the stopped state before running anything against the upgraded schema.
  for entry in "$bot" "$web"; do process_info "$entry" >/dev/null || return 1; done
  stop_pair && pm2 save --force || return 1
  if [[ -n "$restore" ]] && safe_release "$restore" &&
    (cd "$restore" && npx --no-install tsx scripts/check-unlink-release.ts) &&
    activate "$restore" && pm2 save --force && wait_web "$restore" && wait_bot "$restore" "$active_launch"; then
    publish "$current" "$restore" && clear_journal && open_ingress "$restore" || return 1
    return 0
  fi
  if [[ "$restore" == "$next" && -n "$old" ]] && safe_release "$old" &&
    stop_pair && pm2 save --force &&
    (cd "$old" && npx --no-install tsx scripts/check-unlink-release.ts) &&
    activate "$old" && pm2 save --force && wait_web "$old" && wait_bot "$old" "$active_launch"; then
    publish "$current" "$old" && clear_journal && open_ingress "$old" || return 1
    return 0
  fi
  stop_pair && pm2 save --force || return 1
  rm -f -- "$current" && clear_journal || return 1
  echo "Безопасная пара недоступна. Веб и воркер остановлены." >&2
  return 1
}

on_exit() {
  local result=$?
  trap - EXIT
  trap '' INT TERM
  if [[ "$target" != --recover-only && -f "$journal" ]] && ! recover; then
    if [[ -f "$journal" ]]; then
      echo "Восстановление не завершено. Журнал сохранён для повторного запуска." >&2
    fi
    exit 1
  fi
  exit "$result"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# A cold daemon writes its startup banner to stdout of the first command.
pm2 ping >/dev/null
if [[ "$target" == --recover-only ]]; then
  if [[ ! -f "$journal" ]]; then
    # Treat a normal boot as recovery too. Never trust or resurrect dump.pm2.
    boot_release=""
    if [[ -f "$current" ]]; then IFS= read -r boot_release < "$current"; fi
    publish "$journal" "$boot_release" ""
  fi
  recover
  exit
fi

if [[ -f "$journal" ]]; then recover; fi
previous=""
if [[ -f "$current" ]]; then
  IFS= read -r previous < "$current"
  if ! safe_release "$previous"; then
    # A first upgrade may replace a known prior protocol, but cannot restore it.
    [[ "$previous" == "$releases/"* && "$(realpath -- "$previous")" == "$previous" ]] &&
      grep -Eq '^telegram-binding-v1 [0-9a-f]{40}
fi
candidate="$(mktemp -d "$releases/$target.XXXXXX")"
git -C "$root" archive "$target" | tar -x -C "$candidate"
[[ -s "$candidate/drizzle/0057_telegram_report_prompt.sql" && -s "$candidate/scripts/nginx/planimetrika-ingress.conf" ]] || {
  echo "Артефакт не поддерживает текущий протокол Telegram и ingress" >&2
  exit 1
}
for file in .env .env.local .env.production .env.production.local; do
  [[ ! -f "$root/$file" ]] || ln -s "$root/$file" "$candidate/$file"
done
cd "$candidate"
npm ci
npm run build
[[ -s .next/BUILD_ID ]]
close_ingress
publish "$journal" "$previous" "$candidate"
stop_pair
pm2 save --force
npx --no-install drizzle-kit migrate
npx --no-install tsx scripts/check-unlink-release.ts
activate "$candidate"
publish "$candidate/.rollback-compatible" "telegram-report-v2 $target"
publish "$current" "$candidate"
pm2 save --force
wait_web "$candidate"
wait_bot "$candidate" "$active_launch"
clear_journal
open_ingress "$candidate"
echo "Веб и воркер проверены. Предыдущий артефакт: ${previous:-отсутствует}"
 "$previous/.rollback-compatible" || {
        echo "Некорректный указатель предыдущего релиза" >&2; exit 1;
      }
  fi
fi
candidate="$(mktemp -d "$releases/$target.XXXXXX")"
git -C "$root" archive "$target" | tar -x -C "$candidate"
[[ -s "$candidate/drizzle/0057_telegram_report_prompt.sql" && -s "$candidate/scripts/nginx/planimetrika-ingress.conf" ]] || {
  echo "Артефакт не поддерживает текущий протокол Telegram и ingress" >&2
  exit 1
}
for file in .env .env.local .env.production .env.production.local; do
  [[ ! -f "$root/$file" ]] || ln -s "$root/$file" "$candidate/$file"
done
cd "$candidate"
npm ci
npm run build
[[ -s .next/BUILD_ID ]]
close_ingress
publish "$journal" "$previous" "$candidate"
stop_pair
pm2 save --force
npx --no-install drizzle-kit migrate
npx --no-install tsx scripts/check-unlink-release.ts
activate "$candidate"
publish "$candidate/.rollback-compatible" "telegram-report-v2 $target"
publish "$current" "$candidate"
pm2 save --force
wait_web "$candidate"
wait_bot "$candidate" "$active_launch"
clear_journal
open_ingress "$candidate"
echo "Веб и воркер проверены. Предыдущий артефакт: ${previous:-отсутствует}"
