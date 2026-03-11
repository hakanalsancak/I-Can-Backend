-- I Can: Database Schema
-- PostgreSQL on Neon

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    full_name VARCHAR(100),
    apple_id VARCHAR(255) UNIQUE,
    google_id VARCHAR(255) UNIQUE,
    age INT,
    country VARCHAR(10),
    sport VARCHAR(50) NOT NULL DEFAULT 'soccer',
    mantra TEXT,
    notification_frequency INT DEFAULT 1,
    timezone VARCHAR(50) DEFAULT 'UTC',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- DAILY ENTRIES
CREATE TABLE IF NOT EXISTS daily_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('training', 'game', 'rest_day', 'other')),
    focus_rating SMALLINT CHECK (focus_rating BETWEEN 1 AND 10),
    effort_rating SMALLINT CHECK (effort_rating BETWEEN 1 AND 10),
    confidence_rating SMALLINT CHECK (confidence_rating BETWEEN 1 AND 10),
    performance_score SMALLINT,
    did_well TEXT,
    improve_next TEXT,
    rotating_question_id SMALLINT,
    rotating_answer TEXT,
    responses JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON daily_entries(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_entries_user_created ON daily_entries(user_id, created_at DESC);

-- ROTATING QUESTIONS
CREATE TABLE IF NOT EXISTS rotating_questions (
    id SMALLINT PRIMARY KEY,
    question_text TEXT NOT NULL,
    answer_type VARCHAR(20) DEFAULT 'slider'
);

INSERT INTO rotating_questions (id, question_text, answer_type) VALUES
    (1, 'How focused were you during training today?', 'slider'),
    (2, 'Did you give maximum effort today?', 'slider'),
    (3, 'How confident did you feel today?', 'slider'),
    (4, 'How well did you handle mistakes today?', 'slider'),
    (5, 'How disciplined were you today?', 'slider'),
    (6, 'How was your energy level today?', 'slider'),
    (7, 'Did you follow your training plan today?', 'slider'),
    (8, 'What did you learn today?', 'text'),
    (9, 'How prepared did you feel today?', 'slider'),
    (10, 'How satisfied are you with today''s performance?', 'slider')
ON CONFLICT (id) DO NOTHING;

-- GOALS
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_type VARCHAR(10) NOT NULL CHECK (goal_type IN ('weekly', 'monthly', 'yearly')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    target_value INT,
    current_value INT DEFAULT 0,
    is_completed BOOLEAN DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, goal_type);

-- STREAKS
CREATE TABLE IF NOT EXISTS streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_entry_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI REPORTS
CREATE TABLE IF NOT EXISTS ai_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(10) NOT NULL CHECK (report_type IN ('weekly', 'monthly', 'yearly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report_content JSONB NOT NULL,
    entry_count INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reports_user_type ON ai_reports(user_id, report_type, period_start DESC);

-- SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    apple_transaction_id VARCHAR(255),
    product_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'trial'
        CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATION LOG
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(30) NOT NULL,
    content TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notification_log(user_id, sent_at DESC);

-- DEVICE TOKENS
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    platform VARCHAR(10) DEFAULT 'ios',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- REFRESH TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
