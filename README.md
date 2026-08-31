# Personal Knowledge Agent (PKA) — v1.7.0 (Graph-Augmented Multimodal RAG)

**Personal Knowledge Agent (PKA)** — это локально-ориентированная мультимодальная система управления личным опытом и базой знаний с графовым RAG. Архитектура отделяет веса нейросетей от структуры памяти: система векторизует документы, код, изображения и аудио, извлекает атомарные факты (*Claims*), отслеживает эволюцию решений (*Superseded Decisions*) и обеспечивает контекстный диалог через локальные (Qwen 2.5, Ollama) или облачные (Gemini) модели.

---

## 🚀 Что нового (Changelog)

### v1.7.0 — Learning Studio v2 & Subjects Ecosystem
* **Smart Study Notes (Map-Reduce)**: Интеллектуальная генерация конспектов (Map-Reduce) по каждой отдельной теме с привязкой к конкретным векторам (BM25 + pgvector). Строгая защита от `html`-разметки через структурированный Pydantic-вывод.
* **Subjects Ecosystem (Персистентность)**: Перенос сгенерированной дорожной карты из `Learning Studio` в полноценную дисциплину (Subject) с кэшированием прогресса и конспектов (Map-Reduce кэш).
* **Robust Context Resolver**: Универсальная система фильтрации материалов по папкам (регистронезависимая, невосприимчивая к типу слэшей и `NULL`), охватывающая поиск в `file_path`.
* **UI/UX Polish**: Исправление Flexbox-изоляции скроллинга и Markdown-рендера алертов (TIP, WARNING) в режиме изучения.

### v1.6.0 — Architectural Overhaul, Audio & Virtual Folders
* **Модульная архитектура экстракции**: Внедрен `HierarchicalMapReduceExtractor` для обработки лонгридов с in-memory Reduce-стадией, `WholeDocumentExtractor` для коротких заметок и `DatasetProfileExtractor` для таблиц. Жесткий бюджет концептов для защиты от "взрыва" графа.
* **Иерархия папок (Virtual Folders)**: Полностью виртуализированная структура папок (до 4 уровней) в менеджере источников с локальной персистентностью пустых папок (`localStorage`) и мгновенным перемещением файлов.
* **Audio & STT Pipeline (Focus Mode)**: Поддержка загрузки и транскрибации аудио с использованием Whisper и разделением источников (Demucs). Рабочее пространство `TranscriptsWorkspace` для анализа лекций и встреч.
* **Graph Copilot & Domain Isolation**: Панель Graph Copilot для интерактивного исследования связей. Жесткая изоляция контекста по доменам (`UniverseDomainFilter`).
* **PWA (Progressive Web App)**: Добавлен `manifest.json`, приложение теперь можно устанавливать как PWA.

### v1.5.0 — Engineering Optimizations & Reranking
* **Cross-Encoder Reranking (FlashRank)**: Внедрен легковесный реранкер (`ms-marco-TinyBERT-L-2-v2`) для финальной фильтрации гибридного поиска (отсекает мусор от BM25/pgvector перед подачей в LLM).
* **Zero-Latency Embeddings**: Интегрирован асинхронный LRU-кэш на векторизацию запросов. Одинаковые/нормализованные запросы обрабатываются за 0 мс.
* **FastAPI Lifespan Warmup**: Асинхронный прогрев LLM и Embedding моделей на старте сервера полностью устраняет зависания при первых запросах.
* **SQL Indexing & DB Optimization**: Оптимизированы внешние ключи и цепочки `selectinload` для L3/L4 выборки (Timeline Events, Графовые связи), снижая нагрузку на базу.
* **Capability-Based Routing**: Надежный фоллбэк-маршрутизатор: автоматическое переключение на `qwen2.5` при невалидных ключах Gemini API.

### v1.4.1 — Security Hardening & Stabilization
* **API Security**: Внедрена строгая авторизация через `X-API-Key` и лимитирование запросов (Rate Limiting, SlowAPI) для защиты API от DDoS.
* **Source Pruning**: Реализован механизм полного удаления (`DELETE /api/v1/sources/{id}`) устаревших источников с каскадным удалением графа знаний.
* **UI/UX Stabilization**: Исправлены критические баги Z-index, зависания `Uvicorn` при холодном старте.

### v1.4.0 — Vision, Multimodality & Two-Tier Grounding
* **Multimodal Ingestion & Chat Stream**: Поддержка обработки изображений (схемы, диаграммы, скриншоты кода, документы) через связку `qwen2.5-vl` (локально) с автоматическим отказоустойчивым переключением на `Gemini Vision` (Cloud Fallback).
* **Visual Priority & Session Isolation**: Устранена проблема контекстной инерции (*Context Bleed*). При отправке нового изображения RAG-ретривер текстовых документов временно отключается.
* **Two-Tier Grounding (Гибридный фоллбэк)**: Устранены тупиковые отказы `INSUFFICIENT_DATA`. Если в личной базе нет точного подтверждения, агент выдает дисклеймер об отсутствии локальных заметок и формулирует ответ на основе общих инженерных знаний.

