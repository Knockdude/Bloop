import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Hash, Users, Settings, Shield, Copy, Check,
  UserPlus, MessageSquare, X, Crown,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase, type Server, type Channel, type ServerMember, type Profile, type DMChannel } from '@/lib/supabase';
import { createServer, createChannel, joinServer } from '@/lib/chat';
import ChatView from './ChatView';
import DMView from './DMView';
import ProfileSettings from './ProfileSettings';

type View =
  | { type: 'channel'; serverId: string; channelId: string; channelName: string; channelTopic?: string }
  | { type: 'dm'; dmChannelId: string; otherUserName: string };

export default function MainApp() {
  const { user, profile } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [currentServerId, setCurrentServerId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<(ServerMember & { profile?: Profile })[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [dmChannels, setDmChannels] = useState<(DMChannel & { other_user?: Profile })[]>([]);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showDmPanel, setShowDmPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!user) return;
    const { data: memberships } = await supabase
      .from('server_members')
      .select('server_id')
      .eq('user_id', user.id);
    if (!memberships || memberships.length === 0) {
      setServers([]);
      return;
    }
    const serverIds = (memberships as ServerMember[]).map((m) => m.server_id);
    const { data: serverList } = await supabase
      .from('servers')
      .select('*')
      .in('id', serverIds)
      .order('created_at', { ascending: true });
    setServers((serverList as Server[]) ?? []);
  }, [user]);

  const loadDMs = useCallback(async () => {
    if (!user) return;
    const { data: dms } = await supabase
      .from('dm_channels')
      .select('*')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    if (!dms) return;

    const enriched = await Promise.all(
      (dms as DMChannel[]).map(async (dm) => {
        const otherId = dm.user1_id === user.id ? dm.user2_id : dm.user1_id;
        const { data: otherProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', otherId)
          .maybeSingle();
        return { ...dm, other_user: otherProfile as Profile };
      }),
    );
    setDmChannels(enriched);
  }, [user]);

  useEffect(() => {
    loadServers();
    loadDMs();
  }, [loadServers, loadDMs]);

  useEffect(() => {
    if (!currentServerId || !user) return;
    (async () => {
      const { data: chList } = await supabase
        .from('channels')
        .select('*')
        .eq('server_id', currentServerId)
        .order('created_at', { ascending: true });
      setChannels((chList as Channel[]) ?? []);

      const { data: memList } = await supabase
        .from('server_members')
        .select('*')
        .eq('server_id', currentServerId)
        .order('joined_at', { ascending: true });
      if (memList) {
        const userIds = (memList as ServerMember[]).map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);
        const profileMap = new Map<string, Profile>();
        if (profiles) for (const p of profiles as Profile[]) profileMap.set(p.id, p);
        setMembers(
          (memList as ServerMember[]).map((m) => ({ ...m, profile: profileMap.get(m.user_id) })),
        );
      }

      if (chList && chList.length > 0) {
        const first = chList[0] as Channel;
        setView({ type: 'channel', serverId: currentServerId, channelId: first.id, channelName: first.name, channelTopic: first.topic });
      } else {
        setView(null);
      }
    })();
  }, [currentServerId, user]);

  const handleCreateServer = async (name: string) => {
    if (!user) return;
    try {
      await createServer(name, user.id);
      await loadServers();
      setShowCreateServer(false);
    } catch {
      setError('Error al crear el servidor.');
    }
  };

  const handleJoinServer = async (code: string) => {
    if (!user) return;
    try {
      const result = await joinServer(code, user.id);
      if (result === 'already_member') {
        setError('Ya eres miembro de este servidor.');
      } else if (result === null) {
        setError('Código de invitación no válido.');
      } else {
        await loadServers();
        setShowJoinServer(false);
      }
    } catch {
      setError('Error al unirse al servidor.');
    }
  };

  const handleCreateChannel = async (name: string) => {
    if (!user || !currentServerId) return;
    try {
      const ch = await createChannel(currentServerId, name, user.id);
      if (ch) {
        setChannels((prev) => [...prev, ch]);
        setShowCreateChannel(false);
        setView({ type: 'channel', serverId: currentServerId, channelId: ch.id, channelName: ch.name, channelTopic: ch.topic });
      }
    } catch {
      setError('Error al crear el canal.');
    }
  };

  const copyInviteCode = () => {
    const server = servers.find((s) => s.id === currentServerId);
    if (server) {
      navigator.clipboard.writeText(server.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user || !profile) return null;

  const avatarEl = (p: Profile, size = 'w-7 h-7') => (
    <div className={`${size} rounded-full bg-[#1a1a22] overflow-hidden flex-shrink-0`}>
      {p.avatar_url ? (
        <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-xs font-medium text-gray-500`}>
          {p.display_name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0e0e14] text-gray-100 overflow-hidden">
      {/* Barra de servidores */}
      <div className="w-[68px] bg-[#0a0a0f] flex flex-col items-center py-3 gap-2 flex-shrink-0 overflow-y-auto">
        <button
          onClick={() => { setShowDmPanel(true); setCurrentServerId(null); setView(null); }}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl group ${showDmPanel ? 'bg-emerald-600 rounded-xl' : 'bg-[#1a1a22] hover:bg-emerald-600'}`}
          title="Mensajes directos"
        >
          <MessageSquare className={`w-5 h-5 ${showDmPanel ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
        </button>
        <div className="w-8 h-0.5 bg-white/10 rounded-full" />

        {servers.map((s) => (
          <button
            key={s.id}
            onClick={() => { setCurrentServerId(s.id); setShowDmPanel(false); }}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl group relative ${currentServerId === s.id ? 'bg-emerald-600 rounded-xl' : 'bg-[#1a1a22] hover:bg-emerald-600'}`}
            title={s.name}
          >
            {s.icon_url ? (
              <img src={s.icon_url} alt={s.name} className="w-full h-full rounded-2xl group-hover:rounded-xl transition-all object-cover" />
            ) : (
              <span className="text-sm font-bold text-gray-300 group-hover:text-white">
                {s.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            {currentServerId === s.id && (
              <div className="absolute -left-3 w-1.5 h-8 bg-white rounded-r-full" />
            )}
          </button>
        ))}

        <button onClick={() => setShowCreateServer(true)} className="w-12 h-12 rounded-2xl bg-[#1a1a22] hover:bg-emerald-600 flex items-center justify-center transition-all hover:rounded-xl group" title="Crear servidor">
          <Plus className="w-5 h-5 text-emerald-400 group-hover:text-white" />
        </button>
        <button onClick={() => setShowJoinServer(true)} className="w-12 h-12 rounded-2xl bg-[#1a1a22] hover:bg-emerald-600 flex items-center justify-center transition-all hover:rounded-xl group" title="Unirse con código">
          <UserPlus className="w-5 h-5 text-emerald-400 group-hover:text-white" />
        </button>
      </div>

      {/* Barra lateral */}
      {currentServerId ? (
        <div className="w-56 bg-[#14141c] flex flex-col flex-shrink-0">
          <div className="h-12 px-4 flex items-center justify-between border-b border-black/30 shadow-sm">
            <span className="font-semibold text-sm truncate">{servers.find((s) => s.id === currentServerId)?.name ?? 'Servidor'}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Canales de texto</span>
              <button onClick={() => setShowCreateChannel(true)} className="text-gray-500 hover:text-white transition-colors" title="Crear canal">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setView({ type: 'channel', serverId: currentServerId, channelId: ch.id, channelName: ch.name, channelTopic: ch.topic })}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm transition-colors ${view?.type === 'channel' && view.channelId === ch.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
              >
                <Hash className="w-4 h-4 flex-shrink-0 text-gray-500" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-black/30 bg-[#0e0e14] space-y-1">
            <button onClick={copyInviteCode} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-xs text-gray-400">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Código copiado!' : 'Copiar invitación'}
            </button>
            <button onClick={() => setShowMembers(!showMembers)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors text-xs text-gray-400">
              <Users className="w-3.5 h-3.5" /> Miembros
            </button>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03]">
              {avatarEl(profile)}
              <span className="text-xs font-medium truncate flex-1">{profile.display_name}</span>
              <button onClick={() => setShowProfile(true)} className="text-gray-500 hover:text-white transition-colors">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-56 bg-[#14141c] flex flex-col flex-shrink-0">
          <div className="h-12 px-4 flex items-center border-b border-black/30 shadow-sm">
            <span className="font-semibold text-sm">Mensajes directos</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Conversaciones</div>
            {dmChannels.length === 0 ? (
              <p className="text-xs text-gray-600 px-2 py-4">No tienes conversaciones todavía.</p>
            ) : (
              dmChannels.map((dm) => (
                <button
                  key={dm.id}
                  onClick={() => setView({ type: 'dm', dmChannelId: dm.id, otherUserName: dm.other_user?.display_name ?? 'Usuario' })}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${view?.type === 'dm' && view.dmChannelId === dm.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                >
                  {dm.other_user ? avatarEl(dm.other_user, 'w-5 h-5') : <div className="w-5 h-5 rounded-full bg-[#1a1a22]" />}
                  <span className="truncate">{dm.other_user?.display_name ?? 'Usuario'}</span>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-black/30 bg-[#0e0e14]">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/[0.03]">
              {avatarEl(profile)}
              <span className="text-xs font-medium truncate flex-1">{profile.display_name}</span>
              <button onClick={() => setShowProfile(true)} className="text-gray-500 hover:text-white transition-colors">
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel de miembros */}
      {showMembers && currentServerId && (
        <div className="w-52 bg-[#14141c] border-l border-black/30 flex flex-col flex-shrink-0">
          <div className="h-12 px-4 flex items-center justify-between border-b border-black/30">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Miembros ({members.length})</span>
            <button onClick={() => setShowMembers(false)} className="text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {members.slice().sort((a, b) => (b.role === 'owner' ? 1 : 0) - (a.role === 'owner' ? 1 : 0)).map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors">
                <div className="relative">
                  {m.profile ? avatarEl(m.profile, 'w-7 h-7') : <div className="w-7 h-7 rounded-full bg-[#1a1a22]" />}
                  {m.role === 'owner' && <Crown className="absolute -top-0.5 -right-0.5 w-3 h-3 text-yellow-400" />}
                </div>
                <span className="text-sm truncate" style={{ color: m.role === 'owner' ? '#facc15' : undefined }}>
                  {m.profile?.display_name ?? 'Usuario'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Área principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {view ? (
          view.type === 'channel' ? (
            <ChatView channelId={view.channelId} channelName={view.channelName} channelTopic={view.channelTopic} serverId={view.serverId} />
          ) : (
            <DMView dmChannelId={view.dmChannelId} otherUserName={view.otherUserName} />
          )
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Modales */}
      {showCreateServer && <CreateServerModal onClose={() => setShowCreateServer(false)} onCreate={handleCreateServer} />}
      {showJoinServer && <JoinServerModal onClose={() => setShowJoinServer(false)} onJoin={handleJoinServer} error={error} clearError={() => setError(null)} />}
      {showCreateChannel && <CreateChannelModal onClose={() => setShowCreateChannel(false)} onCreate={handleCreateChannel} />}
      {showProfile && <ProfileSettings open={showProfile} onClose={() => setShowProfile(false)} />}

      {error && !showJoinServer && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-sm px-4 py-2 rounded-lg shadow-lg animate-slide-up z-50 flex items-center gap-3">
          {error}
          <button onClick={() => setError(null)} className="text-white/70 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0e0e14]">
      <div className="text-center max-w-sm animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-5 shadow-xl shadow-emerald-500/20">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Bienvenido a CipherChat</h2>
        <p className="text-gray-400 text-sm">
          Selecciona un servidor o crea uno nuevo para empezar a chatear. Todos tus mensajes están
          cifrados de extremo a extremo.
        </p>
      </div>
    </div>
  );
}

function CreateServerModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal onClose={onClose} title="Crear servidor">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del servidor"
        maxLength={40}
        autoFocus
        className="w-full bg-[#0e0e14] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500 outline-none"
        onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); }}
      />
      <p className="text-xs text-gray-500">Tu servidor tendrá un código de invitación único para compartir.</p>
      <button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors">
        Crear servidor
      </button>
    </Modal>
  );
}

function JoinServerModal({ onClose, onJoin, error, clearError }: { onClose: () => void; onJoin: (code: string) => void; error: string | null; clearError: () => void }) {
  const [code, setCode] = useState('');
  return (
    <Modal onClose={onClose} title="Unirse a un servidor">
      <input
        type="text"
        value={code}
        onChange={(e) => { setCode(e.target.value); clearError(); }}
        placeholder="Código de invitación"
        autoFocus
        className="w-full bg-[#0e0e14] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-emerald-500 outline-none font-mono"
        onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) onJoin(code.trim()); }}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button onClick={() => code.trim() && onJoin(code.trim())} disabled={!code.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors">
        Unirse
      </button>
    </Modal>
  );
}

function CreateChannelModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal onClose={onClose} title="Crear canal">
      <div className="relative">
        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          placeholder="nombre-del-canal"
          maxLength={30}
          autoFocus
          className="w-full bg-[#0e0e14] border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-emerald-500 outline-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onCreate(name.trim()); }}
        />
      </div>
      <button onClick={() => name.trim() && onCreate(name.trim())} disabled={!name.trim()} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg transition-colors">
        Crear canal
      </button>
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div className="bg-[#1a1a22] border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4 animate-scale-in shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
