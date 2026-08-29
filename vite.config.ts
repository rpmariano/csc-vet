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
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'cascais-emblem.png', 'logo-clube-horizontal.svg'],
      manifest: {
        name: 'GDS Cascais - Veteranos',
        short_name: 'CSC Veteranos',
        description: 'Aplicação Oficial de Gestão de Futebol de Veteranos do GDS Cascais',
        theme_color: '#1b4332',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/csc-vet/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
