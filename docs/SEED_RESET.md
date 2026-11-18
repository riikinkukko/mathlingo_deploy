# Безопасный seed и проверка восстановления

`npm run seed` обновляет учебный контент по стабильным ID. Демо-данные создаются, если в базе нет пользователей. В заполненной БД пользователи и их прогресс сохраняются.

`npm run seed:reset` предназначен только для отдельно созданного одноразового PostgreSQL. Команда требует `ALLOW_SEED_RESET=1`, явный `SEED_RESET_DATABASE_URL` на `127.0.0.1` с портом и `SEED_RESET_TOKEN` из 32 строчных шестнадцатеричных символов. На самой БД должно быть установлено описание `planimetrika:seed-reset:<токен>`. Имя базы имеет вид `seed_reset_test_<случайный идентификатор из 32 шестнадцатеричных символов>`. Адрес из `.env.local` для reset игнорируется. Метка ставится при подготовке новой БД и остаётся действительной до её удаления. Устанавливать её на существующей, общей или рабочей БД нельзя.

Перед записью CLI проверяет имя, роль и описание БД на том же соединении, на котором исполняется транзакция. Удаления, запись учебного контента, создание демо-данных и SRS фиксируются вместе. При ошибке PostgreSQL откатывает всю операцию. Команда удаляет текущий набор таблиц seed и каскадно зависимые строки. Для совершенно чистой базы создайте новый временный экземпляр.

## Локальный запуск

В отдельном сеансе Bash с Docker и OpenSSL выполните из корня репозитория. Команды создают свой временный контейнер, динамически выбирают свободный порт loopback и используют свежие тестовые реквизиты. Не используйте существующий сервер или файл `.env.local` в качестве источника настроек для этой проверки.

```bash
set -euo pipefail
cluster="planimetrika-seed-$(openssl rand -hex 8)"
target="seed_reset_test_$(openssl rand -hex 16)"
control="seed_reset_test_$(openssl rand -hex 16)"
password="$(openssl rand -hex 16)"
export SEED_RESET_TOKEN="$(openssl rand -hex 16)"

docker run -d --rm --name "$cluster" -p 127.0.0.1::5432 \
  -e POSTGRES_USER=seedtester -e POSTGRES_PASSWORD="$password" postgres:16
trap 'docker stop "$cluster" >/dev/null' EXIT
for attempt in {1..30}; do
  if docker exec "$cluster" pg_isready -h 127.0.0.1 -U seedtester -d postgres >/dev/null; then break; fi
  sleep 1
done

port="$(docker port "$cluster" 5432/tcp)"
port="${port##*:}"
export SEED_RESET_DATABASE_URL="postgresql://seedtester:$password@127.0.0.1:$port/$target"
export SEED_RESET_TEST_CONTROL_URL="postgresql://seedtester:$password@127.0.0.1:$port/$control"

docker exec "$cluster" createdb -U seedtester "$target"
docker exec "$cluster" createdb -U seedtester "$control"
docker exec "$cluster" psql -X -v ON_ERROR_STOP=1 -U seedtester -d postgres \
  -c "COMMENT ON DATABASE $target IS 'planimetrika:seed-reset:$SEED_RESET_TOKEN'" \
  -c "COMMENT ON DATABASE $control IS 'planimetrika:seed-test-control:$SEED_RESET_TOKEN'"

npm ci
DATABASE_URL="$SEED_RESET_DATABASE_URL" npx --no-install drizzle-kit migrate
DATABASE_URL="$SEED_RESET_TEST_CONTROL_URL" npx --no-install drizzle-kit migrate
npm run test:seed-reset
ALLOW_SEED_RESET=1 npm run seed:reset
```

Интеграционный набор ожидает две свежие БД после миграций. Вторая БД позволяет проверить отказ при наличии похожего имени и явного разрешения, но без подходящей метки. Для повторного прогона набора создайте свежие базы. Workflow **Seed reset checks** создаёт свои фикстуры, запускает проверки PR и обходится без секретов и шагов деплоя.

## Репетиция восстановления

В том же сеансе создайте третью БД внутри только что поднятого временного экземпляра. Дамп создаётся из синтетической БД предыдущего шага и записывается во временный каталог. Проверка сравнивает контрольные количества и связи после восстановления. Выход из сеанса останавливает и удаляет только созданный контейнер.

```bash
backup_dir="$(mktemp -d)"
trap 'rm -f -- "$backup_dir/seed.dump"; rmdir -- "$backup_dir"; docker stop "$cluster" >/dev/null' EXIT
docker exec "$cluster" pg_dump -U seedtester -d "$target" -Fc --no-owner --no-privileges > "$backup_dir/seed.dump"

restored="seed_restore_test_$(openssl rand -hex 16)"
docker exec "$cluster" createdb -U seedtester "$restored"
docker exec -i "$cluster" pg_restore -U seedtester -d "$restored" \
  --exit-on-error --single-transaction --no-owner --no-privileges < "$backup_dir/seed.dump"

check_sql='SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM homeworks),
  (SELECT count(*) FROM attempts a JOIN users u ON u.id = a.student_id JOIN problems p ON p.id = a.problem_id),
  (SELECT count(*) FROM srs_states s JOIN users u ON u.id = s.student_id JOIN problems p ON p.id = s.problem_id)'
before="$(docker exec "$cluster" psql -XAt -v ON_ERROR_STOP=1 -U seedtester -d "$target" -c "$check_sql")"
after="$(docker exec "$cluster" psql -XAt -v ON_ERROR_STOP=1 -U seedtester -d "$restored" -c "$check_sql")"
test "$before" = "$after"
printf 'Восстановлены контрольные записи: %s\n' "$after"
```

Для этой репетиции не запускайте `scripts/backup-db.sh` и `scripts/restore-check.sh`. Они используют конфигурацию серверных резервных копий. Тестовое восстановление не требует доступов к рабочей базе, Telegram или S3.
