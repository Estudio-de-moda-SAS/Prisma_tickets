// src/features/requests/hooks/useAttachments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para los adjuntos de un request.
 *
 * Expone la query de listado ({@link useAttachments}) y las mutaciones de subida
 * ({@link useUploadAttachment}, que codifica el archivo a base64 en el cliente) y
 * borrado ({@link useDeleteAttachment}). Ambas mutaciones invalidan la lista del
 * request al terminar.
 *
 * @module useAttachments
 */

/** Un adjunto de un request, con datos de quien lo subió. */
export type Attachment = {
  /** ID del adjunto. */
  Attachment_ID:         number;
  /** Nombre del archivo. */
  Attachment_Name:       string;
  /** URL de descarga, o `null`. */
  Attachment_Url:        string | null;
  /** Tamaño en bytes. */
  Attachment_Size:       number;
  /** Tipo MIME del archivo. */
  Attachment_Mime_Type:  string;
  /** Fecha de creación (ISO). */
  Attachment_Created_At: string;
  /** Usuario que subió el adjunto, o `null`. */
  uploader: {
    User_ID:   number;
    User_Name: string;
  } | null;
};

/**
 * Lista los adjuntos de un request.
 *
 * @remarks
 * `staleTime: 0` (siempre se considera obsoleto, para reflejar subidas/borrados
 * al instante) y un reintento en caso de error.
 *
 * @param requestId - ID del request cuyos adjuntos se listan.
 * @returns El resultado de `useQuery` con la lista de adjuntos.
 */
export function useAttachments(requestId: string) {
  return useQuery<Attachment[]>({
    queryKey:  ['attachments', requestId],
    queryFn:   () => apiClient.call<Attachment[]>('fetchAttachments', { requestId }),
    staleTime: 0,
    retry:     1,
  });
}

/**
 * Sube un adjunto a un request.
 *
 * @remarks
 * Lee el `File` en el cliente con `FileReader` y envía el contenido como base64
 * (quitando el prefijo `data:...;base64,`) junto con nombre, tipo y tamaño. La
 * promesa se rechaza si falla la lectura del archivo o la llamada al backend. En
 * `onSuccess` invalida la lista de adjuntos del request.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ requestId, userId, file }`.
 */
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

/**
 * Elimina un adjunto de un request.
 *
 * @remarks
 * En `onSuccess` invalida la lista de adjuntos del request. El `requestId` viaja
 * en las variables solo para saber qué caché invalidar (no se envía al backend,
 * que borra por `attachmentId`).
 *
 * @returns El objeto de mutación de React Query. Variables: `{ attachmentId, requestId }`.
 */
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