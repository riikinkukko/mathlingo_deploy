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
health_url="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3000/login}"
checks="${DEPLOY_HEALTH_ATTEMPTS:-50}"
interval="${DEPLOY_HEALTH_INTERVAL:-2}"
mkdir -p "$releases"
exec 9>"$releases/deploy.lock"
flock -n 9 || { echo "Другой выпуск выполняется" >&2; exit 1; }

# Atomic, durable files on the same filesystem as the release directories.
publish() {
  local file="$1"
  shift
  printf '%s\n' "$@" > "$file.new"
  sync -f "$file.new"
  mv -f "$file.new" "$file"
  sync -f "$releases"
}

safe_release() {
  local dir="$1"
  [[ "$dir" == "$releases/"* && -s "$dir/.next/BUILD_ID" && -s "$dir/.rollback-compatible" &&
     "$(realpath -- "$dir")" == "$dir" ]]
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
  pm2 start npm --name "$web" --cwd "$1" -- run start 9>&-
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
    wait_bot "$dir" "$launch" && wait_web "$dir" && wait_bot "$dir" "$launch"
}

clear_journal() {
  rm -f -- "$journal" && sync -f "$releases"
}

recover() {
  local old next committed="" restore="" entry
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
    activate "$restore" && pm2 save --force; then
    publish "$current" "$restore" && clear_journal
    return
  fi
  if [[ "$restore" == "$next" && -n "$old" ]] && safe_release "$old" &&
    stop_pair && pm2 save --force &&
    (cd "$old" && npx --no-install tsx scripts/check-unlink-release.ts) &&
    activate "$old" && pm2 save --force; then
    publish "$current" "$old" && clear_journal
    return
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
  if [[ -f "$journal" ]] && ! recover; then
    echo "Восстановление не завершено. Журнал сохранён для повторного запуска." >&2
    exit 1
  fi
  exit "$result"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
  safe_release "$previous" || { echo "Нет подтверждённого артефакта отката" >&2; exit 1; }
fi
candidate="$(mktemp -d "$releases/$target.XXXXXX")"
git -C "$root" archive "$target" | tar -x -C "$candidate"
for file in .env .env.local .env.production .env.production.local; do
  [[ ! -f "$root/$file" ]] || ln -s "$root/$file" "$candidate/$file"
done
cd "$candidate"
npm ci
npm run build
[[ -s .next/BUILD_ID ]]
publish "$journal" "$previous" "$candidate"
stop_pair
pm2 save --force
npx --no-install drizzle-kit migrate
npx --no-install tsx scripts/check-unlink-release.ts
activate "$candidate"
publish "$candidate/.rollback-compatible" "$target"
publish "$current" "$candidate"
pm2 save --force
clear_journal
echo "Веб и воркер проверены. Предыдущий артефакт: ${previous:-отсутствует}"
