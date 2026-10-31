import test from 'node:test'
import assert from 'node:assert/strict'

function obterFasesEliminatoria(rules, matches = []) {
  if (rules?.knockout_rounds && rules.knockout_rounds.length > 0) {
    return [...rules.knockout_rounds].sort((a, b) => a.round - b.round)
  }
  const rSet = new Set()
  if (matches && matches.length > 0) {
    matches.forEach(m => {
      const r = Number(m.matchday ?? 1)
      if (r > 0) rSet.add(r)
    })
  }
  if (rSet.size > 0) {
    return Array.from(rSet).sort((a, b) => a - b).map(r => ({
      round: r,
      name: `${r}ª Eliminatória`,
    }))
  }
  return [
    { round: 1, name: 'Oitavos de Final' },
    { round: 2, name: 'Quartos de Final' },
    { round: 3, name: 'Meias Finais' },
    { round: 4, name: 'Final' },
  ]
}

function obterRotuloEliminatoria(matchday, customLabel, rules) {
  if (customLabel && customLabel.trim()) return customLabel.trim()
  if (!matchday) return 'Eliminatória'
  if (rules?.knockout_rounds && rules.knockout_rounds.length > 0) {
    const achado = rules.knockout_rounds.find(f => f.round === matchday)
    if (achado && achado.name && achado.name.trim()) return achado.name.trim()
  }
  const rotulos = { 1: 'Oitavos de Final', 2: 'Quartos de Final', 3: 'Meias Finais', 4: 'Final' }
  return rotulos[matchday] || `${matchday}ª Eliminatória`
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

function determinarDerrotadoKnockout(match, meta) {
  const vencedor = determinarVencedorKnockout(match, meta)
  if (!vencedor) return null
  return vencedor === 'home' ? 'away' : 'home'
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
    const round = Number(match?.matchday ?? 1)
    const idx = allMatches.findIndex(m => m.id === match?.id)
    matchNumber = idx >= 0 ? idx + 1 : round
  }

  const roundNum = Number(match?.matchday ?? salvo?.matchday ?? 1)

  return {
    match_id: match?.id ?? salvo?.match_id,
    match_number: matchNumber,
    matchday: roundNum,
    round_label: salvo?.round_label ?? obterRotuloEliminatoria(roundNum, null, rules),
    home_placeholder: salvo?.home_placeholder ?? null,
    away_placeholder: salvo?.away_placeholder ?? null,
    home_source_type: salvo?.home_source_type,
    home_source_match_num: salvo?.home_source_match_num,
    away_source_type: salvo?.away_source_type,
    away_source_match_num: salvo?.away_source_match_num,
    location: salvo?.location ?? null,
    match_date: salvo?.match_date ?? null,
    match_time: salvo?.match_time ?? null,
    home_penalties: salvo?.home_penalties ?? null,
    away_penalties: salvo?.away_penalties ?? null,
  }
}

