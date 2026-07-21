-- Thai Delight Restaurant - Database Schema
-- Run this once against your RDS PostgreSQL instance to create the schema.

CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(6,2) NOT NULL CHECK (price >= 0),
    category        VARCHAR(50) NOT NULL DEFAULT 'main',
    image_url       TEXT,               -- S3 object URL
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    phone           VARCHAR(30) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    guests          INTEGER NOT NULL CHECK (guests > 0 AND guests <= 20),
    notes           TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','cancelled','completed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Basic audit/security log table (supports "track failed logins / alerts" requirement)
CREATE TABLE IF NOT EXISTS auth_events (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255),
    event_type      VARCHAR(30) NOT NULL, -- login_success, login_failed, register
    ip_address      VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_auth_events_email ON auth_events(email);
