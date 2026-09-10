import { supabase } from './supabaseClient'

/**
 * O nosso jogo, espelhado na jornada do torneio.
 *
 * Um jogo do clube vive em `events` — é lá que estão a convocatória, a
 * concentração e a ficha de jogo. A classificação lê `tournament_matches`.
 * Eram dois sítios sem ligação nenhuma: quem quisesse o jogo na tabela tinha
 * de o escrever outra vez à mão como jornada, e o resultado da ficha ficava
 * de fora (a `StandingsPage` procurava-o por `status = 'finished'` e
 * `home_away = 'casa'`, valores que este esquema não tem — nunca dava).
 *
 * Agora o evento diz em que jornada conta, e esta função escreve a linha da
 * jornada a partir dele: ao criar o jogo nasce "por realizar", e a ficha de
 * jogo lança o resultado nos dois sítios ao mesmo tempo. A linha traz
 * `event_id`, por isso não há como duplicar nem como perder de vista de onde
 * veio.
 *
 * **A casa e a visita são as do evento**, não as nossas: num jogo fora,
 * `home_score` é o do adversário — é assim que a app inteira lê o placar.
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
  const { data: espelhoAtual } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('event_id', evento.id)
    .maybeSingle()

  if (!evento.tournament_id || !evento.matchday || !evento.opponent_id) {
    if (espelhoAtual) await supabase.from('tournament_matches').delete().eq('id', espelhoAtual.id)
    return { estado: 'sem-jornada' }
  }

  const [{ data: grupos }, { data: equipas }] = await Promise.all([
    supabase.from('tournament_groups').select('id, phase').eq('tournament_id', evento.tournament_id),
    supabase.from('tournament_teams').select('id, group_id, opponent_id').eq('tournament_id', evento.tournament_id),
  ])

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
    /* Sem os dois no mesmo grupo não há linha possível. A anterior sai: o
       jogo pode ter mudado de adversário para um que ainda não está inscrito. */
    if (espelhoAtual) await supabase.from('tournament_matches').delete().eq('id', espelhoAtual.id)
    return { estado: 'sem-equipas' }
  }

  const fora = evento.home_away === 'away'
  const temResultado = evento.home_score !== null && evento.home_score !== undefined
    && evento.away_score !== null && evento.away_score !== undefined

  const linha = {
    tournament_id: evento.tournament_id,
    group_id: grupoId,
    matchday: evento.matchday,
    home_team_id: fora ? deles.id : nossa.id,
    away_team_id: fora ? nossa.id : deles.id,
    match_date: evento.date_time ? evento.date_time.slice(0, 10) : null,
    status: temResultado ? 'finished' : 'scheduled',
    home_score: temResultado ? evento.home_score : null,
    away_score: temResultado ? evento.away_score : null,
    event_id: evento.id,
  }

  if (espelhoAtual) {
    const { error } = await supabase.from('tournament_matches').update(linha).eq('id', espelhoAtual.id)
    return error ? { estado: 'erro', mensagem: error.message } : { estado: 'gravado' }
  }

  /* Antes de inserir, adotar a linha que a direção possa ter escrito à mão
     para este mesmo jogo — senão a jornada ficava com o jogo duas vezes, e a
     classificação a contá-lo a dobrar. */
  const { data: aMao } = await supabase
    .from('tournament_matches')
    .select('id')
    .eq('tournament_id', evento.tournament_id)
    .eq('matchday', evento.matchday)
    .eq('home_team_id', linha.home_team_id)
    .eq('away_team_id', linha.away_team_id)
    .is('event_id', null)
    .maybeSingle()

  if (aMao) {
    const { error } = await supabase.from('tournament_matches').update(linha).eq('id', aMao.id)
    return error ? { estado: 'erro', mensagem: error.message } : { estado: 'gravado' }
  }

  const { error } = await supabase.from('tournament_matches').insert([linha])
  return error ? { estado: 'erro', mensagem: error.message } : { estado: 'gravado' }
}

/** O aviso a dar quando o jogo não coube na tabela, para os ecrãs dizerem o mesmo. */
export const AVISO_SEM_EQUIPAS =
  'O jogo ficou criado, mas não entrou na tabela: o clube e o adversário têm de estar no mesmo grupo da prova (Clube → Torneios → Gerir grupos e equipas).'
