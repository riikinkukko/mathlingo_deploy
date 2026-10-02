#!/usr/bin/env bash
# Деплой на сервере. Запускается из GitHub Actions (.github/workflows/deploy.yml)
# уже ПОСЛЕ `git pull` — поэтому здесь всегда свежая версия этого скрипта.
#
# Главное правило: неудачный деплой не должен ронять работающий сайт.
#   • Миграция не прошла → дальше не идём: новый код со старой схемой БД сломал бы сайт.
#   • Сборка упала → возвращаем прежнюю сборку .next и перезапускаем её.
#     (Раньше в этом случае pm2 перезапускал сайт на пустой .next — и сайт
#     лежал с 502, пока сборку не починили руками.)
#   • Бот перезапускаем только после успешной сборки.
# Любой провал — ненулевой код выхода → красный крестик в GitHub Actions.
#
# Переменная APP_DIR — только для локальной проверки скрипта.

APP_DIR="${APP_DIR:-/var/www/planimetrika}"
APP_NAME="planimetrika"
BOT_NAME="planimetrika-tg"

cd "$APP_DIR" || { echo "❌ Нет папки $APP_DIR"; exit 1; }

step() { echo; echo "▶ $*"; }
fail() { echo; echo "❌ $*"; exit 1; }

step "Зависимости"
npm install || fail "npm install не прошёл — сайт не трогаем, работает прежняя версия"

step "Миграции БД"
npx drizzle-kit migrate || fail "Миграция не прошла — сайт не трогаем, работает прежняя версия"

# Копия рабочей сборки без кэша (кэш большой и нужен только для ускорения
# сборки — его оставляем на месте, next build им воспользуется).
step "Резервная копия текущей сборки"
rm -rf .next-prev
if [ -f .next/BUILD_ID ]; then
  mkdir .next-prev
  find .next -mindepth 1 -maxdepth 1 ! -name cache -exec cp -a {} .next-prev/ \; \
    || fail "Не удалось сделать копию сборки — не рискуем, сайт не трогаем"
  echo "Сохранена сборка $(cat .next-prev/BUILD_ID)"
else
  echo "Рабочей сборки нет (первый деплой?) — копию не делаем"
fi

step "Сборка"
if npm run build; then
  step "Перезапуск сайта"
  pm2 restart "$APP_NAME" || fail "pm2 restart $APP_NAME не сработал"
  rm -rf .next-prev
else
  echo
  echo "❌ Сборка упала — возвращаем прежнюю версию сайта"
  if [ -d .next-prev ]; then
    # Кэш сборки забираем из новой папки обратно, чтобы не собирать с нуля.
    [ -d .next/cache ] && mv .next/cache .next-prev/cache
    rm -rf .next
    mv .next-prev .next
    pm2 restart "$APP_NAME" || true
    echo "Сайт работает на прежней сборке $(cat .next/BUILD_ID 2>/dev/null)"
  else
    echo "Прежней сборки нет — вернуть нечего"
  fi
  exit 1
fi

# Воркер Telegram-бота (+ напоминания). Удаляем ВСЕ копии и запускаем ровно
# одну: так подхватывается новый код бота и не плодятся дубли.
step "Перезапуск Telegram-бота"
pm2 delete "$BOT_NAME" >/dev/null 2>&1 || true
pm2 start npm --name "$BOT_NAME" -- run telegram:poll || fail "Не удалось запустить $BOT_NAME"
pm2 save

echo
echo "✅ Деплой завершён"
