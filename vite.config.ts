import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

function getVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return Date.now().toString(36); // fallback si no hay git
  }
}

const APP_VERSION = getVersion();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'prisma-version',
      // Se ejecuta en dev Y en build → siempre sincronizado
      buildStart() {
        writeFileSync('public/version.json', JSON.stringify({ v: APP_VERSION }));
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});