CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  is_active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT,
  provider TEXT DEFAULT 'magic',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slugs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_slugs (
  user_id TEXT NOT NULL,
  slug_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slug_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (slug_id) REFERENCES slugs(id)
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  primary_color TEXT,
  secondary_color TEXT,
  email_from_name TEXT,
  email_from_address TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
