import test from 'node:test'
import assert from 'node:assert/strict'

function extrairEncadeamentoJogo(placeholder, sourceType, sourceMatchNum) {
  if (sourceType === 'winner' && sourceMatchNum) {
    return { tipo: 'winner', num: Number(sourceMatchNum) }
  }
  if (sourceType === 'loser' && sourceMatchNum) {
    return { tipo: 'loser', num: Number(sourceMatchNum) }
  }
  if (!placeholder) return null
  const texto = placeholder.trim()
  const mWin = texto.match(/(?:vencedor|venc\.?)\s*(?:do\s*)?jogo\s*(\d+)/i)
  if (mWin) return { tipo: 'winner', num: Number(mWin[1]) }
  const mLos = texto.match(/(?:derrotado|perdedor|derr\.?)\s*(?:do\s*)?jogo\s*(\d+)/i)
  if (mLos) return { tipo: 'loser', num: Number(mLos[1]) }
  return null
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
    round_label: salvo?.round_label ?? `Fase ${roundNum}`,
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

  if (teamId) {
    const teamObj = teams.find(t => t.id === teamId)
    if (teamObj) {
      return {
        sigla: teamObj.opponent?.initials || 'EQ',
        nome: teamObj.opponent?.name || 'Equipa',
        logo: teamObj.opponent?.logo_url || null,
        eOClube: teamObj.opponent_id === null,
        teamId,
        placeholder: null,
        isPlaceholder: false,
        resolvidoDePlaceholder: false,
      }
    }
  }

  const encadeamento = extrairEncadeamentoJogo(placeholder, sourceType, sourceMatchNum)

  if (encadeamento && depth < 6) {
    const targetNum = encadeamento.num
    const isWinner = encadeamento.tipo === 'winner'

    let sourceMatch = allMatches.find(
      cand => cand && obterMetaJogoKnockout(rules, cand, allMatches).match_number === targetNum
    )
    if (!sourceMatch && targetNum === 1) {
      sourceMatch = allMatches.find(cand => cand && Number(cand.matchday ?? 1) === 1)
    }

    if (sourceMatch) {
      const sourceMeta = obterMetaJogoKnockout(rules, sourceMatch, allMatches)
      const ladoApurado = isWinner
        ? determinarVencedorKnockout(sourceMatch, sourceMeta)
        : (determinarVencedorKnockout(sourceMatch, sourceMeta) === 'home' ? 'away' :
           determinarVencedorKnockout(sourceMatch, sourceMeta) === 'away' ? 'home' : null)

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

test('Caso do utilizador: Jogo 3 (Torre vs VENCEDOR JOGO 1) resolve Carcavelos quando Jogo 1 terminou 1-0', () => {
  const matchJogo1 = {
    id: 'm1',
    matchday: 1,
    home_team_id: 't-carc',
    away_team_id: 't-c32',
    home_score: 1,
    away_score: 0,
    status: 'finished',
  }
  const matchJogo3Torre = {
    id: 'm3-torre',
    matchday: 2,
    home_team_id: 't-torre',
    away_team_id: null,
  }

  const rules = {
    knockout_matches: {
      m1: { match_id: 'm1', match_number: 1, matchday: 1 },
      'm3-torre': {
        match_id: 'm3-torre',
        match_number: 3,
        matchday: 2,
        away_placeholder: 'VENCEDOR JOGO 1',
      },
    },
  }

  const allMatches = [matchJogo1, matchJogo3Torre]
  const teams = [
    { id: 't-torre', opponent: { name: 'Torre', initials: 'TOR' } },
    { id: 't-carc', opponent: { name: 'Carcavelos', initials: 'CARC', logo_url: 'carc.png' } },
    { id: 't-c32', opponent: { name: 'Central 32', initials: 'C32' } },
  ]

  const metaTorre = obterMetaJogoKnockout(rules, matchJogo3Torre, allMatches)
  const foraTorre = resolverEquipaKnockout('away', matchJogo3Torre, metaTorre, allMatches, teams, {}, rules)

  assert.equal(foraTorre.isPlaceholder, false)
  assert.equal(foraTorre.nome, 'Carcavelos')
  assert.equal(foraTorre.sigla, 'CARC')
  assert.equal(foraTorre.logo, 'carc.png')
  assert.equal(foraTorre.resolvidoDePlaceholder, true)
})

test('Equipas fixas (ex: Lisbon Casuals ou Tires) têm sempre resolvidoDePlaceholder: false e placeholder: null', () => {
  const matchCasuals = {
    id: 'm-cas',
    matchday: 2,
    home_team_id: 't-zamb',
    away_team_id: 't-lcas',
  }

  const rules = {
    knockout_matches: {
      'm-cas': {
        match_id: 'm-cas',
        match_number: 3,
        matchday: 2,
        away_placeholder: 'VENCEDOR JOGO 1', // residual de configuração anterior
      },
    },
  }

  const teams = [
    { id: 't-zamb', opponent: { name: 'GD Zambujeiro', initials: 'ZAMB' } },
    { id: 't-lcas', opponent: { name: 'Lisbon Casuals', initials: 'LCAS' } },
  ]

  const meta = obterMetaJogoKnockout(rules, matchCasuals, [matchCasuals])
  const fora = resolverEquipaKnockout('away', matchCasuals, meta, [matchCasuals], teams, {}, rules)

  assert.equal(fora.nome, 'Lisbon Casuals')
  assert.equal(fora.isPlaceholder, false)
  assert.equal(fora.resolvidoDePlaceholder, false)
  assert.equal(fora.placeholder, null)
})

test('Determinar vencedor de eliminatória com desempate por penáltis', () => {
  const match = { id: 'm-ko', home_score: 1, away_score: 1 }
  const meta = { home_penalties: 4, away_penalties: 3 }
  assert.equal(determinarVencedorKnockout(match, meta), 'home')

  const metaAway = { home_penalties: 2, away_penalties: 4 }
  assert.equal(determinarVencedorKnockout(match, metaAway), 'away')
})

test('Ficha de jogo: extração de metadados com penáltis para eliminatórias', () => {
  function parseMatchReportMetadata(desc) {
    if (!desc) return { tacticalFormation: '4-3-3', occurrences: '', cleanDescription: '', penalties: null }
    const reportTagMatch = desc.match(/\[MATCH_REPORT:([\s\S]*?)\]/)
    if (reportTagMatch && reportTagMatch[1]) {
      try {
        const parsed = JSON.parse(reportTagMatch[1])
        const cleanDescription = desc.replace(/\[MATCH_REPORT:[\s\S]*?\]/, '').trim()
        const rawFormation = parsed.tactical || '4-3-3'
        return {
          tacticalFormation: rawFormation.replace(/^1-/, ''),
          occurrences: parsed.occurrences || '',
          penalties: (parsed.penalties && typeof parsed.penalties === 'object') ? parsed.penalties : null,
          cleanDescription
        }
      } catch {}
    }
    return { tacticalFormation: '4-3-3', occurrences: '', cleanDescription: desc || '', penalties: null }
  }

  const desc = 'Jogo muito disputado.\\n\\n[MATCH_REPORT:{"tactical":"4-3-3","occurrences":"Golo aos 12\'","penalties":{"home":4,"away":3}}]'
  const res = parseMatchReportMetadata(desc)
  assert.equal(res.tacticalFormation, '4-3-3')
  assert.equal(res.occurrences, "Golo aos 12'")
  assert.deepEqual(res.penalties, { home: 4, away: 3 })
})
