#!/usr/bin/env bash
# Проверка, что резервную копию реально можно восстановить: разворачивает
# последнюю (или указанную) копию во ВРЕМЕННУЮ базу planimetrika_restore_check,
# считает строки в главных таблицах и удаляет временную базу.
# Рабочую базу не трогает. Запуск на сервере:
#   bash scripts/restore-check.sh                 # последняя копия
#   bash scripts/restore-check.sh /путь/к.dump    # конкретная
#
# Как восстановить рабочую базу из копии (только при настоящей аварии!):
#   pm2 stop planimetrika planimetrika-tg
#   pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" /var/backups/planimetrika/<файл>.dump
#   pm2 start planimetrika planimetrika-tg

set -uo pipefail
APP_DIR="${APP_DIR:-/var/www/planimetrika}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.local}"
env_get() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }

DATABASE_URL="${DATABASE_URL:-$(env_get DATABASE_URL)}"
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/planimetrika}"
FILE="${1:-$(ls -1t "$BACKUP_DIR"/planimetrika_*.dump 2>/dev/null | head -1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "❌ Копия не найдена в $BACKUP_DIR"; exit 1; }
[ -n "$DATABASE_URL" ] || { echo "❌ Нет DATABASE_URL"; exit 1; }

CHECK_DB="planimetrika_restore_check"
# Адрес временной базы: тот же сервер и пользователь, другое имя базы.
CHECK_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/$CHECK_DB\1#")"
ADMIN_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]+(\?|$)#/postgres\1#")"
[ "$CHECK_URL" != "$DATABASE_URL" ] || { echo "❌ Не удалось построить адрес временной базы"; exit 1; }

DB_USER="$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://([^:@/]+).*#\1#')"

# Создать/удалить временную базу: от имени пользователя БД, а если у него нет
# права CREATEDB и скрипт запущен от root — через системного пользователя postgres.
as_admin() {
  if psql "$ADMIN_URL" -qc "$1" >/dev/null 2>&1; then return 0; fi
  [ "$(id -u)" = "0" ] && su postgres -c "psql -qc \"$1\"" >/dev/null 2>&1
}

echo "▶ Копия: $FILE ($(du -h "$FILE" | cut -f1))"
as_admin "drop database if exists $CHECK_DB"
as_admin "create database $CHECK_DB owner $DB_USER" \
  || { echo "❌ Не удалось создать временную базу: нужен CREATEDB у пользователя БД или запуск от root"; exit 1; }
trap 'as_admin "drop database if exists $CHECK_DB"' EXIT

pg_restore --no-owner --no-privileges --dbname="$CHECK_URL" "$FILE" || { echo "❌ Восстановление прошло с ошибками"; exit 1; }
echo "▶ Что внутри:"
psql "$CHECK_URL" -tAc "
  select 'пользователей: ' || count(*) from users
  union all select 'попыток решения: ' || count(*) from attempts
  union all select 'заданий: ' || count(*) from homeworks
  union all select 'платежей: ' || count(*) from payments
  union all select 'последняя активность: ' || coalesce(to_char(max(created_at) at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI'), '—') from attempts"
echo "✅ Копия восстанавливается (временная база удалена)"
