import { supabase } from './supabaseClient'
import { triggerHaptic } from '../utils/haptics'
import { toast } from '../context/ToastContext'

export interface EventoComDataETipo {
  id: string
  type: string
  date_time: string
  meeting_time?: string | null
  title?: string | null
  field_id?: string | null
  location?: string | null
  field?: { name: string; address?: string | null } | null
  opponent_id?: string | null
  opponent?: { name: string; initials?: string | null } | null
  is_friendly?: boolean | null
  home_away?: string | null
  is_active?: boolean | null
}

export type RespostaDisponibilidade = 'available' | 'unavailable'

export interface RegistoDisponibilidade {
  id?: string
  match_id: string
  player_id: string
  status: RespostaDisponibilidade
  responded_at?: string | null
}

/**
 * Determina se um treino antecede um jogo:
 * Ou seja, se entre este treino e o próximo treino agendado existe um jogo marcado.
 * Se existir, devolve o primeiro jogo desse intervalo. Caso contrário, devolve null.
 */
export function obterJogoAntecedidoPeloTreino<T extends EventoComDataETipo>(
  treino: T,
  todosEventos: readonly T[],
): T | null {
  if (treino.type !== 'practice') return null
  const dataTreino = new Date(treino.date_time).getTime()
  if (isNaN(dataTreino)) return null

  // 1. Procurar o próximo treino após este treino
  const treinosSeguintes = todosEventos
    .filter(e => e.type === 'practice' && e.id !== treino.id && e.is_active !== false)
    .map(e => ({ evento: e, timestamp: new Date(e.date_time).getTime() }))
    .filter(e => !isNaN(e.timestamp) && e.timestamp > dataTreino)
    .sort((a, b) => a.timestamp - b.timestamp)

  const limiteTimestamp = treinosSeguintes.length > 0 ? treinosSeguintes[0].timestamp : null

  // 2. Procurar jogos no intervalo entre este treino e o próximo treino
  const jogosNoIntervalo = todosEventos
    .filter(e => e.type === 'match' && e.is_active !== false)
    .map(e => ({ evento: e, timestamp: new Date(e.date_time).getTime() }))
    .filter(e => {
      if (isNaN(e.timestamp) || e.timestamp <= dataTreino) return false
      if (limiteTimestamp !== null && e.timestamp >= limiteTimestamp) return false
      return true
    })
    .sort((a, b) => a.timestamp - b.timestamp)

  return jogosNoIntervalo.length > 0 ? jogosNoIntervalo[0].evento : null
}

const chaveLocal = (matchId: string, playerId: string) => `csc_avail_${matchId}_${playerId}`

/**
 * Obtém a resposta de disponibilidade de um atleta para um jogo específico.
 */
export async function obterDisponibilidadeAtleta(
  matchId: string,
  playerId: string,
): Promise<RespostaDisponibilidade | null> {
  // 1. Procurar na base de dados primeiro (tabela match_availabilities)
  try {
    const { data, error } = await supabase
      .from('match_availabilities')
      .select('status')
      .eq('match_id', matchId)
      .eq('player_id', playerId)
      .maybeSingle()

    if (!error && data?.status) {
      const st = data.status as RespostaDisponibilidade
      try {
        localStorage.setItem(chaveLocal(matchId, playerId), st)
      } catch {
        // Ignorar
      }
      return st
    }
  } catch {
    // Tabela pode ainda não existir em produção antes da migração
  }

  // 2. Verificar cache local como fallback
  try {
    const salvoLocal = localStorage.getItem(chaveLocal(matchId, playerId))
    if (salvoLocal === 'available' || salvoLocal === 'unavailable') {
      return salvoLocal
    }
  } catch {
    // Ignorar erro de localStorage
  }

  return null
}

/**
 * Carrega o mapa de disponibilidades de todos os atletas para um jogo específico.
 */
export async function obterTodasDisponibilidadesDoJogo(
  matchId: string,
): Promise<Record<string, RespostaDisponibilidade>> {
  const mapa: Record<string, RespostaDisponibilidade> = {}

  // 1. Carregar valores em localStorage que pertençam a este jogo
  try {
    const prefixo = `csc_avail_${matchId}_`
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefixo)) {
        const playerId = k.slice(prefixo.length)
        const valor = localStorage.getItem(k)
        if (valor === 'available' || valor === 'unavailable') {
          mapa[playerId] = valor
        }
      }
    }
  } catch {
    // Ignorar
  }

  // 2. Carregar da base de dados se a tabela existir
  try {
    const { data, error } = await supabase
      .from('match_availabilities')
      .select('player_id, status')
      .eq('match_id', matchId)

    if (!error && data) {
      for (const row of data as { player_id: string; status: string }[]) {
        if (row.status === 'available' || row.status === 'unavailable') {
          mapa[row.player_id] = row.status as RespostaDisponibilidade
          try {
            localStorage.setItem(chaveLocal(matchId, row.player_id), row.status)
          } catch {
            // Ignorar
          }
        }
      }
    }
  } catch {
    // Tabela ainda pode não existir na base de dados
  }

  return mapa
}

/**
 * Grava a resposta de disponibilidade de um atleta para um jogo.
 */
export async function gravarDisponibilidadeAtleta(
  matchId: string,
  playerId: string,
  status: RespostaDisponibilidade,
): Promise<boolean> {
  triggerHaptic('selection')

  // 1. Guardar imediatamente em localStorage
  try {
    localStorage.setItem(chaveLocal(matchId, playerId), status)
  } catch {
    // Ignorar
  }

  // Notificar componentes ativos na janela atual
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('csc_match_availability_updated', {
        detail: { matchId, playerId, status },
      }),
    )
  }

  // 2. Gravar no Supabase (se a tabela match_availabilities existir)
  try {
    const { error } = await supabase
      .from('match_availabilities')
      .upsert(
        {
          match_id: matchId,
          player_id: playerId,
          status,
          responded_at: new Date().toISOString(),
        },
        { onConflict: 'match_id,player_id' },
      )

    if (error) {
      console.warn('Aviso ao sincronizar disponibilidade na BD (será guardada localmente):', error.message)
    }
  } catch (err) {
    console.warn('Exceção ao gravar disponibilidade na BD:', err)
  }

  toast.success(
    status === 'available'
      ? 'Disponibilidade para o jogo registada: Disponível!'
      : 'Disponibilidade para o jogo registada: Não disponível.',
  )

  return true
}
