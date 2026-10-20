import { useState } from 'react';
import { X, Camera, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { resizeImage } from '@/lib/stickers';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProfileSettings({ open, onClose }: Props) {
  const { profile, refreshProfile, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(profile?.avatar_url ?? null);
  const [banner, setBanner] = useState<string | null>(profile?.banner_url ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!open || !profile) return null;

  const handleAvatar = async (file: File) => {
    const dataUrl = await resizeImage(file, 256);
    setAvatar(dataUrl);
  };

  const handleBanner = async (file: File) => {
    const dataUrl = await resizeImage(file, 1200);
    setBanner(dataUrl);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          bio,
          avatar_url: avatar,
          banner_url: banner,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1a1a22] border border-white/10 rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto animate-scale-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#1a1a22] z-10">
          <h2 className="font-semibold">Mi perfil</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner */}
        <div className="relative h-28 bg-gradient-to-r from-emerald-600/30 to-teal-600/30">
          {banner && <img src={banner} alt="banner" className="w-full h-full object-cover" />}
          <label className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2 py-1 text-xs cursor-pointer flex items-center gap-1 transition-colors">
            <Camera className="w-3.5 h-3.5" /> Cambiar banner
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleBanner(e.target.files[0])} />
          </label>
        </div>

        {/* Avatar */}
        <div className="px-4 -mt-10 relative">
          <div className="w-20 h-20 rounded-full bg-[#0e0e14] border-4 border-[#1a1a22] overflow-hidden flex items-center justify-center">
            {avatar ? (
              <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-8 h-8 text-gray-600" />
            )}
          </div>
          <label className="ml-2 inline-flex items-center gap-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg px-2 py-1 text-xs cursor-pointer transition-colors">
            <Camera className="w-3.5 h-3.5" /> Avatar
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleAvatar(e.target.files[0])} />
          </label>
        </div>

        {/* Campos */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Nombre para mostrar</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              className="w-full bg-[#0e0e14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Biografía</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={190}
              rows={3}
              className="w-full bg-[#0e0e14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none resize-none"
            />
            <span className="text-[10px] text-gray-600">{bio.length}/190</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Guardando...' : saved ? 'Guardado!' : 'Guardar cambios'}
            </button>
            <button
              onClick={signOut}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
