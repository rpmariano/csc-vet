import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE } from './supabase-mock'

const DAQUI_A_DIAS = (d: number, horas = '20:30') => {
  const dt = new Date(Date.now() + d * 864e5)
  const [hh, mm] = horas.split(':').map(Number)
  dt.setHours(hh, mm, 0, 0)
  return dt.toISOString()
}

const base = {
  location: 'Campo de Treino CSC',
  description: null,
  field_id: null,
  tournament_id: null,
  home_away: 'home',
  is_friendly: false,
  max_players: null,
  meeting_time: null,
  home_score: null,
  away_score: null,
  is_active: true,
}

const EU = FIXTURES_BASE.profiles[0] as Record<string, unknown>
const meuCallup = (eventId: string) => ({
  id: 'c-' + eventId,
  event_id: eventId,
  player_id: UTILIZADOR_TESTE.id,
  status: 'called',
  responded_at: null,
  player: EU,
})

const fichaDoEvento = (page: import('@playwright/test').Page) => page.getByRole('region').first()

test.describe('Interface da App: Sondagem acoplada no detalhe do evento', () => {
  test('mostra a sondagem de disponibilidade do jogo no ecrã do treino quando antecede um jogo', async ({ page }) => {
    const treino = { ...base, id: 'tr', type: 'practice', date_time: DAQUI_A_DIAS(1, '20:30'), title: 'Treino Terça' }
    const jogo = {
      ...base,
      id: 'jg',
      type: 'match',
      date_time: DAQUI_A_DIAS(4, '16:00'),
      title: 'Jogo de Sábado',
      opponent: { name: 'Estrelas Lisboa', initials: 'ELIS' },
      location: 'Campo dos Olivais',
    }
    const proximoTreino = { ...base, id: 'tr2', type: 'practice', date_time: DAQUI_A_DIAS(8, '20:30'), title: 'Treino Seg' }

    await montarSupabaseFalso(page, {
      events: [treino, jogo, proximoTreino],
      callups: [meuCallup('tr')],
    })

    await page.goto(`/csc-vet/calendar?event=tr`)
    await page.waitForLoadState('networkidle')

    const modal = fichaDoEvento(page)
    await expect(modal).toBeVisible()

    // Deve mostrar o bloco da sondagem acoplada dentro do modal do treino
    await expect(modal.getByText(/Sondagem acoplada ao treino/i)).toBeVisible()
    await expect(modal.getByText(/Estás disponível para ser convocado para este jogo\?/i)).toBeVisible()
    await expect(modal.getByRole('button', { name: /Sim, disponível/i })).toBeVisible()
    await expect(modal.getByRole('button', { name: /Não disponível/i })).toBeVisible()

    // O jogador clica em "Sim, disponível"
    await modal.getByRole('button', { name: /Sim, disponível/i }).click()

    // Deve atualizar o indicador de resposta
    await expect(modal.getByText(/Marcaste presença como disponível para o jogo/i)).toBeVisible()
  })

  test('não mostra a sondagem acoplada quando não há jogo antes do próximo treino', async ({ page }) => {
    const treino1 = { ...base, id: 'tr1', type: 'practice', date_time: DAQUI_A_DIAS(1, '20:30'), title: 'Treino Terça' }
    const treino2 = { ...base, id: 'tr2', type: 'practice', date_time: DAQUI_A_DIAS(3, '20:30'), title: 'Treino Quinta' }
    const jogo = {
      ...base,
      id: 'jg',
      type: 'match',
      date_time: DAQUI_A_DIAS(5, '16:00'),
      title: 'Jogo de Sábado',
      opponent: { name: 'Estrelas Lisboa', initials: 'ELIS' },
      location: 'Campo dos Olivais',
    }

    await montarSupabaseFalso(page, {
      events: [treino1, treino2, jogo],
      callups: [meuCallup('tr1')],
    })

    await page.goto(`/csc-vet/calendar?event=tr1`)
    await page.waitForLoadState('networkidle')

    const modal = fichaDoEvento(page)
    await expect(modal).toBeVisible()

    // No treino 1, não há jogo antes do próximo treino (que é quinta), por isso não mostra a sondagem acoplada
    await expect(modal.getByText(/Sondagem acoplada ao treino/i)).toHaveCount(0)
  })
})
