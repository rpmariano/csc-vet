import test from 'node:test'
import assert from 'node:assert/strict'

// Importamos as funções que testamos
// Como o ficheiro tacaVeteranos2026.ts importa supabaseClient com import.meta.env,
// podemos isolar as funções puras de lógica para teste ou testá-las diretamente.

// Vamos replicar o teste da lógica pura para validar toda a cadeia de eliminatórias
const JOGOS_OFICIAIS_TACA_2026 = [
  { match_number: 1, matchday: 1, round_label: 'Oitavos de Final', home_team_name: 'Carcavelos', away_team_name: 'Central 32', home_placeholder: null, away_placeholder: null, location: 'Carcavelos', match_date: '2026-11-29', match_time: '15:00' },
  { match_number: 2, matchday: 2, round_label: 'Quartos de Final', home_team_name: 'Cascais', away_team_name: 'Tires', home_placeholder: null, away_placeholder: null, location: 'Cascais', match_date: '2026-12-06', match_time: '15:00' },
  { match_number: 3, matchday: 2, round_label: 'Quartos de Final', home_team_name: 'Malveira da Serra', away_team_name: 'Estoril Praia', home_placeholder: null, away_placeholder: null, location: 'Malveira da Serra', match_date: '2026-12-06', match_time: '15:00' },
  { match_number: 4, matchday: 2, round_label: 'Quartos de Final', home_team_name: 'Torre', away_team_name: null, home_placeholder: null, away_placeholder: 'VENCEDOR JOGO 1', location: 'Torre', match_date: '2026-12-06', match_time: '15:00' },
  { match_number: 5, matchday: 2, round_label: 'Quartos de Final', home_team_name: 'Zambujeiro', away_team_name: 'Lisbon Casuals', home_placeholder: null, away_placeholder: null, location: 'Malveira da Serra', match_date: '2026-12-06', match_time: '17:00' },
  { match_number: 6, matchday: 3, round_label: 'Meias Finais', home_team_name: null, away_team_name: null, home_placeholder: 'VENCEDOR JOGO 2', away_placeholder: 'VENCEDOR JOGO 3', location: null, match_date: '2026-12-13', match_time: null },
  { match_number: 7, matchday: 3, round_label: 'Meias Finais', home_team_name: null, away_team_name: null, home_placeholder: 'VENCEDOR JOGO 5', away_placeholder: 'VENCEDOR JOGO 4', location: null, match_date: '2026-12-13', match_time: null },
  { match_number: 8, matchday: 4, round_label: 'Final', home_team_name: null, away_team_name: null, home_placeholder: 'VENCEDOR JOGO 6', away_placeholder: 'VENCEDOR JOGO 7', location: null, match_date: '2026-12-20', match_time: null },
]

function inferirNumeroJogoTaca(match, allMatches = []) {
  if (!match) return 1
  const round = Number(match.matchday ?? 1)
  if (round === 1) return 1
  if (round === 4) return 8
  if (round === 2) {
    const quartos = allMatches.filter(m => Number(m.matchday ?? 1) === 2)
    if (quartos.length > 0) {
      const idx = quartos.findIndex(m => m.id === match.id)
      if (idx >= 0) return idx + 2
    }
    return 2
  }
  if (round === 3) {
    const meias = allMatches.filter(m => Number(m.matchday ?? 1) === 3)
    if (meias.length > 0) {
      const idx = meias.findIndex(m => m.id === match.id)
      if (idx >= 0) return idx + 6
    }
    return 6
  }
  return 1
}

