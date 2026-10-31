import { supabase } from './supabaseClient'
import { equipaDoTorneio } from './classificacao'
import { resolverUrlEmblema } from './sincronizarEquipas'
import {
  DEFAULT_KNOCKOUT_TOURNAMENT_RULES,
  obterRotuloEliminatoria,
  type KnockoutMatchMeta,
  type TournamentRules,
} from '../components/clube/torneios'

export interface JogoCalendarioTacaDef {
  match_number: number
  matchday: number
  round_label: string
  /** Nome da equipa visitada ('Cascais' para o clube, nome do adversário, ou null se placeholder) */
  home_team_name: string | null
  /** Nome da equipa visitante ('Cascais' para o clube, nome do adversário, ou null se placeholder) */
  away_team_name: string | null
  home_placeholder: string | null
  away_placeholder: string | null
  location: string | null
  match_date: string
  match_time: string | null
}

export const NOME_TACA_VETERANOS_2026 = '3ª Taça de Veteranos - Cascais 2026'
export const EPOCA_TACA_VETERANOS_2026 = '2026/2027'
export const ORGANIZADOR_TACA_VETERANOS_2026 = 'UCFFCC'
export const IMAGEM_TACA_VETERANOS_2026 = '/csc-vet/emblemas/ucffcc.jpg'

export const JOGOS_OFICIAIS_TACA_2026: JogoCalendarioTacaDef[] = [
  // Oitavos de Final (29/11/2026)
  {
    match_number: 1,
    matchday: 1,
    round_label: 'Oitavos de Final',
    home_team_name: 'Carcavelos',
    away_team_name: 'Central 32',
    home_placeholder: null,
    away_placeholder: null,
    location: 'Carcavelos',
    match_date: '2026-11-29',
    match_time: '15:00',
  },
  // Quartos de Final (06/12/2026)
  {
    match_number: 2,
    matchday: 2,
    round_label: 'Quartos de Final',
    home_team_name: 'Cascais',
    away_team_name: 'Tires',
    home_placeholder: null,
    away_placeholder: null,
    location: 'Cascais',
    match_date: '2026-12-06',
    match_time: '15:00',
  },
  {
    match_number: 3,
    matchday: 2,
    round_label: 'Quartos de Final',
    home_team_name: 'Malveira da Serra',
    away_team_name: 'Estoril Praia',
    home_placeholder: null,
    away_placeholder: null,
    location: 'Malveira da Serra',
    match_date: '2026-12-06',
    match_time: '15:00',
  },
  {
    match_number: 4,
    matchday: 2,
    round_label: 'Quartos de Final',
    home_team_name: 'Torre',
    away_team_name: null,
    home_placeholder: null,
    away_placeholder: 'VENCEDOR JOGO 1',
    location: 'Torre',
    match_date: '2026-12-06',
    match_time: '15:00',
  },
  {
    match_number: 5,
    matchday: 2,
    round_label: 'Quartos de Final',
    home_team_name: 'Zambujeiro',
    away_team_name: 'Lisbon Casuals',
    home_placeholder: null,
    away_placeholder: null,
    location: 'Malveira da Serra',
    match_date: '2026-12-06',
    match_time: '17:00',
  },
  // Meias Finais (13/12/2026)
  {
    match_number: 6,
    matchday: 3,
    round_label: 'Meias Finais',
    home_team_name: null,
    away_team_name: null,
    home_placeholder: 'VENCEDOR JOGO 2',
    away_placeholder: 'VENCEDOR JOGO 3',
    location: null,
    match_date: '2026-12-13',
    match_time: null,
  },
  {
    match_number: 7,
    matchday: 3,
    round_label: 'Meias Finais',
    home_team_name: null,
    away_team_name: null,
    home_placeholder: 'VENCEDOR JOGO 5',
    away_placeholder: 'VENCEDOR JOGO 4',
    location: null,
    match_date: '2026-12-13',
    match_time: null,
  },
  // Final (20/12/2026)
  {
    match_number: 8,
    matchday: 4,
    round_label: 'Final',
    home_team_name: null,
    away_team_name: null,
    home_placeholder: 'VENCEDOR JOGO 6',
    away_placeholder: 'VENCEDOR JOGO 7',
    location: null,
    match_date: '2026-12-20',
    match_time: null,
  },
]

