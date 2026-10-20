import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ---------- tipos ----------

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string;
  public_key: string;
  encrypted_private_key: string;
  salt: string;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  banner_url: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface ServerMember {
  id: string;
  server_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile?: Profile;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  topic: string;
  created_at: string;
}

export interface ChannelKeyRow {
  id: string;
  channel_id: string;
  user_id: string;
  encrypted_key: string;
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  encrypted_content: string;
  iv: string;
  created_at: string;
  author?: Profile;
}

export interface Sticker {
  id: string;
  owner_id: string;
  name: string;
  image_data: string;
  server_id: string | null;
  created_at: string;
}

export interface DMChannel {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  other_user?: Profile;
}

export interface DirectMessage {
  id: string;
  dm_channel_id: string;
  author_id: string;
  encrypted_content: string;
  iv: string;
  created_at: string;
  author?: Profile;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  other_user?: Profile;
}
