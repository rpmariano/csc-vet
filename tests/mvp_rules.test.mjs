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
// 5. TESTE DE ELEGIBILIDADE DE VOTO (ABERTO A TODOS OS UTILIZADORES AUTENTICADOS)
// ==============================================================================
test('Regra de Elegibilidade: todos os utilizadores autenticados da aplicação podem votar no MVP', () => {
  function verificarElegibilidadeMock(profile) {
    return Boolean(profile && profile.id)
  }

  // 1. Membro da Direção / Admin
  const perfilAdmin = { id: 'admin1', role: 'admin', roles: ['admin', 'direcao'], email: 'rpmariano@gmail.com' }
  assert.equal(verificarElegibilidadeMock(perfilAdmin), true, 'Admin / Direção PODE votar')

  // 2. Treinador
  const perfilTreinador = { id: 'coach1', role: 'coach', roles: ['coach', 'treinador'] }
  assert.equal(verificarElegibilidadeMock(perfilTreinador), true, 'Treinador PODE votar')

  // 3. Jogador Convocado
  const perfilJogadorConvocado = { id: 'player1', role: 'player', roles: ['player'] }
  assert.equal(verificarElegibilidadeMock(perfilJogadorConvocado), true, 'Jogador convocado PODE votar')

  // 4. Jogador NÃO convocado
  assert.equal(verificarElegibilidadeMock(perfilJogadorConvocado), true, 'Jogador não convocado também PODE votar')

  // 5. Adepto
  const perfilAdepto = { id: 'supporter1', role: 'supporter', roles: ['supporter'] }
  assert.equal(verificarElegibilidadeMock(perfilAdepto), true, 'Adepto PODE votar')

  // 6. Visitante não autenticado (sem ID)
  assert.equal(verificarElegibilidadeMock(null), false, 'Visitante não autenticado NÃO pode votar')
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

// ==============================================================================
// 8. TESTE DE DERIVAÇÃO ESTRITA DE PAPÉIS (DIREÇÃO NÃO É TREINADOR NEM JOGADOR)
// ==============================================================================
test('Derivação de papéis: admin é estritamente admin e nunca herda coach ou player', () => {
  const VALID_ROLES = ['player', 'coach', 'admin', 'supporter']

  function extractRolesFromProfile(profile) {
    if (!profile) return []
    if (profile.status === 'inactive') return []
    const rawRole = profile.role
    if (rawRole === 'unassigned') return []

    if (Array.isArray(profile.roles) && profile.roles.length === 0) return []
    const defaultRole = rawRole && VALID_ROLES.includes(rawRole) ? rawRole : undefined
    if (defaultRole === 'supporter' || rawRole === 'supporter') return ['supporter']

    if (Array.isArray(profile.roles) && profile.roles.length > 0) {
      const fromColumn = profile.roles.filter(r => VALID_ROLES.includes(r))
      if (fromColumn.includes('supporter')) return ['supporter']
      if (fromColumn.length > 0) {
        return defaultRole && !fromColumn.includes(defaultRole) ? [...fromColumn, defaultRole] : fromColumn
      }
    }

    if (profile.role === 'admin') return ['admin']
    if (profile.role === 'coach') return ['coach']
    if (profile.role === 'supporter') return ['supporter']
    if (profile.role === 'player') return ['player']
    return []
  }

  const pAdminSemRoles = { id: 'mariano', role: 'admin' }
  const rolesAdmin = extractRolesFromProfile(pAdminSemRoles)
  assert.deepEqual(rolesAdmin, ['admin'])
  assert.ok(!rolesAdmin.includes('coach'), 'Direção NÃO pode ter papel de treinador')
  assert.ok(!rolesAdmin.includes('player'), 'Direção NÃO pode ter papel de jogador')

  const pAdminComRoles = { id: 'mariano', role: 'admin', roles: ['admin'] }
  const rolesAdminComRoles = extractRolesFromProfile(pAdminComRoles)
  assert.deepEqual(rolesAdminComRoles, ['admin'])
})

// ==============================================================================
// ==============================================================================
// 9. TESTE DE CALCULAR ELEITORES: HIERARQUIA ESTRITA DE CARGOS E ACESSO A ADEPTOS
// ==============================================================================
test('calcularEleitoresDoJogo: hierarquia de cargos (jogador > treinador > direção única) e inclusão de adeptos', () => {
  function eAdepto(p) { return p.role === 'supporter' || (p.roles && p.roles.includes('supporter')) }
  function eAdmin(p) { return !eAdepto(p) && (p.role === 'admin' || (p.roles && p.roles.includes('admin'))) }
  function eTreinador(p) { return !eAdepto(p) && (p.role === 'coach' || (p.roles && p.roles.includes('coach'))) }
  function eJogador(p) { return !eAdepto(p) && (p.role === 'player' || (p.roles && p.roles.includes('player'))) }

  function determinarFuncaoPerfilMvpMock(profile, contextoJogo) {
    if (contextoJogo?.foiConvocado || (contextoJogo?.lineupStatus && contextoJogo.lineupStatus !== 'none')) {
      let funcao = 'Convocado'
      if (contextoJogo.lineupStatus === 'starter') funcao = 'Titular'
      else if (contextoJogo.lineupStatus === 'sub') funcao = 'Suplente'
      return { funcao, categoria: 'jogador' }
    }

    const isJog = eJogador(profile)
    const isCoach = eTreinador(profile)
    const isAdmin = eAdmin(profile)

    // 1. Jogador tem prioridade máxima sobre quaisquer cargos acumulados (ex.: Jogador + Direção -> Jogador)
    if (isJog) return { funcao: 'Jogador', categoria: 'jogador' }

    // 2. Treinador tem prioridade sobre Direção (ex.: Treinador + Direção -> Treinador)
    if (isCoach) return { funcao: 'Treinador', categoria: 'staff' }

    // 3. Direção é SÓ quem for unicamente Direção (não joga e não treina)
    if (isAdmin) return { funcao: 'Direção', categoria: 'staff' }

    // 4. Adepto
    if (eAdepto(profile)) return { funcao: 'Adepto', categoria: 'staff' }

    return { funcao: 'Votante', categoria: 'staff' }
  }

  function calcularEleitoresDoJogoMock(allProfiles, callups, stats, votos, currentUserId) {
    const callupMap = new Map((callups || []).map(c => [c.player_id, c]))
    const statMap = new Map((stats || []).map(s => [s.player_id, s]))
    const votosMap = new Map((votos || []).map(v => [v.voter_id, v]))
    const eleitores = []
    const idsProcessados = new Set()

    // 1. Convocados e participantes
    for (const p of allProfiles || []) {
      if (eAdepto(p)) continue
      const callup = callupMap.get(p.id)
      const st = statMap.get(p.id)
      if (callup?.status === 'declined' && !st) continue
      const foiConvocado = Boolean(callup)
      const participou = Boolean(st && (st.lineup_status !== 'none' || st.goals > 0))

      if (foiConvocado || participou) {
        idsProcessados.add(p.id)
        let lineupStatus = st?.lineup_status
        if (!lineupStatus && callup?.notes?.includes('starter')) lineupStatus = 'starter'
        const { funcao, categoria } = determinarFuncaoPerfilMvpMock(p, { foiConvocado: true, lineupStatus })
        const voto = votosMap.get(p.id)
        eleitores.push({ id: p.id, name: p.name, funcao, categoria, jaVotou: Boolean(voto) })
      }
    }

    // 2. Elementos com funções técnicas ou de direção
    for (const p of allProfiles || []) {
      if (idsProcessados.has(p.id)) continue
      if (eAdepto(p) || p.status === 'inactive') continue
      const isCoach = eTreinador(p)
      const isAdmin = eAdmin(p)

      if (isCoach || isAdmin) {
        idsProcessados.add(p.id)
        const { funcao, categoria } = determinarFuncaoPerfilMvpMock(p)
        const voto = votosMap.get(p.id)
        eleitores.push({ id: p.id, name: p.name, funcao, categoria, jaVotou: Boolean(voto) })
      }
    }

    // 3. Outros utilizadores que tenham votado (ex: adeptos)
    for (const p of allProfiles || []) {
      if (idsProcessados.has(p.id)) continue
      const voto = votosMap.get(p.id)
      if (voto) {
        idsProcessados.add(p.id)
        const { funcao, categoria } = determinarFuncaoPerfilMvpMock(p)
        eleitores.push({ id: p.id, name: p.name, funcao, categoria, jaVotou: true })
      }
    }

    // 4. Utilizador atual se autenticado
    if (currentUserId && !idsProcessados.has(currentUserId)) {
      const meProfile = allProfiles?.find(p => p.id === currentUserId)
      if (meProfile && meProfile.status !== 'inactive') {
        idsProcessados.add(meProfile.id)
        const { funcao, categoria } = determinarFuncaoPerfilMvpMock(meProfile)
        const voto = votosMap.get(meProfile.id)
        eleitores.push({ id: meProfile.id, name: meProfile.name, funcao, categoria, jaVotou: Boolean(voto) })
      }
    }

    return eleitores
  }

  const perfis = [
    // 1. Titular convocado que também é admin no clube
    { id: 'rocha', name: 'Rocha', role: 'player', roles: ['player', 'admin'] },
    // 2. Namora: jogador que acumula com direção, NÃO foi convocado para este jogo
    { id: 'namora', name: 'Namora', role: 'player', roles: ['player', 'admin'] },
    // 3. J. Costa: jogador que acumula com direção, NÃO foi convocado para este jogo
    { id: 'jcosta', name: 'J. Costa', role: 'player', roles: ['player', 'admin'] },
    // 4. Ramalho: treinador que também tem admin
    { id: 'ramalho', name: 'Ramalho', role: 'coach', roles: ['coach', 'admin'] },
    // 5. Marco Neves: treinador
    { id: 'marco', name: 'Marco Neves', role: 'coach', roles: ['coach'] },
    // 6. Luis Alexandre Sousa: unicamente Direção
    { id: 'luis', name: 'Luis Alexandre Sousa', role: 'admin', roles: ['admin'] },
    // 7. Sónia: adepta que já votou
    { id: 'sonia', name: 'Sónia Adepta', role: 'supporter', roles: ['supporter'] },
  ]

  const convocatorias = [
    { player_id: 'rocha', status: 'accepted', notes: 'starter' }
  ]

  const votos = [
    { voter_id: 'sonia', player1_id: 'rocha', player2_id: 'namora' }
  ]

  const eleitores = calcularEleitoresDoJogoMock(perfis, convocatorias, [], votos)

  // Validações estritas conforme o pedido do utilizador:
  // 1. Rocha é titular
  const eleitorRocha = eleitores.find(e => e.id === 'rocha')
  assert.equal(eleitorRocha.funcao, 'Titular', 'Rocha convocado titular surge como Titular')
  assert.equal(eleitorRocha.categoria, 'jogador')

  // 2. Namora acumula Jogador + Direção -> DEVE APARECER JOGADOR (não Direção!)
  const eleitorNamora = eleitores.find(e => e.id === 'namora')
  assert.equal(eleitorNamora.funcao, 'Jogador', 'Namora (jogador + direção) surge estritamente como Jogador')
  assert.equal(eleitorNamora.categoria, 'jogador')

  // 3. J. Costa acumula Jogador + Direção -> DEVE APARECER JOGADOR (não Direção!)
  const eleitorJCosta = eleitores.find(e => e.id === 'jcosta')
  assert.equal(eleitorJCosta.funcao, 'Jogador', 'J. Costa (jogador + direção) surge estritamente como Jogador')
  assert.equal(eleitorJCosta.categoria, 'jogador')

  // 4. Ramalho acumula Treinador + Direção -> DEVE APARECER TREINADOR (não Direção!)
  const eleitorRamalho = eleitores.find(e => e.id === 'ramalho')
  assert.equal(eleitorRamalho.funcao, 'Treinador', 'Ramalho (treinador + direção) surge como Treinador')
  assert.equal(eleitorRamalho.categoria, 'staff')

  // 5. Marco Neves é Treinador
  const eleitorMarco = eleitores.find(e => e.id === 'marco')
  assert.equal(eleitorMarco.funcao, 'Treinador', 'Marco Neves surge como Treinador')

  // 6. Luis Alexandre Sousa é unicamente Direção -> DEVE SER O ÚNICO COM DIREÇÃO!
  const eleitorLuis = eleitores.find(e => e.id === 'luis')
  assert.equal(eleitorLuis.funcao, 'Direção', 'Luis Alexandre Sousa surge como Direção')
  assert.equal(eleitorLuis.categoria, 'staff')

  const todosComDirecao = eleitores.filter(e => e.funcao === 'Direção')
  assert.equal(todosComDirecao.length, 1, 'Apenas quem for unicamente Direção tem a função Direção')
  assert.equal(todosComDirecao[0].id, 'luis')

  // 7. Sónia é Adepta e votou -> Surge com função Adepto
  const eleitorSonia = eleitores.find(e => e.id === 'sonia')
  assert.equal(eleitorSonia.funcao, 'Adepto', 'Adepta que votou surge com a função Adepto')
  assert.equal(eleitorSonia.categoria, 'staff')
  assert.equal(eleitorSonia.jaVotou, true)
})

// ==============================================================================
// 7. TESTE DE ENCERRAMENTO DE VOTAÇÃO: AMIGÁVEIS E 1ª JORNADA
// ==============================================================================
test('isVotacaoMvpAberta fecha votação para amigáveis passados, 1ª jornada e mantém aberto AFD Torre (18/10/2026)', () => {
  function isVotacaoMvpAbertaMock(event) {
    if (!event) return true

    // 1. Tag explícita na descrição
    if (event.description?.includes('[MVP_CLOSED]') || event.description?.includes('mvp_voting_closed:true')) {
      return false
    }

    const eventDate = event.date_time ? new Date(event.date_time) : null
    const dataCortePassado = new Date('2026-10-12T23:59:59+01:00').getTime()

    // 2. Os dois jogos amigáveis passados de pré-época e 1ª jornada (11/10/2026 vs Estrelas Lisboa)
    if (eventDate && eventDate.getTime() <= dataCortePassado) {
      return false
    }

    // 3. Jogo da 1ª jornada contra Estrelas Lisboa (11/10/2026)
    const opp = Array.isArray(event.opponent) ? event.opponent[0] : event.opponent
    const oppName = ((opp?.name || '') + ' ' + (event.opponent_name || '') + ' ' + (event.title || '')).toLowerCase()
    const oppInitials = (opp?.initials || '').toLowerCase()
    const isElis = oppName.includes('estrelas') || oppInitials.includes('elis')
    if (isElis && eventDate && eventDate.toISOString().slice(0, 10) === '2026-10-11') {
      return false
    }

    // 4. Jogo de 18 de Outubro de 2026 (ex: vs AFD Torre) e semana em curso:
    const isJogoSemana18Outubro = eventDate
      ? (eventDate.getTime() > dataCortePassado && eventDate.getTime() <= new Date('2026-10-19T23:59:59+01:00').getTime())
      : false

    if (isJogoSemana18Outubro) {
      return true
    }

    const isTorre = oppName.includes('torre') || oppInitials.includes('tor') || oppName.includes('afd')
    if (isTorre && eventDate && eventDate.getTime() > dataCortePassado) {
      return true
    }

    // 5. Flag explícita na base de dados
    if (event.mvp_voting_closed === true) {
      return false
    }

    return true
  }

  // 1. Amigável passado (20/09/2026)
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jogo de Preparação 1',
      date_time: '2026-09-20T17:00:00Z',
      is_friendly: true,
    }),
    false,
    'Amigável passado deve ter votação encerrada'
  )

  // 2. Amigável passado 2 (27/09/2026)
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jogo de Preparação 2',
      date_time: '2026-09-27T17:00:00Z',
      is_friendly: true,
    }),
    false,
    'Segundo amigável passado deve ter votação encerrada'
  )

  // 3. Jogo da 1ª jornada (11/10/2026)
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jornada 1',
      date_time: '2026-10-11T10:00:00Z',
      matchday: 1,
      is_friendly: false,
    }),
    false,
    'Jogo da 1ª jornada deve ter votação encerrada'
  )

  // 4. Jogo da 1ª jornada por adversário Estrelas Lisboa
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jogo vs Estrelas Lisboa',
      date_time: '2026-10-11T10:00:00Z',
      opponent: { name: 'Estrelas Lisboa', initials: 'ELIS' },
      is_friendly: false,
    }),
    false,
    'Jogo contra Estrelas Lisboa da 1ª jornada deve ter votação encerrada'
  )

  // 5. Jogo de ontem 18/10/2026 vs AFD Torre (DEVE ESTAR ABERTO, mesmo com resquício de flag)
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jogo vs AFD Torre',
      date_time: '2026-10-18T16:00:00Z',
      opponent: { name: 'AFD Torre', initials: 'TOR' },
      mvp_voting_closed: false,
    }),
    true,
    'Jogo vs AFD Torre de 18/10/2026 DEVE TER VOTAÇÃO ABERTA'
  )

  // 5b. AFD Torre mesmo que a BD ainda tivesse mvp_voting_closed: true
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jogo vs AFD Torre',
      date_time: '2026-10-18T16:00:00Z',
      opponent: { name: 'AFD Torre', initials: 'TOR' },
      mvp_voting_closed: true,
    }),
    true,
    'Jogo vs AFD Torre de 18/10/2026 sobrepõe-se a resquício de fecho e fica aberto'
  )

  // 6. Outro jogo após 12/10 explicitamente encerrado
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Outro Jogo Encerrado pelo Treinador',
      date_time: '2026-10-25T10:00:00Z',
      opponent: { name: 'Outro Clube', initials: 'OC' },
      mvp_voting_closed: true,
    }),
    false,
    'Outro jogo com mvp_voting_closed = true e que não seja AFD Torre fica encerrado'
  )

  // 7. Jogo da 2ª jornada aberto normalmente
  assert.equal(
    isVotacaoMvpAbertaMock({
      title: 'Jornada 2',
      date_time: '2026-10-25T10:00:00Z',
      matchday: 2,
      is_friendly: false,
    }),
    true,
    'Jogo normal após 12/10 deve estar aberto para votação quando ocorrer'
  )
})

