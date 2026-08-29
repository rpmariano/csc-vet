import React, { useEffect, useState } from 'react'
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
  Save,
  Send,
  RefreshCw
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { toast } from '../context/ToastContext'

export const getPlayerDisplayName = (player?: { name?: string; shirt_name?: string | null; nickname?: string | null } | null): string => {
  if (!player) return 'Atleta'
  const shirt = player.shirt_name?.trim()
  if (shirt) return shirt
  const nick = player.nickname?.trim()
  if (nick) return nick
  return player.name || 'Atleta'
}

const mergeProfilesWithSeedData = (remoteProfiles: Profile[]): Profile[] => {
  const emailMap = new Map<string, Profile>()

  // 1. Iniciar com todos os 31 atletas do plantel (dados do PDF)
  INITIAL_PLAYERS_DATA.forEach((seedPlayer, idx) => {
    const emailKey = (seedPlayer.email || `player-${idx}@csc.pt`).toLowerCase().trim()
    emailMap.set(emailKey, {
      ...seedPlayer,
      id: `seed-${idx}`,
    } as Profile)
  })

  // 2. Sobrepor perfis do Supabase (que têm UUIDs reais, fotos carregadas e edições mais recentes)
  remoteProfiles.forEach((remotePlayer) => {
    if (remotePlayer.email) {
      const emailKey = remotePlayer.email.toLowerCase().trim()
      const existing = emailMap.get(emailKey)
      emailMap.set(emailKey, {
        ...(existing || {}),
        ...remotePlayer,
        shirt_name: remotePlayer.shirt_name || existing?.shirt_name || null,
        jersey_number: remotePlayer.jersey_number ?? existing?.jersey_number ?? null,
      })
    } else {
      emailMap.set(remotePlayer.id, remotePlayer)
    }
  })

  return Array.from(emailMap.values()).sort((a, b) => {
    if (a.jersey_number && b.jersey_number) return a.jersey_number - b.jersey_number
    if (a.jersey_number) return -1
    if (b.jersey_number) return 1
    return getPlayerDisplayName(a).localeCompare(getPlayerDisplayName(b))
  })
}

