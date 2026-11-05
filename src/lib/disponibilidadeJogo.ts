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

/**
 * Determina qual é o treino que antecede um determinado jogo (a relação inversa).
 * É o último treino ativo anterior ao jogo, desde que não haja outro jogo entre ambos.
 */
export function obterTreinoQueAntecedeJogo<T extends EventoComDataETipo>(
  jogo: T,
  todosEventos: readonly T[],
): T | null {
  if (jogo.type !== 'match') return null
  const dataJogo = new Date(jogo.date_time).getTime()
  if (isNaN(dataJogo)) return null

  // Treinos anteriores a este jogo
  const treinosAnteriores = todosEventos
    .filter(e => e.type === 'practice' && e.is_active !== false)
    .map(e => ({ evento: e, timestamp: new Date(e.date_time).getTime() }))
    .filter(e => !isNaN(e.timestamp) && e.timestamp < dataJogo)
    .sort((a, b) => b.timestamp - a.timestamp) // Mais recente primeiro

  for (const item of treinosAnteriores) {
    const jogoDoTreino = obterJogoAntecedidoPeloTreino(item.evento, todosEventos)
    if (jogoDoTreino?.id === jogo.id) {
      return item.evento
    }
  }

  return null
}

export const HORAS_FECHO_SONDAGEM_JOGO = 12

/**
 * Verifica se a sondagem de disponibilidade de um jogo já encerrou por prazo:
 * a sondagem fecha 12 horas antes da hora do jogo.
 */
export function sondagemJogoFechadaPorPrazo(jogo?: EventoComDataETipo | null): boolean {
  if (!jogo?.date_time) return false
  const comecaJogo = new Date(jogo.date_time).getTime()
  if (isNaN(comecaJogo)) return false
  return Date.now() >= comecaJogo - HORAS_FECHO_SONDAGEM_JOGO * 3_600_000
}

/**
 * Verifica se a convocatória de um treino está atualmente disponibilizada/aberta para respostas.
 * No CSC, o treino abre para respostas quando não está em rascunho (is_active !== false)
 * e faltam no máximo DIAS_JANELA_TREINO (6 dias) até ao início do treino.
 */
export function treinoAbertoParaResposta(treino?: EventoComDataETipo | null): boolean {
  if (!treino || treino.is_active === false || !treino.date_time) return false
  const comeca = new Date(treino.date_time).getTime()
  const agora = Date.now()
  if (isNaN(comeca)) return false
  // Não aceita se já começou ou se ainda faltam mais de 6 dias
  if (agora >= comeca) return false
  if (comeca - agora > 6 * 864e5) return false
  return true
}

/**
 * Verifica se a sondagem de disponibilidade para um jogo está atualmente aberta para resposta dos atletas.
 * Regra do CSC:
 * 1. Abre a partir do momento em que o treino associado que antecede o jogo fica disponibilizado
 *    para votação (não em rascunho e a <= 6 dias do início do treino), mantendo-se aberta mesmo
 *    depois de esse treino terminar.
 * 2. Se não houver treino anterior associado, abre 6 dias antes do jogo.
 * 3. Fecha sempre 12 horas antes da hora do jogo.
 */
export function sondagemJogoAbertaParaResposta<T extends EventoComDataETipo>(
  jogo: T,
  todosEventos: readonly T[],
  treinoExplicito?: EventoComDataETipo | null,
): boolean {
  if (!jogo || jogo.is_active === false || !jogo.date_time) return false
  if (sondagemJogoFechadaPorPrazo(jogo)) return false

  const agora = Date.now()
  const treino = treinoExplicito !== undefined
    ? treinoExplicito
    : obterTreinoQueAntecedeJogo(jogo, todosEventos)

  if (treino) {
    if (treino.is_active === false || !treino.date_time) return false
    const comecaTreino = new Date(treino.date_time).getTime()
    if (isNaN(comecaTreino)) return false
    // Já entrou na janela de 6 dias do treino (e permanece aberta mesmo após o treino decorrer, até 12h antes do jogo)
    return comecaTreino - agora <= 6 * 864e5
  }

  // Se não tiver treino antecedente agendado, abre 6 dias antes do próprio jogo (até 12h antes do jogo)
  const comecaJogo = new Date(jogo.date_time).getTime()
  if (isNaN(comecaJogo)) return false
  return comecaJogo - agora <= 6 * 864e5
}

