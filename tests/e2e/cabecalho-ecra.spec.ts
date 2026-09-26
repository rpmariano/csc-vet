import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * O cabeçalho de cada ecrã é o mesmo, pela mesma ordem (decisão de
 * 2026-09-26): "‹ Origem", a linha da sobrancelha com o [+] no canto, e o
 * título.
 *
 * Havia onze formas. A linha da sobrancelha só existia com sobrancelha ou [+],
 * e o círculo de 48px esticava-a: o título caía colado ao "‹ Clube" nos
 * Torneios e 120px abaixo no Plantel. O [+] estava em cinco sítios — ao lado
 * da sobrancelha, ao lado da procura, numa barra por cima dela, numa barra no
 * meio do conteúdo, ou em lado nenhum —, e os Eventos não tinham título.
 */

const titulo = (page: Page) => page.getByRole('heading', { level: 1 }).first()

async function topoDoTitulo(page: Page, caminho: string) {
  await montarSupabaseFalso(page, {})
  await page.goto(`/csc-vet/${caminho}`)
  const h1 = titulo(page)
  await expect(h1).toBeVisible({ timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  const caixa = await h1.boundingBox()
  return Math.round(caixa!.y)
}

test('sem "‹", o título está à mesma altura em todos os ecrãs', async ({ page }) => {
  const alturas: Record<string, number> = {}
  for (const c of ['calendar', 'competicao', 'clube', 'team-management', 'events', 'finance', 'announcements']) {
    alturas[c] = await topoDoTitulo(page, c)
  }
  const valores = Object.values(alturas)
  expect(Math.max(...valores) - Math.min(...valores), JSON.stringify(alturas)).toBeLessThanOrEqual(1)
})

test('com "‹ Clube" ou "‹ Hoje", também — e mais abaixo só a altura do "‹"', async ({ page }) => {
  const alturas: Record<string, number> = {}
  for (const c of ['clube?ver=dados', 'clube?ver=campos', 'clube?ver=adversarios', 'clube?ver=torneios', 'settings']) {
    alturas[c] = await topoDoTitulo(page, c)
  }
  const valores = Object.values(alturas)
  expect(Math.max(...valores) - Math.min(...valores), JSON.stringify(alturas)).toBeLessThanOrEqual(1)
  expect(valores[0] - await topoDoTitulo(page, 'calendar')).toBe(44)
})

test('os Eventos têm título', async ({ page }) => {
  await montarSupabaseFalso(page, {})
  await page.goto('/csc-vet/events')
  await expect(page.getByRole('heading', { level: 1, name: 'Eventos' })).toBeVisible({ timeout: 15000 })
})

test('o [+] é sempre o círculo no canto da sobrancelha, por cima do título', async ({ page }) => {
  const posicoes: Record<string, { direita: number; acimaDoTitulo: boolean; largura: number }> = {}
  for (const [caminho, nome] of [
    ['events', 'Novo evento'],
    ['team-management', 'Adicionar membro ao plantel'],
    ['clube?ver=campos', 'Criar campo'],
    ['clube?ver=adversarios', 'Criar adversário'],
    ['clube?ver=torneios', 'Criar torneio'],
    ['announcements', 'Escrever comunicado'],
    ['finance?ver=charges', 'Novo encargo'],
  ] as const) {
    await montarSupabaseFalso(page, {})
    await page.goto(`/csc-vet/${caminho}`)
    const botao = page.getByRole('button', { name: nome, exact: true })
    await expect(botao).toBeVisible({ timeout: 15000 })
    const b = (await botao.boundingBox())!
    const t = (await titulo(page).boundingBox())!
    posicoes[caminho] = { direita: Math.round(b.x + b.width), acimaDoTitulo: b.y + b.height <= t.y + 1, largura: Math.round(b.width) }
  }
  for (const [caminho, p] of Object.entries(posicoes)) {
    expect(p.acimaDoTitulo, caminho).toBe(true)
    expect(p.largura, caminho).toBe(48)
  }
  const direitas = Object.values(posicoes).map(p => p.direita)
  expect(Math.max(...direitas) - Math.min(...direitas), JSON.stringify(posicoes)).toBeLessThanOrEqual(1)
})