// ==============================================================================
// 8. TESTE DE PRESERVAÇÃO E FORMATAÇÃO DE SIGLAS DE ADVERSÁRIOS
// ==============================================================================
test('formatOpponentSigla respeita rigorosamente a sigla definida pelo utilizador (mesmo com espaços ou > 6 caracteres)', () => {
  const formatOpponentSigla = (opp) => {
    if (!opp) return 'ADV'
    const init = opp.initials?.trim()
    if (init) {
      return init.toUpperCase()
    }
    if (opp.name) {
      const words = opp.name.trim().split(/\s+/).filter(w => w.length > 1)
      if (words.length > 1) {
        return words.map(w => w[0].toUpperCase()).join('').substring(0, 6)
      }
      return opp.name.substring(0, 4).toUpperCase()
    }
    return 'ADV'
  }

  // Siglas com espaços
  assert.equal(formatOpponentSigla({ name: 'Veteranos Sul', initials: 'V SUL' }), 'V SUL')
  assert.equal(formatOpponentSigla({ name: 'DS Private TV', initials: 'DS P' }), 'DS P')
  assert.equal(formatOpponentSigla({ name: 'Grupo Desportivo Pescadores', initials: 'GD P' }), 'GD P')

  // Siglas com mais de 6 caracteres
  assert.equal(formatOpponentSigla({ name: 'Estrelas Lisboa', initials: 'ESTRELAS' }), 'ESTRELAS')
  assert.equal(formatOpponentSigla({ name: 'Lisbon Casuals', initials: 'CASUALS' }), 'CASUALS')

  // Fallback quando não há sigla
  assert.equal(formatOpponentSigla({ name: 'Melo Falcão', initials: null }), 'MF')
  assert.equal(formatOpponentSigla(null), 'ADV')
})

