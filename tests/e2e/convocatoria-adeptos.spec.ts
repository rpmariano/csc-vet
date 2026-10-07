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

const PERFIL_TREINADOR = {
  ...FIXTURES_BASE.profiles[0],
  id: 'treinador-1',
  name: 'Mister Mourinho',
  shirt_name: null,
  jersey_number: null,
  role: 'coach',
  roles: ['coach'],
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

test.describe('Convocatória e Comunicados de Adeptos', () => {
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

  test('adeptos não se misturam com jogadores: pastilha própria e lista no fim colapsada', async ({ page }) => {
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

    // Confirma presença como adepto
    const botaoApoiar = regiao.getByRole('button', { name: 'Vou apoiar' })
    await expect(botaoApoiar).toBeVisible()
    await botaoApoiar.click()
    await expect(page.getByText('Presença confirmada! Obrigado pelo apoio.')).toBeVisible()

    // Expande a convocatória principal
    const botaoConvocatoria = regiao.getByRole('button', { name: /Convocatória/ })
    await botaoConvocatoria.click()

    // Convocatória conta apenas o atleta (1), não soma o adepto aos jogadores
    await expect(page.getByText(/Convocatória \(1/)).toBeVisible()

    // O jogador Carlos está visível na lista principal de atletas (nome de camisola)
    await expect(page.getByText('Carlos', { exact: true })).toBeVisible()

    // O adepto NÃO deve aparecer misturado na lista principal de jogadores
    // Deve haver um botão de colapso específico no fim: "Adeptos a apoiar (1)"
    const botaoAdeptos = page.getByRole('button', { name: /Adeptos a apoiar \(1\)/ })
    await expect(botaoAdeptos).toBeVisible()

    // Antes de abrir o colapso de adeptos, Adepto Silva não está visível
    await expect(page.getByText('Adepto Silva')).not.toBeVisible()

    // Clica para expandir a lista de adeptos
    await botaoAdeptos.click()

    // Agora o adepto está visível com o rótulo de Adepto
    await expect(page.getByText('Adepto Silva')).toBeVisible()
    await expect(page.getByText('Adepto', { exact: true })).toBeVisible()
  })

  test('comunicados com e sem adeptos: adepto não vê comunicados restritos ao plantel', async ({ page }) => {
    const agora = new Date().toISOString()
    const comunicadoGeral = {
      id: 'ann-1',
      title: 'Festa de Fim de Época',
      content: 'Todos os adeptos e atletas estão convidados para a festa!',
      published_at: agora,
      is_active: true,
      target_audience: 'all',
    }
    const comunicadoRestrito = {
      id: 'ann-2',
      title: 'Tática e Balneário Fechado',
      content: 'Reunião técnica restrita aos jogadores convocados.\n\n<!--target:no_supporters-->',
      published_at: agora,
      is_active: true,
      target_audience: 'no_supporters',
    }

    await montarSupabaseFalso(page, {
      profiles: [PERFIL_ADEPTO],
      announcements: [comunicadoGeral, comunicadoRestrito],
    })

    await page.goto('/csc-vet/announcements')
    await page.waitForLoadState('networkidle')

    // Adepto deve ver o comunicado geral
    await expect(page.getByText('Festa de Fim de Época')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Todos os adeptos e atletas estão convidados para a festa!')).toBeVisible()

    // Adepto NÃO deve ver o comunicado restrito
    await expect(page.getByText('Tática e Balneário Fechado')).not.toBeVisible()
  })

  test('treinador vê badges de público-alvo e opções com/sem adeptos no formulário e na listagem', async ({ page }) => {
    const agora = new Date().toISOString()
    const comunicadoGeral = {
      id: 'ann-1',
      title: 'Festa de Fim de Época',
      content: 'Todos convidados!',
      published_at: agora,
      is_active: true,
      target_audience: 'all',
    }
    const comunicadoRestrito = {
      id: 'ann-2',
      title: 'Tática e Balneário Fechado',
      content: 'Apenas jogadores.\n\n<!--target:no_supporters-->',
      published_at: agora,
      is_active: true,
      target_audience: 'no_supporters',
    }

    await montarSupabaseFalso(page, {
      profiles: [{ ...PERFIL_TREINADOR, id: UTILIZADOR_TESTE.id }],
      announcements: [comunicadoGeral, comunicadoRestrito],
    })

    await page.goto('/csc-vet/announcements')
    await page.waitForLoadState('networkidle')

    // Na listagem, treinador vê os badges de público-alvo
    await expect(page.getByText('Todos', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Sem adeptos', { exact: true })).toBeVisible()

    // Abre formulário de novo comunicado e verifica as opções de destinatários
    await page.getByRole('button', { name: 'Escrever comunicado' }).click()
    await expect(page.getByRole('button', { name: 'Todos (com adeptos)' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sem adeptos (plantel)' })).toBeVisible()
  })
})
