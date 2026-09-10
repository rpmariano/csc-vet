import React, { useMemo } from 'react'
import { TrendingUp, Receipt, AlertTriangle, ListChecks, Activity } from 'lucide-react'
import { getSeasonMonths } from '../../lib/finance'
import type { FinancialSettings, SeasonMonth } from '../../lib/finance'
import { CartaoVidro } from '../ui'
import { triggerHaptic } from '../../utils/haptics'
import {
  ETIQUETA_SECCAO, ETIQUETA_GRUPO, CHIP_ATRASO, CHIP_NEUTRO,
  fmtEuro, fmtEuroCurto, MESES_CURTOS,
} from './estilos'
import type {
  MovementRow, QuotaStatusRow, ScheduledPayment, EncargoPorReceber,
} from './tipos'
import { PagamentosProgramados } from './PagamentosProgramados'

/*
  Visão Geral do Financeiro (ecrã 8a).

  A ordem dos blocos é a das perguntas que a direção faz, por esta ordem:
  quanto temos e quanto vamos ter (Saldo), de onde vem e para onde vai
  (Previsão), o que está marcado para sair (Pagamentos Programados), como
  corre ao longo da época (Saldo mês a mês) e como vai a cobrança (Quotas mês
  a mês). Só depois as repartições por categoria, que são consulta e não
  alerta.

  Saiu de dentro de `FinancePage.tsx` — 2291 linhas — quando os gráficos
  entraram. É o que o plano de riscos manda: partir o ficheiro pela área que
  se está a tocar, não num refactor à parte.
*/

// ---------------------------------------------------------------------------
// A série do saldo ao longo da época
// ---------------------------------------------------------------------------

/** Um ponto da linha do saldo: o mês, o valor acumulado, e se já aconteceu. */
interface PontoSaldo {
  rotulo: string
  valor: number
  previsto: boolean
}

/** 'AAAA-MM' de uma data — a chave por que os movimentos são agrupados. */
const mesDe = (iso: string) => iso.slice(0, 7)

/**
 * A linha do saldo, do primeiro mês da época ao último.
 *
 * Até hoje é o saldo real: o acumulado dos movimentos, com o que vinha de
 * trás somado ao primeiro ponto — assim o ponto de hoje é exatamente o "saldo
 * disponível" do cartão de cima, e não um número parecido.
 *
 * Daí para a frente é o plano, pelos prazos que já existem: as quotas por
 * pagar no mês a que dizem respeito, o que falta receber de cada encargo no
 * seu prazo, e os Pagamentos Programados no dia em que vencem. O que já devia
 * ter entrado ou saído e não entrou aparece no primeiro mês por vir — não
 * desaparece nem volta atrás no tempo.
 *
 * **O último ponto é o Saldo Previsto no Fim da Época**, e é daqui que esse
 * número sai para todo o ecrã. Era uma segunda conta, à parte, e as duas
 * podiam discordar.
 */
const construirSerieSaldo = (args: {
  meses: SeasonMonth[]
  idxHoje: number
  movements: MovementRow[]
  quotaRows: QuotaStatusRow[]
  encargosPorReceber: EncargoPorReceber[]
  pagamentosProgramados: ScheduledPayment[]
}): PontoSaldo[] => {
  const { meses, idxHoje, movements, quotaRows, encargosPorReceber, pagamentosProgramados } = args
  const primeiro = meses[0].monthYear
  const indicePorMes = new Map(meses.map((m, i) => [m.monthYear, i]))

  // Quantos pontos: os meses da época, mais um se hoje já for o último mês —
  // senão o plano do que ainda falta não teria onde ser desenhado e cairia em
  // cima do ponto do saldo real.
  const nPontos = idxHoje >= meses.length - 1 ? meses.length + 1 : meses.length
  const fluxos = new Array<number>(nPontos).fill(0)

  // Realizado. Tudo o que é anterior à época entra no primeiro ponto, e tudo
  // o que tenha data futura entra no ponto de hoje: a linha do realizado tem
  // de acabar no saldo que a app diz ter em caixa.
  for (const m of movements) {
    const i = indicePorMes.get(mesDe(m.entry_date))
    const destino = i === undefined
      ? (mesDe(m.entry_date) < primeiro ? 0 : idxHoje)
      : Math.min(i, idxHoje)
    fluxos[destino] += Number(m.signed_amount)
  }

  // Previsto. Nunca antes do primeiro ponto por vir.
  const primeiroPorVir = Math.min(idxHoje + 1, nPontos - 1)
  const agendar = (data: string | null, valor: number) => {
    const i = data ? indicePorMes.get(mesDe(data)) : undefined
    const destino = i === undefined ? nPontos - 1 : Math.max(i, primeiroPorVir)
    fluxos[Math.min(destino, nPontos - 1)] += valor
  }

  for (const q of quotaRows) {
    if (q.status === 'paid') continue
    agendar(`${q.month_year}-01`, Number(q.owed_amount || 0))
  }
  for (const e of encargosPorReceber) agendar(e.dueDate, e.amount)
  for (const p of pagamentosProgramados) agendar(p.due_date, -p.amount)

  let acumulado = 0
  return fluxos.map((f, i) => {
    acumulado += f
    return {
      rotulo: i < meses.length ? MESES_CURTOS[meses[i].month - 1] : 'Fim',
      valor: acumulado,
      previsto: i > idxHoje,
    }
  })
}

