#!/bin/bash
set -e

DB_NAME="pka_db"
DB_USER="postgres"
DUMP_FILE="pka_backup_$(date +%Y%m%d_%H%M%S).dump"

echo "Экспорт базы данных $DB_NAME..."
pg_dump -h localhost -p 5432 -U $DB_USER -Fc -d $DB_NAME > $DUMP_FILE

echo "Бэкап сохранен в файл: $DUMP_FILE"
