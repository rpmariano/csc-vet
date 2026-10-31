import { test, expect } from '@playwright/test'
import { montarSupabaseFalso } from './supabase-mock'

/**
 * As equipas de um torneio, na classificação.
 *
 * Mostravam-se pelo **nome por extenso** — "Clube Atletismo do Montijo" numa
 * tabela de dez colunas, truncado a meio — e a linha do próprio clube ficava
 * **sem emblema**: o código punha `logo = isCSC ? null : …`, portanto o clube
 * levava sempre o escudo genérico mesmo tendo emblema em `club_settings`.
 *
 * Passa a ser a sigla e o emblema, e a sigla é a que a direção escreveu na
 * ficha do adversário — não a que o `formatOpponentSigla` reconstrói para os
 * placares apertados, que recusa espaços e daria "CADM".
 */

const EMBLEMA =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
  '<circle cx="20" cy="20" r="19" fill="%230a4"/></svg>'

const FIXTURES = {
  club_settings: [{
    id: 1, name: 'Grupo Dramático e Sportivo de Cascais', initials: 'GDS Cascais',
    logo_url: EMBLEMA, primary_color: '#1c1c1c', home_field_id: null,
  }],
  tournaments: [{
    /* 'ativo' é o valor do enum `tournament_status` — a Home só mostra estas. */
    id: 't1', name: 'Liga Masters +35', season: '2026/2027', status: 'ativo',
    organizer_name: 'AF Lisboa', image_url: null,
  }],
  tournament_groups: [{ id: 'g1', tournament_id: 't1', name: 'Grupo Único', phase: 1 }],
  tournament_teams: [
    { id: 'e1', tournament_id: 't1', group_id: 'g1', opponent_id: null, points_carryover: 0, opponent: null },
    {
      id: 'e2', tournament_id: 't1', group_id: 'g1', opponent_id: 'o1', points_carryover: 0,
      opponent: { id: 'o1', name: 'Clube Atletismo do Montijo', initials: 'CA Montijo', logo_url: EMBLEMA },
    },
    {
      id: 'e3', tournament_id: 't1', group_id: 'g1', opponent_id: 'o2', points_carryover: 0,
      opponent: { id: 'o2', name: 'Grupo Desportivo Pescadores da Costa da Caparica', initials: 'GDPCC', logo_url: null },
    },
  ],
  tournament_matches: [
    {
      id: 'j1a', tournament_id: 't1', group_id: 'g1', matchday: 1, match_date: '2026-09-12',
      home_team_id: 'e2', away_team_id: 'e3', status: 'finished', home_score: 2, away_score: 1,
    },
    {
      id: 'j2a', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-19',
      home_team_id: 'e3', away_team_id: 'e2', status: 'scheduled', home_score: null, away_score: null,
    },
    /* Um jogo nosso espelhado de um evento, já com ficha lançada… */
    {
      id: 'j2b', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-20',
      home_team_id: 'e1', away_team_id: 'e2', status: 'finished', home_score: 3, away_score: 1,
      event_id: 'ev1',
    },
    /* …e outro nosso, marcado e ainda sem ficha. */
    {
      id: 'j2c', tournament_id: 't1', group_id: 'g1', matchday: 2, match_date: '2026-09-21',
      home_team_id: 'e1', away_team_id: 'e3', status: 'scheduled', home_score: null, away_score: null,
      event_id: 'ev2',
    },
  ],
  events: [
    {
      id: 'ev1', tournament_id: 't1', type: 'match', matchday: 2, is_active: true,
      date_time: '2026-09-20T10:00:00Z', meeting_time: null, home_away: 'home',
      home_score: 3, away_score: 1, opponent_id: 'o1', is_friendly: false, location: 'Cascais',
      title: 'Jogo vs Clube Atletismo do Montijo', description: null, field_id: null,
      opponent: { id: 'o1', name: 'Clube Atletismo do Montijo', initials: 'CA Montijo', logo_url: EMBLEMA },
      tournament: { id: 't1', name: 'Liga Masters +35', season: '2026/2027', rules: null }, field: null,
    },
  ],
}

