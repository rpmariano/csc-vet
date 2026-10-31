/**
 * As regras de uma prova, e o que se faz com elas.
 *
 * Vinham do `AdminDashboard`. Ficam num módulo à parte porque quem as usa são
 * vários: o ecrã de gestão dos torneios, a classificação/quadro competitivo,
 * a convocatória e a ficha de jogo (que precisa do `yellow_cards_to_suspension`
 * para contar os amarelos).
 */

export type TournamentFormat = 'single_league' | 'two_phases' | 'knockout'
export type KnockoutTiebreaker = 'penalties' | 'extra_time_penalties' | 'two_legs'
export type KnockoutRoundKey = 'round_of_16' | 'quarter_finals' | 'semi_finals' | 'final'
export type KitConflictRule = 'away_changes' | 'home_changes'

export interface KnockoutRoundDef {
  /** Número da eliminatória (ex: 1, 2, 3...) */
  round: number
  /** Nome legível da fase (ex: 'Oitavos de Final', 'Quartos de Final', 'Meias Finais', 'Final') */
  name: string
}

export interface KnockoutMatchMeta {
  /** ID do jogo em tournament_matches (opcional, usado para cruzar) */
  match_id?: string
  /** Nº oficial do jogo no quadro competitivo (ex: 1 a 8 -> "Jogo 1" .. "Jogo 8") */
  match_number: number
  /** Eliminatória: 1 = Oitavos de Final, 2 = Quartos de Final, 3 = Meias Finais, 4 = Final */
  matchday: number
  /** Rótulo personalizado da eliminatória (ex: 'Oitavos de Final') */
  round_label?: string | null
  /** Origem/placeholder quando a equipa visitada vem de outro jogo (ex: "VENCEDOR JOGO 2") */
  home_placeholder?: string | null
  /** Origem/placeholder quando a equipa visitante vem de outro jogo (ex: "VENCEDOR JOGO 1") */
  away_placeholder?: string | null
  /** Tipo estruturado de origem do visitado */
  home_source_type?: 'team' | 'winner' | 'loser' | 'custom'
  /** Número do jogo de origem do visitado (se winner ou loser) */
  home_source_match_num?: number | null
  /** Tipo estruturado de origem do visitante */
  away_source_type?: 'team' | 'winner' | 'loser' | 'custom'
  /** Número do jogo de origem do visitante (se winner ou loser) */
  away_source_match_num?: number | null
  /** Local do jogo (ex: "Carcavelos", "Cascais", "Malveira da Serra", "Torre") */
  location?: string | null
  /** Data do jogo YYYY-MM-DD (ex: "2026-11-29") */
  match_date?: string | null
  /** Horário do jogo HH:MM (ex: "15:00", "17:00") */
  match_time?: string | null
  /** Golos nas grandes penalidades em caso de empate no tempo regulamentar */
  home_penalties?: number | null
  away_penalties?: number | null
}