### v1.3.0 — Background Automation & 4D Universe Sync
* **Obsidian Vault Watcher (`vault_watcher.py`)**: Фоновый демон инкрементальной синхронизации заметок без блокировки основного API.
* **4D Universe Engine & Knowledge Flow**: Интерактивная пространственно-временная карта знаний (`Galaxy` $\leftrightarrow$ `Timeline`), BFS-трассировка цепочек рассуждений (*Trace Path*) и анимированные импульсы связей.

---

## 🎓 Модуль обучения (Learning Engine)

* **Интерактивная дорожная карта (Roadmap)**: Граф тем на основе связей `Source -> Claim`, метрика освоения (*Mastery Score*).
* **Exam Mode & Practice**: Генерация квизов и флеш-карточек, режим экзамена на 15 вопросов с таймером и порогом сдачи $\ge 85\%$.
* **Сократовский AI-Тьютор**: Персистентный диалог с наводящими вопросами для глубокого понимания концепций без готовых ответов.
* **Аналитика активности**: Тепловая карта занятий (GitHub-like Heatmap), отслеживание стриков и топ-5 слабых мест (*Weak Spots*).

---

## 🏗 Структура проекта

```text
personal-knowledge-agent/
├── backend/                  # Серверная часть (FastAPI, Python 3.11+)
│   ├── app/
│   │   ├── api/              # Эндпоинты REST API (/chat, /sources, /subjects, /focus, /media)
│   │   ├── core/             # Конфигурация, клиенты Ollama/Gemini, планировщик
│   │   ├── db/               # Модели SQLAlchemy, сессии, миграции
│   │   ├── knowledge/        # Ingestion, RAG, графовый ретривер, экстракция (Map-Reduce)
│   │   ├── media/            # STT, Audio processing, Whisper, Demucs
│   │   ├── parsers/          # Модули парсинга (PDF, MD, TXT, Image Vision Parser)
│   │   └── schemas/          # Pydantic-схемы запросов и ответов
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Клиентская часть (React, TypeScript, Vite, PWA)
│   ├── src/
│   │   ├── api/              # Клиенты API (SSE chat, sources, subjects, graph)
│   │   ├── components/       # UI (UniverseCanvas, ChatWorkspace, SourceManager, GraphCopilot)
│   │   ├── styles/           # Tailwind CSS и космическая тема оформления
│   │   └── types/            # Интерфейсы контрактов данных
│   └── package.json
│
├── docker-compose.yml        # PostgreSQL с расширением pgvector + Backend
├── docker-compose.vps.yml    # Конфигурация для production-деплоя на VPS (включает frontend)
├── .env                      # Конфигурационные переменные и API-ключи (локально)
└── .env.vps                  # Шаблон переменных окружения для развертывания на VPS
```

---

## 🧠 Архитектура RAG-конвейера

```
                          ┌──────────────────────────┐
                          │   Запрос пользователя    │
                          └─────────────┬────────────┘
                                        │
                         [ Прикреплено изображение? ]
                                 /            \
                           ДА  /                \  НЕТ
                             ▼                    ▼
                   ┌──────────────────┐  ┌──────────────────┐
                   │  Visual Priority │  │ Intent Classifier│
                   │  (Bypass RAG)    │  │ (FACTUAL/ANALYT) │
                   └─────────┬────────┘  └────────┬─────────┘
                             │                    │
                             │           ┌────────┴────────┐
                             │           ▼                 ▼
                             │      [Strict Gate]    [Graph Expansion]
                             │        (L1 Chunks)     (L2-L4 Context)
                             │           └────────┬────────┘
                             │                    │
                             ▼                    ▼
                   ┌────────────────────────────────────────┐
                   │  Context Builder & Two-Tier Fallback   │
                   └───────────────────┬────────────────────┘
                                       │
                                       ▼
                   ┌────────────────────────────────────────┐
                   │      Inference: Qwen / Gemini          │
                   │      Stream: Server-Sent Events        │
                   └────────────────────────────────────────┘
```

---

## 🚀 Быстрый запуск

### 1. База данных и Бэкенд

```bash
# Запуск контейнеров (PostgreSQL с pgvector + backend)
docker compose up -d

# Запуск бэкенда локально (при необходимости разработки)
cd backend
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate для Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Приложение доступно по адресу: `http://localhost:5173`.

### 3. Production Deployment (VPS)

Для развертывания на удаленном сервере (включает встроенный Nginx/Frontend, Backend и базу данных в едином контуре):

```bash
# 1. Скопируйте шаблон переменных окружения и настройте под себя
cp .env.vps .env

# 2. Соберите и запустите полный стек в фоне
docker compose -f docker-compose.vps.yml up -d --build
```

Приложение будет доступно на VPS по адресу `http://<IP_сервера>:8090`.
