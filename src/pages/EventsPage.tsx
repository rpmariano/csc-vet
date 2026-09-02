import React, { useEffect, useRef, useState } from 'react'
import { 
  Plus, 
  Trash2, 
  MapPin, 
  Clock, 
  Check, 
  Users, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  X, 
  UserPlus, 
  Search, 
  RotateCcw, 
  ExternalLink, 
  Repeat, 
  CalendarRange, 
  Calendar,
  Sparkles,
  PartyPopper,
  Trophy,
  Edit,
  Send,
  AlertTriangle
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { QuickFieldModal } from '../components/QuickFieldModal'
import { QuickOpponentModal } from '../components/QuickOpponentModal'
import { ResendCallupsModal } from '../components/ResendCallupsModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { MatchReportModal, parseMatchReportMetadata, buildDescriptionWithMatchReport } from '../components/MatchReportModal'
import { QuorumFilterCards } from '../components/callups/QuorumFilterCards'
import { CallupRow } from '../components/callups/CallupRow'
import { toast } from '../context/ToastContext'
import { formatClubSigla, formatOpponentSigla, hasMatchReport } from './CalendarPage'
import { useModalA11y } from '../hooks/useModalA11y'
import { useEhDesktop } from '../hooks/useEhDesktop'
import { VistaDetalhe } from '../components/VistaDetalhe'
import { useSearchParams } from 'react-router-dom'

export const getPlayerDisplayName = (player?: { name?: string; shirt_name?: string | null; nickname?: string | null } | null): string => {
  if (!player) return 'Atleta'
  const shirt = player.shirt_name?.trim()
  if (shirt) return shirt
  const nick = player.nickname?.trim()
  if (nick) return nick
  return player.name || 'Atleta'
}

const ordenarPlantel = (remoteProfiles: Profile[]): Profile[] => {
  // A base de dados é a única fonte do plantel. Até agosto de 2026 esta função
  // fundia os perfis do Supabase com uma lista de sementes em src/data/initialPlayers.ts,
  // ficheiro que continha dados pessoais reais (NIF, IBAN, morada) e que por isso ia
  // parar ao JavaScript servido publicamente. Foi removido.
  return [...remoteProfiles].sort((a, b) => {
    if (a.jersey_number && b.jersey_number) return a.jersey_number - b.jersey_number
    if (a.jersey_number) return -1
    if (b.jersey_number) return 1
    return getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b))
  })
}

const ensurePlayerIdsForSupabase = async (pIds: string[], _playerList: Profile[]): Promise<string[]> => {
  // Antes de agosto de 2026 o plantel vinha de uma lista embutida no código e os
  // atletas ainda não registados circulavam com IDs falsos ("seed-3"). Esta função
  // traduzia-os para UUIDs reais, criando o perfil na base de dados se preciso.
  // O plantel passou a vir todo do Supabase, logo todos os IDs já são UUIDs reais:
  // resta filtrar vazios e duplicados.
  return Array.from(new Set(pIds.filter((id): id is string => Boolean(id) && typeof id === 'string')))
}

// A tabela `callups` cresce sem parar (uma linha por atleta por evento, anos de jogos e
// treinos). Um `.select(...)` sem paginação fica sujeito ao limite de linhas por omissão do
// Postgrest — sem ordenação explícita, não há garantia de quais linhas ficam de fora — pelo
// que convocatórias antigas desapareciam do mapa local mesmo continuando a existir na base
// de dados: "Todos" reportava sucesso porque verifica a BD diretamente, mas os checkboxes
// continuavam por marcar porque liam este cache. Percorre a tabela às páginas.
const fetchAllCallups = async (selectClause: string): Promise<{ data: any[] | null; error: any }> => {
  const PAGE_SIZE = 1000
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('callups')
      .select(selectClause)
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return { data: all, error: null }
}

export const TrainingIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    {/* Pino de Treino / Cone */}
    <path d="M2 21h9" />
    <path d="M4.2 21L7.2 6.5a1 1 0 0 1 1.9 0l2.3 10.5" />
    <path d="M5.5 15.5h4.6" />
    <path d="M6.5 11h2.7" />
    {/* Bola de Futebol */}
    <circle cx="17" cy="14.5" r="5" />
    <path d="M17 12.5l1.2 1-.4 1.4h-1.6l-.4-1.4z" fill="currentColor" fillOpacity="0.4" />
    <path d="M17 9.5v3" />
    <path d="M21.5 13.5l-3.3.5" />
    <path d="M19.8 18.5l-2-1.6" />
    <path d="M14.2 18.5l2-1.6" />
    <path d="M12.5 13.5l3.3.5" />
  </svg>
)

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string
  field_id?: string | null
  location?: string // fallback
  description: string
  is_friendly?: boolean
  is_active?: boolean
  tournament_id?: string | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
  max_players?: number | null
  related_gathering_id?: string | null
  home_score?: number | null
  away_score?: number | null
}

interface Field { id: string; name: string; address?: string | null }
interface Opponent {
  id: string
  name: string
  initials?: string | null
  logo_url?: string | null
  home_field_id?: string | null
  contact_name?: string | null
  contact_phone?: string | null
}
interface TournamentRules {
  min_age: number;
  exceptions_allowed: boolean;
  exceptions_count: number;
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
}
interface Tournament { id: string; name: string; season: string; rules?: TournamentRules }
interface TournamentPlayer { tournament_id: string; player_id: string }
interface TournamentSuspension { id: string; tournament_id: string; player_id: string; reason: string; status: string }

interface CallupWithPlayer {
  id: string
  event_id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined' | 'pending'
  player: Profile
}

const EventsPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
  
  // Lookups
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournamentPlayersMap, setTournamentPlayersMap] = useState<TournamentPlayer[]>([])
  const [tournamentSuspensions, setTournamentSuspensions] = useState<TournamentSuspension[]>([])
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [searchParams, setSearchParams] = useSearchParams()
  const ehDesktop = useEhDesktop()
  const [activeCallupModalEvent, setActiveCallupModalEvent] = useState<Event | null>(null)
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [rsvpTabFilter, setRsvpTabFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')
  const [isMatchReportOpen, setIsMatchReportOpen] = useState(false)

  // Generic Confirmation Modal State
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
  
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('gathering')
  const [eventDate, setEventDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    return d.toISOString().split('T')[0]
  })
  const [eventTime, setEventTime] = useState('20:00')
  const [meetingTime, setMeetingTime] = useState('19:30')
  const [fieldId, setFieldId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('')
  
  // Match specifics
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')

  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([3]) // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  // Quick Field Modal
  const [isQuickFieldModalOpen, setIsQuickFieldModalOpen] = useState(false)
  const [quickFieldTarget, setQuickFieldTarget] = useState<'create' | 'edit'>('create')
  const [quickFieldName, setQuickFieldName] = useState('')
  const [quickFieldAddress, setQuickFieldAddress] = useState('')
  const [isSavingQuickField, setIsSavingQuickField] = useState(false)

  // Quick Opponent Modal
  const [isQuickOpponentModalOpen, setIsQuickOpponentModalOpen] = useState(false)
  const [quickOppTarget, setQuickOppTarget] = useState<'create' | 'edit'>('create')
  const [quickOppName, setQuickOppName] = useState('')
  const [quickOppInitials, setQuickOppInitials] = useState('')
  const [quickOppHomeFieldId, setQuickOppHomeFieldId] = useState('')
  const [quickOppContactName, setQuickOppContactName] = useState('')
  const [quickOppContactPhone, setQuickOppContactPhone] = useState('')
  const [isSavingQuickOpp, setIsSavingQuickOpp] = useState(false)

  // Estados para Edição de Evento
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'practice' | 'match' | 'gathering'>('gathering')
  const [editEventDate, setEditEventDate] = useState('')
  const [editEventTime, setEditEventTime] = useState('20:00')
  const [editMeetingTime, setEditMeetingTime] = useState('')
  const [editFieldId, setEditFieldId] = useState('')
  const [editLocationText, setEditLocationText] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsFriendly, setEditIsFriendly] = useState(false)
  const [editTournamentId, setEditTournamentId] = useState('')
  const [editOpponentId, setEditOpponentId] = useState('')
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [editPlayerSearchTerm, setEditPlayerSearchTerm] = useState('')
  const [isBatchCalling, setIsBatchCalling] = useState(false)
  // Guarda síncrona (não é estado) contra duplo-clique: entre o clique e o próximo repaint,
  // `isBatchCalling` (estado) ainda não travou o botão, o que já causou convocações em duplicado.
  const isBatchCallingRef = useRef(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  // Evita duplo-submit ao criar/publicar um evento (duplo clique/toque em ligação lenta
  // criava o evento e enviava a convocatória duas vezes). Mesmo padrão do isBatchCallingRef
  // acima: o estado só serve para desativar o botão na UI, a guarda real é o ref síncrono.
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const isCreatingEventRef = useRef(false)
  const [isResendPromptOpen, setIsResendPromptOpen] = useState(false)
  const [unsavedModalTarget, setUnsavedModalTarget] = useState<'edit' | 'quickField' | 'quickOpp' | null>(null)
  // Ativação e Publicação de Convocatórias
  const [isActiveOnCreate, setIsActiveOnCreate] = useState(true)
  const [editIsActive, setEditIsActive] = useState(true)

  // Estados para Filtros da Lista de Eventos Agendados
  const [eventListSearch, setEventListSearch] = useState('')
  const [eventListTypeFilter, setEventListTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [eventListTimeFilter, setEventListTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [eventListStatusFilter, setEventListStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [viewModeTab, setViewModeTab] = useState<'create' | 'list'>('list')

  const handleAttemptCloseEditModal = () => {
    setUnsavedModalTarget('edit')
  }

  const handleAttemptCloseQuickFieldModal = () => {
    if (quickFieldName.trim() || quickFieldAddress.trim()) {
      setUnsavedModalTarget('quickField')
    } else {
      setIsQuickFieldModalOpen(false)
      setQuickFieldName('')
      setQuickFieldAddress('')
    }
  }

  const handleAttemptCloseQuickOppModal = () => {
    if (quickOppName.trim() || quickOppInitials.trim() || quickOppContactName.trim()) {
      setUnsavedModalTarget('quickOpp')
    } else {
      setIsQuickOpponentModalOpen(false)
      setQuickOppName('')
      setQuickOppInitials('')
      setQuickOppHomeFieldId('')
      setQuickOppContactName('')
      setQuickOppContactPhone('')
    }
  }

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  const handleSaveQuickField = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickFieldName.trim()) return
    setIsSavingQuickField(true)
    try {
      const newId = crypto.randomUUID()
      const newFieldObj: Field = {
        id: newId,
        name: quickFieldName.trim(),
        address: quickFieldAddress.trim() || null
      }

      const { data, error } = await supabase
        .from('fields')
        .insert([{ id: newId, name: newFieldObj.name, address: newFieldObj.address }])
        .select()
        .single()

      if (error) throw error

      const resolvedField = (data as Field) || newFieldObj
      setFields(prev => [...prev.filter(f => f.id !== resolvedField.id), resolvedField].sort((a, b) => a.name.localeCompare(b.name)))

      const formattedLoc = resolvedField.address ? `${resolvedField.name} (${resolvedField.address})` : resolvedField.name

      if (quickFieldTarget === 'create') {
        setFieldId(resolvedField.id)
        setLocationText(formattedLoc)
      } else {
        setEditFieldId(resolvedField.id)
        setEditLocationText(formattedLoc)
      }

      setIsQuickFieldModalOpen(false)
      setQuickFieldName('')
      setQuickFieldAddress('')
      toast.success('🏟️ Campo criado e selecionado com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao criar campo: ' + (err.message || 'Erro de ligação'))
    } finally {
      setIsSavingQuickField(false)
    }
  }

  const handleSaveQuickOpponent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickOppName.trim()) return
    setIsSavingQuickOpp(true)
    try {
      const newId = crypto.randomUUID()
      const newOppPayload: Opponent = {
        id: newId,
        name: quickOppName.trim(),
        initials: quickOppInitials.trim() || undefined,
        home_field_id: quickOppHomeFieldId || null,
        contact_name: quickOppContactName.trim() || null,
        contact_phone: quickOppContactPhone.trim() || null
      }

      const { data, error } = await supabase
        .from('opponents')
        .insert([{
          id: newId,
          name: newOppPayload.name,
          initials: newOppPayload.initials || null,
          home_field_id: newOppPayload.home_field_id || null,
          contact_name: newOppPayload.contact_name || null,
          contact_phone: newOppPayload.contact_phone || null
        }])
        .select()
        .single()

      if (error) throw error

      const resolvedOpp = (data as Opponent) || newOppPayload
      setOpponents(prev => [...prev.filter(o => o.id !== resolvedOpp.id), resolvedOpp].sort((a, b) => a.name.localeCompare(b.name)))

      if (quickOppTarget === 'create') {
        setOpponentId(resolvedOpp.id)
        if (homeAway === 'away' && resolvedOpp.home_field_id) {
          setFieldId(resolvedOpp.home_field_id)
          const f = fields.find(item => item.id === resolvedOpp.home_field_id)
          if (f) setLocationText(f.address ? `${f.name} (${f.address})` : f.name)
        }
      } else {
        setEditOpponentId(resolvedOpp.id)
        if (editHomeAway === 'away' && resolvedOpp.home_field_id) {
          setEditFieldId(resolvedOpp.home_field_id)
          const f = fields.find(item => item.id === resolvedOpp.home_field_id)
          if (f) setEditLocationText(f.address ? `${f.name} (${f.address})` : f.name)
        }
      }

      setIsQuickOpponentModalOpen(false)
      setQuickOppName('')
      setQuickOppInitials('')
      setQuickOppHomeFieldId('')
      setQuickOppContactName('')
      setQuickOppContactPhone('')
      toast.success('🛡️ Adversário registado com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao criar adversário: ' + (err.message || 'Erro de ligação'))
    } finally {
      setIsSavingQuickOpp(false)
    }
  }

  const openEditModal = (ev: Event) => {
    if (hasMatchReport(ev)) {
      toast.error('Este jogo já tem ficha de jogo lançada — o evento já não pode ser editado.')
      return
    }
    setEditingEvent(ev)
    setEditTitle(ev.title)
    setEditType(ev.type)
    
    // Parse date and time
    const d = new Date(ev.date_time)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      setEditEventDate(`${year}-${month}-${day}`)
      setEditEventTime(`${hours}:${minutes}`)
    } else {
      setEditEventDate(new Date().toISOString().split('T')[0])
      setEditEventTime('20:00')
    }

    setEditMeetingTime(ev.meeting_time ? ev.meeting_time.substring(0, 5) : '')
    setEditFieldId(ev.field_id || '')
    setEditLocationText(ev.location || '')
    const parsedDesc = parseMatchReportMetadata(ev.description)
    setEditDescription(parsedDesc.cleanDescription)
    setEditIsFriendly(ev.is_friendly ?? false)
    setEditIsActive(ev.is_active !== false)
    setEditTournamentId(ev.tournament_id || '')
    setEditOpponentId(ev.opponent_id || '')
    setEditHomeAway(ev.home_away || 'home')
    setEditPlayerSearchTerm('')
  }

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    setIsResendPromptOpen(true)
  }

  const handleConfirmSaveEdit = async (resendCallups: boolean) => {
    if (!editingEvent) return
    setIsSavingEdit(true)
    try {
      const editOppObj = opponents.find(o => o.id === editOpponentId)
      const editTourObj = tournaments.find(t => t.id === editTournamentId)
      const computedEditTitle = editType === 'match'
        ? (editOppObj ? `Jogo vs ${editOppObj.name}` : (editIsFriendly ? 'Jogo Amigável' : (editTourObj ? `Jogo ${editTourObj.name}` : 'Jogo')))
        : editType === 'practice'
        ? 'Treino'
        : (editTitle.trim() || 'Convívio')

      const fullIsoDateTime = new Date(`${editEventDate}T${editEventTime}:00`).toISOString()
      const parsedOriginal = parseMatchReportMetadata(editingEvent.description)
      const finalDescription = (parsedOriginal.tacticalFormation !== '4-3-3' && parsedOriginal.tacticalFormation !== '1-4-3-3' || parsedOriginal.occurrences)
        ? buildDescriptionWithMatchReport(editDescription, parsedOriginal.tacticalFormation, parsedOriginal.occurrences)
        : (editDescription.trim() || null)

      const payload: any = {
        title: computedEditTitle,
        type: editType,
        date_time: fullIsoDateTime,
        meeting_time: editMeetingTime ? `${editMeetingTime}:00` : null,
        field_id: editFieldId || null,
        location: !editFieldId ? (editLocationText.trim() || null) : null,
        description: finalDescription,
        max_players: null,
        is_friendly: editType === 'match' ? editIsFriendly : false,
        is_active: editIsActive,
        tournament_id: (editType === 'match' && !editIsFriendly) ? (editTournamentId || null) : null,
        opponent_id: editType === 'match' ? (editOpponentId || null) : null,
        home_away: editType === 'match' ? editHomeAway : null,
      }

      try {
        const { error } = await supabase
          .from('events')
          .update(payload)
          .eq('id', editingEvent.id)

        if (error) {
          if (error.message?.includes('is_active')) {
            const { is_active, ...withoutActive } = payload
            const { error: fbErr } = await supabase
              .from('events')
              .update(withoutActive)
              .eq('id', editingEvent.id)
            if (fbErr) throw fbErr
          } else {
            throw error
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('is_active')) throw err
      }

      // Se o utilizador escolheu reenviar confirmações:
      if (resendCallups) {
        await supabase
          .from('callups')
          .update({ status: 'called' })
          .eq('event_id', editingEvent.id)
      }

      setIsResendPromptOpen(false)
      setEditingEvent(null)
      const successText = resendCallups 
        ? '✨ Evento atualizado e pedidos de confirmação reenviados aos atletas!' 
        : '✨ Evento atualizado com sucesso!'
      setSuccessMessage(successText)
      toast.success(successText)
      await fetchData()
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao atualizar evento: ' + (err.message || 'Erro de ligação'))
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Ativar evento inativo e disparar convocatória
  const handleActivateEvent = async (ev: Event) => {
    const callups = eventCallups[ev.id] || []
    
    // Se o evento não tiver convocatórias gravadas e não for treino automático:
    if (callups.length === 0 && ev.type !== 'practice') {
      toast.warning('Ainda não foram escolhidos jogadores para este evento. Por favor selecione os atletas a convocar na convocatória.')
      openEditModal(ev)
      return
    }

    const countToNotify = ev.type === 'practice'
      ? (callups.length > 0 ? callups.length : allPlayers.filter(p => isPlayerEligible(p, 'practice')).length)
      : callups.length

    setConfirmModalConfig({
      isOpen: true,
      title: '📢 Ativar Evento e Enviar Convocatória',
      description: `Desejas ativar este evento e disparar a convocatória para os ${countToNotify} membros selecionados? O evento ficará imediatamente visível para todos os atletas na agenda e página principal.`,
      confirmText: 'Sim, Ativar e Enviar Convocatória',
      cancelText: 'Cancelar',
      variant: 'success',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        try {
          try {
            const { error } = await supabase
              .from('events')
              .update({ is_active: true })
              .eq('id', ev.id)
            if (error && !error.message?.includes('is_active')) {
              throw error
            }
          } catch (dbErr) {
            console.warn('Erro ao atualizar is_active no supabase:', dbErr)
          }

          // Se for treino e ainda não tiver callups na BD, insere-as agora
          if (ev.type === 'practice' && callups.length === 0) {
            const practiceEligible = allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
            const validIds = await ensurePlayerIdsForSupabase(practiceEligible, allPlayers)
            const rows = validIds.map(pId => ({
              event_id: ev.id,
              player_id: pId,
              status: 'called' as const
            }))
            if (rows.length > 0) {
              await supabase.from('callups').insert(rows)
            }
          }

          setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, is_active: true } : item))
          if (activeCallupModalEvent && activeCallupModalEvent.id === ev.id) {
            setActiveCallupModalEvent(prev => prev ? { ...prev, is_active: true } : null)
          }
          await fetchData()
          toast.success(`🎉 Evento ativado com sucesso! Convocatória enviada a ${countToNotify} membros.`)
        } catch (err: any) {
          console.error(err)
          toast.error('Erro ao ativar evento: ' + (err.message || 'Erro'))
        }
      }
    })
  }

  // Pre-select weekday when eventDate changes
  useEffect(() => {
    if (eventDate) {
      const d = new Date(eventDate)
      const day = d.getDay()
      if (!isNaN(day)) {
        setRecurrenceWeekdays([day])
      }
    }
  }, [eventDate])

  // Desativar recorrência em eventos que não sejam treinos
  useEffect(() => {
    if (type !== 'practice') {
      setIsRecurring(false)
    }
  }, [type])

  const calculateRecurringDates = (dateStr: string, timeStr: string, endDayString: string, weekdays: number[]) => {
    if (!dateStr || !timeStr || !endDayString || weekdays.length === 0) return []
    const start = new Date(`${dateStr}T${timeStr}:00`)
    const end = new Date(endDayString + 'T23:59:59')
    const result: Date[] = []

    if (start > end) return []

    const hours = start.getHours()
    const minutes = start.getMinutes()
    const current = new Date(start)

    while (current <= end) {
      if (weekdays.includes(current.getDay())) {
        const d = new Date(current)
        d.setHours(hours, minutes, 0, 0)
        result.push(d)
      }
      current.setDate(current.getDate() + 1)
    }
    return result
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [evRes, fRes, oRes, tRes, profRes, callRes, tpRes, suspRes] = await Promise.all([
        supabase.from('events').select('*').order('date_time', { ascending: false }),
        supabase.from('fields').select('id, name, address'),
        supabase.from('opponents').select('id, name, initials, home_field_id'),
        supabase.from('tournaments').select('id, name, season, rules'),
        supabase.from('profiles').select('*').order('name', { ascending: true }),
        fetchAllCallups('id, event_id, player_id, status, player:profiles(id, name, photo_url, jersey_number, role, roles, medical_notes, position)'),
        supabase.from('tournament_players').select('tournament_id, player_id'),
        supabase.from('tournament_suspensions').select('*').eq('status', 'active')
      ])

      if (evRes.data) setEvents(evRes.data as Event[])
      if (fRes.data) setFields(fRes.data as Field[])
      if (oRes.data) setOpponents(oRes.data)
      if (tRes.data) setTournaments(tRes.data)
      if (tpRes.data) setTournamentPlayersMap(tpRes.data)
      if (suspRes.data) setTournamentSuspensions(suspRes.data)
      if (profRes.data) {
        const merged = ordenarPlantel((profRes.data as Profile[]) || [])
        setAllPlayers(merged)
        const initialEligible = merged.filter(p => isPlayerEligible(p, type))
        setSelectedPlayerIds(initialEligible.map(p => p.id))
      }
      if (tpRes.data) setTournamentPlayersMap(tpRes.data)

      if (callRes.data && evRes.data && profRes.data) {
        const eventsList = evRes.data as Event[]
        const practiceEventIds = new Set(eventsList.filter(e => e.type === 'practice').map(e => e.id))
        const merged = ordenarPlantel((profRes.data as Profile[]) || [])
        const playerMap = new Map<string, Profile>(merged.map(p => [p.id, p]))

        const map: Record<string, CallupWithPlayer[]> = {}
        callRes.data.forEach((c: any) => {
          const fullP = playerMap.get(c.player_id) || c.player

          if (practiceEventIds.has(c.event_id)) {
            if (fullP?.status === 'injured' || fullP?.status === 'inactive') {
              return
            }
          }

          if (!map[c.event_id]) map[c.event_id] = []
          map[c.event_id].push({
            ...c,
            player_id: fullP?.id || c.player_id,
            player: fullP
          } as CallupWithPlayer)
        })

        // Para treinos: garantir que todos os atletas aptos ('active') estão convocados
        const activePlayers = merged.filter(p => p.status === 'active' || (!p.status && p.role === 'player'))
        practiceEventIds.forEach(pId => {
          if (!map[pId]) map[pId] = []
          const calledIds = new Set(map[pId].map(c => c.player_id))
          activePlayers.forEach(ap => {
            if (!calledIds.has(ap.id)) {
              map[pId].push({
                id: `auto-${pId}-${ap.id}`,
                event_id: pId,
                player_id: ap.id,
                status: 'called',
                player: ap
              })
            }
          })
        })

        setEventCallups(map)
      }
      
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const getCascaisHomeField = () => {
    if (clubSettings?.home_field_id) {
      const f = fields.find(item => item.id === clubSettings.home_field_id)
      if (f) return f
    }
    const localId = localStorage.getItem('csc_club_home_field_id')
    if (localId) {
      const f = fields.find(item => item.id === localId)
      if (f) return f
    }
    const cascaisField = fields.find(f => 
      f.name.toLowerCase().includes('cascais') || 
      f.name.toLowerCase().includes('dramático') ||
      f.name.toLowerCase().includes('dramatico')
    )
    if (cascaisField) return cascaisField
    return fields[0] || null
  }

  const isPlayerEligible = (player: Profile, eventType: string, tId?: string | null) => {
    if (player.status === 'inactive') return false
    
    // Se for um jogo de um torneio específico, verificar se está inscrito e se não está suspenso
    if (eventType === 'match' && tId) {
      const isRegistered = tournamentPlayersMap.some(tp => tp.tournament_id === tId && tp.player_id === player.id)
      if (!isRegistered) return false

      const isSuspended = tournamentSuspensions.some(ts => ts.tournament_id === tId && ts.player_id === player.id && ts.status === 'active')
      if (isSuspended) return false
    }

    if (eventType === 'gathering') return true
    return player.status === 'active'
  }

  useEffect(() => {
    setSelectedPlayerIds(prev => prev.filter(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? isPlayerEligible(p, type, tournamentId) : false
    }))
  }, [type, allPlayers, tournamentId, tournamentPlayersMap])

  // Gestão automática de campo na criação de jogos / treinos
  useEffect(() => {
    if (type === 'match') {
      if (homeAway === 'home') {
        const cascais = getCascaisHomeField()
        if (cascais) {
          setFieldId(cascais.id)
          setLocationText(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
        }
      } else if (homeAway === 'away' && opponentId) {
        const opp = opponents.find(o => o.id === opponentId)
        if (opp?.home_field_id) {
          setFieldId(opp.home_field_id)
          const f = fields.find(item => item.id === opp.home_field_id)
          if (f) setLocationText(f.address ? `${f.name} (${f.address})` : f.name)
        }
      }
    } else if (type === 'practice' && !fieldId) {
      const cascais = getCascaisHomeField()
      if (cascais) {
        setFieldId(cascais.id)
        setLocationText(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
      }
    }
  }, [type, homeAway, opponentId, opponents, fields, clubSettings])

  // Gestão automática de campo na edição de jogos
  useEffect(() => {
    if (editingEvent && editType === 'match') {
      if (editHomeAway === 'home') {
        const cascais = getCascaisHomeField()
        if (cascais) {
          setEditFieldId(cascais.id)
          setEditLocationText(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
        }
      } else if (editHomeAway === 'away' && editOpponentId) {
        const opp = opponents.find(o => o.id === editOpponentId)
        if (opp?.home_field_id) {
          setEditFieldId(opp.home_field_id)
          const f = fields.find(item => item.id === opp.home_field_id)
          if (f) setEditLocationText(f.address ? `${f.name} (${f.address})` : f.name)
        }
      }
    }
  }, [editingEvent, editType, editHomeAway, editOpponentId, opponents, fields, clubSettings])

  const handleSelectAll = () => {
    const eligible = allPlayers.filter(p => isPlayerEligible(p, type, tournamentId))
    setSelectedPlayerIds(eligible.map(p => p.id))
  }

  const handleSelectOnlyPlayers = () => {
    const players = allPlayers.filter(p => {
      const roles = extractRolesFromProfile(p)
      return roles.includes('player') && isPlayerEligible(p, type, tournamentId)
    })
    setSelectedPlayerIds(players.map(p => p.id))
  }

  const handleSelectStaff = () => {
    const staff = allPlayers.filter(p => {
      const roles = extractRolesFromProfile(p)
      return (roles.includes('coach') || roles.includes('admin')) && isPlayerEligible(p, type, tournamentId)
    })
    setSelectedPlayerIds(staff.map(p => p.id))
  }

  const handleClearAll = () => setSelectedPlayerIds([])

  const handleRepeatLastCallup = () => {
    const sortedEvents = [...events].sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
    const lastEventWithCallups = sortedEvents.find(e => (eventCallups[e.id] || []).length > 0)
    
    if (lastEventWithCallups && eventCallups[lastEventWithCallups.id]) {
      const lastPlayerIds = eventCallups[lastEventWithCallups.id].map(c => c.player_id)
      const validLastIds = lastPlayerIds.filter(id => {
        const p = allPlayers.find(pl => pl.id === id)
        return p ? isPlayerEligible(p, type, tournamentId) : false
      })
      setSelectedPlayerIds(validLastIds)
      toast.success('Convocatória anterior repetida com sucesso!')
    } else {
      toast.info('Ainda não existem convocatórias anteriores para repetir.')
    }
  }

  const togglePlayer = (id: string) => {
    const p = allPlayers.find(pl => pl.id === id)
    if (p && !isPlayerEligible(p, type, tournamentId)) {
      toast.warning('Este membro não pode ser convocado (lesionado, não inscrito no torneio ou inativo).')
      return
    }

    const willSelect = !selectedPlayerIds.includes(id)

    if (willSelect && type === 'match' && tournamentId) {
      const tour = tournaments.find(t => t.id === tournamentId)
      if (tour?.rules) {
        const { rules } = tour
        
        // 1. Validar limite de jogadores do torneio
        if (rules.max_match_players && selectedPlayerIds.length >= rules.max_match_players) {
          toast.error(`Esta convocatória atingiu o limite do torneio (${rules.max_match_players} convocados).`)
          return
        }

        // 2. Validar limite de exceções de idade
        if (p?.birth_date && rules.min_age && rules.exceptions_allowed) {
          const age = Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10)
          if (age < rules.min_age) {
            const currentExceptions = selectedPlayerIds.filter(sId => {
              const selP = allPlayers.find(pl => pl.id === sId)
              if (selP?.birth_date) {
                const sAge = Math.floor((new Date().getTime() - new Date(selP.birth_date).getTime()) / 3.15576e+10)
                return sAge < rules.min_age
              }
              return false
            }).length

            if (currentExceptions >= rules.exceptions_count) {
              toast.error(`Não podes convocar mais jogadores abaixo dos ${rules.min_age} anos. O limite do torneio (${rules.exceptions_count}) já foi atingido.`)
              return
            }
          }
        }
      }
    }

    if (willSelect && maxPlayers !== '' && selectedPlayerIds.length >= Number(maxPlayers)) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Limite de Convocatória Atingido',
        description: `A convocatória já atingiu o limite manual definido de ${maxPlayers} membros (${selectedPlayerIds.length} selecionados). Desejas convocar este elemento mesmo assim?`,
        confirmText: 'Sim, Convocar Membro',
        cancelText: 'Cancelar',
        variant: 'warning',
        onConfirm: () => {
          setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
          setSelectedPlayerIds(prev => [...prev, id])
        }
      })
      return
    }

    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id])
  }

  const getActiveLocationString = () => {
    if (fieldId) {
      const f = fields.find(item => item.id === fieldId)
      if (f) return f.address ? `${f.name}, ${f.address}` : f.name
    }
    return locationText.trim()
  }

  const getGoogleMapsUrl = (locationOrAddress: string) => {
    if (!locationOrAddress) return ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationOrAddress)}`
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    // Reentrância: sem esta guarda, um duplo clique/toque no botão "Publicar Evento e Enviar
    // Convocatória" (sem `disabled` durante o pedido) chamava esta função duas vezes antes do
    // primeiro pedido terminar, criando o evento e a convocatória duplicados.
    if (isCreatingEventRef.current) return
    isCreatingEventRef.current = true
    setIsCreatingEvent(true)
    setSuccessMessage(null)

    if (!eventDate || !eventTime) {
      isCreatingEventRef.current = false
      setIsCreatingEvent(false)
      toast.warning('Por favor selecione a Data e a Hora do evento.')
      return
    }

    const fullIsoDateTime = new Date(`${eventDate}T${eventTime}:00`).toISOString()

    try {
      const oppObj = opponents.find(o => o.id === opponentId)
      const tourObj = tournaments.find(t => t.id === tournamentId)
      const computedTitle = type === 'match'
        ? (oppObj ? `Jogo vs ${oppObj.name}` : (isFriendly ? 'Jogo Amigável' : (tourObj ? `Jogo ${tourObj.name}` : 'Jogo')))
        : type === 'practice'
        ? 'Treino'
        : (title.trim() || 'Convívio')

      let createdEventsList: Event[] = []

      if (isRecurring && recurrenceEndDate && recurrenceWeekdays.length > 0) {
        const dates = calculateRecurringDates(eventDate, eventTime, recurrenceEndDate, recurrenceWeekdays)
        if (dates.length === 0) {
          toast.warning('Nenhuma data encontrada para os dias da semana e intervalo escolhidos.')
          return
        }

        const eventsToInsert = dates.map(d => ({
          title: computedTitle,
          type,
          date_time: d.toISOString(),
          meeting_time: meetingTime ? `${meetingTime}:00` : null,
          field_id: fieldId || null,
          location: !fieldId ? (locationText.trim() || null) : null,
          description: description.trim() || null,
          max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
          is_friendly: type === 'match' ? isFriendly : false,
          is_active: isActiveOnCreate,
          tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
          opponent_id: type === 'match' ? (opponentId || null) : null,
          home_away: type === 'match' ? homeAway : null,
          created_by: profile?.id
        }))

        let createdBatchResult: any = null
        try {
          const { data: createdBatch, error } = await supabase
            .from('events')
            .insert(eventsToInsert)
            .select()
          if (error) {
            if (error.message?.includes('is_active')) {
              const withoutActive = eventsToInsert.map(({ is_active, ...rest }) => rest)
              const { data: fbData, error: fbErr } = await supabase.from('events').insert(withoutActive).select()
              if (fbErr) throw fbErr
              createdBatchResult = (fbData || []).map((e: any) => ({ ...e, is_active: isActiveOnCreate }))
            } else {
              throw error
            }
          } else {
            createdBatchResult = createdBatch
          }
        } catch (dbErr: any) {
          if (dbErr.message?.includes('is_active')) {
            const withoutActive = eventsToInsert.map(({ is_active, ...rest }) => rest)
            const { data: fbData, error: fbErr } = await supabase.from('events').insert(withoutActive).select()
            if (fbErr) throw fbErr
            createdBatchResult = (fbData || []).map((e: any) => ({ ...e, is_active: isActiveOnCreate }))
          } else {
            throw dbErr
          }
        }

        if (createdBatchResult) createdEventsList = createdBatchResult as Event[]

        const playerIdsToCall = type === 'practice'
          ? allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
          : selectedPlayerIds

        if (createdEventsList.length > 0 && playerIdsToCall.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(playerIdsToCall, allPlayers)
          const allCallups: any[] = []
          createdEventsList.forEach(ev => {
            validIds.forEach(pId => {
              allCallups.push({
                event_id: ev.id,
                player_id: pId,
                status: 'called'
              })
            })
          })
          if (allCallups.length > 0) {
            await supabase.from('callups').insert(allCallups)
          }
        }

        const successText = isActiveOnCreate
          ? `✨ ${createdEventsList.length} eventos criados com sucesso até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`
          : `📝 ${createdEventsList.length} eventos guardados como Rascunho (Inativos) até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`
        setSuccessMessage(successText)
        toast.success(successText)
      } else {
        const newEvent = {
          title: computedTitle,
          type,
          date_time: fullIsoDateTime,
          meeting_time: meetingTime ? `${meetingTime}:00` : null,
          field_id: fieldId || null,
          location: !fieldId ? (locationText.trim() || null) : null,
          description: description.trim() || null,
          max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
          is_friendly: type === 'match' ? isFriendly : false,
          is_active: isActiveOnCreate,
          tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
          opponent_id: type === 'match' ? (opponentId || null) : null,
          home_away: type === 'match' ? homeAway : null,
          created_by: profile?.id
        }

        let createdEventResult: any = null
        try {
          const { data: createdEvent, error } = await supabase
            .from('events')
            .insert([newEvent])
            .select()
            .single()

          if (error) {
            if (error.message?.includes('is_active')) {
              const { is_active, ...withoutActive } = newEvent
              const { data: fbData, error: fbErr } = await supabase.from('events').insert([withoutActive]).select().single()
              if (fbErr) throw fbErr
              createdEventResult = { ...fbData, is_active: isActiveOnCreate }
            } else {
              throw error
            }
          } else {
            createdEventResult = createdEvent
          }
        } catch (dbErr: any) {
          if (dbErr.message?.includes('is_active')) {
            const { is_active, ...withoutActive } = newEvent
            const { data: fbData, error: fbErr } = await supabase.from('events').insert([withoutActive]).select().single()
            if (fbErr) throw fbErr
            createdEventResult = { ...fbData, is_active: isActiveOnCreate }
          } else {
            throw dbErr
          }
        }

        const createdEvent = createdEventResult as Event

        const playerIdsToCall = type === 'practice'
          ? allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
          : selectedPlayerIds

        if (createdEvent && playerIdsToCall.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(playerIdsToCall, allPlayers)
          const rows = validIds.map(pId => ({
            event_id: createdEvent.id,
            player_id: pId,
            status: 'called'
          }))
          if (rows.length > 0) {
            await supabase.from('callups').insert(rows)
          }
        }

        const successText = isActiveOnCreate
          ? '🎉 Evento criado e convocatória enviada aos membros!'
          : '📝 Evento guardado como Rascunho (Inativo). A convocatória foi guardada e será enviada quando ativares o evento.'
        setSuccessMessage(successText)
        toast.success(successText)
      }

      await fetchData()
      
      // Reset form e fechar modal
      setTitle('')
      setDescription('')
      setTournamentId('')
      setOpponentId('')
      setIsFriendly(false)
      setIsActiveOnCreate(true)
      setHomeAway('home')
      setMaxPlayers('')
      setIsRecurring(false)
      setRecurrenceEndDate('')
      setViewModeTab('list') // Fechar modal e voltar à lista
    } catch (err: any) {
      console.error(err)
      toast.error("Erro ao criar evento: " + (err.message || 'Verifique a base de dados'))
    } finally {
      isCreatingEventRef.current = false
      setIsCreatingEvent(false)
    }
  }

  const handleDeleteEvent = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Evento',
      description: 'Tens a certeza que desejas eliminar este evento? Todos os registos e convocatórias associados serão permanentemente apagados.',
      confirmText: 'Sim, Eliminar Evento',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('events').delete().eq('id', id)
        if (!error) {
          setEvents(prev => prev.filter(e => e.id !== id))
          toast.success('Evento eliminado com sucesso!')
        } else {
          toast.error('Erro ao eliminar evento: ' + error.message)
        }
      }
    })
  }

  const handleUpdateCallupStatus = async (callupId: string, eventId: string, newStatus: 'called' | 'confirmed' | 'declined') => {
    try {
      const { error } = await supabase
        .from('callups')
        .update({ status: newStatus })
        .eq('id', callupId)

      if (error) throw error

      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).map(c => c.id === callupId ? { ...c, status: newStatus } : c)
      }))
      toast.success(`Estado atualizado para: ${newStatus === 'confirmed' ? 'Confirmado' : newStatus === 'declined' ? 'Recusado' : 'Convocado'}`)
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message)
    }
  }

  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    try {
      const ev = events.find(e => e.id === eventId)
      const p = allPlayers.find(pl => pl.id === playerId)
      if (ev && p && !isPlayerEligible(p, ev.type, ev.tournament_id)) {
        toast.warning('Este membro não está apto/elegível para este tipo de evento.')
        return
      }

      // Validar regras do torneio
      if (ev && ev.type === 'match' && ev.tournament_id) {
        const tour = tournaments.find(t => t.id === ev.tournament_id)
        if (tour?.rules) {
          const { rules } = tour
          const currentCallups = eventCallups[eventId] || []
          
          if (rules.max_match_players && currentCallups.length >= rules.max_match_players) {
            toast.error(`A convocatória atingiu o limite do torneio (${rules.max_match_players} convocados).`)
            return
          }

          if (p?.birth_date && rules.min_age && rules.exceptions_allowed) {
            const age = Math.floor((new Date().getTime() - new Date(p.birth_date).getTime()) / 3.15576e+10)
            if (age < rules.min_age) {
              const currentExceptions = currentCallups.filter(c => {
                if (c.player?.id) {
                  const selP = allPlayers.find(pl => pl.id === c.player.id)
                  if (selP?.birth_date) {
                    const sAge = Math.floor((new Date().getTime() - new Date(selP.birth_date).getTime()) / 3.15576e+10)
                    return sAge < rules.min_age
                  }
                }
                return false
              }).length

              if (currentExceptions >= rules.exceptions_count) {
                toast.error(`Não podes convocar mais jogadores abaixo dos ${rules.min_age} anos. O limite (${rules.exceptions_count}) já foi atingido.`)
                return
              }
            }
          }
        }
      }

      const validIds = await ensurePlayerIdsForSupabase([playerId], allPlayers)
      const targetId = validIds[0] || playerId

      const { data, error } = await supabase.from('callups').upsert([{
        event_id: eventId,
        player_id: targetId,
        status: 'called'
      }], { onConflict: 'event_id, player_id' }).select('id, event_id, player_id, status, player:profiles(id, name, photo_url, jersey_number, role, roles, medical_notes, position)').single()

      if (error) throw error

      const createdObj = (data as any) || {
        id: `callup-${Date.now()}`,
        event_id: eventId,
        player_id: targetId,
        status: 'called',
        player: p
      }

      setEventCallups(prev => ({
        ...prev,
        [eventId]: [...(prev[eventId] || []).filter(c => c.player_id !== targetId), createdObj]
      }))
      toast.success('Atleta adicionado à convocatória!')
    } catch (err: any) {
      toast.error('Erro ao adicionar atleta: ' + err.message)
    }
  }

  const handleRemovePlayerFromCallup = async (callupId: string, eventId: string) => {
    try {
      const { error } = await supabase.from('callups').delete().eq('id', callupId)
      if (error) throw error

      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(c => c.id !== callupId)
      }))
      toast.info('Jogador removido da convocatória.')
    } catch (err: any) {
      toast.error('Erro ao remover: ' + err.message)
    }
  }

  const getFieldName = (id?: string | null) => {
    if (!id) return ''
    const f = fields.find(f => f.id === id)
    return f ? f.name : ''
  }

  const getOpponentName = (id?: string | null) => {
    if (!id) return ''
    const o = opponents.find(o => o.id === id)
    return o ? o.name : ''
  }

  // Título da lista de eventos. `event.title` de um jogo já vem como "Jogo vs <adversário>"
  // (ver handleCreateEvent/handleConfirmSaveEdit) — juntar "CSC vs <adversário> • <title>"
  // duplicava o nome do adversário duas vezes. Mostra antes as siglas (como na Home e na
  // Agenda) seguidas da competição — a competição em dourado, para não se confundir a
  // olho com as siglas das equipas quando tudo estava na mesma cor.
  const getEventHeading = (ev: Event): React.ReactNode => {
    if (ev.type !== 'match' || !ev.opponent_id) return ev.title
    const opponent = opponents.find(o => o.id === ev.opponent_id)
    const cscSigla = formatClubSigla(clubSettings?.initials)
    const oppSigla = formatOpponentSigla(opponent)
    const isAway = ev.home_away === 'away'
    const leftSigla = isAway ? oppSigla : cscSigla
    const rightSigla = isAway ? cscSigla : oppSigla
    const competitionLabel = ev.is_friendly
      ? 'Jogo Amigável'
      : (tournaments.find(t => t.id === ev.tournament_id)?.name || 'Jogo Oficial')
    return (
      <>
        <span>{leftSigla} vs {rightSigla}</span>
        <span className="text-white/40"> • </span>
        <span className="text-csc-gold">{competitionLabel}</span>
      </>
    )
  }

  const currentLocationStr = getActiveLocationString()

  const totalCount = allPlayers.filter(p => isPlayerEligible(p, type, tournamentId)).length
  const playersCount = allPlayers.filter(p => extractRolesFromProfile(p).includes('player') && isPlayerEligible(p, type, tournamentId)).length
  const staffCount = allPlayers.filter(p => {
    const roles = extractRolesFromProfile(p)
    return (roles.includes('coach') || roles.includes('admin')) && isPlayerEligible(p, type, tournamentId)
  }).length

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.
  const painelCriarEventoRef = useModalA11y({ isOpen: viewModeTab === 'create', onClose: () => setViewModeTab('list') })
  const painelEditarEventoRef = useModalA11y({ isOpen: !!editingEvent, onClose: handleAttemptCloseEditModal })

  // Ver a convocatória de um evento é navegar: o endereço passa a ter
  // ?convocatoria=<id>, portanto o dossier tem link próprio e o retroceder do
  // browser fecha-o. No desktop deixa de ser janela e passa a ser a página.
  const abrirDossier = (ev: Event) => {
    setActiveCallupModalEvent(ev)
    setSearchParams({ convocatoria: ev.id })
  }

  const fecharDossier = () => {
    setActiveCallupModalEvent(null)
    if (searchParams.get('convocatoria')) {
      const restantes = new URLSearchParams(searchParams)
      restantes.delete('convocatoria')
      setSearchParams(restantes, { replace: true })
    }
  }

  useEffect(() => {
    const idEvento = searchParams.get('convocatoria')
    if (!idEvento) {
      setActiveCallupModalEvent(null)
      return
    }
    const alvo = events.find(e => e.id === idEvento)
    if (alvo) setActiveCallupModalEvent(alvo)
  }, [searchParams, events])

  return (
    <div className="space-y-6 pb-12">
      {/* No desktop, abrir o dossier de convocatória é mudar de página: a lista
          de eventos sai da frente em vez de ficar por baixo de uma janela. */}
      <div className={ehDesktop && !!activeCallupModalEvent ? 'hidden' : 'space-y-6'}>
      {/* Page Header removido a pedido do utilizador */}

      {successMessage && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border-2 border-emerald-300 text-sm font-bold flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Botão para abrir modal de criação (só coaches/admins) */}
      {isCoachOrAdmin && (
        <button
          type="button"
          onClick={() => setViewModeTab('create')}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-2xl font-black text-sm shadow-md transition-all cursor-pointer active:scale-98 border-2 border-csc-gold/30"
        >
          <Plus size={18} className="text-csc-gold" />
          <span>Novo Evento</span>
        </button>
      )}

      {/* MODAL DE CRIAÇÃO DE EVENTO (OVERLAY) */}
      {viewModeTab === 'create' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in overflow-y-auto">
          <div
            ref={painelCriarEventoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="criar-evento-titulo"
            tabIndex={-1}
            className="bg-white w-full sm:rounded-3xl sm:max-w-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto shadow-2xl border-0 sm:border-2 sm:border-csc-gold/60 flex flex-col outline-none"
          >
            {/* Header fixo do modal */}
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 sm:px-7 py-4 border-b border-gray-200 rounded-t-3xl">
              <h3 id="criar-evento-titulo" className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Plus size={20} className="text-csc-dark" />
                <span>Novo Evento / Atividade</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 hidden sm:block">
                  CSC Organizer
                </span>
                <button
                  type="button"
                  onClick={() => setViewModeTab('list')}
                  aria-label="Voltar à lista"
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 flex items-center justify-center cursor-pointer transition-all active:scale-90"
                >
                  <X size={18} className="stroke-[2.5]" />
                </button>
              </div>
            </div>

            <div className="px-5 sm:px-7 py-5">
          <form onSubmit={handleCreateEvent} className="space-y-5">
            
            {/* 1. Tipo de Evento */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Tipo de Evento
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'gathering', label: 'Convívio', icon: PartyPopper, color: 'text-purple-700 bg-purple-50 border-purple-300' },
                  { id: 'practice', label: 'Treino', icon: TrainingIcon, color: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
                  { id: 'match', label: 'Jogo', icon: Trophy, color: 'text-amber-800 bg-amber-50 border-amber-300' },
                ].map(t => {
                  const Icon = t.icon
                  const isSelected = type === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id as any)}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? `${t.color} shadow-sm ring-2 ring-csc-dark/20 scale-[1.02]`
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={18} />
                      <span className="text-center leading-tight">{t.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Título (Apenas Convívios) */}
            {type === 'gathering' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Título do Convívio *
                </label>
                <input
                  type="text"
                  required={type === 'gathering'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white font-medium text-gray-900"
                  placeholder="Ex: Jantar de Natal / Reentré"
                />
              </div>
            )}

            {/* Específico de Jogo */}
            {type === 'match' && (
              <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isFriendly"
                    checked={isFriendly}
                    onChange={(e) => {
                      setIsFriendly(e.target.checked)
                      if (e.target.checked) setTournamentId('')
                    }}
                    className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor="isFriendly" className="ml-2 text-xs font-bold text-gray-800 cursor-pointer">
                    Jogo Amigável / Treino Conjunto
                  </label>
                </div>

                {!isFriendly && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Torneio / Competição</label>
                    <select
                      value={tournamentId}
                      onChange={(e) => setTournamentId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium text-gray-900"
                    >
                      <option value="">-- Selecionar Torneio --</option>
                      {tournaments.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.season})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Adversário</label>
                    <select
                      value={opponentId}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setQuickOppTarget('create')
                          setIsQuickOpponentModalOpen(true)
                        } else {
                          setOpponentId(e.target.value)
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium text-gray-900"
                    >
                      <option value="">-- Selecionar Adversário --</option>
                      <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Adversário...</option>
                      {opponents.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Condição de Jogo</label>
                    <select
                      value={homeAway}
                      onChange={(e) => setHomeAway(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium text-gray-900"
                    >
                      <option value="home">🏠 Casa</option>
                      <option value="away">✈️ Fora</option>
                      <option value="neutral">⚖️ Campo Neutro</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Data/Hora */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">Data *</label>
                <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold text-gray-900" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">Hora *</label>
                <input type="time" required value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold text-gray-900" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">Concentração</label>
                <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white text-gray-900" />
              </div>
            </div>

            {/* 4. Localização / Campo */}
            {type === 'match' && homeAway === 'home' ? (
              <div className="p-3.5 bg-emerald-50/80 border-2 border-emerald-300 rounded-2xl flex items-center justify-between shadow-2xs">
                <div className="space-y-1 min-w-0 flex-1 pr-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <MapPin size={13} className="text-emerald-700 shrink-0" />
                    <span>Campo do Jogo (Automático - Em Casa)</span>
                  </span>
                  <p className="text-xs font-black text-gray-900 truncate">
                    🏟️ {(() => {
                      const cascais = getCascaisHomeField()
                      return cascais ? `${cascais.name} ${cascais.address ? `(${cascais.address})` : ''}` : 'Estádio do Dramático de Cascais'
                    })()}
                  </p>
                </div>
                {currentLocationStr && (
                  <a
                    href={getGoogleMapsUrl(currentLocationStr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-black text-csc-dark bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-xl shadow-2xs shrink-0"
                    title="Ver no Google Maps"
                  >
                    <MapPin size={12} className="text-red-500" />
                    <span>Maps</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5">
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><MapPin size={14} className="text-red-600" /> Campo / Instalação</span>
                  {currentLocationStr && <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full truncate max-w-[150px]">✓ {currentLocationStr}</span>}
                </label>
                <select required value={fieldId} onChange={(e) => {
                    if (e.target.value === '__new__') { setQuickFieldTarget('create'); setIsQuickFieldModalOpen(true) } else { setFieldId(e.target.value); const sel = fields.find(f => f.id === e.target.value); setLocationText(sel ? (sel.address ? `${sel.name} (${sel.address})` : sel.name) : '') }
                  }} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark bg-white text-xs font-medium text-gray-900">
                  <option value="">-- Escolher Campo / Instalação --</option>
                  <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Campo...</option>
                  {fields.map(f => <option key={f.id} value={f.id}>🏟️ {f.name} {f.address ? `(${f.address})` : ''}</option>)}
                </select>
                {currentLocationStr && (
                  <div className="pt-1">
                    <a
                      href={getGoogleMapsUrl(currentLocationStr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black text-csc-dark bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95"
                    >
                      <MapPin size={13} className="text-red-600" />
                      <span>Ver no Google Maps: "{currentLocationStr}"</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 5. Descrição */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ex: Menus disponíveis, valor por pessoa, ordem de trabalhos ou recomendações..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white resize-none text-gray-900"
              />
            </div>

            {/* 6. Recorrência (Treinos) */}
            {type === 'practice' && (
              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-1">
                      <Repeat size={14} className="text-csc-gold" />
                      <span>Marcar Treino com Recorrência Semanal</span>
                    </span>
                  </label>
                </div>

                {isRecurring && (
                  <div className="space-y-2 pt-2 border-t border-amber-200/60 text-xs">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">Dias da semana:</label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { label: 'Seg', val: 1 },
                          { label: 'Ter', val: 2 },
                          { label: 'Qua', val: 3 },
                          { label: 'Qui', val: 4 },
                          { label: 'Sex', val: 5 },
                          { label: 'Sáb', val: 6 },
                          { label: 'Dom', val: 0 }
                        ].map(d => {
                          const isChecked = recurrenceWeekdays.includes(d.val)
                          return (
                            <button
                              key={d.val}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setRecurrenceWeekdays(prev => prev.filter(x => x !== d.val))
                                } else {
                                  setRecurrenceWeekdays(prev => [...prev, d.val])
                                }
                              }}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                isChecked
                                  ? 'bg-csc-dark text-white'
                                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">Repetir até:</label>
                      <input
                        type="date"
                        required={isRecurring}
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white font-bold text-gray-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. Convocatória & Notificação dos Membros */}
            {type !== 'practice' && (
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={15} className="text-csc-dark" />
                    <span>Convocatória ({selectedPlayerIds.length})</span>
                  </label>
                  <span className="text-[10px] text-gray-500 font-bold">
                    {selectedPlayerIds.length === 0 ? 'Nenhum selecionado' : `${selectedPlayerIds.length} selecionados`}
                  </span>
                </div>

                {/* Ações Rápidas de Seleção */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  >
                    <span>✓ Todos ({totalCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectOnlyPlayers}
                    className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  >
                    <span>⚽ Jogadores ({playersCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectStaff}
                    className="px-2.5 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                    title="Convocar equipa técnica e direção"
                  >
                    <span>📋 Staff ({staffCount})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRepeatLastCallup}
                    className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  >
                    <RotateCcw size={11} />
                    <span>Repetir</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 col-span-2 sm:col-span-1"
                  >
                    <span>✕ Limpar</span>
                  </button>
                </div>

                {/* Barra de Pesquisa de Membros */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={playerSearchTerm}
                    onChange={(e) => setPlayerSearchTerm(e.target.value)}
                    placeholder="Pesquisar por nome ou nº camisola..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-gray-900"
                  />
                </div>

                {/* Lista Selecionável Um a Um */}
                <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
                  {allPlayers
                    .filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase()))
                    .map(p => {
                      const isSel = selectedPlayerIds.includes(p.id)
                      const isEligible = isPlayerEligible(p, type)
                      const roles = extractRolesFromProfile(p)

                      return (
                        <div
                          key={p.id}
                          onClick={() => togglePlayer(p.id)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer pt-2 ${
                            !isEligible 
                              ? 'bg-red-50/60 text-red-700 opacity-60'
                              : isSel 
                                ? 'bg-amber-50/80 font-black text-gray-900 border border-amber-200' 
                                : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSel}
                              disabled={!isEligible}
                              onChange={() => {}}
                              className="h-4 w-4 text-csc-dark rounded border-gray-300 pointer-events-none"
                            />

                            {/* Avatar / Number */}
                            <div className="w-6 h-6 rounded-lg bg-csc-dark text-csc-gold flex items-center justify-center font-black text-[10px] shrink-0">
                              {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold leading-tight">
                                {p.name}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {roles.map(r => (
                                  <span
                                    key={r}
                                    className={`text-[8.5px] font-black px-1 rounded ${
                                      r === 'admin' ? 'bg-amber-100 text-amber-900' :
                                      r === 'coach' ? 'bg-blue-100 text-blue-900' :
                                      'bg-emerald-100 text-emerald-900'
                                    }`}
                                  >
                                    {r === 'admin' ? '🛡️ Admin' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {p.status === 'injured' && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0 ml-1">
                              {type === 'gathering' ? 'Lesionado (Pode ir)' : 'Lesionado'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* 8. Opção de Ativação / Envio de Convocatória */}
            <div className="p-4 bg-gradient-to-r from-gray-50 to-amber-50/40 rounded-2xl border-2 border-gray-200 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5 cursor-pointer">
                    <Send size={15} className={isActiveOnCreate ? 'text-emerald-600' : 'text-amber-600'} />
                    <span>Ativar Evento e Enviar Convocatória</span>
                  </label>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {isActiveOnCreate 
                      ? '✓ O evento fica imediatamente visível na agenda e a convocatória é enviada aos membros.' 
                      : '⏸️ O evento fica guardado em modo Rascunho (Inativo). A convocatória só será disparada quando o ativares.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isActiveOnCreate}
                    onChange={(e) => setIsActiveOnCreate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreatingEvent}
              className={`w-full py-3.5 text-white rounded-2xl font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                isActiveOnCreate
                  ? 'bg-csc-dark hover:bg-csc-dark/85'
                  : 'bg-amber-700 hover:bg-amber-800'
              }`}
            >
              {isCreatingEvent ? (
                <span>A processar...</span>
              ) : isActiveOnCreate ? (
                <>
                  <Check size={18} className="text-csc-gold" />
                  <span>Publicar Evento e Enviar Convocatória</span>
                </>
              ) : (
                <>
                  <Clock size={18} className="text-amber-200" />
                  <span>Guardar Evento como Rascunho (Inativo)</span>
                </>
              )}
            </button>
          </form>
            </div>
          </div>
        </div>
      )}

      {/* LISTA DE EVENTOS REGISTADOS & RSVP — sempre visível */}
      {(() => {
        const filteredScheduledEvents = events.filter((event) => {
          // Se for atleta (não coach/admin), só vê eventos ativos
          if (event.is_active === false && !isCoachOrAdmin) {
            return false
          }

          if (eventListStatusFilter === 'active' && event.is_active === false) return false
          if (eventListStatusFilter === 'inactive' && event.is_active !== false) return false

          const q = eventListSearch.toLowerCase().trim()
          const oppName = event.opponent_id ? getOpponentName(event.opponent_id).toLowerCase() : ''
          const locationStr = (event.field_id ? getFieldName(event.field_id) : (event.location || '')).toLowerCase()
          const titleStr = (event.title || '').toLowerCase()
          const descStr = (event.description || '').toLowerCase()

          if (q) {
            const match = titleStr.includes(q) || oppName.includes(q) || locationStr.includes(q) || descStr.includes(q)
            if (!match) return false
          }

          if (eventListTypeFilter !== 'all' && event.type !== eventListTypeFilter) {
            return false
          }

          const eventTime = new Date(event.date_time).getTime()
          const now = Date.now()
          if (eventListTimeFilter === 'upcoming') {
            if (eventTime < now - 4 * 60 * 60 * 1000) return false
          } else if (eventListTimeFilter === 'past') {
            if (eventTime >= now - 4 * 60 * 60 * 1000) return false
          }

          return true
        }).sort((a, b) => {
          const timeA = new Date(a.date_time).getTime()
          const timeB = new Date(b.date_time).getTime()
          if (eventListTimeFilter === 'past') {
            return timeB - timeA
          }
          return timeA - timeB
        })

        return (
          <div className="w-full space-y-4">
            {/* Barra de Filtros e Pesquisa de Eventos */}
            <div className="bg-white rounded-2xl shadow-xs border border-gray-200 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={eventListSearch}
                    onChange={e => setEventListSearch(e.target.value)}
                    placeholder="Pesquisar por título, adversário, local..."
                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-csc-dark outline-none transition-all text-gray-900"
                  />
                  {eventListSearch && (
                    <button
                      onClick={() => setEventListSearch('')}
                      aria-label="Limpar pesquisa"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Filtro de Estado (Ativos / Rascunhos) para Treinadores/Admins */}
                {isCoachOrAdmin && (
                  <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto shrink-0">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'active', label: '🟢 Ativos' },
                      { id: 'inactive', label: '⏸️ Rascunhos' }
                    ].map(sf => (
                      <button
                        key={sf.id}
                        type="button"
                        onClick={() => setEventListStatusFilter(sf.id as any)}
                        className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          eventListStatusFilter === sf.id
                            ? 'bg-white text-csc-dark shadow-xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {sf.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Filtro Temporal (Próximos / Anteriores / Todos) */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto shrink-0">
                  {[
                    { id: 'upcoming', label: 'Por realizar' },
                    { id: 'past', label: 'Realizados' },
                    { id: 'all', label: 'Todos' }
                  ].map(tf => (
                    <button
                      key={tf.id}
                      type="button"
                      onClick={() => setEventListTimeFilter(tf.id as any)}
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                        eventListTimeFilter === tf.id
                          ? 'bg-white text-csc-dark shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro de Tipo de Evento (Todos / Jogos / Treinos / Convívios) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100">
                {[
                  { id: 'all', label: 'Todos os Tipos', emoji: '📋' },
                  { id: 'match', label: 'Jogos', emoji: '⚽' },
                  { id: 'practice', label: 'Treinos', emoji: '🏃' },
                  { id: 'gathering', label: 'Convívios', emoji: '🎉' }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEventListTypeFilter(item.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                      eventListTypeFilter === item.id
                        ? 'bg-csc-dark text-csc-gold shadow-2xs border border-csc-dark'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-csc-dark text-white rounded-3xl shadow-sm border border-white/10 p-5 sm:p-6">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-white/10">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <CalendarRange size={20} className="text-csc-gold" />
                  <span>Lista de Eventos & Quórum RSVP</span>
                </h3>
                <span className="text-xs font-bold text-white/70">
                  A apresentar {filteredScheduledEvents.length} de {events.length} registados
                </span>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold"></div>
                </div>
              ) : filteredScheduledEvents.length === 0 ? (
                <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/15 p-6">
                  <Calendar size={40} className="mx-auto text-white/20 mb-2" />
                  <p className="font-bold text-white/70">Nenhum evento encontrado com os filtros atuais.</p>
                  <p className="text-xs text-white/65 mt-1">Tente alterar os filtros ou o termo de pesquisa.</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredScheduledEvents.map((event) => {
                  const callups = eventCallups[event.id] || []
                  const confirmedList = callups.filter(c => c.status === 'confirmed')
                  const declinedList = callups.filter(c => c.status === 'declined')
                  const pendingList = callups.filter(c => c.status === 'called')
                  
                  const fieldObj = fields.find(f => f.id === event.field_id)
                  const locationName = event.field_id ? getFieldName(event.field_id) : (event.location || 'Sem local')
                  const mapsQuery = fieldObj ? (fieldObj.address ? `${fieldObj.name}, ${fieldObj.address}` : fieldObj.name) : (event.location || '')

                  return (
                    <div 
                      key={event.id} 
                      className={`p-4 rounded-2xl border-2 transition-all shadow-2xs space-y-3 ${
                        event.is_active === false 
                          ? 'bg-amber-500/10 border-amber-400/40 hover:border-amber-400/60' 
                          : 'bg-white/5 hover:bg-amber-500/10 border-white/10 hover:border-amber-400/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-white text-base leading-tight">
                              {getEventHeading(event)}
                            </h4>
                            {event.is_active === false && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                                <span>⏸️ Rascunho / Inativo</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {isCoachOrAdmin && (
                          <div className="flex gap-1 shrink-0">
                            {!hasMatchReport(event) && (
                              <button
                                onClick={() => openEditModal(event)}
                                className="text-white/65 hover:text-blue-300 p-1.5 rounded-xl hover:bg-blue-500/10 transition-colors cursor-pointer"
                                title="Editar evento"
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteEvent(event.id)}
                              className="text-white/65 hover:text-red-300 p-1.5 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Eliminar evento"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Event Meta Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/70 bg-white/5 p-2.5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-csc-gold shrink-0" />
                          <span className="font-bold">
                            {new Date(event.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {event.meeting_time && (
                            <span className="bg-amber-100 text-amber-900 text-[10.5px] font-extrabold px-1.5 py-0.2 rounded-md border border-amber-200">
                              Conc: {event.meeting_time.substring(0, 5)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin size={13} className="text-red-500 shrink-0" />
                            <span className="truncate">{locationName}</span>
                          </div>

                          {mapsQuery && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-csc-dark hover:text-amber-700 bg-white border border-gray-300 hover:border-csc-dark px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-2xs"
                              title="Abrir no Google Maps"
                            >
                              <span>Maps</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* RSVP Summary Bar & Action Button */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-white/10">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="flex items-center gap-1 font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-lg">
                            <CheckCircle2 size={12} className="text-emerald-700" />
                            <span>{confirmedList.length}</span>
                          </span>

                          <span className="flex items-center gap-1 font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                            <HelpCircle size={12} className="text-amber-700" />
                            <span>{pendingList.length}</span>
                          </span>

                          {declinedList.length > 0 && (
                            <span className="flex items-center gap-1 font-bold text-red-800 bg-red-100 border border-red-300 px-2 py-0.5 rounded-lg">
                              <XCircle size={12} className="text-red-700" />
                              <span>{declinedList.length} Indisponíveis</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          {isCoachOrAdmin && event.is_active === false && (
                            <button
                              type="button"
                              onClick={() => handleActivateEvent(event)}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                              title="Ativar evento e enviar convocatória aos membros"
                            >
                              <Send size={13} className="text-emerald-100" />
                              <span>Ativar e Convocar</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              abrirDossier(event)
                              setRsvpTabFilter('all')
                              setPlayerSearchTerm('')
                            }}
                            className="w-full sm:w-auto px-4 py-2 bg-csc-gold hover:brightness-95 text-csc-dark rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                          >
                            <Users size={14} className="text-csc-dark" />
                            <span>Ver Detalhes & RSVP ({callups.length})</span>
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
      )})()}
      </div>

      {/* ========================================================================= */}
      {/* MODAL DETALHADO DE CONVOCATÓRIA & GESTÃO COMPLETA DE RSVP                */}
      {/* ========================================================================= */}
      {/* A ficha de jogo abre a partir daqui: no desktop substitui este dossier,
          como um nível abaixo na navegação, em vez de se sobrepor. */}
      <div className={ehDesktop && isMatchReportOpen ? 'hidden' : ''}>
      {activeCallupModalEvent && (
        <VistaDetalhe
          isOpen={!!activeCallupModalEvent}
          onClose={fecharDossier}
          tone="dark"
          size="2xl"
          showCloseButton={false}
          ariaLabel={`Convocatória: ${activeCallupModalEvent.title}`}
          voltarTexto="Voltar aos eventos"
          className="border-2 border-amber-400/40"
        >
          <div className="relative">
            {/* Fechar — só no telemóvel: no desktop isto é uma página, e quem
                volta atrás é a barra "Voltar aos eventos" da VistaDetalhe. */}
            <button
              onClick={fecharDossier}
              aria-label="Fechar"
              title="Fechar"
              className="md:hidden absolute -top-1 right-0 w-10 h-10 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all z-20 cursor-pointer active:scale-90 shadow-md border-2 border-white/40"
            >
              <X size={20} className="stroke-[2.5]" />
            </button>

            {/* Topo Premium da Persiana/Modal de Dossier & RSVP */}
            <div className="bg-gradient-to-r from-csc-dark via-emerald-950 to-csc-dark text-white p-3.5 sm:p-4 rounded-2xl shadow-xl border-2 border-csc-gold mb-5 relative overflow-hidden">
              <div className="flex items-center justify-between gap-3 pr-8">
                {/* 1. Símbolo + 2. Pílula de Tipo + 3. Data e Hora */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Símbolo Oficial do CSC */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white p-1 shadow-md shrink-0 border border-csc-gold flex items-center justify-center">
                    <img 
                      src="/csc-vet/cascais-emblem.png" 
                      alt="CSC" 
                      className="w-full h-full object-contain" 
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-2xs ${
                        activeCallupModalEvent.type === 'match' 
                          ? 'bg-blue-600 text-white' 
                          : activeCallupModalEvent.type === 'practice' 
                          ? 'bg-emerald-700 text-white' 
                          : 'bg-purple-700 text-white'
                      }`}>
                        {activeCallupModalEvent.type === 'match' ? '⚽ Jogo' : activeCallupModalEvent.type === 'practice' ? '🏃 Treino' : '🎉 Convívio'}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-gray-100 flex items-center gap-1.5 truncate">
                      <Clock size={13} className="text-csc-gold shrink-0" />
                      <span>
                        {new Date(activeCallupModalEvent.date_time).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}, {new Date(activeCallupModalEvent.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Botão Ficha de Jogo (quando Jogo já realizado ou com resultado registado) */}
                {activeCallupModalEvent.type === 'match' && (new Date(activeCallupModalEvent.date_time).getTime() <= Date.now() || (activeCallupModalEvent.home_score !== null && activeCallupModalEvent.home_score !== undefined)) && (
                  <button
                    type="button"
                    onClick={() => setIsMatchReportOpen(true)}
                    className="px-3 py-1.5 bg-csc-gold hover:bg-amber-400 text-csc-dark font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm shrink-0"
                  >
                    <span>📋 Ficha de Jogo</span>
                  </button>
                )}

                {/* 4. Botões Modificar e Apagar (Apenas Admin / Treinador) */}
                {isCoachOrAdmin && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const ev = activeCallupModalEvent
                        fecharDossier()
                        openEditModal(ev)
                      }}
                      className="p-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                      title="Modificar evento"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const evId = activeCallupModalEvent.id
                        fecharDossier()
                        handleDeleteEvent(evId)
                      }}
                      className="p-2 bg-red-600/40 hover:bg-red-600/60 text-red-100 border border-red-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
                      title="Apagar evento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Se o evento estiver inativo, alerta proeminente */}
            {activeCallupModalEvent.is_active === false && (
              <div className="mb-4 p-3.5 bg-amber-500/10 border-2 border-amber-400/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                  <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                  <span>Este evento está em modo <strong>Rascunho (Inativo)</strong>. A convocatória não foi enviada e não está visível para os atletas.</span>
                </div>
                {isCoachOrAdmin && (
                  <button
                    type="button"
                    onClick={() => handleActivateEvent(activeCallupModalEvent)}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 shrink-0"
                  >
                    <Send size={13} className="text-emerald-100" />
                    <span>Ativar e Enviar Convocatória</span>
                  </button>
                )}
              </div>
            )}

            {(() => {
              const callups = eventCallups[activeCallupModalEvent.id] || []
              const confirmedList = callups.filter(c => c.status === 'confirmed')
              const declinedList = callups.filter(c => c.status === 'declined')
              const pendingList = callups.filter(c => c.status === 'called')
              const calledPlayerIds = callups.map(c => c.player_id)
              const uncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id))

              const displayList = 
                rsvpTabFilter === 'confirmed' ? confirmedList :
                rsvpTabFilter === 'declined' ? declinedList :
                rsvpTabFilter === 'called' ? pendingList :
                callups

              return (
                <div className="space-y-4">
                  {/* Cartões de Quórum, também usados como filtro (incluindo "Todos") */}
                  <QuorumFilterCards
                    totalCount={callups.length}
                    confirmedCount={confirmedList.length}
                    pendingCount={pendingList.length}
                    declinedCount={declinedList.length}
                    activeFilter={rsvpTabFilter}
                    onSelect={setRsvpTabFilter}
                  />

                  {/* Convidar mais elementos à convocatória */}
                  {isCoachOrAdmin && uncalledPlayers.length > 0 && (
                    <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                      <p className="text-xs font-black text-white/80 flex items-center gap-1.5">
                        <UserPlus size={14} className="text-csc-gold" />
                        <span>Adicionar mais membros ao evento:</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                        {uncalledPlayers.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleAddPlayerToCallup(activeCallupModalEvent.id, p.id)}
                            className="bg-white border border-gray-300 hover:border-csc-dark text-xs px-2.5 py-1 rounded-xl font-bold text-gray-800 flex items-center gap-1 shadow-2xs hover:bg-amber-50 cursor-pointer active:scale-95"
                          >
                            <span>+ {p.name}</span>
                            {p.jersey_number && <span className="text-csc-dark font-black">#{p.jersey_number}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lista de Membros e Gestão de Estado RSVP */}
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {displayList.length === 0 ? (
                      <p className="text-center text-xs text-white/65 py-6">
                        Nenhum membro encontrado neste filtro.
                      </p>
                    ) : (
                      displayList.map(c => (
                        <CallupRow
                          key={c.id}
                          status={c.status}
                          player={c.player}
                          displayName={getPlayerDisplayName(c.player)}
                          isCoachOrAdmin={isCoachOrAdmin}
                          onConfirm={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'confirmed')}
                          onDecline={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'declined')}
                          onSetPending={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'called')}
                          onRemove={() => handleRemovePlayerFromCallup(c.id, activeCallupModalEvent.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })()}

          </div>
        </VistaDetalhe>
      )}
      </div>
      {/* ====== MODAL DE EDIÇÃO DE EVENTO ====== */}
      {editingEvent && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-modal p-4"
          onMouseDown={e => {
            // mousedown no fundo, e não um arrasto que começou dentro do painel (ex.: a selecionar texto)
            if (e.target === e.currentTarget) handleAttemptCloseEditModal()
          }}
        >
          <div
            ref={painelEditarEventoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editar-evento-titulo"
            tabIndex={-1}
            className="bg-csc-dark text-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10 outline-none"
          >
            <div className="sticky top-0 bg-csc-dark border-b border-white/10 p-5 rounded-t-3xl flex justify-between items-center z-10">
              <h3 id="editar-evento-titulo" className="text-lg font-black text-white">✏️ Editar {editType === 'gathering' ? 'Convívio' : editType === 'match' ? 'Jogo' : 'Treino'}</h3>
              <button onClick={handleAttemptCloseEditModal} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center cursor-pointer transition-all active:scale-90 shadow-md border-2 border-white/40 shrink-0"><X size={16} className="stroke-[2.5]" /></button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Tipo de Evento</label>
                <div className="w-full px-3 py-2.5 border border-white/10 bg-white/5 text-white rounded-xl text-xs font-black flex items-center justify-between shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    <span>{editType === 'match' ? '⚽ Jogo' : editType === 'practice' ? '🏃 Treino' : '🍻 Convívio'}</span>
                  </span>
                  <span className="text-[10px] font-bold text-white/70 bg-white/10 px-2 py-0.5 rounded-md">
                    🔒 Tipo Bloqueado
                  </span>
                </div>
              </div>

              {/* Título (Apenas para Convívios) */}
              {editType === 'gathering' && (
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Título do Convívio *</label>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required={editType === 'gathering'} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" placeholder="Ex: Jantar de Natal / Reentré" />
                </div>
              )}

              {/* Data e Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Data</label>
                  <input type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/70 mb-1">Hora</label>
                  <input type="time" value={editEventTime} onChange={e => setEditEventTime(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
                </div>
              </div>

              {/* Hora de Concentração */}
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Hora de Concentração (opcional)</label>
                <input type="time" value={editMeetingTime} onChange={e => setEditMeetingTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900" />
              </div>

              {/* Campos específicos para Jogos */}
              {editType === 'match' && (
                <div className="space-y-3 border-t border-b border-white/10 py-3 bg-amber-500/10 p-3 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-white/70 cursor-pointer">Amigável?</label>
                    <input 
                      type="checkbox" 
                      checked={editIsFriendly} 
                      onChange={e => {
                        setEditIsFriendly(e.target.checked)
                        if (e.target.checked) setEditTournamentId('')
                      }} 
                      className="w-4 h-4 rounded cursor-pointer" 
                    />
                  </div>

                  {!editIsFriendly && (
                    <div>
                      <label className="block text-xs font-bold text-white/70 mb-1">Torneio/Competição</label>
                      <select value={editTournamentId} onChange={e => setEditTournamentId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-900">
                        <option value="">-- Selecionar --</option>
                        {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-white/70 mb-1">Adversário</label>
                      <select 
                        value={editOpponentId} 
                        onChange={e => {
                          if (e.target.value === '__new__') {
                            setQuickOppTarget('edit')
                            setIsQuickOpponentModalOpen(true)
                          } else {
                            setEditOpponentId(e.target.value)
                          }
                        }} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900"
                      >
                        <option value="">-- Selecionar Adversário --</option>
                        <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Adversário...</option>
                        {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-white/70 mb-1">Condição de Jogo</label>
                      <select value={editHomeAway} onChange={e => setEditHomeAway(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium text-gray-900">
                        <option value="home">🏠 Casa</option>
                        <option value="away">✈️ Fora</option>
                        <option value="neutral">⚖️ Campo Neutro</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Local / Campo */}
              {editType === 'match' && editHomeAway === 'home' ? (
                <div className="p-3.5 bg-emerald-500/10 border-2 border-emerald-400/40 rounded-2xl flex items-center justify-between shadow-2xs">
                  <div className="space-y-1 min-w-0 flex-1 pr-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <MapPin size={13} className="text-emerald-400 shrink-0" />
                      <span>Campo do Jogo (Automático - Em Casa)</span>
                    </span>
                    <p className="text-xs font-black text-white truncate">
                      🏟️ {(() => {
                        const cascais = getCascaisHomeField()
                        return cascais ? `${cascais.name} ${cascais.address ? `(${cascais.address})` : ''}` : 'Estádio do Dramático de Cascais'
                      })()}
                    </p>
                  </div>
                  {editLocationText && (
                    <a
                      href={getGoogleMapsUrl(editLocationText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-black text-csc-dark bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-xl shadow-2xs shrink-0"
                      title="Ver no Google Maps"
                    >
                      <MapPin size={12} className="text-red-500" />
                      <span>Maps</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-white/70 flex items-center justify-between">
                    <span>📍 Campo / Instalação</span>
                    {editLocationText && <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full truncate max-w-[150px]">✓ {editLocationText}</span>}
                  </label>
                  <select
                    required
                    value={editFieldId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setQuickFieldTarget('edit')
                        setIsQuickFieldModalOpen(true)
                      } else {
                        setEditFieldId(e.target.value)
                        const sel = fields.find(f => f.id === e.target.value)
                        if (sel) {
                          setEditLocationText(sel.address ? `${sel.name} (${sel.address})` : sel.name)
                        } else {
                          setEditLocationText('')
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-medium bg-white text-gray-900"
                  >
                    <option value="">-- Escolher Campo / Instalação --</option>
                    <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Campo...</option>
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>🏟️ {f.name} {f.address ? `(${f.address})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Gestão de Convocatórias */}
              {editType === 'practice' ? (
                <div className="p-4 bg-emerald-500/10 border-2 border-emerald-400/30 rounded-2xl space-y-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white mx-auto flex items-center justify-center font-black text-lg shadow-xs">
                    <Sparkles size={20} className="text-amber-300" />
                  </div>
                  <p className="text-xs font-black text-emerald-200">Convocatória Automática de Treino</p>
                  <p className="text-[11px] text-emerald-300/80 leading-snug">
                    Para os treinos todos os membros ativos do clube estão automaticamente convocados.
                  </p>
                </div>
              ) : editingEvent && (() => {
                const rawCurrentCallups = eventCallups[editingEvent.id] || []
                const eligibleMembers = allPlayers.filter(p => isPlayerEligible(p, editingEvent.type, editingEvent.tournament_id))
                const currentCallups = rawCurrentCallups.filter(c => {
                  const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                  return p ? isPlayerEligible(p, editingEvent.type, editingEvent.tournament_id) : false
                })
                const calledPlayerIds = currentCallups.map(c => c.player_id)

                const isMemberCalled = (player: Profile) => {
                  return calledPlayerIds.includes(player.id) || currentCallups.some(c => 
                    c.player_id === player.id || 
                    (c.player && (
                      c.player.id === player.id ||
                      (c.player.name && player.name && c.player.name.toLowerCase().trim() === player.name.toLowerCase().trim()) ||
                      (c.player.email && player.email && c.player.email.toLowerCase().trim() === player.email.toLowerCase().trim())
                    ))
                  )
                }

                const calledMembersCount = eligibleMembers.filter(p => isMemberCalled(p)).length
                const editUncalledPlayers = eligibleMembers.filter(p => !isMemberCalled(p))

                const handleEditAddAll = async () => {
                  if (editUncalledPlayers.length === 0 || isBatchCallingRef.current) return
                  isBatchCallingRef.current = true
                  setIsBatchCalling(true)
                  try {
                    const validIds = await ensurePlayerIdsForSupabase(editUncalledPlayers.map(p => p.id), allPlayers)
                    if (validIds.length > 0) {
                      const { data: existingDbCallups } = await supabase
                        .from('callups')
                        .select('player_id')
                        .eq('event_id', editingEvent.id)

                      const existingPlayerIds = new Set((existingDbCallups || []).map(c => c.player_id))
                      const toInsert = validIds.filter(pId => pId && !existingPlayerIds.has(pId))

                      if (toInsert.length > 0) {
                        const payload = toInsert.map(pId => ({
                          event_id: editingEvent.id,
                          player_id: pId,
                          status: 'called' as const
                        }))
                        const { error } = await supabase.from('callups').upsert(payload, {
                          onConflict: 'event_id, player_id',
                          ignoreDuplicates: true
                        })
                        if (error) {
                          const { error: insertErr } = await supabase.from('callups').insert(payload)
                          if (insertErr) throw insertErr
                        }
                      }
                      await fetchData()
                      // Mensagem com a contagem real inserida, não uma afirmação genérica de "todos" — se
                      // um clique duplo ou uma corrida com outra ação já tinha adicionado alguns entretanto,
                      // o toast até agora dizia sempre "sucesso total" mesmo quando só entrou 1.
                      toast.success(
                        toInsert.length > 0
                          ? `${toInsert.length} membro(s) convocado(s) com sucesso!`
                          : 'Já estavam todos convocados.'
                      )
                    }
                  } catch (err: any) {
                    toast.error('Erro ao convocar todos: ' + err.message)
                  } finally {
                    isBatchCallingRef.current = false
                    setIsBatchCalling(false)
                  }
                }

                const handleEditRemoveAll = () => {
                  if (currentCallups.length === 0 || isBatchCallingRef.current) return
                  setConfirmModalConfig({
                    isOpen: true,
                    title: 'Limpar Todos os Convocados',
                    description: 'Tens a certeza que desejas remover todos os membros e atletas convocados para este evento?',
                    confirmText: 'Sim, Limpar Convocatória',
                    cancelText: 'Cancelar',
                    variant: 'danger',
                    onConfirm: async () => {
                      if (isBatchCallingRef.current) return
                      isBatchCallingRef.current = true
                      setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
                      setIsBatchCalling(true)
                      try {
                        const { error } = await supabase.from('callups').delete().eq('event_id', editingEvent.id)
                        if (error) throw error
                        await fetchData()
                        toast.info('Todos os convocados foram removidos.')
                      } catch (err: any) {
                        toast.error('Erro ao remover todos: ' + err.message)
                      } finally {
                        isBatchCallingRef.current = false
                        setIsBatchCalling(false)
                      }
                    }
                  })
                }

                const filteredMembers = allPlayers.filter(p => 
                  p.name.toLowerCase().includes(editPlayerSearchTerm.toLowerCase()) ||
                  (p.jersey_number && p.jersey_number.toString().includes(editPlayerSearchTerm))
                )

                return (
                  <div className="p-4 bg-white/5 border-2 border-amber-400/30 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Users size={15} className="text-csc-gold" />
                        <span>Convocatória ({calledMembersCount} convocados)</span>
                      </span>
                      <span className="text-[10px] bg-white/10 text-csc-gold font-bold px-2 py-0.5 rounded-full">
                        {eligibleMembers.length} Membros
                      </span>
                    </div>

                    {/* Botões Rápidos */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleEditAddAll}
                        disabled={editUncalledPlayers.length === 0 || isBatchCalling}
                        className="px-2.5 py-1.5 bg-csc-gold hover:brightness-95 text-csc-dark rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <Sparkles size={12} className="text-csc-dark" />
                        <span>{isBatchCalling ? 'A processar...' : `✨ Convocar Todos (${editUncalledPlayers.length})`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleEditRemoveAll}
                        disabled={currentCallups.length === 0 || isBatchCalling}
                        className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <span>✕ Remover Todos</span>
                      </button>
                    </div>

                    {/* Barra de Pesquisa de Membros na Edição */}
                    <div className="relative">
                      <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={editPlayerSearchTerm}
                        onChange={(e) => setEditPlayerSearchTerm(e.target.value)}
                        placeholder="Pesquisar membro na convocatória..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-gray-900"
                      />
                    </div>

                    {/* Lista de membros um a um */}
                    <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-2xl">
                      {filteredMembers.map(p => {
                        const callup = currentCallups.find(c => 
                          c.player_id === p.id ||
                          (c.player && (
                            c.player.id === p.id ||
                            (c.player.name && p.name && c.player.name.toLowerCase().trim() === p.name.toLowerCase().trim()) ||
                            (c.player.email && p.email && c.player.email.toLowerCase().trim() === p.email.toLowerCase().trim())
                          ))
                        )
                        const isCalled = isMemberCalled(p)

                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              if (isCalled && callup) {
                                handleRemovePlayerFromCallup(callup.id, editingEvent.id)
                              } else {
                                handleAddPlayerToCallup(editingEvent.id, p.id)
                              }
                            }}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                              isCalled
                                ? 'bg-amber-50/80 font-black text-gray-900 border border-amber-200'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isCalled}
                                onChange={() => {}}
                                className="h-4 w-4 text-csc-dark rounded border-gray-300 pointer-events-none"
                              />
                              <div className="w-6 h-6 rounded-lg bg-csc-dark text-csc-gold flex items-center justify-center font-black text-[10px] shrink-0">
                                {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                              </div>
                              <span className="truncate">{getPlayerDisplayName(p)}</span>
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isCalled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                              {isCalled ? '✓ Convocado' : '+ Convocar'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Estado do Evento (Ativo vs Rascunho) */}
              <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer">
                    <Send size={14} className={editIsActive ? 'text-emerald-600' : 'text-amber-600'} />
                    <span>Estado: {editIsActive ? 'Ativo (Publicado)' : 'Rascunho (Inativo)'}</span>
                  </label>
                  <p className="text-[10.5px] text-white/70 mt-0.5">
                    {editIsActive ? 'Visível a todos os atletas na agenda' : 'Oculto aos atletas até ser ativado'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-white/70 mb-1">Descrição / Notas</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white resize-none text-gray-900" placeholder="Informações adicionais, ementa do convívio..." />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleAttemptCloseEditModal} className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingEdit} className="flex-1 px-4 py-2.5 bg-csc-gold hover:brightness-95 text-csc-dark font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50">
                  {isSavingEdit ? 'A guardar...' : '💾 Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Criação rápida de campo e de adversário, a partir do formulário de evento */}
      <QuickFieldModal
        isOpen={isQuickFieldModalOpen}
        name={quickFieldName}
        address={quickFieldAddress}
        onNameChange={setQuickFieldName}
        onAddressChange={setQuickFieldAddress}
        onSubmit={handleSaveQuickField}
        onClose={handleAttemptCloseQuickFieldModal}
        isSaving={isSavingQuickField}
      />

      <QuickOpponentModal
        isOpen={isQuickOpponentModalOpen}
        name={quickOppName}
        initials={quickOppInitials}
        homeFieldId={quickOppHomeFieldId}
        contactName={quickOppContactName}
        contactPhone={quickOppContactPhone}
        fields={fields}
        onNameChange={setQuickOppName}
        onInitialsChange={setQuickOppInitials}
        onHomeFieldIdChange={setQuickOppHomeFieldId}
        onContactNameChange={setQuickOppContactName}
        onContactPhoneChange={setQuickOppContactPhone}
        onSubmit={handleSaveQuickOpponent}
        onClose={handleAttemptCloseQuickOppModal}
        isSaving={isSavingQuickOpp}
      />

      {/* Guardar a edição de um evento já convocado: reenviar pedidos ou manter respostas */}
      <ResendCallupsModal
        isOpen={isResendPromptOpen}
        onResend={() => handleConfirmSaveEdit(true)}
        onKeepAnswers={() => handleConfirmSaveEdit(false)}
        onBack={() => setIsResendPromptOpen(false)}
        isSaving={isSavingEdit}
      />

      <UnsavedChangesModal
        isOpen={unsavedModalTarget !== null}
        onSaveAndExit={async () => {
          if (unsavedModalTarget === 'edit') {
            setUnsavedModalTarget(null)
            setIsResendPromptOpen(true)
          } else if (unsavedModalTarget === 'quickField') {
            setUnsavedModalTarget(null)
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent
            await handleSaveQuickField(fakeEvent)
          } else if (unsavedModalTarget === 'quickOpp') {
            setUnsavedModalTarget(null)
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent
            await handleSaveQuickOpponent(fakeEvent)
          }
        }}
        onExitWithoutSaving={() => {
          if (unsavedModalTarget === 'edit') {
            setEditingEvent(null)
          } else if (unsavedModalTarget === 'quickField') {
            setIsQuickFieldModalOpen(false)
            setQuickFieldName('')
            setQuickFieldAddress('')
          } else if (unsavedModalTarget === 'quickOpp') {
            setIsQuickOpponentModalOpen(false)
            setQuickOppName('')
            setQuickOppInitials('')
            setQuickOppHomeFieldId('')
            setQuickOppContactName('')
            setQuickOppContactPhone('')
          }
          setUnsavedModalTarget(null)
        }}
        onCancel={() => setUnsavedModalTarget(null)}
      />

      {/* Modal de Ficha de Jogo (Esquema Tático, Marcadores, Cartões e Ocorrências) */}
      {activeCallupModalEvent && activeCallupModalEvent.type === 'match' && (
        <MatchReportModal
          isOpen={isMatchReportOpen}
          onClose={() => setIsMatchReportOpen(false)}
          eventId={activeCallupModalEvent.id}
          event={activeCallupModalEvent}
          isCoachOrAdmin={!!isCoachOrAdmin}
          tournamentRules={tournaments.find(t => t.id === activeCallupModalEvent.tournament_id)?.rules}
          onSaved={() => {
            fetchData()
          }}
        />
      )}

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

    </div>
  )
}

export default EventsPage
