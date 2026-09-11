import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * A app que ficou para trás de um deploy.
 *
 * Cada página é um `React.lazy`; quando o seu ficheiro já não existe no
 * servidor — houve um deploy com a app aberta — o `import()` falha. A app
 * recarrega-se uma vez em silêncio e, se a segunda tentativa também falhar,
 * mostra um ecrã seu com o botão de recarregar, em vez da página do React
 * Router em inglês. (`src/lib/atualizacaoDaApp.ts`)
 *
 * Em desenvolvimento o Vite serve a Home em `src/pages/Home.tsx` e não num
 * ficheiro com hash; o que se simula é o pedido a falhar, que é o que um 404
 * de produção faz.
 */

const MODULO_DA_HOME = '**/src/pages/Home.tsx*'

test.beforeEach(async ({ page }) => {
  await montarSupabaseFalso(page)
})

test('um pedaço em falta recarrega a página uma vez e a app abre', async ({ page }) => {
  let pedidos = 0
  await page.route(MODULO_DA_HOME, route => {
    pedidos += 1
    if (pedidos === 1) return route.abort('failed')
    return route.continue()
  })

  await page.goto('/csc-vet/')

  // Recarregada, a Home abre como se nada fosse.
  await expect(page.getByText('Sem jogos marcados')).toBeVisible()
  expect(pedidos).toBeGreaterThanOrEqual(2)
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
})

test('se recarregar não resolve, mostra o ecrã da app com o botão', async ({ page }) => {
  await page.route(MODULO_DA_HOME, route => route.abort('failed'))

  await page.goto('/csc-vet/')

  const alerta = page.getByRole('alert')
  await expect(alerta).toBeVisible()
  await expect(alerta).toContainText('A app tem uma versão nova')
  await expect(alerta.getByRole('button', { name: 'Recarregar' })).toBeVisible()
  await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)

  // O botão volta a tentar — e, com o ficheiro de volta, a app abre.
  await page.unroute(MODULO_DA_HOME)
  await alerta.getByRole('button', { name: 'Recarregar' }).click()
  await expect(page.getByText('Sem jogos marcados')).toBeVisible()
})
