import { supabase } from '@/lib/supabaseClient';

export const TICKETS_ATTACHMENTS_BUCKET = 'ticket-attachments';

function getFileExtension(file: File): string {
  const nameExtension = file.name.split('.').pop()?.trim().toLowerCase();
  if (nameExtension) return nameExtension;

  const mimeExtension = file.type.split('/').pop()?.trim().toLowerCase();
  return mimeExtension || 'png';
}

async function getPublicUrl(bucket: string, path: string): Promise<string> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    alert('No se ha podido obtener la URL pública');
    throw new Error('No se pudo obtener la URL pública de la imagen.');
  }

  return data.publicUrl;
}

async function uploadFile(file: File, bucket: string, path: string): Promise<string> {
  const extension = getFileExtension(file);
  const finalPath = `${path}.${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(bucket).upload(finalPath, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) {
    alert('Algo ha salido mal subiendo el archivo ' + error.message);
    throw new Error(error.message || 'No se pudo subir la imagen a Supabase.');
  }

  return getPublicUrl(bucket, finalPath);
}

export async function uploadSolviAttachment(file: File, ticketId: number): Promise<{ ok: boolean; url: string }> {
  const url = await uploadFile(file, TICKETS_ATTACHMENTS_BUCKET, `/${ticketId}/Creacion/${file.name}`);

  await supabase
    .from('TBL_Ticket_Attachments_Solvi')
    .insert({
      attachment_path: url,
      attachment_type: 'Creacion',
      created_at: new Date().toISOString(),
      file_name: file.name,
      id_ticket: Number(ticketId),
      storage_bucket: TICKETS_ATTACHMENTS_BUCKET,
    })
    .select()
    .single();

  return { ok: true, url };
}
