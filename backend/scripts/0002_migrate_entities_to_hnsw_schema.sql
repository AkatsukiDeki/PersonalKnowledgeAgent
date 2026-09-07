-- backend/scripts/0002_migrate_entities_to_hnsw_schema.sql

-- 1. Переименование canonical_name в name, если колонка существует
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='entities' AND column_name='canonical_name'
  ) THEN
    ALTER TABLE entities RENAME COLUMN canonical_name TO name;
  END IF;
END $$;

-- 2. Добавление недостающих колонок
ALTER TABLE entities 
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(64) DEFAULT 'concept',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS embedding vector(1024),
  ADD COLUMN IF NOT EXISTS metadata_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Заполнение normalized_name для старых записей
UPDATE entities 
SET normalized_name = LOWER(TRIM(name)) 
WHERE normalized_name IS NULL AND name IS NOT NULL;

ALTER TABLE entities ALTER COLUMN normalized_name SET NOT NULL;

-- 4. Создание HNSW индекса для векторного поиска
CREATE INDEX IF NOT EXISTS idx_entities_normalized_name ON entities(normalized_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_embedding_hnsw 
ON entities USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 5. Таблица связей
CREATE TABLE IF NOT EXISTS entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    relation_type VARCHAR(64) NOT NULL,
    weight FLOAT DEFAULT 1.0,
    source_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
    metadata_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_entity_relation UNIQUE (source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON entity_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_chunk ON entity_relations(source_chunk_id);
