import { supabase } from './supabaseClient'
import {
  JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B,
  type JogoCalendarioSidelineDef,
} from './sidelineCalendarioDef'

export { JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B, type JogoCalendarioSidelineDef }

export interface ResultadoGarantirSideline {
  tournamentId: string
  groupId: string
  totalCriados: number
  totalExistentes: number
  mensagem: string
}

let sincronizacaoSidelineEmCurso: Promise<ResultadoGarantirSideline | null> | null = null

/**
 * Garante com segurança que todas as jornadas do Grupo B da Sideline existem no Supabase.
 *
 * REGRA ESTRITA:
 * - NUNCA apaga jogos existentes.
 * - NUNCA altera ou limpa resultados já registados.
 * - Apenas insere jogos em falta para completar as 7 Jornadas oficiais.
 */
export async function garantirSidelineVeteranos2026(opcoes?: {
  tournamentId?: string
  groupId?: string
  forcar?: boolean
}): Promise<ResultadoGarantirSideline | null> {
  if (sincronizacaoSidelineEmCurso) return sincronizacaoSidelineEmCurso

  const jaSincronizado = (() => {
    try {
      return sessionStorage.getItem('csc_sideline_2026_grupob_synced') === '1'
    } catch {
      return false
    }
  })()

  if (jaSincronizado && !opcoes?.forcar) return null

  sincronizacaoSidelineEmCurso = (async (): Promise<ResultadoGarantirSideline | null> => {
    try {
      // 1. Localizar o Torneio
      let tournamentId: string | null = opcoes?.tournamentId || null

      if (!tournamentId) {
        const { data: torneios } = await supabase
          .from('tournaments')
          .select('id, name, organizer_name, format, status')
          .order('created_at', { ascending: false })

        if (torneios && torneios.length > 0) {
          const matchSideline = torneios.find(t => {
            const nome = (t.name || '').toLowerCase()
            const org = (t.organizer_name || '').toLowerCase()
            return (
              nome.includes('sideline') ||
              org.includes('sideline') ||
              nome.includes('liga masters') ||
              nome.includes('masters 35')
            )
          })

          if (matchSideline) {
            tournamentId = matchSideline.id
          } else {
            // Torneio ativo que não seja a Taça (knockout)
            const ligaAtiva = torneios.find(t => t.format !== 'knockout' && t.status !== 'terminado')
            if (ligaAtiva) tournamentId = ligaAtiva.id
          }
        }
      }

      if (!tournamentId) return null
      const validTournamentId: string = tournamentId

      // 2. Localizar ou assegurar o Grupo B
      let groupId = opcoes?.groupId || null
      const { data: grupos } = await supabase
        .from('tournament_groups')
        .select('*')
        .eq('tournament_id', validTournamentId)

      if (!groupId && grupos && grupos.length > 0) {
        const grupoB = grupos.find(g => {
          const n = (g.name || '').trim().toLowerCase()
          return n === 'grupo b' || n === 'b' || n.includes('grupo b')
        })
        if (grupoB) groupId = grupoB.id
      }

      if (!groupId) {
        // Criar Grupo B caso não exista
        const { data: novoGrupo, error: errGrupo } = await supabase
          .from('tournament_groups')
          .insert([{ tournament_id: validTournamentId, name: 'Grupo B', phase: 1 }])
          .select('id')
          .single()
        if (errGrupo || !novoGrupo) return null
        groupId = novoGrupo.id
      }

      if (!groupId) return null
      const validGroupId: string = groupId

      // 3. Obter todos os adversários da BD para mapear
      const { data: opponentsDb } = await supabase
        .from('opponents')
        .select('id, name, initials')

      const encontrarOpponentId = (nomeBusca: string): string | null => {
        if (!opponentsDb) return null
        const nb = nomeBusca.toLowerCase().trim()
        const encontrado = opponentsDb.find(o => {
          const on = (o.name || '').toLowerCase().trim()
          const oi = (o.initials || '').toLowerCase().trim()
          if (nb === 'ferroviário') return on.includes('ferrovi') || oi === 'fer'
          if (nb === 'técnico') return on.includes('téc') || on.includes('tec') || oi === 'tec'
          if (nb === 'bola cacém') return on.includes('cacém') || on.includes('cacem') || on.includes('bola') || oi === 'bcac'
          if (nb === 'amora') return on.includes('amora') || oi === 'amo'
          if (nb === 'estrelas lisboa') return on.includes('estrelas') || oi === 'elis'
          if (nb === 'torre') return (on.includes('torre') || oi === 'tor') && !on.includes('cascais')
          return on.includes(nb) || oi === nb
        })
        return encontrado?.id ?? null
      }

      // 4. Obter as equipas inscritas no torneio / Grupo B
      const { data: teamsExistentes } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', validTournamentId)

      const listaTeams = [...(teamsExistentes ?? [])]

      const garantirEquipaNoGrupo = async (oppId: string | null): Promise<string | null> => {
        // Verificar se já existe neste torneio e grupo
        const ja = listaTeams.find(t => (t.opponent_id ?? null) === oppId && (!t.group_id || t.group_id === validGroupId))
        if (ja) return ja.id

        // Se existe no torneio mas sem grupo atribuído, associar ao grupo
        const jaNoTorneio = listaTeams.find(t => (t.opponent_id ?? null) === oppId)
        if (jaNoTorneio) {
          if (!jaNoTorneio.group_id) {
            await supabase.from('tournament_teams').update({ group_id: validGroupId }).eq('id', jaNoTorneio.id)
            jaNoTorneio.group_id = validGroupId
          }
          return jaNoTorneio.id
        }

        // Criar equipa no torneio
        const { data: nova } = await supabase
          .from('tournament_teams')
          .insert([{ tournament_id: validTournamentId, group_id: validGroupId, opponent_id: oppId }])
          .select('*')
          .maybeSingle()

        if (nova) {
          listaTeams.push(nova)
          return nova.id
        }
        return null
      }

      // Mapear team_id para cada equipa oficial
      const mapaTeamIdPorNome = new Map<string, string>()

      // Cascais (clube próprio -> opponent_id = null)
      const cscTeamId = await garantirEquipaNoGrupo(null)
      if (cscTeamId) mapaTeamIdPorNome.set('Cascais', cscTeamId)

      const nomesAdversarios = ['Ferroviário', 'Técnico', 'Bola Cacém', 'Amora', 'Estrelas Lisboa', 'Torre']
      for (const nomeAdv of nomesAdversarios) {
        const oppId = encontrarOpponentId(nomeAdv)
        if (oppId) {
          const tId = await garantirEquipaNoGrupo(oppId)
          if (tId) mapaTeamIdPorNome.set(nomeAdv, tId)
        }
      }

      // 5. Obter jogos já existentes em tournament_matches
      const { data: matchesExistentes } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', validTournamentId)

      const matchesDoGrupo = (matchesExistentes ?? []).filter(m => !m.group_id || m.group_id === validGroupId)

      // 6. Verificar e inserir APENAS jogos que ainda não existam
      let totalCriados = 0
      let totalExistentes = 0

      for (const j of JOGOS_OFICIAIS_SIDELINE_2026_GRUPO_B) {
        const homeTeamId = mapaTeamIdPorNome.get(j.home_team_name)
        const awayTeamId = mapaTeamIdPorNome.get(j.away_team_name)

        if (!homeTeamId || !awayTeamId) {
          continue
        }

        // Verificar se já existe um jogo desta jornada entre estas duas equipas (em qualquer sentido)
        const jogoJaExiste = matchesDoGrupo.find(cand => {
          if (Number(cand.matchday) !== Number(j.matchday)) return false
          const eqCasa = cand.home_team_id === homeTeamId && cand.away_team_id === awayTeamId
          const eqFora = cand.home_team_id === awayTeamId && cand.away_team_id === homeTeamId
          return eqCasa || eqFora
        })

        if (jogoJaExiste) {
          totalExistentes++
          // Não mexer em resultados nem apagar nada!
          // Se não tiver match_date definido, atualizar apenas a data/hora oficial
          if (!jogoJaExiste.match_date && j.iso_datetime) {
            await supabase
              .from('tournament_matches')
              .update({ match_date: j.iso_datetime })
              .eq('id', jogoJaExiste.id)
          }
          continue
        }

        // Criar jogo em falta com status 'scheduled'
        const novoJogo = {
          tournament_id: validTournamentId,
          group_id: validGroupId,
          matchday: j.matchday,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          status: 'scheduled',
          match_date: j.iso_datetime,
          home_score: null,
          away_score: null,
        }

        const { error: errInsert } = await supabase
          .from('tournament_matches')
          .insert([novoJogo])

        if (!errInsert) {
          totalCriados++
        }
      }

      try {
        sessionStorage.setItem('csc_sideline_2026_grupob_synced', '1')
      } catch {
        /* ignore */
      }

      const mensagem = totalCriados > 0
        ? `Criados ${totalCriados} jogos oficiais da Sideline (Grupo B). ${totalExistentes} jogos já existentes foram mantidos intactos.`
        : `Todas as jornadas do Grupo B já estão criadas (${totalExistentes} jogos mantidos intactos).`

      return {
        tournamentId: validTournamentId,
        groupId: validGroupId,
        totalCriados,
        totalExistentes,
        mensagem,
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar jornadas da Sideline:', err)
      return null
    } finally {
      sincronizacaoSidelineEmCurso = null
    }
  })()

  return sincronizacaoSidelineEmCurso
}
