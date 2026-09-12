import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, type Fixtures } from './supabase-mock'

/**
 * "É hoje" · "É amanhã", no cartão do próximo jogo da Home.
 *
 * `quantoFalta()` (`src/components/home/CartaoProximoJogo.tsx`) dividia a
 * diferença bruta em milissegundos por um dia e arredondava para cima. Um
 * jogo hoje às 23h30, visto de manhã, está a menos de 24h de distância mas é
 * uma fração de dia — e o `Math.ceil` empurrava-a para "1 dia": o cartão
 * dizia "É amanhã" no próprio dia do jogo. A correção normaliza as duas
 * datas para a meia-noite local antes de subtrair, como já fazia
 * `textoPrazoResposta()` em `src/lib/eventos.ts`.
 */

const base = {
  location: 'Campo de Teste', description: null, field_id: null, tournament_id: null,
  home_away: 'home', is_friendly: true, max_players: null, meeting_time: null,
  home_score: null, away_score: null, is_active: true, type: 'match', title: 'Jogo',
}

/* Perto da meia-noite de hoje, para continuar dentro do mesmo dia de
   calendário mesmo que a bateria corra a poucas horas do fim do dia. */
function maisTardeHoje(): string {
  const fimDoDia = new Date()
  fimDoDia.setHours(23, 45, 0, 0)
  if (fimDoDia.getTime() <= Date.now()) return new Date(Date.now() + 10 * 60_000).toISOString()
  return fimDoDia.toISOString()
}

async function abrirHome(page: import('@playwright/test').Page, fixtures: Fixtures) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')
}

test('um jogo mais tarde hoje diz "É hoje", não "É amanhã"', async ({ page }) => {
  const jogo = { ...base, id: 'jg-hoje', date_time: maisTardeHoje() }
  await abrirHome(page, { events: [jogo] })

  await expect(page.getByText('É hoje')).toBeVisible()
  await expect(page.getByText('É amanhã')).toHaveCount(0)
})

/* O mesmo relógio, um dia de calendário adiante — e não "+24h", que perto da
   meia-noite cai no dia seguinte a esse. */
function amanha(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

test('um jogo amanhã continua a dizer "É amanhã"', async ({ page }) => {
  const jogo = { ...base, id: 'jg-amanha', date_time: amanha() }
  await abrirHome(page, { events: [jogo] })

  await expect(page.getByText('É amanhã')).toBeVisible()
})
