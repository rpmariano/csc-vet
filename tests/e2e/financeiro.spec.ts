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

/**
 * Quotas — duas prateleiras, e não três.
 *
 * A lista tinha "em atraso", "por pagar" e "em dia": quem não devia nada mas
 * ainda tinha meses futuros por pagar aparecia de pastilha âmbar, ao lado de
 * quem devia mesmo. Ou se deve — porque o prazo passou —, ou se está em dia.
 * Devedores primeiro, e por ordem alfabética dentro de cada grupo: a vista vem
 * ordenada por número de camisola, e procurar um nome assim é ler a lista toda.
 */

const ATLETAS = [
  { id: 'p1', name: 'Vieira Silva', shirt_name: 'Vieira', jersey_number: 11 },
  { id: 'p2', name: 'Bruno Costa', shirt_name: 'Bruno', jersey_number: 2 },
  { id: 'p3', name: 'Alves Pinto', shirt_name: 'Alves', jersey_number: 7 },
  { id: 'p4', name: 'Carlos Nogueira', shirt_name: 'Carlos', jersey_number: 9 },
  /* Enchimento, para a lista passar da altura do ecrã: sem isso não há
     scroll nenhum para o teste da posição verificar. Nomes com Z para não se
     meterem entre os quatro de cima. */
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `z${i}`, name: `Zeta ${i + 1}`, shirt_name: `Zeta ${i + 1}`, jersey_number: 20 + i,
  })),
]

const mes = (
  player_id: string,
  month_year: string,
  status: 'paid' | 'late' | 'pending',
) => ({
  player_id,
  month_year,
  expected_amount: 10,
  due_id: status === 'paid' ? `d-${player_id}-${month_year}` : null,
  paid_amount: status === 'paid' ? 10 : 0,
  due_date: `${month_year}-08`,
  status,
  owed_amount: status === 'paid' ? 0 : 10,
})

const FIXTURES_QUOTAS = {
  ...FIXTURES_BASE,
  financial_settings: [{
    id: 1, season_start_month: 8, quota_amount: 10, quota_due_day: 8,
    quota_excluded_months: [], initial_balance: 0,
  }],
  v_players_public: ATLETAS.map(a => ({
    ...a, status: 'active', role: 'player', roles: ['player'],
    quota_start_date: '2026-08-01', quota_end_date: null,
  })),
  v_quota_status: [
    // Devem: têm um mês cujo prazo já passou.
    mes('p1', '2026-09', 'late'), mes('p1', '2026-10', 'pending'),
    mes('p2', '2026-09', 'late'), mes('p2', '2026-10', 'pending'),
    // Em dia: um com meses futuros por pagar, outro com tudo pago.
    mes('p3', '2026-09', 'paid'), mes('p3', '2026-10', 'pending'), mes('p3', '2026-11', 'pending'),
    mes('p4', '2026-09', 'paid'), mes('p4', '2026-10', 'paid'),
    ...ATLETAS.slice(4).flatMap(a => [mes(a.id, '2026-09', 'paid'), mes(a.id, '2026-10', 'pending')]),
  ],
}

const abreQuotas = async (page: import('@playwright/test').Page) => {
  await montarSupabaseFalso(page, FIXTURES_QUOTAS)
  await page.goto('/csc-vet/finance?ver=quotas')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(/em atraso a partir do dia/)).toBeVisible({ timeout: 15000 })
}

test('devedores primeiro, e por ordem alfabética dentro do grupo', async ({ page }) => {
  await abreQuotas(page)

  const devedores = page.getByRole('region', { name: 'Devedores' })
  const emDia = page.getByRole('region', { name: 'Em dia' })

  // Quem deve vem primeiro, que é a lista que se abre para resolver.
  const yDevedores = (await devedores.boundingBox())!.y
  const yEmDia = (await emDia.boundingBox())!.y
  expect(yDevedores).toBeLessThan(yEmDia)

  /* E dentro de cada grupo os nomes saem por ordem alfabética, e não por
     número de camisola. Lido do texto da região e não de uma classe: um
     seletor preso ao aspeto já se partiu duas vezes neste repositório. */
  const deveTexto = await devedores.innerText()
  expect(deveTexto.indexOf('Bruno')).toBeLessThan(deveTexto.indexOf('Vieira'))

  const emDiaTexto = await emDia.innerText()
  expect(emDiaTexto.indexOf('Alves')).toBeLessThan(emDiaTexto.indexOf('Carlos'))
})

test('meses futuros por pagar não fazem de ninguém devedor', async ({ page }) => {
  await abreQuotas(page)

  /* O estado é o grupo em que a linha está, e não uma pastilha em cada linha:
     quem tem um mês pago em três aparece em "Em dia" na mesma, com a contagem
     à direita. */
  const emDia = page.getByRole('region', { name: 'Em dia' })
  await expect(emDia).toContainText('Alves')
  await expect(emDia).toContainText('1/3')
  await expect(page.getByRole('region', { name: 'Devedores' })).not.toContainText('Alves')

  // A pastilha âmbar de "por pagar" deixou de existir na lista.
  await expect(page.getByText(/por pagar/)).toHaveCount(0)
})

test('marcar um mês não devolve a lista ao topo', async ({ page }, testInfo) => {
  /* Numa janela de computador a lista cabe inteira e não há scroll nenhum
     para preservar — o teste não teria o que medir. */
  testInfo.skip(testInfo.project.name !== 'telemovel', 'Só o telemóvel chega a rolar.')
  await abreQuotas(page)

  await page.locator('button[aria-expanded]').filter({ hasText: 'Zeta 8' }).click()
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(200)
  const antes = await page.evaluate(() => window.scrollY)
  expect(antes).toBeGreaterThan(0)

  await page.getByRole('button', { name: /outubro de 2026/i }).first().click()
  await expect(page.getByText(/Quota registada|Pagamento de quota removido/)).toBeVisible()
  await page.waitForTimeout(600)

  expect(await page.evaluate(() => window.scrollY)).toBe(antes)
})
