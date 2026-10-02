#!/usr/bin/env bash
# Ежедневная резервная копия базы Планиметрики.
#
#   • pg_dump в сжатом формате (-Fc) → $BACKUP_DIR/planimetrika_ГГГГ-ММ-ДД_ЧЧММ.dump
#   • копия сразу проверяется (pg_restore --list): битый файл = ошибка
#   • храним BACKUP_KEEP_DAYS дней (по умолчанию 14), старые удаляем
#   • если задан BACKUP_S3_BUCKET — копия ещё и уходит в облачное хранилище
#     (S3 Timeweb Cloud: данные остаются в России, что важно по 152-ФЗ);
#     без копии вне сервера бэкап не спасёт, если умрёт сам сервер
#   • при любой ошибке — сообщение владельцу в Telegram
#
# Настройки берутся из .env.local проекта (DATABASE_URL, TELEGRAM_BOT_TOKEN,
# OWNER_TELEGRAM_CHAT_ID, BACKUP_*). Установка на сервер — см. README,
# раздел «Резервные копии».

set -uo pipefail

APP_DIR="${APP_DIR:-/var/www/planimetrika}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.local}"

# Читаем .env.local, не исполняя его как скрипт (в значениях бывают & и пробелы).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

DATABASE_URL="${DATABASE_URL:-$(env_get DATABASE_URL)}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(env_get TELEGRAM_BOT_TOKEN)}"
OWNER_CHAT="${OWNER_TELEGRAM_CHAT_ID:-$(env_get OWNER_TELEGRAM_CHAT_ID)}"
BACKUP_DIR="${BACKUP_DIR:-$(env_get BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/planimetrika}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(env_get BACKUP_KEEP_DAYS)}"; KEEP_DAYS="${KEEP_DAYS:-14}"
S3_BUCKET="${BACKUP_S3_BUCKET:-$(env_get BACKUP_S3_BUCKET)}"
S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-$(env_get BACKUP_S3_ENDPOINT)}"; S3_ENDPOINT="${S3_ENDPOINT:-https://s3.twcstorage.ru}"
TG_API="${TELEGRAM_API_BASE:-https://api.telegram.org}"

notify() {
  [ -n "$BOT_TOKEN" ] && [ -n "$OWNER_CHAT" ] || return 0
  curl -s -m 15 --noproxy localhost,127.0.0.1 -o /dev/null "$TG_API/bot$BOT_TOKEN/sendMessage" \
    --data-urlencode "chat_id=$OWNER_CHAT" --data-urlencode "text=$1" || true
}
fail() {
  echo "❌ $1"
  notify "⚠️ Резервная копия базы Планиметрики НЕ сделана: $1"
  exit 1
}

[ -n "$DATABASE_URL" ] || fail "не найден DATABASE_URL (ожидался в $ENV_FILE)"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR" || fail "не удалось создать папку $BACKUP_DIR"

STAMP="$(TZ=Europe/Moscow date +%Y-%m-%d_%H%M)"
FILE="$BACKUP_DIR/planimetrika_$STAMP.dump"
TMP="$FILE.part"

echo "▶ Копия базы → $FILE"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$TMP" \
  || { rm -f "$TMP"; fail "pg_dump завершился с ошибкой"; }

# Проверяем, что файл читается и в нём есть главная таблица.
pg_restore --list "$TMP" > "$TMP.list" 2>/dev/null || { rm -f "$TMP" "$TMP.list"; fail "файл копии не читается (pg_restore --list)"; }
grep -q "TABLE DATA public users" "$TMP.list" || { rm -f "$TMP" "$TMP.list"; fail "в копии нет данных таблицы users"; }
rm -f "$TMP.list"
mv "$TMP" "$FILE"
chmod 600 "$FILE"
SIZE="$(du -h "$FILE" | cut -f1)"
echo "✓ Готово: $SIZE"

if [ -n "$S3_BUCKET" ]; then
  echo "▶ Отправка в облако s3://$S3_BUCKET"
  command -v aws >/dev/null || fail "задан BACKUP_S3_BUCKET, но не установлен aws (apt install awscli)"
  AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-$(env_get BACKUP_S3_ACCESS_KEY)}" \
  AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-$(env_get BACKUP_S3_SECRET_KEY)}" \
  AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ru-1}" \
    aws --endpoint-url "$S3_ENDPOINT" s3 cp "$FILE" "s3://$S3_BUCKET/db/$(basename "$FILE")" --only-show-errors \
    || fail "копия сделана на сервере ($SIZE), но не ушла в облако"
  echo "✓ В облаке"
fi

# Старые копии на сервере (в облаке срок хранения задаётся правилом бакета).
find "$BACKUP_DIR" -name 'planimetrika_*.dump' -mtime +"$KEEP_DAYS" -delete
COUNT="$(find "$BACKUP_DIR" -name 'planimetrika_*.dump' | wc -l | tr -d ' ')"
echo "✓ На сервере копий: $COUNT (храним $KEEP_DAYS дн.)"

# Раз в неделю (по понедельникам) — короткий отчёт, что бэкапы живы.
if [ "$(TZ=Europe/Moscow date +%u)" = "1" ]; then
  notify "✅ Резервные копии базы в порядке: последняя $STAMP ($SIZE), на сервере $COUNT шт.$([ -n "$S3_BUCKET" ] && echo ', копия в облаке есть' || echo '. Копии вне сервера нет — настройте BACKUP_S3_BUCKET')."
fi
