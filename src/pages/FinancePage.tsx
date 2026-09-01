import React, { useEffect, useMemo, useState } from 'react'
import {
  Landmark, TrendingUp, TrendingDown, Plus, Settings, Wallet,
  ShieldCheck, Receipt, ListChecks, X, Paperclip, ExternalLink, Trash2, ChevronDown
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import {
  DEFAULT_FINANCIAL_SETTINGS,
  getSeasonLabel, getPlayerQuotaMonths,
  computeQuotaMonthStatus, getInsuranceDeadline, nomeMes,
} from '../lib/finance'
import type { FinancialSettings, SeasonMonth, QuotaMonthStatus } from '../lib/finance'

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
}

interface Due {
  id: string
  player_id: string
  month_year: string
  amount: number
  status: string
  paid_at?: string | null
}

interface InsurancePayment {
  id: string
  player_id: string
  season: string
  amount: number
  paid_at: string
  notes?: string | null
}

interface ExpenseCategory {
  id: string
  name: string
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

type TabId = 'overview' | 'quotas' | 'insurance' | 'expenses' | 'movements' | 'settings'

const TABS: { id: TabId; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'overview', label: 'Visão Geral', Icon: Landmark },
  { id: 'quotas', label: 'Quotas', Icon: ListChecks },
  { id: 'insurance', label: 'Seguro', Icon: ShieldCheck },
  { id: 'expenses', label: 'Despesas', Icon: Receipt },
  { id: 'movements', label: 'Movimentos', Icon: Wallet },
  { id: 'settings', label: 'Definições', Icon: Settings },
]