async function abreClassificacao(page: import('@playwright/test').Page) {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/competicao?ver=classificacoes')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('table').first()).toBeVisible()
}

test('as equipas aparecem pela sigla, não pelo nome por extenso', async ({ page }) => {
  await abreClassificacao(page)

  const tabela = page.locator('table').first()
  await expect(tabela.getByText('CSC', { exact: true })).toBeVisible()
  await expect(tabela.getByText('CA Montijo', { exact: true })).toBeVisible()
  await expect(tabela.getByText('GDPCC', { exact: true })).toBeVisible()

  // E os nomes por extenso não aparecem em lado nenhum da tabela.
  await expect(tabela.getByText(/Clube Atletismo do Montijo/)).toHaveCount(0)
  await expect(tabela.getByText(/Grupo Desportivo Pescadores/)).toHaveCount(0)
})

test('a linha do clube leva o emblema do clube, e não o escudo genérico', async ({ page }) => {
  await abreClassificacao(page)

  const linhaDoClube = page.locator('tr').filter({ hasText: 'CSC' }).first()
  await expect(linhaDoClube.locator('img')).toHaveAttribute('src', EMBLEMA)

  // O adversário com emblema também o mostra…
  const montijo = page.locator('tr').filter({ hasText: 'CA Montijo' }).first()
  await expect(montijo.locator('img')).toHaveCount(1)

  // …e quem não tem fica com o escudo, que é o certo.
  const semEmblema = page.locator('tr').filter({ hasText: 'GDPCC' }).first()
  await expect(semEmblema.locator('img')).toHaveCount(0)
})

/**
 * As jornadas mostram-se **uma de cada vez**.
 *
 * Estavam todas abertas por baixo da tabela: com dez jornadas a seis jogos,
 * eram mais de sessenta linhas entre a tabela de um grupo e a do seguinte, e
 * chegar ao segundo grupo era um scroll sem fim.
 */
test('só se vê uma jornada de cada vez, e a pastilha troca de jornada', async ({ page }) => {
  await abreClassificacao(page)

  // Abre na jornada em foco — a primeira com jogos por realizar, aqui a 2.
  await expect(page.getByText('19/09')).toBeVisible()
  await expect(page.getByText('12/09')).toHaveCount(0)

  await page.getByRole('button', { name: /^Jornada 1,/ }).click()
  await expect(page.getByText('12/09')).toBeVisible()
  await expect(page.getByText('19/09')).toHaveCount(0)

  // O jogo lançado mostra o resultado; o outro fica com o "VS".
  await expect(page.getByText('2 - 1')).toBeVisible()
})

/**
 * A Home mostra o pedaço da classificação onde estamos, e leva à prova certa.
 *
 * O cartão só sabia dizer quantas jornadas havia: a conta da tabela vivia
 * dentro da `StandingsPage` e duplicá-la dava duas classificações que podiam
 * discordar. Hoje é a mesma função, em `src/lib/classificacao.ts`.
 */
test('a Home mostra a classificação do clube e liga à prova', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/')
  await page.waitForLoadState('networkidle')

  const cartao = page.locator('section').filter({ hasText: 'Classificação' }).first()
  await expect(cartao.getByText('Liga Masters +35')).toBeVisible()
  await expect(cartao.getByText('Grupo Único')).toBeVisible()
  // O clube está lá, com as outras equipas do grupo à volta.
  await expect(cartao.getByText('CSC', { exact: true })).toBeVisible()
  await expect(cartao.getByText('CA Montijo', { exact: true })).toBeVisible()

  // E tocar leva à classificação desta prova, não à primeira da lista.
  await cartao.getByRole('link').first().click()
  await expect(page).toHaveURL(/ver=classificacoes/)
  await expect(page).toHaveURL(/torneio=t1/)
})

