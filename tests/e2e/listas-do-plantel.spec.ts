import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * As três listas do plantel inteiro — Plantel, Quotas e Encargos — leem-se da
 * mesma maneira.
 *
 * **A bola verde com o número é de todas.** Andavam três desenhos para a mesma
 * pessoa: no Plantel a bola, nas Quotas um número apagado, nos Encargos nada.
 * **A fotografia e a posição são só do Plantel**, que é o ecrã onde a pergunta
 * é quem é a pessoa; nos outros dois é quanto deve.
 *
 * E o Plantel agrupa por perfil, com o jogador a mandar sobre o treinador e
 * este sobre a direção: metade da direção deste clube também joga, e quem joga
 * aparece entre os jogadores.
 */
const PESSOAS = [
  { id: 'p1', name: 'Vieira Silva', shirt_name: 'Vieira', jersey_number: 11, position: 'Avançado', roles: ['player'], role: 'player' },
  { id: 'p2', name: 'Bruno Costa', shirt_name: 'Bruno', jersey_number: 2, position: 'Defesa Central', roles: ['player'], role: 'player' },
  { id: 'p3', name: 'Alves Pinto', shirt_name: 'Alves', jersey_number: 7, position: 'Médio Centro', roles: ['player', 'admin'], role: 'admin' },
  { id: 'p4', name: 'Mário Treinador', shirt_name: 'Mário', jersey_number: null, position: null, roles: ['coach'], role: 'coach' },
  { id: 'p5', name: 'Zé da Direção', shirt_name: 'Zé', jersey_number: null, position: null, roles: ['admin'], role: 'admin' },
  { id: UTILIZADOR_TESTE.id, name: 'Utilizador de Teste', shirt_name: 'Teste', jersey_number: 99, position: 'Guarda-Redes', roles: ['admin', 'player'], role: 'admin' },
].map(p => ({ ...p, status: 'active', photo_url: null, quota_start_date: '2026-08-01', quota_end_date: null }))

const mes = (player_id: string, month_year: string, status: 'paid' | 'late' | 'pending') => ({
  player_id, month_year, expected_amount: 10,
  due_id: status === 'paid' ? `d-${player_id}` : null,
  paid_amount: status === 'paid' ? 10 : 0,
  due_date: `${month_year}-08`, status, owed_amount: status === 'paid' ? 0 : 10,
})

const FIXTURES = {
  ...FIXTURES_BASE,
  profiles: PESSOAS,
  v_players_public: PESSOAS,
  financial_settings: [{ id: 1, season_start_month: 8, quota_amount: 10, quota_due_day: 8, quota_excluded_months: [], initial_balance: 0 }],
  expense_categories: [{ id: 'c1', name: 'Seguro Desportivo', allow_income: true }],
  v_quota_status: PESSOAS.flatMap((p, i) => [
    mes(p.id, '2026-08', i % 2 === 0 ? 'paid' : 'late'),
    mes(p.id, '2026-09', 'pending'),
  ]),
  charges: [{
    id: 'ch1', title: 'Seguro desportivo 26/27', amount: 25, category_id: 'c1',
    is_intermediary: true, payable_amount: 700, payable_paid: false,
    payable_due_date: '2026-10-15', due_date: '2026-09-01', season: '2026/2027',
  }],
  charge_players: PESSOAS.map(p => ({ id: `cp-${p.id}`, charge_id: 'ch1', player_id: p.id })),
  charge_payments: [],
}

test('o Plantel agrupa por perfil, com o jogador a mandar', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/team-management')

  const jogadores = page.getByRole('region', { name: 'Jogadores' })
  const tecnica = page.getByRole('region', { name: 'Equipa técnica' })
  const direcao = page.getByRole('region', { name: 'Direção' })
  await expect(jogadores).toBeVisible({ timeout: 15000 })

  // Pela ordem: jogadores, equipa técnica, direção.
  expect((await jogadores.boundingBox())!.y).toBeLessThan((await tecnica.boundingBox())!.y)
  expect((await tecnica.boundingBox())!.y).toBeLessThan((await direcao.boundingBox())!.y)

  /* Quem é jogador **e** direção conta como jogador — é o caso do Alves e do
     próprio utilizador de teste. */
  await expect(jogadores).toContainText('Alves')
  await expect(direcao).not.toContainText('Alves')
  await expect(direcao).toContainText('Zé')
  await expect(tecnica).toContainText('Mário')

  // E por ordem alfabética dentro do grupo, não por número de camisola.
  const texto = await jogadores.innerText()
  expect(texto.indexOf('Alves')).toBeLessThan(texto.indexOf('Bruno'))
  expect(texto.indexOf('Bruno')).toBeLessThan(texto.indexOf('Vieira'))
})

test('a bola com o número está nas três listas; a foto e a posição só no Plantel', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)

  await page.goto('/csc-vet/team-management')
  const noPlantel = page.getByRole('button', { name: /Ver a ficha de Vieira Silva/ })
  await expect(noPlantel).toContainText('11')
  await expect(noPlantel).toContainText('Ponta de Lança')

  await page.goto('/csc-vet/finance?ver=quotas')
  await expect(page.getByText(/em atraso a partir do dia/)).toBeVisible({ timeout: 15000 })
  const naQuota = page.locator('button[aria-expanded]').filter({ hasText: 'Vieira' })
  await expect(naQuota).toContainText('11')
  // Sem posição: aqui a pergunta é quanto deve, não quem é.
  await expect(naQuota).not.toContainText('Ponta de Lança')

  await page.goto('/csc-vet/finance?ver=charges')
  await expect(page.getByText('Seguro desportivo 26/27')).toBeVisible({ timeout: 15000 })
  await page.locator('button[aria-expanded]').first().click()
  const noEncargo = page.getByRole('region', { name: /Devedores/ }).locator('div').filter({ hasText: /^11Vieira/ }).first()
  await expect(noEncargo).toBeVisible()
})
