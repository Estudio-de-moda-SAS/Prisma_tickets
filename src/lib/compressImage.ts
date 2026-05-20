// src/lib/compressImage.ts

const MAX_DIMENSION = 1920;   // px — lado más largo
const IMAGE_QUALITY = 0.85;   // 0-1, aplicado a JPEG/WebP
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — límite del bucket

const COMPRESSIBLE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Comprime una imagen usando Canvas antes de subirla.
 * - Imágenes: redimensiona si supera MAX_DIMENSION y aplica IMAGE_QUALITY.
 * - Otros tipos (PDF, etc.): devuelve el archivo original sin tocar.
 * - Cualquier archivo que supere MAX_FILE_SIZE lanza un error descriptivo.
 *
 * @returns El File comprimido (o el original si no es imagen).
 * @throws  Error si el archivo supera el límite del bucket.
 */
export async function compressImage(file: File): Promise<File> {
  // Validar tamaño antes de cualquier procesamiento
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `El archivo "${file.name}" supera el límite de 20 MB (${formatBytes(file.size)}).`,
    );
  }

  // No comprimir archivos que no sean imágenes comprimibles
  if (!COMPRESSIBLE_TYPES.has(file.type)) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = getDimensions(img.naturalWidth, img.naturalHeight);

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Canvas no disponible — devolver original
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // PNG sin transparencia → convertir a JPEG para mayor compresión.
      // PNG con transparencia → mantener PNG.
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Fallback silencioso: usar el original
            resolve(file);
            return;
          }

          // Si la compresión no ayudó (caso raro), usar el original
          if (blob.size >= file.size) {
            resolve(file);
            return;
          }

          const compressed = new File([blob], file.name, {
            type:         outputType,
            lastModified: Date.now(),
          });

          resolve(compressed);
        },
        outputType,
        IMAGE_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // No se pudo leer la imagen — devolver original sin fallar
      resolve(file);
    };

    img.src = url;
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getDimensions(
  w: number,
  h: number,
): { width: number; height: number } {
  if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) return { width: w, height: h };

  if (w >= h) {
    return { width: MAX_DIMENSION, height: Math.round((h / w) * MAX_DIMENSION) };
  }
  return { width: Math.round((w / h) * MAX_DIMENSION), height: MAX_DIMENSION };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}