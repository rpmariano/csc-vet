import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Landmark, Plus, Settings, Wallet,
  ShieldCheck, Receipt, ListChecks, X, Paperclip, ExternalLink, Trash2, ChevronDown, Pencil, Check, AlertTriangle
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal } from '../components/Modal'
// O cálculo dos meses de quota e do seu estado deixou de ser feito aqui: vem
// das vistas v_quota_status e v_financial_movements. De finance.ts só sobra o
// que é regra de negócio pura — a época e o prazo do seguro.
import {
  DEFAULT_FINANCIAL_SETTINGS, comOmissoes, getSeasonLabel, nomeMes,
} from '../lib/finance'
import type { FinancialSettings, QuotaMonthStatus } from '../lib/finance'
import { useSearchParams } from 'react-router-dom'
import { CabecalhoEcra, Pastilha, EtiquetaSeccao } from '../components/ui'
import { VisaoGeralFinanceira } from '../components/financeiro/VisaoGeralFinanceira'
import { PagamentosProgramados } from '../components/financeiro/PagamentosProgramados'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { useGuardaDeSaida } from '../context/SaidaGuardadaContext'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
/*
  As pastilhas de estado, as barras de cor e o euro em português vivem em
  `components/financeiro/estilos` desde que a Visão Geral passou a ficheiro
  próprio — continuam a estar num sítio só, que é o que interessa: as Quotas e
  os Encargos já disseram a mesma coisa de maneiras diferentes.
*/
import {
  ETIQUETA_SECCAO, CHIP_ATRASO, CHIP_AVISO, CHIP_PAGO, CHIP_NEUTRO,
  BARRA_ATRASO, BARRA_AVISO, BARRA_PAGO, BARRA_NEUTRA, fmtEuro,
} from '../components/financeiro/estilos'
import type {
  PlayerRow, QuotaStatusRow, MovementRow, ScheduledPayment, EncargoPorReceber,
} from '../components/financeiro/tipos'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

/** Campo e etiqueta dos formulários, o mesmo desenho do resto da app. */
const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

/** Botão redondo de ação numa linha — 44px, como todos os alvos de toque. */
const BOTAO_LINHA =
  'w-11 h-11 flex items-center justify-center rounded-xl shrink-0 cursor-pointer transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold'

const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface ExpenseCategory {
  id: string
  name: string
  allow_income?: boolean
}

// Encargos (charges) — cobranças ad-hoc a um conjunto escolhido de jogadores
// (Seguro, equipamento, inscrição/viagem de torneio, etc.), ligadas a uma
// categoria que pode ser usada tanto para a receita como para a despesa
// correspondente. Substitui o antigo insurance_payments (só seguro, sempre a
// todos, sem correção possível).
interface Charge {
  id: string
  category_id: string | null
  title: string
  amount: number
  due_date?: string | null
  created_at?: string
  // Encargo-intermediário: o clube recebe isto dos jogadores mas tem de
  // repassar a um terceiro (ex.: Seguro Desportivo → seguradora). Um único
  // valor + prazo — não um plano de tranches como as inscrições em torneio.
  is_intermediary?: boolean
  payable_amount?: number | null
  payable_due_date?: string | null
  payable_paid?: boolean
  payable_transaction_id?: string | null
}

interface ChargePlayer {
  id: string
  charge_id: string
  player_id: string
}

interface ChargePayment {
  id: string
  charge_id: string
  player_id: string
  amount: number
  paid_at: string
  notes?: string | null
}

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  description: string
  date: string
  category_id?: string | null
  document_url?: string | null
  tournament_id?: string | null
  installment_index?: number | null
}

interface TournamentRow {
  id: string
  name: string
  season?: string | null
  rules?: any
}

type TabId = 'overview' | 'quotas' | 'charges' | 'expenses' | 'movements' | 'settings'

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'overview', label: 'Visão Geral', Icon: Landmark },
  { id: 'quotas', label: 'Quotas', Icon: ListChecks },
  { id: 'charges', label: 'Encargos', Icon: ShieldCheck },
  { id: 'expenses', label: 'Despesas/Receitas', Icon: Receipt },
  { id: 'movements', label: 'Movimentos', Icon: Wallet },
  { id: 'settings', label: 'Definições', Icon: Settings },
]

/** O título do ecrã muda com o separador — o "Financeiro" está no Clube. */
const TITULO_SEPARADOR: Record<TabId, string> = {
  overview: 'Visão geral',
  quotas: 'Quotas',
  charges: 'Encargos',
  expenses: 'Despesas e receitas',
  movements: 'Movimentos',
  settings: 'Definições',
}

// Cores por categoria, tanto para receitas como despesas — a 6ª categoria em
// diante recolhe-se em "Outras", para o gráfico não crescer sem limite.
const RECEITA_CORES = ['bg-csc-light', 'bg-sky-400', 'bg-csc-gold', 'bg-emerald-400', 'bg-indigo-400']
const DESPESA_CORES = ['bg-red-500', 'bg-purple-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
/** A cor do balde "Outras", igual dos dois lados do gráfico. */
const COR_OUTRAS = 'bg-gray-400'

// Agrupa os movimentos pela categoria já resolvida na vista (v_financial_movements
// dá a categoria específica de cada um — Quotas, Seguro Desportivo, Material
// Desportivo, ... — não um balde genérico "Encargos"), e colapsa a partir da 6ª
// em "Outras". `seedLabels` garante que uma categoria com objetivo mas ainda
// sem nenhum movimento aparece já a 0€, em vez de só surgir no primeiro
// pagamento. Fora do componente (recebe `movements` por parâmetro) para o
// useMemo que a chama poder depender só de `movements`, sem recriar a função a
// cada render.
const agruparPorCategoria = (tipo: 'income' | 'expense', movements: MovementRow[], seedLabels: string[] = []): [string, number][] => {
  const totals = new Map<string, number>()
  for (const label of seedLabels) totals.set(label, totals.get(label) || 0)
  for (const m of movements) {
    if (m.type !== tipo) continue
    totals.set(m.category_label, (totals.get(m.category_label) || 0) + Number(m.amount))
  }
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 5)
  const restante = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
  if (restante > 0) top.push(['Outras', restante])
  return top
}

