/**
 * Lógica do módulo financeiro: regras de época/quota/seguro, e o cálculo de que
 * meses cada jogador deve pagar, o seu estado (pago/pendente/incumprimento), e a
 * previsão de receita da época. Mantido fora das páginas para poder ser testado
 * e reutilizado entre a Página Financeira e os dashboards.
 */

export interface FinancialSettings {
  id: number
  season_start_month: number // 1-12, ex: 9 = Setembro
  season_end_month: number // 1-12, ex: 7 = Julho
  quota_amount: number
  quota_excluded_months: number[] // ex: [8] = Agosto sem quota
  quota_due_day: number // dia do mês a partir do qual a quota entra em incumprimento
  insurance_amount: number
  insurance_deadline_month: number
  insurance_deadline_day: number
}

export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  id: 1,
  season_start_month: 9,
  season_end_month: 7,
  quota_amount: 15,
  quota_excluded_months: [8],
  quota_due_day: 8,
  insurance_amount: 20,
  insurance_deadline_month: 9,
  insurance_deadline_day: 30,
}

export interface QuotaEligiblePlayer {
  id: string
  status?: string | null // 'active' | 'inactive' | 'injured'
  quota_start_date?: string | null
  quota_end_date?: string | null
  created_at?: string | null
}

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const nomeMes = (mes: number) => MESES_PT[mes - 1] || '?'

/** Formata 'YYYY-MM' para "Setembro 2026". */
export const formatMonthYear = (monthYear: string) => {
  const [y, m] = monthYear.split('-').map(Number)
  return `${nomeMes(m)} ${y}`
}

/**
 * Devolve a época em que uma data cai, no formato "AAAA/AAAA" (igual ao usado
 * em tournaments.season). Uma época que comece em Setembro e termine em Julho
 * atravessa o ano civil: Setembro de 2026 a Julho de 2027 é a época "2026/2027".
 */
export const getSeasonLabel = (settings: FinancialSettings, date: Date = new Date()): string => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const startsBeforeEnd = settings.season_start_month <= settings.season_end_month
  if (startsBeforeEnd) {
    // Época dentro do mesmo ano civil (não é o caso habitual de Set-Jul, mas suportado).
    return `${year}`
  }
  // Época atravessa o ano civil (ex.: Set..Jul)
  const seasonStartYear = month >= settings.season_start_month ? year : year - 1
  return `${seasonStartYear}/${seasonStartYear + 1}`
}

export interface SeasonMonth {
  year: number
  month: number
  monthYear: string // 'YYYY-MM'
}

/**
 * Todos os meses de uma época (do mês de início ao de fim, inclusive), na
 * ordem cronológica da época — não do calendário. Uma época Set(9)..Jul(7)
 * devolve Set,Out,Nov,Dez,Jan,Fev,Mar,Abr,Mai,Jun,Jul, atravessando o ano.
 */
export const getSeasonMonths = (settings: FinancialSettings, seasonLabel: string): SeasonMonth[] => {
  const startYear = parseInt(seasonLabel.split('/')[0], 10)
  const meses: SeasonMonth[] = []
  let year = startYear
  let month = settings.season_start_month
  // Guard: no máximo 12 iterações — mesmo que start === end, uma época dura sempre 1..12 meses.
  for (let i = 0; i < 12; i++) {
    meses.push({ year, month, monthYear: `${year}-${String(month).padStart(2, '0')}` })
    if (month === settings.season_end_month) break
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return meses
}

/** Os meses de quota da época (todos os meses da época menos os excluídos, ex.: Agosto). */
export const getQuotaMonthsForSeason = (settings: FinancialSettings, seasonLabel: string): SeasonMonth[] =>
  getSeasonMonths(settings, seasonLabel).filter(m => !settings.quota_excluded_months.includes(m.month))

/**
 * Os meses de quota que um jogador em concreto deve pagar nesta época — os meses
 * de quota da época, recortados pela janela de elegibilidade do jogador.
 *
 * Sem `quota_start_date`/`quota_end_date` definidos manualmente, a janela infere-se
 * do estado do perfil: um jogador 'inactive' não gera mais meses a partir de hoje
 * (os que já venceram antes de ficar inativo mantêm-se a dever); 'active'/'injured'
 * continuam elegíveis para todos os meses da época, passados e futuros.
 */
export const getPlayerQuotaMonths = (
  player: QuotaEligiblePlayer,
  settings: FinancialSettings,
  seasonLabel: string,
  today: Date = new Date(),
): SeasonMonth[] => {
  const allMonths = getQuotaMonthsForSeason(settings, seasonLabel)
  const startDate = player.quota_start_date ? new Date(player.quota_start_date) : null
  const endDate = player.quota_end_date
    ? new Date(player.quota_end_date)
    : player.status === 'inactive'
      ? today
      : null

  return allMonths.filter(m => {
    const monthEnd = new Date(m.year, m.month, 0) // último dia do mês
    const monthStart = new Date(m.year, m.month - 1, 1)
    if (startDate && monthEnd < startDate) return false
    if (endDate && monthStart > endDate) return false
    return true
  })
}

export type QuotaMonthStatus = 'paid' | 'late' | 'pending'

/**
 * Último instante em que a quota de um mês ainda está em dia — meia-noite do dia
 * a seguir a quota_due_day (ou seja, o próprio dia quota_due_day inteiro ainda conta
 * como dentro do prazo; só a partir do dia seguinte é que entra em incumprimento).
 */
export const getQuotaDueDate = (m: SeasonMonth, settings: FinancialSettings): Date =>
  new Date(m.year, m.month - 1, settings.quota_due_day + 1)

export const computeQuotaMonthStatus = (
  m: SeasonMonth,
  isPaid: boolean,
  settings: FinancialSettings,
  today: Date = new Date(),
): QuotaMonthStatus => {
  if (isPaid) return 'paid'
  return today >= getQuotaDueDate(m, settings) ? 'late' : 'pending'
}

/** Prazo-limite do seguro para uma época (mês/dia de definições, no ano em que esse mês cai dentro da época). */
export const getInsuranceDeadline = (settings: FinancialSettings, seasonLabel: string): Date => {
  const startYear = parseInt(seasonLabel.split('/')[0] || seasonLabel, 10)
  // O prazo do seguro cai no mesmo "lado" da época que o mês de início, salvo se for
  // um mês anterior ao de início (nesse caso já é do lado do fim, no ano seguinte).
  const year = settings.insurance_deadline_month >= settings.season_start_month ? startYear : startYear + 1
  return new Date(year, settings.insurance_deadline_month - 1, settings.insurance_deadline_day)
}
