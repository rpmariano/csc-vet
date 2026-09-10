import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Os golos dos atletas têm de bater certo com o resultado.
 *
 * A ficha deixava gravar um jogo 2-1 com quatro golos repartidos pelos
 * jogadores: números impossíveis a alimentar as estatísticas e, desde que o
 * jogo se espelha na jornada, também a classificação. Somar **mais** do que o
 * resultado é impossível e é recusado; somar **menos** pode ser um autogolo do
 * adversário, que conta para nós e não tem marcador, por isso pergunta-se.
 */

const ATLETA = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste',
  shirt_name: 'Teste',
  jersey_number: 99,
  position: 'Médio Centro',
  status: 'active',
  role: 'admin',
  roles: ['admin', 'player'],
}

const JOGO = {
  id: 'j1',
  title: 'Jogo de teste',
  type: 'match',
  date_time: new Date(Date.now() - 864e5).toISOString(),
  location: 'Campo de Teste',
  description: null,
  field_id: null,
  opponent_id: 'o1',
  tournament_id: null,
  home_away: 'home',
  is_friendly: false,
  max_players: null,
  meeting_time: null,
  home_score: 2,
  away_score: 1,
  is_active: true,
  opponent: { id: 'o1', name: 'Grupo Desportivo Pescadores', initials: 'GDPCC', logo_url: null },
}

const FIXTURES = {
  ...FIXTURES_BASE,
  profiles: [ATLETA],
  v_players_public: [ATLETA],
  events: [JOGO],
  callups: [{ id: 'c1', event_id: 'j1', player_id: ATLETA.id, status: 'confirmed', notes: null }],
  stats: [],
}

const abreFicha = async (page: import('@playwright/test').Page) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/competicao?ver=fichas&jogo=j1')
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 })
  /* O botão de dentro da ficha, e não o cartão da lista — que também se chama
     "Editar a ficha do jogo com…" e está por baixo da persiana. */
  await page.getByRole('dialog').getByRole('button', { name: /Editar ficha de jogo/i }).click()
  // O painel de edição é o de cima da pilha.
  await expect(page.getByRole('dialog').last()).toContainText('Esquema Tático')
}

test('somar mais golos do que o resultado não grava', async ({ page }) => {
  await abreFicha(page)

  // Três golos ao atleta, num jogo que o resultado diz 2-1.
  const mais = page.getByRole('button', { name: /Mais um em golos/i }).first()
  for (let i = 0; i < 3; i++) await mais.click()

  // O aviso aparece enquanto se escreve, sem se chegar ao botão.
  await expect(page.getByRole('status')).toContainText(/mais 1 do que os 2/)

  await page.getByRole('button', { name: /Guardar/i }).first().click()

  // E a ficha continua aberta, com o erro dito.
  await expect(page.getByText(/Corrige um dos dois antes de gravar/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Guardar/i }).first()).toBeVisible()
})

test('golos do resultado sem marcador perguntam antes de gravar', async ({ page }) => {
  await abreFicha(page)

  // Sem tocar em nada: o resultado dá 2 ao CSC e ninguém marcou.
  await expect(page.getByRole('status')).toContainText(/sem marcador/)

  await page.getByRole('button', { name: /Guardar/i }).first().click()
  const aviso = page.getByRole('dialog').filter({ hasText: 'Golos sem marcador' })
  await expect(aviso).toBeVisible()

  // Desistir deixa a ficha como estava.
  await aviso.getByRole('button', { name: /Cancelar/i }).click()
  await expect(aviso).toHaveCount(0)
})
