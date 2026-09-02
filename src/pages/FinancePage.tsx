import React, { useEffect, useMemo, useState } from 'react'
import {
  Landmark, TrendingUp, TrendingDown, Plus, Settings, Wallet,
  ShieldCheck, Receipt, ListChecks, X, Paperclip, ExternalLink, Trash2, ChevronDown, Pencil, Check
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal } from '../components/Modal'
// O cálculo dos meses de quota e do seu estado deixou de ser feito aqui: vem
// das vistas v_quota_status e v_financial_movements. De finance.ts só sobra o
// que é regra de negócio pura — a época e o prazo do seguro.
import {
  DEFAULT_FINANCIAL_SETTINGS, getSeasonLabel, nomeMes, getInsuranceDeadline,
} from '../lib/finance'
import type { FinancialSettings, QuotaMonthStatus } from '../lib/finance'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PlayerRow {
  id: string
  name: string
  shirt_name?: string | null
  jersey_number?: number | null
  status?: string | null
  quota_start_date?: string | null
  quota_end_date?: string | null
  role: UserRole
  roles?: UserRole[] | null
}

// Linhas de public.v_quota_status — a matriz jogador × mês da época corrente.
// É aqui que existe a quota POR PAGAR: na tabela `dues` só há linha para as pagas.
interface QuotaStatusRow {
  player_id: string
  month_year: string
  expected_amount: number
  due_id: string | null
  paid_amount: number | null
  due_date: string
  status: 'paid' | 'late' | 'pending'
  owed_amount: number
}

// Linhas de public.v_financial_movements — o facto único do módulo: quotas,
// pagamentos de encargos e despesas/receitas avulsas, já com época, categoria
// e jogador resolvidos.
interface MovementRow {
  movement_id: string
  source: 'quota' | 'encargo' | 'avulso'
  entry_date: string
  season: string | null
  type: 'income' | 'expense'
  amount: number
  signed_amount: number
  description: string
  category_key: string
  category_label: string
  document_url: string | null
}

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

// Ordem categórica fixa — nunca ciclada — para as receitas por categoria. "Encargos"
// junta tudo o que é cobrado a jogadores fora das quotas (Seguro, equipamento,
// viagens, ...) — a repartição por encargo específico vê-se no separador Encargos
// e nos Movimentos, agrupados pela sua própria categoria.
const RECEITA_CATEGORIAS: { key: 'quotas' | 'charges' | 'other'; label: string; corBarra: string; corTexto: string }[] = [
  { key: 'quotas', label: 'Quotas', corBarra: 'bg-csc-light', corTexto: 'text-csc-light' },
  // csc-blue é escuro de mais para se distinguir do fundo verde-escuro do cartão — usa-se um azul mais claro só aqui.
  { key: 'charges', label: 'Encargos', corBarra: 'bg-sky-400', corTexto: 'text-sky-300' },
  { key: 'other', label: 'Outras Receitas', corBarra: 'bg-csc-gold', corTexto: 'text-csc-gold' },
]

