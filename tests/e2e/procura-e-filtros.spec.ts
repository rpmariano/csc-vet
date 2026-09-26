import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, type Fixtures } from './supabase-mock'

/**
 * "Procura à vista, tudo o resto atrás do funil" (vaga 5 da auditoria de
 * design, 2026-09-26).
 *
 * Os Comunicados e os Torneios tinham o estado num controlo segmentado à
 * vista — cada um com o seu desenho —, e os Movimentos o período em dois
 * seletores soltos, sem resumo nem "Limpar". Passaram ao `ProcuraEFiltros`:
 * o funil acende quando se mexe, o que está filtrado escreve-se por baixo, e
 * a linha de resumo limpa tudo.
 */

async function abre(page: Page, caminho: string, fixtures: Fixtures) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(`/csc-vet/${caminho}`)
}

const base = { content: 'Texto.', created_at: new Date().toISOString(), priority: 'normal', author_id: null }
const COMUNICADOS = [
  { ...base, id: 'a1', title: 'Treino mudou de campo', is_active: true },
  { ...base, id: 'a2', title: 'Jantar de Natal', is_active: false },
]

test('comunicados: o estado vai para o funil, e o resumo limpa-o', async ({ page }) => {
  await abre(page, 'announcements', { announcements: COMUNICADOS })

  const funil = page.getByRole('button', { name: 'Filtros', exact: true })
  await expect(funil).toBeVisible({ timeout: 15000 })
  // O controlo segmentado à vista saiu.
  await expect(page.getByRole('button', { name: /^Ativos/ })).toHaveCount(0)

  await funil.click()
  const persiana = page.getByRole('dialog', { name: 'Filtrar comunicados' })
  await persiana.getByRole('button', { name: /^Inativos/ }).click()
  await persiana.getByRole('button', { name: /^Ver / }).click()

  await expect(page.getByRole('button', { name: 'Filtros (ativos)' })).toBeVisible()
  const resumo = page.getByRole('button', { name: /Inativos · 1 comunicado.*Limpar/ })
  await expect(resumo).toBeVisible()
  await expect(page.getByText('Jantar de Natal')).toBeVisible()
  await expect(page.getByText('Treino mudou de campo')).toHaveCount(0)

  await resumo.click()
  await expect(page.getByText('Treino mudou de campo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible()
})

test('a procura conta como filtro e escreve-se no resumo', async ({ page }) => {
  await abre(page, 'announcements', { announcements: COMUNICADOS })
  const campo = page.getByRole('searchbox', { name: 'Procurar nos comunicados' })
  await expect(campo).toBeVisible({ timeout: 15000 })
  await campo.fill('jantar')
  await expect(page.getByRole('button', { name: /"jantar" · 1 comunicado/ })).toBeVisible()
})

test('torneios: o estado deixou de estar à vista', async ({ page }) => {
  await abre(page, 'clube?ver=torneios', {
    tournaments: [
      { id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo' },
      { id: 't2', name: 'Taça de Inverno', season: '2025/2026', status: 'terminado' },
    ],
  })
  await expect(page.getByRole('searchbox', { name: 'Procurar torneios' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'terminado', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  await page.getByRole('dialog', { name: 'Filtrar torneios' }).getByRole('button', { name: 'Terminados' }).click()
  await page.getByRole('dialog', { name: 'Filtrar torneios' }).getByRole('button', { name: /^Ver / }).click()

  await expect(page.getByRole('button', { name: /Terminados · 1 de 2/ })).toBeVisible()
  await expect(page.getByText('Liga Masters +35')).toHaveCount(0)
})