test('Sincronização de dados oficiais NÃO sobrepõe siglas existentes', () => {
  const advExistente = {
    id: 'opp-1',
    name: 'Estrelas Lisboa',
    initials: 'ESTRELAS_PERSONALIZADA',
    home_field_id: null,
  }

  const eqOficial = {
    nome: 'Estrelas Lisboa',
    sigla: 'ELIS',
    campoId: 'field-123',
  }

  const updatePayload = {}
  if (!advExistente.initials || !advExistente.initials.trim()) {
    updatePayload.initials = eqOficial.sigla
  }
  if (!advExistente.home_field_id && eqOficial.campoId) {
    updatePayload.home_field_id = eqOficial.campoId
  }

  assert.equal(updatePayload.initials, undefined, 'A sigla personalizada NÃO pode ser sobreposta')
  assert.equal(updatePayload.home_field_id, 'field-123', 'Campos em falta continuam a ser preenchidos')
})

// ==============================================================================
// 9. TESTE DO FILTRO DE NOTIFICAÇÕES PUSH DE VOTO MVP (CARTEIRO / EDGE FUNCTION)
// ==============================================================================
test('Filtro de notificações voto_mvp no carteiro: exclui jogos passados, amigáveis, e Direção pura', () => {
  const eventos = [
    { id: 'ev-amigavel', is_friendly: true, date_time: '2026-10-04T10:00:00Z', mvp_voting_closed: true },
    { id: 'ev-jornada1', is_friendly: false, matchday: 1, date_time: '2026-10-11T10:00:00Z', mvp_voting_closed: true },
    { id: 'ev-afdtorre', is_friendly: false, matchday: 2, date_time: '2026-10-18T16:00:00Z', opponent: { name: 'AFD Torre', initials: 'TOR' }, mvp_voting_closed: false },
    { id: 'ev-jornada3-futura', is_friendly: false, matchday: 3, date_time: '2026-10-25T10:00:00Z', mvp_voting_closed: false },
  ]
  const eventoMap = new Map(eventos.map(e => [e.id, e]))

  const perfis = [
    { id: 'user-rui', email: 'rpmariano@gmail.com', role: 'admin', roles: ['admin'] },
    { id: 'user-admin-puro', email: 'outro.admin@csc.pt', role: 'admin', roles: ['admin'] },
    { id: 'user-treinador', email: 'treinador@csc.pt', role: 'coach', roles: ['coach'] },
    { id: 'user-jogador-convocado', email: 'jogador@csc.pt', role: 'player', roles: ['player'] },
  ]
  const profileMap = new Map(perfis.map(p => [p.id, p]))

  const callups = [
    { event_id: 'ev-afdtorre', player_id: 'user-jogador-convocado', status: 'called' },
    { event_id: 'ev-jornada3-futura', player_id: 'user-jogador-convocado', status: 'called' }
  ]
  const convocadosSet = new Set(callups.map(c => `${c.event_id}_${c.player_id}`))

  const fila = [
    // 1. Rui Mariano no jogo da 1ª jornada (DEVE SER BLOQUEADO)
    { tipo: 'voto_mvp', origem_id: 'ev-jornada1', profile_id: 'user-rui' },
    // 2. Rui Mariano no jogo amigável (DEVE SER BLOQUEADO)
    { tipo: 'voto_mvp', origem_id: 'ev-amigavel', profile_id: 'user-rui' },
    // 3. Rui Mariano no jogo do AFD Torre (DEVE SER BLOQUEADO por ser admin e não convocado)
    { tipo: 'voto_mvp', origem_id: 'ev-afdtorre', profile_id: 'user-rui' },
    // 4. Outro admin não convocado no jogo AFD Torre (DEVE SER BLOQUEADO)
    { tipo: 'voto_mvp', origem_id: 'ev-afdtorre', profile_id: 'user-admin-puro' },
    // 5. Treinador no jogo da 1ª jornada (DEVE SER BLOQUEADO pois o jogo já encerrou)
    { tipo: 'voto_mvp', origem_id: 'ev-jornada1', profile_id: 'user-treinador' },
    // 6. Treinador no jogo AFD Torre de 18/10 (DEVE PASSAR - jogo ativo!)
    { tipo: 'voto_mvp', origem_id: 'ev-afdtorre', profile_id: 'user-treinador' },
    // 7. Jogador convocado no jogo AFD Torre de 18/10 (DEVE PASSAR - jogo ativo!)
    { tipo: 'voto_mvp', origem_id: 'ev-afdtorre', profile_id: 'user-jogador-convocado' },
  ]

  const filaFiltrada = fila.filter(a => {
    if (a.tipo !== 'voto_mvp') return true
    if (!a.origem_id) return false

    const ev = eventoMap.get(a.origem_id)
    if (!ev) return false

    const dtTime = ev.date_time ? new Date(ev.date_time).getTime() : 0
    const legacyCutoff = new Date('2026-10-12T23:59:59+01:00').getTime()
    if (dtTime > 0 && dtTime <= legacyCutoff) return false

    const opp = Array.isArray(ev.opponent) ? ev.opponent[0] : ev.opponent
    const oppName = ((opp?.name || '') + ' ' + (ev.title || '')).toLowerCase()
    const isAfdTorre = oppName.includes('torre') || oppName.includes('afd')

    if (!isAfdTorre && ev.mvp_voting_closed === true) return false

    const p = profileMap.get(a.profile_id)
    if (p) {
      const email = (p.email || '').toLowerCase().trim()
      if (email === 'rpmariano@gmail.com') return false

      const isDirecao = p.role === 'admin' || (Array.isArray(p.roles) && p.roles.includes('admin'))
      const foiConvocado = convocadosSet.has(`${a.origem_id}_${a.profile_id}`)

      if (isDirecao && !foiConvocado) return false
    }

    return true
  })

  assert.equal(filaFiltrada.length, 2, 'Apenas 2 avisos legítimos devem ser enviados')
  assert.equal(filaFiltrada[0].profile_id, 'user-treinador', 'Treinador legítimo no jogo do AFD Torre passa')
  assert.equal(filaFiltrada[1].profile_id, 'user-jogador-convocado', 'Jogador convocado legítimo no jogo do AFD Torre passa')
  assert.ok(!filaFiltrada.some(a => a.profile_id === 'user-rui'), 'Rui Mariano NUNCA recebe avisos de MVP')
  assert.ok(!filaFiltrada.some(a => a.origem_id === 'ev-jornada1'), 'Jogo da 1ª jornada NUNCA gera avisos')
  assert.ok(!filaFiltrada.some(a => a.origem_id === 'ev-amigavel'), 'Jogos amigáveis NUNCA geram avisos')
})

