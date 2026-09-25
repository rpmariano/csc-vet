import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE } from './supabase-mock'

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

/**
 * O cabeçalho da app é um só, e fica preso ao topo ao rolar.
 *
 * Era da Home; os outros ecrãs desenhavam o canto no seu próprio cabeçalho.
 * Hoje é o `CabecalhoApp`, na moldura — o clube, a época e o canto — e, como
 * a barra de baixo, não sai do sítio quando a página rola.
 */
test.describe('O cabeçalho da app', () => {
  const plantel = Array.from({ length: 40 }, (_, i) => ({
    id: `p-${i}`, name: `Atleta Número ${i + 1}`, shirt_name: `Atleta ${i + 1}`,
    jersey_number: i + 1, status: 'active', role: 'player', roles: ['player'],
  }))

  test('é o mesmo em todos os ecrãs: clube, época e canto', async ({ page }) => {
    await montarSupabaseFalso(page, {})
    for (const url of ['/csc-vet/', '/csc-vet/calendar', '/csc-vet/competicao', '/csc-vet/clube']) {
      await page.goto(url)
      const cabecalho = page.locator('header.sticky')
      await expect(cabecalho).toHaveCount(1)
      await expect(cabecalho.getByText(/Veteranos$/)).toBeVisible()
      await expect(cabecalho.getByText(/^Época \d{4}\/\d{4}$/)).toBeVisible()
      await expect(cabecalho.getByRole('link', { name: /Comunicados/ })).toBeVisible()
      await expect(cabecalho.getByRole('link', { name: 'Ver o meu perfil' })).toBeVisible()
    }
  })

  test('fica preso ao topo ao rolar, e ganha fundo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await montarSupabaseFalso(page, { profiles: [...FIXTURES_BASE.profiles, ...plantel], v_players_public: [...FIXTURES_BASE.profiles, ...plantel] })
    await page.goto('/csc-vet/team-management')
    const cabecalho = page.locator('header.sticky')
    await expect(cabecalho).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.body.scrollHeight - window.innerHeight)).toBeGreaterThan(300)

    await page.evaluate(() => window.scrollTo(0, 600))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
    // Continua no topo da janela, e com fundo para o texto que passa por baixo.
    await expect.poll(async () => (await cabecalho.boundingBox())?.y).toBe(0)
    await expect.poll(() => cabecalho.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('a 390px, com o € no canto, o nome do clube cabe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await montarSupabaseFalso(page, {})
    await page.goto('/csc-vet/calendar')
    const cabecalho = page.locator('header.sticky')
    const nome = cabecalho.getByText(/Veteranos$/)
    await expect(nome).toBeVisible()
    // O pior caso: com o sinal de pagamentos no canto.
    await expect(cabecalho.getByRole('button').filter({ hasText: '€' })).toHaveCount(1)
    await page.evaluate(async () => { await document.fonts.ready })
    const corta = await nome.evaluate(el => el.scrollWidth > el.clientWidth)
    expect(corta).toBe(false)
  })
})
