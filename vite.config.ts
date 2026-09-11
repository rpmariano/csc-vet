import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/csc-vet/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'cascais-emblem.png', 'logo-clube-horizontal.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
        // Os dois eventos que o Workbox não conhece — `push` e
        // `notificationclick` — vivem num ficheiro à parte em `public/`, que o
        // service worker gerado importa. Assim mantém-se o `generateSW`, que
        // trata do cache e das atualizações, sem passar tudo para
        // `injectManifest` só por causa de trinta linhas.
        importScripts: ['push-sw.js']
      },
      manifest: {
        id: '/csc-vet/',
        name: 'GDS Cascais - Veteranos',
        short_name: 'CSC Veteranos',
        description: 'Aplicação Oficial de Gestão de Futebol de Veteranos do GDS Cascais',
        theme_color: '#262d2b',
        background_color: '#262d2b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/csc-vet/',
        scope: '/csc-vet/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})
