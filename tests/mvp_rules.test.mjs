import test from 'node:test'
import assert from 'node:assert/strict'

// ==============================================================================
// 1. TESTE DA REGRA DE PONTOS DO MVP POR JOGO (3 pts 1º Lugar, 1 pt 2º Lugar)
// ==============================================================================
test('MVP do jogo é decidido por PONTOS (3 pts para melhor, 1 pt para 2º melhor)', () => {
  // Cenário:
  // Jogador A recebe 1 voto para melhor (1º) -> 3 pontos
  // Jogador B recebe 2 votos para 2º melhor -> 2 pontos
  // Jogador C recebe 0 votos
  const votos = [
    { voter_id: 'voter1', player1_id: 'playerA', player2_id: 'playerB' },
    { voter_id: 'voter2', player1_id: 'playerD', player2_id: 'playerB' },
  ]

  const pontosMap = {}
  const votosTotalMap = {}

  for (const v of votos) {
    if (v.player1_id) {
      pontosMap[v.player1_id] = (pontosMap[v.player1_id] || 0) + 3
      votosTotalMap[v.player1_id] = (votosTotalMap[v.player1_id] || 0) + 1
    }
    if (v.player2_id) {
      pontosMap[v.player2_id] = (pontosMap[v.player2_id] || 0) + 1
      votosTotalMap[v.player2_id] = (votosTotalMap[v.player2_id] || 0) + 1
    }
  }

  assert.equal(pontosMap['playerA'], 3, 'Jogador A deve ter 3 pontos')
  assert.equal(pontosMap['playerB'], 2, 'Jogador B deve ter 2 pontos')
  assert.equal(votosTotalMap['playerA'], 1, 'Jogador A teve 1 voto')
  assert.equal(votosTotalMap['playerB'], 2, 'Jogador B teve 2 votos')

  // Quem ganha o MVP do jogo é quem tem mais PONTOS, não quem tem mais votos
  let maxPontos = 0
  for (const p of Object.values(pontosMap)) {
    if (p > maxPontos) maxPontos = p
  }

  const mvpIds = Object.entries(pontosMap).filter(([, p]) => p === maxPontos).map(([id]) => id)

  assert.deepEqual(mvpIds, ['playerA', 'playerD'], 'Jogador A e D empatam no topo com 3 pontos cada')
  assert.ok(!mvpIds.includes('playerB'), 'Jogador B NÃO pode ganhar o MVP apesar de ter mais votos (2 votos vs 1 voto)')
})

// ==============================================================================
// 2. TESTE DA COMPETIÇÃO TOTAL DE ÉPOCA (CONTA NÚMERO DE VOTOS, NÃO PONTOS)
// ==============================================================================
test('Para a época inteira (Mais Votados), contam os VOTOS e não os pontos', () => {
  // Jogador A: recebeu 1 voto de 1º lugar (3 pontos no jogo, mas 1 voto para a época)
  // Jogador B: recebeu 2 votos de 2º lugar (2 pontos no jogo, mas 2 votos para a época)
  const votos = [
    { event_id: 'm1', voter_id: 'v1', player1_id: 'playerA', player2_id: 'playerB' },
    { event_id: 'm1', voter_id: 'v2', player1_id: 'playerC', player2_id: 'playerB' },
  ]

  const leaderboardStats = {
    playerA: { totalVotes: 0, mvpWins: 1 },
    playerB: { totalVotes: 0, mvpWins: 0 },
    playerC: { totalVotes: 0, mvpWins: 1 },
  }

  for (const v of votos) {
    const pids = [v.player1_id, v.player2_id]
    for (const pid of pids) {
      if (leaderboardStats[pid]) {
        leaderboardStats[pid].totalVotes += 1
      }
    }
  }

  assert.equal(leaderboardStats.playerA.totalVotes, 1, 'Jogador A tem 1 voto na época')
  assert.equal(leaderboardStats.playerB.totalVotes, 2, 'Jogador B tem 2 votos na época')

  // Na tabela de Mais Votados, Jogador B fica à frente de Jogador A
  const rankingTotalVotes = Object.values(leaderboardStats)
    .filter(p => p.totalVotes > 0)
    .sort((a, b) => {
      if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
      if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
      return 0
    })

  assert.equal(rankingTotalVotes[0].totalVotes, 2, 'O 1º classificado é o Jogador B com 2 votos')
  assert.equal(rankingTotalVotes[1].totalVotes, 1, 'O 2º classificado tem 1 voto')
})

