import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * Os meses dispensados de quota, na ficha do atleta (ecrã 3c).
 *
 * Três regras, e as três vêm das definições financeiras do clube:
 *
 * - a fila **começa no mês em que a época começa**, e não em Janeiro: a época
 *   é Set–Jul, e uma fila que abria em Janeiro obrigava a procurar o início a
 *   meio;
 * - os meses em que **o clube inteiro não paga** (`quota_excluded_months`, o
 *   Agosto) ficam bloqueados — dispensar alguém de um mês que ninguém paga não
 *   quer dizer nada, e antes gravava uma linha que não mudava conta nenhuma;
 * - e um mês dispensado sai da previsão de receita, o que é feito na vista
 *   `v_quota_status` (ver `supabase_quota_exemptions_reporting_migration.sql`).
 */

const DEFINICOES = (inicio: number, excluidos: number[]) => ({
  financial_settings: [{
    id: 1, season_start_month: inicio, season_end_month: inicio === 9 ? 7 : 12,
    quota_amount: 10, quota_excluded_months: excluidos, quota_due_day: 8,
    insurance_amount: 20, insurance_deadline_month: 9, insurance_deadline_day: 30,
  }],
})

async function abreFicha(page: import('@playwright/test').Page, fixtures: Record<string, unknown[]>) {
  await montarSupabaseFalso(page, fixtures as never)
  await page.goto('/csc-vet/team-management')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Adicionar membro ao plantel' }).click()
  await expect(page.getByText('Meses dispensados de quota')).toBeVisible()
}

/** As pastilhas de mês, pela ordem em que aparecem. */
const mesesNaFila = (page: import('@playwright/test').Page) =>
  page
    .locator('button')
    .filter({ hasText: /^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)$/ })
    .allTextContents()

test('a fila começa no mês em que a época começa', async ({ page }) => {
  await abreFicha(page, DEFINICOES(9, [8]))

  expect(await mesesNaFila(page)).toEqual(
    ['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'],
  )
})

test('uma época que comece noutro mês reordena a fila', async ({ page }) => {
  await abreFicha(page, DEFINICOES(1, []))

  const meses = await mesesNaFila(page)
  expect(meses[0]).toBe('Jan')
  expect(meses[11]).toBe('Dez')
})

test('o mês que o clube inteiro não paga fica bloqueado', async ({ page }) => {
  await abreFicha(page, DEFINICOES(9, [8]))

  const agosto = page.getByRole('button', { name: /^Ago( |$)|não paga quota/ }).first()
  await expect(agosto).toBeDisabled()

  // E os outros continuam a poder ser escolhidos.
  const setembro = page.getByRole('button', { name: 'Set', exact: true })
  await expect(setembro).toBeEnabled()
  await expect(setembro).toHaveAttribute('aria-pressed', 'false')
  await setembro.click()
  await expect(setembro).toHaveAttribute('aria-pressed', 'true')
})

test('sem meses excluídos, nenhum fica bloqueado', async ({ page }) => {
  await abreFicha(page, DEFINICOES(1, []))

  for (const mes of ['Jan', 'Ago', 'Dez']) {
    await expect(page.getByRole('button', { name: mes, exact: true })).toBeEnabled()
  }
})

/**
 * Só a direção dispensa alguém de quota.
 *
 * A ficha do atleta é de treinador **e** admin, mas `quota_exemptions` só
 * aceita escrita de admin (RLS). O treinador carregava numa pastilha, gravava,
 * e levava com um erro de permissão vindo do fim do `handleSaveMember`.
 */
test('um treinador vê as pastilhas, mas não lhes mexe', async ({ page }) => {
  await abreFicha(page, {
    ...DEFINICOES(9, [8]),
    profiles: [{
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Utilizador de Teste', email: 'teste@csc-vet.local',
      role: 'coach', roles: ['coach'], status: 'active',
      jersey_number: 99, shirt_name: 'Teste', position: 'Médio Centro',
      medical_notes: null, photo_url: null, phone: null,
    }],
  })

  // Bloqueadas, as pastilhas levam `aria-label` com o motivo — daí o nome
  // deixar de ser só "Set".
  await expect(page.getByRole('button', { name: /^Set —/ })).toBeDisabled()
  await expect(page.getByText('Só a direção altera dispensas de quota')).toBeVisible()
})
