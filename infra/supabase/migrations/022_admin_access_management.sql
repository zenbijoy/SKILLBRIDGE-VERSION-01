-- Enum Types
CREATE TYPE admin_role AS ENUM ('owner', 'admin', 'co_admin', 'auditor');
CREATE TYPE admin_status AS ENUM ('pending', 'active', 'suspended', 'revoked');
CREATE TYPE admin_invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE admin_bootstrap_status AS ENUM ('pending', 'provisioned', 'consumed', 'disabled');

-- Admin Accounts
CREATE TABLE admin_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role admin_role NOT NULL DEFAULT 'co_admin',
  status admin_status NOT NULL DEFAULT 'pending',
  must_change_credentials BOOLEAN NOT NULL DEFAULT true,
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin Invitations
CREATE TABLE admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'co_admin',
  token_hash TEXT NOT NULL,
  status admin_invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index to prevent multiple active invitations for the same email
CREATE UNIQUE INDEX idx_admin_invitations_email_active ON admin_invitations(email) WHERE status = 'pending';

-- Admin Bootstrap State
CREATE TABLE admin_bootstrap_state (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  status admin_bootstrap_status NOT NULL DEFAULT 'pending',
  provisioned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provisioned_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);
-- Ensure it remains a singleton
ALTER TABLE admin_bootstrap_state ADD CONSTRAINT admin_bootstrap_state_singleton_check CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Admin Audit Logs (append-only)
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB,
  result TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_admin_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_admin_accounts_timestamp
BEFORE UPDATE ON admin_accounts
FOR EACH ROW
EXECUTE FUNCTION update_admin_accounts_updated_at();

-- RLS Configuration
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Block browser clients from modifying authorization tables directly
-- Only service_role can perform writes
CREATE POLICY admin_accounts_read_self ON admin_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY admin_accounts_service_all ON admin_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY admin_invitations_service_all ON admin_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY admin_bootstrap_state_service_all ON admin_bootstrap_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY admin_audit_logs_service_all ON admin_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- End of migration