const EQUIPAS_ADVERSARIAS_TACA: {
  name: string
  initials: string
  fieldName: string
  fieldAddress: string
  homeKit1: string
  homeKit2: string | null
  awayKit1: string
  awayKit2: string | null
  logo: string | null
}[] = [
  {
    name: 'Carcavelos',
    initials: 'CARC',
    fieldName: 'Carcavelos',
    fieldAddress: 'Campo do GS Carcavelos, Carcavelos',
    homeKit1: 'Azul',
    homeKit2: 'Branco',
    awayKit1: 'Branco',
    awayKit2: null,
    logo: null,
  },
  {
    name: 'Central 32',
    initials: 'C32',
    fieldName: 'Carcavelos',
    fieldAddress: 'Campo do GS Carcavelos, Carcavelos',
    homeKit1: 'Preto',
    homeKit2: 'Branco',
    awayKit1: 'Branco',
    awayKit2: null,
    logo: null,
  },
  {
    name: 'Tires',
    initials: 'TIR',
    fieldName: 'URD Tires',
    fieldAddress: 'Rua Campo de Futebol, 2785-609 Tires',
    homeKit1: 'Verde',
    homeKit2: null,
    awayKit1: 'Branco',
    awayKit2: null,
    logo: 'emblemas/urd-tires.png',
  },
  {
    name: 'Malveira da Serra',
    initials: 'MALV',
    fieldName: 'Malveira da Serra',
    fieldAddress: 'Campo da Malveira da Serra, Cascais',
    homeKit1: 'Verde',
    homeKit2: 'Branco',
    awayKit1: 'Branco',
    awayKit2: null,
    logo: null,
  },
  {
    name: 'Estoril Praia',
    initials: 'EST',
    fieldName: 'Estoril Praia',
    fieldAddress: 'Centro de Excelência do Estoril Praia, Estoril',
    homeKit1: 'Amarelo',
    homeKit2: 'Azul',
    awayKit1: 'Branco',
    awayKit2: null,
    logo: null,
  },
  {
    name: 'Torre',
    initials: 'TOR',
    fieldName: 'AFD Torre',
    fieldAddress: 'Rua das Caravelas, 2750-615 Cascais',
    homeKit1: 'Vermelho',
    homeKit2: null,
    awayKit1: 'Azul',
    awayKit2: null,
    logo: 'emblemas/afd-torre.png',
  },
  {
    name: 'Zambujeiro',
    initials: 'ZAMB',
    fieldName: 'Malveira da Serra',
    fieldAddress: 'Campo da Malveira da Serra, Cascais',
    homeKit1: 'Branco',
    homeKit2: 'Azul',
    awayKit1: 'Azul',
    awayKit2: null,
    logo: 'emblemas/zambujeiro.jpg',
  },
  {
    name: 'Lisbon Casuals',
    initials: 'LCAS',
    fieldName: '9 Abril Trajouce',
    fieldAddress: 'Rua Sabino Luis Pedroso, 2785-673 São Domingos Rana',
    homeKit1: 'Azul',
    homeKit2: null,
    awayKit1: 'Amarelo',
    awayKit2: null,
    logo: 'emblemas/lisbon-casuals.png',
  },
]

/**
 * Obtém os metadados de eliminatória (nº do jogo, local, hora, placeholders, penalties)
 * para uma linha de `tournament_matches`.
 */
export function inferirNumeroJogoTaca(match: any, allMatches: any[] = []): number {
  if (!match) return 1
  const round = Number(match.matchday ?? 1)
  if (round === 1) return 1 // Único jogo dos Oitavos
  if (round === 4) return 8 // Final

  if (round === 2) {
    const quartos = allMatches.filter(m => Number(m.matchday ?? 1) === 2)
    if (quartos.length > 0) {
      const idx = quartos.findIndex(m => m.id === match.id)
      if (idx >= 0) return idx + 2
    }
    return 2
  }

  if (round === 3) {
    const meias = allMatches.filter(m => Number(m.matchday ?? 1) === 3)
    if (meias.length > 0) {
      const idx = meias.findIndex(m => m.id === match.id)
      if (idx >= 0) return idx + 6
    }
    return 6
  }

  return 1
}

/**
 * Obtém os metadados de eliminatória (nº do jogo, local, hora, placeholders, penalties)
 * para uma linha de `tournament_matches`.
 */
