CREATE TABLE IF NOT EXISTS pod_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pod_id UUID NOT NULL REFERENCES study_pods(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text VARCHAR(2000) NOT NULL
        CHECK (char_length(btrim(message_text)) BETWEEN 1 AND 2000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pod_chat_messages_pod_created
    ON pod_chat_messages(pod_id, created_at, id);