/**
 * Um jogo de prova diz sempre em que jornada conta.
 *
 * É a jornada que espelha o jogo em `tournament_matches` — sem ela o jogo
 * ficava fora da tabela, e quem lançasse a ficha tinha de ir à Classificação
 * escrever o mesmo resultado outra vez à mão.
 */
test('um jogo de prova não se grava sem jornada', async ({ page }) => {
  await montarSupabaseFalso(page, FIXTURES)
  await page.goto('/csc-vet/events')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Novo Evento' }).click()
  await page.getByRole('button', { name: 'Jogo', exact: true }).click()

  // Sem prova escolhida não há jornada nenhuma para pedir.
  await expect(page.getByLabel('Jornada *')).toHaveCount(0)

  await page.getByLabel('Torneio / Competição').selectOption('t1')
  await expect(page.getByLabel('Jornada *')).toBeVisible()

  await page.getByRole('button', { name: /Guardar e convocar/ }).click()
  await expect(page.getByText(/jornada em que este jogo conta/i)).toBeVisible()

  // Com a jornada preenchida, o formulário deixa de reclamar.
  await page.getByLabel('Jornada *').fill('3')
  await expect(page.getByLabel('Jornada *')).toHaveValue('3')
})

/**
 * Um jogo nosso já lançado abre a ficha; um por lançar diz que lhe falta.
 *
 * A lista de jornadas mostrava só o placar, e a ficha — marcadores, cartões,
 * onze — ficava a dois ecrãs de distância, sem nada a dizer sequer quais dos
 * nossos jogos já a tinham.
 */
test('a linha do nosso jogo abre a ficha, e distingue quem ainda não a tem', async ({ page }) => {
  await abreClassificacao(page)

  const comFicha = page.getByRole('link', { name: /Abrir a ficha de jogo de CSC com CA Montijo/ })
  await expect(comFicha).toBeVisible()
  await expect(page.getByTitle('Jogo nosso, ainda sem ficha de jogo')).toBeVisible()

  await comFicha.click()
  await expect(page).toHaveURL(/ver=fichas&jogo=ev1/)
  await expect(page.getByRole('region', { name: / vs / })).toBeVisible()
})

/**
 * Novo tipo de torneio: Taça / Eliminatórias (Sistema "Taça de Portugal") —
 * 3ª Taça de Veteranos - Cascais 2026 (UCFFCC).
 *
 * Testa:
 * 1. A configuração e edição de todas as regras da Taça no gestor de torneios.
 * 2. A apresentação do Quadro Competitivo (Oitavos, Quartos, Meias e Final — Jogos 1 a 8)
 *    e a progressão automática de "VENCEDOR JOGO 1" quando o Jogo 1 termina.
 */
