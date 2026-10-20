import { useEffect, useState, useRef, useCallback } from 'react';
import { Hash, Send, Sticker as StickerIcon, Trash2, Shield, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase, type Message, type Profile, type Sticker } from '@/lib/supabase';
import {
  sendChannelMessage,
  decryptChannelMessages,
} from '@/lib/chat';
import StickerPicker from './StickerPicker';

interface Props {
  channelId: string;
  channelName: string;
  channelTopic?: string;
  serverId?: string | null;
}

interface MessageWithSticker extends Message {
  decryptedText?: string;
  sticker?: Sticker;
}

export default function ChatView({ channelId, channelName, channelTopic, serverId }: Props) {
  const { user, privateKey, profile } = useAuth();
  const [messages, setMessages] = useState<MessageWithSticker[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Map<string, Profile>>(new Map());

  const loadMessages = useCallback(async () => {
    if (!privateKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rawMsgs, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (msgError) throw msgError;
      if (!rawMsgs || rawMsgs.length === 0) {
        setMessages([]);
        return;
      }

      // Descifrar
      const decrypted = await decryptChannelMessages(
        channelId,
        rawMsgs as Message[],
        privateKey,
      );

      // Cargar perfiles de autores
      const authorIds = [...new Set((rawMsgs as Message[]).map((m) => m.author_id))];
      const missing = authorIds.filter((id) => !profileCache.current.has(id));
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', missing);
        if (profiles) {
          for (const p of profiles as Profile[]) {
            profileCache.current.set(p.id, p);
          }
        }
      }

      // Cargar stickers
      const { data: msgStickers } = await supabase
        .from('message_stickers')
        .select('message_id, sticker_id')
        .in('message_id', (rawMsgs as Message[]).map((m) => m.id));

      const stickerIds = msgStickers ? [...new Set((msgStickers as { sticker_id: string }[]).map((s) => s.sticker_id))] : [];
      const stickerMap = new Map<string, Sticker>();
      if (stickerIds.length > 0) {
        const { data: stickers } = await supabase
          .from('stickers')
          .select('*')
          .in('id', stickerIds);
        if (stickers) {
          for (const s of stickers as Sticker[]) {
            stickerMap.set(s.id, s);
          }
        }
      }

      const msgStickerMap = new Map<string, Sticker>();
      if (msgStickers) {
        for (const ms of msgStickers as { message_id: string; sticker_id: string }[]) {
          const st = stickerMap.get(ms.sticker_id);
          if (st) msgStickerMap.set(ms.message_id, st);
        }
      }

      const enriched: MessageWithSticker[] = (rawMsgs as Message[]).map((m) => ({
        ...m,
        decryptedText: decrypted.get(m.id) ?? '[no descifrable]',
        author: profileCache.current.get(m.author_id),
        sticker: msgStickerMap.get(m.id),
      }));

      setMessages(enriched);
    } catch (e) {
      setError('No se pudieron cargar los mensajes. Es posible que no tengas acceso a este canal.');
    } finally {
      setLoading(false);
    }
  }, [channelId, privateKey]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Suscripción en tiempo real
  useEffect(() => {
    if (!privateKey) return;
    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => loadMessages(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => loadMessages(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, privateKey, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !privateKey) return;
    setSending(true);
    try {
      await sendChannelMessage(channelId, input.trim(), privateKey);
      setInput('');
    } catch {
      setError('No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  };

  const handleStickerSend = async (sticker: Sticker) => {
    if (!privateKey || !user) return;
    setSending(true);
    try {
      // Enviar mensaje vacío con el sticker
      const { data: msg } = await supabase
        .from('messages')
        .insert({
          channel_id: channelId,
          author_id: user.id,
          encrypted_content: '[sticker]',
          iv: crypto.randomUUID(),
        })
        .select()
        .single();
      if (msg) {
        await supabase.from('message_stickers').insert({
          message_id: (msg as Message).id,
          sticker_id: sticker.id,
        });
      }
    } catch {
      setError('No se pudo enviar el sticker.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (msgId: string) => {
    try {
      await supabase.from('messages').delete().eq('id', msgId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0e0e14]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 shadow-sm flex-shrink-0">
        <Hash className="w-5 h-5 text-gray-500" />
        <div>
          <h2 className="font-semibold text-sm">{channelName}</h2>
          {channelTopic && <p className="text-[11px] text-gray-500">{channelTopic}</p>}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded-md">
          <Lock className="w-3 h-3" /> Cifrado E2E
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="text-center text-gray-500 py-8 text-sm">Descifrando mensajes...</div>
        ) : error ? (
          <div className="text-center text-red-400 py-8 text-sm">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Shield className="w-10 h-10 mx-auto mb-3 text-emerald-500/30" />
            <p className="text-sm">Este canal está vacío y cifrado de extremo a extremo.</p>
            <p className="text-xs text-gray-600 mt-1">Envía el primer mensaje.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.author_id === user?.id;
            const author = msg.author;
            const avatarUrl = author?.avatar_url;
            return (
              <div key={msg.id} className="group flex gap-3 hover:bg-white/[0.02] -mx-2 px-2 py-1.5 rounded transition-colors animate-fade-in">
                <div className="w-9 h-9 rounded-full bg-[#1a1a22] flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-500 font-medium">
                      {(author?.display_name ?? '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{
                      color: isMine ? '#34d399' : stringToColor(author?.display_name ?? msg.author_id),
                    }}>
                      {author?.display_name ?? 'Usuario desconocido'}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {formatTime(msg.created_at)}
                    </span>
                    {isMine && (
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="ml-auto opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {msg.sticker ? (
                    <img src={msg.sticker.image_data} alt={msg.sticker.name} className="mt-1 max-w-32 max-h-32 rounded-lg" />
                  ) : (
                    <p className="text-sm text-gray-200 break-words whitespace-pre-wrap mt-0.5">
                      {msg.decryptedText}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5 flex-shrink-0">
        {error && (
          <div className="text-xs text-red-400 mb-2">{error}</div>
        )}
        <div className="flex items-center gap-2 bg-[#1a1a22] border border-white/10 rounded-xl px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
          <button
            onClick={() => setShowStickers(true)}
            className="text-gray-500 hover:text-emerald-400 transition-colors flex-shrink-0"
            title="Stickers"
          >
            <StickerIcon className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Enviar mensaje a #${channelName}`}
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-600"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="text-emerald-400 hover:text-emerald-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {profile && (
          <p className="text-[10px] text-gray-600 mt-1.5 px-1">
            Tus mensajes se cifran con AES-256 antes de salir de tu dispositivo.
          </p>
        )}
      </div>

      <StickerPicker
        open={showStickers}
        onClose={() => setShowStickers(false)}
        onSelect={handleStickerSend}
        serverId={serverId}
      />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#4ade80'];
  return colors[Math.abs(hash) % colors.length];
}
