# ==========================================
# Этап 1: Сборка зависимостей (Builder)
# ==========================================
FROM python:3.11-slim AS builder

WORKDIR /app

# Системные пакеты, нужные только для компиляции wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем ТОЛЬКО файлы зависимостей!
# Пока они не меняются, этот тяжелый слой всегда будет в кеше Docker
COPY requirements.txt .

# Ставим зависимости в изолированную директорию wheels / root prefix
RUN pip install --user --no-cache-dir -r requirements.txt

# ==========================================
# Этап 2: Финальный легкий образ (Runner)
# ==========================================
FROM python:3.11-slim AS runner

WORKDIR /app

# Минимальные рантайм-утилиты (curl для healthcheck) и системные либы для python-magic
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    libmagic-dev \
    file \
    && rm -rf /var/lib/apt/lists/*

# Забираем установленные пакеты из слоя builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Копируем alembic-конфигурацию
COPY alembic.ini .
COPY alembic ./alembic

# Копируем исходный код приложения в САМЫЙ ПОСЛЕДНИЙ СЛОЙ
# Любые правки логики затронут только этот шаг (занимает 1-2 секунды)
COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
