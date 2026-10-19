import { supabase } from './supabaseClient'
import { isDeveloperEmail } from '../context/AuthContext'
import { enderecoFichaJogo } from './rotas'
import { localDoEvento } from './eventos'
import { CLUBE_SIGLA } from './clube'
import { triggerHaptic } from '../utils/haptics'
import { toast } from '../context/ToastContext'
import { eAdepto, eTreinador, eAdmin } from './papeis'

export interface EleitorMvpInfo {
  id: string
  name: string
  shirt_name?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  funcao: string
  categoria: 'jogador' | 'staff'
  jaVotou: boolean
  escolhas?: [string, string]
}

export interface MvpVote {
  id: string
  event_id: string
  voter_id: string
  player1_id: string
  player2_id: string
  created_at?: string
  updated_at?: string
}

export interface PlayerSummary {
  id: string
  name: string
  shirt_name?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  position?: string | null
}

export interface VotacaoJogoResultado {
  eventId: string
  totalVotos: number
  totalVotantes: number
  mvpIds: string[]
  contagemPorJogador: {
    playerId: string
    votos: number
    percentagem: number
    player?: PlayerSummary
  }[]
  votosDetalhados: {
    voterId: string
    voterName: string
    escolhas: [string, string]
  }[]
}

export interface TabelaMvpLinha {
  playerId: string
  nome: string
  shirt_name?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  position?: string | null
  premiosMvp: number
  totalVotos: number
  jogosComVotos: number
}

/**
 * Acesso exclusivo ao novo separador e dados globais de MVP:
 * Apenas Pedro Vieira e o utilizador desenvolvedor/admin (Rui Mariano).
 */