function resolverEquipaKnockout(lado, match, meta, allMatches, teams, clubSettings, rules, depth = 0) {
  const teamId = lado === 'home' ? match?.home_team_id : match?.away_team_id
  const placeholder = (lado === 'home' ? meta?.home_placeholder : meta?.away_placeholder)?.trim() || null

  const sourceType = lado === 'home' ? meta?.home_source_type : meta?.away_source_type
  const sourceMatchNum = lado === 'home' ? meta?.home_source_match_num : meta?.away_source_match_num

  if (!teamId && (placeholder || sourceMatchNum) && depth < 6) {
    const mWin = placeholder ? placeholder.match(/vencedor\s+(?:do\s+)?jogo\s+(\d+)/i) : null
    const mLos = placeholder ? placeholder.match(/(?:derrotado|perdedor)\s+(?:do\s+)?jogo\s+(\d+)/i) : null

    const isWinner = Boolean(mWin) || sourceType === 'winner'
    const isLoser = Boolean(mLos) || sourceType === 'loser'

    let targetNum = null
    if (mWin) targetNum = Number(mWin[1])
    else if (mLos) targetNum = Number(mLos[1])
    else if (sourceMatchNum) targetNum = Number(sourceMatchNum)

    if (targetNum && (isWinner || isLoser)) {
      let sourceMatch = allMatches.find(
        cand => cand && obterMetaJogoKnockout(rules, cand, allMatches).match_number === targetNum
      )

      if (sourceMatch) {
        const sourceMeta = obterMetaJogoKnockout(rules, sourceMatch, allMatches)
        const ladoApurado = isWinner
          ? determinarVencedorKnockout(sourceMatch, sourceMeta)
          : determinarDerrotadoKnockout(sourceMatch, sourceMeta)

        if (ladoApurado) {
          const resolvida = resolverEquipaKnockout(
            ladoApurado,
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
              placeholder: placeholder || (isWinner ? `VENCEDOR JOGO ${targetNum}` : `DERROTADO JOGO ${targetNum}`),
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

test('Fases configuráveis: permite nomes e número de fases customizados', () => {
  const rules = {
    format: 'knockout',
    knockout_rounds: [
      { round: 1, name: 'Fase Prévia' },
      { round: 2, name: 'Meias Finais' },
      { round: 3, name: 'Apuramento 3º Lugar' },
      { round: 4, name: 'Grande Final' },
    ],
  }

  const fases = obterFasesEliminatoria(rules)
  assert.equal(fases.length, 4)
  assert.equal(fases[0].name, 'Fase Prévia')
  assert.equal(fases[2].name, 'Apuramento 3º Lugar')
  assert.equal(fases[3].name, 'Grande Final')

  assert.equal(obterRotuloEliminatoria(1, null, rules), 'Fase Prévia')
  assert.equal(obterRotuloEliminatoria(3, null, rules), 'Apuramento 3º Lugar')
})

test('Encadeamento configurável com Derrotado: Jogo de 3º/4º lugar resolve os derrotados das meias', () => {
  const semi1 = {
    id: 's1',
    matchday: 2,
    home_team_id: 't-equipaA',
    away_team_id: 't-equipaB',
    home_score: 3,
    away_score: 1,
    status: 'finished',
  }
  const semi2 = {
    id: 's2',
    matchday: 2,
    home_team_id: 't-equipaC',
    away_team_id: 't-equipaD',
    home_score: 0,
    away_score: 2,
    status: 'finished',
  }
  // Jogo de 3º/4º lugar: Derrotado da Semi 1 vs Derrotado da Semi 2
  const match3rd = {
    id: 'm3rd',
    matchday: 3,
    home_team_id: null,
    away_team_id: null,
  }

  const rules = {
    knockout_matches: {
      s1: { match_id: 's1', match_number: 1, matchday: 2 },
      s2: { match_id: 's2', match_number: 2, matchday: 2 },
      m3rd: {
        match_id: 'm3rd',
        match_number: 3,
        matchday: 3,
        home_source_type: 'loser',
        home_source_match_num: 1,
        home_placeholder: 'DERROTADO JOGO 1',
        away_source_type: 'loser',
        away_source_match_num: 2,
        away_placeholder: 'DERROTADO JOGO 2',
      },
    },
  }

  const allMatches = [semi1, semi2, match3rd]
  const teams = [
    { id: 't-equipaA', opponent: { name: 'Equipa A', initials: 'EQA' } },
    { id: 't-equipaB', opponent: { name: 'Equipa B', initials: 'EQB' } },
    { id: 't-equipaC', opponent: { name: 'Equipa C', initials: 'EQC' } },
    { id: 't-equipaD', opponent: { name: 'Equipa D', initials: 'EQD' } },
  ]

  const meta3rd = obterMetaJogoKnockout(rules, match3rd, allMatches)
  const casa3rd = resolverEquipaKnockout('home', match3rd, meta3rd, allMatches, teams, {}, rules)
  const fora3rd = resolverEquipaKnockout('away', match3rd, meta3rd, allMatches, teams, {}, rules)

  // Na Semi 1: Equipa A (3) vs Equipa B (1) -> Derrotado é Equipa B
  assert.equal(casa3rd.nome, 'Equipa B')
  assert.equal(casa3rd.sigla, 'EQB')
  assert.equal(casa3rd.resolvidoDePlaceholder, true)

  // Na Semi 2: Equipa C (0) vs Equipa D (2) -> Derrotado é Equipa C
  assert.equal(fora3rd.nome, 'Equipa C')
  assert.equal(fora3rd.sigla, 'EQC')
  assert.equal(fora3rd.resolvidoDePlaceholder, true)
})

test('Encadeamento de Vencedores com numeração livre e arbitrária funciona sem dependência hardcoded', () => {
  const jogo10 = {
    id: 'm10',
    matchday: 1,
    home_team_id: 't-rio',
    away_team_id: 't-porto',
    home_score: 2,
    away_score: 1,
    status: 'finished',
  }
  const jogo20 = {
    id: 'm20',
    matchday: 2,
    home_team_id: null,
    away_team_id: 't-benfica',
  }

  const rules = {
    knockout_matches: {
      m10: { match_id: 'm10', match_number: 10, matchday: 1 },
      m20: {
        match_id: 'm20',
        match_number: 20,
        matchday: 2,
        home_placeholder: 'VENCEDOR JOGO 10',
      },
    },
  }

  const allMatches = [jogo10, jogo20]
  const teams = [
    { id: 't-rio', opponent: { name: 'Rio Ave', initials: 'RAV' } },
    { id: 't-porto', opponent: { name: 'Porto', initials: 'FCP' } },
    { id: 't-benfica', opponent: { name: 'Benfica', initials: 'SLB' } },
  ]

  const meta20 = obterMetaJogoKnockout(rules, jogo20, allMatches)
  const casa = resolverEquipaKnockout('home', jogo20, meta20, allMatches, teams, {}, rules)

  assert.equal(casa.nome, 'Rio Ave')
  assert.equal(casa.sigla, 'RAV')
  assert.equal(casa.resolvidoDePlaceholder, true)
})