// ---------------------------------------------------------------------------
// Gráfico: saldo ao longo da época
// ---------------------------------------------------------------------------

const LARGURA = 340
const ALTURA = 132
const MARGEM_X = 3
const MARGEM_TOPO = 10
const MARGEM_BASE = 16

const GraficoSaldo: React.FC<{ pontos: PontoSaldo[]; idxHoje: number }> = ({ pontos, idxHoje }) => {
  const n = pontos.length
  const valores = pontos.map(p => p.valor)
  // O zero entra sempre na escala: é a linha que decide se o clube fecha a
  // época a dever, e um gráfico que a deixasse de fora dizia-o por omissão.
  const teto = Math.max(0, ...valores)
  const chao = Math.min(0, ...valores)
  const folga = Math.max(1, (teto - chao) * 0.1)
  const vMax = teto + folga
  const vMin = chao - folga

  const alturaUtil = ALTURA - MARGEM_TOPO - MARGEM_BASE
  const x = (i: number) => MARGEM_X + (n === 1 ? 0 : (i * (LARGURA - 2 * MARGEM_X)) / (n - 1))
  const y = (v: number) => MARGEM_TOPO + ((vMax - v) / (vMax - vMin)) * alturaUtil
  const yZero = y(0)

  const caminho = (de: number, ate: number) =>
    pontos.slice(de, ate + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(de + k).toFixed(1)},${y(p.valor).toFixed(1)}`)
      .join(' ')

  const fim = pontos[n - 1]
  const corFim = fim.valor >= 0 ? 'var(--color-csc-gold)' : 'var(--color-csc-vermelho-texto)'

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Saldo ao longo da época: ${fmtEuro(pontos[idxHoje].valor)} hoje, ${fmtEuro(fim.valor)} previsto no fim.`}
    >
      <defs>
        <linearGradient id="areaSaldo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-csc-verde-texto)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-csc-verde-texto)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Território negativo — abaixo do zero é dinheiro que falta. Muito
          ténue de propósito: numa época que fecha a dever ocupa o cartão
          inteiro, e a essa opacidade deixava de ser um sinal para passar a ser
          o fundo do cartão. */}
      {yZero < ALTURA - MARGEM_BASE && (
        <rect
          x="0" y={yZero} width={LARGURA} height={ALTURA - MARGEM_BASE - yZero}
          fill="var(--color-csc-red)" opacity="0.05"
        />
      )}
      <line
        x1="0" y1={yZero} x2={LARGURA} y2={yZero}
        stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeDasharray="3 3"
      />

      {/* Onde acaba o que aconteceu e começa o que está planeado. */}
      {idxHoje > 0 && idxHoje < n - 1 && (
        <line
          x1={x(idxHoje)} y1={MARGEM_TOPO} x2={x(idxHoje)} y2={ALTURA - MARGEM_BASE}
          stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeDasharray="2 3"
        />
      )}

      {/* O que já aconteceu. */}
      {idxHoje > 0 && (
        <path
          d={`${caminho(0, idxHoje)} L${x(idxHoje).toFixed(1)},${yZero.toFixed(1)} L${x(0).toFixed(1)},${yZero.toFixed(1)} Z`}
          fill="url(#areaSaldo)"
        />
      )}
      <path
        d={caminho(0, idxHoje)}
        fill="none" stroke="var(--color-csc-verde-texto)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />

      {/* O que está previsto. Começa no ponto de hoje, para as duas linhas
          serem uma só e não haver um salto entre elas. */}
      {idxHoje < n - 1 && (
        <path
          d={caminho(idxHoje, n - 1)}
          fill="none" stroke="var(--color-csc-gold)" strokeWidth="2.5" strokeDasharray="5 4"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}

      <circle cx={x(idxHoje)} cy={y(pontos[idxHoje].valor)} r="4" fill="var(--color-csc-verde-texto)" />
      <circle cx={x(n - 1)} cy={y(fim.valor)} r="4" fill={corFim} />

      {/* Um rótulo sim, outro não — onze meses numa coluna de 480px não cabem
          todos sem se sobreporem. O mês de hoje e o último têm sempre o seu. */}
      {pontos.map((p, i) => ((i % 2 === 0 || i === idxHoje || i === n - 1) && (
        <text
          key={`${p.rotulo}-${i}`}
          x={x(i)} y={ALTURA - 4}
          textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          className="font-display"
          fontSize="7.5" fontWeight="800"
          fill={i === idxHoje ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.42)'}
        >
          {p.rotulo}
        </text>
      )))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Gráfico: cobrança de quotas, mês a mês
// ---------------------------------------------------------------------------

interface MesDeCobranca {
  monthYear: string
  letra: string
  esperado: number
  pago: number
  atrasado: boolean
}

const GraficoCobranca: React.FC<{ meses: MesDeCobranca[] }> = ({ meses }) => {
  const maiorEsperado = Math.max(1, ...meses.map(m => m.esperado))
  return (
    <div
      className="flex items-stretch gap-1 h-[88px]"
      role="img"
      aria-label={`Cobrança de quotas mês a mês, ${meses.length} meses da época.`}
    >
      {meses.map(m => {
        const alturaPct = (m.esperado / maiorEsperado) * 100
        const pagoPct = m.esperado > 0 ? Math.min(100, (m.pago / m.esperado) * 100) : 0
        const completo = m.esperado > 0 && m.pago >= m.esperado
        const porCobrar = m.atrasado && !completo
        return (
          <div key={m.monthYear} className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 flex flex-col justify-end">
              <div
                className={`w-full rounded-[5px] overflow-hidden flex flex-col justify-end ${porCobrar ? 'bg-csc-red/15' : 'bg-white/8'}`}
                style={{ height: `${Math.max(8, alturaPct)}%` }}
              >
                <div
                  className={`w-full ${completo ? 'bg-csc-light' : 'bg-csc-light/70'}`}
                  style={{ height: `${pagoPct}%` }}
                />
              </div>
            </div>
            <span className="mt-1.5 block text-center font-display font-black text-[8px] text-white/45">
              {m.letra}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Uma bolinha de legenda com a sua palavra. */
const Legenda: React.FC<{ cor: string; children: React.ReactNode }> = ({ cor, children }) => (
  <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/60">
    <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} aria-hidden="true" />
    {children}
  </span>
)

/**
 * Um bloco da Visão Geral: **banda com o título em cima, conteúdo por baixo**.
 *
 * É a forma que o Financeiro inteiro passou a ter — os grupos das Quotas, as
 * categorias dos Pagamentos Programados, os meses das Despesas. Aqui os
 * títulos flutuavam dentro do cartão, à mistura com o conteúdo, e o número que
 * resume o bloco andava ora ao lado do título ora numa linha de rodapé, atrás
 * de um traço. Na banda, o título à esquerda e o resumo à direita.
 */
const Bloco: React.FC<{
  titulo: string
  icone?: React.ReactNode
  /** O número ou a pastilha que resume o bloco, à direita da banda. */
  resumo?: React.ReactNode
  /** Espaçamento do corpo; as listas passam `p-0` e tratam do seu. */
  corpo?: string
  children: React.ReactNode
}> = ({ titulo, icone, resumo, corpo = 'p-3.5 space-y-3', children }) => (
  <section aria-label={titulo} className="cartao-simples text-white overflow-hidden">
    <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.055] border-b border-white/12">
      {icone}
      <h3 className={ETIQUETA_SECCAO}>{titulo}</h3>
      {resumo && <span className="ml-auto shrink-0">{resumo}</span>}
    </div>
    <div className={corpo}>{children}</div>
  </section>
)

/** Uma linha de repartição por categoria: rótulo, valor e a barra por baixo. */
const LinhaCategoria: React.FC<{
  rotulo: string
  valor: React.ReactNode
  children: React.ReactNode
}> = ({ rotulo, valor, children }) => (
  <div className="px-3 py-2.5 border-t border-white/8 first:border-t-0">
    <div className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="font-display font-bold text-[12px] text-white/85 truncate">{rotulo}</span>
      <span className="font-display font-black text-[12px] tabular-nums text-white text-right shrink-0">
        {valor}
      </span>
    </div>
    {children}
  </div>
)

// ---------------------------------------------------------------------------
// Barra de composição — entradas e saídas à mesma escala
// ---------------------------------------------------------------------------

interface Fatia { rotulo: string; valor: number; cor: string }

/**
 * As duas barras partilham a escala de propósito: é o comprimento de uma
 * contra a outra que diz se a época fecha a dever, sem se ler um número.
 */
const BarraComposta: React.FC<{ fatias: Fatia[]; escala: number }> = ({ fatias, escala }) => (
  <div className="h-3 rounded-full bg-white/8 overflow-hidden flex">
    {fatias.filter(f => f.valor > 0).map(f => (
      <div key={f.rotulo} className={f.cor} style={{ width: `${(f.valor / escala) * 100}%` }} />
    ))}
  </div>
)

// ---------------------------------------------------------------------------

export interface VisaoGeralFinanceiraProps {
  seasonLabel: string
  settings: FinancialSettings
  movements: MovementRow[]
  quotaRows: QuotaStatusRow[]
  /** Saldo em caixa hoje — recebido menos pago, de todos os movimentos. */
  netBalance: number
  totalExpenses: number
  /** Receita avulsa já recebida (patrocínio, rifa) — nem quota nem encargo. */
  totalIncomeOther: number
  projectedQuotasTotal: number
  totalEncargosTarget: number
  totalScheduledPaymentsTarget: number
  receivedTowardsProjection: number
  encargosPorReceber: EncargoPorReceber[]
  pendingScheduledPayments: ScheduledPayment[]
  pendingScheduledPaymentsTotal: number
  scheduledPaymentsByCategory: [string, ScheduledPayment[]][]
  receitaPorCategoria: [string, number][]
  objetivoPorCategoria: Map<string, number>
  despesaPorCategoria: [string, number][]
  pagarPorCategoria: { label: string; pago: number; porPagar: number }[]
  receitaCores: string[]
  despesaCores: string[]
  corOutras: string
  /** Leva ao separador Despesas/Receitas, o único sítio onde se paga. */
  irParaDespesas: () => void
}

export const VisaoGeralFinanceira: React.FC<VisaoGeralFinanceiraProps> = ({
  seasonLabel, settings, movements, quotaRows,
  netBalance, totalExpenses, totalIncomeOther,
  projectedQuotasTotal, totalEncargosTarget, totalScheduledPaymentsTarget,
  receivedTowardsProjection, encargosPorReceber,
  pendingScheduledPayments, pendingScheduledPaymentsTotal, scheduledPaymentsByCategory,
  receitaPorCategoria, objetivoPorCategoria, despesaPorCategoria, pagarPorCategoria,
  receitaCores, despesaCores, corOutras, irParaDespesas,
}) => {
  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  const meses = useMemo(() => getSeasonMonths(settings, seasonLabel), [settings, seasonLabel])

  /* Onde estamos na época. Antes do primeiro mês conta como o primeiro; depois
     do último, como o último — a linha nunca fica sem ponto de hoje. */
  const idxHoje = useMemo(() => {
    const i = meses.findIndex(m => m.monthYear === mesAtual)
    if (i >= 0) return i
    return mesAtual < meses[0].monthYear ? 0 : meses.length - 1
  }, [meses, mesAtual])

  const serieSaldo = useMemo(
    () => construirSerieSaldo({
      meses, idxHoje, movements, quotaRows, encargosPorReceber,
      pagamentosProgramados: pendingScheduledPayments,
    }),
    [meses, idxHoje, movements, quotaRows, encargosPorReceber, pendingScheduledPayments],
  )

  /* O saldo previsto no fim da época é o último ponto da linha, e mais nada.
     Ao contrário da conta que aqui estava, esta inclui a receita avulsa já
     recebida — um patrocínio de 500 € entrava em caixa e não mexia no
     previsto, embora as despesas avulsas já lá estivessem a descontar. */
  const saldoPrevisto = serieSaldo[serieSaldo.length - 1].valor
  const variacao = saldoPrevisto - netBalance

  const projectedSeasonTotal = projectedQuotasTotal + totalEncargosTarget
  const projectionPct = projectedSeasonTotal > 0
    ? Math.min(100, Math.round((receivedTowardsProjection / projectedSeasonTotal) * 100))
    : 0
  const pagamentosJaPagos = totalScheduledPaymentsTarget - pendingScheduledPaymentsTotal
  const outrasDespesas = Math.max(0, totalExpenses - pagamentosJaPagos)

  const entradasPrevistas = projectedSeasonTotal + totalIncomeOther
  const saidasPrevistas = totalScheduledPaymentsTarget + outrasDespesas
  const escalaComposicao = Math.max(1, entradasPrevistas, saidasPrevistas)

  /* Cobrança de quotas por mês: quanto se esperava e quanto entrou, em cada
     mês da época. Vem de v_quota_status, a única fonte onde a quota por pagar
     existe — em `dues` só há linha para as pagas. */
  const cobrancaPorMes: MesDeCobranca[] = useMemo(() => {
    const porMes = new Map<string, { esperado: number; pago: number; atrasado: boolean }>()
    for (const q of quotaRows) {
      const atual = porMes.get(q.month_year) ?? { esperado: 0, pago: 0, atrasado: false }
      atual.esperado += Number(q.expected_amount || 0)
      atual.pago += Number(q.paid_amount || 0)
      if (q.status === 'late') atual.atrasado = true
      porMes.set(q.month_year, atual)
    }
    return meses
      .filter(m => porMes.has(m.monthYear))
      .map(m => ({
        monthYear: m.monthYear,
        letra: MESES_CURTOS[m.month - 1].charAt(0),
        ...porMes.get(m.monthYear)!,
      }))
  }, [meses, quotaRows])

  const cobranca = useMemo(() => ({
    esperado: cobrancaPorMes.reduce((s, m) => s + m.esperado, 0),
    pago: cobrancaPorMes.reduce((s, m) => s + m.pago, 0),
    fechados: cobrancaPorMes.filter(m => m.esperado > 0 && m.pago >= m.esperado).length,
    porCobrar: cobrancaPorMes.filter(m => m.atrasado && m.pago < m.esperado).length,
  }), [cobrancaPorMes])

  const maxReceita = Math.max(1, ...receitaPorCategoria.map(([, v]) => v))
  const maxDespesa = Math.max(1, ...despesaPorCategoria.map(([, v]) => v))

  const pagamentosEmAtraso = pendingScheduledPayments.filter(
    p => p.due_date && new Date(p.due_date) < hoje,
  ).length

  return (
    <div className="space-y-4">
      {/*
        Saldo (ecrã 8a). Eram quatro cartões pequenos — disponível, recebido,
        pago e previsto. O recebido e o pago são as duas parcelas do
        disponível, e estão inteiros mais abaixo repartidos por categoria:
        aqui não decidiam nada. Ficam os dois saldos, com a variação entre
        eles, que é a leitura desta página numa linha.
      */}
      <CartaoVidro className="p-4">
        <div className="flex items-stretch">
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-[8.5px] tracking-[0.12em] uppercase text-white/62">
              Saldo disponível
            </p>
            <p className={`font-display font-black text-[24px] mt-1.5 tabular-nums leading-none ${netBalance >= 0 ? 'text-white' : 'text-csc-vermelho-texto'}`}>
              {fmtEuro(netBalance)}
            </p>
            <p className="text-[10px] font-bold text-white/50 mt-1.5">Hoje, em caixa</p>
          </div>
          <div className="w-px bg-white/12 mx-3.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-extrabold text-[8.5px] tracking-[0.12em] uppercase text-white/62">
              Previsto no fim
            </p>
            <p className={`font-display font-black text-[24px] mt-1.5 tabular-nums leading-none ${saldoPrevisto >= 0 ? 'text-csc-gold' : 'text-csc-vermelho-texto'}`}>
              {fmtEuro(saldoPrevisto)}
            </p>
            <p className={`text-[10px] font-bold mt-1.5 ${variacao >= 0 ? 'text-csc-verde-texto' : 'text-csc-vermelho-texto'}`}>
              {variacao >= 0 ? '+' : '−'}{fmtEuro(Math.abs(variacao))} até ao fim
            </p>
          </div>
        </div>
      </CartaoVidro>

      {/*
        Previsão da Época — subiu para cima dos Pagamentos Programados: é o
        plano, e os pagamentos são um dos seus pedaços. Vê-los primeiro era
        ler o detalhe antes do total.
      */}
      <Bloco
        titulo={`Previsão da época ${seasonLabel}`}
        icone={<TrendingUp size={15} className="text-csc-gold shrink-0" />}
        corpo="p-3.5 space-y-3.5"
      >
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className={ETIQUETA_GRUPO}>Entra</span>
            <span className="font-display font-black text-[13px] tabular-nums text-csc-verde-texto">
              {fmtEuro(entradasPrevistas)}
            </span>
          </div>
          <BarraComposta
            escala={escalaComposicao}
            fatias={[
              { rotulo: 'Quotas', valor: projectedQuotasTotal, cor: 'bg-csc-light' },
              { rotulo: 'Encargos', valor: totalEncargosTarget, cor: 'bg-sky-400' },
              { rotulo: 'Receitas avulsas', valor: totalIncomeOther, cor: 'bg-csc-verde-texto' },
            ]}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            <Legenda cor="bg-csc-light">Quotas {fmtEuroCurto(projectedQuotasTotal)}</Legenda>
            <Legenda cor="bg-sky-400">Encargos {fmtEuroCurto(totalEncargosTarget)}</Legenda>
            {totalIncomeOther > 0 && (
              <Legenda cor="bg-csc-verde-texto">Avulsas {fmtEuroCurto(totalIncomeOther)}</Legenda>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className={ETIQUETA_GRUPO}>Sai</span>
            <span className="font-display font-black text-[13px] tabular-nums text-csc-vermelho-texto">
              {fmtEuro(saidasPrevistas)}
            </span>
          </div>
          <BarraComposta
            escala={escalaComposicao}
            fatias={[
              { rotulo: 'Pagamentos programados', valor: totalScheduledPaymentsTarget, cor: 'bg-csc-red' },
              { rotulo: 'Outras despesas', valor: outrasDespesas, cor: 'bg-amber-400' },
            ]}
          />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            <Legenda cor="bg-csc-red">Programados {fmtEuroCurto(totalScheduledPaymentsTarget)}</Legenda>
            {outrasDespesas > 0 && (
              <Legenda cor="bg-amber-400">Outras despesas {fmtEuroCurto(outrasDespesas)}</Legenda>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white/70">Saldo previsto no fim da época</span>
            <span className={`font-display font-black text-lg tabular-nums ${saldoPrevisto >= 0 ? 'text-csc-verde-texto' : 'text-csc-vermelho-texto'}`}>
              {fmtEuro(saldoPrevisto)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-csc-light to-csc-gold rounded-full transition-all"
              style={{ width: `${projectionPct}%` }}
            />
          </div>
          <p className="text-[11px] text-white/55">
            {projectionPct}% das quotas e encargos da época já foi recebido — faltam {fmtEuro(Math.max(0, projectedSeasonTotal - receivedTowardsProjection))}.
          </p>
        </div>
      </Bloco>

      {/*
        Pagamentos Programados — desceu para debaixo da Previsão, e deixou de
        ser uma nuvem de pastilhas douradas onde a categoria, o título, o valor
        e a data corriam todos no mesmo peso e partiam a meio da palavra.
        Passou a lista agrupada do `<PagamentosProgramados>`, que é a mesma
        que Despesas/Receitas mostra — a categoria é a banda de cima de uma
        caixa e os compromissos são as linhas lá dentro. A ação de pagar
        continua só em Despesas/Receitas; cada linha leva lá.
      */}
      {pendingScheduledPayments.length > 0 && (
        <Bloco
          titulo="Pagamentos programados"
          icone={<Receipt size={15} className={`shrink-0 ${pagamentosEmAtraso > 0 ? 'text-csc-vermelho-texto' : 'text-csc-gold'}`} />}
          resumo={pagamentosEmAtraso > 0
            ? <span className={CHIP_ATRASO}>{pagamentosEmAtraso} em atraso</span>
            : <span className={CHIP_NEUTRO}>{pendingScheduledPayments.length} por pagar</span>}
        >
          <p className="text-xs text-white/60">
            <span className="font-black text-white tabular-nums">{fmtEuro(pendingScheduledPaymentsTotal)}</span>
            {' '}por pagar a terceiros até ao fim da época.
          </p>

          <PagamentosProgramados
            grupos={scheduledPaymentsByCategory}
            aoTocar={() => { triggerHaptic('selection'); irParaDespesas() }}
          />
        </Bloco>
      )}

      {/*
        Saldo ao longo da época. O que os números soltos não dizem: *quando* é
        que o dinheiro acaba. A linha cheia é o que já aconteceu, a tracejada é
        o plano pelos prazos que já existem, e o ponto do fim é exatamente o
        Saldo Previsto do cartão de cima.
      */}
      <Bloco
        titulo="Saldo ao longo da época"
        icone={<Activity size={15} className="text-csc-gold shrink-0" />}
        resumo={saldoPrevisto < 0 && (
          <span className={`${CHIP_ATRASO} flex items-center gap-1`}>
            <AlertTriangle size={10} aria-hidden="true" />
            Fecha negativo
          </span>
        )}
      >
        <GraficoSaldo pontos={serieSaldo} idxHoje={idxHoje} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-white/10">
          <Legenda cor="bg-csc-verde-texto">Realizado · {fmtEuroCurto(netBalance)}</Legenda>
          <Legenda cor="bg-csc-gold">Previsto · {fmtEuroCurto(saldoPrevisto)}</Legenda>
        </div>
      </Bloco>

      {/*
        Cobrança de quotas, mês a mês — no lugar da "Situação de Quotas dos
        Atletas", que empilhava três contagens de meses e vinte e uma pastilhas
        com nomes. Essa lista é a do separador Quotas, e é lá que se resolve:
        aqui interessa em que meses a cobrança falhou, não quem falhou.
      */}
      {cobrancaPorMes.length > 0 && (
        <Bloco
          titulo="Cobrança de quotas"
          icone={<ListChecks size={15} className="text-csc-gold shrink-0" />}
          resumo={
            <span className="font-display font-black text-[11px] tabular-nums text-white">
              {fmtEuroCurto(cobranca.pago)}
              <span className="text-white/45"> / {fmtEuroCurto(cobranca.esperado)}</span>
            </span>
          }
        >
          <GraficoCobranca meses={cobrancaPorMes} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-white/10">
            <Legenda cor="bg-csc-light">{cobranca.fechados} de {cobrancaPorMes.length} meses fechados</Legenda>
            {cobranca.porCobrar > 0 && (
              <Legenda cor="bg-csc-red">
                {cobranca.porCobrar === 1
                  ? '1 mês vencido por cobrar'
                  : `${cobranca.porCobrar} meses vencidos por cobrar`}
              </Legenda>
            )}
          </div>
        </Bloco>
      )}

      {/* Valor recebido por categoria — quanto entrou de cada coisa, contra o
          que se espera receber dela em toda a época. */}
      <Bloco
        titulo="Valor recebido por categoria"
        corpo="p-0"
        /* A soma das linhas que estão por baixo, e não o `totalReceived`:
           são duas contas diferentes da mesma coisa, e uma banda que não bata
           certo com a sua própria lista mente. O "Outras" recolhe o que fica
           fora do top 5, por isso a soma é o total. */
        resumo={
          <span className="font-display font-black text-[11px] tabular-nums text-white">
            {fmtEuro(receitaPorCategoria.reduce((soma, [, valor]) => soma + valor, 0))}
          </span>
        }
      >
        <div>
          {receitaPorCategoria.map(([label, valor], idx) => {
            const objetivo = objetivoPorCategoria.get(label)
            const temObjetivo = objetivo !== undefined && objetivo > 0
            const excedeu = temObjetivo && valor > objetivo
            const pct = temObjetivo
              ? Math.round((valor / objetivo) * 100)
              : Math.round((valor / maxReceita) * 100)
            const corBase = label === 'Outras' ? corOutras : (receitaCores[idx] || corOutras)
            const cor = temObjetivo && pct >= 100 ? 'bg-csc-light' : corBase
            return (
              <LinhaCategoria
                key={label}
                rotulo={label}
                valor={
                  <>
                    {temObjetivo ? `${fmtEuro(valor)} / ${fmtEuro(objetivo)}` : fmtEuro(valor)}
                    {excedeu && (
                      <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-csc-light/20 text-csc-verde-texto align-middle">
                        +{fmtEuro(valor - objetivo)}
                      </span>
                    )}
                  </>
                }
              >
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
                </div>
              </LinhaCategoria>
            )
          })}
        </div>
      </Bloco>

      {/* Despesa por categoria. */}
      {despesaPorCategoria.length > 0 && (
        <Bloco
          titulo="Despesa por categoria"
          corpo="p-0"
          resumo={
            <span className="font-display font-black text-[11px] tabular-nums text-white">
              {fmtEuro(despesaPorCategoria.reduce((soma, [, valor]) => soma + valor, 0))}
            </span>
          }
        >
          <div>
            {despesaPorCategoria.map(([label, valor], idx) => {
              const pct = Math.round((valor / maxDespesa) * 100)
              const cor = label === 'Outras' ? corOutras : (despesaCores[idx] || corOutras)
              return (
                <LinhaCategoria key={label} rotulo={label} valor={fmtEuro(valor)}>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </LinhaCategoria>
              )
            })}
          </div>
        </Bloco>
      )}

      {/* Valor a pagar por categoria — o espelho do recebido, para o lado do
          que o clube tem de entregar a terceiros. */}
      {pagarPorCategoria.length > 0 && (
        <Bloco
          titulo="Valor a pagar por categoria"
          corpo="p-0"
          resumo={
            <span className="font-display font-black text-[11px] tabular-nums text-white">
              {fmtEuro(pagarPorCategoria.reduce((soma, r) => soma + r.pago, 0))}
              <span className="text-white/45">
                {' / '}{fmtEuro(pagarPorCategoria.reduce((soma, r) => soma + r.pago + r.porPagar, 0))}
              </span>
            </span>
          }
        >
          <div>
            {pagarPorCategoria.map(r => {
              const total = r.pago + r.porPagar
              const pagoPct = total > 0 ? Math.round((r.pago / total) * 100) : 0
              return (
                <LinhaCategoria
                  key={r.label}
                  rotulo={r.label}
                  valor={<>{fmtEuro(r.pago)}<span className="text-white/45"> / {fmtEuro(total)}</span></>}
                >
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
                    <div className="h-full bg-csc-light" style={{ width: `${pagoPct}%` }} />
                    <div className="h-full bg-amber-400" style={{ width: `${100 - pagoPct}%` }} />
                  </div>
                </LinhaCategoria>
              )
            })}
          </div>
          <div className="flex items-center gap-4 px-3 py-2 border-t border-white/10">
            <Legenda cor="bg-csc-light">Pago</Legenda>
            <Legenda cor="bg-amber-400">Por pagar</Legenda>
          </div>
        </Bloco>
      )}
    </div>
  )
}

export default VisaoGeralFinanceira
