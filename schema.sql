CREATE TABLE pools (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name    TEXT NOT NULL,
  balance BIGINT NOT NULL CHECK (balance >= 0)
);

CREATE TABLE agents (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL,
  name    TEXT NOT NULL,
  cap     BIGINT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id    UUID NOT NULL,
  agent_id   UUID NOT NULL,
  amount     BIGINT NOT NULL,
  outcome    TEXT NOT NULL,
  reason     TEXT,
  region     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- seed: one pool with $100, two active agents capped at $80 each
INSERT INTO pools (id, name, balance) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alpha', 10000);

INSERT INTO agents (pool_id, name, cap, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'agent-01', 8000, 'active'),
  ('11111111-1111-1111-1111-111111111111', 'agent-02', 8000, 'active');
