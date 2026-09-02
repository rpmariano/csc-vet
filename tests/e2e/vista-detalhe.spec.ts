import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Ver um evento ou uma ficha de atleta é navegar, não abrir uma janela.
 *
 * No desktop o detalhe é a página: sem `role="dialog"`, com a lista fora da
 * frente e com endereço próprio. No telemóvel continua a ser a persiana de
 * sempre — também com endereço, para o botão de retroceder a fechar.
 */

const ehDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768

const treino = {
  id: 'e1',
  title: 'Treino de teste',
  type: 'practice',
  date_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  location: 'Campo de Teste',
  description: null,
  field_id: null,
  opponent_id: null,
  tournament_id: null,
  home_away: 'home',
  is_friendly: false,
  max_players: null,
  meeting_time: null,
  home_score: null,
  away_score: null,
}

const jogo = {
  id: 'j1',
  title: 'Jogo de teste',
  type: 'match',
  date_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  location: 'Campo de Teste',
  description: null,
  field_id: null,
  opponent_id: null,
  tournament_id: null,
  home_away: 'home',
  is_friendly: false,
  max_players: null,
  meeting_time: null,
  home_score: 2,
  away_score: 1,
  is_active: true,
}

async function abrePagina(page: Page, caminho: string, fixtures = {}) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(caminho)
  await page.waitForLoadState('networkidle')
}

/**
 * O painel do detalhe: uma `region` no desktop (o `<section>` da página), um
 * `dialog` no telemóvel (a persiana).
 */
function painelDetalhe(page: Page, nome: string | RegExp) {
  return ehDesktop(page)
    ? page.getByRole('region', { name: nome })
    : page.getByRole('dialog', { name: nome })
}

/** O contrato do detalhe, seja qual for a UI. */
async function verificaDetalhe(page: Page, nome: string | RegExp, textoNoDetalhe: string, paramEsperado: RegExp) {
  await expect(page).toHaveURL(paramEsperado)

  const painel = painelDetalhe(page, nome)
  await expect(painel).toBeVisible()
  await expect(painel.getByText(textoNoDetalhe).first()).toBeVisible()

  if (ehDesktop(page)) {
    // Página: nada de diálogos, e uma barra de voltar em vez de um X.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)
    await expect(painel.getByRole('button', { name: /^Voltar/ })).toBeVisible()
  } else {
    // Persiana: continua a ser um diálogo por cima da lista.
    await expect(page.locator('[role="dialog"]')).toHaveCount(1)
  }
}

test.describe('Detalhe do evento', () => {
  test('abre com endereço próprio e sem janela no desktop', async ({ page }) => {
    await abrePagina(page, 'calendar', { events: [treino] })
    await page.getByRole('button', { name: /^Lista/ }).click()

    await expect(page).toHaveURL(/calendar$/)
    await page.locator('div.cursor-pointer.bg-csc-dark').first().click()

    await verificaDetalhe(page, 'Detalhe do evento', 'Campo de Teste', /\?event=e1$/)

    // Retroceder no browser fecha o detalhe e devolve a lista.
    await page.goBack()
    await expect(page).toHaveURL(/calendar$/)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /^Lista/ })).toBeVisible()
  })

  test('o endereço abre o evento diretamente', async ({ page }) => {
    await abrePagina(page, 'calendar?event=e1', { events: [treino] })
    await verificaDetalhe(page, 'Detalhe do evento', 'Campo de Teste', /\?event=e1$/)
  })
})

test.describe('Ficha de atleta', () => {
  test('abre com endereço próprio e sem janela no desktop', async ({ page }) => {
    await abrePagina(page, 'team-management')
    await page.locator('div.cursor-pointer.bg-csc-dark').first().click()

    await verificaDetalhe(page, /^Ficha de /, 'Ficha Oficial de Atleta', /\?atleta=/)

    await page.goBack()
    await expect(page).toHaveURL(/team-management$/)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 })
  })
})

test.describe('Dossier de convocatória', () => {
  const porRealizar = { ...jogo, id: 'e2', date_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), home_score: null, away_score: null }

  test('abre com endereço próprio e sem janela no desktop', async ({ page }) => {
    await abrePagina(page, 'events', { events: [porRealizar] })
    await page.getByRole('button', { name: /Ver Detalhes & RSVP/ }).click()

    await verificaDetalhe(page, /^Convocatória: /, 'Confirmados', /\?convocatoria=e2$/)

    await page.goBack()
    await expect(page).toHaveURL(/events$/)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 })
  })
})

test.describe('Ficha de jogo', () => {
  test('abre com endereço próprio e sem janela no desktop', async ({ page }) => {
    await abrePagina(page, 'match-reports', { events: [jogo] })
    await page.locator('div.cursor-pointer').first().click()

    await verificaDetalhe(page, /^Ficha de jogo: /, 'Ficha Oficial de Jogo', /\?jogo=j1$/)

    await page.goBack()
    await expect(page).toHaveURL(/match-reports$/)
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 10_000 })
  })
})