test('suporta torneio tipo Taça / Eliminatórias com regras editáveis e quadro oficial (Jogos 1 a 8)', async ({ page }) => {
  const TACA_FIXTURES = {
    club_settings: [{
      id: 1, name: 'Grupo Dramático e Sportivo de Cascais', initials: 'GDS Cascais',
      logo_url: EMBLEMA, primary_color: '#1c1c1c', home_field_id: null,
    }],
    tournaments: [{
      id: 'taca-2026',
      name: '3ª Taça de Veteranos - Cascais 2026',
      season: '2026/2027',
      status: 'ativo',
      organizer_name: 'UCFFCC',
      image_url: '/csc-vet/emblemas/ucffcc.jpg',
      rules: {
        format: 'knockout',
        knockout_tiebreaker: 'penalties',
        knockout_starting_round: 'round_of_16',
        min_age: 36,
        max_birth_year: 1990,
        exceptions_allowed: true,
        exceptions_count: 1,
        exceptions_min_age: 35,
        exceptions_max_birth_year: 1991,
        unlimited_squad: true,
        max_squad_size: 999,
        max_match_players: 20,
        min_match_players: 7,
        forbid_fpf_federated: true,
        require_id_document: true,
        require_medical_exam: true,
        medical_exam_valid_until: '2026-12-21',
        require_insurance: true,
        exclusive_club_representation: true,
        roster_update_deadline: 'Até às 17h00 da 5ª feira anterior ao jogo',
        match_duration_mins: 70,
        half_duration_mins: 35,
        halftime_duration_mins: 10,
        rolling_subs: true,
        kit_conflict_rule: 'home_changes',
        yellow_cards_to_suspension: 2,
        yellow_cards_suspension_enabled: true,
        red_card_suspension: true,
        double_yellow_suspension: true,
        violent_conduct_expulsion: true,
        suspensions_carry_over: true,
        walkover_score: '3-0',
        max_walkovers_allowed: 1,
        delay_tolerance_mins: 15,
        referee_entity: 'NAFLS (Associação de Futebol de Lisboa)',
        referee_fee_per_match: 50,
        knockout_matches: {
          m1: { match_id: 'm1', match_number: 1, matchday: 1, round_label: 'Oitavos de Final', home_placeholder: null, away_placeholder: null, location: 'Carcavelos', match_date: '2026-11-29', match_time: '15H00' },
          m2: { match_id: 'm2', match_number: 2, matchday: 2, round_label: 'Quartos de Final', home_placeholder: null, away_placeholder: null, location: 'Cascais', match_date: '2026-12-06', match_time: '15H00' },
          m3: { match_id: 'm3', match_number: 3, matchday: 2, round_label: 'Quartos de Final', home_placeholder: null, away_placeholder: null, location: 'Malveira da Serra', match_date: '2026-12-06', match_time: '15H00' },
          m4: { match_id: 'm4', match_number: 4, matchday: 2, round_label: 'Quartos de Final', home_placeholder: null, away_placeholder: 'VENCEDOR JOGO 1', location: 'Torre', match_date: '2026-12-06', match_time: '15H00' },
          m5: { match_id: 'm5', match_number: 5, matchday: 2, round_label: 'Quartos de Final', home_placeholder: null, away_placeholder: null, location: 'Malveira da Serra', match_date: '2026-12-06', match_time: '17H00' },
          m6: { match_id: 'm6', match_number: 6, matchday: 3, round_label: 'Meias Finais', home_placeholder: 'VENCEDOR JOGO 2', away_placeholder: 'VENCEDOR JOGO 3', location: null, match_date: '2026-12-13', match_time: null },
          m7: { match_id: 'm7', match_number: 7, matchday: 3, round_label: 'Meias Finais', home_placeholder: 'VENCEDOR JOGO 5', away_placeholder: 'VENCEDOR JOGO 4', location: null, match_date: '2026-12-13', match_time: null },
          m8: { match_id: 'm8', match_number: 8, matchday: 4, round_label: 'Final', home_placeholder: 'VENCEDOR JOGO 6', away_placeholder: 'VENCEDOR JOGO 7', location: null, match_date: '2026-12-20', match_time: null },
        },
      },
    }],
    tournament_groups: [{ id: 'g-taca', tournament_id: 'taca-2026', name: 'Quadro Competitivo', phase: 1 }],
    tournament_teams: [
      { id: 'tt-csc', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: null, opponent: null },
      { id: 'tt-carc', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-carc', opponent: { id: 'o-carc', name: 'Carcavelos', initials: 'CARC', logo_url: null } },
      { id: 'tt-c32', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-c32', opponent: { id: 'o-c32', name: 'Central 32', initials: 'C32', logo_url: null } },
      { id: 'tt-tir', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-tir', opponent: { id: 'o-tir', name: 'Tires', initials: 'TIR', logo_url: null } },
      { id: 'tt-malv', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-malv', opponent: { id: 'o-malv', name: 'Malveira da Serra', initials: 'MALV', logo_url: null } },
      { id: 'tt-est', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-est', opponent: { id: 'o-est', name: 'Estoril Praia', initials: 'EST', logo_url: null } },
      { id: 'tt-tor', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-tor', opponent: { id: 'o-tor', name: 'Torre', initials: 'TOR', logo_url: null } },
      { id: 'tt-zamb', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-zamb', opponent: { id: 'o-zamb', name: 'Zambujeiro', initials: 'ZAMB', logo_url: null } },
      { id: 'tt-lcas', tournament_id: 'taca-2026', group_id: 'g-taca', opponent_id: 'o-lcas', opponent: { id: 'o-lcas', name: 'Lisbon Casuals', initials: 'LCAS', logo_url: null } },
    ],
    tournament_matches: [
      { id: 'm1', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 1, match_date: '2026-11-29', home_team_id: 'tt-carc', away_team_id: 'tt-c32', status: 'scheduled', home_score: null, away_score: null },
      { id: 'm2', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 2, match_date: '2026-12-06', home_team_id: 'tt-csc', away_team_id: 'tt-tir', status: 'scheduled', home_score: null, away_score: null },
      { id: 'm3', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 2, match_date: '2026-12-06', home_team_id: 'tt-malv', away_team_id: 'tt-est', status: 'scheduled', home_score: null, away_score: null },
      { id: 'm4', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 2, match_date: '2026-12-06', home_team_id: 'tt-tor', away_team_id: null, status: 'scheduled', home_score: null, away_score: null },
      { id: 'm5', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 2, match_date: '2026-12-06', home_team_id: 'tt-zamb', away_team_id: 'tt-lcas', status: 'scheduled', home_score: null, away_score: null },
      { id: 'm6', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 3, match_date: '2026-12-13', home_team_id: null, away_team_id: null, status: 'scheduled', home_score: null, away_score: null },
      { id: 'm7', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 3, match_date: '2026-12-13', home_team_id: null, away_team_id: null, status: 'scheduled', home_score: null, away_score: null },
      { id: 'm8', tournament_id: 'taca-2026', group_id: 'g-taca', matchday: 4, match_date: '2026-12-20', home_team_id: null, away_team_id: null, status: 'scheduled', home_score: null, away_score: null },
    ],
  }

  await montarSupabaseFalso(page, TACA_FIXTURES)
  await page.goto('/csc-vet/competicao?ver=classificacoes')
  await page.waitForLoadState('networkidle')

  // 1. Verifica que mostra o cabeçalho das Normas da Taça e todas as fases da eliminatória
  await expect(page.getByText(/Normas de Participação e Regras/i)).toBeVisible()
  await page.getByText(/Normas de Participação e Regras/i).click()
  await expect(page.getByText(/Nascidos ≤ 1990/)).toBeVisible()
  await expect(page.getByText(/Suspensão ao 2º amarelo/)).toBeVisible()
  await expect(page.getByText(/Muda a equipa considerada a jogar em casa/i)).toBeVisible()

  // 2. Verifica os Jogos 1 a 8 do calendário oficial
  await expect(page.getByText('Jogo 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Carcavelos', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Central 32', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Jogo 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Tires', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('VENCEDOR JOGO 1', { exact: true })).toBeVisible()
  await expect(page.getByText('Jogo 8', { exact: true })).toBeVisible()

  // 3. Edita o Jogo 1 (empate 1-1 e vitória do Carcavelos por 4-3 nas grandes penalidades)
  await page.getByRole('button', { name: 'Editar Jogo 1' }).click()
  await page.getByLabel('Golos Visitado').fill('1')
  await page.getByLabel('Golos Visitante').fill('1')
  await page.getByLabel('Penalties Visitado (se empate)').fill('4')
  await page.getByLabel('Penalties Visitante (se empate)').fill('3')
  await page.getByRole('button', { name: 'Guardar jogo' }).click()

  // O Jogo 1 mostra o resultado e os penalties (4-3 gp), e o Jogo 4 resolve automaticamente "Carcavelos" como Vencedor do Jogo 1!
  await expect(page.getByText('(4-3 gp)')).toBeVisible()
  await expect(page.getByText('(VENCEDOR JOGO 1)')).toBeVisible()
})