export function obterMetaJogoKnockout(
  rules: Partial<TournamentRules> | null | undefined,
  match: any,
  allMatches: any[] = [],
): KnockoutMatchMeta {
  const kmMap = (rules?.knockout_matches && typeof rules.knockout_matches === 'object' && !Array.isArray(rules.knockout_matches))
    ? rules.knockout_matches
    : {}

  // 1. Por ID direto na chave do dicionário
  let salvo: KnockoutMatchMeta | undefined = match?.id ? kmMap[match.id] : undefined

  // 2. Por match_id guardado dentro do objeto
  if (!salvo && match?.id) {
    salvo = Object.values(kmMap).find(k => k && k.match_id === match.id)
  }

  // 3. Determinar número oficial do jogo
  let matchNumber = salvo?.match_number
  if (!matchNumber) {
    matchNumber = inferirNumeroJogoTaca(match, allMatches)
  }

  // 4. Se ainda não temos 'salvo', tentar por chave `jogo_${matchNumber}` ou find match_number
  if (!salvo && matchNumber) {
    salvo = kmMap[`jogo_${matchNumber}`] ?? Object.values(kmMap).find(k => k && k.match_number === matchNumber)
  }

  // 5. Definição oficial estática da Taça como garantia permanente de integridade
  const defOficial = JOGOS_OFICIAIS_TACA_2026.find(j => j.match_number === matchNumber)

  const rawDate = match?.match_date ? String(match.match_date) : null
  const dateOnly = rawDate ? rawDate.slice(0, 10) : (salvo?.match_date ?? defOficial?.match_date ?? null)
  let timeOnly = salvo?.match_time ?? defOficial?.match_time ?? null
  if (!timeOnly && rawDate && rawDate.includes('T')) {
    const tPart = rawDate.split('T')[1]?.slice(0, 5)
    if (tPart && tPart !== '00:00') timeOnly = tPart
  }

  const roundNum = Number(match?.matchday ?? salvo?.matchday ?? defOficial?.matchday ?? 1)

  return {
    match_id: match?.id ?? salvo?.match_id,
    match_number: matchNumber,
    matchday: roundNum,
    round_label: salvo?.round_label ?? defOficial?.round_label ?? obterRotuloEliminatoria(roundNum, null, rules),
    home_placeholder: (salvo?.home_placeholder !== undefined && salvo?.home_placeholder !== null && salvo?.home_placeholder !== '')
      ? salvo.home_placeholder
      : (defOficial?.home_placeholder ?? null),
    away_placeholder: (salvo?.away_placeholder !== undefined && salvo?.away_placeholder !== null && salvo?.away_placeholder !== '')
      ? salvo.away_placeholder
      : (defOficial?.away_placeholder ?? null),
    location: salvo?.location ?? defOficial?.location ?? null,
    match_date: dateOnly,
    match_time: timeOnly,
    home_penalties: salvo?.home_penalties ?? null,
    away_penalties: salvo?.away_penalties ?? null,
  }
}

/**
 * Determina o vencedor de um jogo a eliminar ('home' | 'away' | null).
 * Em caso de igualdade no final do tempo regulamentar, desempata pelas grandes penalidades.
 */
export function determinarVencedorKnockout(
  match: any,
  meta?: KnockoutMatchMeta | null,
): 'home' | 'away' | null {
  if (!match) return null
  const temScore = match.home_score !== null && match.home_score !== undefined &&
                   match.away_score !== null && match.away_score !== undefined
  if (!temScore) return null

  const h = Number(match.home_score)
  const a = Number(match.away_score)
  if (h > a) return 'home'
  if (a > h) return 'away'

  // Empate nos 70 minutos: desempate por grandes penalidades
  const hp = meta?.home_penalties ?? match?.home_penalties
  const ap = meta?.away_penalties ?? match?.away_penalties
  if (hp !== null && hp !== undefined && ap !== null && ap !== undefined) {
    const numHp = Number(hp)
    const numAp = Number(ap)
    if (numHp > numAp) return 'home'
    if (numAp > numHp) return 'away'
  }
  return null
}

export interface EquipaResolvidaKnockout {
  sigla: string
  nome: string
  logo: string | null
  eOClube: boolean
  teamId: string | null
  placeholder: string | null
  isPlaceholder: boolean
  resolvidoDePlaceholder: boolean
}