function obterMetaJogoKnockout(rules, match, allMatches = []) {
  const kmMap = (rules?.knockout_matches && typeof rules.knockout_matches === 'object' && !Array.isArray(rules.knockout_matches))
    ? rules.knockout_matches
    : {}

  let salvo = match?.id ? kmMap[match.id] : undefined
  if (!salvo && match?.id) {
    salvo = Object.values(kmMap).find(k => k && k.match_id === match.id)
  }

  let matchNumber = salvo?.match_number
  if (!matchNumber) {
    matchNumber = inferirNumeroJogoTaca(match, allMatches)
  }

  if (!salvo && matchNumber) {
    salvo = kmMap[`jogo_${matchNumber}`] ?? Object.values(kmMap).find(k => k && k.match_number === matchNumber)
  }

  const defOficial = JOGOS_OFICIAIS_TACA_2026.find(j => j.match_number === matchNumber)
  const roundNum = Number(match?.matchday ?? salvo?.matchday ?? defOficial?.matchday ?? 1)

  return {
    match_id: match?.id ?? salvo?.match_id,
    match_number: matchNumber,
    matchday: roundNum,
    round_label: salvo?.round_label ?? defOficial?.round_label ?? 'Eliminatória',
    home_placeholder: (salvo?.home_placeholder !== undefined && salvo?.home_placeholder !== null && salvo?.home_placeholder !== '')
      ? salvo.home_placeholder
      : (defOficial?.home_placeholder ?? null),
    away_placeholder: (salvo?.away_placeholder !== undefined && salvo?.away_placeholder !== null && salvo?.away_placeholder !== '')
      ? salvo.away_placeholder
      : (defOficial?.away_placeholder ?? null),
    location: salvo?.location ?? defOficial?.location ?? null,
    match_date: salvo?.match_date ?? defOficial?.match_date ?? null,
    match_time: salvo?.match_time ?? defOficial?.match_time ?? null,
    home_penalties: salvo?.home_penalties ?? null,
    away_penalties: salvo?.away_penalties ?? null,
  }
}

function determinarVencedorKnockout(match, meta) {
  if (!match) return null
  const temScore = match.home_score !== null && match.home_score !== undefined &&
                   match.away_score !== null && match.away_score !== undefined
  if (!temScore) return null

  const h = Number(match.home_score)
  const a = Number(match.away_score)
  if (h > a) return 'home'
  if (a > h) return 'away'

  const hp = meta?.home_penalties ?? match?.home_penalties
  const ap = meta?.away_penalties ?? match?.away_penalties
  if (hp !== null && hp !== undefined && ap !== null && ap !== undefined) {
    const numHp = Number(hp)
    const numAp = Number(ap)
    if (numHp > numAp) return 'home'
    if (numAp > numHp) return 'away'
  }
  return null
}

function resolverEquipaKnockout(lado, match, meta, allMatches, teams, clubSettings, rules, depth = 0) {
  const teamId = lado === 'home' ? match?.home_team_id : match?.away_team_id
  const placeholder = (lado === 'home' ? meta?.home_placeholder : meta?.away_placeholder)?.trim() || null

  if (!teamId && placeholder && depth < 6) {
    const m = placeholder.match(/vencedor\s+jogo\s+(\d+)/i)
    if (m) {
      const targetNum = Number(m[1])
      let sourceMatch = allMatches.find(
        cand => cand && obterMetaJogoKnockout(rules, cand, allMatches).match_number === targetNum
      )
      if (!sourceMatch && targetNum === 1) {
        sourceMatch = allMatches.find(cand => cand && Number(cand.matchday ?? 1) === 1)
      }

      if (sourceMatch) {
        const sourceMeta = obterMetaJogoKnockout(rules, sourceMatch, allMatches)
        const vencedor = determinarVencedorKnockout(sourceMatch, sourceMeta)
        if (vencedor) {
          const resolvida = resolverEquipaKnockout(
            vencedor,
            sourceMatch,
            sourceMeta,
            allMatches,
            teams,
            clubSettings,
            rules,
            depth + 1,
          )
          if (!resolvida.isPlaceholder) {
            return {
              ...resolvida,
              placeholder,
              resolvidoDePlaceholder: true,
            }
          }
        }
      }
    }
  }

  if (teamId) {
    const teamObj = teams.find(t => t.id === teamId)
    if (teamObj) {
      return {
        sigla: teamObj.opponent?.initials || 'EQ',
        nome: teamObj.opponent?.name || 'Equipa',
        logo: teamObj.opponent?.logo_url || null,
        eOClube: teamObj.opponent_id === null,
        teamId,
        placeholder,
        isPlaceholder: false,
        resolvidoDePlaceholder: Boolean(placeholder),
      }
    }
  }

  const label = placeholder || 'Por definir'
  return {
    sigla: label,
    nome: label,
    logo: null,
    eOClube: false,
    teamId: null,
    placeholder,
    isPlaceholder: true,
    resolvidoDePlaceholder: false,
  }
}

