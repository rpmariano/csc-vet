import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * As equipas de um torneio, na classificação.
 *
 * Mostravam-se pelo **nome por extenso** — "Clube Atletismo do Montijo" numa
 * tabela de dez colunas, truncado a meio — e a linha do próprio clube ficava
 * **sem emblema**: o código punha `logo = isCSC ? null : …`, portanto o clube
 * levava sempre o escudo genérico mesmo tendo emblema em `club_settings`.
 *
 * Passa a ser a sigla e o emblema, e a sigla é a que a direção escreveu na
 * ficha do adversário — não a que o `formatOpponentSigla` reconstrói para os
 * placares apertados, que recusa espaços e daria "CADM".
 */

const EMBLEMA =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
  '<circle cx="20" cy="20" r="19" fill="%230a4"/></svg>'

const FIXTURES = {
  club_settings: [{
    id: 1, name: 'Grupo Dramático e Sportivo de Cascais', initials: 'GDS Cascais',
    logo_url: EMBLEMA, primary_color: '#1c1c1c', home_field_id: null,
  }],
  tournaments: [{
    /* 'ativo' é o valor do enum `tournament_status` — a Home só mostra estas. */
    id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo',
    organizer_name: 'AF Lisboa', image_url: null,
  }],
  tournament_groups: [{ id: 'g1', tournament_id: 't1', name: 'Grupo Único', phase: 1 }],
  tournament_teams: [
    { id: 'e1', tournament_id: 't1', group_id: 'g1', opponent_id: null, points_carryover: 0, opponent: null },
    {
      id: 'e2', tournament_id: 't1', group_id: 'g1', opponent_id: 'o1', points_carryover: 0,
      opponent: { id: 'o1', name: 'Clube Atletismo do Montijo', initials: 'CA Montijo', logo_url: EMBLEMA },
    },
    {
      id: 'e3', tournament_id: 't1', group_id: 'g1', opponent_id: 'o2', points_carryover: 0,
      opponent: { id: 'o2', name: 'Grupo Desportivo Pescadores da Costa da Caparica', initials: 'GDPCC', logo_url: null },
    },
  ],
  tournament_matches: [
    {
      id: 'j1a', tournament_id: 't1', group_id: 'g1', matchday: 1, match_date: '2026-09-12',
      home_team_id: 'e2', away_team_id: 'e3', status: 'finished', home_score: 2, away_score: 1,
    },
    {
      id: 'j2a', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-19',
      home_team_id: 'e3', away_team_id: 'e2', status: 'scheduled', home_score: null, away_score: null,
    },
    /* Um jogo nosso espelhado de um evento, já com ficha lançada… */
    {
      id: 'j2b', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-20',
      home_team_id: 'e1', away_team_id: 'e2', status: 'finished', home_score: 3, away_score: 1,
      event_id: 'ev1',
    },
    /* …e outro nosso, marcado e ainda sem ficha. */
    {
      id: 'j2c', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-21',
      home_team_id: 'e1', away_team_id: 'e3', status: 'scheduled', home_score: null, away_score: null,
      event_id: 'ev2',
    },
  ],
  events: [
    {
      id: 'ev1', tournament_id: 't1', type: 'match', matchday: 2, is_active: true,
      date_time: '2026-09-20T10:00:00Z', meeting_time: null, home_away: 'home',
      home_score: 3, away_score: 1, opponent_id: 'o1', is_friendly: false, location: 'Cascais',
      title: 'Jogo vs Clube Atletismo do Montijo', description: null, field_id: null,
      opponent: { id: 'o1', name: 'Clube Atletismo do Montijo', initials: 'CA Montijo', logo_url: EMBLEMA },
      tournament: { id: 't1', name: 'Liga Masters +35', season: '2026/2027', rules: null }, field: null,
    },
  ],
}

async function abreClassificacao(page: import('@playwright/test').Page) {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/competicao?ver=classificacoes')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('table').first()).toBeVisible()
}

test('as equipas aparecem pela sigla, não pelo nome por extenso', async ({ page }) => {
  await abreClassificacao(page)

  const tabela = page.locator('table').first()
  await expect(tabela.getByText('CSC', { exact: true })).toBeVisible()
  await expect(tabela.getByText('CA Montijo', { exact: true })).toBeVisible()
  await expect(tabela.getByText('GDPCC', { exact: true })).toBeVisible()

  // E os nomes por extenso não aparecem em lado nenhum da tabela.
  await expect(tabela.getByText(/Clube Atletismo do Montijo/)).toHaveCount(0)
  await expect(tabela.getByText(/Grupo Desportivo Pescadores/)).toHaveCount(0)
})

