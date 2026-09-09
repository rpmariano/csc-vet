import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Ficha do adversário (ecrã 9h).
 *
 * Duas coisas que se partiram antes e não se viam num diff: o cartão de
 * identidade a repetir o nome que já é o título da persiana, e o bloco das
 * provas a dizer sempre "sem jornadas lançadas" fosse qual fosse o estado da
 * competição.
 */

const adversario = {
  id: 'o1',
  name: 'Grupo Desportivo Pescadores da Costa da Caparica',
  initials: 'GDPCC',
  logo_url: null,
  contact_name: 'Zé Manel',
  contact_phone: '910 000 111',
  home_field_id: 'f1',
}

const fixtures = {
  opponents: [adversario],
  fields: [{
    id: 'f1',
    name: 'Grupo Desportivo dos Pescadores da Costa da Caparica',
    address: 'Av. Dom Sebastião 75B, 2825-385 Costa de Caparica',
  }],
  /* O mock devolve as linhas tal como estão: dá-se-lhes a forma do join. */
  tournament_teams: [
    { opponent_id: 'o1', tournament: { id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'agendado' } },
    { opponent_id: 'o1', tournament: { id: 't2', name: 'Taça de Veteranos', season: '2026/2027', status: 'ativo' } },
  ],
  tournament_matches: [
    { id: 'm1', tournament_id: 't2', home_score: 2, away_score: 1 },
    { id: 'm2', tournament_id: 't2', home_score: null, away_score: null },
  ],
  events: [],
}

const painel = (pagina: import('@playwright/test').Page) =>
  pagina.locator('[role="dialog"]').last()

test('o cartão não repete o nome que já é o título da ficha', async ({ page }) => {
  await montarSupabaseFalso(page, fixtures)
  await page.goto('/csc-vet/clube?ver=adversarios&adversario=o1')

  const ficha = painel(page)
  await expect(ficha).toBeVisible()

  // O nome aparece uma vez: no título. O cartão traz a sigla, que o título
  // não diz, e o histórico contra nós.
  await expect(ficha.getByText(adversario.name, { exact: true })).toHaveCount(1)
  await expect(ficha.getByText('Sigla nos placares')).toBeVisible()
  await expect(ficha.getByText('GDPCC', { exact: true })).toBeVisible()
})

test('cada prova diz o seu estado, e são várias', async ({ page }) => {
  await montarSupabaseFalso(page, fixtures)
  await page.goto('/csc-vet/clube?ver=adversarios&adversario=o1')

  const ficha = painel(page)
  await expect(ficha.getByText('Provas em que participa')).toBeVisible()

  // A que ainda não começou, e a que já tem jogos: cada uma com o seu texto.
  await expect(ficha.getByText(/Liga Masters \+35/)).toBeVisible()
  await expect(ficha.getByText(/agendado · sem jornadas lançadas/)).toBeVisible()
  await expect(ficha.getByText(/ativo · 1 de 2 jogos com resultado/)).toBeVisible()

  // E o botão leva à classificação daquela prova — não se chama "Lançar",
  // que dava a entender que criava alguma coisa.
  const links = ficha.getByRole('link', { name: 'Ver prova' })
  await expect(links).toHaveCount(2)
  await expect(links.first()).toHaveAttribute('href', /torneio=t1/)
})
