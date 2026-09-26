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

/**
 * Uma forma só de filtrar (decisão de 2026-09-26). Havia três: a procura com
 * funil, os mosaicos com um "Limpar Filtro" à parte, e nas Classificações um
 * botão com ar de etiqueta ("AGENDADOS E ATIVOS ⌃") com o organizador colado.
 * Todos os ecrãs de lista têm agora o mesmo funil, com o mesmo nome.
 */
const EU_ID = '00000000-0000-4000-8000-000000000001'
const amanha = new Date(Date.now() + 864e5).toISOString()

for (const [ecra, caminho] of [
  ['Agenda', 'calendar'],
  ['Eventos', 'events'],
  ['Fichas de Jogo', 'competicao?ver=fichas'],
  ['Estatísticas', 'competicao?ver=estatisticas'],
  ['Plantel', 'team-management'],
  ['Contas por atleta', 'clube?ver=relatorios&relatorio=contas'],
] as const) {
  test(`${ecra}: o funil é o mesmo, e apagado no ponto de partida`, async ({ page }) => {
    await abre(page, caminho, {})
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible({ timeout: 15000 })
  })
}

test('classificações: o estado das provas vai para o funil, e o organizador sai de ao pé dele', async ({ page }) => {
  await abre(page, 'competicao', {
    tournaments: [
      { id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo', organizer_name: 'Sideline', created_at: '2026-09-01' },
      { id: 't2', name: 'Taça de Inverno', season: '2025/2026', status: 'terminado', organizer_name: null, created_at: '2025-09-01' },
    ],
  })
  const funil = page.getByRole('button', { name: 'Filtros', exact: true })
  await expect(funil).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Agendados e ativos/i })).toHaveCount(0)
  await expect(page.getByText('Organização: Sideline')).toBeVisible()

  await funil.click()
  const persiana = page.getByRole('dialog', { name: 'Filtrar provas' })
  await persiana.getByRole('button', { name: 'Terminadas' }).click()
  await persiana.getByRole('button', { name: /^Ver / }).click()

  await expect(page.getByRole('button', { name: 'Filtros (ativos)' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Taça de Inverno/ })).toBeVisible()
  await page.getByRole('button', { name: /Terminadas · 1 prova.*Limpar/ }).click()
  await expect(page.getByRole('button', { name: /Liga Masters \+35/ })).toBeVisible()
})

test('mosaicos: tocar no aceso volta a todos, e não há "Limpar Filtro"', async ({ page }) => {
  const outro = { id: 'o1', name: 'Outro Jogador', role: 'player', roles: ['player'], status: 'active', jersey_number: 5 }
  await abre(page, 'events?convocatoria=e1', {
    events: [{ id: 'e1', title: 'Jogo', type: 'match', date_time: amanha, is_active: true, home_away: 'home', is_friendly: true }],
    v_players_public: [outro],
    callups: [
      { id: 'c1', event_id: 'e1', player_id: 'o1', status: 'confirmed', player: outro },
      { id: 'c2', event_id: 'e1', player_id: EU_ID, status: 'called', player: { id: EU_ID, name: 'Utilizador de Teste' } },
    ],
  })
  const confirmados = page.getByRole('button', { name: /^Confirmados/ })
  await expect(confirmados).toBeVisible({ timeout: 15000 })
  await confirmados.click()
  await expect(confirmados).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Limpar Filtro/ })).toHaveCount(0)

  await confirmados.click()
  await expect(confirmados).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: /^Todos/ })).toHaveAttribute('aria-pressed', 'true')
})
