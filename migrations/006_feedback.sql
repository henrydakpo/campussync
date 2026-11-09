CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    contact_email VARCHAR(254),
    message TEXT NOT NULL
        CHECK (char_length(btrim(message)) BETWEEN 1 AND 3000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
    ON feedback(created_at DESC);
