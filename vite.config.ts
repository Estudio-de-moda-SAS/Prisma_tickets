import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      // 'prompt' = el SW nuevo espera. Quien decide recargar es el
      // VersionUpdateBanner, no el plugin. Un solo mecanismo.
      registerType: 'prompt',

      // No inyectamos script de registro en el index.html: el registro
      // lo hace VersionUpdateBanner.tsx via 'virtual:pwa-register'.
      injectRegister: null,

      // Usamos public/manifest.json, no el que genera el plugin.
      manifest: false,

      workbox: {
        // Precache del shell estático. Las .ttf de Objektiv Mk3 van
        // incluidas para matar el flash de fuente en móvil.
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2,ttf}'],

        // version.json NUNCA se cachea: es la fuente de verdad del
        // chequeo de versión. Si entra al precache, el toast muere.
        globIgnores: ['version.json', '**/version.json'],

        // SPA: cualquier ruta de React Router cae en index.html.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/version\.json/],

        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

        // Inyecta nuestro handler de notificationclick en el SW generado.
        importScripts: ['/sw-notifications.js'],
      },

      // Sin SW en dev: evita cachear mientras desarrollás.
      devOptions: { enabled: false },
    }),
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