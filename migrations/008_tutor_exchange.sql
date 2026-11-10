ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tutor_bio VARCHAR(1000);

CREATE TABLE IF NOT EXISTS tutor_offerings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    expertise_summary VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tutor_offering UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_offerings_course
    ON tutor_offerings(course_id);

CREATE TABLE IF NOT EXISTS tutor_session_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    learner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    time_slot_code VARCHAR(50) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tutor_session_request_not_self CHECK (learner_id <> tutor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_tutor_session_request
    ON tutor_session_requests(learner_id, tutor_id, course_id, time_slot_code)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tutor_session_requests_tutor_status
    ON tutor_session_requests(tutor_id, status, created_at);