export interface TournamentRules {
  /** Modelo competitivo: Liga Única ('single_league'), 2 Fases ('two_phases') ou Taça/Eliminatórias ('knockout'). */
  format?: TournamentFormat
  /** Critério principal de desempate na classificação: confronto direto ('head_to_head') ou diferença de golos geral ('goal_difference'). */
  tiebreaker?: 'head_to_head' | 'goal_difference'
  /** Desempate em jogos a eliminar (Taça): penalties diretos, prolongamento + penalties ou 2 mãos. */
  knockout_tiebreaker?: KnockoutTiebreaker
  /** Primeira eliminatória do quadro da Taça (ex: Oitavos de Final = 'round_of_16'). */
  knockout_starting_round?: KnockoutRoundKey
  /** Número de lugares que se apuram para a fase final ou playoff (ex: 2 ou 4 primeiros). */
  promotion_spots?: number
  /** Número de lugares de descida / taça consolação (opcional). */
  relegation_spots?: number
  min_age?: number
  /** Ano de nascimento máximo permitido sem estatuto de exceção (ex: 1990 -> nascidos em 1990 ou antes). */
  max_birth_year?: number | null
  exceptions_allowed?: boolean
  exceptions_count?: number
  exceptions_min_age: number
  /** Ano de nascimento máximo permitido para a exceção de idade (ex: 1991 -> nascidos em 1991). */
  exceptions_max_birth_year?: number | null
  /** Se verdadeiro, não há limite máximo de jogadores inscritos no plantel da prova. */
  unlimited_squad?: boolean
  max_squad_size: number
  max_match_players: number
  min_match_players: number
  /** Condições regulamentares de inscrição e participação (editáveis). */
  forbid_fpf_federated?: boolean
  require_id_document?: boolean
  require_medical_exam?: boolean
  medical_exam_valid_until?: string | null
  require_insurance?: boolean
  exclusive_club_representation?: boolean
  roster_update_deadline?: string | null
  match_duration_mins: number
  half_duration_mins: number
  /** Duração do intervalo em minutos (ex: 10 mins). */
  halftime_duration_mins?: number
  rolling_subs: boolean
  /** Regra de mudança de equipamento quando há conflito de cores: 'home_changes' (muda visitado/casa) ou 'away_changes' (muda visitante). */
  kit_conflict_rule?: KitConflictRule
  /** Se ativa suspensão por acumulação de amarelos (0 ou desativado = desativado). */
  yellow_cards_suspension_enabled?: boolean
  yellow_cards_to_suspension: number
  /** Suspensão automática de 1 jogo por expulsão direta (cartão vermelho). Opcional/configurável. */
  red_card_suspension?: boolean
  /** Suspensão automática de 1 jogo por acumulação de 2 amarelos no mesmo jogo. Opcional/configurável. */
  double_yellow_suspension?: boolean
  /** Agressão violenta penalizada com impedimento de continuar a participar na Prova. */
  violent_conduct_expulsion?: boolean
  /** Jogos de suspensão não cumpridos transitam para a edição do ano seguinte. */
  suspensions_carry_over?: boolean
  walkover_score: string
  max_walkovers_allowed: number
  delay_tolerance_mins: number
  /** Entidade responsável pela arbitragem (ex: "NAFLS - Associação de Futebol de Lisboa"). */
  referee_entity?: string | null
  /** Custos de arbitragem pagos por cada clube por jogo realizado (€) (ex: 50). */
  referee_fee_per_match?: number | null
  /** Metadados dos jogos do quadro competitivo (Taça / Eliminatórias), indexados por ID do jogo ou "jogo_<n>". */
  /** Fases e eliminatórias configuráveis da prova (editável: ex: Oitavos, Quartos, Meias, Final, etc.) */
  knockout_rounds?: KnockoutRoundDef[]
  /** Metadados dos jogos do quadro competitivo (Taça / Eliminatórias), indexados por ID do jogo ou "jogo_<n>". */
  knockout_matches?: Record<string, KnockoutMatchMeta>
  /** Inscrição na prova — valor total e, opcionalmente, um plano de tranches com prazo
   * individual cada. Cada tranche liga-se à despesa (transactions) que a liquidou.
   * category_id: categoria de despesa própria deste torneio (ex.: "Inscrição — Torneio
   * X"), criada automaticamente ao guardar — ver ensureRegistrationFeeCategory. Fica
   * marcada allow_income para também se poder cobrar aos jogadores um Encargo na mesma
   * categoria (ex.: inscrição/viagem), e o saldo dela tender a zero. */
  registration_fee?: {
    total: number
    installments: { amount: number; due_date: string; paid: boolean; transaction_id?: string }[]
    category_id?: string
  }
}

export const DEFAULT_TOURNAMENT_RULES: TournamentRules = {
  format: 'single_league',
  tiebreaker: 'head_to_head',
  min_age: 35,
  max_birth_year: null,
  exceptions_allowed: true,
  exceptions_count: 3,
  exceptions_min_age: 30,
  exceptions_max_birth_year: null,
  unlimited_squad: false,
  max_squad_size: 40,
  max_match_players: 18,
  min_match_players: 8,
  forbid_fpf_federated: false,
  require_id_document: false,
  require_medical_exam: false,
  medical_exam_valid_until: null,
  require_insurance: true,
  exclusive_club_representation: false,
  roster_update_deadline: null,
  match_duration_mins: 70,
  half_duration_mins: 35,
  halftime_duration_mins: 10,
  rolling_subs: true,
  kit_conflict_rule: 'away_changes',
  yellow_cards_suspension_enabled: true,
  yellow_cards_to_suspension: 3,
  red_card_suspension: true,
  double_yellow_suspension: true,
  violent_conduct_expulsion: false,
  suspensions_carry_over: false,
  walkover_score: '5-0',
  max_walkovers_allowed: 3,
  delay_tolerance_mins: 20,
  referee_entity: null,
  referee_fee_per_match: null,
}

