import React, { useEffect, useState } from 'react'
import { Copy, Check, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useClub } from '../context/ClubContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from './BottomSheet'
import {
  comOmissoes, getSeasonLabel, getPlayerQuotaMonths,
  computeQuotaMonthStatus, formatMonthYear,
} from '../lib/finance'
import type { FinancialSettings, QuotaEligiblePlayer } from '../lib/finance'

/**
 * Os meus pagamentos (ecrã 12c) — o que o jogador deve, e porquê.
 *
 * O jogador não tem acesso à página financeira, que é da direção, e até aqui
 * a única coisa que via era a faixa de "tens quotas em atraso" no topo de
 * todos os ecrãs. Faltava-lhe o detalhe: que meses, quanto, e como pagar.
 *
 * Lê as suas próprias linhas e mais nada — `dues` e `charge_payments` são
 * legíveis pelo próprio pela RLS, e o cálculo dos meses em dívida é o mesmo
 * de `usePlayerQuotaDebt`, que alimenta a faixa. Um mês só sai de dívida
 * quando o tesoureiro o marca como pago: é o que diz a nota no fim, para
 * ninguém ficar à espera que a app se atualize sozinha depois de entregar o
 * dinheiro.
 */

interface Encargo {
  id: string
  titulo: string
  valor: number
  vencimento: string | null
  pagoEm: string | null
}

interface MesQuota {
  monthYear: string
  etiqueta: string
  valor: number
  /**
   * O `computeQuotaMonthStatus` devolve 'paid' | 'late' | 'pending'. Aqui o
   * 'pending' abre-se em dois, porque ao jogador dizem coisas diferentes: o
   * mês corrente é o que está a correr, e um mês futuro ainda nem venceu.
   */
  estado: 'paid' | 'late' | 'current' | 'future'
}

const EUROS = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })

const ESTADO_MES: Record<MesQuota['estado'], { texto: string; classe: string }> = {
  paid: { texto: 'paga', classe: 'bg-csc-light/15 border-csc-light/30 text-csc-verde-texto' },
  late: { texto: 'em atraso', classe: 'bg-csc-red/15 border-csc-red/35 text-csc-vermelho-texto' },
  current: { texto: 'este mês', classe: 'bg-csc-gold/15 border-csc-gold/35 text-csc-gold' },
  future: { texto: 'a haver', classe: 'bg-white/6 border-white/12 text-white/45' },
}

