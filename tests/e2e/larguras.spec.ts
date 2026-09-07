/**
 * A mesma app em janela estreita e larga.
 *
 * O redesenho de 2026 acabou com a UI de computador: num ecrã largo é a mesma
 * app de telemóvel, numa coluna de 480px ao meio. A regra de trabalho no
 * CLAUDE.md diz que qualquer alteração de UI tem de ser vista nas duas
 * larguras, e que uma diferença entre elas é um bug. Isto verifica-o sozinho.
 *
 * Compara, para cada ecrã: o **texto visível** (que apanha conteúdo a mais ou
 * a menos numa das larguras), a **largura e o centro da coluna**, e se a
 * página faz **scroll lateral** — que nunca deve fazer, porque o que é largo
 * de mais tem de rolar dentro do seu próprio contentor.
 *
 * Apanhou duas coisas ao ser escrito, ambas restos do tempo das duas UIs: o
 * separador dos torneios empurrava a página para fora da janela estreita
 * (faltava-lhe um `min-w-0`), e a convocatória no detalhe do evento abria
 * conforme `window.innerWidth >= 640` — a mesma persiana mostrava a lista de
 * convocados num ecrã e escondia-a no outro.
 *
 * Corre uma vez só: o teste põe as larguras que quer, portanto repeti-lo no
 * projeto do telemóvel não acrescentava nada e demorava o dobro.
 */
import { test, expect, type Page } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE } from './supabase-mock'

// Corre uma vez: o teste é que põe as larguras, portanto repeti-lo no projeto
// do telemóvel não acrescentava nada e demorava o dobro.
test.beforeEach(({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'desktop', 'Corre só uma vez.')
  // Dezoito ecrãs a duas larguras, com os workers a partilhar um só Vite: o
  // limite de 30s por teste do Playwright não chega, e falhava só quando
  // corria com o resto da suite.
  testInfo.setTimeout(240_000)
})

const AMANHA = new Date(Date.now() + 3 * 864e5).toISOString()
const ONTEM = new Date(Date.now() - 3 * 864e5).toISOString()

const COLEGA = {
  id: '00000000-0000-4000-8000-000000000009', name: 'Rui Bandarra', nickname: 'Rui',
  shirt_name: 'RUI', jersey_number: 8, position: 'MDC, ME', status: 'active',
  role: 'player', roles: ['player'], photo_url: null, birth_date: '1979-09-14',
}

const FIXTURES = {
  fields: [{ id: 'f1', name: 'Estádio Municipal', address: 'Rua da Bela Vista, Cascais' }],
  opponents: [{ id: 'o1', name: 'Sesimbra Veteranos', initials: 'SES', logo_url: null, home_field_id: 'f1' }],
  tournaments: [{ id: 't1', name: 'Liga Setúbal', season: '25/26', status: 'a_decorrer' }],
  club_settings: [{ id: 1, home_field_id: 'f1', club_name: 'GDS Cascais', initials: 'CSC' }],
  events: [
    { id: 'e1', title: 'Jogo', type: 'match', date_time: AMANHA, location: 'Estádio', opponent_id: 'o1',
      tournament_id: 't1', field_id: 'f1', home_away: 'home', is_active: true, home_score: null, away_score: null },
    { id: 'e2', title: 'Treino', type: 'practice', date_time: AMANHA, location: 'Estádio',
      field_id: 'f1', is_active: true, home_score: null, away_score: null },
    { id: 'j1', title: 'Jogo antigo', type: 'match', date_time: ONTEM, location: 'Estádio', opponent_id: 'o1',
      tournament_id: 't1', home_away: 'home', is_active: true, home_score: 3, away_score: 1 },
  ],
  callups: [
    { id: 'c1', event_id: 'e2', player_id: COLEGA.id, status: 'confirmed', responded_at: ONTEM, player: COLEGA },
    { id: 'c2', event_id: 'e2', player_id: UTILIZADOR_TESTE.id, status: 'called', responded_at: null, player: FIXTURES_BASE.profiles[0] },
  ],
  v_players_public: [...FIXTURES_BASE.v_players_public, COLEGA],
  announcements: [{ id: 'a1', title: 'Aviso', content: 'Corpo do aviso', created_at: ONTEM, is_active: true, priority: 'normal' }],
}

const ECRAS = [
  ['Hoje', '/csc-vet/'],
  ['Agenda', '/csc-vet/calendar'],
  ['Eventos', '/csc-vet/events'],
  ['Competição · classificações', '/csc-vet/competicao?ver=classificacoes'],
  ['Competição · fichas', '/csc-vet/competicao?ver=fichas'],
  ['Competição · estatísticas', '/csc-vet/competicao?ver=estatisticas'],
  ['Plantel', '/csc-vet/team-management'],
  ['Clube', '/csc-vet/clube'],
  ['Backoffice · clube', '/csc-vet/admin?ver=club'],
  ['Backoffice · campos', '/csc-vet/admin?ver=fields'],
  ['Backoffice · adversários', '/csc-vet/admin?ver=opponents'],
  ['Backoffice · torneios', '/csc-vet/admin?ver=tournaments'],
  ['Financeiro', '/csc-vet/finance'],
  ['Comunicados', '/csc-vet/announcements'],
  ['Definições', '/csc-vet/settings'],
  ['Detalhe do evento', '/csc-vet/calendar?event=e2'],
  ['Ficha do adversário', '/csc-vet/admin?ver=opponents&adversario=o1'],
  ['Ficha do campo', '/csc-vet/admin?ver=fields&campo=f1'],
] as const

