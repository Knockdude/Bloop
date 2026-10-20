/*
# CipherChat - Esquema completo

Tablas: profiles, servers, server_members, channels, channel_keys, messages, stickers, message_stickers, dm_channels, dm_keys, direct_messages, friendships.
Primero se crean todas las tablas, luego se habilita RLS y se añaden políticas.
*/

-- Crear todas las tablas primero
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  banner_url text,
  bio text DEFAULT '',
  public_key text NOT NULL,
  encrypted_private_key text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  banner_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS server_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_content text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_data text NOT NULL,
  server_id uuid REFERENCES servers(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES stickers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user1_id, user2_id),
  CHECK (user1_id <> user2_id)
);

CREATE TABLE IF NOT EXISTS dm_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id uuid NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (dm_channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id uuid NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_content text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

-- Habilitar RLS en todas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages (dm_channel_id, created_at DESC);

-- POLÍTICAS: profiles
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- POLÍTICAS: servers
DROP POLICY IF EXISTS "select_servers" ON servers;
CREATE POLICY "select_servers" ON servers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = servers.id AND server_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_own_servers" ON servers;
CREATE POLICY "insert_own_servers" ON servers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "update_own_servers" ON servers;
CREATE POLICY "update_own_servers" ON servers FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = servers.id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
) WITH CHECK (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = servers.id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
);
DROP POLICY IF EXISTS "delete_own_servers" ON servers;
CREATE POLICY "delete_own_servers" ON servers FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = servers.id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
);

-- POLÍTICAS: server_members
DROP POLICY IF EXISTS "select_server_members" ON server_members;
CREATE POLICY "select_server_members" ON server_members FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_server_members" ON server_members;
CREATE POLICY "insert_server_members" ON server_members FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
);
DROP POLICY IF EXISTS "update_server_members" ON server_members;
CREATE POLICY "update_server_members" ON server_members FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
) WITH CHECK (
  EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
);
DROP POLICY IF EXISTS "delete_server_members" ON server_members;
CREATE POLICY "delete_server_members" ON server_members FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM server_members sm WHERE sm.server_id = server_members.server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
);

-- POLÍTICAS: channels
DROP POLICY IF EXISTS "select_channels" ON channels;
CREATE POLICY "select_channels" ON channels FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = channels.server_id AND server_members.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_channels" ON channels;
CREATE POLICY "insert_channels" ON channels FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = channels.server_id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
);
DROP POLICY IF EXISTS "update_channels" ON channels;
CREATE POLICY "update_channels" ON channels FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = channels.server_id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
) WITH CHECK (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = channels.server_id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
);
DROP POLICY IF EXISTS "delete_channels" ON channels;
CREATE POLICY "delete_channels" ON channels FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = channels.server_id AND server_members.user_id = auth.uid() AND server_members.role = 'owner')
);

