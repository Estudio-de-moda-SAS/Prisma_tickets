// src/features/requests/hooks/useAttachments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type Attachment = {
  Attachment_ID:         number;
  Attachment_Name:       string;
  Attachment_Url:        string | null;
  Attachment_Size:       number;
  Attachment_Mime_Type:  string;
  Attachment_Created_At: string;
  uploader: {
    User_ID:   number;
    User_Name: string;
  } | null;
};

export function useAttachments(requestId: string) {
  return useQuery<Attachment[]>({
    queryKey:  ['attachments', requestId],
    queryFn:   () => apiClient.call<Attachment[]>('fetchAttachments', { requestId }),
    staleTime: 0,
    retry:     1,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      userId,
      file,
    }: {
      requestId: string;
      userId:    number;
      file:      File;
    }) => {
      return new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const result = await apiClient.call<Attachment>('uploadAttachment', {
              requestId,
              userId,
              fileName:  file.name,
              mimeType:  file.type,
              sizeBytes: file.size,
              base64,
            });
            resolve(result);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error('Error leyendo el archivo'));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['attachments', requestId] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      attachmentId,
    }: {
      attachmentId: number;
      requestId:    string;
    }) => apiClient.call('deleteAttachment', { attachmentId }),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['attachments', requestId] });
    },
  });
}