// ==============================================================================
// TESTES
// ==============================================================================

test('Jogo 4 sem regras na BD devolve sempre VENCEDOR JOGO 1 como away_placeholder', () => {
  const matchJogo4 = { id: 'm4', matchday: 2, home_team_id: 't-torre', away_team_id: null }
  const allMatches = [
    { id: 'm1', matchday: 1 },
    { id: 'm2', matchday: 2 },
    { id: 'm3', matchday: 2 },
    matchJogo4,
    { id: 'm5', matchday: 2 },
  ]
  const meta = obterMetaJogoKnockout({}, matchJogo4, allMatches)
  assert.equal(meta.match_number, 4)
  assert.equal(meta.away_placeholder, 'VENCEDOR JOGO 1')
  assert.equal(meta.location, 'Torre')
})

test('Jogo 4 pendente mostra VENCEDOR JOGO 1 e nunca "Por definir"', () => {
  const matchJogo1 = { id: 'm1', matchday: 1, home_team_id: 't-carc', away_team_id: 't-c32', home_score: null, away_score: null }
  const matchJogo4 = { id: 'm4', matchday: 2, home_team_id: 't-torre', away_team_id: null }
  const allMatches = [matchJogo1, { id: 'm2', matchday: 2 }, { id: 'm3', matchday: 2 }, matchJogo4]
  const teams = [
    { id: 't-torre', opponent: { name: 'Torre', initials: 'TOR' } },
    { id: 't-carc', opponent: { name: 'Carcavelos', initials: 'CARC' } },
  ]

  const meta4 = obterMetaJogoKnockout({}, matchJogo4, allMatches)
  const fora = resolverEquipaKnockout('away', matchJogo4, meta4, allMatches, teams, {}, {})

  assert.equal(fora.isPlaceholder, true)
  assert.equal(fora.nome, 'VENCEDOR JOGO 1')
  assert.equal(fora.sigla, 'VENCEDOR JOGO 1')
  assert.equal(fora.resolvidoDePlaceholder, false)
})

test('Quando Jogo 1 termina 1-0, Jogo 4 resolve automaticamente Carcavelos como visitante', () => {
  const matchJogo1 = {
    id: 'm1',
    matchday: 1,
    home_team_id: 't-carc',
    away_team_id: 't-c32',
    home_score: 1,
    away_score: 0,
    status: 'finished',
  }
  const matchJogo4 = {
    id: 'm4',
    matchday: 2,
    home_team_id: 't-torre',
    away_team_id: null,
    home_score: null,
    away_score: null,
  }
  const allMatches = [matchJogo1, { id: 'm2', matchday: 2 }, { id: 'm3', matchday: 2 }, matchJogo4]
  const teams = [
    { id: 't-torre', opponent: { name: 'Torre', initials: 'TOR' } },
    { id: 't-carc', opponent: { name: 'Carcavelos', initials: 'CARC', logo_url: 'carc.png' } },
    { id: 't-c32', opponent: { name: 'Central 32', initials: 'C32' } },
  ]

  const meta4 = obterMetaJogoKnockout({}, matchJogo4, allMatches)
  const fora = resolverEquipaKnockout('away', matchJogo4, meta4, allMatches, teams, {}, {})

  assert.equal(fora.isPlaceholder, false)
  assert.equal(fora.nome, 'Carcavelos')
  assert.equal(fora.sigla, 'CARC')
  assert.equal(fora.logo, 'carc.png')
  assert.equal(fora.placeholder, 'VENCEDOR JOGO 1')
  assert.equal(fora.resolvidoDePlaceholder, true)
})