-- POLÍTICAS: channel_keys
DROP POLICY IF EXISTS "select_own_channel_keys" ON channel_keys;
CREATE POLICY "select_own_channel_keys" ON channel_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_channel_keys" ON channel_keys;
CREATE POLICY "insert_own_channel_keys" ON channel_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_channel_keys" ON channel_keys;
CREATE POLICY "update_own_channel_keys" ON channel_keys FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_channel_keys" ON channel_keys;
CREATE POLICY "delete_own_channel_keys" ON channel_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- POLÍTICAS: messages
DROP POLICY IF EXISTS "select_messages" ON messages;
CREATE POLICY "select_messages" ON messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM channel_keys WHERE channel_keys.channel_id = messages.channel_id AND channel_keys.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_messages" ON messages;
CREATE POLICY "insert_messages" ON messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM channel_keys WHERE channel_keys.channel_id = messages.channel_id AND channel_keys.user_id = auth.uid())
  AND auth.uid() = author_id
);
DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- POLÍTICAS: stickers
DROP POLICY IF EXISTS "select_stickers" ON stickers;
CREATE POLICY "select_stickers" ON stickers FOR SELECT TO authenticated USING (
  owner_id = auth.uid() OR server_id IS NULL OR
  (server_id IS NOT NULL AND EXISTS (SELECT 1 FROM server_members WHERE server_members.server_id = stickers.server_id AND server_members.user_id = auth.uid()))
);
DROP POLICY IF EXISTS "insert_own_stickers" ON stickers;
CREATE POLICY "insert_own_stickers" ON stickers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "update_own_stickers" ON stickers;
CREATE POLICY "update_own_stickers" ON stickers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "delete_own_stickers" ON stickers;
CREATE POLICY "delete_own_stickers" ON stickers FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- POLÍTICAS: message_stickers
DROP POLICY IF EXISTS "select_message_stickers" ON message_stickers;
CREATE POLICY "select_message_stickers" ON message_stickers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM channel_keys ck JOIN messages m ON m.id = message_stickers.message_id WHERE ck.channel_id = m.channel_id AND ck.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_message_stickers" ON message_stickers;
CREATE POLICY "insert_message_stickers" ON message_stickers FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_stickers.message_id AND m.author_id = auth.uid())
);
DROP POLICY IF EXISTS "delete_message_stickers" ON message_stickers;
CREATE POLICY "delete_message_stickers" ON message_stickers FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_stickers.message_id AND m.author_id = auth.uid())
);

-- POLÍTICAS: dm_channels
DROP POLICY IF EXISTS "select_dm_channels" ON dm_channels;
CREATE POLICY "select_dm_channels" ON dm_channels FOR SELECT TO authenticated USING (auth.uid() = user1_id OR auth.uid() = user2_id);
DROP POLICY IF EXISTS "insert_dm_channels" ON dm_channels;
CREATE POLICY "insert_dm_channels" ON dm_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);
DROP POLICY IF EXISTS "delete_dm_channels" ON dm_channels;
CREATE POLICY "delete_dm_channels" ON dm_channels FOR DELETE TO authenticated USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- POLÍTICAS: dm_keys
DROP POLICY IF EXISTS "select_own_dm_keys" ON dm_keys;
CREATE POLICY "select_own_dm_keys" ON dm_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_dm_keys" ON dm_keys;
CREATE POLICY "insert_own_dm_keys" ON dm_keys FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_dm_keys" ON dm_keys;
CREATE POLICY "delete_own_dm_keys" ON dm_keys FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- POLÍTICAS: direct_messages
DROP POLICY IF EXISTS "select_direct_messages" ON direct_messages;
CREATE POLICY "select_direct_messages" ON direct_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM dm_keys WHERE dm_keys.dm_channel_id = direct_messages.dm_channel_id AND dm_keys.user_id = auth.uid())
);
DROP POLICY IF EXISTS "insert_direct_messages" ON direct_messages;
CREATE POLICY "insert_direct_messages" ON direct_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM dm_keys WHERE dm_keys.dm_channel_id = direct_messages.dm_channel_id AND dm_keys.user_id = auth.uid())
  AND auth.uid() = author_id
);
DROP POLICY IF EXISTS "delete_own_direct_messages" ON direct_messages;
CREATE POLICY "delete_own_direct_messages" ON direct_messages FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- POLÍTICAS: friendships
DROP POLICY IF EXISTS "select_friendships" ON friendships;
CREATE POLICY "select_friendships" ON friendships FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
DROP POLICY IF EXISTS "insert_friendships" ON friendships;
CREATE POLICY "insert_friendships" ON friendships FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
DROP POLICY IF EXISTS "update_friendships" ON friendships;
CREATE POLICY "update_friendships" ON friendships FOR UPDATE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id) WITH CHECK (auth.uid() = requester_id OR auth.uid() = addressee_id);
DROP POLICY IF EXISTS "delete_friendships" ON friendships;
CREATE POLICY "delete_friendships" ON friendships FOR DELETE TO authenticated USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
