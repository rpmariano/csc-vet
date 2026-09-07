import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE, type Fixtures } from './supabase-mock'

/**
 * Quando é que a convocatória aceita respostas.
 *
 * A regra vive em `convocatoriaFechada()`, no CalendarPage, e estava escrita
 * por extenso em quatro sítios que já divergiam entre si. Em resumo:
 *
 * - **Os treinos não se respondem**, nunca. São semanais e convocam
 *   automaticamente todos os aptos; pedir confirmação semana após semana só
 *   ensinava a ignorar o pedido. Antes abriam seis dias antes.
 * - **Tudo o resto abre** assim que o evento deixa de ser rascunho e tem gente
 *   convocada.
 * - E fecha com a ficha de jogo lançada, ou passada a hora de concentração.
 */

const DAQUI_A_DIAS = (d: number) => new Date(Date.now() + d * 864e5).toISOString()

const base = {
  location: 'Campo de Teste', description: null, field_id: null, tournament_id: null,
  home_away: 'home', is_friendly: false, max_players: null, meeting_time: null,
  home_score: null, away_score: null, is_active: true,
}

const EU = FIXTURES_BASE.profiles[0] as Record<string, unknown>
const convocatoriaMinha = (eventId: string) => ({
  id: 'c-' + eventId, event_id: eventId, player_id: UTILIZADOR_TESTE.id,
  status: 'called', responded_at: null, player: EU,
})

/** O bloco de resposta, na persiana do evento. */
const perguntaDaConvocatoria = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog').getByText(/Contamos contigo\?|Disseste que (sim|não)/)

async function abre(page: import('@playwright/test').Page, fixtures: Fixtures, id: string) {
  await montarSupabaseFalso(page, fixtures)
  await page.goto(`/csc-vet/calendar?event=${id}`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('num treino não se pergunta nada, mesmo à porta', async ({ page }) => {
  const treino = { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(1) }
  await abre(page, { events: [treino], callups: [convocatoriaMinha('tr')] }, 'tr')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  // E também não fica um estado a dizer que está fechada: não se mostra nada.
  await expect(page.getByRole('dialog').getByText(/A tua convocatória para este evento/)).toHaveCount(0)
})

test('num jogo publicado e com convocados, pergunta-se', async ({ page }) => {
  const jogo = { ...base, id: 'jg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [jogo], callups: [convocatoriaMinha('jg')] }, 'jg')

  // Vinte dias antes: com a regra antiga só abriria a seis dias.
  await expect(perguntaDaConvocatoria(page)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sim' })).toBeVisible()
})

test('num convívio, o mesmo que num jogo', async ({ page }) => {
  const convivio = { ...base, id: 'cv', title: 'Jantar', type: 'gathering', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [convivio], callups: [convocatoriaMinha('cv')] }, 'cv')

  await expect(perguntaDaConvocatoria(page)).toBeVisible()
})

test('um rascunho não aceita resposta', async ({ page }) => {
  const rascunho = { ...base, id: 'rs', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20), is_active: false }
  await abre(page, { events: [rascunho], callups: [convocatoriaMinha('rs')] }, 'rs')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/Em rascunho/)).toBeVisible()
})

test('sem ninguém convocado não há a quem perguntar', async ({ page }) => {
  const jogo = { ...base, id: 'vz', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
  await abre(page, { events: [jogo], callups: [] }, 'vz')

  await expect(perguntaDaConvocatoria(page)).toHaveCount(0)
  await expect(page.getByRole('dialog').getByText(/Convocatória por fazer/)).toBeVisible()
})

/**
 * O alerta de eventos por convocar, na Home de quem gere (ecrã 4c).
 *
 * Tinha uma janela de sete dias e por isso calava-se precisamente no caso que
 * interessa: um jogo marcado com duas semanas de antecedência ficava sem
 * convocatória e sem aviso. O caso a vinte dias está aqui de propósito — com
 * a janela, este teste falha.
 */
test.describe('Alerta de eventos por convocar', () => {
  const faixa = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /evento[s]? sem convocatória/ })

  async function home(page: import('@playwright/test').Page, fixtures: Fixtures) {
    await montarSupabaseFalso(page, fixtures)
    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
  }

  test('avisa de um jogo a vinte dias sem ninguém convocado', async ({ page }) => {
    const jogo = { ...base, id: 'lg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
    await home(page, { events: [jogo], callups: [] })
    await expect(faixa(page)).toBeVisible()
  })

  test('cala-se quando já há convocados', async ({ page }) => {
    const jogo = { ...base, id: 'lg', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20) }
    await home(page, { events: [jogo], callups: [convocatoriaMinha('lg')] })
    await expect(faixa(page)).toHaveCount(0)
  })

  test('não avisa de rascunhos nem de treinos', async ({ page }) => {
    await home(page, {
      events: [
        { ...base, id: 'rs', title: 'Jogo', type: 'match', date_time: DAQUI_A_DIAS(20), is_active: false },
        { ...base, id: 'tr', title: 'Treino', type: 'practice', date_time: DAQUI_A_DIAS(20) },
      ],
      callups: [],
    })
    await expect(faixa(page)).toHaveCount(0)
  })
})
