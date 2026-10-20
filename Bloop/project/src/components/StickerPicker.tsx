import { useEffect, useState } from 'react';
import { Sticker as StickerIcon, Plus, Trash2, X, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase, type Sticker } from '@/lib/supabase';
import {
  getMyStickers,
  getServerStickers,
  getGlobalStickers,
  createSticker,
  deleteSticker,
  resizeImage,
} from '@/lib/stickers';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (sticker: Sticker) => void;
  serverId?: string | null;
}

export default function StickerPicker({ open, onClose, onSelect, serverId }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'mine' | 'server' | 'global'>('mine');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadStickers();
  }, [open, tab, serverId]);

  const loadStickers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let list: Sticker[];
      if (tab === 'mine') list = await getMyStickers(user.id);
      else if (tab === 'server' && serverId) list = await getServerStickers(serverId);
      else if (tab === 'global') list = await getGlobalStickers();
      else list = [];
      setStickers(list);
    } catch {
      setStickers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const dataUrl = await resizeImage(file, 320);
    setNewImage(dataUrl);
    if (!newName) setNewName(file.name.replace(/\.[^.]+$/, '').slice(0, 24));
  };

  const handleCreate = async () => {
    if (!user || !newName.trim() || !newImage) return;
    setCreating(true);
    try {
      const targetServer = tab === 'server' ? serverId : null;
      await createSticker(user.id, newName.trim(), newImage, targetServer);
      setNewName('');
      setNewImage(null);
      setShowCreate(false);
      await loadStickers();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSticker(id);
      await loadStickers();
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={onClose}>
      <div
        className="bg-[#1a1a22] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-scale-in shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <StickerIcon className="w-5 h-5 text-emerald-400" />
            <h2 className="font-semibold">Stickers</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 border-b border-white/5">
          <button
            onClick={() => setTab('mine')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'mine' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Mis stickers
          </button>
          {serverId && (
            <button
              onClick={() => setTab('server')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === 'server' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Del servidor
            </button>
          )}
          <button
            onClick={() => setTab('global')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'global' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Globales
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="ml-auto px-3 py-1.5 text-xs font-medium rounded-md bg-white/5 text-emerald-400 hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Crear
          </button>
        </div>

        {/* Crear sticker */}
        {showCreate && (
          <div className="p-4 border-b border-white/5 space-y-3 animate-slide-up">
            <div className="flex gap-3">
              <label className="w-24 h-24 rounded-lg border-2 border-dashed border-white/15 hover:border-emerald-500/50 flex items-center justify-center cursor-pointer transition-colors bg-[#0e0e14] overflow-hidden">
                {newImage ? (
                  <img src={newImage} alt="preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-center text-gray-500">
                    <Upload className="w-5 h-5 mx-auto mb-1" />
                    <span className="text-[10px]">Subir</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del sticker"
                  maxLength={24}
                  className="w-full bg-[#0e0e14] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 outline-none"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newImage || creating}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creando...' : 'Guardar sticker'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grid de stickers */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center text-gray-500 py-8 text-sm">Cargando...</div>
          ) : stickers.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">
              No hay stickers aquí. ¡Crea el primero!
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {stickers.map((s) => (
                <div
                  key={s.id}
                  className="group relative aspect-square rounded-lg bg-[#0e0e14] hover:bg-white/5 flex items-center justify-center cursor-pointer transition-colors border border-white/5"
                  onClick={() => { onSelect(s); onClose(); }}
                  title={s.name}
                >
                  <img src={s.image_data} alt={s.name} className="w-full h-full object-contain p-1" />
                  {s.owner_id === user?.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
