#!/bin/bash
set -e

# Default variables
DB_NAME=${1:-pka}
DB_USER=${2:-postgres}
DB_HOST=${3:-localhost}
DB_PORT=${4:-5432}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="pka_db_backup_${TIMESTAMP}.dump"
SHA256_FILE="${DUMP_FILE}.sha256"

echo "Starting export of database '$DB_NAME' from $DB_HOST:$DB_PORT..."

# Run pg_dump in custom format
pg_dump -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -F c -b -v -f "$DUMP_FILE" "$DB_NAME"

# Calculate SHA256 checksum
if command -v sha256sum > /dev/null; then
    sha256sum "$DUMP_FILE" > "$SHA256_FILE"
    echo "Checksum saved to $SHA256_FILE"
else
    shasum -a 256 "$DUMP_FILE" > "$SHA256_FILE"
    echo "Checksum saved to $SHA256_FILE"
fi

echo "Export successful! Backup saved to: $DUMP_FILE"
echo "To restore on VPS, upload both the .dump and .sha256 files."