const chaveLocal = (matchId: string, playerId: string) => `csc_avail_${matchId}_${playerId}`

const CACHE_TTL_MS = 15_000
const cacheDisponibilidadesJogo = new Map<
  string,
  { timestamp: number; mapa: Record<string, RespostaDisponibilidade> }
>()
const pedidosDisponibilidadeEmCurso = new Map<
  string,
  Promise<Record<string, RespostaDisponibilidade>>
>()

/**
 * Obtém a resposta de disponibilidade de um atleta para um jogo específico.
 * Reutiliza o carregamento deduplicado e em cache do jogo para evitar pedidos duplicados.
 */
export async function obterDisponibilidadeAtleta(
  matchId: string,
  playerId: string,
): Promise<RespostaDisponibilidade | null> {
  const mapa = await obterTodasDisponibilidadesDoJogo(matchId)
  return mapa[playerId] ?? null
}

/**
 * Carrega o mapa de disponibilidades de todos os atletas para um jogo específico.
 */
export async function obterTodasDisponibilidadesDoJogo(
  matchId: string,
): Promise<Record<string, RespostaDisponibilidade>> {
  const agora = Date.now()
  const emCache = cacheDisponibilidadesJogo.get(matchId)
  if (emCache && agora - emCache.timestamp < CACHE_TTL_MS) {
    return { ...emCache.mapa }
  }

  const emCurso = pedidosDisponibilidadeEmCurso.get(matchId)
  if (emCurso) {
    const res = await emCurso
    return { ...res }
  }

  const promessa = (async () => {
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

      if (error) {
        console.warn('Erro ao ler todas as disponibilidades do jogo:', error.message)
      } else if (data) {
        const dbIds = new Set<string>()
        for (const row of data as { player_id: string; status: string }[]) {
          if (row.status === 'available' || row.status === 'unavailable') {
            mapa[row.player_id] = row.status as RespostaDisponibilidade
            dbIds.add(row.player_id)
            try {
              localStorage.setItem(chaveLocal(matchId, row.player_id), row.status)
            } catch {
              // Ignorar
            }
          }
        }

        // Se o utilizador atual tem resposta guardada localmente que ainda não estava na BD, sincronizar agora
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const currentUserId = sessionData?.session?.user?.id
          if (currentUserId && mapa[currentUserId] && !dbIds.has(currentUserId)) {
            await supabase
              .from('match_availabilities')
              .upsert(
                {
                  match_id: matchId,
                  player_id: currentUserId,
                  status: mapa[currentUserId],
                  responded_at: new Date().toISOString(),
                },
                { onConflict: 'match_id,player_id' },
              )
          }
        } catch {
          // Ignorar
        }
      }
    } catch (err) {
      console.warn('Exceção ao obter disponibilidades do jogo:', err)
    }

    cacheDisponibilidadesJogo.set(matchId, { timestamp: Date.now(), mapa: { ...mapa } })
    return mapa
  })()

  pedidosDisponibilidadeEmCurso.set(matchId, promessa)
  try {
    const resultado = await promessa
    return { ...resultado }
  } finally {
    pedidosDisponibilidadeEmCurso.delete(matchId)
  }
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

  // Atualizar cache em memória imediatamente
  const existente = cacheDisponibilidadesJogo.get(matchId)
  if (existente) {
    existente.mapa[playerId] = status
    existente.timestamp = Date.now()
  }

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

  // 2. Gravar no Supabase (tabela match_availabilities)
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
