import type { ActionHandler } from '../shared/types.ts';
// @ts-ignore
import { SIGNED_URL_EXPIRES_IN, extractStoragePath } from '../lib/storage.ts';

export const attachmentHandlers: Record<string, ActionHandler> = {
  fetchAttachments: async (payload, { supabase }) => {
    const { requestId } = payload as { requestId: string };
    const { data, error } = await supabase
      .from('TBL_Attachments')
      .select(`Attachment_ID, Attachment_File_Name, Attachment_File_url,
               Attachment_File_Size, Attachment_Mime_Type, Attachment_Created_At,
               uploader:TBL_Users!Attachment_Uploaded_By ( User_ID, User_Name )`)
      .eq('Attachment_Request_ID', requestId)
      .order('Attachment_Created_At', { ascending: true });
    if (error) throw new Error(error.message);
    const results = await Promise.all(
      (data as any[]).map(async (a) => {
        const storagePath = extractStoragePath(a.Attachment_File_url as string);
        const { data: signedData, error: signErr } = await supabase.storage
          .from('attachments')
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN);
        return {
          Attachment_ID:         a.Attachment_ID,
          Attachment_Name:       a.Attachment_File_Name,
          Attachment_Url:        signErr ? null : signedData?.signedUrl ?? null,
          Attachment_Size:       a.Attachment_File_Size,
          Attachment_Mime_Type:  a.Attachment_Mime_Type,
          Attachment_Created_At: a.Attachment_Created_At,
          uploader:              a.uploader,
        };
      })
    );
    return results;
  },

  uploadAttachment: async (payload, { supabase }) => {
    const p = payload as {
      requestId: string; userId: number; fileName: string;
      mimeType: string; sizeBytes: number; base64: string;
    };
    const bucket   = 'attachments';
    const filePath = `requests/${p.requestId}/${Date.now()}_${p.fileName}`;
    const bytes    = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
    const { error: uploadErr } = await supabase.storage
      .from(bucket).upload(filePath, bytes, { contentType: p.mimeType, upsert: false });
    if (uploadErr) throw new Error(uploadErr.message);
    const { data, error: insertErr } = await supabase
      .from('TBL_Attachments')
      .insert({
        Attachment_Request_ID:  p.requestId,
        Attachment_Uploaded_By: p.userId,
        Attachment_File_Name:   p.fileName,
        Attachment_File_url:    filePath,
        Attachment_File_Size:   p.sizeBytes,
        Attachment_Mime_Type:   p.mimeType,
        Attachment_Created_At:  new Date().toISOString(),
      })
      .select(`Attachment_ID, Attachment_File_Name, Attachment_File_url,
               Attachment_File_Size, Attachment_Mime_Type, Attachment_Created_At,
               uploader:TBL_Users!Attachment_Uploaded_By ( User_ID, User_Name )`)
      .single();
    if (insertErr) throw new Error(insertErr.message);
    const { data: signedData, error: signErr } = await supabase.storage
      .from(bucket).createSignedUrl(filePath, SIGNED_URL_EXPIRES_IN);
    if (signErr) throw new Error(signErr.message);
    return {
      Attachment_ID:         (data as any).Attachment_ID,
      Attachment_Name:       (data as any).Attachment_File_Name,
      Attachment_Url:        signedData.signedUrl,
      Attachment_Size:       (data as any).Attachment_File_Size,
      Attachment_Mime_Type:  (data as any).Attachment_Mime_Type,
      Attachment_Created_At: (data as any).Attachment_Created_At,
      uploader:              (data as any).uploader,
    };
  },

  deleteAttachment: async (payload, { supabase }) => {
    const { attachmentId } = payload as { attachmentId: number };
    const { data: existing, error: fetchErr } = await supabase
      .from('TBL_Attachments').select('Attachment_File_url').eq('Attachment_ID', attachmentId).single();
    if (fetchErr) throw new Error(fetchErr.message);
    const storagePath = extractStoragePath((existing as any).Attachment_File_url as string);
    await supabase.storage.from('attachments').remove([storagePath]);
    const { error } = await supabase.from('TBL_Attachments').delete().eq('Attachment_ID', attachmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
};
