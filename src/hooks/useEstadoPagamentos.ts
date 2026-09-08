import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  comOmissoes, getSeasonLabel, getPlayerQuotaMonths,
  getQuotaDueDate, computeQuotaMonthStatus, formatMonthYear,
} from '../lib/finance'
import type { FinancialSettings, QuotaEligiblePlayer } from '../lib/finance'

/**
 * Tudo o que uma pessoa deve ao clube, num sítio só — quotas e encargos.
 *
 * Alimenta o sinal de € no cabeçalho, a persiana que o abre e o cartão "Os
 * meus pagamentos" do Perfil. Antes havia dois cálculos: o `usePlayerQuotaDebt`
 * só via quotas e só as vencidas, e o "Os meus pagamentos" refazia as contas à
 * sua maneira. Um encargo por pagar não aparecia em aviso nenhum.
 *
 * **A cor é a do pior caso**: vermelho se houver alguma coisa vencida, laranja
 * se houver alguma a menos de `DIAS_DE_AVISO` do prazo, nada se estiver tudo
 * em dia. Com um vencido e outro a aproximar-se manda o vermelho — é o que
 * precisa de ser tratado primeiro.
 *
 * Lê só as linhas do próprio: a RLS de `dues`, `charge_players` e
 * `charge_payments` é por `player_id`, e `charges` é legível por todos.
 */

/** A partir de quantos dias do prazo é que um pagamento começa a avisar. */
export const DIAS_DE_AVISO = 8

export interface ItemPagamento {
  chave: string
  tipo: 'quota' | 'encargo'
  /** "Quotas", ou o nome da categoria do encargo. */
  categoria: string
  /** "Agosto 2026", "Seguro desportivo". */
  etiqueta: string
  valor: number
  /** Data-limite em ISO, ou `null` num encargo sem prazo marcado. */
  limite: string | null
  /** Negativo quando já passou; `null` sem prazo. */
  diasAteLimite: number | null
  estado: 'atraso' | 'a-vencer' | 'por-vencer' | 'pago'
  /** Quando foi pago, para os que já estão. */
  pagoEm?: string | null
}

export interface EstadoPagamentos {
  loading: boolean
  /** `null` quando não há nada a assinalar. */
  cor: 'vermelho' | 'laranja' | null
  /** Quantos pagamentos estão a ser assinalados (vencidos + a vencer). */
  contador: number
  emAtraso: ItemPagamento[]
  aVencer: ItemPagamento[]
  /** Tudo — incluindo o que ainda não venceu e o que já foi pago. */
  todos: ItemPagamento[]
  /** Soma do que está a ser assinalado. */
  totalEmAviso: number
  recarregar: () => void
}

const VAZIO: Omit<EstadoPagamentos, 'recarregar'> = {
  loading: false, cor: null, contador: 0,
  emAtraso: [], aVencer: [], todos: [], totalEmAviso: 0,
}

/** Dias inteiros entre hoje e uma data — negativo se já passou. */
const diasAte = (limite: Date, hoje: Date): number =>
  Math.ceil((limite.getTime() - hoje.getTime()) / 86400000)