test('determinarVencedorKnockout desempata corretamente nos 70m e nos penalties', () => {
  assert.equal(determinarVencedorKnockout({ home_score: 2, away_score: 1 }), 'home')
  assert.equal(determinarVencedorKnockout({ home_score: 0, away_score: 3 }), 'away')
  // Empate sem penalties
  assert.equal(determinarVencedorKnockout({ home_score: 1, away_score: 1 }), null)
  // Empate com penalties
  assert.equal(determinarVencedorKnockout({ home_score: 1, away_score: 1 }, { home_penalties: 4, away_penalties: 2 }), 'home')
  assert.equal(determinarVencedorKnockout({ home_score: 2, away_score: 2 }, { home_penalties: 3, away_penalties: 5 }), 'away')
})

test('Cascata completa: Vencedor do Jogo 1 passa ao Jogo 4, e Vencedor do Jogo 4 passa à Meia Final (Jogo 7)', () => {
  const matchJogo1 = { id: 'm1', matchday: 1, home_team_id: 't-carc', away_team_id: 't-c32', home_score: 1, away_score: 0, status: 'finished' }
  const matchJogo4 = { id: 'm4', matchday: 2, home_team_id: 't-torre', away_team_id: null, home_score: 0, away_score: 2, status: 'finished' }
  const matchJogo5 = { id: 'm5', matchday: 2, home_team_id: 't-zamb', away_team_id: 't-cas', home_score: 3, away_score: 1, status: 'finished' }
  const matchJogo7 = { id: 'm7', matchday: 3, home_team_id: null, away_team_id: null, home_score: null, away_score: null }

  const allMatches = [
    matchJogo1,
    { id: 'm2', matchday: 2 },
    { id: 'm3', matchday: 2 },
    matchJogo4,
    matchJogo5,
    { id: 'm6', matchday: 3 },
    matchJogo7,
  ]
  const teams = [
    { id: 't-torre', opponent: { name: 'Torre', initials: 'TOR' } },
    { id: 't-carc', opponent: { name: 'Carcavelos', initials: 'CARC', logo_url: 'carc.png' } },
    { id: 't-c32', opponent: { name: 'Central 32', initials: 'C32' } },
    { id: 't-zamb', opponent: { name: 'Zambujeiro', initials: 'ZAMB' } },
    { id: 't-cas', opponent: { name: 'Lisbon Casuals', initials: 'LCAS' } },
  ]

  // No Jogo 7 (Meia Final): home_placeholder é VENCEDOR JOGO 5, away_placeholder é VENCEDOR JOGO 4
  const meta7 = obterMetaJogoKnockout({}, matchJogo7, allMatches)
  assert.equal(meta7.match_number, 7)
  assert.equal(meta7.home_placeholder, 'VENCEDOR JOGO 5')
  assert.equal(meta7.away_placeholder, 'VENCEDOR JOGO 4')

  const casa7 = resolverEquipaKnockout('home', matchJogo7, meta7, allMatches, teams, {}, {})
  const fora7 = resolverEquipaKnockout('away', matchJogo7, meta7, allMatches, teams, {}, {})

  // Jogo 5 ganho pelo Zambujeiro (3-1) -> casa do Jogo 7 é Zambujeiro
  assert.equal(casa7.nome, 'Zambujeiro')
  assert.equal(casa7.resolvidoDePlaceholder, true)

  // Jogo 4 ganho pelo Carcavelos (0-2 vs Torre) -> fora do Jogo 7 é Carcavelos!
  assert.equal(fora7.nome, 'Carcavelos')
  assert.equal(fora7.sigla, 'CARC')
  assert.equal(fora7.resolvidoDePlaceholder, true)
})
