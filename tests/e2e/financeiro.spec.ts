import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE } from './supabase-mock'

/**
 * Pagamentos Programados — o que o clube tem marcado para pagar a terceiros.
 *
 * **O cabeçalho de grupo e a linha têm de se distinguir.** Eram caixas
 * arredondadas do mesmo cinzento uma a seguir à outra, e a categoria "Seguro
 * Desportivo" lia-se como irmã do encargo "Seguro desportivo 26/27". Cada
 * categoria passou a ser uma caixa só, com a banda em cima e as linhas lá
 * dentro — e a linha deixou de repetir o que a banda já diz.
 */

const FIXTURES = {
  ...FIXTURES_BASE,
  financial_settings: [{
    id: 1, season_start_month: 8, quota_amount: 10, quota_excluded_months: [], initial_balance: 0,
  }],
  expense_categories: [
    { id: 'c1', name: 'Seguro Desportivo', type: 'expense' },
    { id: 'c2', name: 'Inscrição — Liga Masters +35', type: 'expense' },
  ],
  charges: [{
    id: 'ch1', title: 'Seguro desportivo 26/27', amount: 25, category_id: 'c1',
    is_intermediary: true, payable_amount: 700, payable_paid: false,
    payable_due_date: '2026-10-15', due_date: '2026-10-15', season: '2026/2027',
  }],
  tournaments: [{
    id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo',
    rules: {
      registration_fee: {
        category_id: 'c2',
        installments: [
          { amount: 1000, due_date: '2026-10-31', paid: false },
          { amount: 1000, due_date: '2027-01-31', paid: false },
          { amount: 1000, due_date: '2027-04-30', paid: false },
        ],
      },
    },
  }],
}

test('a linha não repete o cabeçalho do grupo', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/finance')
  await page.waitForLoadState('networkidle')
  const cartao = page.locator('div').filter({ hasText: /^Pagamentos programados/ }).first()
  await expect(cartao).toBeVisible({ timeout: 15000 })

  // A banda leva a categoria; a linha, só o que a distingue das outras.
  await expect(cartao.getByText('Inscrição — Liga Masters +35')).toBeVisible()
  await expect(cartao.getByText('Tranche 1', { exact: true })).toBeVisible()
  await expect(cartao.getByText('Liga Masters +35 — Tranche 1')).toHaveCount(0)

  /* Um título de uma parte só fica inteiro — sem isto a linha do seguro
     ficaria a chamar-se "26/27". */
  await expect(cartao.getByText('Seguro desportivo 26/27')).toBeVisible()
})

test('em Despesas, a mesma lista abre o registo do pagamento', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/finance?ver=expenses')
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByRole('button', { name: /Registar o pagamento de Tranche 1/ }),
  ).toBeVisible({ timeout: 15000 })
})
