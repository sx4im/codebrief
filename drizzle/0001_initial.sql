CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  plan text NOT NULL DEFAULT 'free',
  created_at timestamp DEFAULT now(),
  github_token text
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  repo_url text NOT NULL,
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  provider text DEFAULT 'github',
  is_private boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  config jsonb,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  error_message text,
  tokens_used integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamp,
  completed_at timestamp,
  output jsonb,
  error_message text
);

CREATE TABLE IF NOT EXISTS briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE UNIQUE,
  system_narrative jsonb,
  decisions jsonb,
  landmines jsonb,
  assessment jsonb,
  top_findings jsonb,
  architecture_diagram jsonb,
  repo_stats jsonb,
  model_versions jsonb,
  flagged_claims jsonb,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id) ON DELETE CASCADE,
  type text NOT NULL,
  storage_key text NOT NULL,
  size_bytes integer,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_repo_unique ON projects(user_id, repo_owner, repo_name);
CREATE INDEX IF NOT EXISTS analyses_project_id_idx ON analyses(project_id);
CREATE INDEX IF NOT EXISTS analyses_created_at_idx ON analyses(created_at);
CREATE INDEX IF NOT EXISTS pipeline_stages_analysis_id_idx ON pipeline_stages(analysis_id);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_analysis_stage_unique ON pipeline_stages(analysis_id, stage_name);
CREATE INDEX IF NOT EXISTS briefs_analysis_id_idx ON briefs(analysis_id);
CREATE INDEX IF NOT EXISTS qa_conversations_analysis_id_idx ON qa_conversations(analysis_id);
CREATE INDEX IF NOT EXISTS artifacts_analysis_id_idx ON artifacts(analysis_id);
CREATE INDEX IF NOT EXISTS artifacts_type_idx ON artifacts(type);
