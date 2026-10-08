import { supabase } from './supabaseClient'
import { eAdepto } from './papeis'

/**
 * Só convoca adeptos para jogos se já houver pelo menos um jogador/atleta convocado.
 * Todos os adeptos ativos são convocados como 'called'.
 */
export async function convocarAdeptosParaJogo(
  eventId: string,
  client = supabase
): Promise<number> {
  try {
    // 1. Verificar se o evento é do tipo 'match'
    const { data: evento, error: erroEvento } = await client
      .from('events')
      .select('id, type')
      .eq('id', eventId)
      .maybeSingle()

    if (erroEvento || !evento || evento.type !== 'match') return 0

    // 2. Obter convocatórias existentes para este jogo
    const { data: existentes, error: erroExistentes } = await client
      .from('callups')
      .select('id, player_id')
      .eq('event_id', eventId)

    if (erroExistentes || !existentes || existentes.length === 0) return 0

    // 3. Obter todos os perfis (para saber quem é adepto e quem é atleta)
    let perfis: any[] | null = null
    const { data: pData } = await client
      .from('profiles')
      .select('id, role, roles, status')
    perfis = pData

    if (!perfis || perfis.length === 0) {
      const { data: vData } = await client
        .from('v_players_public')
        .select('id, role, roles, status')
      perfis = vData
    }

    if (!perfis || perfis.length === 0) return 0

    const perfilMap = new Map((perfis || []).map(p => [p.id, p]))

    // 4. Só se convoca adeptos se houver pelo menos um atleta/jogador já convocado!
    const temJogadores = existentes.some(c => {
      const p = perfilMap.get(c.player_id)
      return p ? !eAdepto(p) : true
    })

    if (!temJogadores) {
      return 0
    }

    // 5. Filtrar apenas os adeptos ativos
    const adeptosAtivos = perfis.filter(p => eAdepto(p) && p.status === 'active')
    if (adeptosAtivos.length === 0) return 0

    const jaConvocados = new Set(existentes.map((c: { player_id: string }) => c.player_id))
    const porConvocar = adeptosAtivos.filter(a => !jaConvocados.has(a.id))

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

/**
 * Se todos os jogadores forem retirados de um jogo, os adeptos também
 * devem ser retirados automaticamente da convocatória.
 */
export async function removerAdeptosSeSemJogadores(
  eventId: string,
  client = supabase
): Promise<number> {
  try {
    // 1. Obter todas as convocatórias deste jogo
    const { data: existentes, error: erroExistentes } = await client
      .from('callups')
      .select('id, player_id')
      .eq('event_id', eventId)

    if (erroExistentes || !existentes || existentes.length === 0) return 0

    // 2. Obter perfis dos convocados
    const playerIds = existentes.map(c => c.player_id)
    let perfis: any[] | null = null
    const { data: pData } = await client
      .from('profiles')
      .select('id, role, roles, status')
      .in('id', playerIds)
    perfis = pData

    if (!perfis || perfis.length === 0) {
      const { data: vData } = await client
        .from('v_players_public')
        .select('id, role, roles, status')
        .in('id', playerIds)
      perfis = vData
    }

    const perfilMap = new Map((perfis || []).map(p => [p.id, p]))

    // 3. Verificar se ainda resta algum atleta (não-adepto)
    const temJogadores = existentes.some(c => {
      const p = perfilMap.get(c.player_id)
      return p ? !eAdepto(p) : true
    })

    // Se ainda há jogadores, os adeptos mantêm-se
    if (temJogadores) return 0

    // 4. Se não há jogadores, apaga todas as convocatórias restantes deste jogo
    const { error: erroDelete } = await client
      .from('callups')
      .delete()
      .eq('event_id', eventId)

    if (erroDelete) {
      console.warn('Erro ao remover adeptos sem jogadores:', erroDelete)
      return 0
    }

    return existentes.length
  } catch (err) {
    console.warn('Erro ao remover adeptos sem jogadores:', err)
    return 0
  }
}

/**
 * A partir do momento em que foi feita uma convocatória e um adepto é criado/ativado,
 * deve ser associado à convocatória desde que o jogo ainda não tenha sido realizado.
 */
export async function sincronizarNovoAdeptoEmJogosFuturos(
  supporterId: string,
  client = supabase
): Promise<number> {
  try {
    const agora = new Date().toISOString()
    // 1. Jogos futuros (data_hora >= agora)
    const { data: jogos, error: erroJogos } = await client
      .from('events')
      .select('id')
      .eq('type', 'match')
      .gte('date_time', agora)

    if (erroJogos || !jogos || jogos.length === 0) return 0

    const jogoIds = jogos.map(j => j.id)

    // 2. Convocatórias existentes nesses jogos futuros
    const { data: todasConvocatorias, error: erroCallups } = await client
      .from('callups')
      .select('id, event_id, player_id')
      .in('event_id', jogoIds)

    if (erroCallups || !todasConvocatorias || todasConvocatorias.length === 0) return 0

    // 3. Perfis dos convocados para discernir atletas de adeptos
    const playerIds = Array.from(new Set(todasConvocatorias.map(c => c.player_id)))
    let perfis: any[] | null = null
    const { data: pData } = await client
      .from('profiles')
      .select('id, role, roles')
      .in('id', playerIds)
    perfis = pData

    if (!perfis || perfis.length === 0) {
      const { data: vData } = await client
        .from('v_players_public')
        .select('id, role, roles')
        .in('id', playerIds)
      perfis = vData
    }

    const perfilMap = new Map((perfis || []).map(p => [p.id, p]))

    // Agrupar por jogo
    const convocatoriasPorJogo: Record<string, typeof todasConvocatorias> = {}
    todasConvocatorias.forEach(c => {
      if (!convocatoriasPorJogo[c.event_id]) convocatoriasPorJogo[c.event_id] = []
      convocatoriasPorJogo[c.event_id].push(c)
    })

    const linhasAInserir: { event_id: string; player_id: string; status: 'called' }[] = []

    for (const j of jogos) {
      const convs = convocatoriasPorJogo[j.id] || []
      // O jogo tem de ter convocatória para jogadores!
      const temAtleta = convs.some(c => {
        const p = perfilMap.get(c.player_id)
        return p ? !eAdepto(p) : true
      })
      if (!temAtleta) continue

      // Se o adepto ainda não está convocado para este jogo futuro, adiciona
      const jaConvocado = convs.some(c => c.player_id === supporterId)
      if (!jaConvocado) {
        linhasAInserir.push({
          event_id: j.id,
          player_id: supporterId,
          status: 'called',
        })
      }
    }

    if (linhasAInserir.length === 0) return 0

    const { error: erroUpsert } = await client
      .from('callups')
      .upsert(linhasAInserir, { onConflict: 'event_id, player_id', ignoreDuplicates: true })

    if (erroUpsert) {
      const { error: erroInsert } = await client.from('callups').insert(linhasAInserir)
      if (erroInsert) {
        console.warn('Erro ao inserir convocatória de novo adepto em jogos futuros:', erroInsert)
        return 0
      }
    }

    return linhasAInserir.length
  } catch (err) {
    console.warn('Erro ao sincronizar novo adepto em jogos futuros:', err)
    return 0
  }
}
