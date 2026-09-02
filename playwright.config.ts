import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de fumo dos diálogos. Correm contra um Vite próprio, apontado a um
 * Supabase inventado (`teste.supabase.co`) que nunca existe: todos os pedidos
 * são intercetados no browser (ver tests/e2e/supabase-mock.ts). Assim os testes
 * não tocam na base de dados real nem precisam de credenciais.
 *
 * PLAYWRIGHT_CHROMIUM_PATH permite apontar a um Chromium já instalado na
 * máquina (útil em contentores); sem ela, usa-se o que o Playwright descarrega.
 */

const PORTA = 5174
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Uma repetição também localmente: os workers partilham um só servidor Vite,
  // que compila cada rota à primeira passagem, e sob contenção um carregamento
  // lento faz falhar uma asserção que noutra corrida passa. Falhar duas vezes
  // continua a ser falha a sério.
  retries: 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}/csc-vet/`,
    trace: 'on-first-retry',
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'telemovel', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `npx vite --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}/csc-vet/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Credenciais falsas: garantem que nada sai para o projeto real.
      VITE_SUPABASE_URL: 'https://teste.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'chave-de-teste',
    },
  },
})
