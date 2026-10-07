import { supabase } from './supabaseClient'
import { eAdepto } from './papeis'

/**
 * Sempre que há uma convocatória para jogadores para um jogo,
 * todos os adeptos ativos são convocados automaticamente como 'called'.
 */
export async function convocarAdeptosParaJogo(
  eventId: string,
  client = supabase
): Promise<number> {
  try {
    // 1. Obter todos os perfis ativos (tenta profiles e v_players_public como fallback)
    let perfis: any[] | null = null
    const { data: pData } = await client
      .from('profiles')
      .select('id, role, roles, status')
      .eq('status', 'active')
    perfis = pData

    if (!perfis || perfis.length === 0) {
      const { data: vData } = await client
        .from('v_players_public')
        .select('id, role, roles, status')
        .eq('status', 'active')
      perfis = vData
    }

    if (!perfis || perfis.length === 0) return 0

    // 2. Filtrar apenas os adeptos
    const adeptos = perfis.filter(p => eAdepto(p))
    if (adeptos.length === 0) return 0

    // 3. Obter convocatórias existentes para este jogo
    const { data: existentes, error: erroExistentes } = await client
      .from('callups')
      .select('player_id')
      .eq('event_id', eventId)

    if (erroExistentes) return 0

    const jaConvocados = new Set((existentes || []).map((c: { player_id: string }) => c.player_id))
    const porConvocar = adeptos.filter(a => !jaConvocados.has(a.id))

    if (porConvocar.length === 0) return 0

    const linhas = porConvocar.map(a => ({
      event_id: eventId,
      player_id: a.id,
      status: 'called' as const,
    }))

    const { error: erroUpsert } = await client
      .from('callups')
      .upsert(linhas, { onConflict: 'event_id, player_id', ignoreDuplicates: true })

    if (erroUpsert) {
      // Fallback para insert normal se upsert falhar por falta de constraint
      const { error: erroInsert } = await client.from('callups').insert(linhas)
      if (erroInsert) {
        console.warn('Erro ao convocar adeptos para jogo:', erroInsert)
        return 0
      }
    }

    return linhas.length
  } catch (err) {
    console.warn('Erro ao convocar adeptos para jogo:', err)
    return 0
  }
}