test('a linha do clube leva o emblema do clube, e não o escudo genérico', async ({ page }) => {
  await abreClassificacao(page)

  const linhaDoClube = page.locator('tr').filter({ hasText: 'CSC' }).first()
  await expect(linhaDoClube.locator('img')).toHaveAttribute('src', EMBLEMA)

  // O adversário com emblema também o mostra…
  const montijo = page.locator('tr').filter({ hasText: 'CA Montijo' }).first()
  await expect(montijo.locator('img')).toHaveCount(1)

  // …e quem não tem fica com o escudo, que é o certo.
  const semEmblema = page.locator('tr').filter({ hasText: 'GDPCC' }).first()
  await expect(semEmblema.locator('img')).toHaveCount(0)
})

/**
 * As jornadas mostram-se **uma de cada vez**.
 *
 * Estavam todas abertas por baixo da tabela: com dez jornadas a seis jogos,
 * eram mais de sessenta linhas entre a tabela de um grupo e a do seguinte, e
 * chegar ao segundo grupo era um scroll sem fim.
 */
test('só se vê uma jornada de cada vez, e a pastilha troca de jornada', async ({ page }) => {
  await abreClassificacao(page)

  // Abre na jornada em foco — a primeira com jogos por realizar, aqui a 2.
  await expect(page.getByText('19/09')).toBeVisible()
  await expect(page.getByText('12/09')).toHaveCount(0)

  await page.getByRole('button', { name: /^Jornada 1,/ }).click()
  await expect(page.getByText('12/09')).toBeVisible()
  await expect(page.getByText('19/09')).toHaveCount(0)

  // O jogo lançado mostra o resultado; o outro fica com o "VS".
  await expect(page.getByText('2 - 1')).toBeVisible()
})

/**
 * A Home mostra o pedaço da classificação onde estamos, e leva à prova certa.
 *
 * O cartão só sabia dizer quantas jornadas havia: a conta da tabela vivia
 * dentro da `StandingsPage` e duplicá-la dava duas classificações que podiam
 * discordar. Hoje é a mesma função, em `src/lib/classificacao.ts`.
 */
test('a Home mostra a classificação do clube e liga à prova', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')

  const cartao = page.locator('section').filter({ hasText: 'Classificação' }).first()
  await expect(cartao.getByText('Liga Masters +35')).toBeVisible()
  await expect(cartao.getByText('Grupo Único')).toBeVisible()
  // O clube está lá, com as outras equipas do grupo à volta.
  await expect(cartao.getByText('CSC', { exact: true })).toBeVisible()
  await expect(cartao.getByText('CA Montijo', { exact: true })).toBeVisible()

  // E tocar leva à classificação desta prova, não à primeira da lista.
  await cartao.getByRole('link').first().click()
  await expect(page).toHaveURL(/ver=classificacoes/)
  await expect(page).toHaveURL(/torneio=t1/)
})

/**
 * Um jogo de prova diz sempre em que jornada conta.
 *
 * É a jornada que espelha o jogo em `tournament_matches` — sem ela o jogo
 * ficava fora da tabela, e quem lançasse a ficha tinha de ir à Classificação
 * escrever o mesmo resultado outra vez à mão.
 */
test('um jogo de prova não se grava sem jornada', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/events')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Novo Evento' }).click()
  await page.getByRole('button', { name: 'Jogo', exact: true }).click()

  // Sem prova escolhida não há jornada nenhuma para pedir.
  await expect(page.getByLabel('Jornada *')).toHaveCount(0)

  await page.getByLabel('Torneio / Competição').selectOption('t1')
  await expect(page.getByLabel('Jornada *')).toBeVisible()

  await page.getByRole('button', { name: /Guardar e convocar/ }).click()
  await expect(page.getByText(/jornada em que este jogo conta/i)).toBeVisible()

  // Com a jornada preenchida, o formulário deixa de reclamar.
  await page.getByLabel('Jornada *').fill('3')
  await expect(page.getByLabel('Jornada *')).toHaveValue('3')
})

/**
 * Um jogo nosso já lançado abre a ficha; um por lançar diz que lhe falta.
 *
 * A lista de jornadas mostrava só o placar, e a ficha — marcadores, cartões,
 * onze — ficava a dois ecrãs de distância, sem nada a dizer sequer quais dos
 * nossos jogos já a tinham.
 */
test('a linha do nosso jogo abre a ficha, e distingue quem ainda não a tem', async ({ page }) => {
  await abreClassificacao(page)

  const comFicha = page.getByRole('link', { name: /Abrir a ficha de jogo de CSC com CA Montijo/ })
  await expect(comFicha).toBeVisible()
  await expect(page.getByTitle('Jogo nosso, ainda sem ficha de jogo')).toBeVisible()

  await comFicha.click()
  await expect(page).toHaveURL(/ver=fichas&jogo=ev1/)
  await expect(page.locator('[role="dialog"]')).toBeVisible()
})
