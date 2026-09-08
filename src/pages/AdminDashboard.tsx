import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { extractRolesFromProfile } from '../context/AuthContext'
import { LeagueManager } from '../components/LeagueManager'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { 
  Shield, 
  MapPin, 
  Trophy, 
  Trash2, 
  Building2, 
  Upload, 
  Save, 
  Edit2, 
  X, 
  ExternalLink,
  Plus,
  Search,
  Phone,
  User,
  ChevronDown,
} from 'lucide-react'
import { useClub } from '../context/ClubContext'
import { toast } from '../context/ToastContext'
import { ConfirmModal } from '../components/ConfirmModal'
import { useModalA11y } from '../hooks/useModalA11y'
import { useSearchParams } from 'react-router-dom'
import { CabecalhoEcra, Pastilha } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { FichaAdversario } from '../components/clube/FichaAdversario'
import { FichaCampo } from '../components/clube/FichaCampo'
import { formatClubSigla } from './CalendarPage'

/** Campo e etiqueta dos formulários, o mesmo desenho do resto da app. */
const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

// Interfaces
interface Field {
  id: string
  name: string
  address: string
}

interface Opponent {
  id: string
  name: string
  initials?: string
  logo_url?: string
  contact_name: string
  contact_phone: string
  home_field_id: string | null
}

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

interface Tournament {
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
const redistributeInstallments = (current: RegistrationInstallment[], total: number, n: number): RegistrationInstallment[] => {
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

type TabType = 'club' | 'fields' | 'opponents' | 'tournaments'

const AdminDashboard: React.FC = () => {
  const { clubSettings, refreshSettings } = useClub()
  const [params, setParams] = useSearchParams()
  
  // Club states
  const [clubName, setClubName] = useState('')
  const [clubInitials, setClubInitials] = useState('')
  const [clubHomeField, setClubHomeField] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)

  // Data states
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Search & Filter states
  const [fieldSearch, setFieldSearch] = useState('')
  const [oppSearch, setOppSearch] = useState('')
  const [tourSearch, setTourSearch] = useState('')
  const [tourStatusFilter, setTourStatusFilter] = useState<'all' | 'agendado' | 'ativo' | 'terminado'>('all')

  // Field Modal & Edit states
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [fieldName, setFieldName] = useState('')
  const [fieldAddress, setFieldAddress] = useState('')
  const [initialFieldState, setInitialFieldState] = useState({ name: '', address: '' })

  // Opponent Modal & Edit states
  const [isOppModalOpen, setIsOppModalOpen] = useState(false)
  const [editingOppId, setEditingOppId] = useState<string | null>(null)
  const [oppName, setOppName] = useState('')
  const [oppInitials, setOppInitials] = useState('')
  const [oppLogo, setOppLogo] = useState<File | null>(null)
  const [oppContact, setOppContact] = useState('')
  const [oppPhone, setOppPhone] = useState('')
  const [oppField, setOppField] = useState('')
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null)
  const [uploadingOppLogo, setUploadingOppLogo] = useState(false)
  const [initialOppState, setInitialOppState] = useState({
    name: '',
    initials: '',
    contact: '',
    phone: '',
    field: ''
  })

  // Tournament Modal & Edit states
  const [isTourModalOpen, setIsTourModalOpen] = useState(false)
  const [leagueManagerTournamentId, setLeagueManagerTournamentId] = useState<string | null>(null)
  const [editingTourId, setEditingTourId] = useState<string | null>(null)
  const [tourName, setTourName] = useState('')
  const [tourSeason, setTourSeason] = useState('')
  const [tourStatus, setTourStatus] = useState<'agendado' | 'ativo' | 'terminado'>('agendado')
  const [tourOrganizerName, setTourOrganizerName] = useState('')
  const [tourImage, setTourImage] = useState<File | null>(null)
  const [existingTourImageUrl, setExistingTourImageUrl] = useState<string | null>(null)
  const [uploadingTourImage, setUploadingTourImage] = useState(false)
  const [tourRules, setTourRules] = useState<TournamentRules>(DEFAULT_TOURNAMENT_RULES)
  const [tourPlayers, setTourPlayers] = useState<string[]>([])
  const [initialTourState, setInitialTourState] = useState({
    name: '',
    season: '',
    status: 'agendado' as 'agendado' | 'ativo' | 'terminado',
    organizerName: '',
    rules: DEFAULT_TOURNAMENT_RULES,
    players: [] as string[]
  })

