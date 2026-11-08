-- Connect to your database
\c campussync_db;

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom ENUM types
CREATE TYPE user_role AS ENUM ('student_seeking_help', 'peer_tutor', 'both');
CREATE TYPE course_status AS ENUM ('learning', 'teaching');

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'student_seeking_help',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Courses Table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., "PSYC 301"
    course_title VARCHAR(255) NOT NULL,     -- e.g., "Psychological Statistics"
    department VARCHAR(100) NOT NULL        -- e.g., "Psychology"
);

-- 3. User Courses (Join Table)
CREATE TABLE user_courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status course_status NOT NULL DEFAULT 'learning',
    CONSTRAINT unique_user_course UNIQUE (user_id, course_id)
);

-- 4. Availabilities Table
CREATE TABLE availabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_slot_code VARCHAR(50) NOT NULL,    -- e.g., "MON_14_17"
    CONSTRAINT unique_user_timeslot UNIQUE (user_id, time_slot_code)
);

-- 5. Study Pods Table
CREATE TABLE study_pods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pod_name VARCHAR(255) NOT NULL,          -- e.g., "PSYC 301 Stat Crushers"
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    max_members INTEGER DEFAULT 5 CHECK (max_members > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Pod Members (Join Table)
CREATE TABLE pod_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pod_id UUID NOT NULL REFERENCES study_pods(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pod_member UNIQUE (pod_id, user_id)
);

-- Performance Indexes for Matching Queries
CREATE INDEX idx_user_courses_course ON user_courses(course_id);
CREATE INDEX idx_availabilities_slot ON availabilities(time_slot_code);
CREATE INDEX idx_study_pods_course ON study_pods(course_id);