/**
 * As regras de uma prova, e o que se faz com elas.
 *
 * Vinham do `AdminDashboard`. Ficam num módulo à parte porque quem as usa são
 * dois: o ecrã de gestão dos torneios e a ficha de jogo, que precisa do
 * `yellow_cards_to_suspension` para contar os amarelos.
 */

export interface TournamentRules {
  format?: 'single_league' | 'two_phases'
  min_age?: number
  exceptions_allowed?: boolean
  exceptions_count?: number;
  exceptions_min_age: number;
  max_squad_size: number;
  max_match_players: number;
  min_match_players: number;
  match_duration_mins: number;
  half_duration_mins: number;
  rolling_subs: boolean;
  yellow_cards_to_suspension: number;
  walkover_score: string;
  max_walkovers_allowed: number;
  delay_tolerance_mins: number;
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
  min_age: 35,
  exceptions_allowed: true,
  exceptions_count: 3,
  exceptions_min_age: 30,
  max_squad_size: 40,
  max_match_players: 18,
  min_match_players: 8,
  match_duration_mins: 70,
  half_duration_mins: 35,
  rolling_subs: true,
  yellow_cards_to_suspension: 3,
  walkover_score: '5-0',
  max_walkovers_allowed: 3,
  delay_tolerance_mins: 20
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