// Ordem categórica fixa — nunca ciclada — para as receitas por categoria.
const RECEITA_CATEGORIAS: { key: 'quotas' | 'insurance' | 'other'; label: string; corBarra: string; corTexto: string }[] = [
  { key: 'quotas', label: 'Quotas', corBarra: 'bg-csc-light', corTexto: 'text-csc-light' },
  // csc-blue é escuro de mais para se distinguir do fundo verde-escuro do cartão — usa-se um azul mais claro só aqui.
  { key: 'insurance', label: 'Seguro', corBarra: 'bg-sky-400', corTexto: 'text-sky-300' },
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
  const [dues, setDues] = useState<Due[]>([])
  const [insurancePayments, setInsurancePayments] = useState<InsurancePayment[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [
        { data: settingsData },
        { data: playersData },
        { data: duesData },
        { data: insuranceData },
        { data: transData },
        { data: catData },
        { data: tourData },
      ] = await Promise.all([
        supabase.from('financial_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('profiles').select('id, name, shirt_name, jersey_number, status, quota_start_date, quota_end_date').order('jersey_number', { ascending: true, nullsFirst: false }),
        supabase.from('dues').select('*'),
        supabase.from('insurance_payments').select('*'),
        supabase.from('transactions').select('*').order('date', { ascending: false }),
        supabase.from('expense_categories').select('*').order('name'),
        supabase.from('tournaments').select('id, name, season, rules'),
      ])

      if (settingsData) setSettings(settingsData as FinancialSettings)
      setPlayers((playersData || []) as PlayerRow[])
      setDues((duesData || []) as Due[])
      setInsurancePayments((insuranceData || []) as InsurancePayment[])
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
  const duesByPlayer = useMemo(() => {
    const map = new Map<string, Due[]>()
    for (const d of dues) {
      if (!map.has(d.player_id)) map.set(d.player_id, [])
      map.get(d.player_id)!.push(d)
    }
    return map
  }, [dues])

  interface PlayerQuotaOverview {
    player: PlayerRow
    months: (SeasonMonth & { statusCalc: 'paid' | 'late' | 'pending'; due?: Due })[]
    paidCount: number
    lateCount: number
    pendingCount: number
    totalOwed: number
    totalPaid: number
  }

  const quotaOverview: PlayerQuotaOverview[] = useMemo(() => {
    const today = new Date()
    return players.map(p => {
      const eligibleMonths = getPlayerQuotaMonths(p, settings, seasonLabel, today)
      const playerDues = duesByPlayer.get(p.id) || []
      const duesByMonth = new Map(playerDues.map(d => [d.month_year, d]))
      const months = eligibleMonths.map(m => {
        const due = duesByMonth.get(m.monthYear)
        return { ...m, due, statusCalc: computeQuotaMonthStatus(m, !!due, settings, today) }
      })
      const paidCount = months.filter(m => m.statusCalc === 'paid').length
      const lateCount = months.filter(m => m.statusCalc === 'late').length
      const pendingCount = months.filter(m => m.statusCalc === 'pending').length
      const totalPaid = months.reduce((sum, m) => sum + (m.due?.amount || 0), 0)
      const totalOwed = months.filter(m => m.statusCalc !== 'paid').reduce((sum) => sum + settings.quota_amount, 0)
      return { player: p, months, paidCount, lateCount, pendingCount, totalOwed, totalPaid }
    })
  }, [players, duesByPlayer, settings, seasonLabel])

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

  const handleToggleQuotaMonth = async (playerId: string, m: { monthYear: string; statusCalc: QuotaMonthStatus; due?: { id: string } | null }) => {
    setSavingMonth(m.monthYear)
    if (m.statusCalc === 'paid' && m.due) {
      await handleUnpayQuota(m.due.id)
    } else {
      await handlePayQuotas(playerId, [m.monthYear])
    }
    setSavingMonth(null)
  }

  // -------------------------------------------------------------------------
  // Seguro — pagamentos por jogador nesta época
  // -------------------------------------------------------------------------
  const insuranceByPlayer = useMemo(() => {
    const map = new Map<string, InsurancePayment[]>()
    for (const ip of insurancePayments) {
      if (ip.season !== seasonLabel) continue
      if (!map.has(ip.player_id)) map.set(ip.player_id, [])
      map.get(ip.player_id)!.push(ip)
    }
    return map
  }, [insurancePayments, seasonLabel])

  const insuranceDeadline = useMemo(() => getInsuranceDeadline(settings, seasonLabel), [settings, seasonLabel])

  const [insuranceFormPlayerId, setInsuranceFormPlayerId] = useState<string | null>(null)
  const [insuranceFormAmount, setInsuranceFormAmount] = useState('')
  const [insuranceFormDate, setInsuranceFormDate] = useState(new Date().toISOString().split('T')[0])
  const [insuranceFormNotes, setInsuranceFormNotes] = useState('')

  const handleAddInsurancePayment = async () => {
    if (!insuranceFormPlayerId) return
    const val = parseFloat(insuranceFormAmount)
    if (isNaN(val) || val <= 0) {
      toast.warning('Indica um valor válido.')
      return
    }
    try {
      const { error } = await supabase.from('insurance_payments').insert([{
        player_id: insuranceFormPlayerId,
        season: seasonLabel,
        amount: val,
        paid_at: insuranceFormDate,
        notes: insuranceFormNotes.trim() || null,
        created_by: profile?.id || null,
      }])
      if (error) throw error
      toast.success('Pagamento de seguro registado!')
      setInsuranceFormAmount('')
      setInsuranceFormNotes('')
      setInsuranceFormPlayerId(null)
      fetchAll()
    } catch (err: any) {
      toast.error('Erro ao registar pagamento de seguro: ' + (err.message || 'Erro'))
    }
  }

  // -------------------------------------------------------------------------
  // Despesas / Movimentos
  // -------------------------------------------------------------------------
  const [txType, setTxType] = useState<'income' | 'expense'>('expense')
  const [txDesc, setTxDesc] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txCategoryId, setTxCategoryId] = useState('')
  const [txFile, setTxFile] = useState<File | null>(null)
  const [txSaving, setTxSaving] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    try {
      const { error } = await supabase.from('expense_categories').insert([{ name }])
      if (error) throw error
      toast.success('Categoria criada!')
      setNewCategoryName('')
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
        category_id: txType === 'expense' ? (txCategoryId || null) : null,
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
  const totalIncomeOther = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalQuotasReceived = dues.reduce((s, d) => s + (d.amount || 0), 0)
  const totalInsuranceReceived = insurancePayments.reduce((s, ip) => s + ip.amount, 0)
  const totalReceived = totalQuotasReceived + totalInsuranceReceived + totalIncomeOther
  const netBalance = totalReceived - totalExpenses

  const receitaPorCategoria = {
    quotas: totalQuotasReceived,
    insurance: totalInsuranceReceived,
    other: totalIncomeOther,
  }
  const maxReceita = Math.max(1, ...Object.values(receitaPorCategoria))

  const despesaPorCategoria = useMemo(() => {
    const catNameById = new Map(categories.map(c => [c.id, c.name]))
    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const label = (t.category_id && catNameById.get(t.category_id)) || 'Sem categoria'
      totals.set(label, (totals.get(label) || 0) + t.amount)
    }
    const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    const restante = sorted.slice(5).reduce((s, [, v]) => s + v, 0)
    if (restante > 0) top.push(['Outras', restante])
    return top
  }, [transactions, categories])
  const maxDespesa = Math.max(1, ...despesaPorCategoria.map(([, v]) => v))

  // Previsão: total de quotas que TODOS os jogadores elegíveis vão pagar esta
  // época (passadas + futuras) + seguro esperado de todos os jogadores ativos,
  // quer já tenham pago quer não — é o valor que se espera encaixar no total.
  const projectedQuotasTotal = quotaOverview.reduce((sum, q) => sum + q.months.length * settings.quota_amount, 0)
  const activePlayers = players.filter(p => p.status !== 'inactive')
  const projectedInsuranceTotal = activePlayers.length * settings.insurance_amount
  const projectedSeasonTotal = projectedQuotasTotal + projectedInsuranceTotal
  const receivedTowardsProjection = totalQuotasReceived + totalInsuranceReceived
  const projectionPct = projectedSeasonTotal > 0 ? Math.min(100, Math.round((receivedTowardsProjection / projectedSeasonTotal) * 100)) : 0

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-12">
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
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/70">Saldo Disponível</p>
                <p className="text-2xl font-black text-white mt-1">{fmtEuro(netBalance)}</p>
              </div>
              <div className="w-11 h-11 bg-white/10 text-csc-gold rounded-full flex items-center justify-center shrink-0">
                <Landmark size={22} />
              </div>
            </div>
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/70">Total Recebido</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">+{fmtEuro(totalReceived)}</p>
              </div>
              <div className="w-11 h-11 bg-emerald-500/15 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
                <TrendingUp size={22} />
              </div>
            </div>
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/70">Total Despesas</p>
                <p className="text-2xl font-black text-red-400 mt-1">-{fmtEuro(totalExpenses)}</p>
              </div>
              <div className="w-11 h-11 bg-red-500/15 text-red-400 rounded-full flex items-center justify-center shrink-0">
                <TrendingDown size={22} />
              </div>
            </div>
          </div>

          {/* Previsão da Época */}
          <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-3">
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
                <span className="text-white/60">Seguro previsto ({activePlayers.length} atletas): </span>
                <span className="font-bold text-white">{fmtEuro(projectedInsuranceTotal)}</span>
              </div>
            </div>
          </div>

          {/* Gráfico: Receita por Categoria */}
          <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-3">
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
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-3">
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

          {/* Situações de incumprimento */}
          <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-3">
            <h3 className="text-sm font-black text-white">Situação de Quotas dos Atletas</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3">
                <p className="text-xl font-black text-emerald-300">{quotaOverview.reduce((s, q) => s + q.paidCount, 0)}</p>
                <p className="text-[10px] font-bold text-emerald-200 uppercase">Meses Pagos</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                <p className="text-xl font-black text-amber-300">{quotaOverview.reduce((s, q) => s + q.pendingCount, 0)}</p>
                <p className="text-[10px] font-bold text-amber-200 uppercase">Meses Pendentes</p>
              </div>
              <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3">
                <p className="text-xl font-black text-red-300">{quotaOverview.reduce((s, q) => s + q.lateCount, 0)}</p>
                <p className="text-[10px] font-bold text-red-200 uppercase">Em Incumprimento</p>
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
      )}

      {/* ================= QUOTAS ================= */}
      {activeTab === 'quotas' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Cabeçalho escuro — sem ele o cartão fica demasiado branco sobre o fundo cinza claro da página. */}
          <div className="bg-csc-dark px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-black text-white">Controlo de Quotas — Época {seasonLabel}</h3>
            <span className="text-[11px] text-white/70">{fmtEuro(settings.quota_amount)}/mês · incumprimento a partir do dia {settings.quota_due_day}</span>
          </div>
          <div className="p-5 divide-y divide-gray-100">
            {quotaOverview.map(q => {
              const expanded = expandedPlayerId === q.player.id
              return (
                <div key={q.player.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedPlayerId(expanded ? null : q.player.id)}
                    className="w-full flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-csc-dark/5 text-csc-dark text-xs font-black flex items-center justify-center shrink-0">
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
                    <div className="mt-3 space-y-2.5">
                      <p className="text-[10px] text-gray-400">Clique num mês para marcar como pago; clique outra vez para corrigir. Pode selecionar vários meses seguidos.</p>
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

      {/* ================= SEGURO ================= */}
      {activeTab === 'insurance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-3 h-fit">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-csc-gold" />
              <span>Registar Pagamento de Seguro</span>
            </h3>
            <p className="text-[11px] text-white/60">
              Valor da época: <strong className="text-white">{fmtEuro(settings.insurance_amount)}</strong> · prazo: <strong className="text-white">{insuranceDeadline.toLocaleDateString('pt-PT')}</strong>
            </p>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Jogador</label>
              <select
                value={insuranceFormPlayerId || ''}
                onChange={e => setInsuranceFormPlayerId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900"
              >
                <option value="">-- Seleciona um jogador --</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.shirt_name || p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Valor (€)</label>
                <input type="number" step="0.01" value={insuranceFormAmount} onChange={e => setInsuranceFormAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Data</label>
                <input type="date" value={insuranceFormDate} onChange={e => setInsuranceFormDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-white/70 mb-1">Notas (opcional)</label>
              <input type="text" value={insuranceFormNotes} onChange={e => setInsuranceFormNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" placeholder="Ex: 1ª tranche" />
            </div>
            <button
              type="button"
              onClick={handleAddInsurancePayment}
              className="w-full flex items-center justify-center gap-2 bg-csc-gold text-csc-dark py-2.5 rounded-xl text-xs font-black hover:brightness-95 transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>Registar Pagamento</span>
            </button>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-csc-dark px-5 py-3">
              <h3 className="text-sm font-black text-white">Estado do Seguro por Jogador — Época {seasonLabel}</h3>
            </div>
            <div className="p-5 divide-y divide-gray-100">
              {players.map(p => {
                const payments = insuranceByPlayer.get(p.id) || []
                const paidTotal = payments.reduce((s, ip) => s + ip.amount, 0)
                const remaining = Math.max(0, settings.insurance_amount - paidTotal)
                const isPastDeadline = new Date() > insuranceDeadline
                return (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900 truncate">{p.shirt_name || p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {remaining <= 0 ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Pago ({fmtEuro(paidTotal)})</span>
                      ) : paidTotal > 0 ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Falta {fmtEuro(remaining)} (pagou {fmtEuro(paidTotal)})</span>
                      ) : (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isPastDeadline ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isPastDeadline ? `Em atraso — deve ${fmtEuro(remaining)}` : `Por pagar (${fmtEuro(remaining)})`}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= DESPESAS ================= */}
      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-5 h-fit">
            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5">
              <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
                <Receipt size={16} className="text-csc-gold" />
                <span>Registar Despesa</span>
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
                  <select value={txType} onChange={e => setTxType(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                    <option value="expense">Despesa (Saída)</option>
                    <option value="income">Receita (Entrada)</option>
                  </select>
                </div>
                {txType === 'expense' && (
                  <div>
                    <label className="block text-xs font-bold text-white/70 mb-1">Categoria</label>
                    <select value={txCategoryId} onChange={e => setTxCategoryId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                      <option value="">-- Sem categoria --</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
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

            <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5">
              <h3 className="text-sm font-black text-white mb-3">Categorias de Despesa</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="Nova categoria" className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
                <button type="button" onClick={handleAddCategory} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors">
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map(c => (
                  <span key={c.id} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/10 text-white/80 flex items-center gap-1.5">
                    {c.name}
                    <button type="button" onClick={() => handleDeleteCategory(c.id)} className="text-white/50 hover:text-red-400 cursor-pointer" title="Eliminar categoria">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {pendingInstallments.length > 0 && (
            <div className="lg:col-span-2 bg-csc-dark text-white rounded-2xl shadow-sm border border-amber-400/30 p-5">
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

          <div className="lg:col-span-2 bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5">
            <h3 className="text-sm font-black text-white mb-3">Últimas Despesas</h3>
            <div className="space-y-2">
              {transactions.filter(t => t.type === 'expense').map(t => {
                const cat = categories.find(c => c.id === t.category_id)
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-white/5">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t.description}</p>
                      <p className="text-[10px] text-white/60 flex items-center gap-1.5 flex-wrap">
                        <span>{new Date(t.date).toLocaleDateString('pt-PT')}</span>
                        {cat && <span className="px-1.5 py-0.5 rounded bg-white/10">{cat.name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="font-black text-sm text-red-400">-{fmtEuro(t.amount)}</p>
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
              {transactions.filter(t => t.type === 'expense').length === 0 && (
                <p className="text-xs text-white/60 py-6 text-center">Sem despesas registadas.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MOVIMENTOS (relatório) ================= */}
      {activeTab === 'movements' && (
        <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5">
          <h3 className="text-sm font-black text-white mb-3">Relatório de Movimentos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-white/60 border-b border-white/10">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-right">Doc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {transactions.map(t => {
                  const cat = categories.find(c => c.id === t.category_id)
                  return (
                    <tr key={t.id}>
                      <td className="px-3 py-2.5 text-white/70">{new Date(t.date).toLocaleDateString('pt-PT')}</td>
                      <td className="px-3 py-2.5 font-bold text-white">{t.description}</td>
                      <td className="px-3 py-2.5 text-white/60">{cat?.name || (t.type === 'income' ? 'Receita' : '—')}</td>
                      <td className={`px-3 py-2.5 text-right font-black ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmtEuro(t.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {t.document_url && (
                          <button type="button" onClick={() => handleOpenDocument(t.document_url!)} className="text-csc-gold hover:brightness-110 cursor-pointer inline-flex items-center gap-1">
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {transactions.length === 0 && <p className="text-xs text-white/60 py-6 text-center">Sem movimentos registados.</p>}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Total Receitas</p>
              <p className="text-base font-black text-emerald-400">+{fmtEuro(totalReceived)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Total Despesas</p>
              <p className="text-base font-black text-red-400">-{fmtEuro(totalExpenses)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-white/60">Saldo</p>
              <p className="text-base font-black text-white">{fmtEuro(netBalance)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ================= DEFINIÇÕES ================= */}
      {activeTab === 'settings' && isAdmin && (
        <div className="bg-csc-dark text-white rounded-2xl shadow-sm border border-white/10 p-5 space-y-5 max-w-2xl">
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
            <h3 className="text-sm font-black text-white mb-3">Seguro Desportivo</h3>
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
      )}
    </div>
  )
}

export default FinancePage
