/**
 * Utilidades para rutas de Storage de adjuntos.
 *
 * Expone la duración de las URLs firmadas ({@link SIGNED_URL_EXPIRES_IN}) y un
 * normalizador de rutas ({@link extractStoragePath}).
 *
 * @module storagePath
 */

/** Vigencia (en segundos) de las URLs firmadas de Storage. Equivale a 1 hora. */
export const SIGNED_URL_EXPIRES_IN = 3600;

/**
 * Normaliza el valor almacenado de un adjunto a una ruta relativa de Storage.
 *
 * @remarks
 * Los adjuntos pueden guardarse como ruta relativa o como URL pública completa
 * (por datos heredados). Si el valor es una URL, extrae la parte posterior al
 * marcador `/object/public/attachments/`; si no encuentra el marcador o el valor
 * ya es una ruta relativa, lo devuelve tal cual.
 *
 * @param storedValue - Valor guardado del adjunto (ruta relativa o URL pública).
 * @returns La ruta relativa dentro del bucket de adjuntos.
 */
export function extractStoragePath(storedValue: string): string {
  if (!storedValue.startsWith('http')) return storedValue;
  const marker = '/object/public/attachments/';
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) return storedValue.slice(idx + marker.length);
  return storedValue;
}