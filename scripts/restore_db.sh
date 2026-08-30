#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Использование: ./restore_db.sh <путь_к_dump_файлу>"
    exit 1
fi

DUMP_FILE=$1
CONTAINER_NAME="pka_db"
DB_USER="pka_user"
DB_NAME="pka_db"

echo "Копирование дампа в контейнер $CONTAINER_NAME..."
docker cp $DUMP_FILE $CONTAINER_NAME:/tmp/restore.dump

echo "Восстановление базы данных..."
docker exec -i $CONTAINER_NAME pg_restore -U $DB_USER -d $DB_NAME --clean --if-exists --no-owner /tmp/restore.dump

echo "Очистка временных файлов..."
docker exec -i $CONTAINER_NAME rm /tmp/restore.dump

echo "База данных успешно восстановлена."
