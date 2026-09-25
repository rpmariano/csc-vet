import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * O índice do Clube, arrumado pelo que se vem cá fazer (2026-09-25).
 *
 * Era um bloco "Gestão" de seis linhas por uma ordem que não dizia nada, e um
 * cartão do campo principal que repetia os Dados do clube. Hoje: Equipa, a
 * Época (o que se usa todas as semanas), a Direção (dinheiro e dados
 * pessoais, só da direção) e a Configuração (o que se toca uma vez).
 */

function comoPapel(papel: 'coach' | 'admin') {
  const eu = {
    id: UTILIZADOR_TESTE.id, name: 'Pessoa de Teste', email: UTILIZADOR_TESTE.email,
    role: papel, roles: [papel], status: 'active', jersey_number: null, position: null,
  }
  return {
    profiles: [eu],
    v_players_public: [eu],
    fields: [{ id: 'f1', name: 'Estádio Municipal', address: 'Cascais' }],
    club_settings: [{ id: 1, home_field_id: 'f1', club_name: 'GDS Cascais', initials: 'CSC' }],
  }
}

/** Os blocos do índice e as linhas de cada um, pela ordem em que aparecem. */
const blocos = (page: Page) => page.locator('main section').evaluateAll(seccoes =>
  seccoes.map(s => ({
    titulo: s.querySelector('h2')?.textContent?.trim() ?? '',
    linhas: Array.from(s.querySelectorAll('a')).map(a => a.querySelector('span span')?.textContent?.trim() ?? ''),
  })),
)

test('a direção vê os quatro blocos, pela ordem do que se vem cá fazer', async ({ page }) => {
  await montarSupabaseFalso(page, comoPapel('admin'))
  await page.goto('/csc-vet/clube')
  await expect(page.getByRole('heading', { level: 1, name: 'Clube' })).toBeVisible()

  expect(await blocos(page)).toEqual([
    { titulo: 'Equipa', linhas: ['Plantel'] },
    { titulo: 'Época', linhas: ['Eventos e convocatórias', 'Torneios e jornadas'] },
    { titulo: 'Direção', linhas: ['Financeiro e quotas', 'Relatórios'] },
    { titulo: 'Configuração', linhas: ['Adversários', 'Campos', 'Dados do clube'] },
  ])

  // O campo de casa já não é um cartão à parte: fica dito na linha dos campos.
  await expect(page.getByText('Campo principal')).toHaveCount(0)
  await expect(page.getByText('Campo de casa: Estádio Municipal')).toBeVisible()
})

test('os Relatórios abrem as contas por atleta', async ({ page }) => {
  await montarSupabaseFalso(page, comoPapel('admin'))
  await page.goto('/csc-vet/clube')
  await page.getByRole('link', { name: /Relatórios/ }).click()
  await expect(page).toHaveURL(/ver=relatorios$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Relatórios' })).toBeVisible()

  await page.getByRole('link', { name: /Contas por atleta/ }).click()
  await expect(page).toHaveURL(/ver=relatorios&relatorio=contas$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Contas por atleta' })).toBeFocused()

  await page.getByRole('button', { name: 'Relatórios', exact: true }).click()
  await expect(page).toHaveURL(/ver=relatorios$/)
})

test('o treinador não vê o bloco da direção, nem entra nos Relatórios pelo endereço', async ({ page }) => {
  await montarSupabaseFalso(page, comoPapel('coach'))
  await page.goto('/csc-vet/clube')
  await expect(page.getByRole('heading', { level: 1, name: 'Clube' })).toBeVisible()
  expect((await blocos(page)).map(b => b.titulo)).toEqual(['Equipa', 'Época', 'Configuração'])

  // Pelo endereço cai no índice, e não nas dívidas de toda a gente.
  await page.goto('/csc-vet/clube?ver=relatorios&relatorio=contas')
  await expect(page.getByRole('heading', { level: 1, name: 'Clube' })).toBeVisible()
  await expect(page.getByText('Contas por atleta')).toHaveCount(0)
})
