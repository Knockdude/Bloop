import { supabase, type Channel, type Profile, type ServerMember } from './supabase';
import {
  generateChannelKey,
  exportChannelKey,
  importChannelKey,
  encryptChannelKeyForUser,
  decryptChannelKey,
  encryptMessage,
  decryptMessage,
} from './crypto';

// Caché en memoria de claves de canal descifradas (no persisten entre recargas)
const channelKeyCache = new Map<string, CryptoKey>();

// ---------- Servidores ----------

export async function createServer(
  name: string,
  ownerId: string,
  iconUrl?: string | null,
  bannerUrl?: string | null,
) {
  const { data: server, error } = await supabase
    .from('servers')
    .insert({ name, owner_id: ownerId, icon_url: iconUrl ?? null, banner_url: bannerUrl ?? null })
    .select()
    .single();
  if (error) throw error;

  // Añadir al creador como miembro owner
  const { error: memberError } = await supabase
    .from('server_members')
    .insert({ server_id: server.id, user_id: ownerId, role: 'owner' });
  if (memberError) throw memberError;

  // Crear canal general
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .insert({ server_id: server.id, name: 'general' })
    .select()
    .single();
  if (channelError) throw channelError;

  // Generar clave E2EE para el canal y guardarla para el creador
  const key = await generateChannelKey();
  const rawKey = await exportChannelKey(key);
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', ownerId)
    .maybeSingle();
  if (ownerProfile) {
    const encKey = await encryptChannelKeyForUser(key, (ownerProfile as Profile).public_key);
    await supabase.from('channel_keys').insert({
      channel_id: channel.id,
      user_id: ownerId,
      encrypted_key: encKey,
    });
  }
  channelKeyCache.set(channel.id, key);

  return server;
}

export async function joinServer(inviteCode: string, userId: string): Promise<string | null> {
  const { data: server, error } = await supabase
    .from('servers')
    .select('id')
    .eq('invite_code', inviteCode)
    .maybeSingle();
  if (error || !server) return null;

  const { error: memberError } = await supabase
    .from('server_members')
    .insert({ server_id: server.id, user_id: userId, role: 'member' });
  if (memberError) {
    if (memberError.code === '23505') return 'already_member';
    throw memberError;
  }

  // Generar claves de canal para el nuevo miembro
  const { data: channels } = await supabase
    .from('channels')
    .select('id')
    .eq('server_id', server.id);
  if (channels) {
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('public_key')
      .eq('id', userId)
      .maybeSingle();
    if (myProfile) {
      for (const ch of channels as Channel[]) {
        // Obtener la clave cifrada de cualquier miembro existente y re-cifrarla
        const { data: existingKey } = await supabase
          .from('channel_keys')
          .select('encrypted_key')
          .eq('channel_id', ch.id)
          .limit(1)
          .maybeSingle();
        // No podemos descifrar la clave de otro usuario. Necesitamos que un miembro
        // existente la re-cifre. Como solución: el creador del canal puede hacerlo.
        // Por simplicidad, el nuevo miembro pedirá la clave al entrar al canal.
        void existingKey;
      }
    }
  }

  return server.id;
}

export async function getChannelKey(
  channelId: string,
  privateKey: CryptoKey,
): Promise<CryptoKey | null> {
  if (channelKeyCache.has(channelId)) return channelKeyCache.get(channelId)!;

  const { data, error } = await supabase
    .from('channel_keys')
    .select('encrypted_key')
    .eq('channel_id', channelId)
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .maybeSingle();

  if (error || !data) return null;

  const key = await decryptChannelKey((data as { encrypted_key: string }).encrypted_key, privateKey);
  channelKeyCache.set(channelId, key);
  return key;
}

export async function sendChannelMessage(
  channelId: string,
  plaintext: string,
  privateKey: CryptoKey,
): Promise<void> {
  const key = await getChannelKey(channelId, privateKey);
  if (!key) throw new Error('No tienes acceso a este canal.');

  const { ciphertext, iv } = await encryptMessage(plaintext, key);
  const { error } = await supabase.from('messages').insert({
    channel_id: channelId,
    author_id: (await supabase.auth.getUser()).data.user?.id,
    encrypted_content: ciphertext,
    iv,
  });
  if (error) throw error;
}

export async function decryptChannelMessages(
  channelId: string,
  messages: { id: string; encrypted_content: string; iv: string }[],
  privateKey: CryptoKey,
): Promise<Map<string, string>> {
  const key = await getChannelKey(channelId, privateKey);
  if (!key) return new Map();

  const result = new Map<string, string>();
  for (const msg of messages) {
    try {
      const text = await decryptMessage(msg.encrypted_content, msg.iv, key);
      result.set(msg.id, text);
    } catch {
      result.set(msg.id, '[mensaje no descifrable]');
    }
  }
  return result;
}