// ==============================================================================
// 3. TESTE DE DESEMPATE EM CASO DE IGUALDADE DE VOTOS (GANHA QUEM TEM MAIS MVPS)
// ==============================================================================
test('Desempate nos Mais Votados: em caso de igualdade de votos, desempata quem tem mais prémios MVP', () => {
  const jogadores = [
    { id: 'j1', name: 'Atleta Um', totalVotes: 5, mvpWins: 1 },
    { id: 'j2', name: 'Atleta Dois', totalVotes: 5, mvpWins: 3 }, // mais MVPs!
    { id: 'j3', name: 'Atleta Tres', totalVotes: 4, mvpWins: 2 },
  ]

  const ordenados = [...jogadores].sort((a, b) => {
    if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
    if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
    return a.name.localeCompare(b.name, 'pt')
  })

  assert.equal(ordenados[0].id, 'j2', 'Atleta Dois deve ser o 1º porque tem 3 MVPs contra 1 MVP do Atleta Um')
  assert.equal(ordenados[1].id, 'j1', 'Atleta Um deve ser o 2º')
  assert.equal(ordenados[2].id, 'j3', 'Atleta Tres deve ser o 3º')
})

// ==============================================================================
// 4. TESTE DA TABELA DE MAIS PRÉMIOS MVP (APENAS QUEM TEM MVPS > 0)
// ==============================================================================
test('Tabela de Mais Prémios MVP: apenas lista atletas com mvpWins > 0', () => {
  const plantel = [
    { id: 'marcelo', name: 'Marcelo', mvpWins: 1, totalVotes: 4 },
    { id: 'pp', name: 'PP', mvpWins: 0, totalVotes: 3 }, // 0 MVPs!
    { id: 'rui', name: 'Rui', mvpWins: 0, totalVotes: 0 },
  ]

  const rankingMvpWins = plantel
    .filter(p => p.mvpWins > 0)
    .sort((a, b) => {
      if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
      if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
      return a.name.localeCompare(b.name, 'pt')
    })

  assert.equal(rankingMvpWins.length, 1, 'Apenas 1 atleta deve constar na tabela de MVPs')
  assert.equal(rankingMvpWins[0].id, 'marcelo', 'Marcelo é o único classificado')
  assert.ok(!rankingMvpWins.some(p => p.id === 'pp'), 'PP não deve aparecer com 0 MVPs')
})

