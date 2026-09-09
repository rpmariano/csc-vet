import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, UTILIZADOR_TESTE } from './supabase-mock'

/**
 * Um ecrã abre sempre no topo.
 *
 * Numa app de página única o browser não repõe o scroll: quem estava no fim da
 * Agenda e tocava no Plantel caía a meio da lista, sem cabeçalho e sem
 * perceber onde estava. O `<SubirAoTopo>` trata disso — e este teste é o que
 * impede que uma mexida nas rotas o leve pela frente sem nada dar por isso.
 */

const perfil = {
  id: UTILIZADOR_TESTE.id,
  name: 'Utilizador de Teste',
  email: UTILIZADOR_TESTE.email,
  role: 'admin',
  status: 'active',
  jersey_number: 99,
  shirt_name: 'Teste',
  position: 'Médio Centro',
  roles: ['admin', 'player'],
}

/* Gente que chegue para a página ficar mais alta do que o ecrã. */
const plantel = Array.from({ length: 40 }, (_, i) => ({
  id: `p-${i}`,
  name: `Atleta Número ${i + 1}`,
  shirt_name: `Atleta ${i + 1}`,
  jersey_number: i + 1,
  status: 'active',
  role: 'player',
  roles: ['player'],
}))

const scroll = (pagina: Page) => pagina.evaluate(() => window.scrollY)

/*
  Esperar que a página tenha mesmo altura para rolar antes de a rolar: a lista
  chega da rede depois do cabeçalho, e sem esta espera o teste rolava uma
  página que ainda cabia toda no ecrã e concluía que o scroll não funcionava.
*/
async function desceAoFundo(pagina: Page) {
  await expect
    .poll(() => pagina.evaluate(() => document.body.scrollHeight - window.innerHeight))
    .toBeGreaterThan(50)
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect.poll(() => pagina.evaluate(() => window.scrollY)).toBeGreaterThan(0)
}

test.beforeEach(async ({ page }) => {
  await montarSupabaseFalso(page, {
    profiles: [perfil, ...plantel],
    v_players_public: [perfil, ...plantel],
  })
})

test('mudar de ecrã pela barra abre no topo', async ({ page }) => {
  await page.goto('/csc-vet/team-management')
  await expect(page.getByRole('heading', { name: 'Plantel' }).first()).toBeVisible()
  await desceAoFundo(page)

  await page.getByRole('link', { name: /Clube/ }).click()
  await expect(page).toHaveURL(/clube$/)
  await expect.poll(() => scroll(page)).toBe(0)
})

test('trocar de secção dentro do Clube abre no topo', async ({ page }) => {
  await page.goto('/csc-vet/clube')
  await expect(page.getByRole('heading', { name: 'Clube' })).toBeVisible()
  await desceAoFundo(page)

  await page.getByRole('link', { name: /Plantel/ }).click()
  await expect(page).toHaveURL(/team-management$/)
  await expect.poll(() => scroll(page)).toBe(0)
})

/*
  A contrapartida: uma persiana de detalhe abre por cima da lista, e fechá-la
  tem de devolver a pessoa ao sítio de onde a abriu. Se o salto ao topo também
  valesse aqui, perdia-se o lugar a cada ficha que se espreitasse.
*/
test('abrir e fechar uma ficha não perde o lugar na lista', async ({ page }) => {
  await page.goto('/csc-vet/team-management')
  await expect(page.getByRole('heading', { name: 'Plantel' }).first()).toBeVisible()
  await desceAoFundo(page)
  const antes = await scroll(page)

  await page.getByRole('button', { name: /^Ver a ficha/ }).last().click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(1)
  await page.goBack()
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)

  expect(await scroll(page)).toBe(antes)
})
