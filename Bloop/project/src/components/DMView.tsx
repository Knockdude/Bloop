import { useEffect, useState, useRef } from 'react';
import { Send, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { decryptDMMessages, sendDMMessage } from '@/lib/chat';

interface Props {
  dmChannelId: string;
  otherUserName: string;
}

interface DMessage {
  id: string;
  decryptedText?: string;
  author_id: string;
  created_at: string;
}

export default function DMView({ dmChannelId, otherUserName }: Props) {
  const { privateKey, user } = useAuth();
  const [messages, setMessages] = useState<DMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    if (!privateKey) return;
    setLoading(true);
    try {
      const { data: rawMsgs } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('dm_channel_id', dmChannelId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (!rawMsgs || rawMsgs.length === 0) {
        setMessages([]);
        return;
      }

      const decrypted = await decryptDMMessages(
        dmChannelId,
        rawMsgs as { id: string; encrypted_content: string; iv: string }[],
        privateKey,
      );

      setMessages(
        (rawMsgs as { id: string; author_id: string; created_at: string }[]).map((m) => ({
          id: m.id,
          author_id: m.author_id,
          created_at: m.created_at,
          decryptedText: decrypted.get(m.id) ?? '[no descifrable]',
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [dmChannelId, privateKey]);

  useEffect(() => {
    if (!privateKey) return;
    const ch = supabase
      .channel(`dm_realtime:${dmChannelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `dm_channel_id=eq.${dmChannelId}` },
        () => loadMessages(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dmChannelId, privateKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !privateKey) return;
    setSending(true);
    try {
      await sendDMMessage(dmChannelId, input.trim(), privateKey);
      setInput('');
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0e0e14]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-emerald-600/20 flex items-center justify-center text-xs font-bold text-emerald-400">
          {otherUserName.charAt(0).toUpperCase()}
        </div>
        <h2 className="font-semibold text-sm">{otherUserName}</h2>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400/80 bg-emerald-500/10 px-2 py-1 rounded-md">
          <Shield className="w-3 h-3" /> Cifrado E2E
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="text-center text-gray-500 py-8 text-sm">Descifrando mensajes...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Shield className="w-10 h-10 mx-auto mb-3 text-emerald-500/30" />
            <p className="text-sm">Sin mensajes aún. ¡Saluda!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.author_id === user?.id;
            return (
              <div key={msg.id} className="flex gap-3 animate-fade-in">
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium ${isMine ? 'bg-emerald-600/20 text-emerald-400' : 'bg-[#1a1a22] text-gray-500'}`}>
                  {isMine ? 'Tú' : otherUserName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: isMine ? '#34d399' : '#60a5fa' }}>
                      {isMine ? 'Tú' : otherUserName}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 break-words whitespace-pre-wrap mt-0.5">{msg.decryptedText}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[#1a1a22] border border-white/10 rounded-xl px-3 py-2 focus-within:border-emerald-500/50 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
            placeholder={`Mensaje a ${otherUserName}`}
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-600"
          />
          <button onClick={handleSend} disabled={!input.trim() || sending} className="text-emerald-400 hover:text-emerald-300 disabled:opacity-30 transition-colors">
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