// Ordem categórica fixa para despesas — a 6ª categoria em diante recolhe-se em "Outras".
const DESPESA_CORES = ['bg-red-500', 'bg-purple-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
const DESPESA_COR_OUTRAS = 'bg-gray-400'

const fmtEuro = (n: number) => `${n.toFixed(2)}€`

const FinancePage: React.FC = () => {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

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

      if (settingsData) setSettings(settingsData as FinancialSettings)
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
    const category = categories.find(cat => cat.id === c.category_id)
    return { ...c, participantIds, payments, totalExpected, totalPaid, categoryName: category?.name || null }
  }), [charges, chargePlayers, chargePayments, categories])

  const pendingChargesTotal = chargesWithStats.reduce((s, c) => s + Math.max(0, c.totalExpected - c.totalPaid), 0)

  const [expandedChargeId, setExpandedChargeId] = useState<string | null>(null)
  const [isNewChargeModalOpen, setIsNewChargeModalOpen] = useState(false)
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null)
  const [newChargeCategoryId, setNewChargeCategoryId] = useState('')
  const [newChargeTitle, setNewChargeTitle] = useState('')
  const [newChargeAmount, setNewChargeAmount] = useState('')
  const [newChargeDueDate, setNewChargeDueDate] = useState('')
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
    setNewChargePlayerIds(new Set(activePlayers.map(p => p.id)))
    setIsNewChargeModalOpen(true)
  }

  const fecharModalEncargo = () => {
    setIsNewChargeModalOpen(false)
    setEditingChargeId(null)
  }

  const openEditChargeModal = (c: (typeof chargesWithStats)[number]) => {
    setEditingChargeId(c.id)
    setNewChargeCategoryId(c.category_id || '')
    setNewChargeTitle(c.title)
    setNewChargeAmount(String(c.amount))
    setNewChargeDueDate(c.due_date ? c.due_date.slice(0, 10) : '')
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

  // Ao escolher a categoria "Seguro Desportivo" pré-preenche valor e prazo a
  // partir das Definições — só sugestões, não obrigam a nada.
  const handleChargeCategoryChange = (categoryId: string) => {
    setNewChargeCategoryId(categoryId)
    const cat = categories.find(c => c.id === categoryId)
    if (cat?.name === 'Seguro Desportivo') {
      if (!newChargeTitle.trim()) setNewChargeTitle(`Seguro Desportivo ${seasonLabel}`)
      if (!newChargeAmount) setNewChargeAmount(String(settings.insurance_amount))
      if (!newChargeDueDate) setNewChargeDueDate(getInsuranceDeadline(settings, seasonLabel).toISOString().split('T')[0])
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
    setSavingCharge(true)
    try {
      if (editingChargeId) {
        const { error } = await supabase.from('charges').update({
          category_id: newChargeCategoryId || null,
          title: newChargeTitle.trim(),
          amount: amt,
          due_date: newChargeDueDate || null,
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
      setTxDesc('')
      setTxAmount('')
      setTxCategoryId('')
      setTxFile(null)
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
  // Inscrições em Torneios — tranches por pagar (definidas em tournaments.rules)
  // -------------------------------------------------------------------------
  const pendingInstallments = useMemo(() => {
    const list: { tournamentId: string; tournamentName: string; index: number; amount: number; due_date: string }[] = []
    for (const t of tournaments) {
      const rf = t.rules?.registration_fee
      if (!rf?.installments) continue
      rf.installments.forEach((inst: any, idx: number) => {
        if (!inst.paid) list.push({ tournamentId: t.id, tournamentName: t.name, index: idx, amount: inst.amount, due_date: inst.due_date })
      })
    }
    return list.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  }, [tournaments])

  const handlePayInstallment = async (tournamentId: string, index: number, amount: number, tournamentName: string) => {
    try {
      const tournament = tournaments.find(t => t.id === tournamentId)
      const rf = tournament?.rules?.registration_fee
      if (!tournament || !rf) return

      const inscricoesCategory = categories.find(c => c.name === 'Inscrições em Torneios')
      const { data: txData, error: txError } = await supabase.from('transactions').insert([{
        type: 'expense',
        amount,
        description: `Inscrição ${tournamentName} — Tranche ${index + 1}`,
        date: new Date().toISOString().split('T')[0],
        category_id: inscricoesCategory?.id || null,
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

  // -------------------------------------------------------------------------
  // Definições
  // -------------------------------------------------------------------------
  const [settingsForm, setSettingsForm] = useState<FinancialSettings>(settings)
  useEffect(() => { setSettingsForm(settings) }, [settings])
  const [savingSettings, setSavingSettings] = useState(false)

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
  // movimentos — para não haver duas contas do mesmo número a divergir. Só o
  // que ainda está por receber (pendingChargesTotal) vem do detalhe dos
  // encargos, porque um valor em falta não é um movimento.
  const somaMovimentos = (filtro: (m: MovementRow) => boolean) =>
    movements.filter(filtro).reduce((s, m) => s + Number(m.amount), 0)

  const totalQuotasReceived = somaMovimentos(m => m.source === 'quota')
  const totalChargesReceived = somaMovimentos(m => m.source === 'encargo')
  const totalIncomeOther = somaMovimentos(m => m.source === 'avulso' && m.type === 'income')
  const totalExpenses = somaMovimentos(m => m.type === 'expense')
  const totalReceived = totalQuotasReceived + totalChargesReceived + totalIncomeOther
  const netBalance = totalReceived - totalExpenses

  const receitaPorCategoria = {
    quotas: totalQuotasReceived,
    charges: totalChargesReceived,
    other: totalIncomeOther,
  }
  const maxReceita = Math.max(1, ...Object.values(receitaPorCategoria))

  const despesaPorCategoria = useMemo(() => {
    const totals = new Map<string, number>()
    for (const m of movements) {
      if (m.type !== 'expense') continue
      totals.set(m.category_label, (totals.get(m.category_label) || 0) + Number(m.amount))
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    const restante = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
    if (restante > 0) top.push(['Outras', restante])
    return top
  }, [movements])
  const maxDespesa = Math.max(1, ...despesaPorCategoria.map(([, v]) => v))

  // Previsão: total de quotas que TODOS os jogadores elegíveis vão pagar esta
  // época (passadas + futuras) + o que falta receber dos encargos já criados
  // (valor por participante menos o que cada um já pagou) — ao contrário do
  // antigo seguro (uma estimativa às cegas para todos os ativos), isto é um
  // valor real, baseado nos encargos que já existem.
  const projectedQuotasTotal = quotaRows.reduce((sum, r) => sum + Number(r.expected_amount || 0), 0)
  const projectedSeasonTotal = projectedQuotasTotal + totalChargesReceived + pendingChargesTotal
  const receivedTowardsProjection = totalQuotasReceived + totalChargesReceived
  const projectionPct = projectedSeasonTotal > 0 ? Math.min(100, Math.round((receivedTowardsProjection / projectedSeasonTotal) * 100)) : 0

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Cabeçalho + Separadores */}
      <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-200 flex flex-wrap gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id ? 'bg-csc-dark text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.Icon size={14} className={activeTab === tab.id ? 'text-csc-gold' : ''} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-bold text-gray-500">Época financeira: <span className="text-gray-800">{seasonLabel}</span></p>
      </div>

      {/* ================= VISÃO GERAL ================= */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 border-l-4 ${netBalance >= 0 ? 'border-l-csc-gold' : 'border-l-red-400'} p-4 flex items-center justify-between`}>
              <div>
                <p className="text-xs font-bold text-white/70">Saldo Disponível</p>
                <p className={`text-2xl font-black mt-1 ${netBalance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtEuro(netBalance)}</p>
              </div>
              <div className="w-11 h-11 bg-white/10 text-csc-gold rounded-full flex items-center justify-center shrink-0">
                <Landmark size={22} />
              </div>
            </div>
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 border-l-4 border-l-emerald-400 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/70">Total Recebido</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">+{fmtEuro(totalReceived)}</p>
              </div>
              <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
                <TrendingUp size={22} />
              </div>
            </div>
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 border-l-4 border-l-red-400 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/70">Total Despesas</p>
                <p className="text-2xl font-black text-red-400 mt-1">-{fmtEuro(totalExpenses)}</p>
              </div>
              <div className="w-11 h-11 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center shrink-0">
                <TrendingDown size={22} />
              </div>
            </div>
          </div>

          {/* Previsão da Época + Situação de Quotas — lado a lado no desktop, para não
              alongar o ecrã num scroll só vertical de cartões largos com pouco conteúdo cada. */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <TrendingUp size={16} className="text-csc-gold" />
                <span>Previsão da Época {seasonLabel}</span>
              </h3>
              <p className="text-xs text-white/60">
                Considerando todas as quotas que cada jogador elegível vai pagar esta época e o seguro de todos os jogadores ativos.
              </p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Já Recebido (Quotas + Seguro)</p>
                  <p className="text-xl font-black text-emerald-400">{fmtEuro(receivedTowardsProjection)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Previsto até ao Fim da Época</p>
                  <p className="text-xl font-black text-csc-gold">{fmtEuro(projectedSeasonTotal)}</p>
                </div>
              </div>
              <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-csc-gold rounded-full transition-all" style={{ width: `${projectionPct}%` }} />
              </div>
              <p className="text-[11px] text-white/60">{projectionPct}% do valor previsto já foi recebido — faltam {fmtEuro(Math.max(0, projectedSeasonTotal - receivedTowardsProjection))}.</p>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-xs">
                <div>
                  <span className="text-white/60">Quotas previstas: </span>
                  <span className="font-bold text-white">{fmtEuro(projectedQuotasTotal)}</span>
                </div>
                <div>
                  <span className="text-white/60">Encargos por receber: </span>
                  <span className="font-bold text-white">{fmtEuro(pendingChargesTotal)}</span>
                </div>
              </div>
            </div>

            {/* Situação de Quotas — coluna estreita ao lado; estatísticas em linhas
                empilhadas (não grelha 3-colunas) porque a coluna aqui é mais estreita. */}
            <div className="lg:col-span-2 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-2.5">
              <h3 className="text-sm font-black text-white">Situação de Quotas dos Atletas</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-400/30 pl-3 pr-3.5 py-2 border-l-4 border-l-emerald-400">
                  <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">Meses Pagos</span>
                  <span className="text-lg font-black text-emerald-300">{quotaOverview.reduce((s, q) => s + q.paidCount, 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-400/30 pl-3 pr-3.5 py-2 border-l-4 border-l-amber-400">
                  <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">Meses Pendentes</span>
                  <span className="text-lg font-black text-amber-300">{quotaOverview.reduce((s, q) => s + q.pendingCount, 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-red-500/10 border border-red-400/30 pl-3 pr-3.5 py-2 border-l-4 border-l-red-400">
                  <span className="text-[10px] font-bold text-red-200 uppercase tracking-wider">Em Incumprimento</span>
                  <span className="text-lg font-black text-red-300">{quotaOverview.reduce((s, q) => s + q.lateCount, 0)}</span>
                </div>
              </div>
              {quotaOverview.filter(q => q.lateCount > 0).length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1.5">Atletas em Incumprimento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quotaOverview.filter(q => q.lateCount > 0).map(q => (
                      <span key={q.player.id} className="text-[11px] font-bold px-2 py-1 rounded-full bg-red-500/15 text-red-200 border border-red-400/30">
                        {q.player.shirt_name || q.player.name} ({q.lateCount})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Receita e despesa por categoria — lado a lado no desktop; a receita ocupa a
              largura toda quando ainda não há despesas com categoria para mostrar ao lado. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`${despesaPorCategoria.length === 0 ? 'lg:col-span-2' : ''} bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-3`}>
              <h3 className="text-sm font-black text-white">Valor Recebido por Categoria</h3>
              <div className="space-y-3">
                {RECEITA_CATEGORIAS.map(cat => {
                  const valor = receitaPorCategoria[cat.key]
                  const pct = Math.round((valor / maxReceita) * 100)
                  return (
                    <div key={cat.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-white/80">{cat.label}</span>
                        <span className={`font-black ${cat.corTexto}`}>{fmtEuro(valor)}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                        <div className={`h-full rounded-full ${cat.corBarra}`} style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs font-bold text-white/70">Total Recebido</span>
                <span className="text-lg font-black text-white">{fmtEuro(totalReceived)}</span>
              </div>
            </div>

            {/* Gráfico: Despesa por Categoria */}
            {despesaPorCategoria.length > 0 && (
              <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-3">
                <h3 className="text-sm font-black text-white">Despesa por Categoria</h3>
                <div className="space-y-3">
                  {despesaPorCategoria.map(([label, valor], idx) => {
                    const pct = Math.round((valor / maxDespesa) * 100)
                    const cor = label === 'Outras' ? DESPESA_COR_OUTRAS : (DESPESA_CORES[idx] || DESPESA_COR_OUTRAS)
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-white/80">{label}</span>
                          <span className="font-black text-white">{fmtEuro(valor)}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                          <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white/70">Total de Despesas</span>
                  <span className="text-lg font-black text-white">{fmtEuro(totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= QUOTAS ================= */}
      {activeTab === 'quotas' && (
        <div className="rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-csc-dark px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-black text-white">Controlo de Quotas — Época {seasonLabel}</h3>
            <span className="text-[11px] text-white/70">{fmtEuro(settings.quota_amount)}/mês · incumprimento a partir do dia {settings.quota_due_day}</span>
          </div>
          {/* Fundo cinzento para as fichas de cada jogador se destacarem como cartões
              elevados (sombra + faixa de cor do estado), em vez de linhas lisas sobre branco. */}
          <div className="bg-gray-100 p-3 space-y-2">
            {quotaOverview.map(q => {
              const expanded = expandedPlayerId === q.player.id
              const accent = q.lateCount > 0 ? 'border-l-red-400' : q.pendingCount > 0 ? 'border-l-amber-400' : 'border-l-emerald-400'
              return (
                <div
                  key={q.player.id}
                  className={`bg-white rounded-xl border border-gray-200 border-l-4 ${accent} transition-shadow ${expanded ? 'shadow-md ring-1 ring-csc-dark/10' : 'shadow-sm hover:shadow-md'}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedPlayerId(expanded ? null : q.player.id)}
                    className="w-full flex items-center justify-between gap-3 cursor-pointer px-3.5 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-csc-dark text-white text-xs font-black flex items-center justify-center shrink-0">
                        {q.player.jersey_number || '—'}
                      </span>
                      <span className="font-bold text-sm text-gray-900 truncate">{q.player.shirt_name || q.player.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {q.lateCount > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">{q.lateCount} em atraso</span>}
                      {q.pendingCount > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{q.pendingCount} pendentes</span>}
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{q.paidCount} pagos</span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-3.5 pb-3.5 pt-0.5 space-y-2 border-t border-gray-100 mt-0.5">
                      <p className="text-[10px] text-gray-400 pt-2.5">Clique num mês para marcar como pago; clique outra vez para corrigir. Pode selecionar vários meses seguidos.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.months.map(m => {
                          const isPaid = m.statusCalc === 'paid'
                          const isSaving = savingMonth === m.monthYear
                          return (
                            <button
                              key={m.monthYear}
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleToggleQuotaMonth(q.player.id, m)}
                              title={isPaid ? 'Clique para remover o pagamento' : 'Clique para marcar como pago'}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                                isPaid
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                                  : m.statusCalc === 'late'
                                    ? 'bg-red-50 border-red-300 text-red-700 hover:bg-csc-gold hover:border-csc-gold hover:text-csc-dark'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-csc-gold hover:border-csc-gold hover:text-csc-dark'
                              }`}
                            >
                              {nomeMes(m.month).slice(0, 3)}/{String(m.year).slice(2)} {isPaid ? '✓' : m.statusCalc === 'late' ? '⚠' : ''}
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
              <p className="text-xs text-gray-400 py-6 text-center">Sem jogadores elegíveis para quota nesta época.</p>
            )}
          </div>
        </div>
      )}

      {/* ================= ENCARGOS ================= */}
      {activeTab === 'charges' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <ShieldCheck size={16} className="text-csc-dark" />
                Encargos
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Cobranças a jogadores escolhidos — Seguro, equipamento, inscrição/viagem de torneio, etc.</p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={openNewChargeModal}
                disabled={incomeCategories.length === 0}
                title={incomeCategories.length === 0 ? 'Cria primeiro uma categoria que possa ser usada para receitas (aba Despesas/Receitas)' : undefined}
                className="flex items-center gap-1.5 px-4 py-2 bg-csc-dark text-white rounded-xl text-xs font-black hover:bg-csc-dark/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
                Novo Encargo
              </button>
            )}
          </div>

          {isAdmin && incomeCategories.length === 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Ainda não há nenhuma categoria marcada para receitas. Cria ou edita uma em Despesas/Receitas → Categorias, assinalando "Também pode ser usada para receitas".
            </p>
          )}

          {chargesWithStats.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
              Ainda não há encargos criados.
            </div>
          ) : (
            <div className="space-y-3">
              {chargesWithStats.map(c => {
                const expanded = expandedChargeId === c.id
                const pct = c.totalExpected > 0 ? Math.min(100, Math.round((c.totalPaid / c.totalExpected) * 100)) : 0
                return (
                  <div key={c.id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${pct >= 100 ? 'border-l-emerald-400' : pct > 0 ? 'border-l-csc-gold' : 'border-l-gray-300'} overflow-hidden`}>
                    <button
                      type="button"
                      onClick={() => setExpandedChargeId(expanded ? null : c.id)}
                      className="w-full px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ChevronDown size={16} className={`text-gray-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
                        <div className="min-w-0 text-left">
                          <p className="font-black text-sm text-gray-900 truncate">{c.title}</p>
                          <p className="text-[10px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                            {c.categoryName && <span className="px-1.5 py-0.5 rounded bg-gray-100">{c.categoryName}</span>}
                            <span>{fmtEuro(c.amount)}/jogador · {c.participantIds.length} {c.participantIds.length === 1 ? 'participante' : 'participantes'}</span>
                            {c.due_date && <span>· prazo {new Date(c.due_date).toLocaleDateString('pt-PT')}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs font-black text-gray-900">{fmtEuro(c.totalPaid)} / {fmtEuro(c.totalExpected)}</p>
                          <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1">
                            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-csc-gold'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        {isAdmin && (
                          <>
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); openEditChargeModal(c) }}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg cursor-pointer"
                              title="Editar encargo"
                            >
                              <Pencil size={14} />
                            </span>
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); setChargeToDelete(c.id) }}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="Apagar encargo"
                            >
                              <Trash2 size={14} />
                            </span>
                          </>
                        )}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-200 bg-gray-100 p-2 space-y-1.5">
                        {c.participantIds.map(playerId => {
                          const p = players.find(pl => pl.id === playerId)
                          const payments = c.payments.filter(pay => pay.player_id === playerId)
                          const paidTotal = payments.reduce((s, pay) => s + pay.amount, 0)
                          const remaining = Math.max(0, c.amount - paidTotal)
                          const isPastDeadline = c.due_date ? new Date() > new Date(c.due_date) : false
                          const isPayingHere = payFormKey === `${c.id}:${playerId}`
                          const accent = remaining <= 0 ? 'border-l-emerald-400' : paidTotal > 0 ? 'border-l-amber-400' : isPastDeadline ? 'border-l-red-400' : 'border-l-gray-300'
                          return (
                            <div key={playerId} className={`bg-white shadow-sm rounded-lg border border-gray-200 border-l-4 ${accent} px-3 py-2.5 space-y-2`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-gray-900 truncate">{p?.shirt_name || p?.name || 'Jogador'}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {remaining <= 0 ? (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Pago ({fmtEuro(paidTotal)})</span>
                                  ) : paidTotal > 0 ? (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Falta {fmtEuro(remaining)}</span>
                                  ) : (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isPastDeadline ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                                      {isPastDeadline ? `Em atraso — deve ${fmtEuro(remaining)}` : `Por pagar (${fmtEuro(remaining)})`}
                                    </span>
                                  )}
                                  {isAdmin && (
                                    <button type="button" onClick={() => isPayingHere ? setPayFormKey(null) : openPayForm(c.id, playerId)} className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer">
                                      {isPayingHere ? 'Cancelar' : '+ Pagamento'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {payments.length > 0 && (
                                <div className="space-y-1 pl-1">
                                  {payments.map(pay => (
                                    <div key={pay.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                                      {editingPaymentId === pay.id ? (
                                        <>
                                          <input type="number" step="0.01" value={editPaymentAmount} onChange={e => setEditPaymentAmount(e.target.value)} className="w-16 px-1.5 py-1 border border-gray-300 rounded-md text-xs bg-white text-gray-900" />
                                          <input type="date" value={editPaymentDate} onChange={e => setEditPaymentDate(e.target.value)} className="px-1.5 py-1 border border-gray-300 rounded-md text-xs bg-white text-gray-900" />
                                          <button type="button" onClick={handleSaveEditedPayment} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check size={12} /></button>
                                          <button type="button" onClick={() => setEditingPaymentId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded cursor-pointer"><X size={12} /></button>
                                        </>
                                      ) : (
                                        <>
                                          <span className="font-bold text-gray-700">{fmtEuro(pay.amount)}</span>
                                          <span>{new Date(pay.paid_at).toLocaleDateString('pt-PT')}</span>
                                          {pay.notes && <span className="italic truncate">({pay.notes})</span>}
                                          {isAdmin && (
                                            <span className="ml-auto flex items-center gap-1">
                                              <button type="button" onClick={() => startEditPayment(pay)} className="p-1 text-blue-500 hover:bg-blue-50 rounded cursor-pointer" title="Corrigir valor"><Pencil size={11} /></button>
                                              <button type="button" onClick={() => setPaymentToDelete(pay.id)} className="p-1 text-red-400 hover:bg-red-50 rounded cursor-pointer" title="Apagar"><Trash2 size={11} /></button>
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {isPayingHere && (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <input type="number" step="0.01" placeholder="Valor (€)" value={payFormAmount} onChange={e => setPayFormAmount(e.target.value)} className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-900" />
                                  <input type="date" value={payFormDate} onChange={e => setPayFormDate(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-900" />
                                  <input type="text" placeholder="Notas (opcional)" value={payFormNotes} onChange={e => setPayFormNotes(e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white text-gray-900" />
                                  <button type="button" onClick={() => handleAddChargePayment(c.id, playerId)} className="px-3 py-1.5 bg-csc-gold text-csc-dark rounded-lg text-xs font-black hover:brightness-95 cursor-pointer shrink-0">
                                    Guardar
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Novo Encargo / Editar Encargo — moldura partilhada (Escape, prisão de foco, rodapé fixo) */}
      <Modal
        isOpen={isNewChargeModalOpen}
        onClose={fecharModalEncargo}
        size="lg"
        headerStyle="brand"
        icon={<ShieldCheck size={18} className="text-csc-gold" />}
        title={editingChargeId ? 'Editar Encargo' : 'Novo Encargo'}
        closeOnOverlayClick={false}
        footer={
          <>
            <button
              type="button"
              onClick={fecharModalEncargo}
              className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveCharge}
              disabled={savingCharge}
              className="px-4 py-2 text-sm font-bold text-white bg-csc-dark rounded-xl hover:bg-csc-dark/90 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {savingCharge ? 'A guardar...' : editingChargeId ? 'Guardar Alterações' : 'Criar Encargo'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="encargo-titulo">Título *</label>
            <input id="encargo-titulo" type="text" value={newChargeTitle} onChange={e => setNewChargeTitle(e.target.value)} placeholder="Ex: Equipamento Inverno 2026, Viagem Torneio Faro" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="encargo-categoria">Categoria</label>
              <select id="encargo-categoria" value={newChargeCategoryId} onChange={e => handleChargeCategoryChange(e.target.value)} className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none">
                {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="encargo-valor">Valor por jogador (€) *</label>
              <input id="encargo-valor" type="number" step="0.01" value={newChargeAmount} onChange={e => setNewChargeAmount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="encargo-prazo">Prazo (opcional)</label>
            <input id="encargo-prazo" type="date" value={newChargeDueDate} onChange={e => setNewChargeDueDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none" />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="block text-xs font-bold text-gray-600">Jogadores participantes * ({newChargePlayerIds.size})</span>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setNewChargePlayerIds(new Set(activePlayers.map(p => p.id)))} className="text-[11px] font-bold text-csc-dark hover:text-csc-light cursor-pointer">Todos os ativos</button>
                <button type="button" onClick={() => setNewChargePlayerIds(new Set())} className="text-[11px] font-bold text-gray-400 hover:text-gray-600 cursor-pointer">Limpar</button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
              {players.map(p => {
                const editingCharge = editingChargeId ? chargesWithStats.find(c => c.id === editingChargeId) : undefined
                const lockedIn = editingChargeId ? newChargePlayerIds.has(p.id) && chargeParticipantHasPayments(editingCharge, p.id) : false
                return (
                  <label key={p.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 ${lockedIn ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={newChargePlayerIds.has(p.id)} disabled={lockedIn} onChange={() => toggleNewChargePlayer(p.id)} className={lockedIn ? '' : 'cursor-pointer'} />
                    <span className="truncate">{p.shirt_name || p.name}</span>
                    {lockedIn && <span className="text-[9px] text-gray-400 ml-auto shrink-0" title="Já tem pagamentos registados — não pode ser removido">tem pagamentos</span>}
                    {!lockedIn && p.status === 'inactive' && <span className="text-[9px] text-gray-400 ml-auto shrink-0">inativo</span>}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-4 h-fit">
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4">
              <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
                <Receipt size={16} className="text-csc-gold" />
                <span>Registar Despesa/Receita</span>
              </h3>
              <form onSubmit={handleAddTransaction} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Descrição</label>
                  <input type="text" required value={txDesc} onChange={e => setTxDesc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" placeholder="Ex: Bolas novas" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Valor (€)</label>
                    <input type="number" step="0.01" required value={txAmount} onChange={e => setTxAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Data</label>
                    <input type="date" required value={txDate} onChange={e => setTxDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Tipo</label>
                  <select value={txType} onChange={e => handleTxTypeChange(e.target.value as 'income' | 'expense')} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                    <option value="expense">Despesa (Saída)</option>
                    <option value="income">Receita (Entrada)</option>
                  </select>
                </div>
                <div>
                  {/* Numa receita só se oferecem as categorias marcadas com
                      "também pode ser usada para receitas" — é o que permite ver
                      o saldo de uma categoria (recebido − gasto) tender para zero. */}
                  <label className="block text-xs font-bold text-white/70 mb-1">Categoria</label>
                  <select value={txCategoryId} onChange={e => setTxCategoryId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                    <option value="">-- Sem categoria --</option>
                    {(txType === 'income' ? incomeCategories : categories).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {txType === 'income' && incomeCategories.length === 0 && (
                    <p className="text-[10px] text-white/50 mt-1">Nenhuma categoria aceita receitas — assinala "Também pode ser usada para receitas" numa categoria, abaixo.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Documento comprovativo (opcional)</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={e => setTxFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full px-3 py-2 border border-white/15 rounded-xl text-[11px] bg-white/5 text-white/70 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-csc-gold file:text-csc-dark"
                  />
                </div>
                <button type="submit" disabled={txSaving} className="w-full flex items-center justify-center gap-2 bg-csc-gold text-csc-dark py-2.5 rounded-xl text-xs font-black hover:brightness-95 transition-colors cursor-pointer disabled:opacity-60">
                  <Plus size={16} />
                  <span>{txSaving ? 'A guardar...' : 'Registar'}</span>
                </button>
              </form>
            </div>
          </div>

          {pendingInstallments.length > 0 && (
            <div className="lg:col-span-2 bg-csc-dark text-white rounded-2xl shadow-sm border border-amber-400/30 p-4">
              <h3 className="text-sm font-black text-white mb-3">Tranches de Inscrição em Torneios por Pagar</h3>
              <div className="space-y-2">
                {pendingInstallments.map(inst => (
                  <div key={`${inst.tournamentId}-${inst.index}`} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-400/20">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{inst.tournamentName} — Tranche {inst.index + 1}</p>
                      {inst.due_date && <p className="text-[10px] text-white/60">Prazo: {new Date(inst.due_date).toLocaleDateString('pt-PT')}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-black text-sm text-amber-300">{fmtEuro(inst.amount)}</span>
                      <button
                        type="button"
                        onClick={() => handlePayInstallment(inst.tournamentId, inst.index, inst.amount, inst.tournamentName)}
                        className="px-3 py-1.5 bg-csc-gold text-csc-dark rounded-lg text-[11px] font-black hover:brightness-95 transition-all cursor-pointer"
                      >
                        Registar Pagamento
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="lg:col-span-2 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4">
            <h3 className="text-sm font-black text-white mb-3">Últimas Despesas e Receitas</h3>
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
                      <button type="button" onClick={() => handleDeleteTransaction(t.id)} title="Eliminar" className="p-1.5 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors">
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
        <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-black text-white">Relatório de Movimentos</h3>
            <div className="flex items-center gap-2">
              <select value={movFilterMonth} onChange={e => setMovFilterMonth(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-bold text-gray-900">
                <option value="all">Todos os meses</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{nomeMes(m)}</option>
                ))}
              </select>
              <select value={movFilterYear} onChange={e => setMovFilterYear(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-bold text-gray-900">
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
                        <span className="text-[10px] font-bold text-white/40">({group.rows.length})</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-5xl items-start">
        <div className="lg:col-span-7 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-black text-white mb-3">Época Desportiva</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Mês de Início</label>
                <select value={settingsForm.season_start_month} onChange={e => setSettingsForm(s => ({ ...s, season_start_month: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Mês de Fim</label>
                <select value={settingsForm.season_end_month} onChange={e => setSettingsForm(s => ({ ...s, season_end_month: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-black text-white mb-3">Quotas</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Valor da Quota (€)</label>
                <input type="number" step="0.01" value={settingsForm.quota_amount} onChange={e => setSettingsForm(s => ({ ...s, quota_amount: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Incumprimento a partir do dia</label>
                <input type="number" min={1} max={28} value={settingsForm.quota_due_day} onChange={e => setSettingsForm(s => ({ ...s, quota_due_day: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>
            </div>
            <label className="block text-xs font-bold text-white/70 mb-1.5">Meses sem quota</label>
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

          <div>
            <h3 className="text-sm font-black text-white mb-1">Seguro Desportivo</h3>
            <p className="text-[11px] text-white/50 mb-3">Valores só de referência — pré-preenchem o encargo "Seguro Desportivo" quando o criares, em Encargos. Não cobram nada automaticamente.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Valor (€)</label>
                <input type="number" step="0.01" value={settingsForm.insurance_amount} onChange={e => setSettingsForm(s => ({ ...s, insurance_amount: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Prazo — Mês</label>
                <select value={settingsForm.insurance_deadline_month} onChange={e => setSettingsForm(s => ({ ...s, insurance_deadline_month: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{nomeMes(m)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Prazo — Dia</label>
                <input type="number" min={1} max={31} value={settingsForm.insurance_deadline_day} onChange={e => setSettingsForm(s => ({ ...s, insurance_deadline_day: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>
            </div>
          </div>

          <button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="px-5 py-2.5 bg-csc-gold text-csc-dark rounded-xl text-xs font-black hover:brightness-95 transition-all cursor-pointer disabled:opacity-60">
            {savingSettings ? 'A guardar...' : 'Guardar Definições'}
          </button>
        </div>

        {/* Categorias — bloco à parte, ao lado no desktop; gravam logo ao criar/apagar,
            sem passar pelo botão "Guardar Definições" do bloco anterior. */}
        <div className="lg:col-span-5 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-4">
          <h3 className="text-sm font-black text-white mb-3">Categorias</h3>
          <div className="flex gap-2 mb-2">
            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nova categoria" className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
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
                {c.name}
                {c.allow_income && <span className="text-[9px] font-black uppercase text-sky-300">receita</span>}
                <button type="button" onClick={() => handleDeleteCategory(c.id)} className="text-white/50 hover:text-red-400 cursor-pointer" title="Eliminar categoria">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

export default FinancePage
