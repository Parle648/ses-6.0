-- Up Migration with additional fields
CREATE TABLE IF NOT EXISTS repositories (
  id SERIAL PRIMARY KEY,
  owner VARCHAR(255) NOT NULL,
  repository VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  last_checked TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner, repository)
);

-- Create indexes
CREATE INDEX idx_repositories_owner ON repositories(owner);
CREATE INDEX idx_repositories_repository ON repositories(repository);
CREATE INDEX idx_repositories_is_active ON repositories(is_active);

-- Create trigger
CREATE TRIGGER update_repositories_updated_at
  BEFORE UPDATE ON repositories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  confirmed BOOLEAN DEFAULT false,
  confirmation_token VARCHAR(255) UNIQUE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  last_seen_tag VARCHAR(255),
  last_notification_at TIMESTAMP WITH TIME ZONE,
  notification_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, repository_id)
);

-- Create indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_repository_id ON subscriptions(repository_id);
CREATE INDEX idx_subscriptions_confirmed ON subscriptions(confirmed);
CREATE INDEX idx_subscriptions_confirmation_token ON subscriptions(confirmation_token);
CREATE INDEX idx_subscriptions_is_active ON subscriptions(is_active);

-- Create trigger
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Down Migration
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_repositories_updated_at ON repositories;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS repositories;