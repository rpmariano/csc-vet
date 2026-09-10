import { formatClubSigla, formatOpponentSigla } from './siglas'

/**
 * A classificação de um grupo de torneio — pontos, jogos e desempates.
 *
 * Vivia dentro da `StandingsPage`, e por isso a Home só podia dizer quantas
 * jornadas havia: duplicar cem linhas de desempates para lá criava duas
 * classificações que podiam discordar, que é pior do que não ter nenhuma.
 * Está aqui para os dois ecrãs fazerem a mesma conta uma só vez.
 *
 * A conta lê `tournament_matches`, e mais nada: os jogos entre as outras
 * equipas da série são lançados à mão na Classificação, e os nossos chegam lá
 * espelhados do evento (`sincronizarJogoNaJornada`, em `jornadaDoJogo.ts`) —
 * a ficha de jogo lança o resultado nos dois sítios ao mesmo tempo. Só contam
 * os que têm resultado.
 *
 * Houve aqui um segundo caminho, que ia buscar os nossos jogos a `events` com
 * `status = 'finished'` e `home_away = 'casa'`: nenhum desses valores existe
 * no esquema, e a condição nunca deu verdade uma única vez.
 */

/*
  Uma equipa de torneio mostra-se pela sigla e pelo emblema, e nao pelo nome
  por extenso: numa tabela de classificacao com dez colunas, "Clube Atletismo
  do Montijo" nao cabe e sai truncado a meio, enquanto "CA MONTIJO" cabe.
  Sao as mesmas funcoes que a Agenda usa nos placares, para o mesmo adversario
  nao ter duas siglas conforme o ecra.

  A linha do proprio clube e a que tinha o emblema em falta: o `logo` era
  `isCSC ? null : ...`, portanto o clube ficava sempre com o escudo generico,
  mesmo tendo emblema em `club_settings`.
*/
export const equipaDoTorneio = (
  team: { opponent_id?: string | null; opponent?: { name?: string; initials?: string | null; logo_url?: string | null } | null } | null | undefined,
  clube: { initials?: string | null; logo_url?: string | null } | null | undefined,
): { sigla: string; logo: string | null; eOClube: boolean } => {
  if (!team?.opponent_id) {
    return {
      sigla: formatClubSigla(clube?.initials),
      logo: clube?.logo_url ?? null,
      eOClube: true,
    }
  }
  return {
    /* A sigla como a direção a escreveu — "CA Montijo" —, e não a que o
       `formatOpponentSigla` reconstrói para os placares, que recusa espaços e
       corta a seis letras: desse lado "Clube Atletismo do Montijo" dá "CADM",
       que ninguém escreveu. Numa tabela há largura para a sigla a sério; a
       reconstrução fica de reserva, para um adversário sem sigla nenhuma. */
    sigla: team.opponent?.initials?.trim() || formatOpponentSigla(team.opponent),
    logo: team.opponent?.logo_url ?? null,
    eOClube: false,
  }
}

export interface EquipaDoGrupo {
  id: string
  group_id?: string | null
  /** `null` é o próprio clube — é assim que ele se distingue na tabela. */
  opponent_id: string | null
  points_carryover?: number | null
}

export interface JogoDaSerie {
  group_id: string
  status?: string | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
}

interface Confronto {
  p: number
  gm: number
  gs: number
}

export interface LinhaClassificacao<T extends EquipaDoGrupo = EquipaDoGrupo> {
  team: T
  /** Pontos, jogos, vitórias, empates, derrotas. */
  p: number
  j: number
  v: number
  e: number
  d: number
  /** Golos marcados, sofridos e a diferença. */
  gm: number
  gs: number
  dg: number
  /** O que aconteceu contra cada uma das outras — serve os desempates. */
  headToHead: Record<string, Confronto>
}

/** Um jogo só conta para a classificação com estado e placar. */
export const jogoTerminado = (m: { status?: string | null; home_score: number | null; away_score: number | null }) =>
  m.status === 'finished' && m.home_score !== null && m.away_score !== null

/**
 * A tabela de um grupo, já ordenada: pontos, confronto direto (pontos,
 * diferença e golos marcados entre as duas), e só depois a diferença e os
 * golos gerais.
 */