const FinancePage: React.FC = () => {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [params, setParams] = useSearchParams()

  /* O separador vai no endereço; ver a nota no cabeçalho. */
  const verAtual = (params.get('ver') ?? '') as TabId
  const activeTab: TabId = TABS.some(t => t.id === verAtual) ? verAtual : 'overview'
  const trocarSeparador = (seguinte: TabId) => {
    const seguintes = new URLSearchParams(params)
    seguintes.set('ver', seguinte)
    setParams(seguintes, { replace: true })
  }

  const [settings, setSettings] = useState<FinancialSettings>(DEFAULT_FINANCIAL_SETTINGS)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [quotaRows, setQuotaRows] = useState<QuotaStatusRow[]>([])
  const [movements, setMovements] = useState<MovementRow[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [chargePlayers, setChargePlayers] = useState<ChargePlayer[]>([])
  const [chargePayments, setChargePayments] = useState<ChargePayment[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [
        { data: settingsData },
        { data: playersData },
        { data: quotaData },
        { data: movementsData },
        { data: chargesData },
        { data: chargePlayersData },
        { data: chargePaymentsData },
        { data: transData },
        { data: catData },
        { data: tourData },
      ] = await Promise.all([
        supabase.from('financial_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('v_players_public').select('id, name, shirt_name, jersey_number, status, quota_start_date, quota_end_date, role, roles').order('jersey_number', { ascending: true, nullsFirst: false }),
        supabase.from('v_quota_status').select('player_id, month_year, expected_amount, due_id, paid_amount, due_date, status, owed_amount').order('month_year'),
        supabase.from('v_financial_movements').select('*').order('entry_date', { ascending: false }),
        supabase.from('charges').select('*').order('created_at', { ascending: false }),
        supabase.from('charge_players').select('*'),
        supabase.from('charge_payments').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('expense_categories').select('*').order('name'),
        supabase.from('tournaments').select('id, name, season, rules'),
      ])

      // Coluna a coluna, e não `as FinancialSettings`: uma coluna a `NULL`
      // na base derrubava a página inteira (ver `comOmissoes`).
      if (settingsData) setSettings(comOmissoes(settingsData as Partial<FinancialSettings>))
      setPlayers((playersData || []) as PlayerRow[])
      setQuotaRows((quotaData || []) as QuotaStatusRow[])
      setMovements((movementsData || []) as MovementRow[])
      setCharges((chargesData || []) as Charge[])
      setChargePlayers((chargePlayersData || []) as ChargePlayer[])
      setChargePayments((chargePaymentsData || []) as ChargePayment[])
      setTransactions((transData || []) as Transaction[])
      setCategories((catData || []) as ExpenseCategory[])
      setTournaments((tourData || []) as TournamentRow[])
    } catch (err) {
      console.error('Erro ao carregar dados financeiros:', err)
      toast.error('Erro ao carregar dados financeiros.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const seasonLabel = useMemo(() => getSeasonLabel(settings), [settings])

  // -------------------------------------------------------------------------
  // Quotas — meses devidos por jogador nesta época, com estado calculado
  // -------------------------------------------------------------------------
  interface QuotaMonth {
    monthYear: string
    year: number
    month: number
    statusCalc: 'paid' | 'late' | 'pending'
    dueId: string | null
  }

  interface PlayerQuotaOverview {
    player: PlayerRow
    months: QuotaMonth[]
    paidCount: number
    lateCount: number
    pendingCount: number
    totalOwed: number
    totalPaid: number
  }

  // Os meses elegíveis, o prazo e o estado de cada um vêm todos da vista — a
  // mesma regra que src/lib/finance.ts aplica, mas calculada uma vez no
  // servidor. A ordem dos jogadores continua a ser a do plantel (camisola).
  //
  // A regra "só quem tem o papel de Jogador paga quota" (membros só Treinador
  // ou só Direção ficam de fora, e continuam elegíveis para Encargos) vive
  // agora dentro de v_quota_status: não há linhas para essas pessoas, por isso
  // não é preciso filtrá-las aqui. Mantê-la nos dois sítios era arriscar que
  // divergissem — a vista é a fonte de verdade das quotas.
  const quotaOverview: PlayerQuotaOverview[] = useMemo(() => {
    const porJogador = new Map<string, QuotaStatusRow[]>()
    for (const r of quotaRows) {
      if (!porJogador.has(r.player_id)) porJogador.set(r.player_id, [])
      porJogador.get(r.player_id)!.push(r)
    }
    // Só entram jogadores com meses de quota nesta época. Não é cosmética: a
    // vista respeita a RLS, por isso um jogador só recebe as SUAS linhas — sem
    // este filtro veria o plantel todo listado com "0 pagos", que é falso.
    return players.filter(p => porJogador.has(p.id)).map(p => {
      const linhas = porJogador.get(p.id) || []
      const months: QuotaMonth[] = linhas.map(r => {
        const [year, month] = r.month_year.split('-').map(Number)
        return { monthYear: r.month_year, year, month, statusCalc: r.status, dueId: r.due_id }
      })
      return {
        player: p,
        months,
        paidCount: linhas.filter(r => r.status === 'paid').length,
        lateCount: linhas.filter(r => r.status === 'late').length,
        pendingCount: linhas.filter(r => r.status === 'pending').length,
        totalPaid: linhas.reduce((sum, r) => sum + (r.paid_amount || 0), 0),
        totalOwed: linhas.reduce((sum, r) => sum + Number(r.owed_amount || 0), 0),
      }
    })
  }, [players, quotaRows])

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null)
  const [savingMonth, setSavingMonth] = useState<string | null>(null)

  // Cada clique num mês grava/anula logo o pagamento — sem passo de confirmação à parte.
  // Para pagar vários meses de uma vez, basta clicar em cada um sequencialmente.
  const handlePayQuotas = async (playerId: string, monthYears: string[]) => {
    if (monthYears.length === 0) return
    triggerHaptic('success')
    try {
      const rows = monthYears.map(my => ({
        player_id: playerId,
        month_year: my,
        amount: settings.quota_amount,
        status: 'paid',
        paid_at: new Date().toISOString(),
        created_by: profile?.id || null,
      }))
      const { error } = await supabase.from('dues').upsert(rows, { onConflict: 'player_id,month_year' })
      if (error) throw error
      toast.success(`${monthYears.length === 1 ? 'Quota registada' : `${monthYears.length} quotas registadas`} com sucesso!`)
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao registar quota: ' + (err.message || 'Erro'))
    }
  }

  const handleUnpayQuota = async (dueId: string) => {
    triggerHaptic('light')
    try {
      const { error } = await supabase.from('dues').delete().eq('id', dueId)
      if (error) throw error
      toast.success('Pagamento de quota removido.')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao remover pagamento: ' + (err.message || 'Erro'))
    }
  }

  const handleToggleQuotaMonth = async (playerId: string, m: { monthYear: string; statusCalc: QuotaMonthStatus; dueId: string | null }) => {
    setSavingMonth(m.monthYear)
    if (m.statusCalc === 'paid' && m.dueId) {
      await handleUnpayQuota(m.dueId)
    } else {
      await handlePayQuotas(playerId, [m.monthYear])
    }
    setSavingMonth(null)
  }

  // -------------------------------------------------------------------------
  // Encargos — cobranças ad-hoc a jogadores escolhidos (Seguro, equipamento,
  // inscrição/viagem de torneio, ...). Cada encargo tem um valor por jogador e
  // uma lista explícita de participantes; os pagamentos suportam parciais e,
  // ao contrário do antigo insurance_payments, podem ser corrigidos depois.
  // -------------------------------------------------------------------------
  const incomeCategories = categories.filter(c => c.allow_income)
  const activePlayers = players.filter(p => p.status !== 'inactive')

  const chargesWithStats = useMemo(() => charges.map(c => {
    const participantIds = chargePlayers.filter(cp => cp.charge_id === c.id).map(cp => cp.player_id)
    const payments = chargePayments.filter(p => p.charge_id === c.id)
    const totalExpected = c.amount * participantIds.length
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
    const paidByPlayer = new Map<string, number>()
    for (const p of payments) paidByPlayer.set(p.player_id, (paidByPlayer.get(p.player_id) || 0) + p.amount)
    // Por participante, não pelo total do encargo: quem paga a mais não pode
    // "tapar" o que falta aos outros (só relevante para o excedente aqui — o
    // objetivo/remanescente por cobrar já vive nos cards de categoria, que
    // tratam a Previsão da Época como fotografia, sem descontar pagamentos).
    let surplusAmount = 0
    for (const pid of participantIds) {
      const paid = paidByPlayer.get(pid) || 0
      if (paid > c.amount) surplusAmount += paid - c.amount
    }
    const pendingCount = participantIds.filter(pid => (paidByPlayer.get(pid) || 0) < c.amount).length
    const category = categories.find(cat => cat.id === c.category_id)
    return { ...c, participantIds, payments, totalExpected, totalPaid, surplusAmount, pendingCount, categoryName: category?.name || null }
  }), [charges, chargePlayers, chargePayments, categories])

  const [expandedChargeId, setExpandedChargeId] = useState<string | null>(null)
  const [isNewChargeModalOpen, setIsNewChargeModalOpen] = useState(false)
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null)
  const [newChargeCategoryId, setNewChargeCategoryId] = useState('')
  const [newChargeTitle, setNewChargeTitle] = useState('')
  const [newChargeAmount, setNewChargeAmount] = useState('')
  const [newChargeDueDate, setNewChargeDueDate] = useState('')
  // Encargo-intermediário: o clube recebe isto dos jogadores mas tem de
  // repassar a um terceiro (ex.: Seguro Desportivo → seguradora).
  const [newChargeIsIntermediary, setNewChargeIsIntermediary] = useState(false)
  const [newChargePayableAmount, setNewChargePayableAmount] = useState('')
  const [newChargePayableDueDate, setNewChargePayableDueDate] = useState('')
  const [newChargePlayerIds, setNewChargePlayerIds] = useState<Set<string>>(new Set())
  const [savingCharge, setSavingCharge] = useState(false)
  const [chargeToDelete, setChargeToDelete] = useState<string | null>(null)

  const [payFormKey, setPayFormKey] = useState<string | null>(null) // `${chargeId}:${playerId}`
  const [payFormAmount, setPayFormAmount] = useState('')
  const [payFormDate, setPayFormDate] = useState(new Date().toISOString().split('T')[0])
  const [payFormNotes, setPayFormNotes] = useState('')

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editPaymentAmount, setEditPaymentAmount] = useState('')
  const [editPaymentDate, setEditPaymentDate] = useState('')
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null)

  const openNewChargeModal = () => {
    setEditingChargeId(null)
    setNewChargeCategoryId(incomeCategories[0]?.id || '')
    setNewChargeTitle('')
    setNewChargeAmount('')
    setNewChargeDueDate('')
    setNewChargeIsIntermediary(false)
    setNewChargePayableAmount('')
    setNewChargePayableDueDate('')
    setNewChargePlayerIds(new Set(activePlayers.map(p => p.id)))
    setIsNewChargeModalOpen(true)
  }

  const fecharModalEncargo = () => {
    setIsNewChargeModalOpen(false)
    setEditingChargeId(null)
  }

  /*
    Um encargo meio preenchido — com a lista de participantes já escolhida a
    dedo — não se perde num Escape. O conjunto de participantes vai ordenado
    para a comparação: um `Set` não se serializa, e sem isto duas listas
    diferentes de jogadores davam a mesma fotografia.
  */
  const guardaEncargo = useAlteracoesPorGravar({
    aberto: isNewChargeModalOpen,
    valores: [
      newChargeCategoryId, newChargeTitle, newChargeAmount, newChargeDueDate,
      newChargeIsIntermediary, newChargePayableAmount, newChargePayableDueDate,
      [...newChargePlayerIds].sort(),
    ],
    aoGravar: () => handleSaveCharge(),
    aoSair: fecharModalEncargo,
    descricao: 'Este encargo ainda não foi gravado. Se saíres agora, perde-se o que preencheste.',
  })

  const openEditChargeModal = (c: (typeof chargesWithStats)[number]) => {
    setEditingChargeId(c.id)
    setNewChargeCategoryId(c.category_id || '')
    setNewChargeTitle(c.title)
    setNewChargeAmount(String(c.amount))
    setNewChargeDueDate(c.due_date ? c.due_date.slice(0, 10) : '')
    setNewChargeIsIntermediary(!!c.is_intermediary)
    setNewChargePayableAmount(c.payable_amount != null ? String(c.payable_amount) : '')
    setNewChargePayableDueDate(c.payable_due_date ? c.payable_due_date.slice(0, 10) : '')
    setNewChargePlayerIds(new Set(c.participantIds))
    setIsNewChargeModalOpen(true)
  }

  // Um participante que já tenha algum pagamento não pode ser removido do
  // encargo ao editar — perderia-se a ligação ao seu histórico de pagamentos.
  const chargeParticipantHasPayments = (charge: (typeof chargesWithStats)[number] | undefined, playerId: string) =>
    !!charge?.payments.some(p => p.player_id === playerId)

  const toggleNewChargePlayer = (id: string) => setNewChargePlayerIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  /*
    Escolher a categoria de um encargo, e mais nada.
    
    Havia aqui um caso especial: se a categoria se chamasse exatamente
    "Seguro Desportivo", o título, o valor e o prazo eram pré-preenchidos a
    partir de três definições próprias. O seguro passa a ser uma categoria
    como as outras — é o que o handoff pede em 8c e 8g ("o seguro é uma
    delas, sem tratamento especial") — e o comportamento dependia de uma
    string escrita à mão: bastava alguém renomear a categoria para "Seguro
    desportivo" e a magia deixava de acontecer, sem aviso nenhum.

    As colunas `insurance_*` continuam na base e nas Definições; o que sai é
    a mágica de as aplicar sozinhas a uma categoria com um nome em concreto.
  */
  const handleChargeCategoryChange = (categoryId: string) => {
    setNewChargeCategoryId(categoryId)
  }

  // Ao marcar "o clube funciona como intermediário", sugere como valor a
  // pagar o total já configurado (valor por jogador × participantes) — só um
  // ponto de partida, o clube pode dever um valor diferente ao terceiro.
  const handleToggleChargeIntermediary = (checked: boolean) => {
    setNewChargeIsIntermediary(checked)
    if (checked && !newChargePayableAmount) {
      const total = (parseFloat(newChargeAmount) || 0) * newChargePlayerIds.size
      if (total > 0) setNewChargePayableAmount(String(total))
    }
  }

  const handleSaveCharge = async () => {
    if (!newChargeTitle.trim()) {
      toast.warning('Indica um título para o encargo.')
      return
    }
    const amt = parseFloat(newChargeAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.warning('Indica um valor válido.')
      return
    }
    if (newChargePlayerIds.size === 0) {
      toast.warning('Escolhe pelo menos um jogador.')
      return
    }
    let payableAmt: number | null = null
    if (newChargeIsIntermediary) {
      payableAmt = parseFloat(newChargePayableAmount)
      if (isNaN(payableAmt) || payableAmt <= 0) {
        toast.warning('Indica quanto o clube tem de pagar ao terceiro.')
        return
      }
    }
    setSavingCharge(true)
    try {
      if (editingChargeId) {
        const { error } = await supabase.from('charges').update({
          category_id: newChargeCategoryId || null,
          title: newChargeTitle.trim(),
          amount: amt,
          due_date: newChargeDueDate || null,
          is_intermediary: newChargeIsIntermediary,
          payable_amount: payableAmt,
          payable_due_date: newChargeIsIntermediary ? (newChargePayableDueDate || null) : null,
        }).eq('id', editingChargeId)
        if (error) throw error

        const original = chargesWithStats.find(c => c.id === editingChargeId)
        const originalIds = new Set(original?.participantIds || [])
        const toAdd = Array.from(newChargePlayerIds).filter(pid => !originalIds.has(pid))
        // Nunca remove quem já tem pagamentos, mesmo que tenha ficado desmarcado.
        const toRemove = Array.from(originalIds).filter(pid => !newChargePlayerIds.has(pid) && !chargeParticipantHasPayments(original, pid))

        if (toAdd.length > 0) {
          const { error: eAdd } = await supabase.from('charge_players').insert(toAdd.map(pid => ({ charge_id: editingChargeId, player_id: pid })))
          if (eAdd) throw eAdd
        }
        if (toRemove.length > 0) {
          const { error: eRemove } = await supabase.from('charge_players').delete().eq('charge_id', editingChargeId).in('player_id', toRemove)
          if (eRemove) throw eRemove
        }
        triggerHaptic('success')
        toast.success('Encargo atualizado!')
      } else {
        const { data: chargeRow, error } = await supabase.from('charges').insert([{
          category_id: newChargeCategoryId || null,
          title: newChargeTitle.trim(),
          amount: amt,
          due_date: newChargeDueDate || null,
          is_intermediary: newChargeIsIntermediary,
          payable_amount: payableAmt,
          payable_due_date: newChargeIsIntermediary ? (newChargePayableDueDate || null) : null,
          created_by: profile?.id || null,
        }]).select().single()
        if (error) throw error
        const { error: e2 } = await supabase.from('charge_players').insert(
          Array.from(newChargePlayerIds).map(pid => ({ charge_id: chargeRow.id, player_id: pid }))
        )
        if (e2) throw e2
        triggerHaptic('success')
        toast.success('Encargo criado!')
      }
      fecharModalEncargo()
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao guardar encargo: ' + (err.message || 'Erro'))
    } finally {
      setSavingCharge(false)
    }
  }

  const handleDeleteCharge = async () => {
    if (!chargeToDelete) return
    const { error } = await supabase.from('charges').delete().eq('id', chargeToDelete)
    setChargeToDelete(null)
    if (error) {
      toast.error('Erro ao apagar encargo: ' + error.message)
      return
    }
    toast.success('Encargo apagado.')
    fetchAll()
  }

  // Regista o pagamento ao terceiro de um encargo-intermediário (ex.: à
  // seguradora) — cria a despesa na própria categoria do encargo (o cliente já
  // recebe nessa categoria, por isso o saldo dela tende a zero) e marca
  // payable_paid. Espelha handlePayInstallment (inscrições em torneio).
  const handlePayChargePayable = async (charge: (typeof chargesWithStats)[number]) => {
    if (!charge.payable_amount) return
    try {
      const { data: txData, error: txError } = await supabase.from('transactions').insert([{
        type: 'expense',
        amount: charge.payable_amount,
        description: `${charge.title} — pagamento ao terceiro`,
        date: new Date().toISOString().split('T')[0],
        category_id: charge.category_id,
        created_by: profile?.id || null,
      }]).select().single()
      if (txError) throw txError

      const { error: updError } = await supabase.from('charges').update({
        payable_paid: true,
        payable_transaction_id: txData.id,
      }).eq('id', charge.id)
      if (updError) throw updError

      toast.success('Pagamento ao terceiro registado!')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao registar pagamento: ' + (err.message || 'Erro'))
    }
  }

  // Regista o pagamento de uma tranche de inscrição em torneio — espelha
  // handlePayChargePayable acima. Declarado antes de pendingScheduledPayments
  // (que o usa) para não referenciar um const ainda não inicializado.
  const handlePayInstallment = async (tournamentId: string, index: number, amount: number, tournamentName: string) => {
    try {
      const tournament = tournaments.find(t => t.id === tournamentId)
      const rf = tournament?.rules?.registration_fee
      if (!tournament || !rf) return

      // rf.category_id: categoria própria deste torneio, criada ao guardar o torneio
      // (ver garantirCategoriaDeInscricao em components/clube/GestaoTorneios). O fallback pelo
      // nome cobre só torneios guardados antes desta categoria por torneio existir.
      const categoryId = rf.category_id || categories.find(c => c.name === 'Inscrições em Torneios')?.id || null
      const { data: txData, error: txError } = await supabase.from('transactions').insert([{
        type: 'expense',
        amount,
        description: `Inscrição ${tournamentName} — Tranche ${index + 1}`,
        date: new Date().toISOString().split('T')[0],
        category_id: categoryId,
        tournament_id: tournamentId,
        installment_index: index,
        created_by: profile?.id || null,
      }]).select().single()
      if (txError) throw txError

      const newInstallments = rf.installments.map((it: any, i: number) => i === index ? { ...it, paid: true, transaction_id: txData.id } : it)
      const { error: updError } = await supabase.from('tournaments').update({
        rules: { ...tournament.rules, registration_fee: { ...rf, installments: newInstallments } },
      }).eq('id', tournamentId)
      if (updError) throw updError

      toast.success('Tranche paga — despesa registada!')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao pagar tranche: ' + (err.message || 'Erro'))
    }
  }

  const openPayForm = (chargeId: string, playerId: string) => {
    setPayFormKey(`${chargeId}:${playerId}`)
    setPayFormAmount('')
    setPayFormDate(new Date().toISOString().split('T')[0])
    setPayFormNotes('')
  }

  const handleAddChargePayment = async (chargeId: string, playerId: string) => {
    const val = parseFloat(payFormAmount)
    if (isNaN(val) || val <= 0) {
      toast.warning('Indica um valor válido.')
      return
    }
    try {
      const { error } = await supabase.from('charge_payments').insert([{
        charge_id: chargeId,
        player_id: playerId,
        amount: val,
        paid_at: payFormDate,
        notes: payFormNotes.trim() || null,
        created_by: profile?.id || null,
      }])
      if (error) throw error
      triggerHaptic('success')
      toast.success('Pagamento registado!')
      setPayFormKey(null)
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao registar pagamento: ' + (err.message || 'Erro'))
    }
  }

  const startEditPayment = (p: ChargePayment) => {
    setEditingPaymentId(p.id)
    setEditPaymentAmount(String(p.amount))
    setEditPaymentDate(p.paid_at)
  }

  const handleSaveEditedPayment = async () => {
    if (!editingPaymentId) return
    const val = parseFloat(editPaymentAmount)
    if (isNaN(val) || val <= 0) {
      toast.warning('Indica um valor válido.')
      return
    }
    const { error } = await supabase.from('charge_payments').update({ amount: val, paid_at: editPaymentDate }).eq('id', editingPaymentId)
    if (error) {
      toast.error('Erro ao corrigir pagamento: ' + error.message)
      return
    }
    toast.success('Pagamento corrigido!')
    setEditingPaymentId(null)
    fetchAll()
  }

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return
    const { error } = await supabase.from('charge_payments').delete().eq('id', paymentToDelete)
    setPaymentToDelete(null)
    if (error) {
      toast.error('Erro ao apagar pagamento: ' + error.message)
      return
    }
    toast.success('Pagamento apagado.')
    fetchAll()
  }

  // -------------------------------------------------------------------------
  // Despesas / Movimentos
  // -------------------------------------------------------------------------
  const [movFilterMonth, setMovFilterMonth] = useState<string>('all')
  const [movFilterYear, setMovFilterYear] = useState<string>('all')
  const [collapsedMovCategories, setCollapsedMovCategories] = useState<Set<string>>(new Set())
  const toggleMovCategory = (key: string) => setCollapsedMovCategories(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Movimentos: as três fontes de dinheiro (quotas, encargos, despesas/receitas
  // avulsas) já vêm unificadas de public.v_financial_movements — a vista faz o
  // que esta página fazia em memória, e com as mesmas regras: os pagamentos de
  // encargos usam a categoria do próprio encargo (não um balde fixo "Encargos"),
  // para se juntarem no mesmo grupo à despesa correspondente (ex.: o que se
  // recebeu de Seguro e o que se pagou à seguradora) e dar para ver se o saldo
  // dessa categoria fecha a zero.
  const allMovements = useMemo(() => movements.map(m => ({
    id: m.movement_id,
    date: m.entry_date,
    description: m.description,
    amount: Number(m.amount),
    type: m.type,
    documentUrl: m.document_url,
    categoryKey: m.category_key,
    categoryLabel: m.category_label,
  })), [movements])

  const movementYears = useMemo(() => {
    const years = new Set(allMovements.map(m => new Date(m.date).getFullYear()))
    return Array.from(years).sort((a, b) => b - a)
  }, [allMovements])

  const filteredMovements = useMemo(() => allMovements.filter(m => {
    const d = new Date(m.date)
    if (movFilterYear !== 'all' && d.getFullYear() !== parseInt(movFilterYear)) return false
    if (movFilterMonth !== 'all' && (d.getMonth() + 1) !== parseInt(movFilterMonth)) return false
    return true
  }), [allMovements, movFilterMonth, movFilterYear])

  // Ordem fixa: Quotas e Outras Receitas primeiro, depois cada categoria (de despesa
  // e/ou encargo) pela ordem em que foram criadas, e por fim os movimentos sem categoria.
  const groupedMovements = useMemo(() => {
    const order = ['quotas', 'income_other', ...categories.map(c => c.id), 'no_category']
    const byKey = new Map<string, { label: string; rows: typeof filteredMovements }>()
    filteredMovements.forEach(m => {
      if (!byKey.has(m.categoryKey)) byKey.set(m.categoryKey, { label: m.categoryLabel, rows: [] })
      byKey.get(m.categoryKey)!.rows.push(m)
    })
    return order.filter(k => byKey.has(k)).map(k => ({ key: k, ...byKey.get(k)! }))
  }, [filteredMovements, categories])

  const filteredIncomeTotal = filteredMovements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const filteredExpenseTotal = filteredMovements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)

  const [txType, setTxType] = useState<'income' | 'expense'>('expense')
  const [txDesc, setTxDesc] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txCategoryId, setTxCategoryId] = useState('')
  const [txFile, setTxFile] = useState<File | null>(null)
  const [txSaving, setTxSaving] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryAllowIncome, setNewCategoryAllowIncome] = useState(false)

  /* O que "descartar" quer dizer neste formulário — e o que se faz depois de
     gravar, para o guarda não continuar a achar que há coisas por gravar. */
  const limparFormularioMovimento = () => {
    setTxDesc('')
    setTxAmount('')
    setTxCategoryId('')
    setTxFile(null)
  }

  const handleTxTypeChange = (type: 'income' | 'expense') => {
    setTxType(type)
    setTxCategoryId(prev => (type === 'income' && !categories.find(c => c.id === prev)?.allow_income) ? '' : prev)
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    try {
      const { error } = await supabase.from('expense_categories').insert([{ name, allow_income: newCategoryAllowIncome }])
      if (error) throw error
      toast.success('Categoria criada!')
      setNewCategoryName('')
      setNewCategoryAllowIncome(false)
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao criar categoria: ' + (err.message || 'Já existe uma categoria com esse nome?'))
    }
  }

  const handleDeleteCategory = async (id: string) => {
    try {
      const { error } = await supabase.from('expense_categories').delete().eq('id', id)
      if (error) throw error
      toast.success('Categoria eliminada.')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao eliminar categoria: ' + (err.message || 'Erro'))
    }
  }

  // Alterna se uma categoria já criada também pode ser usada para receitas —
  // sem isto, uma categoria só marcada depois de criada (ou criada antes desta
  // opção existir) ficava presa para sempre como despesa, e nunca aparecia
  // para escolher num Encargo novo.
  const handleToggleCategoryIncome = async (cat: ExpenseCategory) => {
    try {
      const { error } = await supabase.from('expense_categories').update({ allow_income: !cat.allow_income }).eq('id', cat.id)
      if (error) throw error
      toast.success(cat.allow_income ? 'Categoria deixou de poder ser usada para receitas.' : 'Categoria já pode ser usada para receitas (ex.: Encargos).')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao atualizar categoria: ' + (err.message || 'Erro'))
    }
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(txAmount)
    if (isNaN(val) || val <= 0) {
      toast.warning('Indica um valor válido.')
      return
    }
    setTxSaving(true)
    try {
      let document_url: string | null = null
      if (txFile) {
        const ext = txFile.name.split('.').pop()
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('finance_documents').upload(path, txFile)
        if (upErr) throw upErr
        document_url = path
      }

      const { error } = await supabase.from('transactions').insert([{
        type: txType,
        amount: val,
        description: txDesc.trim(),
        date: txDate,
        category_id: txCategoryId || null,
        document_url,
        created_by: profile?.id || null,
      }])
      if (error) throw error

      toast.success('Movimento registado com sucesso!')
      limparFormularioMovimento()
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao registar movimento: ' + (err.message || 'Erro'))
    } finally {
      setTxSaving(false)
    }
  }

  const [documentSignedUrls, setDocumentSignedUrls] = useState<Record<string, string>>({})
  const handleOpenDocument = async (path: string) => {
    if (documentSignedUrls[path]) {
      window.open(documentSignedUrls[path], '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const { data, error } = await supabase.storage.from('finance_documents').createSignedUrl(path, 300)
      if (error) throw error
      if (data?.signedUrl) {
        setDocumentSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }))
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err: any) {
      toast.error('Erro ao abrir documento: ' + (err.message || 'Erro'))
    }
  }

  const handleDeleteTransaction = async (id: string) => {
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
      toast.success('Movimento eliminado.')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao eliminar movimento: ' + (err.message || 'Erro'))
    }
  }

  // -------------------------------------------------------------------------
  // Pagamentos Programados — despesas já certas mas ainda por pagar, de duas
  // origens: tranches de inscrição em torneio (tournaments.rules) e o valor a
  // pagar a terceiros de encargos-intermediário (charges.payable_amount, ex.:
  // Seguro Desportivo → seguradora). Uma lista só — mesmo bloco em Despesas/
  // Receitas e em Visão Geral, cada linha já traz a categoria e a ação de
  // pagar prontas, para a UI não precisar de saber de onde veio.
  // -------------------------------------------------------------------------
  const pendingScheduledPayments = useMemo(() => {
    const list: ScheduledPayment[] = []
    for (const t of tournaments) {
      const rf = t.rules?.registration_fee
      if (!rf?.installments) continue
      const categoryLabel = categories.find(c => c.id === rf.category_id)?.name || null
      rf.installments.forEach((inst: any, idx: number) => {
        if (!inst.paid) {
          list.push({
            key: `tour-${t.id}-${idx}`,
            title: `${t.name} — Tranche ${idx + 1}`,
            categoryLabel,
            amount: inst.amount,
            due_date: inst.due_date || null,
            source: 'tournament',
            tournamentId: t.id,
            tournamentName: t.name,
            installmentIndex: idx,
          })
        }
      })
    }
    for (const c of chargesWithStats) {
      if (c.is_intermediary && c.payable_amount && !c.payable_paid) {
        list.push({
          key: `charge-${c.id}`,
          title: c.title,
          categoryLabel: c.categoryName,
          amount: c.payable_amount,
          due_date: c.payable_due_date || null,
          source: 'charge',
          chargeId: c.id,
        })
      }
    }
    return list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [tournaments, chargesWithStats, categories])

  // Resolve a ação de pagar certa para uma linha de Pagamentos Programados —
  // feito aqui (não dentro do useMemo acima) para este não precisar de
  // depender de handlePayInstallment/handlePayChargePayable.
  const handlePayScheduled = (p: ScheduledPayment) => {
    if (p.source === 'tournament' && p.tournamentId && p.installmentIndex != null) {
      handlePayInstallment(p.tournamentId, p.installmentIndex, p.amount, p.tournamentName || '')
    } else if (p.source === 'charge' && p.chargeId) {
      const charge = chargesWithStats.find(c => c.id === p.chargeId)
      if (charge) handlePayChargePayable(charge)
    }
  }

  // Total ainda por pagar em pagamentos já programados — conta como despesa
  // conhecida na previsão financeira mesmo antes de ser paga (ver "Saldo
  // Previsto" em Visão Geral).
  const pendingScheduledPaymentsTotal = pendingScheduledPayments.reduce((s, i) => s + i.amount, 0)

  // Agrupados por categoria para a listagem em Despesas/Receitas e para a
  // lista da Visão Geral, onde a categoria é o cabeçalho de cada grupo.
  const scheduledPaymentsByCategory = useMemo(() => {
    const groups = new Map<string, ScheduledPayment[]>()
    for (const p of pendingScheduledPayments) {
      const key = p.categoryLabel || 'Sem categoria'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }
    return Array.from(groups.entries())
  }, [pendingScheduledPayments])

  // -------------------------------------------------------------------------
  // Definições
  // -------------------------------------------------------------------------
  const [settingsForm, setSettingsForm] = useState<FinancialSettings>(settings)
  useEffect(() => { setSettingsForm(settings) }, [settings])
  const [savingSettings, setSavingSettings] = useState(false)

  /*
    As Definições financeiras são um formulário sem botão de fechar: sai-se
    delas trocando de separador ou saindo da página. Mexer no valor da quota ou
    nos meses excluídos e tocar noutro separador apagava tudo em silêncio — e
    são números que mudam a previsão da época inteira.

    O separador de destino vai numa ref e não em estado: é lido só dentro dos
    callbacks do aviso, e em estado chegaria tarde ao `aoSair` desta passagem.
  */
  const separadorPendente = useRef<TabId | null>(null)
  const irParaSeparadorPendente = () => {
    const alvo = separadorPendente.current
    separadorPendente.current = null
    if (alvo) trocarSeparador(alvo)
  }

  /*
    Trocar de separador é sair do formulário que lá estava. Pergunta-se pelo
    guarda do separador de onde se sai — os outros não têm nada por gravar.
  */
  const pedirTrocaDeSeparador = (seguinte: TabId) => {
    if (seguinte === activeTab) return
    separadorPendente.current = seguinte
    if (activeTab === 'settings') guardaDefinicoes.tentarFechar()
    else if (activeTab === 'expenses') guardaMovimento.tentarFechar()
    else trocarSeparador(seguinte)
  }

  const guardaDefinicoes = useAlteracoesPorGravar({
    aberto: activeTab === 'settings',
    valores: settingsForm,
    aoGravar: async () => {
      await handleSaveSettings()
      irParaSeparadorPendente()
    },
    aoSair: () => {
      setSettingsForm(settings)
      irParaSeparadorPendente()
    },
    descricao: 'As definições financeiras ainda não foram gravadas. Se saíres agora, perdem-se.',
  })

  /*
    O lançamento de uma despesa ou receita é um formulário no meio do
    separador, sem botão de fechar: trocar de separador ou sair da página
    apagava a descrição, o valor e o comprovativo já escolhido.

    O ficheiro entra na comparação pelo nome: um `File` não se serializa, e sem
    isto trocar de comprovativo não contava como alteração.
  */
  const guardaMovimento = useAlteracoesPorGravar({
    aberto: activeTab === 'expenses',
    valores: [txType, txDesc, txAmount, txDate, txCategoryId, txFile?.name ?? null],
    aoGravar: async () => {
      await handleAddTransaction(EVENTO_FALSO)
      irParaSeparadorPendente()
    },
    aoSair: () => {
      limparFormularioMovimento()
      irParaSeparadorPendente()
    },
    descricao: 'A despesa ou receita que estás a lançar ainda não foi gravada. Se saíres agora, perde-se.',
  })

  useGuardaDeSaida({
    sujo: guardaDefinicoes.sujo || guardaMovimento.sujo,
    gravar: async () => {
      if (guardaDefinicoes.sujo) await handleSaveSettings()
      if (guardaMovimento.sujo) await handleAddTransaction(EVENTO_FALSO)
    },
    descartar: () => {
      setSettingsForm(settings)
      limparFormularioMovimento()
    },
    descricao: 'Há alterações no Financeiro por gravar. Se saíres agora, perdem-se.',
  })

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const { error } = await supabase.from('financial_settings').update({
        season_start_month: settingsForm.season_start_month,
        season_end_month: settingsForm.season_end_month,
        quota_amount: settingsForm.quota_amount,
        quota_excluded_months: settingsForm.quota_excluded_months,
        quota_due_day: settingsForm.quota_due_day,
        insurance_amount: settingsForm.insurance_amount,
        insurance_deadline_month: settingsForm.insurance_deadline_month,
        insurance_deadline_day: settingsForm.insurance_deadline_day,
      }).eq('id', 1)
      if (error) throw error
      /* O separador não fecha ao gravar: sem uma fotografia nova ficava sujo
         para sempre, e cada toque noutro separador voltava a perguntar. */
      guardaDefinicoes.marcarComoGravado()
      toast.success('Definições financeiras atualizadas!')
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao guardar definições: ' + (err.message || 'Erro'))
    } finally {
      setSavingSettings(false)
    }
  }

  // -------------------------------------------------------------------------
  // Dashboard: receita por categoria + previsão da época
  // -------------------------------------------------------------------------
  // Todo o dinheiro já recebido ou gasto sai do mesmo facto — a vista de
  // movimentos — para não haver duas contas do mesmo número a divergir.
  const somaMovimentos = (filtro: (m: MovementRow) => boolean) =>
    movements.filter(filtro).reduce((s, m) => s + Number(m.amount), 0)

  const totalQuotasReceived = somaMovimentos(m => m.source === 'quota')
  const totalChargesReceived = somaMovimentos(m => m.source === 'encargo')
  const totalIncomeOther = somaMovimentos(m => m.source === 'avulso' && m.type === 'income')
  const totalExpenses = somaMovimentos(m => m.type === 'expense')
  const totalReceived = totalQuotasReceived + totalChargesReceived + totalIncomeOther
  const netBalance = totalReceived - totalExpenses

  // Previsão: total de quotas que TODOS os jogadores elegíveis vão pagar esta
  // época (passadas + futuras) + o que falta receber dos encargos já criados
  // (valor por participante menos o que cada um já pagou) — ao contrário do
  // antigo seguro (uma estimativa às cegas para todos os ativos), isto é um
  // valor real, baseado nos encargos que já existem.
  const projectedQuotasTotal = quotaRows.reduce((sum, r) => sum + Number(r.expected_amount || 0), 0)

  // Objetivo por categoria de receita, para comparar com o valor recebido em
  // "Valor Recebido por Categoria": Quotas usa a previsão da época; cada
  // categoria de Encargos usa a soma do valor esperado (valor × participantes)
  // dos encargos dessa categoria. Também serve de "seed" para a categoria já
  // aparecer no gráfico a 0€ antes do primeiro pagamento, em vez de só surgir
  // depois de alguém pagar.
  const objetivoPorCategoria = useMemo(() => {
    const totals = new Map<string, number>()
    totals.set('Quotas', projectedQuotasTotal)
    for (const c of chargesWithStats) {
      if (!c.categoryName) continue
      totals.set(c.categoryName, (totals.get(c.categoryName) || 0) + c.totalExpected)
    }
    return totals
  }, [projectedQuotasTotal, chargesWithStats])

  const receitaPorCategoria = useMemo(
    () => agruparPorCategoria('income', movements, Array.from(objetivoPorCategoria.keys())),
    [movements, objetivoPorCategoria]
  )

  const despesaPorCategoria = useMemo(() => agruparPorCategoria('expense', movements), [movements])

  // Categorias com uma obrigação de pagamento a terceiros (encargo-
  // intermediário ou inscrição de torneio) — paga ou não, para a categoria não
  // desaparecer do gráfico assim que fica saldada.
  const payableCategoryLabels = useMemo(() => {
    const set = new Set<string>()
    for (const c of chargesWithStats) if (c.is_intermediary && c.categoryName) set.add(c.categoryName)
    for (const t of tournaments) {
      const rf = t.rules?.registration_fee
      if (!rf) continue
      const label = categories.find(cat => cat.id === rf.category_id)?.name
      if (label) set.add(label)
    }
    return set
  }, [chargesWithStats, tournaments, categories])

  // Espelha receitaPorCategoria/despesaPorCategoria, mas para o lado do que o
  // clube tem de pagar a terceiros: "pago" vem das despesas já lançadas nessa
  // categoria (despesaPorCategoria — categorias destas são dedicadas, por
  // isso a despesa nelas é essencialmente o pagamento ao terceiro); "por
  // pagar" vem dos Pagamentos Programados ainda pendentes dessa categoria.
  const pagarPorCategoria = useMemo(() => {
    const porPagarMap = new Map<string, number>()
    for (const p of pendingScheduledPayments) {
      const key = p.categoryLabel || 'Sem categoria'
      porPagarMap.set(key, (porPagarMap.get(key) || 0) + p.amount)
    }
    const pagoMap = new Map(despesaPorCategoria)
    return Array.from(payableCategoryLabels)
      .map(label => ({ label, pago: pagoMap.get(label) || 0, porPagar: porPagarMap.get(label) || 0 }))
      .filter(r => r.pago > 0 || r.porPagar > 0)
      .sort((a, b) => (b.pago + b.porPagar) - (a.pago + a.porPagar))
  }, [payableCategoryLabels, pendingScheduledPayments, despesaPorCategoria])

  // Previsão da Época é uma FOTOGRAFIA do plano — os totais não descem à
  // medida que se recebe/paga, só mudam se o plano em si mudar (criar/editar
  // um encargo, mudar quotas, agendar ou alterar um pagamento). O progresso
  // dinâmico (recebido/pago vs objetivo, excedentes) já vive nos outros
  // cards — Valor Recebido/a Pagar por Categoria, e os separadores Encargos
  // e Despesas/Receitas — de propósito, para não se misturar aqui.
  const totalEncargosTarget = chargesWithStats.reduce((s, c) => s + c.totalExpected, 0)
  const totalScheduledPaymentsTarget = useMemo(() => {
    let total = 0
    for (const t of tournaments) {
      const rf = t.rules?.registration_fee
      if (rf?.installments) total += rf.installments.reduce((s: number, inst: any) => s + inst.amount, 0)
    }
    for (const c of chargesWithStats) {
      if (c.is_intermediary && c.payable_amount) total += c.payable_amount
    }
    return total
  }, [tournaments, chargesWithStats])

  const receivedTowardsProjection = totalQuotasReceived + totalChargesReceived

  // O que falta receber de cada encargo, com o prazo em que se espera — o
  // mínimo de que a linha do saldo precisa dos encargos para saber em que mês
  // é que esse dinheiro entra. Um encargo sem prazo cai no fim da época.
  const encargosPorReceber: EncargoPorReceber[] = useMemo(
    () => chargesWithStats
      .map(c => ({
        id: c.id,
        dueDate: c.due_date || null,
        amount: Math.max(0, c.totalExpected - c.totalPaid),
      }))
      .filter(e => e.amount > 0),
    [chargesWithStats],
  )

  /*
    O Saldo Previsto no Fim da Época deixou de ser calculado aqui: é o último
    ponto da linha do saldo, dentro da Visão Geral, para não haver duas contas
    do mesmo número a poderem discordar. A conta que aqui estava tinha ainda um
    buraco — descontava as despesas avulsas já lançadas mas não somava as
    receitas avulsas já recebidas, e um patrocínio entrava em caixa sem mexer
    no previsto.
  */

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/*
        Cabeçalho do Financeiro (ecrãs 8a–8g). O separador escolhido vai no
        endereço (`?ver=`), como na Competição e nos dados do clube: dá link
        próprio e faz o retroceder do browser funcionar.
      */}
      <CabecalhoEcra
        titulo={TITULO_SEPARADOR[activeTab]}
        sobrancelha={`Época ${seasonLabel}`}
        className="mb-3"
      />

      <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
        {TABS.map(tab => (
          <Pastilha
            key={tab.id}
            ativa={activeTab === tab.id}
            onClick={() => { triggerHaptic('selection'); pedirTrocaDeSeparador(tab.id) }}
            className="flex-none"
          >
            {tab.label}
          </Pastilha>
        ))}
      </div>

      {/* ================= VISÃO GERAL ================= */}
      {activeTab === 'overview' && (
        <VisaoGeralFinanceira
          seasonLabel={seasonLabel}
          settings={settings}
          movements={movements}
          quotaRows={quotaRows}
          netBalance={netBalance}
          totalReceived={totalReceived}
          totalExpenses={totalExpenses}
          totalIncomeOther={totalIncomeOther}
          projectedQuotasTotal={projectedQuotasTotal}
          totalEncargosTarget={totalEncargosTarget}
          totalScheduledPaymentsTarget={totalScheduledPaymentsTarget}
          receivedTowardsProjection={receivedTowardsProjection}
          encargosPorReceber={encargosPorReceber}
          pendingScheduledPayments={pendingScheduledPayments}
          pendingScheduledPaymentsTotal={pendingScheduledPaymentsTotal}
          scheduledPaymentsByCategory={scheduledPaymentsByCategory}
          receitaPorCategoria={receitaPorCategoria}
          objetivoPorCategoria={objetivoPorCategoria}
          despesaPorCategoria={despesaPorCategoria}
          pagarPorCategoria={pagarPorCategoria}
          receitaCores={RECEITA_CORES}
          despesaCores={DESPESA_CORES}
          corOutras={COR_OUTRAS}
          irParaDespesas={() => trocarSeparador('expenses')}
        />
      )}

      {/* ================= QUOTAS ================= */}
      {activeTab === 'quotas' && (
        <div className="space-y-3">
          {/*
            A regra em cima, a lista em baixo — e nada de molduras dentro de
            molduras. Isto era um cartão `bg-csc-dark` com sublinhado dourado a
            embrulhar uma caixa cinzenta a embrulhar fichas **`bg-white`
            opacas**: sobre elas o `text-white` das linhas ficava branco em
            branco, e o nome do jogador não se via de todo. Ver a nota do
            `CLAUDE.md` sobre o que o `escurecer-tema.py` deixa para trás.
          */}
          <div className="cartao-simples p-3.5">
            <EtiquetaSeccao>Controlo de quotas · Época {seasonLabel}</EtiquetaSeccao>
            <p className="text-[11px] leading-relaxed text-white/62 mt-1.5">
              {fmtEuro(settings.quota_amount)} por mês · em atraso a partir do dia {settings.quota_due_day}.
            </p>
          </div>

          {quotaOverview.map(q => {
            const expanded = expandedPlayerId === q.player.id
            const barra = q.lateCount > 0
              ? BARRA_ATRASO
              : q.pendingCount > 0 ? BARRA_AVISO : BARRA_PAGO
            return (
              <div key={q.player.id} className="cartao-simples overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedPlayerId(expanded ? null : q.player.id)}
                  aria-expanded={expanded}
                  className={`w-full min-h-14 flex items-center gap-2.5 pl-2.5 pr-3.5 py-2.5 text-left cursor-pointer transition-colors
                    hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                      expanded ? 'bg-white/[0.06] border-b border-white/12' : ''
                    }`}
                >
                  <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full shrink-0 ${barra}`} />
                  <span className="w-8 h-8 rounded-full bg-csc-dark border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[11px] flex items-center justify-center shrink-0 tabular-nums">
                    {q.player.jersey_number || '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-extrabold text-[13px] text-white truncate">
                      {q.player.shirt_name || q.player.name}
                    </span>
                    <span className="block text-[10.5px] text-white/50 mt-0.5">
                      {q.paidCount} de {q.months.length} {q.months.length === 1 ? 'mês pago' : 'meses pagos'}
                    </span>
                  </span>

                  {q.lateCount > 0 ? (
                    <span className={CHIP_ATRASO}>{q.lateCount} em atraso</span>
                  ) : q.pendingCount > 0 ? (
                    <span className={CHIP_AVISO}>{q.pendingCount} por pagar</span>
                  ) : (
                    <span className={CHIP_PAGO}>em dia</span>
                  )}

                  <ChevronDown size={16} className={`shrink-0 text-white/50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="px-3.5 py-3">
                    <p className="text-[10.5px] leading-relaxed text-white/55 mb-2.5">
                      Toca num mês para o marcar como pago; toca outra vez para corrigir.
                    </p>
                    {/*
                      Grelha de três, e não uma fila que quebra onde calha: os
                      doze meses da época ficam em quatro linhas certas, e cada
                      pastilha tem os 44px de alvo de toque que a app exige —
                      tinham 30px.
                    */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {q.months.map(m => {
                        const isPaid = m.statusCalc === 'paid'
                        const isSaving = savingMonth === m.monthYear
                        return (
                          <button
                            key={m.monthYear}
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleToggleQuotaMonth(q.player.id, m)}
                            aria-label={`${nomeMes(m.month)} de ${m.year} — ${isPaid ? 'pago, tocar para corrigir' : 'por pagar, tocar para marcar como pago'}`}
                            className={`min-h-11 px-2 rounded-[14px] font-display font-extrabold text-[11px] border cursor-pointer
                              flex items-center justify-center gap-1 tabular-nums transition-colors
                              disabled:opacity-50 disabled:cursor-wait
                              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                isPaid
                                  ? 'bg-csc-light/15 border-csc-light/30 text-csc-verde-texto hover:bg-csc-red/12 hover:border-csc-red/35 hover:text-csc-vermelho-texto'
                                  : m.statusCalc === 'late'
                                    ? 'bg-csc-red/15 border-csc-red/35 text-csc-vermelho-texto hover:bg-csc-gold hover:border-csc-gold hover:text-csc-tinta'
                                    : 'bg-white/6 border-white/12 text-white/70 hover:bg-csc-gold hover:border-csc-gold hover:text-csc-tinta'
                              }`}
                          >
                            {nomeMes(m.month).slice(0, 3)}/{String(m.year).slice(2)}
                            {isPaid && <Check size={11} />}
                            {!isPaid && m.statusCalc === 'late' && <AlertTriangle size={11} />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {quotaOverview.length === 0 && (
            <p className="cartao-simples p-6 text-center text-[11.5px] text-white/62">
              Sem jogadores elegíveis para quota nesta época.
            </p>
          )}
        </div>
      )}

      {/* ================= ENCARGOS ================= */}
      {activeTab === 'charges' && (
        <div className="space-y-3">
          <div className="cartao-simples p-3.5 flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-csc-gold/15 text-csc-gold flex items-center justify-center shrink-0">
              <ShieldCheck size={17} />
            </span>
            <div className="min-w-0 flex-1">
              {/* O ícone era `text-csc-tinta` — tinta escura sobre fundo escuro. */}
              <EtiquetaSeccao>Encargos</EtiquetaSeccao>
              <p className="text-[11px] leading-relaxed text-white/62 mt-1.5">
                Cobranças a jogadores escolhidos — seguro, equipamento, inscrição ou viagem de torneio.
              </p>
            </div>
          </div>

          {isAdmin && incomeCategories.length === 0 && (
            <p className="cartao-simples bg-csc-gold/10 border-csc-gold/25 p-3.5 text-[11px] leading-relaxed text-csc-gold">
              Ainda não há nenhuma categoria marcada para receitas. Cria ou edita uma em
              Despesas/Receitas → Categorias, assinalando &quot;Também pode ser usada para receitas&quot;.
            </p>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={openNewChargeModal}
              disabled={incomeCategories.length === 0}
              title={incomeCategories.length === 0 ? 'Cria primeiro uma categoria que possa ser usada para receitas (aba Despesas/Receitas)' : undefined}
              className="w-full min-h-12 flex items-center justify-center gap-1.5 px-4 bg-csc-gold text-csc-tinta rounded-[22px]
                font-display font-extrabold text-[12px] cursor-pointer transition-transform duration-150 active:scale-97
                disabled:opacity-40 disabled:cursor-not-allowed
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <Plus size={15} />
              Novo encargo
            </button>
          )}

          {chargesWithStats.length === 0 ? (
            <p className="cartao-simples p-6 text-center text-[11.5px] text-white/62">
              Ainda não há encargos criados.
            </p>
          ) : (
            chargesWithStats.map(c => {
              const expanded = expandedChargeId === c.id
              const pct = c.totalExpected > 0 ? Math.min(100, Math.round((c.totalPaid / c.totalExpected) * 100)) : 0
              const barra = pct >= 100 ? BARRA_PAGO : pct > 0 ? BARRA_AVISO : BARRA_NEUTRA
              return (
                <div key={c.id} className="cartao-simples overflow-hidden">
                  {/*
                    O botão de abrir e os de editar/apagar são irmãos, e não uns
                    dentro do outro: um `<button>` aninhado noutro não é HTML
                    válido, e os de dentro eram `<span role="button">` de 26px,
                    metade do alvo de toque mínimo.
                  */}
                  <div className={`flex items-stretch ${expanded ? 'bg-white/[0.06] border-b border-white/12' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedChargeId(expanded ? null : c.id)}
                      aria-expanded={expanded}
                      className="flex-1 min-w-0 min-h-14 flex items-center gap-2.5 pl-2.5 pr-2 py-3 text-left cursor-pointer transition-colors
                        hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
                    >
                      <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full shrink-0 ${barra}`} />
                      <span className="min-w-0 flex-1">
                        {/*
                          O título leva a linha toda. Partilhava-a com a
                          pastilha de estado e, com o lápis e o caixote ao lado,
                          sobravam-lhe ~200px: "Seguro Desportivo 26/27" saía
                          "Seguro Despo…". A pastilha era de resto uma terceira
                          maneira de dizer o mesmo que a barra de cor à esquerda
                          e a barra de progresso — a contagem volta para a linha
                          de detalhe, a dourado.
                        */}
                        <span className="block font-display font-extrabold text-[13px] text-white truncate">
                          {c.title}
                        </span>

                        {/* Quebra em vez de cortar: com o chevron e os dois botões ao
                            lado, "· 3 participantes · prazo … · 2 por pagar" era o que
                            ficava sempre de fora. */}
                        <span className="block text-[10.5px] leading-snug text-white/50 mt-0.5">
                          {c.categoryName && <>{c.categoryName} · </>}
                          {fmtEuro(c.amount)}/jogador · {c.participantIds.length}{' '}
                          {c.participantIds.length === 1 ? 'participante' : 'participantes'}
                          {c.due_date && <> · prazo {new Date(c.due_date).toLocaleDateString('pt-PT')}</>}
                          {c.pendingCount > 0 && (
                            <span className="text-csc-gold font-bold"> · {c.pendingCount} por pagar</span>
                          )}
                        </span>

                        <span className="flex items-center gap-2 mt-2">
                          <span className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                            <span
                              className={`block h-full rounded-full ${pct >= 100 ? 'bg-csc-light' : 'bg-csc-gold'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="font-display font-black text-[10.5px] text-white/80 tabular-nums shrink-0">
                            {fmtEuro(c.totalPaid)} / {fmtEuro(c.totalExpected)}
                          </span>
                          {c.surplusAmount > 0 && (
                            <span className="font-display font-black text-[10px] text-csc-verde-texto tabular-nums shrink-0">
                              +{fmtEuro(c.surplusAmount)}
                            </span>
                          )}
                        </span>
                      </span>

                      <ChevronDown size={16} className={`shrink-0 text-white/50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                    </button>

                    {isAdmin && (
                      <div className="flex items-center gap-0.5 pr-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditChargeModal(c)}
                          aria-label={`Editar o encargo ${c.title}`}
                          title="Editar encargo"
                          className={`${BOTAO_LINHA} text-csc-azul-texto hover:bg-csc-blue/20`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setChargeToDelete(c.id)}
                          aria-label={`Apagar o encargo ${c.title}`}
                          title="Apagar encargo"
                          className={`${BOTAO_LINHA} text-csc-vermelho-texto hover:bg-csc-red/15`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {expanded && (
                    <div>
                      {c.participantIds.map(playerId => {
                        const p = players.find(pl => pl.id === playerId)
                        const payments = c.payments.filter(pay => pay.player_id === playerId)
                        const paidTotal = payments.reduce((s, pay) => s + pay.amount, 0)
                        const remaining = Math.max(0, c.amount - paidTotal)
                        const isPastDeadline = c.due_date ? new Date() > new Date(c.due_date) : false
                        const isPayingHere = payFormKey === `${c.id}:${playerId}`
                        const barraJogador = remaining <= 0
                          ? BARRA_PAGO
                          : paidTotal > 0 ? BARRA_AVISO : isPastDeadline ? BARRA_ATRASO : BARRA_NEUTRA
                        return (
                          <div
                            key={playerId}
                            className="flex gap-2.5 pl-2.5 pr-3 py-2.5 border-t border-white/7 first:border-t-0"
                          >
                            <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full shrink-0 ${barraJogador}`} />

                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-display font-extrabold text-[12.5px] text-white truncate flex-1 min-w-0">
                                  {p?.shirt_name || p?.name || 'Jogador'}
                                </span>
                                {remaining <= 0 ? (
                                  <span className={CHIP_PAGO}>
                                    pago{paidTotal > c.amount ? ` +${fmtEuro(paidTotal - c.amount)}` : ''}
                                  </span>
                                ) : paidTotal > 0 ? (
                                  <span className={CHIP_AVISO}>falta {fmtEuro(remaining)}</span>
                                ) : isPastDeadline ? (
                                  <span className={CHIP_ATRASO}>deve {fmtEuro(remaining)}</span>
                                ) : (
                                  <span className={CHIP_NEUTRO}>por pagar {fmtEuro(remaining)}</span>
                                )}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => isPayingHere ? setPayFormKey(null) : openPayForm(c.id, playerId)}
                                    aria-label={isPayingHere ? 'Cancelar o registo de pagamento' : `Registar pagamento de ${p?.shirt_name || p?.name || 'jogador'}`}
                                    className={`${BOTAO_LINHA} ${
                                      isPayingHere
                                        ? 'bg-white/10 text-white/70 hover:bg-white/15'
                                        : 'bg-csc-blue/15 text-csc-azul-texto hover:bg-csc-blue/25'
                                    }`}
                                  >
                                    {isPayingHere ? <X size={15} /> : <Plus size={15} />}
                                  </button>
                                )}
                              </div>

                              {payments.length > 0 && (
                                <div className="space-y-1">
                                  {payments.map(pay => (
                                    <div key={pay.id} className="flex items-center gap-2 text-[10.5px] text-white/55">
                                      {editingPaymentId === pay.id ? (
                                        <>
                                          <input type="number" step="0.01" aria-label="Valor" value={editPaymentAmount} onChange={e => setEditPaymentAmount(e.target.value)} className={`${CAMPO} w-20 px-2`} />
                                          <input type="date" aria-label="Data" value={editPaymentDate} onChange={e => setEditPaymentDate(e.target.value)} className={`${CAMPO} w-auto px-2`} />
                                          <button type="button" onClick={handleSaveEditedPayment} aria-label="Guardar a correção" className={`${BOTAO_LINHA} text-csc-verde-texto hover:bg-csc-light/15`}><Check size={15} /></button>
                                          <button type="button" onClick={() => setEditingPaymentId(null)} aria-label="Cancelar a correção" className={`${BOTAO_LINHA} text-white/60 hover:bg-white/10`}><X size={15} /></button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-display font-black text-white/85 tabular-nums">{fmtEuro(pay.amount)}</span>
                                          <span className="tabular-nums">{new Date(pay.paid_at).toLocaleDateString('pt-PT')}</span>
                                          {pay.notes && <span className="italic truncate">({pay.notes})</span>}
                                          {isAdmin && (
                                            <span className="ml-auto flex items-center shrink-0">
                                              <button type="button" onClick={() => startEditPayment(pay)} aria-label="Corrigir este pagamento" title="Corrigir valor" className={`${BOTAO_LINHA} text-csc-azul-texto hover:bg-csc-blue/20`}><Pencil size={13} /></button>
                                              <button type="button" onClick={() => setPaymentToDelete(pay.id)} aria-label="Apagar este pagamento" title="Apagar" className={`${BOTAO_LINHA} text-csc-vermelho-texto hover:bg-csc-red/15`}><Trash2 size={13} /></button>
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {isPayingHere && (
                                // flex-wrap + min-w-0 nas Notas: sem isto, num ecrã estreito o
                                // input flex-1 não encolhia (min-width:auto por omissão) e o
                                // botão Guardar saía do cartão, escondido pelo overflow-hidden
                                // do cartão do encargo — a linha passa a quebrar antes disso.
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <input type="number" step="0.01" aria-label="Valor do pagamento" placeholder="Valor (€)" value={payFormAmount} onChange={e => setPayFormAmount(e.target.value)} className={`${CAMPO} w-24 px-2 shrink-0`} />
                                  <input type="date" aria-label="Data do pagamento" value={payFormDate} onChange={e => setPayFormDate(e.target.value)} className={`${CAMPO} w-auto px-2 shrink-0`} />
                                  <input type="text" aria-label="Notas" placeholder="Notas (opcional)" value={payFormNotes} onChange={e => setPayFormNotes(e.target.value)} className={`${CAMPO} flex-1 min-w-[100px]`} />
                                  <button
                                    type="button"
                                    onClick={() => handleAddChargePayment(c.id, playerId)}
                                    className="min-h-11 px-4 bg-csc-gold text-csc-tinta rounded-[14px] font-display font-extrabold text-[11.5px] cursor-pointer shrink-0
                                      transition-transform duration-150 active:scale-97
                                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                  >
                                    Guardar
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* MODAL: Novo Encargo / Editar Encargo — moldura partilhada (Escape, prisão de foco, rodapé fixo) */}
      <Modal
        isOpen={isNewChargeModalOpen}
        onClose={guardaEncargo.tentarFechar}
        size="lg"
        headerStyle="brand"
        icon={<ShieldCheck size={18} className="text-csc-gold" />}
        title={editingChargeId ? 'Editar Encargo' : 'Novo Encargo'}
        closeOnOverlayClick={false}
        footer={
          <>
            <button
              type="button"
              onClick={guardaEncargo.tentarFechar}
              className="px-4 py-2 text-sm font-bold text-white/60 bg-white/10 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCharge}
              disabled={savingCharge}
              className="min-h-11 px-4 font-display font-extrabold text-[12px] text-csc-tinta bg-csc-gold rounded-[22px] transition-transform duration-150 active:scale-97 disabled:opacity-40 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              {savingCharge ? 'A guardar...' : editingChargeId ? 'Guardar Alterações' : 'Criar Encargo'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={ETIQUETA} htmlFor="encargo-titulo">Título *</label>
            <input id="encargo-titulo" type="text" value={newChargeTitle} onChange={e => setNewChargeTitle(e.target.value)} placeholder="Ex: Equipamento Inverno 2026, Viagem Torneio Faro" className={CAMPO} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETIQUETA} htmlFor="encargo-categoria">Categoria</label>
              <select id="encargo-categoria" value={newChargeCategoryId} onChange={e => handleChargeCategoryChange(e.target.value)} className={CAMPO}>
                {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="encargo-valor">Valor por jogador (€) *</label>
              <input id="encargo-valor" type="number" step="0.01" value={newChargeAmount} onChange={e => setNewChargeAmount(e.target.value)} placeholder="0.00" className={CAMPO} />
            </div>
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="encargo-prazo">Prazo (opcional)</label>
            <input id="encargo-prazo" type="date" value={newChargeDueDate} onChange={e => setNewChargeDueDate(e.target.value)} className={CAMPO} />
          </div>

          {/* Encargo-intermediário: o clube recebe isto dos jogadores mas tem de
              repassar a um terceiro (ex.: Seguro Desportivo → seguradora). Uma vez
              pago ao terceiro, fica bloqueado — tal como as tranches de inscrição
              em torneio já pagas. */}
          {(() => {
            const editingCharge = editingChargeId ? chargesWithStats.find(c => c.id === editingChargeId) : undefined
            const payableLocked = !!editingCharge?.payable_paid
            return (
              <div className="p-3 bg-white/6 border border-white/12 rounded-xl space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-white/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newChargeIsIntermediary}
                    disabled={payableLocked}
                    onChange={e => handleToggleChargeIntermediary(e.target.checked)}
                    className="w-4 h-4 text-csc-tinta rounded"
                  />
                  O clube funciona como intermediário (recebe dos jogadores e depois paga a um terceiro)
                </label>
                {newChargeIsIntermediary && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={ETIQUETA} htmlFor="encargo-payable-valor">Valor a pagar ao terceiro (€) *</label>
                      <input
                        id="encargo-payable-valor" type="number" step="0.01"
                        value={newChargePayableAmount}
                        disabled={payableLocked}
                        onChange={e => setNewChargePayableAmount(e.target.value)}
                        placeholder="0.00"
                        className={`${CAMPO} disabled:opacity-50`}
                      />
                    </div>
                    <div>
                      <label className={ETIQUETA} htmlFor="encargo-payable-prazo">Prazo de pagamento</label>
                      <input
                        id="encargo-payable-prazo" type="date"
                        value={newChargePayableDueDate}
                        disabled={payableLocked}
                        onChange={e => setNewChargePayableDueDate(e.target.value)}
                        className={`${CAMPO} disabled:opacity-50`}
                      />
                    </div>
                    <p className="col-span-2 text-[10px] text-white/62">
                      {payableLocked
                        ? 'Já pago ao terceiro.'
                        : 'Entra logo em Pagamentos Programados e na Previsão da Época, mesmo antes de ser pago.'}
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="block text-xs font-bold text-white/60">Jogadores participantes * ({newChargePlayerIds.size})</span>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setNewChargePlayerIds(new Set(activePlayers.map(p => p.id)))} className="text-[11px] font-bold text-csc-tinta hover:text-csc-light cursor-pointer">Todos os ativos</button>
                <button type="button" onClick={() => setNewChargePlayerIds(new Set())} className="text-[11px] font-bold text-white/62 hover:text-white/60 cursor-pointer">Limpar</button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border border-white/12 rounded-xl divide-y divide-white/8">
              {players.map(p => {
                const editingCharge = editingChargeId ? chargesWithStats.find(c => c.id === editingChargeId) : undefined
                const lockedIn = editingChargeId ? newChargePlayerIds.has(p.id) && chargeParticipantHasPayments(editingCharge, p.id) : false
                return (
                  <label key={p.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm text-white hover:bg-white/6 ${lockedIn ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={newChargePlayerIds.has(p.id)} disabled={lockedIn} onChange={() => toggleNewChargePlayer(p.id)} className={lockedIn ? '' : 'cursor-pointer'} />
                    <span className="truncate">{p.shirt_name || p.name}</span>
                    {lockedIn && <span className="text-[9px] text-white/62 ml-auto shrink-0" title="Já tem pagamentos registados — não pode ser removido">tem pagamentos</span>}
                    {!lockedIn && p.status === 'inactive' && <span className="text-[9px] text-white/62 ml-auto shrink-0">inativo</span>}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!chargeToDelete}
        title="Apagar Encargo"
        description="O encargo e todos os pagamentos já registados para ele são apagados."
        onConfirm={handleDeleteCharge}
        onCancel={() => setChargeToDelete(null)}
      />
      <ConfirmModal
        isOpen={!!paymentToDelete}
        title="Apagar Pagamento"
        description="Este pagamento é apagado e deixa de contar para o valor recebido deste encargo."
        onConfirm={handleDeletePayment}
        onCancel={() => setPaymentToDelete(null)}
      />

      {/* ================= DESPESAS ================= */}
      {activeTab === 'expenses' && (
        <div className="space-y-3">
          <div className="space-y-4 h-fit">
            <div className="cartao-simples text-white p-4">
              <h3 className={`${ETIQUETA_SECCAO} mb-3 flex items-center gap-2`}>
                <Receipt size={16} className="text-csc-gold" />
                <span>Registar Despesa/Receita</span>
              </h3>
              <form onSubmit={handleAddTransaction} className="space-y-3">
                <div>
                  <label className={ETIQUETA}>Descrição</label>
                  <input type="text" required value={txDesc} onChange={e => setTxDesc(e.target.value)} className={CAMPO} placeholder="Ex: Bolas novas" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={ETIQUETA}>Valor (€)</label>
                    <input type="number" step="0.01" required value={txAmount} onChange={e => setTxAmount(e.target.value)} className={CAMPO} placeholder="0.00" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Data</label>
                    <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)} className={CAMPO} />
                  </div>
                </div>
                <div>
                  <label className={ETIQUETA}>Tipo</label>
                  <select value={txType} onChange={e => handleTxTypeChange(e.target.value as 'income' | 'expense')} className={CAMPO}>
                    <option value="expense">Despesa (Saída)</option>
                    <option value="income">Receita (Entrada)</option>
                  </select>
                </div>
                <div>
                  {/* Numa receita só se oferecem as categorias marcadas com
                      "também pode ser usada para receitas" — é o que permite ver
                      o saldo de uma categoria (recebido − gasto) tender para zero. */}
                  <label className={ETIQUETA}>Categoria</label>
                  <select value={txCategoryId} onChange={e => setTxCategoryId(e.target.value)} className={CAMPO}>
                    <option value="">-- Sem categoria --</option>
                    {(txType === 'income' ? incomeCategories : categories).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {txType === 'income' && incomeCategories.length === 0 && (
                    <p className="text-[10px] text-white/62 mt-1">Nenhuma categoria aceita receitas — assinala "Também pode ser usada para receitas" numa categoria, abaixo.</p>
                  )}
                </div>
                <div>
                  <label className={ETIQUETA}>Documento comprovativo (opcional)</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => setTxFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full px-3 py-2 border border-white/15 rounded-xl text-[11px] bg-white/5 text-white/70 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-csc-gold file:text-csc-tinta"
                  />
                </div>
                <button type="submit" disabled={txSaving} className="w-full flex items-center justify-center gap-2 bg-csc-gold text-csc-tinta py-2.5 rounded-xl text-xs font-black hover:brightness-95 transition-colors cursor-pointer disabled:opacity-60">
                  <Plus size={16} />
                  <span>{txSaving ? 'A guardar...' : 'Registar'}</span>
                </button>
              </form>
            </div>
          </div>

          {pendingScheduledPayments.length > 0 && (
            <div className="cartao-simples text-white border-csc-gold/30 p-4">
              <h3 className={`${ETIQUETA_SECCAO} mb-3`}>Pagamentos Programados</h3>
              {/* A mesma lista da Visão Geral, e não uma segunda maneira de a
                  desenhar: aqui a linha abre o registo do pagamento. */}
              <PagamentosProgramados
                grupos={scheduledPaymentsByCategory}
                aoTocar={handlePayScheduled}
                accao="pagar"
              />
            </div>
          )}

          <div className="cartao-simples text-white p-4">
            <h3 className={`${ETIQUETA_SECCAO} mb-3`}>Últimas Despesas e Receitas</h3>
            <div className="space-y-2">
              {transactions.map(t => {
                const cat = categories.find(c => c.id === t.category_id)
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/5">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t.description}</p>
                      <p className="text-[10px] text-white/60 flex items-center gap-1.5 flex-wrap">
                        <span>{new Date(t.date).toLocaleDateString('pt-PT')}</span>
                        {cat ? <span className="px-1.5 py-0.5 rounded bg-white/10">{cat.name}</span> : t.type === 'income' && <span className="px-1.5 py-0.5 rounded bg-white/10">Receita</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className={`font-black text-sm ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>{t.type === 'income' ? '+' : '-'}{fmtEuro(t.amount)}</p>
                      {t.document_url && (
                        <button type="button" onClick={() => handleOpenDocument(t.document_url!)} title="Ver documento" className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 cursor-pointer transition-colors">
                          <Paperclip size={13} />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDeleteTransaction(t.id)} title="Eliminar" className="p-1.5 rounded-lg text-white/62 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
              {transactions.length === 0 && (
                <p className="text-xs text-white/60 py-6 text-center">Sem despesas ou receitas registadas.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MOVIMENTOS (relatório) ================= */}
      {activeTab === 'movements' && (
        <div className="cartao-simples text-white p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className={ETIQUETA_SECCAO}>Relatório de Movimentos</h3>
            <div className="flex items-center gap-2">
              <select value={movFilterMonth} onChange={e => setMovFilterMonth(e.target.value)} className={`${CAMPO} w-auto px-2.5`}>
                <option value="all">Todos os meses</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{nomeMes(m)}</option>
                ))}
              </select>
              <select value={movFilterYear} onChange={e => setMovFilterYear(e.target.value)} className={`${CAMPO} w-auto px-2.5`}>
                <option value="all">Todos os anos</option>
                {movementYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {groupedMovements.length === 0 ? (
            <p className="text-xs text-white/60 py-6 text-center">Sem movimentos registados{movFilterMonth !== 'all' || movFilterYear !== 'all' ? ' neste período' : ''}.</p>
          ) : (
            <div className="space-y-4">
              {groupedMovements.map(group => {
                const groupTotal = group.rows.reduce((s, m) => s + (m.type === 'income' ? m.amount : -m.amount), 0)
                const isCollapsed = collapsedMovCategories.has(group.key)
                return (
                  <div key={group.key} className="bg-white/[0.07] rounded-2xl border border-white/10 border-t-white/20 shadow-md shadow-black/20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleMovCategory(group.key)}
                      className="w-full px-4 py-2.5 bg-white/5 hover:bg-white/10 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <ChevronDown size={14} className={`text-white/60 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">{group.label}</h4>
                        <span className="text-[10px] font-bold text-white/62">({group.rows.length})</span>
                      </span>
                      <span className={`text-xs font-black ${groupTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {groupTotal >= 0 ? '+' : ''}{fmtEuro(groupTotal)}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <tbody className="divide-y divide-white/10">
                            {group.rows.map(m => (
                              <tr key={m.id}>
                                <td className="px-4 py-2 text-white/60 whitespace-nowrap">{new Date(m.date).toLocaleDateString('pt-PT')}</td>
                                <td className="px-4 py-2 font-bold text-white">{m.description}</td>
                                <td className={`px-4 py-2 text-right font-black whitespace-nowrap ${m.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {m.type === 'income' ? '+' : '-'}{fmtEuro(m.amount)}
                                </td>
                                <td className="px-4 py-2 text-right w-8">
                                  {m.documentUrl && (
                                    <button type="button" onClick={() => handleOpenDocument(m.documentUrl!)} className="text-csc-gold hover:brightness-110 cursor-pointer inline-flex items-center gap-1">
                                      <ExternalLink size={12} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Total Receitas</p>
              <p className="text-base font-black text-emerald-400">+{fmtEuro(filteredIncomeTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Total Despesas</p>
              <p className="text-base font-black text-red-400">-{fmtEuro(filteredExpenseTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Saldo</p>
              <p className="text-base font-black text-white">{fmtEuro(filteredIncomeTotal - filteredExpenseTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================= DEFINIÇÕES ================= */}
      {activeTab === 'settings' && isAdmin && (
        <div className="space-y-3">
        <div className="cartao-simples text-white p-4 space-y-4">
          <div>
            <h3 className={`${ETIQUETA_SECCAO} mb-3`}>Época Desportiva</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ETIQUETA}>Mês de Início</label>
                <select value={settingsForm.season_start_month} onChange={e => setSettingsForm(s => ({ ...s, season_start_month: Number(e.target.value) }))} className={CAMPO}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
                </select>
              </div>
              <div>
                <label className={ETIQUETA}>Mês de Fim</label>
                <select value={settingsForm.season_end_month} onChange={e => setSettingsForm(s => ({ ...s, season_end_month: Number(e.target.value) }))} className={CAMPO}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className={`${ETIQUETA_SECCAO} mb-3`}>Quotas</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={ETIQUETA}>Valor da Quota (€)</label>
                <input type="number" step="0.01" value={settingsForm.quota_amount} onChange={e => setSettingsForm(s => ({ ...s, quota_amount: Number(e.target.value) }))} className={CAMPO} />
              </div>
              <div>
                <label className={ETIQUETA}>Incumprimento a partir do dia</label>
                <input type="number" min={1} max={28} value={settingsForm.quota_due_day} onChange={e => setSettingsForm(s => ({ ...s, quota_due_day: Number(e.target.value) }))} className={CAMPO} />
              </div>
            </div>
            <label className={ETIQUETA}>Meses sem quota</label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const excluded = settingsForm.quota_excluded_months.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSettingsForm(s => ({
                      ...s,
                      quota_excluded_months: excluded ? s.quota_excluded_months.filter(x => x !== m) : [...s.quota_excluded_months, m],
                    }))}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                      excluded ? 'bg-red-500/20 border-red-400/40 text-red-300' : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    {nomeMes(m).slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </div>

          <button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="px-5 py-2.5 bg-csc-gold text-csc-tinta rounded-xl text-xs font-black hover:brightness-95 transition-all cursor-pointer disabled:opacity-60">
            {savingSettings ? 'A guardar...' : 'Guardar Definições'}
          </button>
        </div>

        {/* Categorias — bloco à parte, ao lado no desktop; gravam logo ao criar/apagar,
            sem passar pelo botão "Guardar Definições" do bloco anterior. */}
        <div className="cartao-simples text-white p-4">
          <h3 className={`${ETIQUETA_SECCAO} mb-3`}>Categorias</h3>
          <div className="flex gap-2 mb-2">
            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nova categoria" className={`${CAMPO} flex-1`} />
            <button type="button" onClick={handleAddCategory} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors">
              <Plus size={14} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-white/70 mb-3 cursor-pointer">
            <input type="checkbox" checked={newCategoryAllowIncome} onChange={e => setNewCategoryAllowIncome(e.target.checked)} className="cursor-pointer" />
            Também pode ser usada para receitas (ex.: Seguro, equipamento pago pelos jogadores)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {categories.map(c => (
              <span key={c.id} className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${c.allow_income ? 'bg-sky-400/20 text-sky-200' : 'bg-white/10 text-white/80'}`}>
                <button
                  type="button"
                  onClick={() => handleToggleCategoryIncome(c)}
                  className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                  title={c.allow_income ? 'Clica para deixar de poder ser usada para receitas' : 'Clica para também poder ser usada para receitas (ex.: Encargos)'}
                >
                  <span>{c.name}</span>
                  {c.allow_income && <span className="text-[9px] font-black uppercase text-sky-300">receita</span>}
                </button>
                <button type="button" onClick={() => handleDeleteCategory(c.id)} className="text-white/62 hover:text-red-400 cursor-pointer" title="Eliminar categoria">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
      )}

      <UnsavedChangesModal {...guardaEncargo.props} />
    </div>
  )
}

export default FinancePage
