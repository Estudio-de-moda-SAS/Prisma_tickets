export const SIGNED_URL_EXPIRES_IN = 3600;

export function extractStoragePath(storedValue: string): string {
  if (!storedValue.startsWith('http')) return storedValue;
  const marker = '/object/public/attachments/';
  const idx = storedValue.indexOf(marker);
  if (idx !== -1) return storedValue.slice(idx + marker.length);
  return storedValue;
}