  // Generic confirmation modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info' | 'success'
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  })

  // Unsaved changes confirmation modal
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false)
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null)
  const [pendingSaveAction, setPendingSaveAction] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    
    const [resFields, resOpps, resTours, resProfiles] = await Promise.all([
      supabase.from('fields').select('*').order('name'),
      supabase.from('opponents').select('*').order('name'),
      supabase.from('tournaments').select('*').order('created_at', { ascending: false }),
      supabase.from('v_players_public').select('id, name, shirt_name, jersey_number, birth_date, photo_url, position, role, roles').order('name')
    ])

    if (resFields.data) setFields(resFields.data)
    if (resOpps.data) setOpponents(resOpps.data)
    if (resTours.data) setTournaments(resTours.data)
    if (resProfiles.data) setProfiles(resProfiles.data)

    setLoading(false)
  }

  useEffect(() => {
    if (clubSettings) {
      setClubName(clubSettings.name)
      setClubInitials(clubSettings.initials)
      setClubHomeField(clubSettings.home_field_id || localStorage.getItem('csc_club_home_field_id') || '')
    }
  }, [clubSettings])

  // --- GOOGLE MAPS HELPER ---
  const getGoogleMapsUrl = (query: string) => {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
  }

  // --- CLUB ---
  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clubName || !clubInitials) {
      toast.warning('O nome e as siglas do clube são obrigatórios.')
      return
    }
    localStorage.setItem('csc_club_home_field_id', clubHomeField)
    try {
      const { error } = await supabase
        .from('club_settings')
        .update({ 
          name: clubName, 
          initials: clubInitials,
          home_field_id: clubHomeField || null
        })
        .eq('id', 1)

      if (!error) {
        toast.success('Definições do clube atualizadas com sucesso!')
        refreshSettings()
      } else {
        await supabase.from('club_settings').update({ name: clubName, initials: clubInitials }).eq('id', 1)
        toast.success('Definições do clube atualizadas!')
        refreshSettings()
      }
    } catch {
      toast.success('Definições do clube atualizadas!')
      refreshSettings()
    }
  }

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingLogo(true)
      if (!e.target.files || e.target.files.length === 0) return
      
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `logo_${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('club_assets')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('club_assets')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('club_settings')
        .update({ logo_url: publicUrl })
        .eq('id', 1)

      if (updateError) throw updateError

      toast.success('Símbolo atualizado com sucesso!')
      refreshSettings()
    } catch (error: any) {
      toast.error('Erro ao fazer upload do símbolo: ' + error.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  // --- FIELDS MODAL & LOGIC ---
  const isFieldDirty = () => {
    return fieldName !== initialFieldState.name || fieldAddress !== initialFieldState.address
  }

  const handleOpenCreateField = () => {
    setEditingFieldId(null)
    setFieldName('')
    setFieldAddress('')
    setInitialFieldState({ name: '', address: '' })
    setIsFieldModalOpen(true)
  }

  const handleStartEditField = (f: Field) => {
    setEditingFieldId(f.id)
    setFieldName(f.name)
    setFieldAddress(f.address || '')
    setInitialFieldState({ name: f.name, address: f.address || '' })
    setIsFieldModalOpen(true)
  }

  const handleRequestCloseFieldModal = () => {
    if (isFieldDirty()) {
      setPendingCloseAction(() => () => {
        setIsFieldModalOpen(false)
      })
      setPendingSaveAction(() => async () => {
        await executeSaveField()
      })
      setUnsavedModalOpen(true)
    } else {
      setIsFieldModalOpen(false)
    }
  }

  const executeSaveField = async () => {
    if (!fieldName.trim()) {
      toast.warning('O nome do campo é obrigatório.')
      return
    }

    if (editingFieldId) {
      const { error } = await supabase
        .from('fields')
        .update({ name: fieldName.trim(), address: fieldAddress.trim() })
        .eq('id', editingFieldId)

      if (error) {
        toast.error('Erro ao atualizar campo: ' + error.message)
      } else {
        toast.success('Campo atualizado com sucesso!')
        setIsFieldModalOpen(false)
        fetchData()
      }
    } else {
      const { error } = await supabase.from('fields').insert([{ name: fieldName.trim(), address: fieldAddress.trim() }])
      if (error) {
        toast.error('Erro ao criar campo: ' + error.message)
      } else {
        toast.success('Campo criado com sucesso!')
        setIsFieldModalOpen(false)
        fetchData()
      }
    }
  }

  const handleSaveFieldForm = async (e: React.FormEvent) => {
    e.preventDefault()
    await executeSaveField()
  }

  const handleDeleteField = (id: string, name: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Campo',
      description: `Tens a certeza que desejas eliminar o campo "${name}"?`,
      confirmText: 'Sim, Eliminar Campo',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('fields').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar campo: ' + error.message)
        } else {
          toast.success('Campo eliminado!')
          fetchData()
        }
      }
    })
  }

  // --- OPPONENTS MODAL & LOGIC ---
  const isOppDirty = () => {
    return (
      oppName !== initialOppState.name ||
      oppInitials !== initialOppState.initials ||
      oppContact !== initialOppState.contact ||
      oppPhone !== initialOppState.phone ||
      oppField !== initialOppState.field ||
      oppLogo !== null
    )
  }

  const handleOpenCreateOpponent = () => {
    setEditingOppId(null)
    setOppName('')
    setOppInitials('')
    setOppContact('')
    setOppPhone('')
    setOppField('')
    setExistingLogoUrl(null)
    setOppLogo(null)
    setInitialOppState({
      name: '',
      initials: '',
      contact: '',
      phone: '',
      field: ''
    })
    setIsOppModalOpen(true)
  }

  const handleStartEditOpponent = (o: Opponent) => {
    setEditingOppId(o.id)
    setOppName(o.name)
    setOppInitials(o.initials || '')
    setOppContact(o.contact_name || '')
    setOppPhone(o.contact_phone || '')
    setOppField(o.home_field_id || '')
    setExistingLogoUrl(o.logo_url || null)
    setOppLogo(null)
    setInitialOppState({
      name: o.name,
      initials: o.initials || '',
      contact: o.contact_name || '',
      phone: o.contact_phone || '',
      field: o.home_field_id || ''
    })
    setIsOppModalOpen(true)
  }

  const handleRequestCloseOppModal = () => {
    if (isOppDirty()) {
      setPendingCloseAction(() => () => {
        setIsOppModalOpen(false)
      })
      setPendingSaveAction(() => async () => {
        await executeSaveOpponent()
      })
      setUnsavedModalOpen(true)
    } else {
      setIsOppModalOpen(false)
    }
  }

  const executeSaveOpponent = async () => {
    if (!oppName.trim()) {
      toast.warning('O nome da equipa adversária é obrigatório.')
      return
    }

    setUploadingOppLogo(true)
    let publicLogoUrl: string | null = existingLogoUrl

    try {
      if (oppLogo) {
        const fileExt = oppLogo.name.split('.').pop()
        const fileName = `opp_${Math.random()}.${fileExt}`
        
        const { error: uploadError } = await supabase.storage
          .from('club_assets')
          .upload(fileName, oppLogo, { upsert: true })

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('club_assets').getPublicUrl(fileName)
        publicLogoUrl = data.publicUrl
      }

      const payload = {
        name: oppName.trim(),
        initials: oppInitials.trim() || null,
        logo_url: publicLogoUrl,
        contact_name: oppContact.trim(),
        contact_phone: oppPhone.trim(),
        home_field_id: oppField || null
      }

      if (editingOppId) {
        const { error } = await supabase.from('opponents').update(payload).eq('id', editingOppId)
        if (error) throw error
        toast.success('Adversário atualizado com sucesso!')
      } else {
        const { error } = await supabase.from('opponents').insert([payload])
        if (error) throw error
        toast.success('Adversário criado com sucesso!')
      }

      setIsOppModalOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error('Erro ao guardar adversário: ' + err.message)
    } finally {
      setUploadingOppLogo(false)
    }
  }

  const handleSaveOpponentForm = async (e: React.FormEvent) => {
    e.preventDefault()
    await executeSaveOpponent()
  }

  const handleDeleteOpponent = (id: string, name: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Adversário',
      description: `Tens a certeza que desejas eliminar o adversário "${name}"?`,
      confirmText: 'Sim, Eliminar Adversário',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('opponents').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar adversário: ' + error.message)
        } else {
          toast.success('Adversário eliminado!')
          fetchData()
        }
      }
    })
  }

  // --- TOURNAMENTS MODAL & LOGIC ---
  const isTourDirty = () => {
    const playersChanged = JSON.stringify([...tourPlayers].sort()) !== JSON.stringify([...initialTourState.players].sort())
    return (
      tourName !== initialTourState.name ||
      tourSeason !== initialTourState.season ||
      tourStatus !== initialTourState.status ||
      tourOrganizerName !== initialTourState.organizerName ||
      tourImage !== null ||
      JSON.stringify(tourRules) !== JSON.stringify(initialTourState.rules) ||
      playersChanged
    )
  }

  const handleOpenCreateTournament = () => {
    setEditingTourId(null)
    setTourName('')
    setTourSeason('')
    setTourStatus('agendado')
    setTourOrganizerName('')
    setTourImage(null)
    setExistingTourImageUrl(null)
    setTourRules(DEFAULT_TOURNAMENT_RULES)
    setTourPlayers([])
    setInitialTourState({ name: '', season: '', status: 'agendado', organizerName: '', rules: DEFAULT_TOURNAMENT_RULES, players: [] })
    setIsTourModalOpen(true)
  }

  const handleStartEditTournament = async (t: Tournament) => {
    setEditingTourId(t.id)
    setTourName(t.name)
    setTourSeason(t.season || '')
    setTourStatus(t.status)
    setTourOrganizerName(t.organizer_name || '')
    setTourImage(null)
    setExistingTourImageUrl(t.image_url || null)
    const currentRules = t.rules || DEFAULT_TOURNAMENT_RULES
    setTourRules(currentRules)

    setTourPlayers([])
    setInitialTourState({ name: t.name, season: t.season || '', status: t.status, organizerName: t.organizer_name || '', rules: currentRules, players: [] })
    setIsTourModalOpen(true)

    // Fetch players
    const { data: tpData } = await supabase.from('tournament_players').select('player_id').eq('tournament_id', t.id)
    if (tpData) {
      const pIds = tpData.map(row => row.player_id)
      setTourPlayers(pIds)
      setInitialTourState(prev => ({ ...prev, players: pIds }))
    }
  }

  const handleRequestCloseTourModal = () => {
    if (isTourDirty()) {
      setPendingCloseAction(() => () => {
        setIsTourModalOpen(false)
      })
      setPendingSaveAction(() => async () => {
        await executeSaveTournament()
      })
      setUnsavedModalOpen(true)
    } else {
      setIsTourModalOpen(false)
    }
  }

  // Garante uma categoria de despesa própria para a inscrição deste torneio —
  // criada uma única vez (reaproveita se já existir com o mesmo nome, já que
  // expense_categories.name é único: cobre reabrir o form sem gravar, ou
  // torneios com nomes repetidos). allow_income fica true para também se
  // poder criar um Encargo nesta categoria e cobrar aos jogadores.
  const ensureRegistrationFeeCategory = async (tournamentName: string): Promise<string | null> => {
    const catName = `Inscrição — ${tournamentName}`
    try {
      const { data: existing } = await supabase.from('expense_categories').select('id').eq('name', catName).maybeSingle()
      if (existing) return existing.id
      const { data, error } = await supabase.from('expense_categories').insert([{ name: catName, allow_income: true }]).select('id').single()
      if (error) throw error
      return data.id
    } catch (err) {
      console.error('Erro ao criar categoria de inscrição do torneio:', err)
      return null
    }
  }

  const executeSaveTournament = async () => {
    if (!tourName.trim()) {
      toast.warning('O nome da competição é obrigatório.')
      return
    }

    setUploadingTourImage(true)
    let publicImageUrl: string | null = existingTourImageUrl

    try {
      let rulesToSave = tourRules
      if (tourRules.registration_fee && !tourRules.registration_fee.category_id) {
        const categoryId = await ensureRegistrationFeeCategory(tourName.trim())
        if (categoryId) {
          rulesToSave = { ...tourRules, registration_fee: { ...tourRules.registration_fee, category_id: categoryId } }
        }
      }

      if (tourImage) {
        const fileExt = tourImage.name.split('.').pop()
        const fileName = `tournament_${Math.random()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('club_assets')
          .upload(fileName, tourImage, { upsert: true })

        if (uploadError) throw uploadError

        const { data } = supabase.storage.from('club_assets').getPublicUrl(fileName)
        publicImageUrl = data.publicUrl
      }

      const payload = {
        name: tourName.trim(),
        season: tourSeason.trim(),
        status: tourStatus,
        organizer_name: tourOrganizerName.trim() || null,
        image_url: publicImageUrl,
        rules: rulesToSave
      }

      if (editingTourId) {
        const { error } = await supabase.from('tournaments').update(payload).eq('id', editingTourId)
        if (error) throw error

        // Update players: remove all and reinsert (simple approach) or diff
        await supabase.from('tournament_players').delete().eq('tournament_id', editingTourId)
        if (tourPlayers.length > 0) {
          const inserts = tourPlayers.map(pid => ({ tournament_id: editingTourId, player_id: pid }))
          await supabase.from('tournament_players').insert(inserts)
        }

        toast.success('Torneio atualizado com sucesso!')
        setIsTourModalOpen(false)
        fetchData()
      } else {
        const { data, error } = await supabase.from('tournaments').insert([payload]).select().single()
        if (error) throw error

        if (data && tourPlayers.length > 0) {
          const inserts = tourPlayers.map(pid => ({ tournament_id: data.id, player_id: pid }))
          await supabase.from('tournament_players').insert(inserts)
        }
        toast.success('Torneio criado com sucesso!')
        setIsTourModalOpen(false)
        fetchData()
      }
    } catch (err: any) {
      toast.error('Erro ao guardar torneio: ' + (err.message || 'Erro'))
    } finally {
      setUploadingTourImage(false)
    }
  }

  const handleSaveTournamentForm = async (e: React.FormEvent) => {
    e.preventDefault()
    await executeSaveTournament()
  }

  const handleDeleteTournament = (id: string, name: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Torneio',
      description: `Tens a certeza que desejas eliminar o torneio "${name}"?`,
      confirmText: 'Sim, Eliminar Torneio',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('tournaments').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar torneio: ' + error.message)
        } else {
          toast.success('Torneio eliminado!')
          fetchData()
        }
      }
    })
  }

  // --- FILTERS ---
  const filteredFields = fields.filter(f => {
    const q = fieldSearch.toLowerCase().trim()
    if (!q) return true
    return (
      f.name.toLowerCase().includes(q) ||
      (f.address && f.address.toLowerCase().includes(q))
    )
  })

  const filteredOpponents = opponents.filter(o => {
    const q = oppSearch.toLowerCase().trim()
    if (!q) return true
    const homeField = fields.find(f => f.id === o.home_field_id)
    return (
      o.name.toLowerCase().includes(q) ||
      (o.initials && o.initials.toLowerCase().includes(q)) ||
      (o.contact_name && o.contact_name.toLowerCase().includes(q)) ||
      (o.contact_phone && o.contact_phone.includes(q)) ||
      (homeField && homeField.name.toLowerCase().includes(q))
    )
  })

  const filteredTournaments = tournaments.filter(t => {
    const q = tourSearch.toLowerCase().trim()
    const matchesQuery = !q || t.name.toLowerCase().includes(q) || (t.season && t.season.toLowerCase().includes(q))
    const matchesStatus = tourStatusFilter === 'all' || t.status === tourStatusFilter
    return matchesQuery && matchesStatus
  })

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.
  const painelCampoRef = useModalA11y({ isOpen: isFieldModalOpen, onClose: handleRequestCloseFieldModal })
  const painelAdversarioRef = useModalA11y({ isOpen: isOppModalOpen, onClose: handleRequestCloseOppModal })
  const painelTorneioRef = useModalA11y({ isOpen: isTourModalOpen, onClose: handleRequestCloseTourModal })

  /*
    O separador escolhido vai no endereço (`?ver=`), como na Competição: o
    Clube tem entradas separadas para "Dados do clube", "Adversários e
    campos" e "Torneios e jornadas", e sem isto as três caíam todas no
    primeiro separador. Também dá link próprio e faz o retroceder funcionar.
  */
  const verAtual = (params.get('ver') ?? '') as TabType
  const activeTab: TabType = (['club', 'fields', 'opponents', 'tournaments'] as const).includes(verAtual)
    ? verAtual
    : 'club'

  const setActiveTab = (seguinte: TabType) => {
    const seguintes = new URLSearchParams(params)
    seguintes.set('ver', seguinte)
    // `replace`: andar entre separadores não deve encher o histórico.
    setParams(seguintes, { replace: true })
  }

  /*
    As fichas do adversário (9h) e do campo (9i) vão no endereço, como o
    detalhe de evento e a ficha de atleta: `?adversario=<id>` e `?campo=<id>`.
    É o que lhes dá link próprio e faz o retroceder do browser fechá-las.

    Foi por causa disto que esta página deixou de ser `React.lazy` no
    `src/App.tsx` — ver o ponto 6 dos riscos no CLAUDE.md.
  */
  const adversarioAberto = opponents.find(o => o.id === params.get('adversario')) ?? null
  const campoAberto = fields.find(f => f.id === params.get('campo')) ?? null

  const abrirDetalhe = (chave: 'adversario' | 'campo', id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set(chave, id)
    setParams(seguintes)
  }

  const fecharDetalhe = (chave: 'adversario' | 'campo') => {
    const seguintes = new URLSearchParams(params)
    seguintes.delete(chave)
    setParams(seguintes, { replace: true })
  }

  const SEPARADORES: readonly { chave: TabType; etiqueta: string }[] = [
    { chave: 'club', etiqueta: 'Clube' },
    { chave: 'fields', etiqueta: `Campos (${fields.length})` },
    { chave: 'opponents', etiqueta: `Adversários (${opponents.length})` },
    { chave: 'tournaments', etiqueta: `Torneios (${tournaments.length})` },
  ]

  const TITULOS: Record<TabType, { titulo: string; sobrancelha: string }> = {
    club: { titulo: 'Dados do clube', sobrancelha: 'Nome, emblema e campo de casa' },
    fields: { titulo: 'Campos', sobrancelha: `${fields.length} ${fields.length === 1 ? 'campo' : 'campos'}` },
    opponents: { titulo: 'Adversários', sobrancelha: `${opponents.length} ${opponents.length === 1 ? 'clube' : 'clubes'}` },
    tournaments: { titulo: 'Torneios', sobrancelha: `${tournaments.length} ${tournaments.length === 1 ? 'prova' : 'provas'}` },
  }

  return (
    <div className="space-y-4">

      <CabecalhoEcra
        titulo={TITULOS[activeTab].titulo}
        sobrancelha={TITULOS[activeTab].sobrancelha}
        className="mb-3"
      />

      <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
        {SEPARADORES.map(s => (
          <Pastilha
            key={s.chave}
            ativa={activeTab === s.chave}
            onClick={() => { triggerHaptic('selection'); setActiveTab(s.chave) }}
            className="flex-none"
          >
            {s.etiqueta}
          </Pastilha>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 cartao-simples">
          <div className="animate-spin rounded-full h-9 w-9 border-t-2 border-b-2 border-csc-gold mb-3"></div>
          <p className="text-xs font-bold text-white/70">A carregar dados...</p>
        </div>
      ) : (
        <div>
          {/* ========================================================================= */}
          {/* TAB 1: CLUBE */}
          {/* ========================================================================= */}
          {activeTab === 'club' && (
            <div className="space-y-4">
              {/* Detalhes do Clube */}
              <div className="cartao-simples text-white p-4">
                <form onSubmit={handleUpdateClub} className="space-y-5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <Building2 size={20} className="text-csc-gold" />
                      <span>Identificação do Clube</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={ETIQUETA}>Nome Oficial *</label>
                      <input 
                        type="text" 
                        required 
                        value={clubName} 
                        onChange={e => setClubName(e.target.value)} 
                        className={CAMPO} 
                        placeholder="Ex: Grupo Dramático e Sportivo de Cascais" 
                      />
                    </div>
                    <div>
                      <label className={ETIQUETA}>Sigla / Abreviatura *</label>
                      <input 
                        type="text" 
                        required 
                        value={clubInitials} 
                        onChange={e => setClubInitials(e.target.value)} 
                        className={CAMPO} 
                        placeholder="Ex: CSC" 
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-black text-white/70 uppercase tracking-wider">Campo Habitual (Casa)</label>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('fields')
                          handleOpenCreateField()
                        }}
                        className="text-xs text-csc-gold font-black hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} /> Novo Campo
                      </button>
                    </div>
                    <select
                      value={clubHomeField}
                      onChange={e => setClubHomeField(e.target.value)}
                      className={CAMPO}
                    >
                      <option value="">-- Selecionar campo de casa --</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.address ? `(${f.address})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-white/70 mt-1.5 font-medium">Este campo é atribuído por omissão em novos jogos em casa e treinos.</p>
                  </div>

                  <div className="pt-2">
                    <button 
                      type="submit" 
                      className="w-full sm:w-auto px-6 py-3 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <Save size={17} className="text-csc-tinta" />
                      <span>Guardar Dados do Clube</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Símbolo do Clube */}
              <div className="cartao-simples text-white p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
                    <Shield size={18} className="text-csc-gold" />
                    <span>Emblema do Clube</span>
                  </h3>
                  <div className="my-6 flex justify-center">
                    <div className="w-36 h-36 bg-white/5 border-2 border-dashed border-white/15 rounded-2xl flex items-center justify-center overflow-hidden p-3 shadow-inner">
                      {clubSettings?.logo_url ? (
                        <img src={clubSettings.logo_url} alt="Símbolo CSC" className="w-full h-full object-contain" />
                      ) : (
                        <Shield size={48} className="text-white/20" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-white/70 text-center font-medium leading-relaxed">
                    Carregue o logótipo oficial do clube (formato PNG com transparência recomendado).
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-white/10">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadLogo}
                    disabled={uploadingLogo}
                    className="hidden"
                    id="club-logo-upload"
                  />
                  <label 
                    htmlFor="club-logo-upload"
                    className={`w-full py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all border shadow-xs ${
                      uploadingLogo 
                        ? 'bg-white/5 text-white/60 border-white/10 cursor-not-allowed' 
                        : 'bg-white/10 border-white/15 text-white hover:bg-white/20 active:scale-98'
                    }`}
                  >
                    {uploadingLogo ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-csc-dark"></div>
                        <span>A carregar imagem...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={15} className="text-csc-gold" />
                        <span>Carregar Novo Símbolo</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: CAMPOS (VISTA DE LISTAGEM ISOLADA) */}
          {/* ========================================================================= */}
          {activeTab === 'fields' && (
            <div className="space-y-4">
              {/* Barra de Filtros e Criação */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/62" />
                  <input
                    type="text"
                    value={fieldSearch}
                    onChange={e => setFieldSearch(e.target.value)}
                    placeholder="Pesquisar por nome ou morada do campo..."
                    className={`${CAMPO} pl-9.5`}
                  />
                  {fieldSearch && (
                    <button
                      onClick={() => setFieldSearch('')}
                      aria-label="Limpar pesquisa"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/62 hover:text-white/60"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreateField}
                  className="w-11 h-11 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Plus size={19} />
                  <span className="sr-only">Criar campo</span>
                </button>
              </div>

              {/* Lista de Campos */}
              <div className="cartao-simples text-white p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
                  <span>A apresentar {filteredFields.length} de {fields.length} campos registados</span>
                </div>

                {filteredFields.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <MapPin size={40} className="mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-sm text-white/70">Nenhum campo encontrado</p>
                    <p className="text-xs text-white/65 mt-0.5">Tente outro termo na pesquisa ou crie um novo campo.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {filteredFields.map(f => {
                      const mapsQuery = f.address ? `${f.name}, ${f.address}` : f.name
                      const mapsUrl = getGoogleMapsUrl(mapsQuery)
                      const isDefaultClubField = clubSettings?.home_field_id === f.id

                      return (
                        <div 
                          key={f.id} 
                          className="flex flex-col justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => abrirDetalhe('campo', f.id)}
                            aria-label={`Ver a ficha do campo ${f.name}`}
                            className="space-y-1 text-left min-h-11 cursor-pointer rounded-xl
                              transition-transform duration-150 active:scale-97
                              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                          >
                            <div className="flex items-center gap-2">
                              <MapPin size={14} className="text-csc-gold shrink-0" />
                              <h4 className="font-black text-sm text-white">{f.name}</h4>
                              {isDefaultClubField && (
                                <span className="bg-csc-dark text-csc-gold text-[10px] font-black px-2 py-0.5 rounded-full border border-csc-gold/30">
                                  Casa do CSC
                                </span>
                              )}
                            </div>
                            {f.address ? (
                              <p className="text-xs text-white/60 font-medium pl-6 leading-relaxed">{f.address}</p>
                            ) : (
                              <p className="text-xs text-white/65 italic pl-6">Sem morada definida</p>
                            )}
                          </button>

                          <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-1">
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-red-400 hover:text-red-300 text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                            >
                              <MapPin size={13} className="text-red-400 shrink-0" />
                              <span>Google Maps</span>
                              <ExternalLink size={10} className="opacity-50" />
                            </a>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleStartEditField(f)}
                                className="p-2 bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="Editar Campo"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteField(f.id, f.name)}
                                className="p-2 bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="Eliminar Campo"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: ADVERSÁRIOS (VISTA DE LISTAGEM ISOLADA) */}
          {/* ========================================================================= */}
          {activeTab === 'opponents' && (
            <div className="space-y-4">
              {/* Barra de Filtros e Criação */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/62" />
                  <input
                    type="text"
                    value={oppSearch}
                    onChange={e => setOppSearch(e.target.value)}
                    placeholder="Pesquisar por equipa, sigla, contacto ou campo..."
                    className={`${CAMPO} pl-9.5`}
                  />
                  {oppSearch && (
                    <button
                      onClick={() => setOppSearch('')}
                      aria-label="Limpar pesquisa"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/62 hover:text-white/60"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreateOpponent}
                  className="w-11 h-11 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Plus size={19} />
                  <span className="sr-only">Criar adversário</span>
                </button>
              </div>

              {/* Lista de Adversários */}
              <div className="cartao-simples text-white p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
                  <span>A apresentar {filteredOpponents.length} de {opponents.length} equipas registadas</span>
                </div>

                {filteredOpponents.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <Shield size={40} className="mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-sm text-white/70">Nenhum adversário encontrado</p>
                    <p className="text-xs text-white/65 mt-0.5">Tente outro filtro ou crie um novo adversário.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {filteredOpponents.map(o => {
                      const homeField = fields.find(f => f.id === o.home_field_id)
                      const mapsQuery = homeField ? (homeField.address ? `${homeField.name}, ${homeField.address}` : homeField.name) : o.name
                      const mapsUrl = getGoogleMapsUrl(mapsQuery)

                      return (
                        <div 
                          key={o.id} 
                          className="flex flex-col justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => abrirDetalhe('adversario', o.id)}
                            aria-label={`Ver a ficha do adversário ${o.name}`}
                            className="flex items-start gap-3.5 text-left w-full min-h-11 cursor-pointer rounded-xl
                              transition-transform duration-150 active:scale-97
                              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                          >
                            {o.logo_url ? (
                              <img 
                                src={o.logo_url} 
                                alt={o.name} 
                                className="w-13 h-13 object-contain bg-white rounded-xl border border-white/12 p-1.5 shadow-2xs shrink-0" 
                              />
                            ) : (
                              <div className="w-13 h-13 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center font-black text-white/70 text-sm shrink-0">
                                {o.initials || o.name.substring(0, 3).toUpperCase()}
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h4 className="font-black text-sm text-white truncate">
                                {o.name} {o.initials && <span className="text-white/70 font-semibold text-xs ml-1">({o.initials})</span>}
                              </h4>

                              {homeField && (
                                <p className="text-xs text-white/60 font-medium flex items-center gap-1 mt-1 truncate">
                                  <span className="text-white/62">Campo:</span>
                                  <span className="truncate">{homeField.name}</span>
                                </p>
                              )}

                              {/* O telefone era um `<a href="tel:">` dentro do que passou a
                                  ser o botão que abre a ficha — um interativo dentro de
                                  outro. Fica como texto; ligar faz-se na ficha (9h). */}
                              {(o.contact_name || o.contact_phone) && (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-white/60 font-medium">
                                  {o.contact_name && (
                                    <span className="flex items-center gap-1">
                                      <User size={12} className="text-white/65" />
                                      <span>{o.contact_name}</span>
                                    </span>
                                  )}
                                  {o.contact_phone && (
                                    <span className="flex items-center gap-1 text-csc-gold font-bold">
                                      <Phone size={12} className="text-csc-gold" />
                                      <span>{o.contact_phone}</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </button>

                          <div className="flex items-center justify-between pt-2.5 border-t border-white/10 mt-1">
                            {homeField ? (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-red-400 hover:text-red-300 text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                              >
                                <MapPin size={13} className="text-red-400 shrink-0" />
                                <span>Ver Campo</span>
                                <ExternalLink size={10} className="opacity-50" />
                              </a>
                            ) : (
                              <span className="text-[11px] text-white/65 italic">Sem campo associado</span>
                            )}

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleStartEditOpponent(o)}
                                className="p-2 bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="Editar Adversário"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteOpponent(o.id, o.name)}
                                className="p-2 bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                                title="Eliminar Adversário"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: TORNEIOS (VISTA DE LISTAGEM ISOLADA) */}
          {/* ========================================================================= */}
          {activeTab === 'tournaments' && (
            <div className="space-y-4">
              {/* Barra de Filtros e Criação */}
              <div className="flex items-center gap-2">
                {/*
                  `min-w-0` não é decoração: sem ele o `flex-1` não encolhe
                  abaixo da largura intrínseca do `<input>`, e o separador dos
                  torneios era o único do Backoffice a empurrar a página para
                  fora da janela estreita. Os dos campos e dos adversários já o
                  tinham. Os `sm:` saíram porque não geram nada — os pontos de
                  corte estão desligados no `@theme`.
                */}
                <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
                  <div className="relative w-full">
                    <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/62" />
                    <input
                      type="text"
                      value={tourSearch}
                      onChange={e => setTourSearch(e.target.value)}
                      placeholder="Pesquisar por nome ou época da competição..."
                      className={`${CAMPO} pl-9.5`}
                    />
                    {tourSearch && (
                      <button
                        onClick={() => setTourSearch('')}
                        aria-label="Limpar pesquisa"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/62 hover:text-white/60"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl w-full">
                    {(['all', 'ativo', 'agendado', 'terminado'] as const).map(st => (
                      <button
                        key={st}
                        onClick={() => setTourStatusFilter(st)}
                        className={`flex-1 min-h-11 px-3 rounded-lg text-xs font-black capitalize transition-all cursor-pointer ${
                          tourStatusFilter === st 
                            ? 'bg-white text-csc-tinta shadow-xs' 
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {st === 'all' ? 'Todos' : st}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreateTournament}
                  className="w-11 h-11 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  <Plus size={19} />
                  <span className="sr-only">Criar torneio</span>
                </button>
              </div>

              {/* Lista de Torneios */}
              <div className="cartao-simples text-white p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
                  <span>A apresentar {filteredTournaments.length} de {tournaments.length} torneios registados</span>
                </div>

                {filteredTournaments.length === 0 ? (
                  <div className="text-center py-12 text-white/60">
                    <Trophy size={40} className="mx-auto mb-2 opacity-60" />
                    <p className="font-bold text-sm text-white/70">Nenhum torneio encontrado</p>
                    <p className="text-xs text-white/65 mt-0.5">Tente alterar os filtros ou adicione uma nova competição.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {filteredTournaments.map(t => (
                      <div 
                        key={t.id} 
                        className="flex justify-between items-center p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Trophy size={17} className="text-csc-gold" />
                            <div>
                              <h4 className="font-black text-sm text-white">{t.name}</h4>
                              {t.season && (
                                <p className="text-xs text-white/70 font-semibold">Época: {t.season}</p>
                              )}
                            </div>
                          </div>
                          <div>
                            <span className={`inline-block text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                              t.status === 'ativo' ? 'bg-csc-light/15 text-csc-verde-texto border border-csc-light/35' :
                              t.status === 'terminado' ? 'bg-white/10 text-white/70' :
                              'bg-csc-gold/15 text-csc-gold border border-csc-gold/35'
                            }`}>
                              {t.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setLeagueManagerTournamentId(t.id)}
                            className="p-2 bg-white/10 border border-white/10 hover:border-blue-400 text-blue-300 hover:bg-blue-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="Gerir Grupos e Equipas"
                          >
                            <Shield size={14} />
                          </button>
                          <button
                            onClick={() => handleStartEditTournament(t)}
                            className="p-2 bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="Editar Regras e Detalhes"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteTournament(t.id, t.name)}
                            className="p-2 bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                            title="Eliminar Torneio"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CRIAR / EDITAR CAMPO */}
      {/* ========================================================================= */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            ref={painelCampoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-campo-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-lg rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MapPin size={22} className="text-csc-gold" />
                <h3 id="admin-campo-titulo" className="font-black text-lg">
                  {editingFieldId ? 'Editar Campo' : 'Criar Novo Campo'}
                </h3>
              </div>
              <button
                onClick={handleRequestCloseFieldModal}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleSaveFieldForm} className="p-6 space-y-4">
              <div>
                <label className={ETIQUETA}>
                  Nome do Campo *
                </label>
                <input
                  type="text"
                  required
                  value={fieldName}
                  onChange={e => setFieldName(e.target.value)}
                  placeholder="Ex: Estádio Municipal Dramático de Cascais"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA}>
                  Morada / Localização
                </label>
                <input
                  type="text"
                  value={fieldAddress}
                  onChange={e => setFieldAddress(e.target.value)}
                  placeholder="Ex: R. da Torre, 2750-760 Cascais"
                  className={CAMPO}
                />
                <p className="text-[11px] text-white/70 mt-1 font-medium">Usada para integração e navegação direta no Google Maps.</p>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleRequestCloseFieldModal}
                  className="px-5 py-2.5 border border-white/15 rounded-xl font-bold text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <Save size={16} className="text-csc-tinta" />
                  <span>{editingFieldId ? 'Atualizar Campo' : 'Guardar Campo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CRIAR / EDITAR ADVERSÁRIO */}
      {/* ========================================================================= */}
      {isOppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div
            ref={painelAdversarioRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-adversario-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-lg rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in my-8 outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield size={22} className="text-csc-gold" />
                <h3 id="admin-adversario-titulo" className="font-black text-lg">
                  {editingOppId ? 'Editar Adversário' : 'Criar Novo Adversário'}
                </h3>
              </div>
              <button
                onClick={handleRequestCloseOppModal}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleSaveOpponentForm} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className={ETIQUETA}>
                    Nome da Equipa *
                  </label>
                  <input
                    type="text"
                    required
                    value={oppName}
                    onChange={e => setOppName(e.target.value)}
                    placeholder="Ex: Grupo Desportivo Pescadores"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>
                    Siglas
                  </label>
                  <input
                    type="text"
                    value={oppInitials}
                    onChange={e => setOppInitials(e.target.value)}
                    placeholder="Ex: GDPCC"
                    className={CAMPO}
                  />
                </div>
              </div>

              <div>
                <label className={ETIQUETA}>
                  Símbolo (Logótipo)
                </label>
                {existingLogoUrl && !oppLogo && (
                  <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <img src={existingLogoUrl} alt="Logo Atual" className="w-10 h-10 object-contain p-1 bg-white rounded-lg border border-white/20" />
                    <span className="text-xs text-white/60 font-medium truncate flex-1">Símbolo atualmente guardado</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setOppLogo(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-4 py-2 border border-white/15 rounded-xl text-xs bg-white/5 text-white/70 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-csc-gold file:text-csc-tinta"
                />
              </div>

              <div>
                <label className={ETIQUETA}>
                  Campo Habitual
                </label>
                <select
                  value={oppField}
                  onChange={e => setOppField(e.target.value)}
                  className={CAMPO}
                >
                  <option value="">-- Nenhum campo habitual associado --</option>
                  {fields.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.address ? `(${f.address})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={ETIQUETA}>
                    Pessoa de Contacto
                  </label>
                  <input
                    type="text"
                    value={oppContact}
                    onChange={e => setOppContact(e.target.value)}
                    placeholder="Ex: Sr. Carlos Diretor"
                    className={`${CAMPO} h-auto py-3 leading-relaxed`}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={oppPhone}
                    onChange={e => setOppPhone(e.target.value)}
                    placeholder="Ex: 910 000 000"
                    className={`${CAMPO} h-auto py-3 leading-relaxed`}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleRequestCloseOppModal}
                  className="px-5 py-2.5 border border-white/15 rounded-xl font-bold text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingOppLogo}
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  {uploadingOppLogo ? (
                    <span>A enviar dados...</span>
                  ) : (
                    <>
                      <Save size={16} className="text-csc-tinta" />
                      <span>{editingOppId ? 'Atualizar Adversário' : 'Guardar Adversário'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {leagueManagerTournamentId && (
        <LeagueManager 
          tournamentId={leagueManagerTournamentId}
          onClose={() => setLeagueManagerTournamentId(null)}
        />
      )}

      {/* MODAL 3: CRIAR / EDITAR TORNEIO */}
      {/* ========================================================================= */}
      {isTourModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            ref={painelTorneioRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-torneio-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-3xl rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in flex flex-col max-h-[90vh] outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trophy size={22} className="text-csc-gold" />
                <h3 id="admin-torneio-titulo" className="font-black text-lg">
                  {editingTourId ? 'Editar Torneio' : 'Criar Novo Torneio'}
                </h3>
              </div>
              <button
                onClick={handleRequestCloseTourModal}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleSaveTournamentForm} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className={ETIQUETA}>
                  Nome da Competição *
                </label>
                <input
                  type="text"
                  required
                  value={tourName}
                  onChange={e => setTourName(e.target.value)}
                  placeholder="Ex: Liga Veteranos AF Lisboa"
                  className={CAMPO}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={ETIQUETA}>
                    Época Desportiva
                  </label>
                  <input
                    type="text"
                    value={tourSeason}
                    onChange={e => setTourSeason(e.target.value)}
                    placeholder="Ex: 2025/2026"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <label className={ETIQUETA}>
                    Estado do Torneio
                  </label>
                  <select
                    value={tourStatus}
                    onChange={e => setTourStatus(e.target.value as any)}
                    className={CAMPO}
                  >
                    <option value="agendado">Agendado</option>
                    <option value="ativo">Ativo (Em Curso)</option>
                    <option value="terminado">Terminado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={ETIQUETA}>
                  Empresa Organizadora
                </label>
                <input
                  type="text"
                  value={tourOrganizerName}
                  onChange={e => setTourOrganizerName(e.target.value)}
                  placeholder="Ex: Associação de Futebol de Lisboa"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA}>
                  Imagem do Torneio
                </label>
                {existingTourImageUrl && !tourImage && (
                  <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <img src={existingTourImageUrl} alt="Imagem Atual" className="w-10 h-10 object-contain p-1 bg-white rounded-lg border border-white/20" />
                    <span className="text-xs text-white/60 font-medium truncate flex-1">Imagem atualmente guardada</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setTourImage(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-4 py-2 border border-white/15 rounded-xl text-xs bg-white/5 text-white/70 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-csc-gold file:text-csc-tinta"
                />
                <p className="text-[11px] text-white/62 font-medium mt-1">Acompanha os ecrãs desta competição (Gestão da Liga, Classificações, badges de jogo).</p>
              </div>

              <details className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden group">
                <summary className="px-4 py-3 text-sm font-bold text-white/80 cursor-pointer flex justify-between items-center hover:bg-white/10 transition-colors">
                  <span>Regras da prova (opcional)</span>
                  <ChevronDown size={15} className="text-white/62 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-white/10 grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto">
                  
                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px]">Formato da Competição</h4>
                  <div className="col-span-1 sm:col-span-2">
                    <label className={ETIQUETA}>Modelo de Liga</label>
                    <select 
                      value={tourRules.format || 'single_league'} 
                      onChange={e => setTourRules({...tourRules, format: e.target.value as any})} 
                      className={CAMPO}
                    >
                      <option value="single_league">Liga Única (1 Fase)</option>
                      <option value="two_phases">2 Fases (Grupos + Fase Final)</option>
                    </select>
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Idades & Inscrições</h4>
                  <div>
                    <label className={ETIQUETA}>Idade Mínima</label>
                    <input type="number" min="0" value={tourRules.min_age} onChange={e => setTourRules({...tourRules, min_age: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Permitir Exceções</label>
                    <select value={tourRules.exceptions_allowed ? 'true' : 'false'} onChange={e => setTourRules({...tourRules, exceptions_allowed: e.target.value === 'true'})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white">
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>
                  <div>
                    <label className={ETIQUETA}>Máx. Exceções de Idade</label>
                    <input type="number" min="0" value={tourRules.exceptions_count} onChange={e => setTourRules({...tourRules, exceptions_count: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" disabled={!tourRules.exceptions_allowed} />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Idade Mín. da Exceção</label>
                    <input type="number" min="0" value={tourRules.exceptions_min_age} onChange={e => setTourRules({...tourRules, exceptions_min_age: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" disabled={!tourRules.exceptions_allowed} />
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Plantel & Convocatórias</h4>
                  <div>
                    <label className={ETIQUETA}>Máx. Inscritos (Plantel)</label>
                    <input type="number" min="0" value={tourRules.max_squad_size} onChange={e => setTourRules({...tourRules, max_squad_size: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Máx. Convocados / Jogo</label>
                    <input type="number" min="0" value={tourRules.max_match_players} onChange={e => setTourRules({...tourRules, max_match_players: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>

                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Duração do Jogo & Subs</h4>
                  <div>
                    <label className={ETIQUETA}>Duração Total (mins)</label>
                    <input type="number" min="0" value={tourRules.match_duration_mins} onChange={e => setTourRules({...tourRules, match_duration_mins: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Duração 1ª Parte (mins)</label>
                    <input type="number" min="0" value={tourRules.half_duration_mins} onChange={e => setTourRules({...tourRules, half_duration_mins: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  
                  <h4 className="col-span-1 sm:col-span-2 text-xs font-black text-white/62 uppercase tracking-wider mb-[-5px] mt-2">Disciplina & Sanções</h4>
                  <div>
                    <label className={ETIQUETA}>Amarelos para Suspensão</label>
                    <input type="number" min="0" value={tourRules.yellow_cards_to_suspension} onChange={e => setTourRules({...tourRules, yellow_cards_to_suspension: Number(e.target.value)})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" />
                  </div>
                  <div>
                    <label className={ETIQUETA}>Resultado p/ Falta Comp.</label>
                    <input type="text" value={tourRules.walkover_score} onChange={e => setTourRules({...tourRules, walkover_score: e.target.value})} className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white" placeholder="Ex: 5-0" />
                  </div>
                </div>
              </details>

              <details className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden group">
                <summary className="px-4 py-3 text-sm font-bold text-white/80 cursor-pointer flex justify-between items-center hover:bg-white/10 transition-colors">
                  <span>Inscrição na prova (opcional)</span>
                  <ChevronDown size={15} className="text-white/62 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 border-t border-white/10 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-white/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!tourRules.registration_fee}
                      onChange={e => setTourRules(prev => ({
                        ...prev,
                        registration_fee: e.target.checked
                          ? { total: 0, installments: [{ amount: 0, due_date: '', paid: false }] }
                          : undefined
                      }))}
                      className="w-4 h-4 text-csc-tinta rounded"
                    />
                    Esta prova tem valor de inscrição a pagar
                  </label>

                  {tourRules.registration_fee && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={ETIQUETA}>Valor Total (€)</label>
                          <input
                            key={editingTourId || 'new'}
                            type="number" min="0" step="0.01"
                            defaultValue={tourRules.registration_fee.total}
                            // Não controlado: o valor só é lido e gravado no estado quando se
                            // sai do campo (onBlur), não a cada tecla. Ligar o campo
                            // diretamente a um número controlado ("value={...Number(...)}")
                            // fazia-o "lutar" com o utilizador — apagar para escrever de novo
                            // ficava sempre preso a 0. A key muda por torneio para o campo
                            // reiniciar corretamente ao abrir para editar um torneio diferente.
                            onBlur={e => {
                              const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                              e.target.value = String(val)
                              setTourRules(prev => {
                                const rf = prev.registration_fee!
                                // Só reparte se o total mudou mesmo — sem isto, tocar no campo
                                // sem alterar o valor (ex.: só para confirmar) apagava ajustes
                                // manuais já feitos em tranches individuais.
                                if (val === rf.total) return prev
                                const installments = redistributeInstallments(rf.installments, val, rf.installments.length)
                                return { ...prev, registration_fee: { ...rf, total: val, installments } }
                              })
                            }}
                            className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className={ETIQUETA}>Nº de Tranches</label>
                          <input
                            key={editingTourId || 'new'}
                            type="number" min="1" max="6"
                            defaultValue={tourRules.registration_fee.installments.length}
                            onBlur={e => setTourRules(prev => {
                              const rf = prev.registration_fee!
                              const n = e.target.value === '' ? rf.installments.length : Math.max(1, Math.min(6, Number(e.target.value)))
                              e.target.value = String(n) // corrige visualmente se escreveu fora de 1–6
                              if (n === rf.installments.length) return prev
                              const installments = redistributeInstallments(rf.installments, rf.total, n)
                              return { ...prev, registration_fee: { ...rf, installments } }
                            })}
                            className="w-full px-3 py-1.5 border border-white/12 rounded-lg text-sm text-white"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-white/62 -mt-1">
                        Mudar o Valor Total ou o Nº de Tranches reparte o valor em partes iguais pelas tranches ainda por pagar. Depois disso, cada tranche pode ser ajustada à mão abaixo.
                      </p>

                      <div className="space-y-2">
                        {tourRules.registration_fee.installments.map((inst, idx) => (
                          <div key={idx} className="grid grid-cols-3 gap-2 items-end p-2.5 bg-white/6 rounded-lg border border-white/10">
                            <div>
                              <label className={ETIQUETA}>Tranche {idx + 1} — Valor (€)</label>
                              <input
                                // O valor entra na key: como o campo não é controlado (ver nota
                                // no Valor Total), sem isto o input não mostrava o valor
                                // recalculado quando o Total ou o Nº de Tranches mudavam — só
                                // remonta (e por isso só atualiza o que se vê) quando o valor
                                // desta tranche muda por essa via ou por edição própria.
                                key={`${editingTourId || 'new'}-${idx}-${inst.amount}`}
                                type="number" min="0" step="0.01"
                                defaultValue={inst.amount}
                                disabled={inst.paid}
                                onBlur={e => {
                                  const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                                  e.target.value = String(val)
                                  setTourRules(prev => {
                                    const rf = prev.registration_fee!
                                    const installments = rf.installments.map((it, i) => i === idx ? { ...it, amount: val } : it)
                                    return { ...prev, registration_fee: { ...rf, installments } }
                                  })
                                }}
                                className="w-full px-2.5 py-1.5 border border-white/12 rounded-lg text-xs text-white disabled:bg-white/10"
                              />
                            </div>
                            <div>
                              <label className={ETIQUETA}>Prazo</label>
                              <input
                                type="date"
                                value={inst.due_date}
                                disabled={inst.paid}
                                onChange={e => setTourRules(prev => {
                                  const rf = prev.registration_fee!
                                  const installments = rf.installments.map((it, i) => i === idx ? { ...it, due_date: e.target.value } : it)
                                  return { ...prev, registration_fee: { ...rf, installments } }
                                })}
                                className="w-full px-2.5 py-1.5 border border-white/12 rounded-lg text-xs text-white disabled:bg-white/10"
                              />
                            </div>
                            <div className="text-xs font-bold">
                              {inst.paid ? (
                                <span className="text-csc-verde-texto bg-csc-light/10 px-2 py-1 rounded-lg border border-csc-light/25">✓ Paga</span>
                              ) : (
                                <span className="text-csc-gold bg-csc-gold/10 px-2 py-1 rounded-lg border border-csc-gold/25">Por pagar</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-white/62">
                        Ao guardar, cria-se automaticamente a categoria de despesa "Inscrição — {tourName.trim() || 'nome do torneio'}". O valor total já entra na previsão financeira antes de ser pago, e cada tranche pode ser paga depois na página Financeiro & Quotas.
                      </p>
                    </>
                  )}
                </div>
              </details>

              {editingTourId ? (
                <div className="mt-4 border border-white/10 rounded-xl bg-white/5 overflow-hidden flex flex-col max-h-[350px]">
                  <div className="px-4 py-3 bg-white/10 border-b border-white/10 flex justify-between items-center">
                    <div>
                      <h4 className="text-sm font-bold text-white">Plantel Inscrito</h4>
                      <p className="text-[10px] text-white/70 uppercase font-bold tracking-wider mt-0.5">
                        {tourPlayers.length} / {tourRules.max_squad_size} Inscritos
                      </p>
                    </div>
                  </div>
                  <div className="p-3 overflow-y-auto space-y-2 flex-1">
                    {(() => {
                      const currentExceptionsCount = tourPlayers.filter(pid => {
                        const pData = profiles.find(pr => pr.id === pid)
                        if (!pData) return false
                        const pAge = pData.birth_date ? Math.floor((new Date().getTime() - new Date(pData.birth_date).getTime()) / 3.15576e+10) : null
                        return pAge !== null && pAge < (tourRules.min_age || 0)
                      }).length

                      // Só quem tem o papel de Jogador é elegível para inscrição em torneio —
                      // membros só Treinador ou só Direção não entram nesta lista.
                      return profiles.filter(p => extractRolesFromProfile(p).includes('player')).map(p => {
                        const age = p.birth_date ? Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10) : null
                        const isTooYoung = age !== null && age < (tourRules.min_age || 0)
                        const isExceptionButValid = isTooYoung && tourRules.exceptions_allowed && age >= tourRules.exceptions_min_age
                        
                        // Disable if too young and exceptions not allowed, or too young and under the min exception age
                        let isInvalid = isTooYoung && !isExceptionButValid
                        const isSelected = tourPlayers.includes(p.id)

                        // If not selected, too young (but valid exception), and we already reached the max exceptions limit, block selection
                        if (!isSelected && isExceptionButValid && currentExceptionsCount >= (tourRules.exceptions_count || 0)) {
                          isInvalid = true
                        }
                        const playerPositions = p.position ? p.position.split(',').map((pos: string) => pos.trim()).filter(Boolean) : []

                        return (
                          <label key={p.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${isSelected ? 'border-csc-light/45 bg-csc-light/15' : 'border-white/12 bg-white/5'} ${isInvalid ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'} transition-colors`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 overflow-hidden shrink-0 flex items-center justify-center">
                                <span className="font-display text-sm font-black text-csc-gold">{p.jersey_number || '-'}</span>
                              </div>
                              <div>
                                <p className="text-xs font-black text-white">{p.shirt_name || p.name}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {age !== null && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isTooYoung ? (isExceptionButValid ? 'bg-csc-gold/15 text-csc-gold' : 'bg-csc-red/15 text-csc-vermelho-texto') : 'bg-csc-light/16 text-csc-verde-texto'}`}>
                                      {age} anos
                                    </span>
                                  )}
                                  {playerPositions.map((pos: string, idx: number) => (
                                    <span key={idx} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-csc-blue/20 text-csc-azul-texto">
                                      {pos}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isInvalid}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    if (tourPlayers.length >= tourRules.max_squad_size) {
                                      toast.warning(`Limite de plantel (${tourRules.max_squad_size}) atingido!`)
                                      return
                                    }
                                    if (isExceptionButValid && currentExceptionsCount >= (tourRules.exceptions_count || 0)) {
                                      toast.warning(`Limite de exceções de idade (${tourRules.exceptions_count || 0}) atingido!`)
                                      return
                                    }
                                    setTourPlayers(prev => [...prev, p.id])
                                  } else {
                                    setTourPlayers(prev => prev.filter(id => id !== p.id))
                                  }
                                }}
                                className="w-4 h-4 text-csc-tinta border-white/15 rounded focus:ring-csc-dark"
                              />
                            </div>
                          </label>
                        )
                      })
                    })()}
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-4 border border-blue-400/30 bg-blue-500/10 rounded-xl text-center">
                  <p className="text-xs font-bold text-blue-300">Guarda o torneio primeiro para poderes inscrever o plantel da tua equipa.</p>
                </div>
              )}

              <div className="pt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleRequestCloseTourModal}
                  className="px-5 py-2.5 border border-white/15 rounded-xl font-bold text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingTourImage}
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-60"
                >
                  <Save size={16} className="text-csc-tinta" />
                  <span>{uploadingTourImage ? 'A guardar...' : editingTourId ? 'Atualizar Torneio' : 'Guardar Torneio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alterações por guardar — o mesmo diálogo das restantes páginas do painel */}
      <UnsavedChangesModal
        isOpen={unsavedModalOpen}
        onSaveAndExit={async () => {
          setUnsavedModalOpen(false)
          if (pendingSaveAction) await pendingSaveAction()
        }}
        onExitWithoutSaving={() => {
          setUnsavedModalOpen(false)
          if (pendingCloseAction) pendingCloseAction()
        }}
        onCancel={() => setUnsavedModalOpen(false)}
      />

      {/* Modal Genérico de Confirmação (Estilo Unificado e Elegante) */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        confirmText={confirmModalConfig.confirmText}
        cancelText={confirmModalConfig.cancelText}
        variant={confirmModalConfig.variant}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Ficha do adversário (9h) e ficha do campo (9i), ambas no endereço. */}
      <FichaAdversario
        adversario={adversarioAberto}
        campoPrincipal={
          adversarioAberto ? (fields.find(f => f.id === adversarioAberto.home_field_id) ?? null) : null
        }
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={() => fecharDetalhe('adversario')}
        aoEditar={() => {
          if (!adversarioAberto) return
          const alvo = adversarioAberto
          fecharDetalhe('adversario')
          handleStartEditOpponent(alvo)
        }}
        aoEliminar={() => {
          if (!adversarioAberto) return
          const alvo = adversarioAberto
          fecharDetalhe('adversario')
          handleDeleteOpponent(alvo.id, alvo.name)
        }}
      />

      <FichaCampo
        campo={campoAberto}
        eCampoDoClube={Boolean(campoAberto && clubSettings?.home_field_id === campoAberto.id)}
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={() => fecharDetalhe('campo')}
        aoEditar={() => {
          if (!campoAberto) return
          const alvo = campoAberto
          fecharDetalhe('campo')
          handleStartEditField(alvo)
        }}
        aoEliminar={() => {
          if (!campoAberto) return
          const alvo = campoAberto
          fecharDetalhe('campo')
          handleDeleteField(alvo.id, alvo.name)
        }}
      />
    </div>
  )
}

export default AdminDashboard
