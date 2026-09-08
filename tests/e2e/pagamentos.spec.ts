import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * O sinal de € do cabeçalho e "Os meus pagamentos".
 *
 * A dívida vivia numa faixa vermelha que ocupava uma linha no topo de todos os
 * ecrãs e que só falava de quotas — um encargo por pagar não aparecia em aviso
 * nenhum. Passa a ser um crachá ao lado da pastilha do estado, com a contagem,
 * do mesmo feitio do sino dos comunicados:
 *
 * - **laranja** a menos de 8 dias de um prazo;
 * - **vermelho** quando algum já passou. Com um de cada, manda o vermelho.
 */

const D = (dias: number) => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10)

/** O ano em que a época (Ago–Jul) começou. */
const anoDaEpoca = () => {
  const h = new Date()
  return h.getMonth() + 1 >= 8 ? h.getFullYear() : h.getFullYear() - 1
}

const PERFIL = {
  id: UTILIZADOR_TESTE.id, name: 'Utilizador de Teste', email: UTILIZADOR_TESTE.email,
  role: 'admin', roles: ['admin', 'player'], status: 'active', jersey_number: 99,
  shirt_name: 'Teste', position: 'Médio Centro', photo_url: null,
  quota_start_date: `${anoDaEpoca()}-08-01`, quota_end_date: null,
}

const DEFINICOES = [{
  id: 1, season_start_month: 8, season_end_month: 7, quota_amount: 10,
  quota_excluded_months: [], quota_due_day: 8,
  insurance_amount: 20, insurance_deadline_month: 9, insurance_deadline_day: 30,
}]

type Extras = Record<string, unknown[]>

async function abreApp(page: import('@playwright/test').Page, extras: Extras = {}, perfil = PERFIL) {
  await montarSupabaseFalso(page, {
    profiles: [perfil], v_players_public: [perfil],
    financial_settings: DEFINICOES,
    dues: [], quota_exemptions: [],
    charge_players: [], charges: [], charge_payments: [], expense_categories: [],
    ...extras,
  })
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
}

/** Todas as quotas da época pagas — para o sinal depender só dos encargos. */
const quotasTodasPagas = () => {
  const ano = anoDaEpoca()
  const meses: { player_id: string; month_year: string; amount: number; status: string }[] = []
  for (let i = 0; i < 12; i++) {
    const m = ((7 + i) % 12) + 1
    const a = 7 + i < 12 ? ano : ano + 1
    meses.push({
      player_id: PERFIL.id,
      month_year: `${a}-${String(m).padStart(2, '0')}`,
      amount: 10, status: 'paid',
    })
  }
  return meses
}

const sinal = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /pagamento[s]? (em atraso|a vencer)/ })

test('sem nada a assinalar, não há sinal nenhum', async ({ page }) => {
  await abreApp(page, { dues: quotasTodasPagas() })
  await expect(sinal(page)).toHaveCount(0)
})

test('com uma quota vencida, o sinal fica vermelho', async ({ page }) => {
  await abreApp(page)
  await expect(sinal(page)).toBeVisible()
  await expect(sinal(page)).toHaveAttribute('aria-label', /em atraso/)
})

test('só com um encargo a menos de 8 dias, fica laranja', async ({ page }) => {
  await abreApp(page, {
    dues: quotasTodasPagas(),
    charge_players: [{ charge_id: 'c1', player_id: PERFIL.id }],
    charges: [{ id: 'c1', title: 'Seguro desportivo', amount: 20, due_date: D(3), category_id: 'k1' }],
    expense_categories: [{ id: 'k1', name: 'Seguros' }],
  })
  await expect(sinal(page)).toHaveAttribute('aria-label', /a vencer/)
})

test('um encargo longe do prazo não assinala nada', async ({ page }) => {
  await abreApp(page, {
    dues: quotasTodasPagas(),
    charge_players: [{ charge_id: 'c1', player_id: PERFIL.id }],
    charges: [{ id: 'c1', title: 'Seguro desportivo', amount: 20, due_date: D(40), category_id: 'k1' }],
    expense_categories: [{ id: 'k1', name: 'Seguros' }],
  })
  await expect(sinal(page)).toHaveCount(0)
})

test('com um vencido e outro a aproximar-se, manda o vermelho', async ({ page }) => {
  await abreApp(page, {
    charge_players: [{ charge_id: 'c1', player_id: PERFIL.id }],
    charges: [{ id: 'c1', title: 'Seguro desportivo', amount: 20, due_date: D(3), category_id: 'k1' }],
    expense_categories: [{ id: 'k1', name: 'Seguros' }],
  })
  await expect(sinal(page)).toHaveAttribute('aria-label', /em atraso/)
})

test('a persiana lista as dívidas e diz como se paga', async ({ page }) => {
  await abreApp(page, {
    charge_players: [{ charge_id: 'c1', player_id: PERFIL.id }],
    charges: [{ id: 'c1', title: 'Seguro desportivo', amount: 20, due_date: D(3), category_id: 'k1' }],
    expense_categories: [{ id: 'k1', name: 'Seguros' }],
  })
  await sinal(page).click()

  const persiana = page.getByRole('dialog')
  await expect(persiana.getByText('Seguro desportivo')).toBeVisible()
  await expect(persiana.getByText(/Efetua transferência bancária ou MBWay para o Rui Mariano/)).toBeVisible()
  await expect(persiana.getByText(/913663956/)).toBeVisible()
  await expect(persiana.getByText(/João Matuto/)).toBeVisible()
})

test('quem não joga não tem pagamentos, e não vê sinal', async ({ page }) => {
  await abreApp(page, {}, { ...PERFIL, role: 'coach', roles: ['coach'] })
  await expect(sinal(page)).toHaveCount(0)
})

/**
 * "Os meus pagamentos", no Perfil: tudo — devido e pago — por categoria, com
 * os grupos a abrir e a fechar.
 */
test.describe('Os meus pagamentos', () => {
  async function abrePersiana(page: import('@playwright/test').Page) {
    await abreApp(page, {
      charge_players: [{ charge_id: 'c1', player_id: PERFIL.id }],
      charges: [{ id: 'c1', title: 'Seguro desportivo', amount: 20, due_date: D(3), category_id: 'k1' }],
      charge_payments: [{ charge_id: 'c1', player_id: PERFIL.id, amount: 20, paid_at: D(-10) }],
      expense_categories: [{ id: 'k1', name: 'Seguros' }],
    })
    await page.goto('/csc-vet/settings')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /Os meus pagamentos/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }

  test('agrupa por categoria e mostra o que já foi pago', async ({ page }) => {
    await abrePersiana(page)
    const persiana = page.getByRole('dialog')

    await expect(persiana.getByRole('button', { name: /^Quotas/ })).toBeVisible()
    await expect(persiana.getByRole('button', { name: /^Seguros/ })).toBeVisible()
    // O encargo está pago, e aparece — a persiana é do devido e do pago.
    await expect(persiana.getByRole('button', { name: /Seguros.*1 de 1 pago/ })).toBeVisible()
  })

  test('um grupo abre e fecha', async ({ page }) => {
    await abrePersiana(page)
    const persiana = page.getByRole('dialog')
    const quotas = persiana.getByRole('button', { name: /^Quotas/ })

    // Com dívida, começa aberto.
    await expect(quotas).toHaveAttribute('aria-expanded', 'true')
    await quotas.click()
    await expect(quotas).toHaveAttribute('aria-expanded', 'false')
    await quotas.click()
    await expect(quotas).toHaveAttribute('aria-expanded', 'true')
  })
})
