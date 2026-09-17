CREATE TABLE IF NOT EXISTS training_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    log_date DATE DEFAULT CURRENT_DATE,
    rpe_overall INTEGER DEFAULT 7,
    energy_level INTEGER DEFAULT 7,
    notes TEXT,
    lessons_learned TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_researches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    source_url TEXT,
    key_takeaways TEXT NOT NULL,
    tags TEXT[] DEFAULT ARRAY['биомеханика']::TEXT[],
    applied_to_protocol BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
