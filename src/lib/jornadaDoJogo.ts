import { supabase } from './supabaseClient'
import { isTorneioEliminatoria } from '../components/clube/torneios'
import { parseMatchReportMetadata } from '../components/MatchReportModal'

/**
 * O nosso jogo, espelhado na jornada do torneio.
 *
 * Um jogo do clube vive em `events` — é lá que estão a convocatória, a
 * concentração e a ficha de jogo. A classificação e o quadro da prova leem
 * `tournament_matches`.
 *
 * Tanto no campeonato como na taça (eliminatória), os jogos do Cascais
 * seguem a mesma regra: o resultado, golos e marcadores são lançados através
 * das fichas de jogo oficiais, e esta função mantém a tabela/quadro da prova
 * atualizados automaticamente.
 */

export interface EventoParaJornada {
  id: string
  tournament_id?: string | null
  matchday?: number | null
  opponent_id?: string | null
  home_away?: string | null
  home_score?: number | null
  away_score?: number | null
  date_time?: string | null
  penalties?: { home: number; away: number } | null
  description?: string | null
}

export type ResultadoSincronizacao =
  /** A linha da jornada ficou a par do evento. */
  | { estado: 'gravado' }
  /** Não é jogo de torneio (amigável, treino, sem jornada) — nada a espelhar. */
  | { estado: 'sem-jornada' }
  /** O torneio ainda não tem o clube ou o adversário num grupo. */
  | { estado: 'sem-equipas' }
  | { estado: 'erro'; mensagem: string }

/**
 * Põe a linha da jornada a par do evento — cria, atualiza ou apaga.
 *
 * Um jogo que deixe de ter torneio ou jornada perde a linha: ficar lá uma
 * jornada de um jogo que já não é do torneio mentia na classificação.
 */
