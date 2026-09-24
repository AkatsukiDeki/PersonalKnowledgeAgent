#!/bin/sh
set -e

echo "Running Alembic migrations..."
alembic upgrade head

echo "Running database seed..."
python -m app.db.seed

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
