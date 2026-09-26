import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Um evento edita-se num sítio só: os Eventos.
 *
 * Eram duas cópias do formulário, e gravavam coisas diferentes para a mesma
 * edição: a Agenda escrevia o `location` mesmo com campo escolhido e intitulava
 * o jogo "Jogo" em vez de "Jogo vs Adversário"; os Eventos apagavam o
 * `max_players` a cada gravação. Passaram a um componente só (`EditarEvento`),
 * e depois a uma porta só: a Agenda mostra o evento, e quem gere salta dali
 * para o mesmo evento nos Eventos.
 */

const DAQUI_A_UMA_SEMANA = new Date(Date.now() + 7 * 864e5)
DAQUI_A_UMA_SEMANA.setHours(20, 0, 0, 0)

const JOGO = {
  id: 'e1', title: 'Jogo vs Sesimbra Veteranos', type: 'match',
  date_time: DAQUI_A_UMA_SEMANA.toISOString(),
  location: null, description: 'Levar o equipamento alternativo.', field_id: 'f2',
  opponent_id: 'o1', tournament_id: null, matchday: null, home_away: 'away',
  is_friendly: true, is_active: true, max_players: 18, meeting_time: '19:15:00',
  home_score: null, away_score: null,
}

const FIXTURES = {
  events: [JOGO],
  fields: [
    { id: 'f1', name: 'Estádio Municipal', address: 'Cascais' },
    { id: 'f2', name: 'Campo de Sesimbra', address: 'Sesimbra' },
  ],
  opponents: [{ id: 'o1', name: 'Sesimbra Veteranos', initials: 'SES', logo_url: null, home_field_id: 'f2' }],
  club_settings: [{ id: 1, home_field_id: 'f1', initials: 'CSC' }],
  callups: [],
}

/** Faz a mesma edição e devolve o corpo do PATCH a `events`. */
async function editarEGravar(page: Page, abrir: (p: Page) => Promise<void>) {
  const gravados: Record<string, unknown>[] = []
  page.on('request', r => {
    if (r.url().includes('/rest/v1/events') && r.method() === 'PATCH') {
      gravados.push(JSON.parse(r.postData() || '{}'))
    }
  })

  await montarSupabaseFalso(page, FIXTURES)
  await abrir(page)

  const ecra = page.getByRole('region', { name: 'Jogo vs Sesimbra Veteranos' })
  await expect(ecra).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A mesma edição nas duas portas: a hora, a concentração e a descrição.
  await ecra.getByLabel('Hora *').fill('21:30')
  await ecra.getByLabel('Concentração (opcional)').fill('20:45')
  await ecra.getByLabel('Descrição / notas').fill('Equipamento alternativo, e chegar cedo.')
  await ecra.getByRole('button', { name: 'Guardar alterações' }).click()

  await expect.poll(() => gravados.length, { timeout: 10000 }).toBeGreaterThan(0)
  // Sem convocados não há pedidos a reenviar: grava sem perguntar, e fecha.
  // (O ecrã de baixo pode ter o mesmo nome — o evento —, por isso a prova é
  // o botão de gravar, que só a edição tem.)
  await expect(page.getByRole('button', { name: 'Guardar alterações' })).toHaveCount(0)
  return gravados[0]
}

test('a Agenda não edita: leva ao mesmo evento nos Eventos, e é lá que se grava', async ({ page }) => {
  const pelaAgenda = await editarEGravar(page, async p => {
    await p.goto('/csc-vet/calendar?event=e1')
    const ficha = p.getByRole('region', { name: 'Jogo vs Sesimbra Veteranos' })
    await expect(ficha).toBeVisible()
    await expect(ficha.getByRole('button', { name: 'Editar evento' })).toHaveCount(0)
    await expect(ficha.getByRole('button', { name: 'Eliminar evento' })).toHaveCount(0)
    await ficha.getByRole('button', { name: 'Editar nos Eventos' }).click()
    await expect(p).toHaveURL(/events\?convocatoria=e1$/)
    await p.getByRole('button', { name: 'Modificar evento' }).click()
  })


  // E o que se grava é o certo, não só igual.
  const hora = new Date(pelaAgenda.date_time as string)
  expect(hora.getHours()).toBe(21)
  expect(hora.getMinutes()).toBe(30)
  expect(pelaAgenda).toMatchObject({
    title: 'Jogo vs Sesimbra Veteranos',
    type: 'match',
    meeting_time: '20:45:00',
    field_id: 'f2',
    // Com campo escolhido, o texto livre não se escreve: o campo ganha.
    location: null,
    description: 'Equipamento alternativo, e chegar cedo.',
    opponent_id: 'o1',
    home_away: 'away',
    is_friendly: true,
    tournament_id: null,
    matchday: null,
    is_active: true,
  })
  // O limite de convocados não se toca: não está no formulário.
  expect(pelaAgenda).not.toHaveProperty('max_players')
})

test('com convocados, gravar pergunta se reenvia os pedidos de resposta', async ({ page }) => {
  await montarSupabaseFalso(page, {
    ...FIXTURES,
    callups: [{ id: 'c1', event_id: 'e1', player_id: '00000000-0000-4000-8000-000000000001', status: 'confirmed' }],
  })
  await page.goto('/csc-vet/events?convocatoria=e1')
  await page.getByRole('button', { name: 'Modificar evento' }).click()
  await page.getByRole('button', { name: 'Guardar alterações' }).click()
  await expect(page.getByRole('dialog', { name: /Reenviar/ })).toBeVisible()
})

test('um jogo de prova sem jornada não grava', async ({ page }) => {
  const gravados: string[] = []
  page.on('request', r => {
    if (r.url().includes('/rest/v1/events') && r.method() === 'PATCH') gravados.push(r.url())
  })
  await montarSupabaseFalso(page, {
    ...FIXTURES,
    events: [{ ...JOGO, is_friendly: false }],
    tournaments: [{ id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo' }],
  })
  await page.goto('/csc-vet/events?convocatoria=e1')
  await page.getByRole('button', { name: 'Modificar evento' }).click()
  await page.getByLabel('Torneio / competição').selectOption('t1')
  await page.getByRole('button', { name: 'Guardar alterações' }).click()
  await expect(page.getByText('Escolhe a jornada em que este jogo conta para a prova.')).toBeVisible()
  expect(gravados).toHaveLength(0)
})

// O "Modificar evento" é a ação principal do dossier, e tinha o mesmo
// cinzento do "Eliminar" ao lado — as duas ações liam-se com o mesmo peso.
// Fica dourado, como o resto das ações principais da app.
test('o botão de modificar o evento é dourado, e o de eliminar continua vermelho', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/events?convocatoria=e1')

  await expect(page.getByRole('button', { name: 'Modificar evento' })).toHaveClass(/bg-csc-gold/)
  await expect(page.getByRole('button', { name: 'Eliminar evento' })).not.toHaveClass(/bg-csc-gold/)
})