const ensurePlayerIdsForSupabase = async (pIds: string[], playerList: Profile[]): Promise<string[]> => {
  const playerMap = new Map<string, Profile>(playerList.map(p => [p.id, p]))
  const resolvedIds: string[] = []

  for (const id of pIds) {
    if (!id.startsWith('seed-')) {
      resolvedIds.push(id)
      continue
    }
    const seedP = playerMap.get(id)
    if (!seedP) continue

    try {
      if (seedP.email) {
        const { data: existing } = await supabase.from('profiles').select('id').eq('email', seedP.email).maybeSingle()
        if (existing && existing.id) {
          seedP.id = existing.id
          resolvedIds.push(existing.id)
          continue
        }
      }
      
      const newId = crypto.randomUUID()
      const { error } = await supabase.from('profiles').insert([{
        id: newId,
        name: seedP.name,
        shirt_name: seedP.shirt_name || null,
        jersey_number: seedP.jersey_number || null,
        position: seedP.position || null,
        role: seedP.role || 'player',
        status: seedP.status || 'active',
        email: seedP.email || null,
        phone: seedP.phone || null,
        birth_date: seedP.birth_date || null
      }])
      if (!error) {
        seedP.id = newId
        resolvedIds.push(newId)
      }
    } catch (err) {
      console.error('Error ensuring profile exists:', err)
    }
  }

  return resolvedIds
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
  tournament_id?: string | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
  max_players?: number | null
  related_gathering_id?: string | null
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
interface Tournament { id: string; name: string; season: string }

interface CallupWithPlayer {
  id: string
  event_id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined'
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
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [activeCallupModalEvent, setActiveCallupModalEvent] = useState<Event | null>(null)
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [rsvpTabFilter, setRsvpTabFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')
  
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
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isResendPromptOpen, setIsResendPromptOpen] = useState(false)
  const [unsavedModalTarget, setUnsavedModalTarget] = useState<'edit' | 'quickField' | 'quickOpp' | null>(null)
  const [viewModeTab, setViewModeTab] = useState<'create' | 'list'>('create')

  // Estados para Filtros da Lista de Eventos Agendados
  const [eventListSearch, setEventListSearch] = useState('')
  const [eventListTypeFilter, setEventListTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [eventListTimeFilter, setEventListTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')

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
    setEditDescription(ev.description || '')
    setEditIsFriendly(ev.is_friendly ?? false)
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
      const payload: any = {
        title: computedEditTitle,
        type: editType,
        date_time: fullIsoDateTime,
        meeting_time: editMeetingTime ? `${editMeetingTime}:00` : null,
        field_id: editFieldId || null,
        location: !editFieldId ? (editLocationText.trim() || null) : null,
        description: editDescription.trim() || null,
        max_players: null,
        is_friendly: editType === 'match' ? editIsFriendly : false,
        tournament_id: (editType === 'match' && !editIsFriendly) ? (editTournamentId || null) : null,
        opponent_id: editType === 'match' ? (editOpponentId || null) : null,
        home_away: editType === 'match' ? editHomeAway : null,
      }

      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', editingEvent.id)

      if (error) throw error

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
      const [evRes, fRes, oRes, tRes, profRes, callRes] = await Promise.all([
        supabase.from('events').select('*').order('date_time', { ascending: false }),
        supabase.from('fields').select('id, name, address'),
        supabase.from('opponents').select('id, name, home_field_id'),
        supabase.from('tournaments').select('id, name, season'),
        supabase.from('profiles').select('*').order('name', { ascending: true }),
        supabase.from('callups').select('id, event_id, player_id, status, player:profiles(id, name, photo_url, jersey_number, role, medical_notes)')
      ])

      if (evRes.data) setEvents(evRes.data as Event[])
      if (fRes.data) setFields(fRes.data as Field[])
      if (oRes.data) setOpponents(oRes.data)
      if (tRes.data) setTournaments(tRes.data)
      if (profRes.data) {
        const merged = mergeProfilesWithSeedData((profRes.data as Profile[]) || [])
        setAllPlayers(merged)
        const initialEligible = merged.filter(p => p.status !== 'inactive')
        setSelectedPlayerIds(initialEligible.map(p => p.id))
      }

      if (callRes.data && evRes.data && profRes.data) {
        const eventsList = evRes.data as Event[]
        const practiceEventIds = new Set(eventsList.filter(e => e.type === 'practice').map(e => e.id))
        const merged = mergeProfilesWithSeedData((profRes.data as Profile[]) || [])
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

  const isPlayerEligible = (player: Profile, eventType: string) => {
    if (player.status === 'inactive') return false
    if (eventType === 'gathering') return true
    return player.status === 'active'
  }

  useEffect(() => {
    setSelectedPlayerIds(prev => prev.filter(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? isPlayerEligible(p, type) : false
    }))
  }, [type, allPlayers])

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
    const eligible = allPlayers.filter(p => isPlayerEligible(p, type))
    setSelectedPlayerIds(eligible.map(p => p.id))
  }

  const handleSelectOnlyPlayers = () => {
    const players = allPlayers.filter(p => {
      const roles = extractRolesFromProfile(p)
      return roles.includes('player') && isPlayerEligible(p, type)
    })
    setSelectedPlayerIds(players.map(p => p.id))
  }

  const handleSelectStaff = () => {
    const staff = allPlayers.filter(p => {
      const roles = extractRolesFromProfile(p)
      return (roles.includes('coach') || roles.includes('admin')) && isPlayerEligible(p, type)
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
        return p ? isPlayerEligible(p, type) : false
      })
      setSelectedPlayerIds(validLastIds)
      toast.success('Convocatória anterior repetida com sucesso!')
    } else {
      toast.info('Ainda não existem convocatórias anteriores para repetir.')
    }
  }

  const togglePlayer = (id: string) => {
    const p = allPlayers.find(pl => pl.id === id)
    if (p && !isPlayerEligible(p, type)) {
      toast.warning('Este membro está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
      return
    }

    const willSelect = !selectedPlayerIds.includes(id)
    if (willSelect && maxPlayers !== '' && selectedPlayerIds.length >= Number(maxPlayers)) {
      if (!confirm(`⚠️ Aviso de Limite: A convocatória já atingiu o limite definido de ${maxPlayers} membros (${selectedPlayerIds.length} selecionados).\n\nDeseja convocar este elemento mesmo assim?`)) {
        return
      }
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
    setSuccessMessage(null)

    if (!eventDate || !eventTime) {
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
          tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
          opponent_id: type === 'match' ? (opponentId || null) : null,
          home_away: type === 'match' ? homeAway : null,
          created_by: profile?.id
        }))

        const { data: createdBatch, error } = await supabase
          .from('events')
          .insert(eventsToInsert)
          .select()

        if (error) throw error
        if (createdBatch) createdEventsList = createdBatch as Event[]

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

        const successText = `✨ ${createdEventsList.length} eventos criados com sucesso até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`
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
          tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
          opponent_id: type === 'match' ? (opponentId || null) : null,
          home_away: type === 'match' ? homeAway : null,
          created_by: profile?.id
        }

        const { data: createdEvent, error } = await supabase
          .from('events')
          .insert([newEvent])
          .select()
          .single()

        if (error) throw error

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

        const successText = '🎉 Evento criado e convocatória enviada aos membros!'
        setSuccessMessage(successText)
        toast.success(successText)
      }

      await fetchData()
      
      // Reset form
      setTitle('')
      setDescription('')
      setTournamentId('')
      setOpponentId('')
      setIsFriendly(false)
      setHomeAway('home')
      setMaxPlayers('')
      setIsRecurring(false)
      setRecurrenceEndDate('')
    } catch (err: any) {
      console.error(err)
      toast.error("Erro ao criar evento: " + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if(!confirm("Tem a certeza que deseja eliminar este evento?")) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id))
      toast.success('Evento eliminado com sucesso!')
    }
  }

  const handleUpdateCallupStatus = async (callupId: string, eventId: string, newStatus: 'confirmed' | 'declined' | 'called') => {
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
      toast.success('Estado de presença atualizado!')
    } catch (err: any) {
      toast.error('Erro ao atualizar RSVP: ' + err.message)
    }
  }

  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    try {
      const [validPlayerId] = await ensurePlayerIdsForSupabase([playerId], allPlayers)
      if (!validPlayerId) {
        toast.error('Não foi possível processar o atleta.')
        return
      }

      const { data, error } = await supabase.from('callups').insert([{
        event_id: eventId,
        player_id: validPlayerId,
        status: 'called'
      }]).select('id, event_id, player_id, status, player:profiles(id, name, photo_url, jersey_number, role, medical_notes)').single()

      if (error) throw error

      if (data) {
        setEventCallups(prev => ({
          ...prev,
          [eventId]: [...(prev[eventId] || []), data as unknown as CallupWithPlayer]
        }))
        toast.success('Atleta adicionado à convocatória!')
      }
    } catch (err: any) {
      toast.error('Erro ao convocar: ' + err.message)
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

  const currentLocationStr = getActiveLocationString()

  const totalCount = allPlayers.length
  const playersCount = allPlayers.filter(p => extractRolesFromProfile(p).includes('player')).length
  const staffCount = allPlayers.filter(p => {
    const roles = extractRolesFromProfile(p)
    return roles.includes('coach') || roles.includes('admin')
  }).length

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark flex items-center gap-2.5">
          <Calendar size={32} />
          <span>Gestão & Criação de Eventos</span>
        </h1>
        <p className="text-gray-550 mt-1 text-sm">
          Crie eventos, convívios, reuniões, treinos e jogos com localização Google Maps e monitorização em tempo real do RSVP dos membros.
        </p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl border-2 border-emerald-300 text-sm font-bold flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Seletor de Modo: Criar Novo Evento vs Lista de Eventos Agendados */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl max-w-md border border-gray-200 shadow-2xs">
        <button
          type="button"
          onClick={() => setViewModeTab('create')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            viewModeTab === 'create'
              ? 'bg-csc-dark text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
          }`}
        >
          <Plus size={16} className={viewModeTab === 'create' ? 'text-csc-gold' : ''} />
          <span>Criar Novo Evento</span>
        </button>

        <button
          type="button"
          onClick={() => setViewModeTab('list')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
            viewModeTab === 'list'
              ? 'bg-csc-dark text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
          }`}
        >
          <CalendarRange size={16} className={viewModeTab === 'list' ? 'text-csc-gold' : ''} />
          <span>Eventos Agendados ({events.length})</span>
        </button>
      </div>

      {/* ABA 1: FORMULÁRIO DE CRIAÇÃO (FOCADO, SEM EVENTOS POR BAIXO) */}
      {viewModeTab === 'create' && (
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-sm border border-gray-200 p-5 sm:p-7">
          <div className="flex items-center justify-between pb-3 mb-5 border-b border-gray-150">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Plus size={20} className="text-csc-dark" />
              <span>Novo Evento / Atividade</span>
            </h3>
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              CSC Organizer
            </span>
          </div>

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
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white font-medium"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
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
                <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">Hora *</label>
                <input type="time" required value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold" />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">Concentração</label>
                <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white" />
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
                  }} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark bg-white text-xs font-medium">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white resize-none"
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
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white font-bold"
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark"
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

            <button
              type="submit"
              className="w-full py-3.5 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-2xl font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-sm"
            >
              <Check size={18} className="text-csc-gold" />
              <span>Publicar Evento e Convoques</span>
            </button>
          </form>
        </div>
      )}

      {/* ABA 2: LISTA DE EVENTOS REGISTADOS & RSVP */}
      {viewModeTab === 'list' && (() => {
        const filteredScheduledEvents = events.filter((event) => {
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
          <div className="max-w-5xl mx-auto space-y-4">
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
                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-csc-dark outline-none transition-all"
                  />
                  {eventListSearch && (
                    <button 
                      onClick={() => setEventListSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>

                {/* Filtro Temporal (Próximos / Anteriores / Todos) */}
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto shrink-0">
                  {[
                    { id: 'upcoming', label: 'Próximos' },
                    { id: 'past', label: 'Anteriores' },
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

            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-gray-150">
                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <CalendarRange size={20} className="text-csc-dark" />
                  <span>Lista de Eventos & Quórum RSVP</span>
                </h3>
                <span className="text-xs font-bold text-gray-500">
                  A apresentar {filteredScheduledEvents.length} de {events.length} registados
                </span>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
                </div>
              ) : filteredScheduledEvents.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-6">
                  <Calendar size={40} className="mx-auto text-gray-300 mb-2" />
                  <p className="font-bold text-gray-700">Nenhum evento encontrado com os filtros atuais.</p>
                  <p className="text-xs text-gray-500 mt-1">Tente alterar os filtros ou o termo de pesquisa.</p>
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
                      className="p-4 bg-gray-50 hover:bg-amber-50/30 rounded-2xl border-2 border-gray-200 hover:border-amber-300 transition-all shadow-2xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <h4 className="font-black text-gray-900 text-base leading-tight">
                            {event.type === 'match' && event.opponent_id ? `CSC vs ${getOpponentName(event.opponent_id)} • ${event.title}` : event.title}
                          </h4>
                        </div>

                        {isCoachOrAdmin && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => openEditModal(event)}
                              className="text-gray-400 hover:text-blue-600 p-1.5 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Editar evento"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteEvent(event.id)}
                              className="text-gray-400 hover:text-red-600 p-1.5 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
                              title="Eliminar evento"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Event Meta Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700 bg-white/70 p-2.5 rounded-xl border border-gray-150">
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-csc-dark shrink-0" />
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
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-gray-200">
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

                        <button
                          onClick={() => {
                            setActiveCallupModalEvent(event)
                            setRsvpTabFilter('all')
                            setPlayerSearchTerm('')
                          }}
                          className="w-full sm:w-auto px-4 py-2 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                        >
                          <Users size={14} className="text-csc-gold" />
                          <span>Ver Detalhes & RSVP ({callups.length})</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )})()}

      {/* ========================================================================= */}
      {/* MODAL DETALHADO DE CONVOCATÓRIA & GESTÃO COMPLETA DE RSVP                */}
      {/* ========================================================================= */}
      {activeCallupModalEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-amber-300">
            <button
              onClick={() => setActiveCallupModalEvent(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 cursor-pointer"
            >
              <X size={20} />
            </button>

            {/* Modal Header */}
            <div className="mb-4 pr-8">
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full">
                Dossier de Evento & RSVP
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
                {activeCallupModalEvent.title}
              </h2>
              
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mt-2">
                <div className="flex items-center gap-1 font-bold">
                  <Clock size={14} className="text-csc-dark" />
                  <span>
                    {new Date(activeCallupModalEvent.date_time).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' })}
                  </span>
                </div>
                {(() => {
                  const fieldObj = fields.find(f => f.id === activeCallupModalEvent.field_id)
                  const locationName = activeCallupModalEvent.field_id ? getFieldName(activeCallupModalEvent.field_id) : (activeCallupModalEvent.location || 'Sem local')
                  const mapsQuery = fieldObj ? (fieldObj.address ? `${fieldObj.name}, ${fieldObj.address}` : fieldObj.name) : (activeCallupModalEvent.location || '')

                  return (
                    <div className="flex items-center gap-1 font-semibold">
                      <MapPin size={14} className="text-red-600" />
                      <span>{locationName}</span>
                      {mapsQuery && (
                        <a
                          href={getGoogleMapsUrl(mapsQuery)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-csc-dark bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1"
                        >
                          <span>Ver no Maps</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

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
                  {/* Quorum Metric Cards */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <button 
                      type="button"
                      onClick={() => setRsvpTabFilter(prev => prev === 'confirmed' ? 'all' : 'confirmed')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
                        rsvpTabFilter === 'confirmed' ? 'bg-emerald-100 border-emerald-500 shadow-md ring-2 ring-emerald-500/40' : 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/60'
                      }`}
                      title="Filtrar por Confirmados"
                    >
                      <p className="text-2xl font-black text-emerald-800">{confirmedList.length}</p>
                      <p className="text-[11px] font-bold text-emerald-900 flex items-center justify-center gap-1 mt-0.5">
                        <CheckCircle2 size={12} /> Confirmados
                      </p>
                      {rsvpTabFilter === 'confirmed' && (
                        <span className="text-[9px] font-black uppercase text-emerald-900 bg-emerald-200/90 px-1.5 py-0.2 rounded-full mt-1">
                          Filtro Ativo
                        </span>
                      )}
                    </button>

                    <button 
                      type="button"
                      onClick={() => setRsvpTabFilter(prev => prev === 'called' ? 'all' : 'called')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
                        rsvpTabFilter === 'called' ? 'bg-amber-100 border-amber-500 shadow-md ring-2 ring-amber-500/40' : 'bg-amber-50/70 border-amber-200 hover:bg-amber-100/60'
                      }`}
                      title="Filtrar por Pendentes"
                    >
                      <p className="text-2xl font-black text-amber-800">{pendingList.length}</p>
                      <p className="text-[11px] font-bold text-amber-900 flex items-center justify-center gap-1 mt-0.5">
                        <HelpCircle size={12} /> Pendentes
                      </p>
                      {rsvpTabFilter === 'called' && (
                        <span className="text-[9px] font-black uppercase text-amber-900 bg-amber-200/90 px-1.5 py-0.2 rounded-full mt-1">
                          Filtro Ativo
                        </span>
                      )}
                    </button>

                    <button 
                      type="button"
                      onClick={() => setRsvpTabFilter(prev => prev === 'declined' ? 'all' : 'declined')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-center ${
                        rsvpTabFilter === 'declined' ? 'bg-red-100 border-red-500 shadow-md ring-2 ring-red-500/40' : 'bg-red-50/70 border-red-200 hover:bg-red-100/60'
                      }`}
                      title="Filtrar por Recusados"
                    >
                      <p className="text-2xl font-black text-red-800">{declinedList.length}</p>
                      <p className="text-[11px] font-bold text-red-900 flex items-center justify-center gap-1 mt-0.5">
                        <XCircle size={12} /> Recusados
                      </p>
                      {rsvpTabFilter === 'declined' && (
                        <span className="text-[9px] font-black uppercase text-red-900 bg-red-200/90 px-1.5 py-0.2 rounded-full mt-1">
                          Filtro Ativo
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 border-b border-gray-200 pb-2 overflow-x-auto text-xs">
                    <button
                      type="button"
                      onClick={() => setRsvpTabFilter('all')}
                      className={`px-3 py-1.5 rounded-xl font-black transition-colors ${
                        rsvpTabFilter === 'all' ? 'bg-csc-dark text-white' : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      Todos ({callups.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRsvpTabFilter('confirmed')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                        rsvpTabFilter === 'confirmed' ? 'bg-emerald-700 text-white' : 'text-emerald-800 hover:bg-emerald-50'
                      }`}
                    >
                      ✓ Confirmados ({confirmedList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRsvpTabFilter('called')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                        rsvpTabFilter === 'called' ? 'bg-amber-700 text-white' : 'text-amber-800 hover:bg-amber-50'
                      }`}
                    >
                      ⏳ Pendentes ({pendingList.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRsvpTabFilter('declined')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-colors ${
                        rsvpTabFilter === 'declined' ? 'bg-red-700 text-white' : 'text-red-800 hover:bg-red-50'
                      }`}
                    >
                      ✕ Recusados ({declinedList.length})
                    </button>
                  </div>

                  {/* Convidar mais elementos à convocatória */}
                  {isCoachOrAdmin && uncalledPlayers.length > 0 && (
                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                      <p className="text-xs font-black text-gray-800 flex items-center gap-1.5">
                        <UserPlus size={14} className="text-csc-dark" />
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
                      <p className="text-center text-xs text-gray-500 py-6">
                        Nenhum membro encontrado neste filtro.
                      </p>
                    ) : (
                      displayList.map(c => {
                        const roles = extractRolesFromProfile(c.player as any)

                        return (
                          <div 
                            key={c.id} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 hover:bg-white rounded-2xl border border-gray-200 transition-all gap-2"
                          >
                            {/* Member Info */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              {c.player?.photo_url ? (
                                <img
                                  src={c.player.photo_url}
                                  alt={c.player.name}
                                  className="w-8 h-8 rounded-xl object-cover border border-gray-200 shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-xl bg-csc-dark text-csc-gold flex items-center justify-center font-black text-xs shrink-0">
                                  {c.player?.jersey_number ? `#${c.player.jersey_number}` : (c.player?.name?.charAt(0) || 'M')}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-gray-900 truncate">
                                  {c.player?.jersey_number ? `#${c.player.jersey_number} ` : ''}{getPlayerDisplayName(c.player)}
                                </p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {roles.map(r => (
                                    <span
                                      key={r}
                                      className={`text-[8.5px] font-black px-1.5 py-0.2 rounded ${
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

                            {/* RSVP Status Badge & Coach Action Buttons */}
                            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-150">
                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                                c.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                c.status === 'declined' ? 'bg-red-100 text-red-800 border border-red-200' :
                                'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}>
                                {c.status === 'confirmed' ? <CheckCircle2 size={11} /> :
                                 c.status === 'declined' ? <XCircle size={11} /> :
                                 <HelpCircle size={11} />}
                                <span>{c.status === 'confirmed' ? 'Confirmado' : c.status === 'declined' ? 'Recusado' : 'Pendente'}</span>
                              </span>

                              {/* Ações Rápidas de Treinador/Admin */}
                              {isCoachOrAdmin && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'confirmed')}
                                    className={`p-1.5 rounded-lg transition-colors ${c.status === 'confirmed' ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-emerald-50 text-emerald-700 border border-gray-200'}`}
                                    title="Marcar como Confirmado"
                                  >
                                    <Check size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'declined')}
                                    className={`p-1.5 rounded-lg transition-colors ${c.status === 'declined' ? 'bg-red-600 text-white' : 'bg-white hover:bg-red-50 text-red-700 border border-gray-200'}`}
                                    title="Marcar como Recusado"
                                  >
                                    <X size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCallupStatus(c.id, activeCallupModalEvent.id, 'called')}
                                    className={`p-1.5 rounded-lg transition-colors ${c.status === 'called' ? 'bg-amber-600 text-white' : 'bg-white hover:bg-amber-50 text-amber-700 border border-gray-200'}`}
                                    title="Colocar como Pendente"
                                  >
                                    <HelpCircle size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleRemovePlayerFromCallup(c.id, activeCallupModalEvent.id)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                                    title="Remover da convocatória"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })()}

          </div>
        </div>
      )}
      {/* ====== MODAL DE EDIÇÃO DE EVENTO ====== */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={handleAttemptCloseEditModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 rounded-t-3xl flex justify-between items-center z-10">
              <h3 className="text-lg font-black text-gray-900">✏️ Editar {editType === 'gathering' ? 'Convívio' : editType === 'match' ? 'Jogo' : 'Treino'}</h3>
              <button onClick={handleAttemptCloseEditModal} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 cursor-pointer"><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tipo</label>
                <select value={editType} onChange={e => setEditType(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-medium bg-white">
                  <option value="practice">Treino</option>
                  <option value="match">Jogo</option>
                  <option value="gathering">Convívio</option>
                </select>
              </div>

              {/* Título (Apenas para Convívios) */}
              {editType === 'gathering' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Título do Convívio *</label>
                  <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required={editType === 'gathering'} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" placeholder="Ex: Jantar de Natal / Reentré" />
                </div>
              )}

              {/* Data e Hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Data</label>
                  <input type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Hora</label>
                  <input type="time" value={editEventTime} onChange={e => setEditEventTime(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" />
                </div>
              </div>

              {/* Hora de Concentração */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Hora de Concentração (opcional)</label>
                <input type="time" value={editMeetingTime} onChange={e => setEditMeetingTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" />
              </div>

              {/* Campos específicos para Jogos */}
              {editType === 'match' && (
                <div className="space-y-3 border-t border-b border-gray-200 py-3 bg-amber-50/40 p-3 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-gray-700 cursor-pointer">Amigável?</label>
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
                      <label className="block text-xs font-bold text-gray-700 mb-1">Torneio/Competição</label>
                      <select value={editTournamentId} onChange={e => setEditTournamentId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white">
                        <option value="">-- Selecionar --</option>
                        {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Adversário</label>
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                      >
                        <option value="">-- Selecionar Adversário --</option>
                        <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Adversário...</option>
                        {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Condição de Jogo</label>
                      <select value={editHomeAway} onChange={e => setEditHomeAway(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium">
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
                  <label className="block text-xs font-bold text-gray-700 flex items-center justify-between">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-medium bg-white"
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
                <div className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl space-y-2 text-center">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white mx-auto flex items-center justify-center font-black text-lg shadow-xs">
                    <Sparkles size={20} className="text-amber-300" />
                  </div>
                  <p className="text-xs font-black text-emerald-950">Convocatória Automática de Treino</p>
                  <p className="text-[11px] text-emerald-800 leading-snug">
                    Para os treinos todos os membros ativos do clube estão automaticamente convocados.
                  </p>
                </div>
              ) : editingEvent && (() => {
                const currentCallups = eventCallups[editingEvent.id] || []
                const calledPlayerIds = currentCallups.map(c => c.player_id)
                const editUncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id))

                const handleEditAddAll = async () => {
                  if (editUncalledPlayers.length === 0 || isBatchCalling) return
                  setIsBatchCalling(true)
                  try {
                    const validIds = await ensurePlayerIdsForSupabase(editUncalledPlayers.map(p => p.id), allPlayers)
                    if (validIds.length > 0) {
                      const payload = validIds.map(pId => ({
                        event_id: editingEvent.id,
                        player_id: pId,
                        status: 'called'
                      }))
                      const { error } = await supabase.from('callups').insert(payload)
                      if (error) throw error
                      await fetchData()
                      toast.success('Todos os membros foram convocados com sucesso!')
                    }
                  } catch (err: any) {
                    toast.error('Erro ao convocar todos: ' + err.message)
                  } finally {
                    setIsBatchCalling(false)
                  }
                }

                const handleEditRemoveAll = async () => {
                  if (currentCallups.length === 0 || isBatchCalling) return
                  if (!confirm('Tem a certeza que deseja remover todos os convocados deste evento?')) return
                  setIsBatchCalling(true)
                  try {
                    const callupIds = currentCallups.map(c => c.id)
                    const { error } = await supabase.from('callups').delete().in('id', callupIds)
                    if (error) throw error
                    await fetchData()
                    toast.info('Todos os convocados foram removidos.')
                  } catch (err: any) {
                    toast.error('Erro ao remover todos: ' + err.message)
                  } finally {
                    setIsBatchCalling(false)
                  }
                }

                const filteredMembers = allPlayers.filter(p => 
                  p.name.toLowerCase().includes(editPlayerSearchTerm.toLowerCase()) ||
                  (p.jersey_number && p.jersey_number.toString().includes(editPlayerSearchTerm))
                )

                return (
                  <div className="p-4 bg-gray-50 border-2 border-amber-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                        <Users size={15} className="text-csc-dark" />
                        <span>Convocatória ({calledPlayerIds.length} convocados)</span>
                      </span>
                      <span className="text-[10px] bg-csc-dark text-csc-gold font-bold px-2 py-0.5 rounded-full">
                        {allPlayers.length} Membros
                      </span>
                    </div>

                    {/* Botões Rápidos */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={handleEditAddAll}
                        disabled={editUncalledPlayers.length === 0 || isBatchCalling}
                        className="px-2.5 py-1.5 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <Sparkles size={12} className="text-csc-gold" />
                        <span>{isBatchCalling ? 'A processar...' : `✨ Convocar Todos (${editUncalledPlayers.length})`}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleEditRemoveAll}
                        disabled={currentCallups.length === 0 || isBatchCalling}
                        className="px-2.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
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
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark"
                      />
                    </div>

                    {/* Lista de membros um a um */}
                    <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-2xl">
                      {filteredMembers.map(p => {
                        const callup = currentCallups.find(c => c.player_id === p.id)
                        const isCalled = !!callup

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

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição / Notas</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white resize-none" placeholder="Informações adicionais, ementa do convívio..." />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleAttemptCloseEditModal} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" disabled={isSavingEdit} className="flex-1 px-4 py-2.5 bg-csc-dark hover:bg-csc-dark/90 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50">
                  {isSavingEdit ? 'A guardar...' : '💾 Guardar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR NOVO CAMPO INLINE */}
      {isQuickFieldModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleAttemptCloseQuickFieldModal()
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl border border-gray-100 space-y-4">
            <button
              type="button"
              onClick={handleAttemptCloseQuickFieldModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-csc-dark text-csc-gold flex items-center justify-center text-lg font-black shadow-xs">
                🏟️
              </div>
              <div>
                <h3 className="text-base font-black text-csc-dark">Criar Novo Campo / Instalação</h3>
                <p className="text-[11px] text-gray-500">Regista um novo campo para ser imediatamente selecionado.</p>
              </div>
            </div>

            <form onSubmit={handleSaveQuickField} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Campo / Estádio *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={quickFieldName}
                  onChange={(e) => setQuickFieldName(e.target.value)}
                  placeholder="Ex: Campo Municipal de Tires"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Morada / Localização Completa</label>
                <input
                  type="text"
                  value={quickFieldAddress}
                  onChange={(e) => setQuickFieldAddress(e.target.value)}
                  placeholder="Ex: Av. Amadeu Duarte, Tires, Cascais"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                />
                <p className="text-[10.5px] text-gray-500 mt-1">Usada para navegação e rotas com Google Maps.</p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-150">
                <button
                  type="button"
                  onClick={handleAttemptCloseQuickFieldModal}
                  className="px-4 py-2 border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickField || !quickFieldName.trim()}
                  className="px-5 py-2 bg-csc-dark hover:bg-black text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isSavingQuickField ? 'A criar...' : 'Guardar Campo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR NOVO ADVERSÁRIO INLINE */}
      {isQuickOpponentModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleAttemptCloseQuickOppModal()
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 relative shadow-2xl border border-gray-100 space-y-4">
            <button
              type="button"
              onClick={handleAttemptCloseQuickOppModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-900 flex items-center justify-center text-lg font-black shadow-xs">
                🛡️
              </div>
              <div>
                <h3 className="text-base font-black text-csc-dark">Criar Novo Adversário</h3>
                <p className="text-[11px] text-gray-500">Regista uma nova equipa/clube adversário para seleção imediata.</p>
              </div>
            </div>

            <form onSubmit={handleSaveQuickOpponent} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Clube / Equipa *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={quickOppName}
                  onChange={(e) => setQuickOppName(e.target.value)}
                  placeholder="Ex: G.D. Estoril Praia"
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Sigla (opcional)</label>
                  <input
                    type="text"
                    value={quickOppInitials}
                    onChange={(e) => setQuickOppInitials(e.target.value)}
                    placeholder="Ex: GDEP"
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Campo Habitual</label>
                  <select
                    value={quickOppHomeFieldId}
                    onChange={(e) => setQuickOppHomeFieldId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                  >
                    <option value="">-- Sem Campo --</option>
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>🏟️ {f.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nome do Contacto</label>
                  <input
                    type="text"
                    value={quickOppContactName}
                    onChange={(e) => setQuickOppContactName(e.target.value)}
                    placeholder="Ex: Diretor desportivo"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Telefone Contacto</label>
                  <input
                    type="tel"
                    value={quickOppContactPhone}
                    onChange={(e) => setQuickOppContactPhone(e.target.value)}
                    placeholder="Ex: 912 345 678"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleAttemptCloseQuickOppModal}
                  className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickOpp || !quickOppName.trim()}
                  className="flex-1 px-4 py-2.5 bg-csc-dark hover:bg-csc-dark/90 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSavingQuickOpp ? (
                    <span>A registar...</span>
                  ) : (
                    <span>➕ Criar Adversário</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE REENVIO DE CONVOCATÓRIAS APÓS EDIÇÃO */}
      {isResendPromptOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-fade-in select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                <RefreshCw size={24} className={isSavingEdit ? 'animate-spin' : ''} />
              </div>
              <div>
                <h3 className="text-base font-black text-gray-900 leading-tight">
                  Reenviar Pedidos de Presença?
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Edição de dados do evento
                </p>
              </div>
            </div>

            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-2">
              <p className="font-bold text-gray-900">
                Foram alterados os detalhes deste evento. Desejas reenviar o pedido de confirmação a todos os atletas convocados?
              </p>
              <ul className="space-y-1.5 text-gray-700 text-[11.5px]">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold shrink-0">✓</span>
                  <span><strong className="text-emerald-950">Reenviar Pedidos:</strong> Repõe todas as presenças como <em>Pendente</em> para que os atletas respondam novamente.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-500 font-bold shrink-0">✓</span>
                  <span><strong className="text-gray-900">Manter Respostas:</strong> Guarda as alterações do evento mantendo as confirmações já registadas.</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => handleConfirmSaveEdit(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Send size={16} />
                <span>{isSavingEdit ? 'A processar...' : 'Sim, Reenviar Pedidos aos Atletas'}</span>
              </button>

              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => handleConfirmSaveEdit(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-gray-200 disabled:opacity-50"
              >
                <Save size={16} />
                <span>Não, Apenas Gravar (Manter Respostas)</span>
              </button>

              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setIsResendPromptOpen(false)}
                className="w-full py-2 text-gray-500 hover:text-gray-800 font-semibold text-xs transition-colors cursor-pointer text-center"
              >
                Voltar ao formulário de edição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE SAÍDA COM ALTERAÇÕES NÃO GUARDADAS */}
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

    </div>
  )
}

export default EventsPage
