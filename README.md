# Personal Knowledge Agent (PKA) — Version 1.1.0 (Graph-Augmented RAG)

**Что нового в v1.1.0:**
- **Graph-Augmented RAG (L1-L4):** Переход от плоского векторного поиска к графовой структуре контекста. Агент теперь извлекает не только точные фрагменты текста `[L1 CHUNK]`, но и атомарные факты `[L2 CLAIM]`, глобальные паттерны `[L3 PATTERN]` и временные связи `[L4 TEMPORAL/CONFLICT]`.
- **Dual-Pipeline Retrieval:** Встроенный классификатор намерений маршрутизирует запросы. Фактологические запросы (FACTUAL) используют строгие пороги (Strict Gate), исключая галлюцинации. Аналитические запросы (ANALYTICAL) используют мягкие пороги для сборки широкого графового контекста.
- **Query Condensation:** Умная обработка контекстных вопросов. Теперь агент помнит историю диалога и автоматически переписывает короткие уточняющие реплики (например, «а подробнее?») в полноценные поисковые запросы для точного векторного поиска, сохраняя при этом технические термины и сущности через механизм Few-Shot.
- **Source Manager:** Полноценный UI-менеджер источников (L1 Memory). Теперь можно просматривать список загруженных документов и удалять их в один клик.

Personal Knowledge Agent (PKA) — это RAG (Retrieval-Augmented Generation) система для создания личной базы знаний. 
Система позволяет загружать заметки, документы и сниппеты кода, векторизовать их, сохранять в базу данных с поддержкой векторного поиска (pgvector) и вести осмысленный диалог с агентом (на базе qwen2.5-coder и Gemini), который опирается на загруженные данные и связи между ними.

---

## 🏗 Структура проекта

Проект разделен на две основные части: Backend (FastAPI) и Frontend (React + Vite).

```text
personal-knowledge-agent/
├── backend/                  # Серверная часть (FastAPI, Python)
│   ├── app/
│   │   ├── agent/            # Логика LLM-агента (Gemini API, Ollama, промпты)
│   │   ├── api/              # Маршрутизаторы REST API (/chat, /sources)
│   │   ├── core/             # Конфигурация (Pydantic Settings)
│   │   ├── db/               # Модели БД (SQLAlchemy) и сессии
│   │   ├── knowledge/        # Бизнес-логика RAG (графовая инжекция, классификация намерений, поиск)
│   │   ├── schemas/          # Pydantic-схемы для API
│   │   └── main.py           # Точка входа FastAPI
│   ├── tests/                # Интеграционные тесты
│   ├── Dockerfile            # Образ для бэкенда
│   └── requirements.txt      # Зависимости
│
├── frontend/                 # Клиентская часть (React, TypeScript, Vite)
│   ├── src/
│   │   ├── api/              # API-клиенты для связи с backend (chat.ts, sources.ts)
│   │   ├── components/       # UI компоненты (ChatWorkspace, Sidebar, SourceUploader)
│   │   ├── styles/           # Глобальные стили (Tailwind CSS)
│   │   ├── types/            # TypeScript интерфейсы
│   │   ├── App.tsx           # Главный компонент (Layout)
│   │   └── main.tsx          # Точка входа React
│   ├── package.json          # Зависимости и скрипты сборки
│   ├── tailwind.config.js    # Конфиг Tailwind CSS
│   └── vite.config.ts        # Конфиг сборщика Vite
│
├── docker-compose.yml        # Оркестрация контейнеров (PostgreSQL + pgvector, backend)
└── .env                      # Конфигурационные переменные (API-ключи, БД)
```

---

## 🧠 Архитектура и Логика

### 1. Ingestion (Загрузка знаний)
- Пользователь через UI (`SourceUploader.tsx`) отправляет текст (заметку, код).
- Frontend вызывает `POST /api/v1/sources`.
- Backend (`knowledge.ingestion`) создает запись `Source` в БД.
- Текст разбивается на смысловые фрагменты (`knowledge.chunking`).
- Для каждого фрагмента генерируется векторное представление (эмбеддинг) через **BGE-M3** (локально) или **Gemini API**.
- В фоне qwen2.5-coder извлекает из чанков атомарные факты (`Claims`), сущности и формирует графовые связи.
- Фрагменты (`Chunk`) сохраняются в PostgreSQL с использованием типа `vector(1024)` из расширения **pgvector**, а также генерируется `tsvector` для полнотекстового поиска.

### 2. Intent Classification & Retrieval (Гибридный поиск)
- При запросе пользователя Backend (`knowledge.intent_classifier`) определяет интент: `FACTUAL` или `ANALYTICAL`.
- Выполняется **Hybrid Search** (векторный HNSW + полнотекстовый GIN) с алгоритмом **RRF (Reciprocal Rank Fusion)**.
- **Context Builder** формирует контекст:
  - Для `FACTUAL` используется строгий порог, возвращаются только точные `[L1 CHUNK]`.
  - Для `ANALYTICAL` используется мягкий порог, а контекст обогащается `[L2 CLAIM]`, `[L3 PATTERN]` и `[L4 TEMPORAL/CONFLICT]` (хронологические связи, противоречия).

### 3. Generation (Генерация ответа)
- Найденный многоуровневый контекст подставляется в системный промпт (`agent.prompts`).
- Промпт отправляется в **Gemini 2.5 Flash** (или локальную LLM `qwen2.5-coder`) через `agent.gemini`.
- Агент формирует аналитический или фактологический ответ и возвращает его пользователю.
- Backend передает ответ клиенту через **Server-Sent Events (SSE)**, обеспечивая стриминг текста в реальном времени, а также передает список использованных источников (Citations).

---

## 🚀 Запуск проекта

1. **База данных и Backend**
   ```bash
   # Запуск PostgreSQL с pgvector и Backend-сервера
   docker-compose up -d
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Откройте `http://localhost:5173` в браузере для доступа к интерфейсу агента.