// ==============================================================================
// 10. TESTE: ELIMINAÇÃO DE NOTIFICAÇÕES PUSH DE FALTA DE CONVOCATÓRIA E MANUTENÇÃO NA HOMEPAGE
// ==============================================================================
test('Notificações de falta de convocatória: push descartado, mas lógica da homepage intacta', () => {
  // 1. O carteiro descarta avisos do tipo 'sem-convocatoria', 'evento_sem_convocatoria' ou 'convocatoria_aberta'
  const filaCarteiro = [
    { tipo: 'convocatoria', titulo: 'Convocatória Jogo' },
    { tipo: 'sem-convocatoria', titulo: 'Evento sem convocatória' },
    { tipo: 'evento_sem_convocatoria', titulo: 'Evento sem convocatória' },
    { tipo: 'convocatoria_aberta', titulo: 'Convocatória aberta' },
    { tipo: 'comunicado', titulo: 'Novo comunicado' },
  ]

  const filaAposFiltro = filaCarteiro.filter(
    a => a.tipo !== 'sem-convocatoria' && a.tipo !== 'evento_sem_convocatoria' && a.tipo !== 'convocatoria_aberta'
  )

  assert.equal(filaAposFiltro.length, 2, 'Apenas convocatórias e comunicados passam')
  assert.ok(!filaAposFiltro.some(a => a.tipo === 'sem-convocatoria'), 'sem-convocatoria eliminado dos push')
  assert.ok(!filaAposFiltro.some(a => a.tipo === 'evento_sem_convocatoria'), 'evento_sem_convocatoria eliminado dos push')
  assert.ok(!filaAposFiltro.some(a => a.tipo === 'convocatoria_aberta'), 'convocatoria_aberta eliminado dos push')

  // 2. A lógica da homepage continua a detetar eventos sem convocatória para aviso visual em ecra
  const eventosFuturos = [
    { id: 'ev1', title: 'Jogo Jornada 2', type: 'match', is_active: true, date_time: '2026-10-25T10:00:00Z' },
    { id: 'ev2', title: 'Jogo Jornada 3', type: 'match', is_active: true, date_time: '2026-11-01T10:00:00Z' },
  ]
  const callups = [
    { event_id: 'ev1', player_id: 'p1' }, // ev1 tem convocados
  ]

  const eventosSemConvocadosNaHome = eventosFuturos.filter(
    ev => !callups.some(c => c.event_id === ev.id)
  )

  assert.equal(eventosSemConvocadosNaHome.length, 1, 'ev2 continua identificado como evento sem convocatória')
  assert.equal(eventosSemConvocadosNaHome[0].id, 'ev2', 'ev2 surge na FaixaSemConvocatoria da Home')
})




