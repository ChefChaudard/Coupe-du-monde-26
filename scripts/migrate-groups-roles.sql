-- Migration : Ajout des rôles multi-rôles et de la gestion des groupes

-- 1. Ajout de la colonne roles dans profiles
ALTER TABLE IF EXISTS profiles
ADD COLUMN IF NOT EXISTS roles text[] DEFAULT ARRAY['player'];

UPDATE profiles
SET roles = ARRAY['player', 'admin']
WHERE is_admin = TRUE;

UPDATE profiles
SET roles = ARRAY['player']
WHERE roles IS NULL;

-- 2. Création de la table groups
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Création de la table group_members
CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 4. Création de la table group_admins
CREATE TABLE IF NOT EXISTS group_admins (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- 5. Indexation pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_admins_user_id ON group_admins(user_id);
