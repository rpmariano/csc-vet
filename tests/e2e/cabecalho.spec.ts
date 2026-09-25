import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * O canto do cabeçalho é o mesmo em todos os ecrãs.
 *
 * O estado clínico e o sino dos comunicados viviam só na Home: nos outros
 * ecrãs ficava a fotografia sozinha, e um comunicado novo não tinha por onde
 * ser visto sem passar pela Home.
 */
test.describe('O cabeçalho é o mesmo em todo o lado', () => {
  const ECRAS = [
    ['Hoje', '/csc-vet/'],
    ['Agenda', '/csc-vet/calendar'],
    ['Plantel', '/csc-vet/team-management'],
    ['Competição', '/csc-vet/competicao'],
    ['Clube', '/csc-vet/clube'],
  ] as const

  for (const [nome, url] of ECRAS) {
    test(`${nome}: estado, sino e fotografia`, async ({ page }) => {
      await montarSupabaseFalso(page, {})
      await page.goto(url)
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Apto', { exact: true }).first()).toBeVisible()
      // O sino é uma ligação: leva ao ecrã dos Comunicados.
      await expect(page.getByRole('link', { name: /Comunicados/ }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ver o meu perfil' }).first()).toBeVisible()
    })
  }
})

/**
 * O sino leva ao ecrã dos Comunicados, e é lá que se leem.
 *
 * Até 2026-09-25 abria uma persiana com a mesma lista que o ecrã tinha, e o
 * ecrã era só da gestão. Hoje é uma porta só: quem só lê chega lá pelo sino,
 * vê o que era novo marcado, e o sino apaga-se.
 */
test.describe('O sino dos comunicados', () => {
  const comunicado = {
    id: 'a1', title: 'Treino mudou de campo', content: 'Esta semana treinamos no sintético.',
    published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    is_active: true, priority: 'normal',
  }

  test('tocar no sino abre o ecrã, e é lá que o comunicado se lê', async ({ page }) => {
    await montarSupabaseFalso(page, { announcements: [comunicado] })
    await page.goto('/csc-vet/calendar')

    const sino = page.getByRole('link', { name: /Comunicados — 1 por ler/ }).first()
    await expect(sino).toBeVisible()
    await sino.click()

    await expect(page).toHaveURL(/\/announcements$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Comunicados' })).toBeVisible()
    await expect(page.getByText('Esta semana treinamos no sintético.')).toBeVisible()
    await expect(page.getByText('Novo', { exact: true })).toBeVisible()
    await expect(page.locator('[role="dialog"]')).toHaveCount(0)

    // Abrir o ecrã é lê-lo: o sino deixa de dizer que há por ler.
    await expect(page.getByRole('link', { name: 'Comunicados', exact: true }).first()).toBeVisible()
  })
})
