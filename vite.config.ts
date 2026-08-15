import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { PWA_BASE_PATH, PWA_SCOPE, PWA_START_URL } from './src/app/deploymentConfig.ts';

export default defineConfig({
  base: PWA_BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Photo Ebook',
        short_name: 'Photo Ebook',
        description: 'Create and organize photo ebooks entirely on this iPad.',
        start_url: PWA_START_URL,
        scope: PWA_SCOPE,
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1e293b',
        background_color: '#f8fafc',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
  },
});
