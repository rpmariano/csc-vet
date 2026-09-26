import { supabase } from './supabaseClient'
import type { ProfileStatus } from '../context/AuthContext'

/**
 * Acerta os treinos futuros de uma pessoa ao estado dela.
 *
 * Os treinos convocam automaticamente todos os **jogadores aptos**: quem
 * passa a apto entra em todos os treinos futuros onde ainda não esteja, quem
 * fica lesionado ou inativo sai deles. Quem não joga (treinador, direção) não
 * entra nunca — é a regra do `isPlayerEligible` para treinos e jogos.
 *
 * Havia duas cópias, uma no Plantel e outra no botão de estado clínico das
 * Definições, e só a do Plantel olhava a quem joga: um treinador que se
 * marcasse apto ficava convocado para todos os treinos da época. Chegaram a
 * ser 237 linhas na base, apagadas a 2026-09-26.
 *
 * Lança o erro; quem chama decide como o dizer.
 */
export async function sincronizarTreinosFuturos(
  jogadorId: string,
  estado: ProfileStatus,
  joga: boolean,
): Promise<void> {
  const { data: treinos, error: erroTreinos } = await supabase
    .from('events')
    .select('id')
    .eq('type', 'practice')
    .gte('date_time', new Date().toISOString())
  if (erroTreinos) throw erroTreinos
  if (!treinos || treinos.length === 0) return

  const ids = (treinos as { id: string }[]).map(t => t.id)

  if (estado === 'active' && joga) {
    const { data: existentes, error: erroExistentes } = await supabase
      .from('callups')
      .select('event_id')
      .eq('player_id', jogadorId)
      .in('event_id', ids)
    if (erroExistentes) throw erroExistentes

    const ja = new Set(((existentes ?? []) as { event_id: string }[]).map(c => c.event_id))
    const novos = ids.filter(id => !ja.has(id))
    if (novos.length === 0) return

    const { error } = await supabase
      .from('callups')
      .insert(novos.map(eventId => ({ event_id: eventId, player_id: jogadorId, status: 'called' })))
    if (error) throw error
    return
  }

  // Lesionado, inativo, ou apto mas sem o papel de jogador: fora dos treinos
  // futuros. Os passados ficam como estão — são histórico.
  const { error } = await supabase
    .from('callups')
    .delete()
    .eq('player_id', jogadorId)
    .in('event_id', ids)
  if (error) throw error
}