export const calcularClassificacao = <T extends EquipaDoGrupo>(
  teams: T[],
  matches: JogoDaSerie[],
  groupId: string,
): LinhaClassificacao<T>[] => {
  const groupTeams = teams.filter(t => t.group_id === groupId)

  const stats: Record<string, LinhaClassificacao<T>> = {}
  groupTeams.forEach(t => {
    stats[t.id] = {
      team: t,
      p: t.points_carryover || 0,
      j: 0,
      v: 0,
      e: 0,
      d: 0,
      gm: 0,
      gs: 0,
      dg: 0,
      headToHead: {},
    }
  })

  const processMatch = (homeId: string, awayId: string, hScore: number, aScore: number) => {
    if (!stats[homeId] || !stats[awayId]) return

    stats[homeId].j++
    stats[awayId].j++

    stats[homeId].gm += hScore
    stats[homeId].gs += aScore
    stats[awayId].gm += aScore
    stats[awayId].gs += hScore

    if (!stats[homeId].headToHead[awayId]) stats[homeId].headToHead[awayId] = { p: 0, gm: 0, gs: 0 }
    if (!stats[awayId].headToHead[homeId]) stats[awayId].headToHead[homeId] = { p: 0, gm: 0, gs: 0 }

    stats[homeId].headToHead[awayId].gm += hScore
    stats[homeId].headToHead[awayId].gs += aScore
    stats[awayId].headToHead[homeId].gm += aScore
    stats[awayId].headToHead[homeId].gs += hScore

    if (hScore > aScore) {
      stats[homeId].p += 3
      stats[homeId].v++
      stats[awayId].d++
      stats[homeId].headToHead[awayId].p += 3
    } else if (hScore < aScore) {
      stats[awayId].p += 3
      stats[awayId].v++
      stats[homeId].d++
      stats[awayId].headToHead[homeId].p += 3
    } else {
      stats[homeId].p += 1
      stats[awayId].p += 1
      stats[homeId].e++
      stats[awayId].e++
      stats[homeId].headToHead[awayId].p += 1
      stats[awayId].headToHead[homeId].p += 1
    }
  }

  // Todos os jogos do grupo com resultado — os nossos incluídos, que chegam
  // aqui espelhados do evento.
  matches
    .filter(m => m.group_id === groupId && jogoTerminado(m))
    .forEach(m => processMatch(m.home_team_id, m.away_team_id, m.home_score as number, m.away_score as number))

  const linhas = Object.values(stats)
  linhas.forEach(s => { s.dg = s.gm - s.gs })

  linhas.sort((a, b) => {
    if (a.p !== b.p) return b.p - a.p

    // Empatadas: manda o confronto direto, se chegaram a jogar uma com a outra.
    const h2hA = a.headToHead[b.team.id]
    const h2hB = b.headToHead[a.team.id]
    if (h2hA && h2hB) {
      if (h2hA.p !== h2hB.p) return h2hB.p - h2hA.p
      const dgA = h2hA.gm - h2hA.gs
      const dgB = h2hB.gm - h2hB.gs
      if (dgA !== dgB) return dgB - dgA
      if (h2hA.gm !== h2hB.gm) return h2hB.gm - h2hA.gm
    }

    if (a.dg !== b.dg) return b.dg - a.dg
    if (a.gm !== b.gm) return b.gm - a.gm
    return 0
  })

  return linhas
}

/**
 * A janela da tabela que interessa a quem é do clube: nós e os vizinhos de
 * cima e de baixo. Num resumo não cabem doze equipas, e a que se procura é
 * sempre a nossa — quem lidera vê o topo, quem é último vê o fim.
 *
 * Devolve as linhas com a posição real, para o número não mentir.
 */
export const janelaDoClube = <T extends EquipaDoGrupo>(
  linhas: LinhaClassificacao<T>[],
  quantas = 5,
): { linha: LinhaClassificacao<T>; posicao: number }[] => {
  const comPosicao = linhas.map((linha, i) => ({ linha, posicao: i + 1 }))
  if (comPosicao.length <= quantas) return comPosicao

  const nosso = linhas.findIndex(l => l.team.opponent_id === null)
  /* Sem o clube no grupo — acontece num torneio que ainda não nos inclui — o
     que faz sentido mostrar é o topo. */
  if (nosso === -1) return comPosicao.slice(0, quantas)

  const acima = Math.floor((quantas - 1) / 2)
  const inicio = Math.max(0, Math.min(nosso - acima, comPosicao.length - quantas))
  return comPosicao.slice(inicio, inicio + quantas)
}
