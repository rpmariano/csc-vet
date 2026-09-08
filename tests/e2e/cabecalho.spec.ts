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
      await expect(page.getByRole('button', { name: /Comunicados/ }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ver o meu perfil' }).first()).toBeVisible()
    })
  }
})
