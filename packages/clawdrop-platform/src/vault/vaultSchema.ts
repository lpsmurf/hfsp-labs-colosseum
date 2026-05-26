export const CREDENTIAL_VAULT_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS credential_vault (
    id             TEXT PRIMARY KEY,
    user_pubkey    TEXT NOT NULL,
    agent_id       TEXT NOT NULL UNIQUE,
    encrypted_blob BLOB NOT NULL,
    nonce          BLOB NOT NULL,
    salt           BLOB NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_credential_vault_user_agent
    ON credential_vault(user_pubkey, agent_id);
`;

export const AUDIT_LOG_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id          TEXT PRIMARY KEY,
    user_pubkey TEXT NOT NULL,
    agent_id    TEXT NOT NULL,
    action      TEXT NOT NULL,
    ip_address  TEXT,
    timestamp   INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_user_agent_timestamp
    ON audit_log(user_pubkey, agent_id, timestamp);
`;

export const VAULT_SCHEMA_SQL = `
  ${CREDENTIAL_VAULT_SCHEMA_SQL}
  ${AUDIT_LOG_SCHEMA_SQL}
`;
