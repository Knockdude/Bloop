import { supabase, type Sticker } from './supabase';

export async function getMyStickers(userId: string): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Sticker[];
}

export async function getServerStickers(serverId: string): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .eq('server_id', serverId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Sticker[];
}

export async function getGlobalStickers(): Promise<Sticker[]> {
  const { data, error } = await supabase
    .from('stickers')
    .select('*')
    .is('server_id', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Sticker[];
}

export async function createSticker(
  userId: string,
  name: string,
  imageData: string,
  serverId?: string | null,
): Promise<Sticker> {
  const { data, error } = await supabase
    .from('stickers')
    .insert({
      owner_id: userId,
      name,
      image_data: imageData,
      server_id: serverId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Sticker;
}

export async function deleteSticker(stickerId: string): Promise<void> {
  const { error } = await supabase.from('stickers').delete().eq('id', stickerId);
  if (error) throw error;
}

// Convierte un File a data URL (base64) — para stickers pequeños (<512KB)
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Redimensiona una imagen a un tamaño máximo manteniendo proporción
export async function resizeImage(file: File, maxSize = 320): Promise<string> {
  const dataUrl = await fileToDataURL(file);
  const img = new Image();
  img.src = dataUrl;
  await new Promise((r) => {
    img.onload = r;
    img.onerror = r;
  });

  let { width, height } = img;
  if (width > height && width > maxSize) {
    height = (height * maxSize) / width;
    width = maxSize;
  } else if (height > maxSize) {
    width = (width * maxSize) / height;
    height = maxSize;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}