export const sincronizarJogoNaJornada = async (
  evento: EventoParaJornada,
): Promise<ResultadoSincronizacao> => {
  const { data: espelhoAtual, error: erroEspelho } = await supabase
    .from('tournament_matches')
    .select('id, matchday, home_team_id, away_team_id, group_id')
    .eq('event_id', evento.id)
    .maybeSingle()
  if (erroEspelho) return { estado: 'erro', mensagem: erroEspelho.message }

  /* Tirar a linha de um jogo que deixou de caber na tabela. Uma falha aqui
     não é silenciosa: a linha ficava lá a contar na classificação. */
  const tirarEspelho = async (): Promise<string | null> => {
    if (!espelhoAtual) return null
    const { error } = await supabase.from('tournament_matches').delete().eq('id', espelhoAtual.id)
    return error ? error.message : null
  }

  if (!evento.tournament_id || !evento.opponent_id) {
    const erro = await tirarEspelho()
    return erro ? { estado: 'erro', mensagem: erro } : { estado: 'sem-jornada' }
  }

  const [{ data: grupos, error: erroGrupos }, { data: equipas, error: erroEquipas }] = await Promise.all([
    supabase.from('tournament_groups').select('id, phase').eq('tournament_id', evento.tournament_id),
    supabase.from('tournament_teams').select('id, group_id, opponent_id').eq('tournament_id', evento.tournament_id),
  ])
  const erroLeitura = erroGrupos ?? erroEquipas
  if (erroLeitura) return { estado: 'erro', mensagem: erroLeitura.message }

  /* O grupo é aquele onde estamos nós **e** o adversário: num torneio com
     fases, o mesmo adversário pode aparecer em duas, e a jornada é a do
     grupo em que os dois se encontram. Com mais do que um, ganha a fase mais
     adiantada. */
  const porFase = [...(grupos ?? [])].sort((a, b) => (b.phase ?? 1) - (a.phase ?? 1))
  let nossa: { id: string } | undefined
  let deles: { id: string } | undefined
  let grupoId: string | undefined
  for (const grupo of porFase) {
    const doGrupo = (equipas ?? []).filter(e => e.group_id === grupo.id)
    const eu = doGrupo.find(e => e.opponent_id === null)
    const ele = doGrupo.find(e => e.opponent_id === evento.opponent_id)
    if (eu && ele) {
      nossa = eu
      deles = ele
      grupoId = grupo.id
      break
    }
  }

  if (!nossa || !deles || !grupoId) {
    const eu = (equipas ?? []).find(e => e.opponent_id === null)
    const ele = (equipas ?? []).find(e => e.opponent_id === evento.opponent_id)
    if (eu && ele) {
      nossa = eu
      deles = ele
      grupoId = eu.group_id ?? ele.group_id ?? porFase[0]?.id
    }
  }

  if (!nossa || !deles || !grupoId) {
    /* Se um deles ainda não está inscrito no torneio, avisar sem apagar histórico */
    return { estado: 'sem-equipas' }
  }

  // Buscar todos os jogos existentes deste torneio para encontrar o jogo correspondente
  const { data: matchesExistentes, error: erroMatches } = await supabase
    .from('tournament_matches')
    .select('id, matchday, home_team_id, away_team_id, event_id, group_id')
    .eq('tournament_id', evento.tournament_id)
  if (erroMatches) return { estado: 'erro', mensagem: erroMatches.message }

  // 1) Já associado a este evento
  const jaLigado = (matchesExistentes || []).find(m => m.event_id === evento.id)

  // 2) Correspondência pelas duas equipas (nossa e adversário, em casa ou fora)
  const confrontos = (matchesExistentes || []).filter(m =>
    (m.home_team_id === nossa.id && m.away_team_id === deles.id) ||
    (m.home_team_id === deles.id && m.away_team_id === nossa.id)
  )

  const aMao = jaLigado
    || (evento.matchday ? confrontos.find(m => m.matchday === evento.matchday) : null)
    || confrontos.find(m => !m.event_id)
    || confrontos[0]

  if (!evento.matchday && !aMao) {
    const erro = await tirarEspelho()
    return erro ? { estado: 'erro', mensagem: erro } : { estado: 'sem-jornada' }
  }

  const matchAlvo = jaLigado || aMao
  const cascaisEVisitanteNoEvento = evento.home_away === 'away'
  const temResultado = evento.home_score !== null && evento.home_score !== undefined
    && evento.away_score !== null && evento.away_score !== undefined

  // No evento, home_score é do visitado (da casa) e away_score é do visitante (de fora)
  const cascaisScore = cascaisEVisitanteNoEvento ? evento.away_score : evento.home_score
  const elesScore = cascaisEVisitanteNoEvento ? evento.home_score : evento.away_score

  let homeTeamIdFinal = cascaisEVisitanteNoEvento ? deles.id : nossa.id
  let awayTeamIdFinal = cascaisEVisitanteNoEvento ? nossa.id : deles.id
  let homeScoreFinal = temResultado ? (cascaisEVisitanteNoEvento ? elesScore : cascaisScore) : null
  let awayScoreFinal = temResultado ? (cascaisEVisitanteNoEvento ? cascaisScore : elesScore) : null

  // Se o jogo já estava desenhado na tabela/eliminatória, respeitar a equipa da casa oficial
  if (matchAlvo) {
    if (matchAlvo.home_team_id === nossa.id && matchAlvo.away_team_id === deles.id) {
      homeTeamIdFinal = nossa.id
      awayTeamIdFinal = deles.id
      homeScoreFinal = temResultado ? cascaisScore : null
      awayScoreFinal = temResultado ? elesScore : null
    } else if (matchAlvo.home_team_id === deles.id && matchAlvo.away_team_id === nossa.id) {
      homeTeamIdFinal = deles.id
      awayTeamIdFinal = nossa.id
      homeScoreFinal = temResultado ? elesScore : null
      awayScoreFinal = temResultado ? cascaisScore : null
    }
  }

  const matchdayFinal = matchAlvo?.matchday || evento.matchday || 1

  const linha = {
    tournament_id: evento.tournament_id,
    group_id: matchAlvo?.group_id || grupoId,
    matchday: matchdayFinal,
    home_team_id: homeTeamIdFinal,
    away_team_id: awayTeamIdFinal,
    match_date: evento.date_time ? evento.date_time.slice(0, 10) : null,
    status: temResultado ? 'finished' : 'scheduled',
    home_score: homeScoreFinal,
    away_score: awayScoreFinal,
    event_id: evento.id,
  }

  let matchIdFinal: string | null = null

  if (matchAlvo) {
    const { error } = await supabase.from('tournament_matches').update(linha).eq('id', matchAlvo.id)
    if (error) return { estado: 'erro', mensagem: error.message }
    matchIdFinal = matchAlvo.id
  } else {
    const { data: inserido, error } = await supabase.from('tournament_matches').insert([linha]).select('id').single()
    if (error) return { estado: 'erro', mensagem: error.message }
    matchIdFinal = inserido?.id ?? null
  }

  // Se for torneio de eliminatória e houver desempate por penáltis, sincronizar com tournaments.rules.knockout_matches
  let penalties = evento.penalties
  if (!penalties && evento.description) {
    const parsed = parseMatchReportMetadata(evento.description)
    if (parsed.penalties) penalties = parsed.penalties
  }

  if (matchIdFinal && penalties) {
    try {
      const { data: tourData } = await supabase
        .from('tournaments')
        .select('name, rules')
        .eq('id', evento.tournament_id)
        .single()

      if (tourData && isTorneioEliminatoria(tourData)) {
        const rules = tourData.rules || {}
        const kmMap = { ...(rules.knockout_matches && !Array.isArray(rules.knockout_matches) ? rules.knockout_matches : {}) }
        const metaExistente = kmMap[matchIdFinal] || Object.values(kmMap).find((k: any) => k?.match_id === matchIdFinal) || {}

        const cascaisPens = cascaisEVisitanteNoEvento ? penalties.away : penalties.home
        const elesPens = cascaisEVisitanteNoEvento ? penalties.home : penalties.away

        const homePens = homeTeamIdFinal === nossa.id ? cascaisPens : elesPens
        const awayPens = awayTeamIdFinal === nossa.id ? cascaisPens : elesPens

        const updatedMeta = {
          ...metaExistente,
          match_id: matchIdFinal,
          home_penalties: homePens,
          away_penalties: awayPens,
        }
        kmMap[matchIdFinal] = updatedMeta

        await supabase.from('tournaments').update({
          rules: {
            ...rules,
            knockout_matches: kmMap,
          }
        }).eq('id', evento.tournament_id)
      }
    } catch (errPens) {
      console.warn('Não foi possível sincronizar penáltis da eliminatória:', errPens)
    }
  }

  return { estado: 'gravado' }
}

/** O aviso a dar quando o jogo não coube na tabela, para os ecrãs dizerem o mesmo. */
export const AVISO_SEM_EQUIPAS =
  'O jogo ficou criado, mas não entrou na tabela: o clube e o adversário têm de estar no mesmo grupo da prova (Clube → Torneios → Gerir grupos e equipas).'