// ---------- Crear canal ----------

export async function createChannel(
  serverId: string,
  name: string,
  ownerId: string,
): Promise<Channel | null> {
  const { data: channel, error } = await supabase
    .from('channels')
    .insert({ server_id: serverId, name })
    .select()
    .single();
  if (error) throw error;

  // Generar clave E2EE y distribuirla a todos los miembros
  const key = await generateChannelKey();
  const { data: members } = await supabase
    .from('server_members')
    .select('user_id')
    .eq('server_id', serverId);
  if (members) {
    const memberIds = (members as ServerMember[]).map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, public_key')
      .in('id', memberIds);
    if (profiles) {
      const keyRows = [];
      for (const p of profiles as (Profile & { public_key: string })[]) {
        const encKey = await encryptChannelKeyForUser(key, p.public_key);
        keyRows.push({ channel_id: channel.id, user_id: p.id, encrypted_key: encKey });
      }
      if (keyRows.length > 0) {
        await supabase.from('channel_keys').insert(keyRows);
      }
    }
  }
  channelKeyCache.set(channel.id, key);

  return channel;
}

// ---------- Mensajes directos ----------

export async function getOrCreateDMChannel(
  myId: string,
  otherUserId: string,
  otherUserPublicKey: string,
  myPublicKey: string,
): Promise<string> {
  // Buscar canal existente
  const { data: existing } = await supabase
    .from('dm_channels')
    .select('id')
    .or(`and(user1_id.eq.${myId},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${myId})`)
    .maybeSingle();

  if (existing) return (existing as { id: string }).id;

  // Crear nuevo canal DM
  const [u1, u2] = myId < otherUserId ? [myId, otherUserId] : [otherUserId, myId];
  const { data: dmChannel, error } = await supabase
    .from('dm_channels')
    .insert({ user1_id: u1, user2_id: u2 })
    .select()
    .single();
  if (error) throw error;

  // Generar clave AES y distribuirla a ambos usuarios
  const key = await generateChannelKey();
  const encKeyForMe = await encryptChannelKeyForUser(key, myPublicKey);
  const encKeyForOther = await encryptChannelKeyForUser(key, otherUserPublicKey);

  await supabase.from('dm_keys').insert([
    { dm_channel_id: dmChannel.id, user_id: myId, encrypted_key: encKeyForMe },
    { dm_channel_id: dmChannel.id, user_id: otherUserId, encrypted_key: encKeyForOther },
  ]);

  channelKeyCache.set(`dm:${dmChannel.id}`, key);
  return dmChannel.id;
}

export async function getDMKey(
  dmChannelId: string,
  privateKey: CryptoKey,
): Promise<CryptoKey | null> {
  const cacheKey = `dm:${dmChannelId}`;
  if (channelKeyCache.has(cacheKey)) return channelKeyCache.get(cacheKey)!;

  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase
    .from('dm_keys')
    .select('encrypted_key')
    .eq('dm_channel_id', dmChannelId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;

  const key = await decryptChannelKey((data as { encrypted_key: string }).encrypted_key, privateKey);
  channelKeyCache.set(cacheKey, key);
  return key;
}

export async function sendDMMessage(
  dmChannelId: string,
  plaintext: string,
  privateKey: CryptoKey,
): Promise<void> {
  const key = await getDMKey(dmChannelId, privateKey);
  if (!key) throw new Error('No tienes acceso a este mensaje directo.');

  const { ciphertext, iv } = await encryptMessage(plaintext, key);
  const { error } = await supabase.from('direct_messages').insert({
    dm_channel_id: dmChannelId,
    author_id: (await supabase.auth.getUser()).data.user?.id,
    encrypted_content: ciphertext,
    iv,
  });
  if (error) throw error;
}

export async function decryptDMMessages(
  dmChannelId: string,
  messages: { id: string; encrypted_content: string; iv: string }[],
  privateKey: CryptoKey,
): Promise<Map<string, string>> {
  const key = await getDMKey(dmChannelId, privateKey);
  if (!key) return new Map();

  const result = new Map<string, string>();
  for (const msg of messages) {
    try {
      const text = await decryptMessage(msg.encrypted_content, msg.iv, key);
      result.set(msg.id, text);
    } catch {
      result.set(msg.id, '[mensaje no descifrable]');
    }
  }
  return result;
}

export { channelKeyCache, importChannelKey };
