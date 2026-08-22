# Personal Knowledge Agent (PKA) — v1.4.0 (Graph-Augmented Multimodal RAG)

**Personal Knowledge Agent (PKA)** — это локально-ориентированная мультимодальная система управления личным опытом и базой знаний с графовым RAG. Архитектура отделяет веса нейросетей от структуры памяти: система векторизует документы, код, изображения и заметки (Obsidian), извлекает атомарные факты (*Claims*), отслеживает эволюцию решений (*Superseded Decisions*) и обеспечивает контекстный диалог через локальные (Qwen 2.5) или облачные (Gemini) модели.

---

## 🚀 Что нового (Changelog)

### v1.4.0 — Vision, Multimodality & Two-Tier Grounding
* **Multimodal Ingestion & Chat Stream**: Поддержка обработки изображений (схемы, диаграммы, скриншоты кода, документы) через связку `qwen2.5-vl` (локально) с автоматическим отказоустойчивым переключением на `Gemini Vision` (Cloud Fallback).
* **Visual Priority & Session Isolation**: Устранена проблема контекстной инерции (*Context Bleed*). При отправке нового изображения RAG-ретривер текстовых документов временно отключается, а визуальный ввод становится первичным субъектом рассуждения.
* **Consent-Aware Visual Analysis**: Оптимизирован системный промпт Vision-пайплайна для детального анализа лиц, людей и визуальных сцен с явной фиксацией согласия пользователя, предотвращающий ложные отказы фильтров безопасности.
* **Two-Tier Grounding (Гибридный фоллбэк)**: Устранены тупиковые отказы `INSUFFICIENT_DATA`. Если в личной базе нет точного подтверждения, агент выдает дисклеймер об отсутствии локальных заметок и формулирует ответ на основе общих инженерных знаний.

### v1.3.0 — Background Automation & 4D Universe Sync
* **Obsidian Vault Watcher (`vault_watcher.py`)**: Фоновый демон инкрементальной синхронизации заметок без блокировки основного API. Включает debounce-буферизацию, сверку по SHA-256 и фильтрацию системных файлов.
* **4D Universe Engine & Knowledge Flow**: Интерактивная пространственно-временная карта знаний (`Galaxy` $\leftrightarrow$ `Timeline`), BFS-трассировка цепочек рассуждений (*Trace Path*) и анимированные импульсы связей.

### v1.2.0 — Telemetry & Error Registry
* **Operational Error Layer**: Реестр `system_errors` для регистрации, санитизации и дедупликации сбоев по фингерпринтам с механизмом гранулярного авторазрешения (*Granular Resolution*).

### v1.1.0 — Proactive Engine & Graph-Augmented RAG
* **L1–L4 Memory Ontology**: Иерархия слоев памяти: Чанки (`L1`) $\rightarrow$ Атомарные факты/Клеймы (`L2`) $\rightarrow$ Паттерны/Инсайты (`L3`) $\rightarrow$ Временные конфликты (`L4`).
* **Dual-Pipeline Retrieval**: Классификация интентов (`FACTUAL` со строгим Evidence Gate vs `ANALYTICAL` с графовым обогащением).
* **Query Condensation**: Переписывание контекстных follow-up реплик с учетом истории сообщений.

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
│   │   ├── api/              # Эндпоинты REST API (/chat, /sources, /subjects)
│   │   ├── core/             # Конфигурация, клиенты Ollama/Gemini, планировщик
│   │   ├── db/               # Модели SQLAlchemy, сессии, миграции
│   │   ├── knowledge/        # Ingestion, RAG, графовый ретривер, Intent Classifier
│   │   ├── parsers/          # Модули парсинга (PDF, MD, TXT, Image Vision Parser)
│   │   └── schemas/          # Pydantic-схемы запросов и ответов
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Клиентская часть (React, TypeScript, Vite)
│   ├── src/
│   │   ├── api/              # Клиенты API (SSE chat, sources, subjects)
│   │   ├── components/       # UI (UniverseCanvas, ChatWorkspace, SourceManager)
│   │   ├── styles/           # Tailwind CSS и космическая тема оформления
│   │   └── types/            # Интерфейсы контрактов данных
│   └── package.json
│
├── docker-compose.yml        # PostgreSQL с расширением pgvector + Backend
└── .env                      # Конфигурационные переменные и API-ключи
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
# Запуск контейнеров PostgreSQL (pgvector)
docker-compose up -d

# Запуск бэкенда локально (при необходимости)
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
