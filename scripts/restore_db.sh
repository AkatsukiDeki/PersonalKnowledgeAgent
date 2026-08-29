#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: ./restore_db.sh <path_to_dump_file>"
    exit 1
fi

DUMP_FILE=$1
DB_NAME=${2:-pka}
DB_USER=${3:-postgres}
CONTAINER_NAME=${4:-pka-db-1} # Default docker-compose DB container name

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file $DUMP_FILE not found!"
    exit 1
fi

# Verify checksum if .sha256 exists
SHA256_FILE="${DUMP_FILE}.sha256"
if [ -f "$SHA256_FILE" ]; then
    echo "Verifying checksum..."
    if command -v sha256sum > /dev/null; then
        sha256sum -c "$SHA256_FILE"
    else
        shasum -a 256 -c "$SHA256_FILE"
    fi
else
    echo "Warning: Checksum file $SHA256_FILE not found. Skipping verification."
fi

# We assume docker compose is running and db container is up
echo "Copying dump to container..."
docker cp "$DUMP_FILE" "$CONTAINER_NAME":/tmp/db.dump

echo "Restoring database '$DB_NAME'..."
# We drop schema public and recreate to ensure clean restore, or rely on pg_restore -c
docker exec -it "$CONTAINER_NAME" pg_restore -U "$DB_USER" -d "$DB_NAME" -1 -c --if-exists /tmp/db.dump

echo "Cleaning up..."
docker exec -it "$CONTAINER_NAME" rm /tmp/db.dump

echo "Restore completed successfully!"