/**
 * Resolve a equipa a apresentar num lado ('home' | 'away') de um jogo de eliminatória.
 * Se o lugar depender de um jogo anterior ("VENCEDOR JOGO X") e esse jogo já tiver vencedor,
 * resolve automaticamente a equipa apurada.
 */
export function resolverEquipaKnockout(
  lado: 'home' | 'away',
  match: any,
  meta: KnockoutMatchMeta,
  allMatches: any[],
  teams: any[],
  clubSettings: any,
  rules?: Partial<TournamentRules> | null,
  depth = 0,
): EquipaResolvidaKnockout {
  const teamId = lado === 'home' ? match?.home_team_id : match?.away_team_id
  const placeholder = (lado === 'home' ? meta?.home_placeholder : meta?.away_placeholder)?.trim() || null

  // Se existe placeholder "VENCEDOR JOGO X" e não há equipa fixa,
  // ou se o lugar depender do jogo anterior e este já terminou com vencedor:
  if (!teamId && placeholder && depth < 6) {
    const m = placeholder.match(/vencedors+jogos+(d+)/i)
    if (m) {
      const targetNum = Number(m[1])
      // 1ª busca: por match_number inferido ou em meta
      let sourceMatch = allMatches.find(
        cand => cand && obterMetaJogoKnockout(rules, cand, allMatches).match_number === targetNum
      )
      // 2ª busca (fallback): por ronda se for Jogo 1 ou Jogo 8
      if (!sourceMatch && targetNum === 1) {
        sourceMatch = allMatches.find(cand => cand && Number(cand.matchday ?? 1) === 1)
      }

      if (sourceMatch) {
        const sourceMeta = obterMetaJogoKnockout(rules, sourceMatch, allMatches)
        const vencedor = determinarVencedorKnockout(sourceMatch, sourceMeta)
        if (vencedor) {
          const resolvida = resolverEquipaKnockout(
            vencedor,
            sourceMatch,
            sourceMeta,
            allMatches,
            teams,
            clubSettings,
            rules,
            depth + 1,
          )
          if (!resolvida.isPlaceholder) {
            return {
              ...resolvida,
              placeholder,
              resolvidoDePlaceholder: true,
            }
          }
        }
      }
    }
  }

  if (teamId) {
    const teamObj = teams.find(t => t.id === teamId)
    if (teamObj) {
      const info = equipaDoTorneio(teamObj, clubSettings)
      const nomeExtenso = teamObj.opponent_id === null
        ? (clubSettings?.name || 'Cascais')
        : (teamObj.opponent?.name || info.sigla)
      return {
        sigla: info.sigla,
        nome: nomeExtenso,
        logo: info.logo,
        eOClube: info.eOClube,
        teamId,
        placeholder,
        isPlaceholder: false,
        resolvidoDePlaceholder: Boolean(placeholder),
      }
    }
  }

  const label = placeholder || 'Por definir'
  return {
    sigla: label,
    nome: label,
    logo: null,
    eOClube: false,
    teamId: null,
    placeholder,
    isPlaceholder: true,
    resolvidoDePlaceholder: false,
  }
}

let sincronizacaoEmCurso: Promise<string | null> | null = null

/**
 * Garante de forma idempotente que a "3ª Taça de Veteranos - Cascais 2026" (UCFFCC),
 * respetivas equipas, campos, quadro competitivo (Jogos 1 a 8) e o jogo do Cascais
 * nos Quartos de Final (06/12/2026 às 15:00 vs Tires) existem na base de dados.
 *
 * Não executa automaticamente contra o mock de testes E2E (`teste.supabase.co`),
 * a menos que seja invocado explicitamente pelo utilizador (`forcar = true`).
 */
