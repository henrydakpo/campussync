CREATE TABLE IF NOT EXISTS universities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    short_code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO universities (name, short_code)
VALUES
    ('Accra Technical University', 'ATU'),
    ('Ghana Communication Technology University', 'GCTU'),
    ('Kumasi Technical University', 'KSTU'),
    ('Kwame Nkrumah University of Science and Technology', 'KNUST'),
    ('Tamale Technical University', 'TATU'),
    ('Takoradi Technical University', 'TTU'),
    ('University for Development Studies', 'UDS'),
    ('University of Cape Coast', 'UCC'),
    ('University of Education, Winneba', 'UEW'),
    ('University of Energy and Natural Resources', 'UENR'),
    ('University of Environment and Sustainable Development', 'UESD'),
    ('University of Ghana', 'UG'),
    ('University of Health and Allied Sciences', 'UHAS'),
    ('University of Mines and Technology', 'UMAT'),
    ('University of Professional Studies, Accra', 'UPSA')
ON CONFLICT (short_code) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS university_id UUID;

UPDATE users
SET university_id = (SELECT id FROM universities WHERE short_code = 'UG')
WHERE university_id IS NULL;

ALTER TABLE users
    ALTER COLUMN university_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_university_id_fkey'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_university_id_fkey
            FOREIGN KEY (university_id) REFERENCES universities(id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_university_id ON users(university_id);
