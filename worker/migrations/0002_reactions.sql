-- What each person thinks of a skill or bundle: a thumbs up or a thumbs down, by its id in
-- data/skills.jsonc, as for saves. One per person and entry: the other thumb replaces it.
CREATE TABLE reactions (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('skill', 'bundle')),
  entry_id TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('up', 'down')),
  -- When it was given, or last turned to the other thumb.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, kind, entry_id)
) WITHOUT ROWID;