export const OsMeusPagamentos: React.FC<{
  aberto: boolean
  aoFechar: () => void
  jogador: (QuotaEligiblePlayer & { id: string }) | null | undefined
}> = ({ aberto, aoFechar, jogador }) => {
  const { clubSettings } = useClub()
  const [aCarregar, setACarregar] = useState(true)
  const [meses, setMeses] = useState<MesQuota[]>([])
  const [encargos, setEncargos] = useState<Encargo[]>([])
  const [quotaMensal, setQuotaMensal] = useState(0)
  const [epoca, setEpoca] = useState('')

  useEffect(() => {
    if (!aberto || !jogador?.id) return
    let cancelado = false
    setACarregar(true)

    const carregar = async () => {
      try {
        const [{ data: defs }, { data: quotasPagas }, { data: pagamentos }, { data: dispensados }] = await Promise.all([
          supabase.from('financial_settings').select('*').eq('id', 1).maybeSingle(),
          supabase.from('dues').select('month_year, amount, status').eq('player_id', jogador.id),
          supabase
            .from('charge_payments')
            .select('id, amount, paid_at, charge:charges(id, title, amount, due_date)')
            .eq('player_id', jogador.id),
          supabase.from('quota_exemptions').select('month_year').eq('profile_id', jogador.id),
        ])
        if (cancelado) return

        const definicoes = comOmissoes(defs as Partial<FinancialSettings> | null)
        const hoje = new Date()
        const rotulo = getSeasonLabel(definicoes, hoje)
        const pagas = new Set((quotasPagas ?? []).map(d => (d as { month_year: string }).month_year))

        setQuotaMensal(definicoes.quota_amount)
        setEpoca(rotulo)
        setMeses(
          getPlayerQuotaMonths(
            {
              ...jogador,
              meses_dispensados: ((dispensados ?? []) as { month_year: string }[]).map(l => l.month_year.slice(-2)),
            },
            definicoes,
            rotulo,
            hoje,
          ).map(m => {
            const estaPaga = pagas.has(m.monthYear)
            const estado = computeQuotaMonthStatus(m, estaPaga, definicoes, hoje)
            const eCorrente = m.year === hoje.getFullYear() && m.month === hoje.getMonth() + 1
            return {
              monthYear: m.monthYear,
              etiqueta: formatMonthYear(m.monthYear),
              valor: definicoes.quota_amount,
              estado: estado === 'paid'
                ? 'paid'
                : estado === 'late'
                  ? 'late'
                  : eCorrente ? 'current' : 'future',
            } satisfies MesQuota
          }),
        )

        setEncargos(
          (pagamentos ?? []).map(p => {
            const linha = p as unknown as {
              id: string
              amount: number | null
              paid_at: string | null
              charge: { title: string; amount: number; due_date: string | null } | null
            }
            return {
              id: linha.id,
              titulo: linha.charge?.title ?? 'Encargo',
              valor: Number(linha.amount ?? linha.charge?.amount ?? 0),
              vencimento: linha.charge?.due_date ?? null,
              pagoEm: linha.paid_at,
            }
          }),
        )
      } catch (err) {
        console.error('Erro ao carregar os pagamentos do atleta:', err)
      } finally {
        if (!cancelado) setACarregar(false)
      }
    }

    carregar()
    return () => { cancelado = true }
  }, [aberto, jogador?.id, jogador?.status, jogador?.quota_start_date, jogador?.quota_end_date])

  const emDivida = meses.filter(m => m.estado === 'late')
  const totalDivida = emDivida.reduce((s, m) => s + m.valor, 0)
  const pagas = meses.filter(m => m.estado === 'paid').length

  /* O IBAN do clube não está em `club_settings`; até estar, mostra-se o aviso
     de que se entrega ao tesoureiro, que é o que acontece hoje. */
  const iban = (clubSettings as { iban?: string | null } | null)?.iban ?? null

  const copiarIban = async () => {
    if (!iban) return
    try {
      await navigator.clipboard.writeText(iban)
      triggerHaptic('light')
      toast.success('IBAN copiado.')
    } catch {
      toast.error('Não foi possível copiar o IBAN.')
    }
  }

  return (
    <BottomSheet
      isOpen={aberto}
      onClose={aoFechar}
      title="Os meus pagamentos"
      description={epoca ? `Época ${epoca} · quota ${EUROS.format(quotaMensal)}/mês` : undefined}
      icon={
        <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0 font-display font-black">
          €
        </div>
      }
    >
      {aCarregar ? (
        <div className="flex justify-center py-10" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-csc-gold border-t-transparent" />
          <span className="sr-only">A carregar…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* O que está em dívida, em grande — ou a confirmação de que não há nada. */}
          {totalDivida > 0 ? (
            <div className="cartao-simples bg-csc-red/10 border-csc-red/30 p-4">
              <p className="flex items-center gap-1.5 font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-vermelho-texto">
                <TriangleAlert size={12} />
                Em dívida
              </p>
              <p className="font-display font-black text-[30px] text-white mt-1 tabular-nums leading-none">
                {EUROS.format(totalDivida)}
              </p>
              <p className="text-[11px] leading-relaxed text-white/65 mt-2">
                {emDivida.length === 1
                  ? `Falta ${emDivida[0].etiqueta.toLowerCase()}.`
                  : `Faltam ${emDivida.length} meses de quota.`}{' '}
                Entrega ao tesoureiro ou transfere para o IBAN do clube.
              </p>
            </div>
          ) : (
            <div className="cartao-simples bg-csc-light/10 border-csc-light/28 p-4 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-csc-light/20 text-csc-verde-texto flex items-center justify-center shrink-0">
                <Check size={17} />
              </span>
              <p className="text-[12px] font-display font-bold text-white">
                Não tens nada em atraso.
              </p>
            </div>
          )}

          {/* As quotas da época, mês a mês. */}
          <div>
            <p className="flex items-baseline justify-between font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/50 mb-2">
              <span>Quotas</span>
              <span className="text-white/40 normal-case tracking-normal text-[10px] font-bold">
                {pagas} de {meses.length} pagas
              </span>
            </p>

            {meses.length === 0 ? (
              <p className="text-[11px] text-white/45 italic">
                Não há meses de quota para ti nesta época.
              </p>
            ) : (
              <div className="cartao-simples overflow-hidden">
                {meses.map(m => (
                  <div
                    key={m.monthYear}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-white/7 first:border-t-0"
                  >
                    <span className="font-display font-bold text-[12.5px] text-white capitalize">
                      {m.etiqueta}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {m.estado !== 'paid' && (
                        <span className="font-display font-black text-[12px] text-white/70 tabular-nums">
                          {EUROS.format(m.valor)}
                        </span>
                      )}
                      <span
                        className={`font-display font-black text-[8.5px] tracking-[0.1em] uppercase px-2 py-1 rounded-full border ${ESTADO_MES[m.estado].classe}`}
                      >
                        {ESTADO_MES[m.estado].texto}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Os encargos em que entrei — seguro, equipamento, inscrições. */}
          {encargos.length > 0 && (
            <div>
              <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/50 mb-2">
                Encargos
              </p>
              <div className="cartao-simples overflow-hidden">
                {encargos.map(e => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-t border-white/7 first:border-t-0"
                  >
                    <span className="min-w-0">
                      <span className="block font-display font-bold text-[12.5px] text-white truncate">
                        {e.titulo}
                      </span>
                      <span className="block text-[10px] text-white/45 mt-0.5">
                        {e.pagoEm
                          ? `pago a ${new Date(e.pagoEm).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`
                          : e.vencimento
                            ? `vence a ${new Date(e.vencimento).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`
                            : 'sem prazo'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="font-display font-black text-[12px] text-white tabular-nums">
                        {EUROS.format(e.valor)}
                      </span>
                      {e.pagoEm && <Check size={13} className="text-csc-verde-texto" />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Como pagar. */}
          <div>
            <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/50 mb-2">
              Como pagar
            </p>
            <div className="cartao-simples p-3.5 space-y-2.5">
              {iban ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate font-mono text-[12px] text-white">{iban}</code>
                  <button
                    type="button"
                    onClick={copiarIban}
                    aria-label="Copiar o IBAN do clube"
                    className="min-h-11 px-3 rounded-[18px] bg-white/8 border border-white/15 text-csc-gold
                      font-display font-extrabold text-[11px] flex items-center gap-1.5 shrink-0 cursor-pointer
                      transition-transform duration-150 active:scale-97
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <Copy size={12} />
                    Copiar
                  </button>
                </div>
              ) : (
                <p className="text-[11.5px] text-white/70 leading-relaxed">
                  Entrega ao tesoureiro. O clube ainda não tem IBAN registado na app.
                </p>
              )}

              <p className="text-[10.5px] leading-relaxed text-white/50">
                O pagamento só fica em dia depois de o tesoureiro o registar — é ele que marca
                o mês como pago.
              </p>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

export default OsMeusPagamentos