/**
 * Regras oficiais por omissão para o formato Taça de Veteranos (UCFFCC - Futebol de 11):
 * - Sistema "Taça de Portugal" (Oitavos, Quartos, Meias-Finais e Final)
 * - Duração: 70 minutos (2 partes de 35 mins, intervalo de 10 mins)
 * - Igualdade no final do jogo decidida por grandes penalidades
 * - Substituições volantes sem limite
 * - Trios de arbitragem da AFL (NAFLS), 50€ por jogo realizado por clube
 * - Suspensão de 1 jogo ao acumular 2 cartões amarelos em jogos diferentes
 * - Agressão violenta = impedimento de continuar na Prova; castigos transitam para 2027
 * - Plantel ilimitado, máx. 20 jogadores por jogo
 * - Nascidos em 1990 ou anterior (≥ 36 anos em 2026), com exceção de 1 jogador nascido em 1991
 * - Proibidos jogadores inscritos/utilizados na FPF (Futebol 11 ou Futsal) na época atual
 * - Obrigatório documento de identificação, seguro desportivo e exame médico válido até 21/12/2026
 * - Lista de participantes atualizada até às 17h00 da 5ª feira anterior ao jogo
 * - Equipamento alternativo: muda a equipa considerada a jogar em casa (lado esquerdo do calendário)
 */
export const FASES_ELIMINATORIA_PADRAO: KnockoutRoundDef[] = [
  { round: 1, name: 'Oitavos de Final' },
  { round: 2, name: 'Quartos de Final' },
  { round: 3, name: 'Meias Finais' },
  { round: 4, name: 'Final' },
]

export const DEFAULT_KNOCKOUT_TOURNAMENT_RULES: TournamentRules = {
  format: 'knockout',
  knockout_rounds: FASES_ELIMINATORIA_PADRAO,
  tiebreaker: 'head_to_head',
  knockout_tiebreaker: 'penalties',
  knockout_starting_round: 'round_of_16',
  min_age: 36,
  max_birth_year: 1990,
  exceptions_allowed: true,
  exceptions_count: 1,
  exceptions_min_age: 35,
  exceptions_max_birth_year: 1991,
  unlimited_squad: true,
  max_squad_size: 99,
  max_match_players: 20,
  min_match_players: 7,
  forbid_fpf_federated: true,
  require_id_document: true,
  require_medical_exam: true,
  medical_exam_valid_until: '2026-12-21',
  require_insurance: true,
  exclusive_club_representation: true,
  roster_update_deadline: 'Até às 17h00 da 5ª feira anterior ao jogo',
  match_duration_mins: 70,
  half_duration_mins: 35,
  halftime_duration_mins: 10,
  rolling_subs: true,
  kit_conflict_rule: 'home_changes',
  yellow_cards_suspension_enabled: true,
  yellow_cards_to_suspension: 2,
  red_card_suspension: true,
  double_yellow_suspension: true,
  violent_conduct_expulsion: true,
  suspensions_carry_over: true,
  walkover_score: '3-0',
  max_walkovers_allowed: 1,
  delay_tolerance_mins: 15,
  referee_entity: 'NAFLS (Associação de Futebol de Lisboa)',
  referee_fee_per_match: 50,
}

export const ROTULOS_ELIMINATORIA: Record<number, string> = {
  1: 'Oitavos de Final',
  2: 'Quartos de Final',
  3: 'Meias Finais',
  4: 'Final',
}

export const obterFasesEliminatoria = (
  rules?: Partial<TournamentRules> | null,
  matches?: any[],
): KnockoutRoundDef[] => {
  if (rules?.knockout_rounds && rules.knockout_rounds.length > 0) {
    return [...rules.knockout_rounds].sort((a, b) => a.round - b.round)
  }
  const rSet = new Set<number>()
  if (matches && matches.length > 0) {
    matches.forEach(m => {
      const r = Number(m.matchday ?? 1)
      if (r > 0) rSet.add(r)
    })
  }
  if (rSet.size > 0) {
    return Array.from(rSet).sort((a, b) => a - b).map(r => ({
      round: r,
      name: ROTULOS_ELIMINATORIA[r] || `${r}ª Eliminatória`,
    }))
  }
  if (rules?.knockout_starting_round === 'quarter_finals') {
    return [
      { round: 1, name: 'Quartos de Final' },
      { round: 2, name: 'Meias Finais' },
      { round: 3, name: 'Final' },
    ]
  }
  if (rules?.knockout_starting_round === 'semi_finals') {
    return [
      { round: 1, name: 'Meias Finais' },
      { round: 2, name: 'Final' },
    ]
  }
  return FASES_ELIMINATORIA_PADRAO
}

export const obterRotuloEliminatoria = (
  matchday?: number | null,
  customLabel?: string | null,
  rules?: Partial<TournamentRules> | null,
): string => {
  if (customLabel && customLabel.trim()) return customLabel.trim()
  if (!matchday) return 'Eliminatória'
  if (rules?.knockout_rounds && rules.knockout_rounds.length > 0) {
    const achado = rules.knockout_rounds.find(f => f.round === matchday)
    if (achado && achado.name && achado.name.trim()) return achado.name.trim()
  }
  return ROTULOS_ELIMINATORIA[matchday] || `${matchday}ª Eliminatória`
}

