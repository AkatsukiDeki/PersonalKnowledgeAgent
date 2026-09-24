DO $$
DECLARE
    v_user_id UUID := '8e6d329d-809d-48cb-bcae-cb95f9d6cca0';
    v_domain_id UUID := '5dae25ea-8d09-47e6-8441-e2b24ae9b1d4';
    v_goal_id UUID := gen_random_uuid();
    v_sprint_id UUID := gen_random_uuid();
BEGIN
    -- 1. Срез Readiness на сегодня (сырые метрики: сон, качество 1-5, тапинг-тест)
    INSERT INTO daily_readiness (id, user_id, date, sleep_hours, sleep_quality, tapping_count, is_baseline, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        v_user_id,
        CURRENT_DATE,
        7.5,
        4,
        65,
        FALSE,
        NOW(),
        NOW()
    );

    -- 2. Корневая цель
    INSERT INTO planner_goals (id, user_id, domain_id, title, level, status, created_at, updated_at)
    VALUES (
        v_goal_id,
        v_user_id,
        v_domain_id,
        'Закрыть учебный семестр на отлично',
        'semester',
        'active',
        NOW(),
        NOW()
    );

    -- 3. Активный 2-недельный спринт
    INSERT INTO planner_sprints (id, user_id, title, goal_id, start_date, end_date, is_active, created_at, updated_at)
    VALUES (
        v_sprint_id,
        v_user_id,
        'Спринт 1: Сетевая безопасность и дипломы',
        v_goal_id,
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '14 days',
        TRUE,
        NOW(),
        NOW()
    );

    -- 4. Задачи: одна в To Do спринта, вторая в Бэклог (sprint_id IS NULL)
    INSERT INTO planner_tasks (id, user_id, domain_id, goal_id, sprint_id, title, status, priority, estimated_minutes, due_date, created_at, updated_at)
    VALUES 
    (
        gen_random_uuid(),
        v_user_id,
        v_domain_id,
        v_goal_id,
        v_sprint_id,
        'Сквозное E2E тестирование Focus Studio',
        'todo',
        'high',
        90,
        CURRENT_DATE,
        NOW(),
        NOW()
    ),
    (
        gen_random_uuid(),
        v_user_id,
        v_domain_id,
        v_goal_id,
        NULL,
        'Подготовить доклад по сетевой безопасности',
        'todo',
        'medium',
        60,
        CURRENT_DATE + INTERVAL '3 days',
        NOW(),
        NOW()
    );

    -- 5. Базовое событие календаря на сегодня (для отрисовки сетки 14:00-15:30)
    INSERT INTO planner_calendar_events (id, user_id, title, start_time, end_time, event_type, is_all_day, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        v_user_id,
        'Лабораторный практикум (Сети / CTF)',
        CURRENT_DATE + TIME '14:00:00',
        CURRENT_DATE + TIME '15:30:00',
        'study',
        FALSE,
        NOW(),
        NOW()
    );

END $$;
