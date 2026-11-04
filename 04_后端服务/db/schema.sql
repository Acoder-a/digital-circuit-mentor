CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE,
    phone varchar(11) UNIQUE,
    phone_verified_at timestamptz,
    password_hash text NOT NULL,
    display_name varchar(80) NOT NULL,
    memory_enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- 兼容已由旧版邮箱账号表初始化的数据库。
ALTER TABLE students ALTER COLUMN email DROP NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone varchar(11);
ALTER TABLE students ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS students_phone_unique_idx ON students(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS sms_verifications (
    phone varchar(11) NOT NULL,
    purpose varchar(16) NOT NULL CHECK (purpose IN ('register', 'reset')),
    code_hash char(64) NOT NULL,
    attempts smallint NOT NULL DEFAULT 0,
    sent_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY(phone, purpose)
);
CREATE TABLE IF NOT EXISTS sms_send_events (
    id bigserial PRIMARY KEY,
    phone varchar(11) NOT NULL,
    requester_ip inet,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_send_events_phone_idx ON sms_send_events(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_send_events_ip_idx ON sms_send_events(requester_ip, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_student_idx ON auth_sessions(student_id);

CREATE TABLE IF NOT EXISTS conversation_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    client_session_id varchar(120) NOT NULL,
    experiment_type varchar(80),
    title varchar(200),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(student_id, client_session_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id bigserial PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role varchar(16) NOT NULL CHECK (role IN ('user', 'assistant')),
    content text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_messages_session_idx
    ON conversation_messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversation_summaries (
    session_id uuid PRIMARY KEY REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    summary text NOT NULL,
    summarized_through_message_id bigint,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_memories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    category varchar(40) NOT NULL CHECK (category IN ('progress', 'weakness', 'common_error', 'preference', 'milestone')),
    content text NOT NULL,
    fingerprint char(64) NOT NULL,
    importance real NOT NULL DEFAULT 0.5,
    embedding vector(1024),
    active boolean NOT NULL DEFAULT true,
    last_accessed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(student_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS student_memories_student_idx
    ON student_memories(student_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS learning_progress (
    student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    experiment_type varchar(80) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'learning',
    attempts integer NOT NULL DEFAULT 0,
    mastery real NOT NULL DEFAULT 0,
    last_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(student_id, experiment_type)
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_path text NOT NULL UNIQUE,
    file_name text NOT NULL,
    file_hash char(64) NOT NULL,
    title text NOT NULL,
    classification jsonb NOT NULL DEFAULT '{}'::jsonb,
    page_count integer NOT NULL DEFAULT 0,
    duplicate_of uuid REFERENCES knowledge_documents(id) ON DELETE SET NULL,
    indexed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_documents_hash_idx ON knowledge_documents(file_hash);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    content_hash char(64) NOT NULL,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    section text,
    experiment_type varchar(80),
    knowledge_type varchar(40),
    source_kind varchar(24) NOT NULL DEFAULT 'course_material',
    embedding vector(1024),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(document_id, content_hash)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_experiment_idx ON knowledge_chunks(experiment_type);
CREATE INDEX IF NOT EXISTS knowledge_chunks_content_trgm_idx
    ON knowledge_chunks USING gin(content gin_trgm_ops);

-- pgvector 索引需要已有一定数据量才有收益；首次导入后可执行下面的语句。
-- CREATE INDEX knowledge_chunks_embedding_hnsw_idx ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
-- CREATE INDEX student_memories_embedding_hnsw_idx ON student_memories USING hnsw (embedding vector_cosine_ops);
