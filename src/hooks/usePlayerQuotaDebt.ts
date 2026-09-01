import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  DEFAULT_FINANCIAL_SETTINGS, getSeasonLabel, getPlayerQuotaMonths,
  computeQuotaMonthStatus, formatMonthYear,
} from '../lib/finance'
import type { FinancialSettings, QuotaEligiblePlayer } from '../lib/finance'

export interface OverdueQuotaMonth {
  monthYear: string
  label: string
  amount: number
}

export interface PlayerQuotaDebt {
  loading: boolean
  hasDebt: boolean
  totalDebt: number
  overdueMonths: OverdueQuotaMonth[]
}

/**
 * Estado real de dívida de quotas do jogador com sessão iniciada — usado pelo
 * widget de Quotas do menu (sidebar/gaveta), que antes mostrava sempre
 * "Regularizadas" sem olhar aos dados. Um mês entra na lista quando o dia de
 * hoje já passou o `quota_due_day` das definições e não há `dues` pago para
 * esse mês (mesma regra de `computeQuotaMonthStatus`, usada na Página
 * Financeira).
 */
export function usePlayerQuotaDebt(
  player: (QuotaEligiblePlayer & { id: string }) | null | undefined,
  enabled: boolean,
): PlayerQuotaDebt {
  const [state, setState] = useState<PlayerQuotaDebt>({
    loading: enabled,
    hasDebt: false,
    totalDebt: 0,
    overdueMonths: [],
  })

  useEffect(() => {
    if (!enabled || !player?.id) {
      setState({ loading: false, hasDebt: false, totalDebt: 0, overdueMonths: [] })
      return
    }

    let cancelado = false
    setState(s => ({ ...s, loading: true }))

    const carregar = async () => {
      try {
        const [{ data: settingsData }, { data: duesData }] = await Promise.all([
          supabase.from('financial_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('dues').select('month_year, amount, status').eq('player_id', player.id),
        ])
        if (cancelado) return

        const settings: FinancialSettings = (settingsData as FinancialSettings) || DEFAULT_FINANCIAL_SETTINGS
        const today = new Date()
        const seasonLabel = getSeasonLabel(settings, today)
        const paidMonths = new Set((duesData || []).map(d => d.month_year))

        const overdueMonths = getPlayerQuotaMonths(player, settings, seasonLabel, today)
          .filter(m => computeQuotaMonthStatus(m, paidMonths.has(m.monthYear), settings, today) === 'late')
          .map(m => ({ monthYear: m.monthYear, label: formatMonthYear(m.monthYear), amount: settings.quota_amount }))

        setState({
          loading: false,
          hasDebt: overdueMonths.length > 0,
          totalDebt: overdueMonths.reduce((s, m) => s + m.amount, 0),
          overdueMonths,
        })
      } catch (err) {
        console.error('Erro ao calcular dívida de quotas:', err)
        if (!cancelado) setState({ loading: false, hasDebt: false, totalDebt: 0, overdueMonths: [] })
      }
    }
    carregar()

    return () => { cancelado = true }
  }, [enabled, player?.id, player?.status, player?.quota_start_date, player?.quota_end_date])

  return state
}