export function useEstadoPagamentos(
  jogador: (QuotaEligiblePlayer & { id: string }) | null | undefined,
  ativo: boolean,
): EstadoPagamentos {
  const [estado, setEstado] = useState<Omit<EstadoPagamentos, 'recarregar'>>({
    ...VAZIO,
    loading: ativo,
  })
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique(t => t + 1), [])

  const jogadorId = jogador?.id
  const estadoClinico = jogador?.status
  const inicio = jogador?.quota_start_date
  const fim = jogador?.quota_end_date

  useEffect(() => {
    if (!ativo || !jogadorId) {
      setEstado({ ...VAZIO })
      return
    }

    let cancelado = false
    setEstado(e => ({ ...e, loading: true }))

    const carregar = async () => {
      try {
        const [
          { data: defs },
          { data: quotasPagas },
          { data: dispensados },
          { data: participacoes },
          { data: pagamentos },
        ] = await Promise.all([
          supabase.from('financial_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('dues').select('month_year').eq('player_id', jogadorId),
          supabase.from('quota_exemptions').select('month_year').eq('profile_id', jogadorId),
          supabase.from('charge_players').select('charge_id').eq('player_id', jogadorId),
          supabase.from('charge_payments').select('charge_id, amount, paid_at').eq('player_id', jogadorId),
        ])
        if (cancelado) return

        const definicoes = comOmissoes(defs as Partial<FinancialSettings> | null)
        const hoje = new Date()
        const epoca = getSeasonLabel(definicoes, hoje)
        const pagas = new Set(((quotasPagas ?? []) as { month_year: string }[]).map(d => d.month_year))

        /* ------------------------------------------------------ as quotas */
        const meses = getPlayerQuotaMonths(
          {
            id: jogadorId,
            status: estadoClinico,
            quota_start_date: inicio,
            quota_end_date: fim,
            meses_dispensados: ((dispensados ?? []) as { month_year: string }[]).map(l => l.month_year.slice(-2)),
          },
          definicoes,
          epoca,
          hoje,
        )

        const itensQuota: ItemPagamento[] = meses.map(m => {
          const paga = pagas.has(m.monthYear)
          const prazo = getQuotaDueDate(m, definicoes)
          const dias = diasAte(prazo, hoje)
          const situacao = computeQuotaMonthStatus(m, paga, definicoes, hoje)
          return {
            chave: `quota-${m.monthYear}`,
            tipo: 'quota',
            categoria: 'Quotas',
            etiqueta: formatMonthYear(m.monthYear),
            valor: definicoes.quota_amount,
            limite: prazo.toISOString(),
            diasAteLimite: dias,
            estado: paga
              ? 'pago'
              : situacao === 'late'
                ? 'atraso'
                : dias <= DIAS_DE_AVISO
                  ? 'a-vencer'
                  : 'por-vencer',
          }
        })

        /* ---------------------------------------------------- os encargos */
        const meusIds = ((participacoes ?? []) as { charge_id: string }[]).map(p => p.charge_id)
        let itensEncargo: ItemPagamento[] = []

        if (meusIds.length > 0) {
          const [{ data: encargos }, { data: categorias }] = await Promise.all([
            supabase.from('charges').select('id, title, amount, due_date, category_id').in('id', meusIds),
            supabase.from('expense_categories').select('id, name'),
          ])
          if (cancelado) return

          const nomeCategoria = new Map(
            ((categorias ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
          )
          const pagoPorEncargo = new Map<string, { total: number; ultimo: string | null }>()
          for (const p of (pagamentos ?? []) as { charge_id: string; amount: number | null; paid_at: string | null }[]) {
            const atual = pagoPorEncargo.get(p.charge_id) ?? { total: 0, ultimo: null }
            pagoPorEncargo.set(p.charge_id, {
              total: atual.total + Number(p.amount ?? 0),
              ultimo: p.paid_at ?? atual.ultimo,
            })
          }

          itensEncargo = ((encargos ?? []) as {
            id: string; title: string; amount: number; due_date: string | null; category_id: string | null
          }[]).map(e => {
            const pago = pagoPorEncargo.get(e.id)
            const emFalta = Number(e.amount) - (pago?.total ?? 0)
            const prazo = e.due_date ? new Date(e.due_date) : null
            const dias = prazo ? diasAte(prazo, hoje) : null

            return {
              chave: `encargo-${e.id}`,
              tipo: 'encargo',
              categoria: (e.category_id && nomeCategoria.get(e.category_id)) || 'Encargos',
              etiqueta: e.title,
              // Um encargo pago parcialmente mostra o que falta, não o total.
              valor: emFalta > 0 ? emFalta : Number(e.amount),
              limite: e.due_date,
              diasAteLimite: dias,
              pagoEm: pago?.ultimo ?? null,
              estado: emFalta <= 0
                ? 'pago'
                : dias === null
                  ? 'por-vencer'
                  : dias < 0
                    ? 'atraso'
                    : dias <= DIAS_DE_AVISO
                      ? 'a-vencer'
                      : 'por-vencer',
            }
          })
        }

        const todos = [...itensQuota, ...itensEncargo]
        const emAtraso = todos.filter(i => i.estado === 'atraso')
        const aVencer = todos.filter(i => i.estado === 'a-vencer')

        setEstado({
          loading: false,
          cor: emAtraso.length > 0 ? 'vermelho' : aVencer.length > 0 ? 'laranja' : null,
          contador: emAtraso.length + aVencer.length,
          emAtraso,
          aVencer,
          todos,
          totalEmAviso: [...emAtraso, ...aVencer].reduce((s, i) => s + i.valor, 0),
        })
      } catch (err) {
        console.error('Erro ao calcular o estado de pagamentos:', err)
        if (!cancelado) setEstado({ ...VAZIO })
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [ativo, jogadorId, estadoClinico, inicio, fim, tique])

  return { ...estado, recarregar }
}
