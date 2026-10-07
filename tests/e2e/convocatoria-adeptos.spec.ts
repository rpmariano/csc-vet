import { test, expect } from '@playwright/test'
import { montarSupabaseFalso, FIXTURES_BASE, UTILIZADOR_TESTE } from './supabase-mock'

const DAQUI_A_DIAS = (d: number) => new Date(Date.now() + d * 864e5).toISOString()

const PERFIL_ADEPTO = {
  ...FIXTURES_BASE.profiles[0],
  id: UTILIZADOR_TESTE.id,
  name: 'Adepto Silva',
  shirt_name: null,
  jersey_number: null,
  role: 'supporter',
  roles: ['supporter'],
  status: 'active',
}

const JOGADOR_1 = {
  id: 'j1',
  name: 'Carlos Avançado',
  shirt_name: 'Carlos',
  jersey_number: 9,
  role: 'player',
  roles: ['player'],
  status: 'active',
}

const JOGO = {
  id: 'jogo-1',
  title: 'Jogo Amigável',
  type: 'match',
  date_time: DAQUI_A_DIAS(2),
  meeting_time: '09:00:00',
  location: 'Campo de Cascais',
  field_id: null,
  tournament_id: null,
  home_away: 'home',
  is_friendly: true,
  max_players: 18,
  home_score: null,
  away_score: null,
  is_active: true,
  opponent: { id: 'opp-1', name: 'Estoril Praia', initials: 'EP', logo_url: null },
}

test.describe('Convocatória de Adeptos para Jogos', () => {
  test('adepto vê "Vem apoiar-nos em mais um jogo!" no cartão do jogo na Home e confirma presença', async ({ page }) => {
    const callupJogador = {
      id: 'c-j1',
      event_id: 'jogo-1',
      player_id: 'j1',
      status: 'called',
      player: JOGADOR_1,
    }
    const callupAdepto = {
      id: 'c-adepto-1',
      event_id: 'jogo-1',
      player_id: PERFIL_ADEPTO.id,
      status: 'called',
      player: PERFIL_ADEPTO,
    }

    await montarSupabaseFalso(page, {
      profiles: [PERFIL_ADEPTO, JOGADOR_1],
      v_players_public: [PERFIL_ADEPTO, JOGADOR_1],
      events: [JOGO],
      callups: [callupJogador, callupAdepto],
    })

    await page.goto('/csc-vet/')
    await page.waitForLoadState('networkidle')

    // Deve ver o convite especial para adeptos
    await expect(page.getByText('Vem apoiar-nos em mais um jogo!')).toBeVisible({ timeout: 10000 })
    const botaoApoiar = page.getByRole('button', { name: 'Vou apoiar' })
    await expect(botaoApoiar).toBeVisible()

    // Clica no botão para confirmar presença
    await botaoApoiar.click()

    // Deve ver o toast de confirmação e a mensagem de apoio confirmada
    await expect(page.getByText('Presença confirmada! Obrigado pelo apoio.')).toBeVisible()
    await expect(page.getByText('Contamos com o teu apoio!')).toBeVisible()
  })

  test('adepto vê convite e confirma presença no ecrã do jogo na Agenda', async ({ page }) => {
    const callupJogador = {
      id: 'c-j1',
      event_id: 'jogo-1',
      player_id: 'j1',
      status: 'called',
      player: JOGADOR_1,
    }
    const callupAdepto = {
      id: 'c-adepto-1',
      event_id: 'jogo-1',
      player_id: PERFIL_ADEPTO.id,
      status: 'called',
      player: PERFIL_ADEPTO,
    }

    await montarSupabaseFalso(page, {
      profiles: [PERFIL_ADEPTO, JOGADOR_1],
      v_players_public: [PERFIL_ADEPTO, JOGADOR_1],
      events: [JOGO],
      callups: [callupJogador, callupAdepto],
    })

    await page.goto('/csc-vet/calendar?event=jogo-1')
    await page.waitForLoadState('networkidle')

    const regiao = page.getByRole('region').first()
    await expect(regiao).toBeVisible({ timeout: 10000 })

    // Deve ver o convite especial
    await expect(regiao.getByText('Vem apoiar-nos em mais um jogo!')).toBeVisible()
    const botaoApoiar = regiao.getByRole('button', { name: 'Vou apoiar' })
    await expect(botaoApoiar).toBeVisible()

    // Confirma presença
    await botaoApoiar.click()
    await expect(page.getByText('Presença confirmada! Obrigado pelo apoio.')).toBeVisible()
    await expect(regiao.getByText('Contamos com o teu apoio!')).toBeVisible()

    // Expande a convocatória para verificar a lista de presenças
    const botaoConvocatoria = regiao.getByRole('button', { name: /Convocatória/ })
    await botaoConvocatoria.click()

    // O adepto deve constar na lista de convocatória com rótulo "Adepto" e "Confirmado"
    await expect(page.getByText('Adepto Silva')).toBeVisible()
    await expect(page.getByText('Adepto', { exact: true })).toBeVisible()
  })
})