export function temAcessoMVP(profile: { email?: string | null; name?: string | null } | null | undefined): boolean {
  if (!profile) return false
  const email = (profile.email || '').toLowerCase().trim()
  if (email === 'rpmariano@gmail.com' || isDeveloperEmail(email)) return true
  if (email === 'pedro.vieira@esporao.com') return true

  const normalizado = (profile.name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (normalizado.includes('pedro') && normalizado.includes('vieira')) return true

  return false
}

/** Obtém todos os votos registados para um determinado evento. */
export async function obterVotosDoJogo(eventId: string): Promise<MvpVote[]> {
  try {
    const { data, error } = await supabase
      .from('mvp_votes')
      .select('*')
      .eq('event_id', eventId)

    if (error) {
      console.warn('Erro ao carregar votos do jogo (a tabela pode ainda não existir):', error.message)
      return []
    }
    return (data || []) as MvpVote[]
  } catch (err) {
    console.warn('Exceção ao obter votos do jogo:', err)
    return []
  }
}

/** Obtém todos os votos MVP da base de dados. */
export async function obterTodosVotosMvp(): Promise<MvpVote[]> {
  try {
    const { data, error } = await supabase
      .from('mvp_votes')
      .select('*')

    if (error) {
      console.warn('Erro ao carregar votos MVP globais:', error.message)
      return []
    }
    return (data || []) as MvpVote[]
  } catch (err) {
    console.warn('Exceção ao obter votos MVP globais:', err)
    return []
  }
}

/** 
 * Para assegurar a confidencialidade dos vencedores de MVP (de consulta restrita
 * a Rui Mariano e Pedro Vieira no separador MVP), a coluna pública `is_mvp` 
 * na tabela `stats` permanece desativada.
 */
export async function sincronizarMvpNaTabelaStats(eventId: string): Promise<void> {
  try {
    await supabase
      .from('stats')
      .update({ is_mvp: false })
      .eq('event_id', eventId)
      .eq('is_mvp', true)
  } catch (e) {
    console.warn('Erro ao atualizar stats:', e)
  }
}

/**
 * Garante que apenas atletas convocados (que não recusaram a convocatória ou que participaram no jogo)
 * e treinadores têm autorização para votar no MVP. O perfil de direção pura não dá direito de voto.
 */
export async function verificarElegibilidadeVotoMvp(
  eventId: string,
  voterId: string
): Promise<boolean> {
  if (!eventId || !voterId) return false
  try {
    // 1. Verificar se tem perfil de treinador (coach) — Direção pura não vota
    const { data: profile } = await supabase
      .from('v_players_public')
      .select('role, roles')
      .eq('id', voterId)
      .maybeSingle()

    const isDirecao = profile && (eAdmin(profile) || profile.role === 'admin' || (Array.isArray(profile.roles) && profile.roles.includes('admin')))
    if (profile && eTreinador(profile) && !isDirecao) {
      return true
    }

    // 2. Verificar se foi convocado como jogador (e não recusou)
    const { data: callup } = await supabase
      .from('callups')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('player_id', voterId)
      .maybeSingle()

    if (callup && callup.status !== 'declined') {
      return true
    }

    // 3. Verificar se participou no jogo (tem registo em stats)
    const { data: stat } = await supabase
      .from('stats')
      .select('id')
      .eq('event_id', eventId)
      .eq('player_id', voterId)
      .maybeSingle()

    if (stat) {
      return true
    }

    return false
  } catch (err) {
    console.warn('Erro ao verificar elegibilidade de voto MVP:', err)
    return false
  }
}

/**
 * Determina se a votação de MVP está aberta para um determinado jogo.
 * Regras:
 * 1. Jogos anteriores a 13 de Outubro de 2026 (amigáveis de pré-época e 1ª jornada vs Estrelas Lisboa)
 *    estão encerrados permanentemente.
 * 2. O jogo de 18 de Outubro de 2026 (vs AFD Torre) e jogos recentes da época
 *    estão ABERTOS para votação.
 * 3. Jogos com tag explícita '[MVP_CLOSED]' na descrição estão encerrados.
 * 4. Jogos com mvp_voting_closed === true estão encerrados (exceto jogos após 12/10 que foram
 *    fechados inadvertidamente pela migração anterior e devem permanecer abertos).
 */
export function isVotacaoMvpAberta(event: {
  id?: string
  date_time?: string
  is_friendly?: boolean | null
  matchday?: number | null
  description?: string | null
  mvp_voting_closed?: boolean | null
  opponent_name?: string | null
  title?: string | null
  opponent?: { name?: string; initials?: string | null } | null
} | null | undefined): boolean {
  if (!event) return false

  // 1. Tag explícita na descrição
  if (event.description?.includes('[MVP_CLOSED]') || event.description?.includes('mvp_voting_closed:true')) {
    return false
  }

  const eventDate = event.date_time ? new Date(event.date_time) : null
  const dataCortePassado = new Date('2026-10-12T23:59:59+01:00')
  const isJogoPassadoAntesDe13Outubro = eventDate ? eventDate.getTime() <= dataCortePassado.getTime() : false

  // 2. Os dois jogos amigáveis passados de pré-época e 1ª jornada (11/10/2026 vs Estrelas Lisboa)
  // têm a votação fechada permanentemente
  if (isJogoPassadoAntesDe13Outubro) {
    return false
  }

  // 3. Jogo da 1ª jornada contra Estrelas Lisboa (11/10/2026)
  const opp = event.opponent
  const oppName = ((opp?.name || '') + ' ' + (event.opponent_name || '') + ' ' + (event.title || '')).toLowerCase()
  const oppInitials = (opp?.initials || '').toLowerCase()
  const isElis = oppName.includes('estrelas') || oppInitials.includes('elis')
  if (isElis && eventDate && eventDate.toISOString().slice(0, 10) === '2026-10-11') {
    return false
  }

  // 4. Jogo de 18 de Outubro de 2026 (vs AFD Torre) e jogos recentes após 12/10:
  // A votação DEVE estar ABERTA!
  const isTorre = oppName.includes('torre') || oppInitials.includes('tor')
  const isJogoApos12Outubro = eventDate ? eventDate.getTime() > dataCortePassado.getTime() : false
  if (isTorre && isJogoApos12Outubro) {
    return true
  }

  // 5. Flag explícita na base de dados
  if (event.mvp_voting_closed === true) {
    // Se for o jogo recente contra a AFD Torre, garante que está aberto
    if (isTorre && isJogoApos12Outubro) {
      return true
    }
    return false
  }

  return true
}

/** Submete ou atualiza o voto de um utilizador (2 jogadores distintos). */
export async function registarVotoMvp(
  eventId: string,
  voterId: string,
  player1Id: string,
  player2Id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!eventId || !voterId || !player1Id || !player2Id) {
    return { ok: false, error: 'Dados de voto incompletos.' }
  }
  if (player1Id === player2Id) {
    return { ok: false, error: 'Tens de escolher dois jogadores diferentes.' }
  }

  // Verificar se a votação está aberta para este jogo
  try {
    const { data: ev } = await supabase
      .from('events')
      .select('id, date_time, is_friendly, matchday, description, mvp_voting_closed, opponent:opponents(name, initials)')
      .eq('id', eventId)
      .maybeSingle()

    if (ev) {
      const opp = Array.isArray(ev.opponent) ? ev.opponent[0] : ev.opponent
      if (!isVotacaoMvpAberta({ ...ev, opponent: opp })) {
        return {
          ok: false,
          error: 'A votação de MVP para este jogo já se encontra encerrada.'
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao verificar se votação MVP está aberta:', e)
  }

  // Validação estrita: apenas convocados e treinadores podem votar
  const elegivel = await verificarElegibilidadeVotoMvp(eventId, voterId)
  if (!elegivel) {
    return {
      ok: false,
      error: 'Apenas os jogadores convocados e os treinadores podem votar no MVP deste jogo.'
    }
  }

  try {
    // Uma vez submetido o voto, já não se pode alterar
    const { data: votoExistente } = await supabase
      .from('mvp_votes')
      .select('id')
      .eq('event_id', eventId)
      .eq('voter_id', voterId)
      .maybeSingle()

    if (votoExistente) {
      return {
        ok: false,
        error: 'O teu voto já foi submetido anteriormente e não pode ser alterado.'
      }
    }

    const { error } = await supabase
      .from('mvp_votes')
      .insert({
        event_id: eventId,
        voter_id: voterId,
        player1_id: player1Id,
        player2_id: player2Id,
        updated_at: new Date().toISOString()
      })

    if (error) {
      console.error('Erro ao registar voto MVP:', error)
      return { ok: false, error: error.message }
    }

    // Tentar manter stats em sincronia com o vencedor
    sincronizarMvpNaTabelaStats(eventId).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    console.error('Exceção ao registar voto MVP:', err)
    return { ok: false, error: err.message || 'Erro ao gravar o teu voto.' }
  }
}

/**
 * Calcula a lista de eleitores obrigatórios do jogo (convocados + equipa técnica)
 * e o respetivo estado de votação (votou vs pendente).
 */
export function calcularEleitoresDoJogo(
  allProfiles: any[],
  callups: any[],
  stats: any[],
  votos: MvpVote[]
): EleitorMvpInfo[] {
  const callupMap = new Map((callups || []).map(c => [c.player_id, c]))
  const statMap = new Map((stats || []).map(s => [s.player_id, s]))
  const votosMap = new Map((votos || []).map(v => [v.voter_id, v]))

  const eleitores: EleitorMvpInfo[] = []
  const idsProcessados = new Set<string>()

  // 1. Atletas convocados e que participaram
  for (const p of allProfiles || []) {
    if (eAdepto(p)) continue
    const callup = callupMap.get(p.id)
    const st = statMap.get(p.id)

    // Se recusou a convocatória e não tem estatística no jogo, não participa na votação
    if (callup?.status === 'declined' && !st) continue

    const foiConvocado = Boolean(callup)
    const participou = Boolean(st && (st.lineup_status !== 'none' || st.goals > 0 || st.assists > 0 || st.yellow_cards > 0 || st.red_cards > 0))

    if (foiConvocado || participou) {
      idsProcessados.add(p.id)
      let funcao = 'Convocado'
      if (st?.lineup_status === 'starter' || callup?.notes?.includes('lineup:starter') || callup?.notes?.includes('starter')) {
        funcao = 'Titular'
      } else if (st?.lineup_status === 'sub' || callup?.notes?.includes('lineup:sub') || callup?.notes?.includes('sub')) {
        funcao = 'Suplente'
      }

      const voto = votosMap.get(p.id)
      eleitores.push({
        id: p.id,
        name: p.name,
        shirt_name: p.shirt_name,
        jersey_number: p.jersey_number,
        photo_url: p.photo_url,
        funcao,
        categoria: 'jogador',
        jaVotou: Boolean(voto),
        escolhas: voto ? [voto.player1_id, voto.player2_id] : undefined,
      })
    }
  }

  // 2. Equipa Técnica (apenas treinadores; o perfil de direção pura não tem direito a voto)
  for (const p of allProfiles || []) {
    if (eAdepto(p) || p.status === 'inactive') continue
    // Membros de Direção / Admin não são equipa técnica votante
    const isDirecao = eAdmin(p) || p.role === 'admin' || (Array.isArray(p.roles) && p.roles.includes('admin'))
    if (isDirecao) continue

    const isCoach = eTreinador(p)

    if (isCoach) {
      if (idsProcessados.has(p.id)) {
        // Já incluído como jogador/convocado, acrescentar menção ao cargo técnico
        const idx = eleitores.findIndex(e => e.id === p.id)
        if (idx !== -1) {
          eleitores[idx].funcao += ' / Treinador'
        }
      } else {
        idsProcessados.add(p.id)
        const voto = votosMap.get(p.id)
        eleitores.push({
          id: p.id,
          name: p.name,
          shirt_name: p.shirt_name,
          jersey_number: p.jersey_number,
          photo_url: p.photo_url,
          funcao: 'Treinador',
          categoria: 'staff',
          jaVotou: Boolean(voto),
          escolhas: voto ? [voto.player1_id, voto.player2_id] : undefined,
        })
      }
    }
  }

  // Ordenação: primeiro jogadores por número de camisola (com nulos no fim), depois staff por nome
  return eleitores.sort((a, b) => {
    if (a.categoria !== b.categoria) {
      return a.categoria === 'jogador' ? -1 : 1
    }
    if (a.categoria === 'jogador') {
      const numA = a.jersey_number ?? 999
      const numB = b.jersey_number ?? 999
      if (numA !== numB) return numA - numB
      return a.name.localeCompare(b.name, 'pt')
    }
    return a.name.localeCompare(b.name, 'pt')
  })
}

/** Constrói o texto formatado para partilha da Ficha de Jogo no WhatsApp. */
export function textoFichaJogoWhatsApp(
  evento: any,
  opcoes?: {
    adversarioNome?: string | null
    adversarioSigla?: string | null
    clubeNome?: string | null
    clubeSigla?: string | null
    campos?: readonly { id: string; name: string; address?: string | null }[]
  }
): string {
  const url = enderecoFichaJogo(evento.id)
  const d = new Date(evento.date_time)

  const dataFormatada = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const dataCapitalizada = dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)
  const horaFormatada = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

  const csc = opcoes?.clubeSigla || CLUBE_SIGLA
  const opp = opcoes?.adversarioSigla || opcoes?.adversarioNome || evento.opponent?.initials || evento.opponent?.name || 'Adversário'
  const confronto = evento.home_away === 'away' ? `${opp} vs ${csc}` : `${csc} vs ${opp}`

  let placar = ''
  if (evento.home_score !== null && evento.home_score !== undefined && evento.away_score !== null && evento.away_score !== undefined) {
    placar = evento.home_away === 'away'
      ? `${evento.away_score} - ${evento.home_score}`
      : `${evento.home_score} - ${evento.away_score}`
  }

  const { nome: localNome } = localDoEvento(evento, opcoes?.campos || [])

  const linhas: string[] = [
    `📋 *Ficha de Jogo — ${opcoes?.clubeNome || opcoes?.clubeSigla || CLUBE_SIGLA}*`,
    `⚽ *${confronto}*`,
  ]

  if (placar) {
    linhas.push(`📊 *Resultado final: ${placar}*`)
  }

  linhas.push(`📅 ${dataCapitalizada} às ${horaFormatada}`)

  if (localNome) {
    linhas.push(`📍 Local: ${localNome}`)
  }

  linhas.push('')
  linhas.push('━━━━━━━━━━━━━━━━━━━━━')
  linhas.push('🏆 *VOTAÇÃO MVP DO JOGO*')
  linhas.push('A ficha de jogo já está disponível na aplicação!')
  linhas.push('Acede ao link abaixo e vota no *Melhor (3 pts)* e no *2º Melhor (1 pt)* em campo:')
  linhas.push('👉 O jogador com mais pontos será eleito o MVP da partida!')
  linhas.push('')
  linhas.push(`👉 ${url}`)
  linhas.push('━━━━━━━━━━━━━━━━━━━━━')

  return linhas.join('\n')
}

/** Copia o link direto da ficha de jogo para a área de transferência. */
export async function copiarLinkFichaJogo(idEvento: string): Promise<boolean> {
  const url = enderecoFichaJogo(idEvento)
  triggerHaptic('light')
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      toast.success('Link da ficha de jogo copiado!')
      return true
    }
    throw new Error('Sem suporte para área de transferência')
  } catch {
    toast.error('Não foi possível copiar o link.')
    return false
  }
}