// ==============================================================================
// 5. TESTE DE ELEGIBILIDADE DE VOTO (APENAS TREINADORES E JOGADORES CONVOCADOS)
// ==============================================================================
test('Regra de Elegibilidade: direção/admin pura NÃO vota, apenas treinador e jogador convocado votam', () => {
  function eTreinador(p) {
    if (!p) return false
    if (p.role === 'coach') return true
    if (Array.isArray(p.roles) && (p.roles.includes('coach') || p.roles.includes('treinador'))) return true
    return false
  }

  function eJogador(p) {
    if (!p) return false
    if (p.role === 'player') return true
    if (Array.isArray(p.roles) && (p.roles.includes('player') || p.roles.includes('jogador'))) return true
    return false
  }

  function verificarElegibilidadeMock(profile, callup, stat) {
    const isCoach = eTreinador(profile)
    const isPlayer = eJogador(profile)
    const foiConvocado = callup && callup.status !== 'declined'
    const participou = Boolean(stat)

    // Apenas treinadores ou atletas convocados/que jogaram
    return isCoach || (isPlayer && (foiConvocado || participou))
  }

  // 1. Membro da Direção / Admin puro (sem convocatória, sem papel de treinador)
  const perfilAdmin = { id: 'admin1', role: 'admin', roles: ['admin', 'direcao'], email: 'rpmariano@gmail.com' }
  assert.equal(verificarElegibilidadeMock(perfilAdmin, null, null), false, 'Admin / Direção pura NÃO pode votar')

  // 2. Treinador (não convocado como atleta)
  const perfilTreinador = { id: 'coach1', role: 'coach', roles: ['coach', 'treinador'] }
  assert.equal(verificarElegibilidadeMock(perfilTreinador, null, null), true, 'Treinador PODE votar')

  // 3. Jogador Convocado (aceite)
  const perfilJogadorConvocado = { id: 'player1', role: 'player', roles: ['player'] }
  assert.equal(verificarElegibilidadeMock(perfilJogadorConvocado, { status: 'accepted' }, null), true, 'Jogador convocado PODE votar')

  // 4. Jogador NÃO convocado
  assert.equal(verificarElegibilidadeMock(perfilJogadorConvocado, null, null), false, 'Jogador não convocado NÃO pode votar')

  // 5. Jogador que recusou convocatória e não jogou
  assert.equal(verificarElegibilidadeMock(perfilJogadorConvocado, { status: 'declined' }, null), false, 'Jogador que recusou convocatória NÃO pode votar')

  // 6. Adepto
  const perfilAdepto = { id: 'supporter1', role: 'supporter', roles: ['supporter'] }
  assert.equal(verificarElegibilidadeMock(perfilAdepto, null, null), false, 'Adepto NÃO pode votar')
})

// ==============================================================================
// 6. TESTE DE NÃO-ALTERAÇÃO DE VOTO APÓS SUBMISSÃO
// ==============================================================================
test('Imutabilidade do voto: voto existente não pode ser alterado', () => {
  const baseDeDadosVotos = [
    { event_id: 'game1', voter_id: 'player1', player1_id: 'pA', player2_id: 'pB' }
  ]

  function tentarSubmeterVoto(eventId, voterId, p1, p2) {
    if (p1 === p2) return { ok: false, error: 'Dois jogadores diferentes.' }
    const jaVotou = baseDeDadosVotos.some(v => v.event_id === eventId && v.voter_id === voterId)
    if (jaVotou) {
      return { ok: false, error: 'O teu voto já foi submetido anteriormente e não pode ser alterado.' }
    }
    baseDeDadosVotos.push({ event_id: eventId, voter_id: voterId, player1_id: p1, player2_id: p2 })
    return { ok: true }
  }

  // Tentativa de alterar o voto do player1
  const res = tentarSubmeterVoto('game1', 'player1', 'pC', 'pD')
  assert.equal(res.ok, false)
  assert.match(res.error, /não pode ser alterado/)
})

// ==============================================================================
// 7. TESTE DE MEMORIZAÇÃO E DISPENSA DE ALERTA NO LOCALSTORAGE
// ==============================================================================
test('Alerta pode ser dispensado e lembrado localmente', () => {
  const store = {}
  const mockLocalStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val) },
  }

  const eventId = 'match_123'
  // Inicialmente não está dispensado
  assert.equal(mockLocalStorage.getItem(`csc_mvp_alerta_dispensado_${eventId}`), null)

  // Ao dispensar:
  mockLocalStorage.setItem(`csc_mvp_alerta_dispensado_${eventId}`, 'true')
  assert.equal(mockLocalStorage.getItem(`csc_mvp_alerta_dispensado_${eventId}`), 'true')

  // Verificação de jogos pendentes ignora os dispensados
  const jogos = [{ id: 'match_123' }, { id: 'match_456' }]
  const pendentesNaoDispensados = jogos.filter(
    j => mockLocalStorage.getItem(`csc_mvp_alerta_dispensado_${j.id}`) !== 'true'
  )

  assert.equal(pendentesNaoDispensados.length, 1)
  assert.equal(pendentesNaoDispensados[0].id, 'match_456')
})