export const isTorneioEliminatoria = (torneioOuRegras?: { name?: string | null; rules?: Partial<TournamentRules> | null } | Partial<TournamentRules> | null): boolean => {
  if (!torneioOuRegras) return false
  if ('rules' in torneioOuRegras || 'name' in torneioOuRegras) {
    const t = torneioOuRegras as { name?: string | null; rules?: Partial<TournamentRules> | null }
    if (t.rules?.format === 'knockout') return true
    if (!t.rules?.format && t.name && /ta[cç]a de veteranos/i.test(t.name)) return true
    return false
  }
  return (torneioOuRegras as Partial<TournamentRules>).format === 'knockout'
}

/**
 * Avalia se um jogador cumpre os critérios de idade / ano de nascimento do torneio.
 * Suporta tanto o critério por Ano de Nascimento (ex: nascidos <= 1990, exceção 1991)
 * como o critério por Idade em anos (ex: >= 35 anos, exceção >= 30 anos).
 */
export const verificarElegibilidadeIdadeTorneio = (
  birthDate: string | null | undefined,
  rules?: Partial<TournamentRules> | null,
): {
  age: number | null
  birthYear: number | null
  isTooYoung: boolean
  isExceptionButValid: boolean
  isInvalidByAge: boolean
} => {
  if (!birthDate) {
    return { age: null, birthYear: null, isTooYoung: false, isExceptionButValid: false, isInvalidByAge: false }
  }
  const age = Math.floor((Date.now() - new Date(birthDate).getTime()) / 3.15576e10)
  const birthYear = Number(String(birthDate).slice(0, 4)) || new Date(birthDate).getFullYear()

  if (rules?.max_birth_year && rules.max_birth_year > 1900) {
    const isTooYoung = birthYear > rules.max_birth_year
    const maxExcYear = rules.exceptions_max_birth_year || (rules.max_birth_year + 1)
    const isExceptionButValid = isTooYoung && Boolean(rules.exceptions_allowed) && birthYear <= maxExcYear
    return {
      age,
      birthYear,
      isTooYoung,
      isExceptionButValid,
      isInvalidByAge: isTooYoung && !isExceptionButValid,
    }
  }

  const minAge = rules?.min_age || 0
  const isTooYoung = age < minAge
  const isExceptionButValid = isTooYoung && Boolean(rules?.exceptions_allowed) && age >= (rules?.exceptions_min_age || 0)
  return {
    age,
    birthYear,
    isTooYoung,
    isExceptionButValid,
    isInvalidByAge: isTooYoung && !isExceptionButValid,
  }
}

export interface Torneio {
  id: string
  name: string
  season: string
  status: 'agendado' | 'ativo' | 'terminado'
  rules?: TournamentRules
  organizer_name?: string | null
  image_url?: string | null
}

type RegistrationInstallment = { amount: number; due_date: string; paid: boolean; transaction_id?: string }

// Reparte `total` em partes iguais pelas `n` tranches ainda por pagar — as já
// pagas mantêm o valor histórico (estão ligadas a uma transação real, não se
// mexe). Chamada sempre que o Valor Total ou o Nº de Tranches mudam, para as
// tranches somarem sempre ao total, em vez de só as tranches novas
// receberem uma parte igual e as que já existiam ficarem com valores
// avulsos de um total/nº de tranches anterior (ex.: 1ª tranche corrigida à
// mão para 1000€ ficava intocada, e as tranches novas dividiam o total
// inteiro entre si — 1000 + 833 + 833 já não somava ao total de 2500).
// A última tranche por pagar absorve o cêntimo de arredondamento, para a
// soma bater sempre certo com o total.
export const redistributeInstallments = (current: RegistrationInstallment[], total: number, n: number): RegistrationInstallment[] => {
  const next = Array.from({ length: n }, (_, i) => current[i] || { amount: 0, due_date: '', paid: false })
  const paidTotal = next.filter(it => it.paid).reduce((s, it) => s + it.amount, 0)
  const unpaidIdx = next.reduce<number[]>((acc, it, i) => { if (!it.paid) acc.push(i); return acc }, [])
  const remaining = Math.max(0, Number((total - paidTotal).toFixed(2)))
  const each = unpaidIdx.length > 0 ? Math.floor((remaining / unpaidIdx.length) * 100) / 100 : 0
  let distributed = 0
  unpaidIdx.forEach((idx, pos) => {
    const isLast = pos === unpaidIdx.length - 1
    const amount = isLast ? Number((remaining - distributed).toFixed(2)) : each
    distributed += amount
    next[idx] = { ...next[idx], amount }
  })
  return next
}