/** Abre o WhatsApp com a mensagem formatada da ficha de jogo e votação MVP. */
export function partilharFichaJogoWhatsApp(
  evento: any,
  opcoes?: {
    adversarioNome?: string | null
    adversarioSigla?: string | null
    clubeNome?: string | null
    clubeSigla?: string | null
    campos?: readonly { id: string; name: string; address?: string | null }[]
  }
): void {
  triggerHaptic('light')
  const texto = textoFichaJogoWhatsApp(evento, opcoes)
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Processamento de notificação de publicação da Ficha de Jogo:
 * Para garantir que apenas os jogadores convocados e a equipa técnica recebem pedidos
 * de voto e têm hipótese de votar, NÃO criamos comunicados globais de clube (que notificariam
 * todo o plantel indiscriminadamente).
 * As notificações direcionadas são enviadas exclusivamente via:
 * 1) Notificações Push direcionadas (função SQL `avisos_pendentes()`, restrita a convocados e equipa técnica com votos pendentes);
 * 2) Cartão de alerta na Homepage (`AlertaMvpPendente`), visível apenas aos convocados desse jogo e equipa técnica;
 * 3) Partilha direta no grupo de WhatsApp da convocatória do jogo (`partilharFichaJogoWhatsApp`).
 */
export async function notificarFichaJogoPublicada(
  evento: any,
  _opcoes?: { clubeSigla?: string }
): Promise<void> {
  // Chamada de controlo / log seguro sem poluir o mural público nem notificar atletas não convocados
  if (import.meta.env.DEV) {
    console.log(`[MVP] Ficha de jogo gravada para o evento ${evento?.id}. Notificações estritamente direcionadas aos convocados e equipa técnica.`)
  }
}

