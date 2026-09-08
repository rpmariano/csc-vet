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
    id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'active',
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
  tournament_matches: [],
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