export async function garantirTacaVeteranos2026(opcoes?: { forcar?: boolean }): Promise<string | null> {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '')
  if (!opcoes?.forcar && (url.includes('teste.supabase.co') || !url)) {
    return null
  }
  if (!opcoes?.forcar) {
    try {
      if (sessionStorage.getItem('csc_taca_2026_checked') === '1') return null
    } catch {
      // ignore
    }
  }
  if (sincronizacaoEmCurso) return sincronizacaoEmCurso

  sincronizacaoEmCurso = (async () => {
    try {
      // 1. Verificar se já existe o torneio Taça de Veteranos
      const { data: existentes, error: errTour } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false })

      if (errTour) return null

      let torneio = (existentes ?? []).find(
        t => /ta[cç]a de veteranos/i.test(t.name || '')
      )

      // Se já existe, tem metadados completos de eliminatória e os 8 jogos, marcamos como verificado
      const kmExistente = torneio?.rules?.knockout_matches
      const temMetaCompleto = torneio?.rules?.format === 'knockout' &&
        kmExistente && typeof kmExistente === 'object' && Object.keys(kmExistente).length >= 8

      if (torneio && !opcoes?.forcar && temMetaCompleto) {
        const { count } = await supabase
          .from('tournament_matches')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', torneio.id)
        if ((count ?? 0) >= 8) {
          try { sessionStorage.setItem('csc_taca_2026_checked', '1') } catch { /* ignore */ }
          return torneio.id
        }
      }

      // 2. Garantir Campos necessários
      const { data: camposDB } = await supabase.from('fields').select('id, name, address')
      const listaCampos = [...(camposDB ?? [])]

      const garantirCampo = async (nome: string, morada: string): Promise<string | null> => {
        const norm = nome.toLowerCase().trim()
        const existente = listaCampos.find(c => {
          const cn = (c.name || '').toLowerCase().trim()
          if (cn === norm) return true
          if (norm.includes('cascais') && (cn.includes('gds') || (cn.includes('cascais') && !cn.includes('torre')))) return true
          if (norm.includes('torre') && cn.includes('torre') && !cn.includes('gds')) return true
          if (norm.includes('tires') && cn.includes('tires')) return true
          if (norm.includes('trajouce') && (cn.includes('trajouce') || cn.includes('abril'))) return true
          if (norm.includes('malveira') && cn.includes('malveira')) return true
          if (norm.includes('carcavelos') && cn.includes('carcavelos')) return true
          if (norm.includes('estoril') && cn.includes('estoril')) return true
          return false
        })
        if (existente) return existente.id
        const { data: novo } = await supabase
          .from('fields')
          .insert([{ name: nome, address: morada }])
          .select('id, name, address')
          .maybeSingle()
        if (novo) {
          listaCampos.push(novo)
          return novo.id
        }
        return null
      }

      const idCampoCascais = await garantirCampo('GDS Cascais', 'Rua da Torre, 2750-148 Cascais')

      // 3. Garantir Adversários da Taça
      const { data: oppsDB } = await supabase.from('opponents').select('*')
      const listaOpps = [...(oppsDB ?? [])]
      const mapaOpponentId = new Map<string, string>()

      for (const eq of EQUIPAS_ADVERSARIAS_TACA) {
        const campoId = await garantirCampo(eq.fieldName, eq.fieldAddress)
        const logoResolved = eq.logo ? resolverUrlEmblema(eq.logo) : null
        const norm = eq.name.toLowerCase().trim()

        const existente = listaOpps.find(o => {
          const on = (o.name || '').toLowerCase().trim()
          const oi = (o.initials || '').toLowerCase().trim()
          if (on === norm || oi === eq.initials.toLowerCase()) return true
          if (norm === 'torre' && (on.includes('torre') || on.includes('afd')) && !on.includes('cascais')) return true
          if (norm === 'tires' && on.includes('tires')) return true
          if (norm === 'lisbon casuals' && on.includes('casuals')) return true
          if (norm === 'malveira da serra' && on.includes('malveira')) return true
          if (norm === 'estoril praia' && on.includes('estoril')) return true
          if (norm === 'carcavelos' && on.includes('carcavelos')) return true
          if (norm === 'central 32' && on.includes('central')) return true
          if (norm === 'zambujeiro' && on.includes('zambujeiro')) return true
          return false
        })

        if (existente) {
          mapaOpponentId.set(eq.name, existente.id)
        } else {
          const { data: novoOpp } = await supabase
            .from('opponents')
            .insert([{
              name: eq.name,
              initials: eq.initials,
              home_field_id: campoId,
              home_kit_color_1: eq.homeKit1,
              home_kit_color_2: eq.homeKit2,
              away_kit_color_1: eq.awayKit1,
              away_kit_color_2: eq.awayKit2,
              logo_url: logoResolved,
            }])
            .select('*')
            .maybeSingle()
          if (novoOpp) {
            listaOpps.push(novoOpp)
            mapaOpponentId.set(eq.name, novoOpp.id)
          }
        }
      }

      // 4. Criar ou atualizar o Torneio "3ª Taça de Veteranos - Cascais 2026"
      const imagemTaca = resolverUrlEmblema('emblemas/ucffcc.jpg')
      const regrasIniciais: TournamentRules = {
        ...DEFAULT_KNOCKOUT_TOURNAMENT_RULES,
        ...(torneio?.rules ?? {}),
        format: 'knockout',
      }

      if (!torneio) {
        const { data: criado, error: errCriar } = await supabase
          .from('tournaments')
          .insert([{
            name: NOME_TACA_VETERANOS_2026,
            season: EPOCA_TACA_VETERANOS_2026,
            status: 'ativo',
            organizer_name: ORGANIZADOR_TACA_VETERANOS_2026,
            image_url: imagemTaca,
            rules: regrasIniciais,
          }])
          .select('*')
          .single()
        if (errCriar || !criado) return null
        torneio = criado
      }

      const tournamentId = torneio.id as string

      // 5. Garantir Grupo "Quadro Competitivo" em tournament_groups
      const { data: gruposExistentes } = await supabase
        .from('tournament_groups')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('phase', { ascending: true })

      let groupId: string
      if (gruposExistentes && gruposExistentes.length > 0) {
        groupId = gruposExistentes[0].id
      } else {
        const { data: novoGrupo, error: errGrupo } = await supabase
          .from('tournament_groups')
          .insert([{ tournament_id: tournamentId, name: 'Quadro Competitivo', phase: 1 }])
          .select('id')
          .single()
        if (errGrupo || !novoGrupo) return tournamentId
        groupId = novoGrupo.id
      }

      // 6. Garantir todas as 9 Equipas (Cascais + 8 adversários) em tournament_teams
      const { data: teamsExistentes } = await supabase
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournamentId)

      const listaTeams = [...(teamsExistentes ?? [])]
      const garantirTeamNoTorneio = async (opponentId: string | null): Promise<string | null> => {
        const ja = listaTeams.find(t => (t.opponent_id ?? null) === opponentId)
        if (ja) return ja.id
        const { data: novaTeam } = await supabase
          .from('tournament_teams')
          .insert([{
            tournament_id: tournamentId,
            group_id: groupId,
            opponent_id: opponentId,
          }])
          .select('*')
          .maybeSingle()
        if (novaTeam) {
          listaTeams.push(novaTeam)
          return novaTeam.id
        }
        return null
      }

      const cscTeamId = await garantirTeamNoTorneio(null)
      const mapaTeamIdPorNome = new Map<string, string>()
      if (cscTeamId) mapaTeamIdPorNome.set('Cascais', cscTeamId)

      for (const [nomeEq, oppId] of mapaOpponentId.entries()) {
        const tId = await garantirTeamNoTorneio(oppId)
        if (tId) mapaTeamIdPorNome.set(nomeEq, tId)
      }

      // 7. Garantir os 8 jogos do calendário oficial em tournament_matches
      const { data: matchesExistentes } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('matchday', { ascending: true })

      const knockoutMatchesMeta: Record<string, KnockoutMatchMeta> = {
        ...(torneio.rules?.knockout_matches ?? {}),
      }

      if (opcoes?.forcar && matchesExistentes && matchesExistentes.length > 0) {
        await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId)
      }

      const listaExistentes = (opcoes?.forcar ? [] : (matchesExistentes ?? []))

      // Verificar ou criar o evento oficial de Jogo 2 (Cascais vs Tires, 06/12/2026 15:00)
      const oppTiresId = mapaOpponentId.get('Tires') ?? null
      let eventoJogo2Id: string | null = null
      if (oppTiresId) {
        const { data: evExistente } = await supabase
          .from('events')
          .select('id')
          .eq('type', 'match')
          .eq('opponent_id', oppTiresId)
          .gte('date_time', '2026-12-06T00:00:00Z')
          .lte('date_time', '2026-12-06T23:59:59Z')
          .maybeSingle()

        if (evExistente) {
          eventoJogo2Id = evExistente.id
          await supabase
            .from('events')
            .update({
              tournament_id: tournamentId,
              matchday: 2,
              home_away: 'home',
              field_id: idCampoCascais,
            })
            .eq('id', evExistente.id)
        } else {
          const { data: novoEv } = await supabase
            .from('events')
            .insert([{
              title: 'Jogo vs Tires',
              type: 'match',
              date_time: new Date('2026-12-06T15:00:00').toISOString(),
              meeting_time: '14:00:00',
              field_id: idCampoCascais,
              is_friendly: false,
              is_active: true,
              tournament_id: tournamentId,
              matchday: 2,
              opponent_id: oppTiresId,
              home_away: 'home',
              description: 'Quartos de Final (Jogo 2) — 3ª Taça de Veteranos UCFFCC',
            }])
            .select('id')
            .maybeSingle()
          if (novoEv) eventoJogo2Id = novoEv.id
        }
      }

      for (const j of JOGOS_OFICIAIS_TACA_2026) {
        const homeTeamId = j.home_team_name ? (mapaTeamIdPorNome.get(j.home_team_name) ?? null) : null
        const awayTeamId = j.away_team_name ? (mapaTeamIdPorNome.get(j.away_team_name) ?? null) : null
        const isoDate = j.match_time
          ? `${j.match_date}T${j.match_time}:00Z`
          : `${j.match_date}T15:00:00Z`

        // Procurar se já existe correspondência em matches existentes sem apagar resultados já registados
        let mExistente = listaExistentes.find(cand => {
          if (cand.matchday !== j.matchday) return false
          if (j.match_number === 1 && cand.matchday === 1) return true
          if (j.match_number === 8 && cand.matchday === 4) return true
          if (j.match_number === 2 && (cand.home_team_id === homeTeamId || cand.away_team_id === awayTeamId)) return true
          if (j.match_number === 3 && (cand.home_team_id === homeTeamId || cand.away_team_id === awayTeamId)) return true
          if (j.match_number === 4 && cand.home_team_id === homeTeamId) return true
          if (j.match_number === 5 && (cand.home_team_id === homeTeamId || cand.away_team_id === awayTeamId)) return true
          return false
        })

        if (!mExistente && j.matchday === 3) {
          const meias = listaExistentes.filter(c => c.matchday === 3)
          if (j.match_number === 6 && meias[0]) mExistente = meias[0]
          if (j.match_number === 7 && meias[1]) mExistente = meias[1]
        }

        let matchIdReal = mExistente?.id
        if (!matchIdReal) {
          const payload: Record<string, any> = {
            tournament_id: tournamentId,
            group_id: groupId,
            matchday: j.matchday,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            status: 'scheduled',
            match_date: isoDate,
          }
          if (j.match_number === 2 && eventoJogo2Id) {
            payload.event_id = eventoJogo2Id
          }
          const { data: mInserido } = await supabase
            .from('tournament_matches')
            .insert([payload])
            .select('id')
            .maybeSingle()
          matchIdReal = mInserido?.id
        }

        const metaEntry: KnockoutMatchMeta = {
          match_id: matchIdReal,
          match_number: j.match_number,
          matchday: j.matchday,
          round_label: j.round_label,
          home_placeholder: j.home_placeholder,
          away_placeholder: j.away_placeholder,
          location: j.location,
          match_date: j.match_date,
          match_time: j.match_time,
          home_penalties: null,
          away_penalties: null,
        }
        if (matchIdReal) {
          knockoutMatchesMeta[matchIdReal] = metaEntry
        }
        knockoutMatchesMeta[`jogo_${j.match_number}`] = metaEntry
      }

      const novasRegras: TournamentRules = {
        ...regrasIniciais,
        format: 'knockout',
        knockout_matches: knockoutMatchesMeta,
      }
      await supabase
        .from('tournaments')
        .update({
          rules: novasRegras,
          organizer_name: torneio.organizer_name || ORGANIZADOR_TACA_VETERANOS_2026,
          image_url: torneio.image_url || imagemTaca,
        })
        .eq('id', tournamentId)

      try { sessionStorage.setItem('csc_taca_2026_checked', '1') } catch { /* ignore */ }
      return tournamentId
    } catch (err) {
      console.warn('Aviso ao sincronizar 3ª Taça de Veteranos 2026:', err)
      return null
    } finally {
      sincronizacaoEmCurso = null
    }
  })()

  return sincronizacaoEmCurso
}