/** O que se compara: texto visível, largura da coluna, e se a página faz scroll lateral. */
async function medir(page: Page) {
  const texto = (await page.locator('body').innerText())
    // As horas mudam entre as duas medições e não são diferença de layout.
    .replace(/\d{1,2}:\d{2}/g, 'HH:MM')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n')

  const metricas = await page.evaluate(() => {
    const root = document.getElementById('root')
    const r = root?.getBoundingClientRect()
    return {
      larguraColuna: r ? Math.round(r.width) : -1,
      centrado: r ? Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) <= 1 : false,
      scrollLateral: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })
  return { texto, ...metricas }
}

test('todos os ecrãs iguais em janela estreita e larga', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  const problemas: string[] = []

  for (const [nome, caminho] of ECRAS) {
    await page.setViewportSize({ width: 390, height: 850 })
    await page.goto(caminho)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(250)
    const estreita = await medir(page)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(400)
    const larga = await medir(page)

    if (estreita.texto !== larga.texto) {
      const a = estreita.texto.split('\n'), b = larga.texto.split('\n')
      const soEstreita = a.filter(l => !b.includes(l)).slice(0, 4)
      const soLarga = b.filter(l => !a.includes(l)).slice(0, 4)
      problemas.push(`${nome}: conteúdo diferente\n    só estreita: ${JSON.stringify(soEstreita)}\n    só larga:    ${JSON.stringify(soLarga)}`)
    }
    if (larga.larguraColuna > 480) {
      problemas.push(`${nome}: coluna com ${larga.larguraColuna}px em janela larga (máximo 480)`)
    }
    if (!larga.centrado) problemas.push(`${nome}: coluna não centrada em janela larga`)
    if (estreita.scrollLateral) problemas.push(`${nome}: scroll lateral em janela estreita`)
    if (larga.scrollLateral) problemas.push(`${nome}: scroll lateral em janela larga`)
  }

  console.log(problemas.length ? 'PROBLEMAS:\n- ' + problemas.join('\n- ') : 'PROBLEMAS: nenhum')
  expect(problemas, problemas.join('\n')).toEqual([])
})

/** Os ecrãs que abrem por cima: persianas, folhas e diálogos. */
const SOBREPOSTOS: [string, string, (p: Page) => Promise<void>][] = [
  ['Folha do [+]', '/csc-vet/calendar', async p => { await p.getByRole('button', { name: /Criar|Novo/ }).first().click({ timeout: 4000 }) }],
  ['Filtros da Agenda', '/csc-vet/calendar', async p => { await p.getByRole('button', { name: /filtros/i }).first().click({ timeout: 4000 }) }],
  ['Ficha do convocado', '/csc-vet/calendar?event=e2', async p => {
    await p.getByRole('button', { name: /Convocatória/ }).first().click({ timeout: 4000 })
    await p.getByRole('button', { name: /Ver .* na convocatória/ }).first().click({ timeout: 4000 })
  }],
  ['Confirmar eliminar', '/csc-vet/calendar?event=e2', async p => { await p.getByRole('button', { name: /Eliminar evento/ }).click({ timeout: 4000 }) }],
  ['Ficha de atleta', '/csc-vet/team-management', async p => { await p.getByRole('button', { name: /^Ver a ficha de / }).first().click({ timeout: 4000 }) }],
  ['Dossier de convocatória', '/csc-vet/events', async p => { await p.getByRole('button', { name: /Ver Detalhes & RSVP/ }).first().click({ timeout: 4000 }) }],
]

test('sobrepostos iguais em janela estreita e larga', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  const problemas: string[] = []

  for (const [nome, caminho, abrir] of SOBREPOSTOS) {
    for (const largura of [390, 1440]) {
      await page.setViewportSize({ width: largura, height: 850 })
      await page.goto(caminho)
      await page.waitForLoadState('networkidle')
      try { await abrir(page) } catch { problemas.push(`${nome}: não abriu a ${largura}px`); continue }
      await page.waitForTimeout(400)

      const m = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]') as HTMLElement | null
        const r = d?.getBoundingClientRect()
        return {
          existe: Boolean(d),
          largura: r ? Math.round(r.width) : -1,
          centrado: r ? Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) <= 2 : false,
          scrollLateral: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }
      })
      if (!m.existe) { problemas.push(`${nome}: sem diálogo a ${largura}px`); continue }
      if (m.largura > 480) problemas.push(`${nome}: ${m.largura}px de largura a ${largura}px (máximo 480)`)
      if (!m.centrado) problemas.push(`${nome}: não centrado a ${largura}px`)
      if (m.scrollLateral) problemas.push(`${nome}: scroll lateral a ${largura}px`)
    }
  }

  console.log(problemas.length ? 'SOBREPOSTOS:\n- ' + problemas.join('\n- ') : 'SOBREPOSTOS: nenhum problema')
  expect(problemas, problemas.join('\n')).toEqual([])
})
