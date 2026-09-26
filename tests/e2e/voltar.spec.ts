import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, type Fixtures } from './supabase-mock'

/**
 * O "‹" faz o mesmo que o retroceder do browser (vaga 2 da auditoria de
 * design, 2026-09-25 — ver `useVoltarDaFicha` e `VoltarAOrigem`).
 *
 * Antes havia três comportamentos para a mesma seta: as fichas tiravam o
 * parâmetro com `replace`, as do Clube com `push` (e o retroceder a seguir
 * reabria a ficha), e uma ficha aberta de fora da sua lista voltava à lista e
 * não à origem — o jogo tocado na Home dizia "‹ Agenda" e caía na Agenda.
 */

async function abre(page: Page, caminho: string, fixtures: Fixtures = {}) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(`/csc-vet/${caminho}`)
  await page.waitForLoadState('networkidle')
}

const titulo = (page: Page, nome: string | RegExp) => page.getByRole('heading', { level: 1, name: nome })
const voltar = (page: Page, para: string) => page.getByRole('button', { name: para, exact: true })
/* O "‹" de uma ficha procura-se dentro dela, e só depois de ela abrir. A
   Agenda tem um botão "Hoje" (o do mês), e um `voltar(page, 'Hoje')` feito
   antes de a ficha aparecer agarrava-se a ele — que a seguir fica escondido
   por baixo da ficha, e o clique esperava 60 s por um botão invisível. */
const voltarDaFicha = async (page: Page, ficha: string | RegExp, para: string) => {
  const regiao = page.getByRole('region', { name: ficha })
  await expect(regiao).toBeVisible()
  await regiao.getByRole('button', { name: para, exact: true }).click()
}

const amanha = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const jogo = {
  id: 'j1', title: 'Jogo', type: 'match', date_time: amanha(), location: 'Campo de Teste',
  description: null, field_id: null, opponent_id: null, tournament_id: null, home_away: 'home',
  is_friendly: true, max_players: null, meeting_time: null, home_score: null, away_score: null,
  is_active: true,
}

const campo = { id: 'f1', name: 'Estádio Municipal', address: 'Rua da Bela Vista, Cascais' }
const adversario = {
  id: 'o1', name: 'Sesimbra Veteranos', initials: 'SES', logo_url: null,
  contact_name: 'João', contact_phone: '967 000 111', home_field_id: 'f1',
}

test('o jogo aberto na Home volta à Home, e diz "‹ Hoje"', async ({ page }) => {
  await abre(page, '', { events: [jogo] })
  await page.getByRole('button', { name: /^Ver o jogo / }).click({ position: { x: 30, y: 12 } })
  await expect(page).toHaveURL(/calendar\?event=j1$/)

  await voltarDaFicha(page, 'Jogo', 'Hoje')
  await expect(page).toHaveURL(/csc-vet\/$/)
  await expect(page.getByRole('button', { name: /^Ver o jogo / })).toBeVisible()
})

test('aberta por link, a ficha cai na lista a que pertence', async ({ page }) => {
  await abre(page, 'calendar?event=j1', { events: [jogo] })
  await voltarDaFicha(page, 'Jogo', 'Agenda')
  await expect(page).toHaveURL(/calendar$/)
  await expect(titulo(page, 'Agenda')).toBeVisible()
})

test('no Clube, fechar a ficha não a deixa no histórico para o retroceder a reabrir', async ({ page }) => {
  await abre(page, 'clube', { opponents: [adversario], fields: [campo] })
  await page.getByRole('link', { name: /^Adversários/ }).click()
  await expect(titulo(page, 'Adversários')).toBeVisible()

  await page.getByRole('button', { name: /^Ver a ficha do adversário / }).first().click()
  await expect(titulo(page, /Sesimbra Veteranos/)).toBeVisible()

  await voltarDaFicha(page, /Sesimbra Veteranos/, 'Adversários')
  await expect(page).toHaveURL(/ver=adversarios$/)

  // O retroceder a seguir leva ao índice — antes reabria a ficha.
  await page.goBack()
  await expect(page).toHaveURL(/clube$/)
  await expect(titulo(page, 'Clube')).toBeVisible()
})

test('o "‹ Clube" de uma secção volta ao índice, e o retroceder não a reabre', async ({ page }) => {
  await abre(page, 'clube', { fields: [campo] })
  await page.getByRole('link', { name: /^Campos/ }).click()
  await expect(titulo(page, 'Campos')).toBeVisible()

  await voltar(page, 'Clube').click()
  await expect(titulo(page, 'Clube')).toBeVisible()
  // Voltou uma entrada atrás: não há outra à frente do índice por baixo.
  await page.goBack()
  await expect(titulo(page, 'Campos')).toHaveCount(0)
})

test('o Plantel aberto pelo Clube tem "‹ Clube"; aberto por link, não', async ({ page }) => {
  await abre(page, 'clube')
  await page.getByRole('link', { name: /^Plantel/ }).click()
  await expect(titulo(page, 'Plantel')).toBeVisible()

  await voltar(page, 'Clube').click()
  await expect(titulo(page, 'Clube')).toBeVisible()

  await page.goto('/csc-vet/team-management')
  await expect(titulo(page, 'Plantel')).toBeVisible()
  await expect(voltar(page, 'Clube')).toHaveCount(0)
})

test('o Perfil volta ao ecrã de onde se abriu, e diz qual', async ({ page }) => {
  await abre(page, 'calendar')
  await expect(titulo(page, 'Agenda')).toBeVisible()
  await page.getByRole('link', { name: 'Ver o meu perfil' }).click()
  await expect(page).toHaveURL(/settings$/)

  await voltar(page, 'Agenda').click()
  await expect(page).toHaveURL(/calendar$/)
  await expect(titulo(page, 'Agenda')).toBeVisible()
})
