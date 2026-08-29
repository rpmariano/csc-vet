import React, { useEffect, useState } from 'react'
import { 
  MapPin, 
  Clock, 
  Plus, 
  X, 
  Users, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Trash2, 
  Search, 
  RotateCcw, 
  AlertTriangle, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar as CalendarIcon,
  CalendarDays as CalendarDaysIcon,
  List as ListIcon,
  Repeat,
  Edit,
  Save,
  Send,
  RefreshCw,
  CalendarRange,
  PartyPopper,
  Trophy,
  Sparkles
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { useSearchParams } from 'react-router-dom'
import type { Profile } from '../context/AuthContext'
import { TrainingIcon } from './EventsPage'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'

export const getPlayerDisplayName = (player?: { name?: string; shirt_name?: string | null; nickname?: string | null } | null): string => {
  if (!player) return 'Atleta'
  const shirt = player.shirt_name?.trim()
  if (shirt) return shirt
  const nick = player.nickname?.trim()
  if (nick) return nick
  return player.name || 'Atleta'
}

export const getGoogleMapsUrl = (query: string) => query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '#'

export const formatClubSigla = (initials?: string | null): string => {
  if (!initials) return 'CSC'
  const trimmed = initials.trim()
  if (trimmed === 'GDS CASCAIS' || trimmed === 'GDSCASCAIS' || trimmed.length > 5 || trimmed.includes(' ')) {
    return 'CSC'
  }
  return trimmed.toUpperCase()
}

export const formatOpponentSigla = (opp?: { name?: string; initials?: string | null } | null): string => {
  if (!opp) return 'ADV'
  if (opp.initials && opp.initials.trim().length <= 6 && !opp.initials.trim().includes(' ')) {
    return opp.initials.trim().toUpperCase()
  }
  if (opp.name) {
    const words = opp.name.trim().split(/\s+/).filter(w => w.length > 1)
    if (words.length > 1) {
      return words.map(w => w[0].toUpperCase()).join('').substring(0, 5)
    }
    return opp.name.substring(0, 4).toUpperCase()
  }
  return 'ADV'
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

  let dbProfiles: { id: string; email?: string | null; name?: string | null }[] = []
  try {
    const { data } = await supabase.from('profiles').select('id, email, name')
    if (data) dbProfiles = data
  } catch (e) {
    console.error('Error fetching db profiles for matching:', e)
  }

  for (const id of pIds) {
    if (!id || typeof id !== 'string') continue

    if (!id.startsWith('seed-')) {
      resolvedIds.push(id)
      continue
    }
    const seedP = playerMap.get(id)
    if (!seedP) continue

    // 1. Verificar por email na BD
    const matchByEmail = seedP.email 
      ? dbProfiles.find(dp => dp.email && dp.email.toLowerCase().trim() === seedP.email!.toLowerCase().trim())
      : null

    if (matchByEmail?.id) {
      seedP.id = matchByEmail.id
      resolvedIds.push(matchByEmail.id)
      continue
    }

    // 2. Verificar por nome na BD
    const matchByName = seedP.name
      ? dbProfiles.find(dp => dp.name && dp.name.toLowerCase().trim() === seedP.name.toLowerCase().trim())
      : null

    if (matchByName?.id) {
      seedP.id = matchByName.id
      resolvedIds.push(matchByName.id)
      continue
    }

    // 3. Tentar inserir se não existir
    try {
      const newId = crypto.randomUUID()
      const { data: inserted, error } = await supabase.from('profiles').insert([{
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
      }]).select('id').maybeSingle()

      if (!error) {
        const finalId = inserted?.id || newId
        seedP.id = finalId
        dbProfiles.push({ id: finalId, email: seedP.email, name: seedP.name })
        resolvedIds.push(finalId)
      } else {
        if (seedP.name) {
          const { data: recheck } = await supabase.from('profiles').select('id').ilike('name', seedP.name.trim()).maybeSingle()
          if (recheck?.id) {
            seedP.id = recheck.id
            resolvedIds.push(recheck.id)
          }
        }
      }
    } catch (err) {
      console.error('Error ensuring profile exists:', err)
    }
  }

  return Array.from(new Set(resolvedIds.filter(id => id && !id.startsWith('seed-'))))
}

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  field_id?: string | null
  field?: {
    id: string
    name: string
    address?: string | null
  } | null
  location: string
  description: string
  is_friendly?: boolean | null
  tournament_id?: string | null
  tournament?: {
    id: string
    name: string
    season?: string | null
  } | null
  max_players?: number | null
  home_away?: 'home' | 'away' | 'neutral' | null
  related_gathering_id?: string | null
  opponent_id?: string | null
  opponent?: {
    name: string
    initials: string
    logo_url: string
  }
}

interface CallupWithPlayer {
  id: string
  event_id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined'
  player: Profile
}

interface Field {
  id: string
  name: string
  address?: string | null
}

interface Tournament {
  id: string
  name: string
  season?: string | null
}

interface Opponent {
  id: string
  name: string
  initials?: string
  logo_url?: string
  home_field_id?: string | null
}

const CalendarPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Calendar View States
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [typeFilter, setTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past' | 'my_confirmed' | 'my_declined' | 'my_pending' | 'my_called'>('all')

  // Callups state
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [modalCallupStatusFilter, setModalCallupStatusFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')
  const [isModalCallupsExpanded, setIsModalCallupsExpanded] = useState(false)
  const [currentPendingIndex, setCurrentPendingIndex] = useState(0)
  const [pendingTouchStartX, setPendingTouchStartX] = useState<number | null>(null)

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
  
  // Fluid Bottom Sheet Drag & Physics State
  const [sheetTranslateY, setSheetTranslateY] = useState(0)
  const [isDraggingSheet, setIsDraggingSheet] = useState(false)
  const sheetDragStartRef = React.useRef<{
    startX: number
    startY: number
    startTranslateY: number
    isTopHandle: boolean
    lastDeltaX: number
    lastDeltaY: number
  } | null>(null)
  const modalScrollRef = React.useRef<HTMLDivElement>(null)

  // Bloqueio rigoroso de scroll de fundo quando o modal esta aberto
  useEffect(() => {
    if (selectedEvent) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      setSheetTranslateY(0)
      setIsDraggingSheet(false)
      return () => {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [selectedEvent])

  const handleSheetTouchStart = (e: React.TouchEvent, isTopHandle: boolean = false) => {
    const touch = e.touches[0]
    const scrollTop = modalScrollRef.current ? modalScrollRef.current.scrollTop : 0
    sheetDragStartRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTranslateY: sheetTranslateY,
      isTopHandle,
      lastDeltaX: 0,
      lastDeltaY: 0
    }
    if (isTopHandle || scrollTop <= 0) {
      setIsDraggingSheet(true)
    }
  }

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (!sheetDragStartRef.current) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - sheetDragStartRef.current.startX
    const deltaY = touch.clientY - sheetDragStartRef.current.startY
    sheetDragStartRef.current.lastDeltaX = deltaX
    sheetDragStartRef.current.lastDeltaY = deltaY

    // Se o movimento for vertical e no topo da persiana
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0 && isDraggingSheet) {
        e.stopPropagation()
        setSheetTranslateY(deltaY)
      } else if (sheetTranslateY > 0) {
        e.stopPropagation()
        setSheetTranslateY(Math.max(0, sheetDragStartRef.current.startTranslateY + deltaY))
      }
    }
  }

  const handleSheetTouchEnd = () => {
    if (!sheetDragStartRef.current) return
    const { lastDeltaX, lastDeltaY } = sheetDragStartRef.current
    setIsDraggingSheet(false)

    // 1. Fechar persiana se arrastou para baixo mais de 110px
    if (sheetTranslateY > 110) {
      setSheetTranslateY(window.innerHeight || 800)
      setTimeout(() => {
        setSelectedEvent(null)
        setSheetTranslateY(0)
        setPlayerSearchTerm('')
        setModalCallupStatusFilter('all')
      }, 220)
      sheetDragStartRef.current = null
      return
    }

    setSheetTranslateY(0)

    // 2. Transição horizontal por Slide / Swipe no Carrossel (exclusivo para eventos pendentes no alerta de convocatória)
    if (selectedEvent && Math.abs(lastDeltaX) > 40 && Math.abs(lastDeltaX) > Math.abs(lastDeltaY) * 1.1) {
      if (myPendingEvents.length > 1 && myPendingEvents.some(pe => pe.id === selectedEvent.id)) {
        const curIdx = myPendingEvents.findIndex(e => e.id === selectedEvent.id)
        const activeIdx = curIdx >= 0 ? curIdx : 0

        if (lastDeltaX < -40) {
          // Slide para a Esquerda (Avançar para o Próximo Evento Pendente)
          const nextIdx = (activeIdx + 1) % myPendingEvents.length
          const nextEv = myPendingEvents[nextIdx]
          setSelectedEvent(nextEv)
          if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
        } else if (lastDeltaX > 40) {
          // Slide para a Direita (Retroceder para o Evento Pendente Anterior)
          const prevIdx = (activeIdx - 1 + myPendingEvents.length) % myPendingEvents.length
          const prevEv = myPendingEvents[prevIdx]
          setSelectedEvent(prevEv)
          if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
        }
      }
    }

    sheetDragStartRef.current = null
  }

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [dateTime, setDateTime] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('')

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([3]) // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  // Edit Event states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isResendPromptOpen, setIsResendPromptOpen] = useState(false)
  const [isSavingEditLoading, setIsSavingEditLoading] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [editDateTime, setEditDateTime] = useState('')
  const [editMeetingTime, setEditMeetingTime] = useState('')
  const [editFieldId, setEditFieldId] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMaxPlayers, setEditMaxPlayers] = useState<number | ''>('')
  const [editTournamentId, setEditTournamentId] = useState('')
  const [editOpponentId, setEditOpponentId] = useState('')
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [editIsFriendly, setEditIsFriendly] = useState(false)
  const [editPlayerSearchTerm, setEditPlayerSearchTerm] = useState('')
  const [isEditBatchCalling, setIsEditBatchCalling] = useState(false)

  // Quick Field Modal states (Criação de campo inline a partir da janela de criação/edição)
  const [isQuickFieldModalOpen, setIsQuickFieldModalOpen] = useState(false)
  const [quickFieldName, setQuickFieldName] = useState('')
  const [quickFieldAddress, setQuickFieldAddress] = useState('')
  const [quickFieldTarget, setQuickFieldTarget] = useState<'create' | 'edit'>('create')
  const [isSavingQuickField, setIsSavingQuickField] = useState(false)

  // Quick Opponent Modal states (Criação de adversário inline a partir da janela de criação/edição)
  const [isQuickOpponentModalOpen, setIsQuickOpponentModalOpen] = useState(false)
  const [quickOppName, setQuickOppName] = useState('')
  const [quickOppInitials, setQuickOppInitials] = useState('')
  const [quickOppHomeFieldId, setQuickOppHomeFieldId] = useState('')
  const [quickOppContactName, setQuickOppContactName] = useState('')
  const [quickOppContactPhone, setQuickOppContactPhone] = useState('')
  const [quickOppTarget, setQuickOppTarget] = useState<'create' | 'edit'>('create')
  const [isSavingQuickOpp, setIsSavingQuickOpp] = useState(false)

  // Unsaved changes prompt state
  const [unsavedModalTarget, setUnsavedModalTarget] = useState<'add' | 'edit' | 'quickField' | 'quickOpp' | null>(null)

  const isAddFormDirty = () => {
    return Boolean(
      title.trim() ||
      location.trim() ||
      description.trim() ||
      tournamentId ||
      opponentId ||
      maxPlayers !== '' ||
      selectedPlayerIds.length > 0 ||
      isRecurring
    )
  }

  const handleAttemptCloseAddModal = () => {
    if (isAddFormDirty()) {
      setUnsavedModalTarget('add')
    } else {
      setIsAddModalOpen(false)
    }
  }

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

  // Pre-select weekday when dateTime changes
  useEffect(() => {
    if (dateTime) {
      const d = new Date(dateTime)
      const day = d.getDay()
      if (!isNaN(day)) {
        setRecurrenceWeekdays([day])
      }
    }
  }, [dateTime])

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

  // Auto-selecionar o campo nos jogos e treinos ao criar
  useEffect(() => {
    if (isAddModalOpen) {
      if (type === 'match') {
        if (homeAway === 'home') {
          const cascais = getCascaisHomeField()
          if (cascais) {
            setFieldId(cascais.id)
            setLocation(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
          }
        } else if (homeAway === 'away' && opponentId) {
          const opp = opponents.find(o => o.id === opponentId)
          if (opp?.home_field_id) {
            setFieldId(opp.home_field_id)
            const f = fields.find(item => item.id === opp.home_field_id)
            if (f) setLocation(f.address ? `${f.name} (${f.address})` : f.name)
          }
        }
      } else if (type === 'practice' && !fieldId) {
        const cascais = getCascaisHomeField()
        if (cascais) {
          setFieldId(cascais.id)
          setLocation(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
        }
      }
    }
  }, [isAddModalOpen, type, homeAway, opponentId, opponents, fields, clubSettings])

  // Auto-selecionar o campo nos jogos ao editar
  useEffect(() => {
    if (isEditModalOpen && editType === 'match') {
      if (editHomeAway === 'home') {
        const cascais = getCascaisHomeField()
        if (cascais) {
          setEditFieldId(cascais.id)
          setEditLocation(cascais.address ? `${cascais.name} (${cascais.address})` : cascais.name)
        }
      } else if (editHomeAway === 'away' && editOpponentId) {
        const opp = opponents.find(o => o.id === editOpponentId)
        if (opp?.home_field_id) {
          setEditFieldId(opp.home_field_id)
          const f = fields.find(item => item.id === opp.home_field_id)
          if (f) setEditLocation(f.address ? `${f.name} (${f.address})` : f.name)
        }
      }
    }
  }, [isEditModalOpen, editType, editHomeAway, editOpponentId, opponents, fields, clubSettings])

  // Desativar recorrência em eventos que não sejam treino
  useEffect(() => {
    if (type !== 'practice') {
      setIsRecurring(false)
    }
  }, [type])

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
        setLocation(formattedLoc)
      } else {
        setEditFieldId(resolvedField.id)
        setEditLocation(formattedLoc)
      }

      setQuickFieldName('')
      setQuickFieldAddress('')
      setIsQuickFieldModalOpen(false)
    } catch (err: any) {
      console.error('Error saving field:', err)
      const fallbackId = `field-${Date.now()}`
      const newFieldObj: Field = {
        id: fallbackId,
        name: quickFieldName.trim(),
        address: quickFieldAddress.trim() || null
      }
      setFields(prev => [...prev, newFieldObj].sort((a, b) => a.name.localeCompare(b.name)))
      const formattedLoc = newFieldObj.address ? `${newFieldObj.name} (${newFieldObj.address})` : newFieldObj.name
      if (quickFieldTarget === 'create') {
        setFieldId(fallbackId)
        setLocation(formattedLoc)
      } else {
        setEditFieldId(fallbackId)
        setEditLocation(formattedLoc)
      }
      setQuickFieldName('')
      setQuickFieldAddress('')
      setIsQuickFieldModalOpen(false)
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
        home_field_id: quickOppHomeFieldId || null
      }

      const { data, error } = await supabase
        .from('opponents')
        .insert([{
          id: newId,
          name: newOppPayload.name,
          initials: newOppPayload.initials || null,
          home_field_id: newOppPayload.home_field_id || null,
          contact_name: quickOppContactName.trim() || null,
          contact_phone: quickOppContactPhone.trim() || null
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
          if (f) setLocation(f.address ? `${f.name} (${f.address})` : f.name)
        }
      } else {
        setEditOpponentId(resolvedOpp.id)
        if (editHomeAway === 'away' && resolvedOpp.home_field_id) {
          setEditFieldId(resolvedOpp.home_field_id)
          const f = fields.find(item => item.id === resolvedOpp.home_field_id)
          if (f) setEditLocation(f.address ? `${f.name} (${f.address})` : f.name)
        }
      }

      setIsQuickOpponentModalOpen(false)
      setQuickOppName('')
      setQuickOppInitials('')
      setQuickOppHomeFieldId('')
      setQuickOppContactName('')
      setQuickOppContactPhone('')
    } catch (err: any) {
      console.error('Error saving opponent:', err)
      const fallbackId = `opp-${Date.now()}`
      const newOppObj: Opponent = {
        id: fallbackId,
        name: quickOppName.trim(),
        initials: quickOppInitials.trim() || undefined,
        home_field_id: quickOppHomeFieldId || null
      }
      setOpponents(prev => [...prev, newOppObj].sort((a, b) => a.name.localeCompare(b.name)))
      if (quickOppTarget === 'create') {
        setOpponentId(fallbackId)
      } else {
        setEditOpponentId(fallbackId)
      }
      setIsQuickOpponentModalOpen(false)
      setQuickOppName('')
      setQuickOppInitials('')
      setQuickOppHomeFieldId('')
      setQuickOppContactName('')
      setQuickOppContactPhone('')
    } finally {
      setIsSavingQuickOpp(false)
    }
  }

  const calculateRecurringDates = (startIsoString: string, endDayString: string, weekdays: number[]) => {
    if (!startIsoString || !endDayString || weekdays.length === 0) return []
    const start = new Date(startIsoString)
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

  const getEventLocation = (ev: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null | undefined) => {
    if (!ev) return ''
    if (ev.location && ev.location.trim()) return ev.location.trim()
    if (ev.field?.name) {
      return ev.field.address ? `${ev.field.name} (${ev.field.address})` : ev.field.name
    }
    if (ev.field_id) {
      const f = fields.find(item => item.id === ev.field_id)
      if (f) return f.address ? `${f.name} (${f.address})` : f.name
    }
    return ''
  }

  const fetchEventsAndData = async () => {
    setLoading(true)
    try {
      const myCallupsPromise = profile?.id
        ? supabase
            .from('callups')
            .select('id, event_id, player_id, status, player:profiles(id, name, photo_url, shirt_name, jersey_number, nickname, role, position, status)')
            .eq('player_id', profile.id)
        : Promise.resolve({ data: [] } as any)

      const [evRes, callupsRes, myCallupsRes, profilesRes, fieldsRes, tourRes, oppsRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season), field:fields(id, name, address)')
          .order('date_time', { ascending: true }),
        supabase
          .from('callups')
          .select('id, event_id, player_id, status, player:profiles(id, name, photo_url, shirt_name, jersey_number, nickname, role, position, status)')
          .limit(5000),
        myCallupsPromise,
        supabase
          .from('profiles')
          .select('*')
          .neq('status', 'inactive')
          .order('name', { ascending: true }),
        supabase
          .from('fields')
          .select('id, name, address'),
        supabase
          .from('tournaments')
          .select('id, name, season'),
        supabase
          .from('opponents')
          .select('id, name, initials, logo_url, home_field_id')
          .order('name')
      ])

      if (fieldsRes.data) {
        setFields(fieldsRes.data as Field[])
      }

      if (oppsRes.data) {
        setOpponents(oppsRes.data as Opponent[])
      }

      if (tourRes.data) {
        setTournaments(tourRes.data as Tournament[])
      }

      if (evRes.data && evRes.data.length > 0) {
        setEvents(evRes.data as Event[])
      } else {
        setEvents([
          {
            id: '1',
            title: 'Treino Semanal Veteranos',
            type: 'practice',
            date_time: new Date(Date.now() + 86400000 * 2).toISOString(),
            location: 'Campo Sintético Municipal',
            description: 'Treino geral com foco físico e tático.'
          },
          {
            id: '2',
            title: 'CSC vs Belenenses Veteranos',
            type: 'match',
            date_time: new Date(Date.now() + 86400000 * 5).toISOString(),
            location: 'Estádio do Restelo',
            description: 'Jogo da 3ª Jornada da Liga de Veteranos.'
          }
        ])
      }

      let mergedPlayers: Profile[] = []
      if (profilesRes.data) {
        mergedPlayers = mergeProfilesWithSeedData((profilesRes.data as Profile[]) || [])
        setAllPlayers(mergedPlayers)
      }

      const allRawCallups = [
        ...((callupsRes.data || []) as any[]),
        ...(((myCallupsRes as any)?.data || []) as any[])
      ]

      // Deduplicar convocatórias por ID
      const seenCallupIds = new Set<string>()
      const uniqueCallups: any[] = []
      allRawCallups.forEach(c => {
        if (c && c.id && !seenCallupIds.has(c.id)) {
          seenCallupIds.add(c.id)
          uniqueCallups.push(c)
        }
      })

      if (uniqueCallups.length >= 0) {
        const playerMap = new Map<string, Profile>(mergedPlayers.map(p => [p.id, p]))
        const emailMap = new Map<string, Profile>(mergedPlayers.filter(p => p.email).map(p => [p.email!.toLowerCase().trim(), p]))
        const nameMap = new Map<string, Profile>(mergedPlayers.map(p => [p.name.toLowerCase().trim(), p]))

        const eventsList = (evRes.data as Event[]) || []
        const practiceEventIds = new Set(eventsList.filter(e => e.type === 'practice').map(e => e.id))

        const map: Record<string, CallupWithPlayer[]> = {}
        uniqueCallups.forEach((c: any) => {
          const fullP = playerMap.get(c.player_id) ||
            (c.player?.email ? emailMap.get(c.player.email.toLowerCase().trim()) : null) ||
            (c.player?.name ? nameMap.get(c.player.name.toLowerCase().trim()) : null) ||
            c.player

          // Para treinos: atletas lesionados ou inativos não entram na convocatória
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
        const activePlayers = mergedPlayers.filter(p => p.status === 'active' || (!p.status && p.role === 'player'))
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

  const [searchParams] = useSearchParams()

  useEffect(() => {
    fetchEventsAndData()
  }, [profile?.id])

  // Auto-selecionar evento se passado por URL (?event=<id>)
  useEffect(() => {
    const eventIdParam = searchParams.get('event')
    if (!eventIdParam) return

    const fetchCallupsForTarget = async (evId: string) => {
      try {
        const { data: cData } = await supabase
          .from('callups')
          .select('*, player:profiles(*)')
          .eq('event_id', evId)

        if (cData && cData.length > 0) {
          setEventCallups(prev => ({
            ...prev,
            [evId]: cData as CallupWithPlayer[]
          }))
        }
      } catch (e) {
        console.error('Erro ao carregar convocatórias do evento direto:', e)
      }
    }

    if (events.length > 0) {
      const target = events.find(e => e.id === eventIdParam)
      if (target) {
        setSelectedEvent(target)
        const d = new Date(target.date_time)
        setSelectedDate(d)
        setCurrentDate(d)
        fetchCallupsForTarget(eventIdParam)
        return
      }
    }

    // Se ainda não estiver na lista carregada, buscar diretamente
    const fetchTargetEvent = async () => {
      try {
        const { data } = await supabase
          .from('events')
          .select(`
            *,
            field:fields(*),
            tournament:tournaments(*),
            opponent:opponents(*)
          `)
          .eq('id', eventIdParam)
          .single()

        if (data) {
          setSelectedEvent(data as Event)
          const d = new Date(data.date_time)
          setSelectedDate(d)
          setCurrentDate(d)
          fetchCallupsForTarget(eventIdParam)
        }
      } catch (err) {
        console.error('Erro ao carregar evento do link:', err)
      }
    }
    fetchTargetEvent()
  }, [searchParams, events])

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  const isPlayerEligible = (player: Profile, eventType: string) => {
    if (player.status === 'inactive') return false
    if (eventType === 'gathering') return true
    return player.status === 'active'
  }

  // Ao mudar o tipo de evento, desmarca automaticamente jogadores inelegíveis (ex: lesionados em jogos/treinos)
  useEffect(() => {
    setSelectedPlayerIds(prev => prev.filter(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? isPlayerEligible(p, type) : false
    }))
  }, [type, allPlayers])

  const handleSelectAllPlayers = () => {
    const eligible = allPlayers.filter(p => isPlayerEligible(p, type))
    setSelectedPlayerIds(eligible.map(p => p.id))
  }

  const handleClearPlayers = () => {
    setSelectedPlayerIds([])
  }

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

  const togglePlayerSelection = (playerId: string) => {
    const p = allPlayers.find(pl => pl.id === playerId)
    if (p && !isPlayerEligible(p, type)) {
      toast.warning('Este jogador está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
      return
    }

    const willSelect = !selectedPlayerIds.includes(playerId)
    if (willSelect && maxPlayers !== '' && selectedPlayerIds.length >= Number(maxPlayers)) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Limite de Convocatória Atingido',
        description: `A convocatória já atingiu o limite definido de ${maxPlayers} jogadores (${selectedPlayerIds.length} selecionados). Desejas selecionar este atleta mesmo assim?`,
        confirmText: 'Sim, Convocar Atleta',
        cancelText: 'Cancelar',
        variant: 'warning',
        onConfirm: () => {
          setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
          setSelectedPlayerIds(prev => [...prev, playerId])
        }
      })
      return
    }

    setSelectedPlayerIds(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    )
  }

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let createdEventsList: Event[] = []

      const selTour = tournaments.find(t => t.id === tournamentId)
      const computedTitle = type === 'match'
        ? (isFriendly ? 'Jogo Amigável' : (selTour ? `Jogo ${selTour.name}` : 'Jogo'))
        : type === 'practice'
        ? 'Treino'
        : (title.trim() || 'Convívio')

      let finalLocation = location.trim()
      if (!finalLocation && fieldId) {
        const f = fields.find(item => item.id === fieldId)
        if (f) finalLocation = f.address ? `${f.name} (${f.address})` : f.name
      }

      if (isRecurring && recurrenceEndDate && recurrenceWeekdays.length > 0) {
        const dates = calculateRecurringDates(dateTime, recurrenceEndDate, recurrenceWeekdays)
        if (dates.length === 0) {
          toast.warning('Nenhuma data encontrada para os dias da semana e intervalo escolhidos.')
          return
        }

        const eventsToInsert = dates.map(d => ({
          title: computedTitle,
          type,
          date_time: d.toISOString(),
          field_id: fieldId || null,
          location: finalLocation || null,
          description,
          max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
          is_friendly: type === 'match' ? isFriendly : undefined,
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

        const effectivePlayerIds = type === 'practice'
          ? allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
          : selectedPlayerIds

        // Inserir convocatórias para todos os eventos criados
        if (createdEventsList.length > 0 && effectivePlayerIds.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(effectivePlayerIds, allPlayers)
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
            await supabase.from('callups').upsert(allCallups, {
              onConflict: 'event_id, player_id',
              ignoreDuplicates: true
            })
          }
        }

        toast.success(`✨ ${createdEventsList.length} eventos criados com sucesso até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`)
      } else {
        const newEvent = {
          title: computedTitle,
          type,
          date_time: new Date(dateTime).toISOString(),
          meeting_time: meetingTime ? `${meetingTime}:00` : null,
          field_id: fieldId || null,
          location: finalLocation || null,
          description,
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

        const effectivePlayerIds = type === 'practice'
          ? allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
          : selectedPlayerIds

        // Se houver jogadores a convocar (automático em treinos ou selecionados em jogos/convívios)
        if (createdEvent && effectivePlayerIds.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(effectivePlayerIds, allPlayers)
          const callupsToInsert = validIds.map(pId => ({
            event_id: createdEvent.id,
            player_id: pId,
            status: 'called'
          }))
          if (callupsToInsert.length > 0) {
            await supabase.from('callups').upsert(callupsToInsert, {
              onConflict: 'event_id, player_id',
              ignoreDuplicates: true
            })
          }
        }
        toast.success('✨ Evento criado com sucesso!')
      }

      setIsAddModalOpen(false)
      // Reset form
      setTitle('')
      setFieldId('')
      setLocation('')
      setDescription('')
      setMaxPlayers('')
      setTournamentId('')
      setOpponentId('')
      setHomeAway('home')
      setIsFriendly(true)
      setIsRecurring(false)
      setRecurrenceEndDate('')
      setRecurrenceWeekdays([])
      setSelectedPlayerIds([])
      fetchEventsAndData()
    } catch (err: any) {
      toast.error('Erro ao criar evento: ' + (err.message || 'Erro'))
    }
  }

  // --- EDIT EVENT SPECIFIC HANDLERS ---
  const handleStartEditEvent = (ev: Event) => {
    setEditTitle(ev.title || '')
    setEditType(ev.type)
    const d = new Date(ev.date_time)
    const pad = (n: number) => n.toString().padStart(2, '0')
    const localIso = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    setEditDateTime(localIso)
    setEditMeetingTime(ev.meeting_time ? ev.meeting_time.substring(0, 5) : '')
    setEditFieldId(ev.field_id || '')
    const resolvedLoc = ev.location || (ev.field ? (ev.field.address ? `${ev.field.name} (${ev.field.address})` : ev.field.name) : (fields.find(f => f.id === ev.field_id)?.name || ''))
    setEditLocation(resolvedLoc)
    setEditDescription(ev.description || '')
    setEditMaxPlayers(ev.max_players ?? '')
    setEditTournamentId(ev.tournament_id || (ev.tournament?.id || ''))
    setEditOpponentId(ev.opponent_id || '')
    setEditHomeAway(ev.home_away || 'home')
    setEditIsFriendly(Boolean(ev.is_friendly))
    setEditPlayerSearchTerm('')
    setIsEditModalOpen(true)
  }

  const handleSaveEditedEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEvent) return
    setIsResendPromptOpen(true)
  }

  const handleConfirmSaveEditedEvent = async (resendCallups: boolean) => {
    if (!selectedEvent) return
    setIsSavingEditLoading(true)
    try {
      const selEditTour = tournaments.find(t => t.id === editTournamentId)
      const computedTitle = editType === 'match'
        ? (editIsFriendly ? 'Jogo Amigável' : (selEditTour ? `Jogo ${selEditTour.name}` : 'Jogo'))
        : editType === 'practice'
        ? 'Treino'
        : (editTitle.trim() || 'Convívio')

      let finalEditLocation = editLocation.trim()
      if (!finalEditLocation && editFieldId) {
        const f = fields.find(item => item.id === editFieldId)
        if (f) finalEditLocation = f.address ? `${f.name} (${f.address})` : f.name
      }

      const payload: any = {
        title: computedTitle,
        type: editType,
        date_time: new Date(editDateTime).toISOString(),
        meeting_time: editMeetingTime ? `${editMeetingTime}:00` : null,
        field_id: editFieldId || null,
        location: finalEditLocation || null,
        description: editDescription,
        max_players: editMaxPlayers !== '' ? Number(editMaxPlayers) : null,
        tournament_id: (editType === 'match' && !editIsFriendly) ? (editTournamentId || null) : null,
        opponent_id: editType === 'match' ? (editOpponentId || null) : null,
        home_away: editType === 'match' ? editHomeAway : null,
        is_friendly: editType === 'match' ? editIsFriendly : false
      }

      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', selectedEvent.id)

      if (error) throw error

      // Se o utilizador escolheu reenviar o pedido de confirmação:
      if (resendCallups) {
        await supabase
          .from('callups')
          .update({ status: 'called' })
          .eq('event_id', selectedEvent.id)
      }

      const fieldObj = fields.find(f => f.id === editFieldId)
      setSelectedEvent(prev => prev ? {
        ...prev,
        ...payload,
        field: fieldObj || null,
        tournament: selEditTour || null
      } : null)

      setIsResendPromptOpen(false)
      setIsEditModalOpen(false)
      await fetchEventsAndData()

      toast.success(resendCallups 
        ? '✨ Evento atualizado e pedidos de confirmação reenviados aos atletas!' 
        : '✨ Evento atualizado com sucesso!'
      )
    } catch (err: any) {
      toast.error('Erro ao atualizar evento: ' + (err.message || 'Erro'))
    } finally {
      setIsSavingEditLoading(false)
    }
  }

  const handleDeleteSpecificEvent = (eventId: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar Evento da Agenda',
      description: 'Tens a certeza que desejas eliminar permanentemente este evento da agenda? Todas as convocatórias e respostas associadas serão apagadas.',
      confirmText: 'Sim, Eliminar Evento',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        try {
          const { error } = await supabase.from('events').delete().eq('id', eventId)
          if (error) throw error
          setSelectedEvent(null)
          setIsEditModalOpen(false)
          fetchEventsAndData()
          toast.success('Evento eliminado com sucesso!')
        } catch (err: any) {
          toast.error('Erro ao eliminar evento: ' + (err.message || 'Erro'))
        }
      }
    })
  }

  const handleCallupResponse = async (eventId: string, status: 'confirmed' | 'declined') => {
    if (!profile) return
    try {
      const list = eventCallups[eventId] || []
      const existingCallup = list.find(c => c.player_id === profile.id || c.player?.id === profile.id)
      
      if (existingCallup && existingCallup.id && !existingCallup.id.startsWith('auto-') && !existingCallup.id.startsWith('temp-')) {
        await supabase.from('callups').update({ status }).eq('id', existingCallup.id)
      } else {
        // Se ainda não existia linha no Supabase para o atleta ou era id temporário, faz upsert/insert
        const { data: newRow } = await supabase.from('callups').upsert([{
          event_id: eventId,
          player_id: profile.id,
          status
        }], { onConflict: 'event_id,player_id' }).select().single()

        if (newRow && existingCallup) {
          existingCallup.id = newRow.id
        }
      }

      // Atualiza estado local imediatamente
      setEventCallups(prev => {
        const curList = prev[eventId] ? [...prev[eventId]] : []
        const index = curList.findIndex(c => c.player_id === profile.id || c.player?.id === profile.id)
        if (index >= 0) {
          curList[index] = { ...curList[index], status }
        } else {
          curList.push({
            id: Math.random().toString(),
            event_id: eventId,
            player_id: profile.id,
            status,
            player: profile
          })
        }
        return { ...prev, [eventId]: curList }
      })
      toast.success(status === 'confirmed' ? '✓ Presença confirmada!' : '✕ Presença recusada.')
    } catch (err: any) {
      console.error('Erro ao atualizar resposta:', err)
      toast.error('Erro ao atualizar resposta: ' + (err.message || 'Erro'))
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

  // Treinador remove jogador de uma convocatória existente
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
      toast.error('Erro ao remover jogador: ' + err.message)
    }
  }

  // --- CALENDAR LOGIC & HELPERS ---
  const formatDateKey = (d: Date | string) => {
    const dateObj = typeof d === 'string' ? new Date(d) : d
    const y = dateObj.getFullYear()
    const m = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const weekDayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  const handlePrevMonth = () => {
    triggerHaptic('light')
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    triggerHaptic('light')
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const handleMonthChange = (newMonth: number) => {
    triggerHaptic('light')
    setCurrentDate(prev => new Date(prev.getFullYear(), newMonth, 1))
  }

  const handleYearChange = (newYear: number) => {
    triggerHaptic('light')
    setCurrentDate(prev => new Date(newYear, prev.getMonth(), 1))
  }

  const handleToday = () => {
    triggerHaptic('medium')
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  // Filtered events
  const filteredEvents = events.filter(e => {
    // 1. Type Filter
    if (typeFilter !== 'all' && e.type !== typeFilter) {
      return false
    }

    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const titleMatch = e.title?.toLowerCase().includes(q)
      const locMatch = e.location?.toLowerCase().includes(q)
      const descMatch = e.description?.toLowerCase().includes(q)
      const tourMatch = e.tournament?.name?.toLowerCase().includes(q)
      const oppMatch = e.opponent?.name?.toLowerCase().includes(q) || e.opponent?.initials?.toLowerCase().includes(q)
      if (!titleMatch && !locMatch && !descMatch && !tourMatch && !oppMatch) {
        return false
      }
    }

    // Helper para obter a convocatória do utilizador atual para qualquer evento
    const getMyCallupForEvent = (eventId: string): CallupWithPlayer | null => {
      if (!profile) return null
      const callups = eventCallups[eventId] || []
      const pId = profile.id
      const pEmail = profile.email ? profile.email.toLowerCase().trim() : ''
      const pName = profile.name ? profile.name.toLowerCase().trim() : ''

      const found = callups.find(c => 
        c.player_id === pId ||
        c.player?.id === pId ||
        (pEmail && c.player?.email && c.player.email.toLowerCase().trim() === pEmail) ||
        (pName && c.player?.name && c.player.name.toLowerCase().trim() === pName)
      )
      if (found) return found

      // Fallback para treinos/convívios se elegível
      const ev = events.find(item => item.id === eventId)
      if (ev && (ev.type === 'practice' || ev.type === 'gathering') && isPlayerEligible(profile, ev.type)) {
        return {
          id: `auto-${eventId}-${profile.id}`,
          event_id: eventId,
          player_id: profile.id,
          status: 'called',
          player: profile
        }
      }
      return null
    }

    // 3. Status Filter
    if (statusFilter !== 'all') {
      const eventDate = new Date(e.date_time)
      const now = new Date()

      if (statusFilter === 'upcoming') {
        if (eventDate < now) return false
      } else if (statusFilter === 'past') {
        if (eventDate >= now) return false
      } else if (statusFilter === 'my_confirmed') {
        const myCallup = getMyCallupForEvent(e.id)
        if (!myCallup || myCallup.status !== 'confirmed') return false
      } else if (statusFilter === 'my_declined') {
        const myCallup = getMyCallupForEvent(e.id)
        if (!myCallup || myCallup.status !== 'declined') return false
      } else if (statusFilter === 'my_pending') {
        const myCallup = getMyCallupForEvent(e.id)
        if (!myCallup || myCallup.status !== 'called') return false
      } else if (statusFilter === 'my_called') {
        const myCallup = getMyCallupForEvent(e.id)
        if (!myCallup) return false
      }
    }

    return true
  })

  // Helper centralizado fora do filter para obter a convocatória do utilizador atual
  const getMyCallupForEvent = (eventId: string): CallupWithPlayer | null => {
    if (!profile) return null
    const callups = eventCallups[eventId] || []
    const pId = profile.id
    const pEmail = profile.email ? profile.email.toLowerCase().trim() : ''
    const pName = profile.name ? profile.name.toLowerCase().trim() : ''

    const found = callups.find(c => 
      c.player_id === pId ||
      c.player?.id === pId ||
      (pEmail && c.player?.email && c.player.email.toLowerCase().trim() === pEmail) ||
      (pName && c.player?.name && c.player.name.toLowerCase().trim() === pName)
    )
    if (found) return found

    const ev = events.find(item => item.id === eventId)
    if (ev && (ev.type === 'practice' || ev.type === 'gathering') && isPlayerEligible(profile, ev.type)) {
      return {
        id: `auto-${eventId}-${profile.id}`,
        event_id: eventId,
        player_id: profile.id,
        status: 'called',
        player: profile
      }
    }
    return null
  }

  // Lista de todos os eventos com convocatória pendente de resposta para o atleta atual
  const isCallupPendingForUser = (ev: Event) => {
    const myCallup = getMyCallupForEvent(ev.id)
    if (!myCallup || myCallup.status !== 'called') return false

    const eventTime = new Date(ev.date_time).getTime()
    const now = new Date().getTime()
    if (eventTime < now) return false // Evento no passado não é pendente

    // Para treinos: apenas solicitar resposta a partir de 6 dias antes
    if (ev.type === 'practice') {
      const sixDaysMs = 6 * 24 * 60 * 60 * 1000
      return (eventTime - now) <= sixDaysMs
    }
    return true
  }

  const myPendingEvents = events
    .filter(isCallupPendingForUser)
    .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime())

  // Get events for a specific date
  const getEventsForDate = (d: Date) => {
    const key = formatDateKey(d)
    return filteredEvents.filter(e => formatDateKey(e.date_time) === key)
  }

  // Generate calendar days matrix
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7 // Monday = 0
  const prevMonthLastDay = new Date(year, month, 0).getDate()

  const calendarDays: { date: Date; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean; dateKey: string }[] = []
  const todayKey = formatDateKey(new Date())
  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null

  // 1. Previous month trailing days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i)
    const key = formatDateKey(d)
    calendarDays.push({
      date: d,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      dateKey: key
    })
  }

  // 2. Current month days
  for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
    const d = new Date(year, month, day)
    const key = formatDateKey(d)
    calendarDays.push({
      date: d,
      isCurrentMonth: true,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      dateKey: key
    })
  }

  // 3. Next month leading days
  const totalCells = calendarDays.length <= 35 ? 35 : 42
  const remaining = totalCells - calendarDays.length
  for (let day = 1; day <= remaining; day++) {
    const d = new Date(year, month + 1, day)
    const key = formatDateKey(d)
    calendarDays.push({
      date: d,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      dateKey: key
    })
  }

  const selectedDayEvents = selectedDate ? getEventsForDate(selectedDate) : []

  const renderEventCard = (event: Event) => {
    const callups = eventCallups[event.id] || []
    let myCallup = profile ? callups.find(c => c.player_id === profile.id || c.player?.id === profile.id || (c.player?.email && profile.email && c.player.email.toLowerCase().trim() === profile.email.toLowerCase().trim())) : null
    if (!myCallup && profile && (event.type === 'practice' || event.type === 'gathering' || isPlayerEligible(profile, event.type) || profile.role === 'player')) {
      myCallup = {
        id: `temp-${event.id}-${profile.id}`,
        event_id: event.id,
        player_id: profile.id,
        status: 'called',
        player: profile
      }
    }
    const confirmedCount = callups.filter(c => c.status === 'confirmed').length

    const isMatch = event.type === 'match'
    const isPractice = event.type === 'practice'
    const isAway = event.home_away === 'away'

    const cscSigla = formatClubSigla(clubSettings?.initials)
    const oppSigla = formatOpponentSigla(event.opponent)

    // Bloco equipa Cascais
    const cscBlock = (isRight: boolean) => (
      <div className={`flex-1 flex items-center ${isRight ? 'justify-end' : 'justify-start'} min-w-0`}>
        <div className={`flex items-center gap-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          {clubSettings?.logo_url ? (
            <img src={clubSettings.logo_url} alt={cscSigla} className="w-8 h-8 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
          ) : (
            <div className="w-8 h-8 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
              {cscSigla}
            </div>
          )}
          <span className="font-black text-sm text-gray-900 uppercase tracking-tight whitespace-nowrap">
            {cscSigla}
          </span>
        </div>
      </div>
    )

    // Bloco equipa Adversário
    const opponentBlock = (isRight: boolean) => (
      <div className={`flex-1 flex items-center ${isRight ? 'justify-end' : 'justify-start'} min-w-0`}>
        <div className={`flex items-center gap-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          {event.opponent?.logo_url ? (
            <img src={event.opponent.logo_url} alt={oppSigla} className="w-8 h-8 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
          ) : (
            <div className="w-8 h-8 bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              {oppSigla}
            </div>
          )}
          <span className="font-black text-sm text-gray-900 uppercase tracking-tight whitespace-nowrap">
            {oppSigla}
          </span>
        </div>
      </div>
    )

    return (
      <div
        key={event.id}
        onClick={() => setSelectedEvent(event)}
        className={`rounded-3xl border-2 transition-all cursor-pointer bg-white overflow-hidden shadow-sm hover:shadow-lg flex flex-col justify-between ${
          isMatch 
            ? 'border-blue-300 hover:border-blue-500' 
            : isPractice 
            ? 'border-emerald-300 hover:border-emerald-500' 
            : 'border-purple-300 hover:border-purple-500'
        }`}
      >
        {/* Barra Marcante de Cabeçalho do Evento (Forte Presença Visual) */}
        <div className={`px-4 py-3 flex items-center justify-between text-white shadow-xs ${
          isMatch 
            ? 'bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 border-b-2 border-blue-950' 
            : isPractice 
            ? 'bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 border-b-2 border-emerald-950' 
            : 'bg-gradient-to-r from-purple-700 via-purple-800 to-fuchsia-950 border-b-2 border-purple-950'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider flex items-center gap-1.5 drop-shadow-xs">
              {isMatch ? <Trophy size={16} className="text-amber-300" /> : isPractice ? <TrainingIcon size={16} className="text-white" /> : <PartyPopper size={16} className="text-pink-300" />}
              <span>{isMatch ? 'Jogo' : isPractice ? 'Treino' : 'Convívio'}</span>
            </span>

            {isMatch && event.is_friendly && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-400 text-amber-950 shadow-2xs">
                Amigável
              </span>
            )}

            {isMatch && event.tournament?.name && !event.is_friendly && (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-lg bg-white/20 text-white border border-white/30 backdrop-blur-xs truncate max-w-[150px] shadow-2xs">
                🏆 {event.tournament.name}
              </span>
            )}
          </div>

          {callups.length > 0 && (
            <span className="text-xs font-bold flex items-center gap-1 bg-white/20 text-white px-2.5 py-1 rounded-full border border-white/30 backdrop-blur-xs shadow-2xs">
              <Users size={13} className="text-white" />
              <span><strong>{confirmedCount}</strong>/{callups.length} conf.</span>
            </span>
          )}
        </div>

        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2.5">
            {/* Matchup Box (when event is a match with opponent) */}
            {isMatch && event.opponent && (
              <div className="bg-gradient-to-b from-gray-50 to-white p-3.5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  {/* Left Team (if away -> Opponent, else -> Cascais) */}
                  {isAway ? opponentBlock(false) : cscBlock(false)}

                  {/* VS Badge */}
                  <div className="shrink-0 px-1 flex items-center justify-center">
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      VS
                    </span>
                  </div>

                  {/* Right Team (if away -> Cascais, else -> Opponent) */}
                  {isAway ? cscBlock(true) : opponentBlock(true)}
                </div>

                {/* Condition Pill */}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                  <span className="font-bold">
                    Condição: <strong className="text-gray-900">{isAway ? '✈️ Fora de Casa' : event.home_away === 'neutral' ? '🏟️ Campo Neutro' : '🏠 Em Casa'}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Title (apenas exibido para convívios) */}
            {event.type === 'gathering' && (
              <div>
                <h4 className="text-base font-black text-gray-900 leading-snug">
                  {event.title}
                </h4>
              </div>
            )}

            {/* Concentração Acima da Hora (por extenso) */}
            {event.meeting_time && (
              <div className="flex items-center">
                <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl shadow-2xs">
                  <span>⏱️ Concentração: {event.meeting_time.substring(0, 5)}</span>
                </div>
              </div>
            )}

            {/* Horas e Localização / Endereço à frente */}
            {(() => {
              const locStr = getEventLocation(event)
              return (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {/* Hora */}
                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-xl shrink-0">
                    <Clock size={13} className="text-csc-dark" />
                    <span>{new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>

                  {/* Localização & Maps */}
                  {locStr && (
                    <div className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2.5 py-1 rounded-xl max-w-full truncate min-w-0">
                      <MapPin size={13} className="text-red-600 shrink-0" />
                      <span className="truncate">{locStr}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locStr)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 p-0.5 text-blue-600 hover:text-blue-800 shrink-0"
                        title="Ver no Google Maps"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="space-y-3">
            {/* Observações / Descrição (diretamente acima da confirmação) */}
            {event.description && (
              <div className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
              </div>
            )}

            {/* Ação rápida de Presença (RSVP) */}
            {myCallup && (() => {
              const eventTime = new Date(event.date_time).getTime()
              const now = new Date().getTime()
              const diffDays = Math.ceil((eventTime - now) / (1000 * 60 * 60 * 24))
              const isPractice = event.type === 'practice'
              const isRsvpOpen = !isPractice || diffDays <= 6

              return (
                <div 
                  onClick={(e) => e.stopPropagation()} 
                  className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap"
                >
                  <span className="text-xs font-bold text-gray-700">Presença:</span>
                  {!isRsvpOpen ? (
                    <span className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-xl">
                      ⏱️ Confirmações abrem 6 dias antes ({new Date(eventTime - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })})
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        disabled={myCallup.status === 'confirmed'}
                        onClick={() => handleCallupResponse(event.id, 'confirmed')}
                        className={`text-xs font-black px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                          myCallup.status === 'confirmed'
                            ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 cursor-pointer active:scale-95 shadow-2xs'
                        }`}
                      >
                        <CheckCircle2 size={13} />
                        <span>Confirmar</span>
                      </button>
                      <button
                        type="button"
                        disabled={myCallup.status === 'declined'}
                        onClick={() => handleCallupResponse(event.id, 'declined')}
                        className={`text-xs font-black px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                          myCallup.status === 'declined'
                            ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                            : 'bg-white border border-red-600 text-red-700 hover:bg-red-50 cursor-pointer active:scale-95 shadow-2xs'
                        }`}
                      >
                        <XCircle size={13} />
                        <span>Recusar</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Botão Criar Evento (Coach/Admin) */}
      {isCoachOrAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              setSelectedPlayerIds(allPlayers.map(p => p.id))
              setIsAddModalOpen(true)
            }}
            className="flex items-center justify-center space-x-2 bg-csc-dark text-white px-4 py-2.5 rounded-xl font-bold hover:bg-csc-dark/80 transition-all shadow-sm shrink-0 w-full sm:w-auto cursor-pointer"
          >
            <Plus size={18} className="text-csc-gold" />
            <span>Criar Jogo / Treino</span>
          </button>
        </div>
      )}

      {/* Banner Superior com Todas as Convocatórias Pendentes em Carrossel */}
      {myPendingEvents.length > 0 && (() => {
        const activeIndex = Math.min(currentPendingIndex, myPendingEvents.length - 1)
        const pe = myPendingEvents[activeIndex] || myPendingEvents[0]
        if (!pe) return null

        const peCall = getMyCallupForEvent(pe.id)
        const isPePractice = pe.type === 'practice'
        const peTime = new Date(pe.date_time).getTime()
        const isPeRsvpOpen = !isPePractice || ((peTime - Date.now()) <= 6 * 24 * 60 * 60 * 1000)
        const peEmoji = pe.type === 'match' ? '⚽' : pe.type === 'practice' ? '🏃' : '🎉'
        const locStr = getEventLocation(pe) || 'Local a definir'
        const dateStr = new Date(pe.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })

        const nextSlide = (e?: React.MouseEvent) => {
          e?.stopPropagation()
          if (myPendingEvents.length > 1) {
            setCurrentPendingIndex(prev => (prev + 1) % myPendingEvents.length)
          }
        }

        const prevSlide = (e?: React.MouseEvent) => {
          e?.stopPropagation()
          if (myPendingEvents.length > 1) {
            setCurrentPendingIndex(prev => (prev - 1 + myPendingEvents.length) % myPendingEvents.length)
          }
        }

        return (
          <div 
            onTouchStart={(e) => setPendingTouchStartX(e.targetTouches[0].clientX)}
            onTouchEnd={(e) => {
              if (pendingTouchStartX === null) return
              const diff = pendingTouchStartX - e.changedTouches[0].clientX
              if (Math.abs(diff) > 40) {
                if (diff > 0) nextSlide()
                else prevSlide()
              }
              setPendingTouchStartX(null)
            }}
            className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-csc-dark rounded-3xl p-4 sm:p-5 shadow-sm border-2 border-amber-600 space-y-3 select-none"
          >
            {/* Header do Alerta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">🔔</span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-csc-dark">
                    Tens {myPendingEvents.length} {myPendingEvents.length === 1 ? 'convocatória pendente' : 'convocatórias pendentes'}!
                  </h3>
                  <p className="text-[11px] font-semibold text-amber-950">Responde diretamente abaixo ou clica para ver os detalhes:</p>
                </div>
              </div>
            </div>

            {/* Card do Evento Pendente Atual */}
            <div className="bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-amber-300 shadow-xs space-y-3">
              <div 
                onClick={() => setSelectedEvent(pe)}
                className="cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-gray-900 truncate flex items-center gap-1.5">
                    <span>{peEmoji}</span>
                    <span>{pe.title}</span>
                  </span>
                  <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-lg shrink-0">
                    {dateStr}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 truncate flex items-center gap-1">
                  <span>📍</span>
                  <span className="truncate">{locStr}</span>
                </p>
              </div>

              {/* Botões de Ação */}
              {isPeRsvpOpen ? (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={peCall?.status === 'confirmed'}
                    onClick={() => handleCallupResponse(pe.id, 'confirmed')}
                    className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirmar</span>
                  </button>
                  <button
                    type="button"
                    disabled={peCall?.status === 'declined'}
                    onClick={() => handleCallupResponse(pe.id, 'declined')}
                    className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <XCircle size={14} />
                    <span>Recusar</span>
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-center font-bold text-amber-900 bg-amber-50 py-1.5 rounded-xl border border-amber-200">
                  Abre 6 dias antes do treino
                </div>
              )}
            </div>

            {/* Carrossel de Convocatórias Pendentes: Setas e Indicadores (Otimizado para Rato e Desktop) */}
            {myPendingEvents.length > 1 && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-600/40">
                <button
                  type="button"
                  onClick={prevSlide}
                  className="w-8 h-8 rounded-xl bg-black/15 hover:bg-black/25 text-csc-dark flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-2xs shrink-0"
                  title="Convocatória Anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="flex items-center gap-1.5 bg-black/10 px-3 py-1 rounded-full border border-black/10">
                  {myPendingEvents.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentPendingIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === activeIndex
                          ? 'bg-csc-dark w-5'
                          : 'bg-black/25 hover:bg-black/40 w-2'
                      }`}
                      title={`Convocatória ${idx + 1}`}
                    />
                  ))}
                  <span className="text-[11px] font-black text-csc-dark ml-1 pl-1.5 border-l border-black/20 leading-none">
                    {activeIndex + 1}/{myPendingEvents.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={nextSlide}
                  className="w-8 h-8 rounded-xl bg-black/15 hover:bg-black/25 text-csc-dark flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-2xs shrink-0"
                  title="Próxima Convocatória"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* Barra de Navegação & Filtros de Calendário */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-150 space-y-3.5">
        {/* Linha 1: Alternador de Visualização + Barra de Pesquisa + Filtro de Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Alternador de Visualização: Calendário vs Lista */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl w-full md:w-auto shrink-0">
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'calendar' ? 'bg-csc-dark text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarIcon size={15} />
              <span>Calendário</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                viewMode === 'list' ? 'bg-csc-dark text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ListIcon size={15} />
              <span>Lista ({filteredEvents.length})</span>
            </button>
          </div>

          {/* Pesquisa e Filtro de Status */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 md:max-w-xl">
            {/* Input Pesquisa */}
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por título, adversário, local..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-csc-dark focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-gray-600 p-0.5"
                  title="Limpar pesquisa"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Select Status */}
            <div className="relative shrink-0 sm:w-48">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-csc-dark font-medium text-gray-700 cursor-pointer"
              >
                <option value="all">⚡ Todos os Estados</option>
                <option value="upcoming">⏳ Próximos / Futuros</option>
                <option value="past">🏁 Realizados / Passados</option>
                <option value="my_confirmed">🟢 Confirmados por mim</option>
                <option value="my_pending">🟡 Pendentes da minha resposta</option>
                <option value="my_declined">🔴 Recusados por mim</option>
                <option value="my_called">📋 Fui convocado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Linha 2: Filtros de Tipo de Evento & Reset de Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <span className="text-[11px] font-bold text-gray-400 mr-1 hidden sm:inline">Tipo:</span>
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                typeFilter === 'all' ? 'bg-csc-gold text-csc-dark font-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTypeFilter('match')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                typeFilter === 'match' ? 'bg-blue-600 text-white font-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              ⚽ Jogos
            </button>
            <button
              onClick={() => setTypeFilter('practice')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                typeFilter === 'practice' ? 'bg-emerald-600 text-white font-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🏃 Treinos
            </button>
            <button
              onClick={() => setTypeFilter('gathering')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                typeFilter === 'gathering' ? 'bg-purple-600 text-white font-black' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🍻 Convívios
            </button>
          </div>

          {/* Botão Limpar Filtros se algum filtro estiver ativo */}
          {(searchQuery || typeFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('')
                setTypeFilter('all')
                setStatusFilter('all')
              }}
              className="text-xs font-bold text-red-600 hover:text-red-800 hover:underline flex items-center gap-1 px-2 py-1 bg-red-50 rounded-lg transition-colors"
            >
              <X size={13} />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Grelha do Calendário Mensal Compacta */}
          <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-gray-150 overflow-hidden">
            {/* Cabeçalho do Calendário com Seleção Rápida de Mês e Ano */}
            <div className="p-3 sm:p-4 bg-gradient-to-r from-csc-dark via-gray-900 to-csc-dark text-white rounded-t-2xl flex flex-wrap items-center justify-between gap-3 shadow-sm border-b border-white/10">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Dropdown Mês */}
                <select
                  value={currentDate.getMonth()}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                  className="bg-white/15 hover:bg-white/25 text-white font-black text-xs sm:text-sm px-3 py-1.5 rounded-xl border border-white/20 outline-none focus:ring-2 focus:ring-csc-gold cursor-pointer transition-all appearance-none pr-7 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_8px_center] bg-no-repeat"
                >
                  {monthNames.map((mName, idx) => (
                    <option key={mName} value={idx} className="bg-gray-900 text-white font-bold">
                      {mName}
                    </option>
                  ))}
                </select>

                {/* Dropdown Ano */}
                <select
                  value={currentDate.getFullYear()}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="bg-white/15 hover:bg-white/25 text-csc-gold font-black text-xs sm:text-sm px-3 py-1.5 rounded-xl border border-white/20 outline-none focus:ring-2 focus:ring-csc-gold cursor-pointer transition-all appearance-none pr-7 relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23F59E0B%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_8px_center] bg-no-repeat"
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                    <option key={y} value={y} className="bg-gray-900 text-csc-gold font-bold">
                      {y}
                    </option>
                  ))}
                </select>

                {/* Botão Hoje */}
                <button
                  onClick={handleToday}
                  className="text-xs font-bold px-3 py-1.5 bg-csc-gold hover:bg-amber-400 text-csc-dark rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer font-black"
                >
                  Hoje
                </button>
              </div>

              {/* Setas Anterior / Próximo */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer active:scale-90"
                  title="Mês Anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer active:scale-90"
                  title="Próximo Mês"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Cabeçalho dos Dias da Semana */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200 text-center py-2">
              {weekDayNames.map((w, idx) => (
                <div key={w} className={`text-[11px] font-black uppercase tracking-wider ${idx >= 5 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {w}
                </div>
              ))}
            </div>

            {/* Células dos Dias Compactas */}
            <div className="grid grid-cols-7 auto-rows-fr border-b border-gray-100 divide-x divide-y divide-gray-100">
              {calendarDays.map((cell, idx) => {
                const dayEvents = getEventsForDate(cell.date)
                const hasEvents = dayEvents.length > 0

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDate(cell.date)}
                    className={`min-h-[44px] sm:min-h-[58px] p-1 sm:p-1.5 cursor-pointer transition-all flex flex-col justify-between ${
                      !cell.isCurrentMonth ? 'bg-gray-50/50 opacity-30' : 'bg-white hover:bg-gray-50/80'
                    } ${
                      cell.isSelected ? 'ring-2 ring-csc-gold ring-inset bg-amber-50/40 font-black' : ''
                    }`}
                  >
                    {/* Topo da Célula: Número do Dia */}
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-bold w-5 h-5 flex items-center justify-center rounded-full transition-colors ${
                        cell.isToday 
                          ? 'bg-csc-gold text-csc-dark font-black shadow-xs' 
                          : cell.isSelected 
                          ? 'bg-csc-dark text-white font-black' 
                          : cell.isCurrentMonth ? 'text-gray-800' : 'text-gray-400'
                      }`}>
                        {cell.date.getDate()}
                      </span>

                      {hasEvents && (
                        <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-csc-dark text-white shadow-2xs">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Mini Indicadores de Eventos */}
                    <div className="mt-1 space-y-0.5 overflow-hidden">
                      {/* Vista Desktop: Pílulas Compactas */}
                      <div className="hidden sm:block space-y-0.5">
                        {dayEvents.slice(0, 2).map(ev => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedEvent(ev)
                            }}
                            className={`text-[9px] px-1 py-0.2 rounded font-bold truncate flex items-center gap-0.5 shadow-2xs hover:opacity-85 ${
                              ev.type === 'match' 
                                ? 'bg-blue-100 text-blue-900 border border-blue-200' 
                                : ev.type === 'practice' 
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' 
                                : 'bg-purple-100 text-purple-900 border border-purple-200'
                            }`}
                            title={`${ev.title}`}
                          >
                            <span className="flex items-center">{ev.type === 'match' ? '⚽' : ev.type === 'practice' ? <TrainingIcon size={11} className="text-emerald-800" /> : '🎉'}</span>
                            <span className="truncate">{ev.type === 'match' && ev.opponent ? (ev.opponent.initials || ev.opponent.name) : ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[8px] font-bold text-gray-500 pl-0.5">
                            +{dayEvents.length - 2} mais
                          </span>
                        )}
                      </div>

                      {/* Vista Mobile: Pontos compactos */}
                      <div className="sm:hidden flex flex-wrap gap-1 items-center justify-center">
                        {dayEvents.map(ev => (
                          <span 
                            key={ev.id} 
                            className={`w-1.5 h-1.5 rounded-full ${
                              ev.type === 'match' ? 'bg-blue-600' : ev.type === 'practice' ? 'bg-emerald-600' : 'bg-purple-600'
                            }`} 
                            title={ev.title}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Coluna Direita: Eventos do Dia Selecionado Diretamente */}
          <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-6">
            {selectedDate && (
              selectedDayEvents.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs bg-white rounded-2xl p-6 border border-dashed border-gray-200 shadow-2xs">
                  <CalendarDaysIcon size={28} className="mx-auto text-gray-300 mb-2" />
                  <p className="font-bold text-sm text-gray-600">Sem eventos neste dia.</p>
                  <p className="mt-1 text-xs text-gray-400">Seleciona outro dia no calendário para consultar os eventos agendados.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map(event => renderEventCard(event))}
                </div>
              )
            )}
          </div>
        </div>
      ) : (
        /* Vista de Lista Completa */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-gray-200 p-8">
              <CalendarRange size={36} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-bold text-gray-600">Nenhum evento encontrado.</p>
              <p className="text-xs text-gray-400 mt-1">Ajuste os filtros ou crie um novo evento.</p>
            </div>
          ) : (
            filteredEvents.map((event) => renderEventCard(event))
          )}
        </div>
      )}

      {/* Modal Detalhes Evento & Convocatória (Estilo Bottom Sheet / Persiana com Física Fluida) */}
      {selectedEvent && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6 z-50 overflow-hidden select-none animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedEvent(null)
              setSheetTranslateY(0)
              setPlayerSearchTerm('')
              setModalCallupStatusFilter('all')
            }
          }}
        >
          <div 
            ref={modalScrollRef}
            onTouchStart={(e) => handleSheetTouchStart(e, false)}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
            style={{
              transform: typeof window !== 'undefined' && window.innerWidth < 640 ? `translateY(${sheetTranslateY}px)` : undefined,
              transition: isDraggingSheet ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
            }}
            className="bg-white rounded-t-3xl sm:rounded-3xl max-w-6xl xl:max-w-7xl w-full p-4 sm:p-8 relative max-h-[90vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl border border-gray-100 space-y-4 overscroll-contain"
          >
            {/* Persiana Top Drag Handle no Mobile (Zona de Toque Ampla e Fluida) */}
            <div 
              className="sm:hidden flex items-center justify-center pt-1 pb-3 cursor-grab active:cursor-grabbing touch-none select-none"
              onTouchStart={(e) => handleSheetTouchStart(e, true)}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onClick={() => {
                setSelectedEvent(null)
                setSheetTranslateY(0)
                setPlayerSearchTerm('')
                setModalCallupStatusFilter('all')
              }}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full hover:bg-gray-400 active:bg-gray-500 transition-colors" />
            </div>

            {/* Botão Fechar */}
            <button
              onClick={() => {
                setSelectedEvent(null)
                setSheetTranslateY(0)
                setPlayerSearchTerm('')
                setModalCallupStatusFilter('all')
              }}
              className="absolute top-3.5 right-4 sm:top-5 sm:right-5 text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors z-10 cursor-pointer"
              title="Fechar"
            >
              <X size={22} />
            </button>

            {/* Topo Premium Unificado da Persiana (Layout Verde Oficial CSC com Carrossel Integrado) */}
            <div className="bg-gradient-to-r from-csc-dark via-emerald-950 to-csc-dark text-white p-3.5 sm:p-4 rounded-2xl shadow-xl border-2 border-csc-gold relative overflow-hidden space-y-2.5">
              
              {/* Barra Integrada de Convocatórias Pendentes (Apenas se existirem múltiplos eventos pendentes) */}
              {myPendingEvents.length > 1 && myPendingEvents.some(pe => pe.id === selectedEvent.id) && (() => {
                const curIdx = myPendingEvents.findIndex(pe => pe.id === selectedEvent.id)
                const activeIndex = curIdx !== -1 ? curIdx : 0

                const nextEvent = (e?: React.MouseEvent) => {
                  e?.stopPropagation()
                  const nextIdx = (activeIndex + 1) % myPendingEvents.length
                  setSelectedEvent(myPendingEvents[nextIdx])
                  if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
                }

                const prevEvent = (e?: React.MouseEvent) => {
                  e?.stopPropagation()
                  const prevIdx = (activeIndex - 1 + myPendingEvents.length) % myPendingEvents.length
                  setSelectedEvent(myPendingEvents[prevIdx])
                  if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
                }

                return (
                  <div className="bg-black/25 border border-csc-gold/30 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={prevEvent}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 bg-white/10 hover:bg-white/20 text-white"
                      title="Convocatória Anterior (ou desliza para a direita 👉)"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-2 select-none min-w-0">
                      <span className="text-xs font-black text-amber-300 flex items-center gap-1">
                        <span>🔔 Convocatória Pendente</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-white/15 text-white">
                          {activeIndex + 1}/{myPendingEvents.length}
                        </span>
                      </span>

                      {/* Traços centrados */}
                      <div className="flex items-center gap-1">
                        {myPendingEvents.map((item, idx) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedEvent(item)
                              if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
                            }}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              idx === activeIndex
                                ? 'bg-csc-gold w-4'
                                : 'bg-white/30 hover:bg-white/50 w-1.5'
                            }`}
                            title={item.title}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={nextEvent}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 bg-white/10 hover:bg-white/20 text-white"
                      title="Próxima Convocatória (ou desliza para a esquerda 👈)"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )
              })()}

              {/* Linha Principal: Símbolo + Pílula do Tipo + Data e Hora + Ações Admin/Treinador */}
              <div className="flex items-center justify-between gap-3 pr-8 sm:pr-10">
                {/* Símbolo + Pílula do Tipo + Data e Hora */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* 1. Símbolo Oficial */}
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white p-1 shadow-md shrink-0 border border-csc-gold flex items-center justify-center">
                    <img 
                      src="/csc-vet/cascais-emblem.png" 
                      alt="CSC" 
                      className="w-full h-full object-contain" 
                    />
                  </div>

                  {/* 2. Pílula do Tipo & 3. Data e Hora */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider shadow-2xs ${
                        selectedEvent.type === 'match' 
                          ? 'bg-blue-600 text-white' 
                          : selectedEvent.type === 'practice' 
                          ? 'bg-emerald-700 text-white' 
                          : 'bg-purple-700 text-white'
                      }`}>
                        {selectedEvent.type === 'match' ? '⚽ Jogo' : selectedEvent.type === 'practice' ? '🏃 Treino' : '🎉 Convívio'}
                      </span>

                      {selectedEvent.is_friendly && selectedEvent.type === 'match' && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-400 text-csc-dark">
                          Amigável
                        </span>
                      )}
                      {selectedEvent.tournament?.name && !selectedEvent.is_friendly && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-900/80 text-blue-200 border border-blue-400/30 truncate max-w-[150px]">
                          🏆 {selectedEvent.tournament.name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-bold text-gray-100 flex items-center gap-1.5 truncate">
                      <Clock size={13} className="text-csc-gold shrink-0" />
                      <span>
                        {new Date(selectedEvent.date_time).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })}, {new Date(selectedEvent.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </p>
                  </div>
                </div>

                {/* 4. Botões Modificar e Apagar (Apenas Admin / Treinador) */}
                {isCoachOrAdmin && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEditEvent(selectedEvent)}
                      className="p-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                      title="Modificar evento"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSpecificEvent(selectedEvent.id)}
                      className="p-2 bg-red-600/40 hover:bg-red-600/60 text-red-100 border border-red-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs"
                      title="Apagar evento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Grelha Responsiva Versão Web (2 Colunas Amplas no Desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              
              {/* COLUNA ESQUERDA (5 Colunas): Detalhes do Evento, Matchup VS e Presença Pessoal */}
              <div className="lg:col-span-5 space-y-5">

                {/* Matchup Box no Modal (quando Jogo com adversário) */}
                {selectedEvent.type === 'match' && selectedEvent.opponent && (() => {
                  const isAway = selectedEvent.home_away === 'away'
                  const cscSigla = formatClubSigla(clubSettings?.initials)
                  const oppSigla = formatOpponentSigla(selectedEvent.opponent)
                  const leftLogo = isAway ? selectedEvent.opponent?.logo_url : clubSettings?.logo_url
                  const leftSigla = isAway ? oppSigla : cscSigla
                  const leftName = isAway ? selectedEvent.opponent?.name : (clubSettings?.name || 'Cascais')
                  const rightLogo = isAway ? clubSettings?.logo_url : selectedEvent.opponent?.logo_url
                  const rightSigla = isAway ? cscSigla : oppSigla
                  const rightName = isAway ? (clubSettings?.name || 'Cascais') : selectedEvent.opponent?.name

                  return (
                    <div className="bg-gradient-to-b from-gray-50 to-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between gap-3 sm:gap-4">
                        {/* Left Team */}
                        <div className="flex-1 flex flex-col items-start text-left min-w-0">
                          <div className="flex items-center gap-2">
                            {leftLogo ? (
                              <img src={leftLogo} alt={leftSigla} className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
                            ) : (
                              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-csc-dark text-csc-gold rounded-xl flex items-center justify-center text-xs font-black shrink-0">
                                {leftSigla}
                              </div>
                            )}
                            <span className="font-black text-sm sm:text-base text-gray-900 uppercase tracking-tight">
                              {leftSigla}
                            </span>
                          </div>
                          <span className="text-[11px] sm:text-xs font-bold text-gray-600 mt-1 truncate max-w-full">
                            {leftName}
                          </span>
                        </div>

                        {/* VS Badge */}
                        <div className="shrink-0 px-1 flex flex-col items-center">
                          <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            VS
                          </span>
                        </div>

                        {/* Right Team */}
                        <div className="flex-1 flex flex-col items-end text-right min-w-0">
                          <div className="flex items-center gap-2 flex-row-reverse">
                            {rightLogo ? (
                              <img src={rightLogo} alt={rightSigla} className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
                            ) : (
                              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-csc-dark text-csc-gold rounded-xl flex items-center justify-center text-xs font-black shrink-0">
                                {rightSigla}
                              </div>
                            )}
                            <span className="font-black text-sm sm:text-base text-gray-900 uppercase tracking-tight">
                              {rightSigla}
                            </span>
                          </div>
                          <span className="text-[11px] sm:text-xs font-bold text-gray-600 mt-1 truncate max-w-full">
                            {rightName}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                        <span className="font-bold">
                          Condição: <strong className="text-gray-900">{isAway ? '✈️ Fora de Casa' : selectedEvent.home_away === 'neutral' ? '🏟️ Campo Neutro' : '🏠 Em Casa'}</strong>
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* Title (apenas exibido para convívios) */}
                {selectedEvent.type === 'gathering' && (
                  <h2 className="text-2xl font-black text-gray-900 leading-tight">{selectedEvent.title}</h2>
                )}

                {/* Concentração Acima da Hora */}
                {selectedEvent.meeting_time && (
                  <div className="flex items-center">
                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl shadow-2xs">
                      <span>⏱️ Concentração: {selectedEvent.meeting_time.substring(0, 5)}</span>
                    </div>
                  </div>
                )}

                {/* Info Box (Data, Hora e Local) */}
                <div className="space-y-2 bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs">
                  <div className="flex items-center text-gray-700 space-x-2.5">
                    <Clock size={16} className="text-csc-dark shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase">Data e Horário</p>
                      <p className="font-extrabold text-xs text-gray-850">
                        {new Date(selectedEvent.date_time).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const locStr = getEventLocation(selectedEvent)
                    return (
                      <div className="flex items-center justify-between text-gray-700 pt-2 border-t border-gray-200/60">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <MapPin size={16} className="text-red-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Localização</p>
                            <p className="font-extrabold text-xs text-gray-850 truncate">{locStr || 'Sem local definido'}</p>
                          </div>
                        </div>
                        {locStr && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locStr)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-white border border-gray-300 hover:border-red-500 hover:text-red-600 text-gray-700 rounded-xl text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors shrink-0 ml-2"
                            title="Abrir no Google Maps"
                          >
                            <MapPin size={12} className="text-red-500 shrink-0" />
                            <span>Maps</span>
                            <ExternalLink size={10} className="opacity-60" />
                          </a>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Observações / Descrição (diretamente acima da confirmação) */}
                {selectedEvent.description && (
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-700 space-y-1">
                    <p className="font-black text-gray-900">Observações & Informações:</p>
                    <p className="leading-relaxed">{selectedEvent.description}</p>
                  </div>
                )}

                {/* Painel do Atleta Atual (RSVP Pessoal) */}
                {(() => {
                  let myCallup = getMyCallupForEvent(selectedEvent.id)
                  
                  // Se o atleta for elegível para este evento mas ainda não houver registo pré-carregado no mapa de convocatórias:
                  if (!myCallup && profile && (selectedEvent.type === 'practice' || selectedEvent.type === 'gathering' || isPlayerEligible(profile, selectedEvent.type) || profile.role === 'player')) {
                    myCallup = {
                      id: `temp-${selectedEvent.id}-${profile.id}`,
                      event_id: selectedEvent.id,
                      player_id: profile.id,
                      status: 'called',
                      player: profile
                    }
                  }

                  if (!myCallup) return null

                  const eventTime = new Date(selectedEvent.date_time).getTime()
                  const now = new Date().getTime()
                  const isPractice = selectedEvent.type === 'practice'
                  const isRsvpOpen = !isPractice || ((eventTime - now) <= 6 * 24 * 60 * 60 * 1000)

                  return (
                    <div className="p-4 bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl border border-gray-300 space-y-3 shadow-2xs">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-600">A tua convocatória para este evento</p>
                        <p className="text-sm font-black text-gray-900 mt-0.5">
                          Estado: <span className={
                            myCallup.status === 'confirmed' ? 'text-emerald-700' :
                            myCallup.status === 'declined' ? 'text-red-700' : 'text-amber-700'
                          }>
                            {myCallup.status === 'confirmed' ? '✓ Confirmaste presença' :
                             myCallup.status === 'declined' ? '✕ Recusaste presença' : '⏳ Aguarda a tua resposta'}
                          </span>
                        </p>
                      </div>
                      {!isRsvpOpen ? (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium">
                          ⏱️ O pedido de confirmação de presença abre <strong>6 dias antes do treino</strong> (a {new Date(eventTime - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}).
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={myCallup.status === 'confirmed'}
                            onClick={() => handleCallupResponse(selectedEvent.id, 'confirmed')}
                            className={`flex-1 px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                              myCallup.status === 'confirmed' 
                                ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none' 
                                : 'bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 cursor-pointer active:scale-95 shadow-xs'
                            }`}
                          >
                            <CheckCircle2 size={15} /> Confirmar
                          </button>
                          <button
                            type="button"
                            disabled={myCallup.status === 'declined'}
                            onClick={() => handleCallupResponse(selectedEvent.id, 'declined')}
                            className={`flex-1 px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 ${
                              myCallup.status === 'declined' 
                                ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none' 
                                : 'bg-white border border-red-600 text-red-700 hover:bg-red-50 cursor-pointer active:scale-95 shadow-xs'
                            }`}
                          >
                            <XCircle size={15} /> Recusar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* COLUNA DIREITA (7 Colunas): Convocatória Completa, Filtros Interativos e Gestão */}
              {(() => {
                const callups = eventCallups[selectedEvent.id] || []
                const confirmedList = callups.filter(c => c.status === 'confirmed')
                const declinedList = callups.filter(c => c.status === 'declined')
                const pendingList = callups.filter(c => c.status === 'called')

                // Lista de atletas filtrada por status e termo de pesquisa
                const filteredCallups = callups.filter(c => {
                  if (modalCallupStatusFilter !== 'all' && c.status !== modalCallupStatusFilter) return false
                  if (!playerSearchTerm) return true
                  const q = playerSearchTerm.toLowerCase()
                  const nameMatch = c.player?.name?.toLowerCase().includes(q) ||
                    c.player?.shirt_name?.toLowerCase().includes(q) ||
                    c.player?.nickname?.toLowerCase().includes(q) ||
                    (c.player?.jersey_number && c.player.jersey_number.toString().includes(q))
                  return nameMatch
                })

                return (
                  <div className="lg:col-span-7 bg-gray-50/70 p-4 sm:p-5 rounded-3xl border border-gray-200 space-y-3.5 transition-all">
                    {/* Topo da Convocatória com Botão de Colapsar / Expandir */}
                    <div 
                      onClick={() => setIsModalCallupsExpanded(prev => !prev)}
                      className="flex items-center justify-between cursor-pointer select-none group"
                    >
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-gray-900 flex items-center gap-2 group-hover:text-csc-dark transition-colors">
                            <Users size={18} className="text-csc-dark" />
                            <span>Convocatória ({callups.length}{selectedEvent.max_players ? ` / ${selectedEvent.max_players} máx` : ''})</span>
                          </h3>
                        </div>

                        {/* Resumo quando colapsado ou expandido */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                            ✓ {confirmedList.length} {confirmedList.length === 1 ? 'confirmado' : 'confirmados'}
                          </span>
                          <span className="text-[10.5px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md border border-amber-200">
                            ⏳ {pendingList.length} {pendingList.length === 1 ? 'pendente' : 'pendentes'}
                          </span>
                          {declinedList.length > 0 && (
                            <span className="text-[10.5px] font-bold text-red-800 bg-red-100/80 px-2 py-0.5 rounded-md border border-red-200">
                              ✕ {declinedList.length} {declinedList.length === 1 ? 'recusado' : 'recusados'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-gray-500 group-hover:text-gray-900 hidden sm:inline">
                          {isModalCallupsExpanded ? 'Recolher' : 'Expandir'}
                        </span>
                        <div className="p-2 rounded-xl bg-white border border-gray-200 group-hover:bg-gray-100 text-gray-700 shadow-2xs transition-all">
                          {isModalCallupsExpanded ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Conteúdo Expandido da Convocatória */}
                    {isModalCallupsExpanded && (
                      <div className="space-y-4 pt-3 border-t border-gray-200/80 animate-fade-in">
                        {/* Resumo de Quórum como Botões de Filtro Acionáveis */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {/* Confirmados */}
                            <button
                              type="button"
                              onClick={() => setModalCallupStatusFilter(prev => prev === 'confirmed' ? 'all' : 'confirmed')}
                              className={`p-3 rounded-2xl border-2 text-center transition-all cursor-pointer select-none active:scale-95 flex flex-col items-center justify-center ${
                                modalCallupStatusFilter === 'confirmed'
                                  ? 'bg-emerald-100 border-emerald-500 shadow-md ring-2 ring-emerald-500/40'
                                  : 'bg-white border-emerald-200 hover:bg-emerald-50'
                              }`}
                              title="Filtrar por Confirmados"
                            >
                              <p className="text-2xl font-black text-emerald-800">{confirmedList.length}</p>
                              <p className="text-[11px] font-bold text-emerald-900 flex items-center justify-center gap-1 mt-0.5">
                                <CheckCircle2 size={12} /> Confirmados
                              </p>
                              {modalCallupStatusFilter === 'confirmed' && (
                                <span className="text-[9px] font-black uppercase text-emerald-900 bg-emerald-200/90 px-1.5 py-0.2 rounded-full mt-1">
                                  Filtro Ativo
                                </span>
                              )}
                            </button>

                            {/* Pendentes */}
                            <button
                              type="button"
                              onClick={() => setModalCallupStatusFilter(prev => prev === 'called' ? 'all' : 'called')}
                              className={`p-3 rounded-2xl border-2 text-center transition-all cursor-pointer select-none active:scale-95 flex flex-col items-center justify-center ${
                                modalCallupStatusFilter === 'called'
                                  ? 'bg-amber-100 border-amber-500 shadow-md ring-2 ring-amber-500/40'
                                  : 'bg-white border-amber-200 hover:bg-amber-50'
                              }`}
                              title="Filtrar por Pendentes"
                            >
                              <p className="text-2xl font-black text-amber-800">{pendingList.length}</p>
                              <p className="text-[11px] font-bold text-amber-900 flex items-center justify-center gap-1 mt-0.5">
                                <HelpCircle size={12} /> Pendentes
                              </p>
                              {modalCallupStatusFilter === 'called' && (
                                <span className="text-[9px] font-black uppercase text-amber-900 bg-amber-200/90 px-1.5 py-0.2 rounded-full mt-1">
                                  Filtro Ativo
                                </span>
                              )}
                            </button>

                            {/* Recusados */}
                            <button
                              type="button"
                              onClick={() => setModalCallupStatusFilter(prev => prev === 'declined' ? 'all' : 'declined')}
                              className={`p-3 rounded-2xl border-2 text-center transition-all cursor-pointer select-none active:scale-95 flex flex-col items-center justify-center ${
                                modalCallupStatusFilter === 'declined'
                                  ? 'bg-red-100 border-red-500 shadow-md ring-2 ring-red-500/40'
                                  : 'bg-white border-red-200 hover:bg-red-50'
                              }`}
                              title="Filtrar por Recusados"
                            >
                              <p className="text-2xl font-black text-red-800">{declinedList.length}</p>
                              <p className="text-[11px] font-bold text-red-900 flex items-center justify-center gap-1 mt-0.5">
                                <XCircle size={12} /> Recusados
                              </p>
                              {modalCallupStatusFilter === 'declined' && (
                                <span className="text-[9px] font-black uppercase text-red-900 bg-red-200/90 px-1.5 py-0.2 rounded-full mt-1">
                                  Filtro Ativo
                                </span>
                              )}
                            </button>
                          </div>

                          {/* Campo de Pesquisa e Limpeza de Filtros */}
                          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                            <div className="relative flex-1 w-full">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                value={playerSearchTerm}
                                onChange={(e) => setPlayerSearchTerm(e.target.value)}
                                placeholder="Pesquisar convocado por nome..."
                                className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark"
                              />
                            </div>

                            {modalCallupStatusFilter !== 'all' && (
                              <button
                                type="button"
                                onClick={() => setModalCallupStatusFilter('all')}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                              >
                                <X size={12} /> Limpar Filtro
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lista de Convocados Filtrada */}
                        {callups.length === 0 ? (
                          <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-gray-300">
                            <Users size={32} className="mx-auto text-gray-400 mb-1" />
                            <p className="text-xs font-bold text-gray-600">Nenhum jogador convocado ainda.</p>
                          </div>
                        ) : filteredCallups.length === 0 ? (
                          <div className="text-center py-8 bg-white rounded-2xl border border-gray-200 text-gray-600 space-y-2">
                            <p className="text-xs font-bold">Nenhum atleta encontrado para os critérios selecionados.</p>
                            <button
                              onClick={() => {
                                setModalCallupStatusFilter('all')
                                setPlayerSearchTerm('')
                              }}
                              className="text-xs font-black text-csc-dark underline cursor-pointer"
                            >
                              Ver todos os {callups.length} convocados
                            </button>
                          </div>
                        ) : (
                          <div className="max-h-[480px] overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {filteredCallups.map(c => {
                                const roles = extractRolesFromProfile(c.player as any)
                                const isConfirmed = c.status === 'confirmed'
                                const isDeclined = c.status === 'declined'

                                return (
                                  <div
                                    key={c.id}
                                    className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-all shadow-2xs ${
                                      isConfirmed 
                                        ? 'bg-emerald-50/90 border-emerald-200' 
                                        : isDeclined 
                                        ? 'bg-red-50/90 border-red-200' 
                                        : 'bg-white border-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2.5 min-w-0">
                                      {/* Status Icon */}
                                      <div className="shrink-0">
                                        {isConfirmed ? (
                                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-2xs" title="Confirmado">
                                            <CheckCircle2 size={13} />
                                          </div>
                                        ) : isDeclined ? (
                                          <div className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xs" title="Recusado">
                                            <XCircle size={13} />
                                          </div>
                                        ) : (
                                          <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center shadow-2xs" title="Pendente">
                                            <HelpCircle size={13} />
                                          </div>
                                        )}
                                      </div>

                                      {/* Avatar ou Número */}
                                      <div className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 overflow-hidden">
                                        <span className="text-[11px] font-black text-gray-600">
                                          {c.player?.jersey_number ? `#${c.player.jersey_number}` : (c.player?.name ? c.player.name.charAt(0).toUpperCase() : '?')}
                                        </span>
                                      </div>

                                      {/* Nome e Posição */}
                                      <div className="min-w-0">
                                        <p className="font-extrabold text-gray-900 truncate flex items-center gap-1">
                                          {c.player?.jersey_number && (
                                            <span className="text-gray-400 text-[10px] font-bold">#{c.player.jersey_number}</span>
                                          )}
                                          <span>{getPlayerDisplayName(c.player)}</span>
                                        </p>
                                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                          {roles.map(r => (
                                            <span key={r} className="text-[8.5px] font-black px-1.5 py-0.2 rounded bg-gray-200/80 text-gray-800">
                                              {r === 'admin' ? '🛡️ Admin' : r === 'coach' ? '📋 Treinador' : '⚽ Jogador'}
                                            </span>
                                          ))}
                                          <span className={`text-[8.5px] font-bold px-1.5 py-0.2 rounded ${
                                            isConfirmed ? 'bg-emerald-200 text-emerald-900' :
                                            isDeclined ? 'bg-red-200 text-red-900' : 'bg-amber-100 text-amber-900'
                                          }`}>
                                            {isConfirmed ? 'Confirmado' : isDeclined ? 'Recusado' : 'Pendente'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Ações de Treinador/Admin na Convocatória */}
                                    {isCoachOrAdmin && (
                                      <div className="flex items-center space-x-1 shrink-0 ml-2">
                                        {!isConfirmed && (
                                          <button 
                                            onClick={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'confirmed')} 
                                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer" 
                                            title="Marcar como Confirmado"
                                          >
                                            <CheckCircle2 size={14} />
                                          </button>
                                        )}
                                        {!isDeclined && (
                                          <button 
                                            onClick={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'declined')} 
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer" 
                                            title="Marcar como Recusado"
                                          >
                                            <XCircle size={14} />
                                          </button>
                                        )}
                                        <button 
                                          onClick={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)} 
                                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer" 
                                          title="Remover da Convocatória"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Evento com Seleção de Convocatória (Versão Larga 2 Colunas) */}
      {isAddModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleAttemptCloseAddModal()
          }}
        >
          <div className="bg-white rounded-3xl max-w-5xl xl:max-w-6xl w-full p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
            <button
              type="button"
              onClick={handleAttemptCloseAddModal}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors z-10 cursor-pointer"
              title="Fechar"
            >
              <X size={24} />
            </button>
            <h2 className="text-2xl font-black text-csc-dark mb-6">Criar Novo Evento</h2>
            
            <form onSubmit={handleAddEvent} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUNA ESQUERDA: Dados do Evento (6 Colunas) */}
              <div className="lg:col-span-6 space-y-4">
                {type === 'gathering' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Título do Convívio *</label>
                    <input
                      type="text"
                      required={type === 'gathering'}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                      placeholder="Ex: Jantar de Natal / Reentré"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de Evento</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                  >
                    <option value="match">Jogo</option>
                    <option value="practice">Treino</option>
                    <option value="gathering">Convívio</option>
                  </select>
                </div>

                {type === 'match' && (
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
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
                      <label htmlFor="isFriendly" className="ml-2 text-sm font-semibold text-gray-700 cursor-pointer">
                        Jogo Amigável
                      </label>
                    </div>
                    {!isFriendly && (
                      <div className="animate-fade-in">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Torneio / Competição</label>
                        <select
                          value={tournamentId}
                          onChange={(e) => setTournamentId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                        >
                          <option value="">-- Selecionar Torneio --</option>
                          {tournaments.map(t => (
                            <option key={t.id} value={t.id}>
                              🏆 {t.name} {t.season ? `(${t.season})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Adversário</label>
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                        >
                          <option value="">-- Selecionar Adversário --</option>
                          <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Adversário...</option>
                          {opponents.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Condição de Jogo</label>
                        <select
                          value={homeAway}
                          onChange={(e) => setHomeAway(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                        >
                          <option value="home">🏠 Casa</option>
                          <option value="away">✈️ Fora</option>
                          <option value="neutral">⚖️ Campo Neutro</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Data e Hora *</label>
                    <input
                      type="datetime-local"
                      required
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Concentração (opcional)</label>
                    <input
                      type="time"
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                      placeholder="Ex: 19:30"
                    />
                  </div>
                </div>

                {/* Campo / Instalação do Evento */}
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
                    {location && (
                      <a
                        href={getGoogleMapsUrl(location)}
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
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-800 flex items-center gap-1.5">
                        <span>🏟️ Campo / Instalação *</span>
                        {location && (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                            ✓ {location}
                          </span>
                        )}
                      </label>
                    </div>
                    <select
                      required
                      value={fieldId}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setQuickFieldTarget('create')
                          setIsQuickFieldModalOpen(true)
                        } else {
                          setFieldId(e.target.value)
                          const sel = fields.find(f => f.id === e.target.value)
                          if (sel) {
                            setLocation(sel.address ? `${sel.name} (${sel.address})` : sel.name)
                          } else {
                            setLocation('')
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                    >
                      <option value="">-- Escolher Campo / Instalação do Clube --</option>
                      <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Campo...</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          🏟️ {f.name} {f.address ? `(${f.address})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Descrição / Notas</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                    placeholder="Informações adicionais, indicações para atletas..."
                  />
                </div>

                {/* SELEÇÃO DE RECORRÊNCIA (Apenas para Treinos) */}
                {type === 'practice' && (
                  <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isRecurring}
                          onChange={(e) => setIsRecurring(e.target.checked)}
                          className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                        />
                        <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                          <Repeat size={16} className="text-csc-gold" />
                          <span>Marcar Treino com Recorrência Semanal</span>
                        </span>
                      </label>
                      {isRecurring && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-csc-gold text-csc-dark shadow-2xs">
                          Recorrência Ativa
                        </span>
                      )}
                    </div>

                    {isRecurring && (
                      <div className="pt-2 space-y-3 border-t border-amber-200/60 text-xs">
                        {/* Dias da Semana */}
                        <div>
                          <label className="block font-bold text-gray-700 mb-1.5">
                            Dias da semana em que se realiza o evento:
                          </label>
                          <div className="flex flex-wrap gap-1.5">
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
                                    setRecurrenceWeekdays(prev => 
                                      prev.includes(d.val) 
                                        ? prev.filter(v => v !== d.val) 
                                        : [...prev, d.val]
                                    )
                                  }}
                                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                                    isChecked 
                                      ? 'bg-csc-dark text-white shadow-xs font-black' 
                                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Data Limite da Recorrência */}
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">
                            Repetir até à data (Data Final) *
                          </label>
                          <input
                            type="date"
                            required={isRecurring}
                            value={recurrenceEndDate}
                            min={dateTime ? dateTime.split('T')[0] : undefined}
                            onChange={(e) => setRecurrenceEndDate(e.target.value)}
                            className="w-full sm:w-60 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                          />
                        </div>

                        {/* Contador e Pré-visualização em tempo real */}
                        {dateTime && recurrenceEndDate && recurrenceWeekdays.length > 0 && (() => {
                          const generated = calculateRecurringDates(dateTime, recurrenceEndDate, recurrenceWeekdays)
                          return (
                            <div className="p-2.5 bg-white border border-amber-200 rounded-lg font-medium text-amber-950 flex items-center gap-2">
                              <CalendarRange size={16} className="text-csc-gold shrink-0" />
                              <span>
                                ✨ Serão criados <strong>{generated.length} eventos</strong> entre {new Date(dateTime).toLocaleDateString('pt-PT')} e {new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}.
                              </span>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* COLUNA DIREITA: SELEÇÃO DE JOGADORES (CONVOCATÓRIA) (6 Colunas) */}
              <div className="lg:col-span-6 bg-gray-50/80 p-5 rounded-2xl border border-gray-200 space-y-3.5">
                {type === 'practice' ? (
                  <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50/40 border-2 border-amber-200/80 rounded-3xl space-y-4 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-csc-dark text-csc-gold mx-auto flex items-center justify-center font-black text-2xl shadow-md">
                      <TrainingIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-csc-dark">Convocatória Automática de Treino</h3>
                      <p className="text-xs text-gray-600 mt-1.5 max-w-sm mx-auto leading-relaxed">
                        Nos treinos, não é necessário fazer convocatória manual. Todos os <strong>{allPlayers.filter(p => isPlayerEligible(p, 'practice')).length} atletas disponíveis</strong> ficam automaticamente convocados.
                      </p>
                    </div>
                    <div className="p-3.5 bg-white/90 border border-amber-200 rounded-2xl text-left space-y-2 shadow-2xs">
                      <p className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                        <span>Gestão de Presenças no Treino:</span>
                      </p>
                      <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
                        <li>O treino fica imediatamente visível na agenda e na página principal.</li>
                        <li>Cada jogador poderá marcar <strong>Confirmar</strong> ou <strong>Recusar</strong>.</li>
                        <li>O quórum de confirmados/recusados é atualizado em tempo real.</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200/80 pb-2.5">
                      <div>
                        <label className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                          <Users size={16} className="text-csc-dark" />
                          <span>
                            Convocatória Inicial ({selectedPlayerIds.length}{maxPlayers !== '' ? ` / ${maxPlayers} máx` : ''})
                          </span>
                        </label>
                        <p className="text-[11px] text-gray-500 mt-0.5">Selecione os atletas a convocar para este evento.</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={handleRepeatLastCallup}
                          className="font-bold text-csc-dark bg-white border border-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-50 flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                          title="Repetir a lista de convocados do jogo anterior"
                        >
                          <RotateCcw size={12} /> Repetir Última
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllPlayers}
                          className="font-bold text-csc-dark bg-white border border-gray-300 px-2 py-1 rounded-lg hover:bg-gray-50 cursor-pointer shadow-2xs"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={handleClearPlayers}
                          className="font-bold text-red-600 bg-white border border-gray-300 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer shadow-2xs"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {/* Banner de Aviso de Limite */}
                    {maxPlayers !== '' && selectedPlayerIds.length > Number(maxPlayers) && (
                      <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-center gap-2 animate-pulse">
                        <AlertTriangle size={16} className="shrink-0 text-red-600" />
                        <span>Aviso: O número de atletas convocados ({selectedPlayerIds.length}) ultrapassa o limite definido de {maxPlayers} jogadores!</span>
                      </div>
                    )}
                    {maxPlayers !== '' && selectedPlayerIds.length === Number(maxPlayers) && (
                      <div className="p-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-800 font-bold flex items-center gap-2">
                        <CheckCircle2 size={15} className="shrink-0 text-green-600" />
                        <span>Limite máximo de {maxPlayers} convocados preenchido a 100%.</span>
                      </div>
                    )}

                    {/* Barra de Pesquisa de Jogadores */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        value={playerSearchTerm}
                        onChange={(e) => setPlayerSearchTerm(e.target.value)}
                        placeholder="Pesquisar jogador por nome..."
                        className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark"
                      />
                      {playerSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setPlayerSearchTerm('')}
                          className="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-gray-600"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-xl">
                      {allPlayers
                        .filter(p => {
                          if (!playerSearchTerm) return true
                          const q = playerSearchTerm.toLowerCase()
                          return p.name.toLowerCase().includes(q) ||
                            p.shirt_name?.toLowerCase().includes(q) ||
                            p.nickname?.toLowerCase().includes(q) ||
                            (p.jersey_number && p.jersey_number.toString().includes(q))
                        })
                        .map(p => {
                          const isSelected = selectedPlayerIds.includes(p.id)
                          const isEligible = isPlayerEligible(p, type)
                          const isInjured = p.status === 'injured'
                          const roles = extractRolesFromProfile(p)

                          return (
                            <div
                              key={p.id}
                              onClick={() => togglePlayerSelection(p.id)}
                              className={`flex items-center justify-between p-2.5 rounded-xl text-xs border transition-colors ${
                                !isEligible 
                                  ? 'bg-red-50/60 border-red-200 text-red-700 opacity-60 cursor-not-allowed'
                                  : isSelected 
                                    ? 'bg-amber-50/80 font-black text-gray-900 border-amber-300 shadow-2xs cursor-pointer' 
                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!isEligible}
                                  onChange={() => {}} // controlado pelo onClick pai
                                  className="h-4 w-4 text-csc-dark rounded border-gray-300 pointer-events-none shrink-0"
                                />

                                <div className="w-6 h-6 rounded-lg bg-csc-dark text-csc-gold flex items-center justify-center font-black text-[10px] shrink-0">
                                  {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold leading-tight">{getPlayerDisplayName(p)}</p>
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
                              {isInjured && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0 ml-1">
                                  {type === 'gathering' ? 'Lesionado (Disponível)' : 'Lesionado'}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      {allPlayers.filter(p => {
                        if (!playerSearchTerm) return true
                        const q = playerSearchTerm.toLowerCase()
                        return p.name.toLowerCase().includes(q) ||
                          p.shirt_name?.toLowerCase().includes(q) ||
                          p.nickname?.toLowerCase().includes(q) ||
                          (p.jersey_number && p.jersey_number.toString().includes(q))
                      }).length === 0 && (
                        <div className="col-span-2 text-center py-6 text-xs text-gray-500">
                          Nenhum jogador encontrado com "{playerSearchTerm}".
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* FOOTER */}
              <div className="col-span-full pt-5 border-t border-gray-200 flex items-center justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleAttemptCloseAddModal}
                  className="px-5 py-2.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-100 rounded-xl text-xs sm:text-sm font-bold text-gray-700 transition-colors cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-csc-dark hover:bg-black text-white rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer active:scale-95"
                >
                  <Plus size={16} className="text-csc-gold" />
                  <span>Criar Evento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDITAR EVENTO ESPECÍFICO (Versão Larga 2 Colunas) */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleAttemptCloseEditModal()
          }}
        >
          <div className="bg-white rounded-3xl max-w-5xl xl:max-w-6xl w-full p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
            <button
              type="button"
              onClick={handleAttemptCloseEditModal}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors z-10 cursor-pointer"
              title="Fechar"
            >
              <X size={24} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Edit size={22} className="text-csc-gold" />
              <h2 className="text-2xl font-black text-csc-dark">Editar Dados do Evento</h2>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              Altera a data, horário, localização, notas ou gere a convocatória deste evento na agenda.
            </p>

            <form onSubmit={handleSaveEditedEvent} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUNA ESQUERDA: Dados do Evento (6 Colunas) */}
              <div className="lg:col-span-6 space-y-4">
                {editType === 'gathering' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Título do Convívio *</label>
                    <input
                      type="text"
                      required={editType === 'gathering'}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium"
                      placeholder="Ex: Jantar de Natal / Reentré"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de Evento</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium"
                  >
                    <option value="practice">Treino</option>
                    <option value="match">Jogo</option>
                    <option value="gathering">Convívio</option>
                  </select>
                </div>

                {editType === 'match' && (
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="editIsFriendly"
                        checked={editIsFriendly}
                        onChange={(e) => {
                          setEditIsFriendly(e.target.checked)
                          if (e.target.checked) setEditTournamentId('')
                        }}
                        className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                      />
                      <label htmlFor="editIsFriendly" className="ml-2 text-sm font-semibold text-gray-700 cursor-pointer">
                        Jogo Amigável
                      </label>
                    </div>
                    {!editIsFriendly && (
                      <div className="animate-fade-in">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Torneio / Competição</label>
                        <select
                          value={editTournamentId}
                          onChange={(e) => setEditTournamentId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                        >
                          <option value="">-- Selecionar Torneio --</option>
                          {tournaments.map(t => (
                            <option key={t.id} value={t.id}>
                              🏆 {t.name} {t.season ? `(${t.season})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Adversário</label>
                        <select
                          value={editOpponentId}
                          onChange={(e) => {
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
                          {opponents.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Condição de Jogo</label>
                        <select
                          value={editHomeAway}
                          onChange={(e) => setEditHomeAway(e.target.value as any)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                        >
                          <option value="home">🏠 Casa</option>
                          <option value="away">✈️ Fora</option>
                          <option value="neutral">⚖️ Campo Neutro</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Data e Hora *</label>
                    <input
                      type="datetime-local"
                      required
                      value={editDateTime}
                      onChange={(e) => setEditDateTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Concentração (opcional)</label>
                    <input
                      type="time"
                      value={editMeetingTime}
                      onChange={(e) => setEditMeetingTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                      placeholder="Ex: 19:30"
                    />
                  </div>
                </div>

                {/* Campo / Instalação do Evento */}
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
                    {editLocation && (
                      <a
                        href={getGoogleMapsUrl(editLocation)}
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
                  <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-gray-800 flex items-center gap-1.5">
                        <span>🏟️ Campo / Instalação *</span>
                        {editLocation && (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                            ✓ {editLocation}
                          </span>
                        )}
                      </label>
                    </div>
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
                            setEditLocation(sel.address ? `${sel.name} (${sel.address})` : sel.name)
                          } else {
                            setEditLocation('')
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-medium"
                    >
                      <option value="">-- Escolher Campo / Instalação do Clube --</option>
                      <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Campo...</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          🏟️ {f.name} {f.address ? `(${f.address})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Descrição / Notas</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    placeholder="Observações ou notas do evento..."
                  />
                </div>
              </div>

              {/* COLUNA DIREITA: GESTÃO DA CONVOCATÓRIA (6 Colunas) */}
              <div className="lg:col-span-6 bg-gray-50/80 p-5 rounded-2xl border border-gray-200 space-y-3.5">
                {selectedEvent && (() => {
                  const currentCallups = eventCallups[selectedEvent.id] || []
                  const calledPlayerIds = currentCallups.map(c => c.player_id)
                  const eligibleMembers = allPlayers.filter(p => isPlayerEligible(p, editType))
                  const editUncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id) && isPlayerEligible(p, editType))

                  const handleEditAddAll = async () => {
                    if (editUncalledPlayers.length === 0 || isEditBatchCalling) return
                    setIsEditBatchCalling(true)
                    try {
                      const validIds = await ensurePlayerIdsForSupabase(editUncalledPlayers.map(p => p.id), allPlayers)
                      if (validIds.length > 0) {
                        // Obter convocatórias existentes na base de dados para garantir que não há conflitos
                        const { data: existingDbCallups } = await supabase
                          .from('callups')
                          .select('player_id')
                          .eq('event_id', selectedEvent.id)
                        
                        const existingPlayerIds = new Set((existingDbCallups || []).map(c => c.player_id))
                        const toInsert = validIds.filter(pId => pId && !existingPlayerIds.has(pId))

                        if (toInsert.length > 0) {
                          const payload = toInsert.map(pId => ({
                            event_id: selectedEvent.id,
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
                        await fetchEventsAndData()
                        toast.success('Todos os membros elegíveis foram convocados com sucesso!')
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar todos: ' + err.message)
                    } finally {
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditAddOnlyPlayers = async () => {
                    const uncalledAthletes = editUncalledPlayers.filter(p => p.role === 'player' || !['coach', 'admin'].includes(p.role))
                    if (uncalledAthletes.length === 0 || isEditBatchCalling) return
                    setIsEditBatchCalling(true)
                    try {
                      const validIds = await ensurePlayerIdsForSupabase(uncalledAthletes.map(p => p.id), allPlayers)
                      if (validIds.length > 0) {
                        const { data: existingDbCallups } = await supabase
                          .from('callups')
                          .select('player_id')
                          .eq('event_id', selectedEvent.id)
                        
                        const existingPlayerIds = new Set((existingDbCallups || []).map(c => c.player_id))
                        const toInsert = validIds.filter(pId => pId && !existingPlayerIds.has(pId))

                        if (toInsert.length > 0) {
                          const payload = toInsert.map(pId => ({
                            event_id: selectedEvent.id,
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
                        await fetchEventsAndData()
                        toast.success('Jogadores elegíveis convocados com sucesso!')
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar jogadores: ' + err.message)
                    } finally {
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditAddStaff = async () => {
                    const uncalledStaff = editUncalledPlayers.filter(p => ['coach', 'admin'].includes(p.role))
                    if (uncalledStaff.length === 0 || isEditBatchCalling) return
                    setIsEditBatchCalling(true)
                    try {
                      const validIds = await ensurePlayerIdsForSupabase(uncalledStaff.map(p => p.id), allPlayers)
                      if (validIds.length > 0) {
                        const { data: existingDbCallups } = await supabase
                          .from('callups')
                          .select('player_id')
                          .eq('event_id', selectedEvent.id)
                        
                        const existingPlayerIds = new Set((existingDbCallups || []).map(c => c.player_id))
                        const toInsert = validIds.filter(pId => pId && !existingPlayerIds.has(pId))

                        if (toInsert.length > 0) {
                          const payload = toInsert.map(pId => ({
                            event_id: selectedEvent.id,
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
                        await fetchEventsAndData()
                        toast.success('Staff/Treinadores convocados com sucesso!')
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar staff: ' + err.message)
                    } finally {
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditRemoveAll = () => {
                    if (currentCallups.length === 0 || isEditBatchCalling) return
                    setConfirmModalConfig({
                      isOpen: true,
                      title: 'Limpar Todos os Convocados',
                      description: 'Tens a certeza que desejas remover todos os membros e atletas convocados para este evento?',
                      confirmText: 'Sim, Limpar Convocatória',
                      cancelText: 'Cancelar',
                      variant: 'danger',
                      onConfirm: async () => {
                        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
                        setIsEditBatchCalling(true)
                        try {
                          const callupIds = currentCallups.map(c => c.id)
                          const { error } = await supabase.from('callups').delete().in('id', callupIds)
                          if (error) throw error
                          await fetchEventsAndData()
                          toast.info('Todos os convocados foram removidos.')
                        } catch (err: any) {
                          toast.error('Erro ao remover todos: ' + err.message)
                        } finally {
                          setIsEditBatchCalling(false)
                        }
                      }
                    })
                  }

                  const handleToggleCallup = async (player: Profile) => {
                    const existing = currentCallups.find(c => c.player_id === player.id)
                    if (existing) {
                      const { error } = await supabase.from('callups').delete().eq('id', existing.id)
                      if (!error) await fetchEventsAndData()
                    } else {
                      if (!isPlayerEligible(player, editType)) {
                        toast.warning('Este atleta está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
                        return
                      }
                      const validIds = await ensurePlayerIdsForSupabase([player.id], allPlayers)
                      if (validIds.length > 0) {
                        const { error } = await supabase.from('callups').upsert([{
                          event_id: selectedEvent.id,
                          player_id: validIds[0],
                          status: 'called'
                        }], {
                          onConflict: 'event_id, player_id',
                          ignoreDuplicates: true
                        })
                        if (!error) await fetchEventsAndData()
                      }
                    }
                  }

                  const filteredMembers = allPlayers.filter(p => {
                    if (!editPlayerSearchTerm) return true
                    const q = editPlayerSearchTerm.toLowerCase()
                    return p.name.toLowerCase().includes(q) ||
                      p.shirt_name?.toLowerCase().includes(q) ||
                      p.nickname?.toLowerCase().includes(q) ||
                      (p.jersey_number && p.jersey_number.toString().includes(q))
                  })

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-gray-200/80 pb-2.5">
                        <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                          <Users size={15} className="text-csc-dark" />
                          <span>Convocatória ({calledPlayerIds.length} convocados)</span>
                        </span>
                        <span className="text-[10px] bg-csc-dark text-csc-gold font-bold px-2.5 py-0.5 rounded-full">
                          {eligibleMembers.length} Elegíveis {allPlayers.length !== eligibleMembers.length ? `(${allPlayers.length} Total)` : ''}
                        </span>
                      </div>

                      {/* Botões Rápidos de Convocação */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={handleEditAddAll}
                          disabled={editUncalledPlayers.length === 0 || isEditBatchCalling}
                          className="px-2 py-1.5 bg-csc-dark hover:bg-black text-white rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-40"
                        >
                          <Sparkles size={11} className="text-csc-gold" />
                          <span>✨ Todos ({editUncalledPlayers.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditAddOnlyPlayers}
                          disabled={editUncalledPlayers.filter(p => p.role === 'player' || !['coach', 'admin'].includes(p.role)).length === 0 || isEditBatchCalling}
                          className="px-2 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>⚽ Jogadores</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditAddStaff}
                          disabled={editUncalledPlayers.filter(p => ['coach', 'admin'].includes(p.role)).length === 0 || isEditBatchCalling}
                          className="px-2 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>📋 Staff</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditRemoveAll}
                          disabled={currentCallups.length === 0 || isEditBatchCalling}
                          className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 border border-red-200 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>✕ Limpar</span>
                        </button>
                      </div>

                      {/* Barra de Pesquisa de Membros */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                          type="text"
                          value={editPlayerSearchTerm}
                          onChange={(e) => setEditPlayerSearchTerm(e.target.value)}
                          placeholder="Pesquisar por nome na camisola ou nº..."
                          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark font-medium"
                        />
                      </div>

                      {/* Lista Selecionável Um a Um */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-xl">
                        {filteredMembers.map(p => {
                          const isCalled = calledPlayerIds.includes(p.id)
                          const isEligible = isPlayerEligible(p, editType)
                          const roles = extractRolesFromProfile(p)

                          return (
                            <div
                              key={p.id}
                              onClick={() => isEligible && handleToggleCallup(p)}
                              className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition-colors cursor-pointer border ${
                                !isEligible 
                                  ? 'bg-red-50/60 border-red-200 text-red-700 opacity-60 cursor-not-allowed'
                                  : isCalled 
                                    ? 'bg-amber-50/80 font-black text-gray-900 border-amber-300 shadow-2xs' 
                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isCalled}
                                  disabled={!isEligible}
                                  onChange={() => {}}
                                  className="h-4 w-4 text-csc-dark rounded border-gray-300 pointer-events-none shrink-0"
                                />

                                <div className="w-6 h-6 rounded-lg bg-csc-dark text-csc-gold flex items-center justify-center font-black text-[10px] shrink-0">
                                  {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-bold leading-tight">{getPlayerDisplayName(p)}</p>
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
                                  {editType === 'gathering' ? 'Lesionado (Pode ir)' : 'Lesionado'}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* FOOTER */}
              <div className="col-span-full pt-5 border-t border-gray-200 flex items-center justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleAttemptCloseEditModal}
                  className="px-5 py-2.5 border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-100 rounded-xl text-xs sm:text-sm font-bold text-gray-700 transition-colors cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-csc-dark hover:bg-black text-white rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer active:scale-95"
                >
                  <Save size={16} className="text-csc-gold" />
                  <span>Guardar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CRIAR NOVO CAMPO INLINE */}
      {isQuickFieldModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
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
                  placeholder="Ex: Campo Sintético Municipal de Tires"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Morada / Localização</label>
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
                  <Plus size={14} className="text-csc-gold" />
                  <span>{isSavingQuickField ? 'A guardar...' : 'Guardar & Selecionar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4.5: CRIAR NOVO ADVERSÁRIO INLINE */}
      {isQuickOpponentModalOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
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

      {/* MODAL 5: CONFIRMAÇÃO DE REENVIO DE CONVOCATÓRIAS APÓS EDIÇÃO */}
      {isResendPromptOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-60 animate-fade-in select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                <RefreshCw size={24} className={isSavingEditLoading ? 'animate-spin' : ''} />
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
                disabled={isSavingEditLoading}
                onClick={() => handleConfirmSaveEditedEvent(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                <Send size={16} />
                <span>{isSavingEditLoading ? 'A processar...' : 'Sim, Reenviar Pedidos aos Atletas'}</span>
              </button>

              <button
                type="button"
                disabled={isSavingEditLoading}
                onClick={() => handleConfirmSaveEditedEvent(false)}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-gray-200 disabled:opacity-50"
              >
                <Save size={16} />
                <span>Não, Apenas Gravar (Manter Respostas)</span>
              </button>

              <button
                type="button"
                disabled={isSavingEditLoading}
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
          if (unsavedModalTarget === 'add') {
            setUnsavedModalTarget(null)
            const fakeEvent = { preventDefault: () => {} } as React.FormEvent
            await handleAddEvent(fakeEvent)
          } else if (unsavedModalTarget === 'edit') {
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
          if (unsavedModalTarget === 'add') {
            setIsAddModalOpen(false)
            setTitle('')
            setLocation('')
            setDescription('')
            setMaxPlayers('')
            setTournamentId('')
            setOpponentId('')
            setIsFriendly(true)
            setIsRecurring(false)
            setRecurrenceEndDate('')
            setRecurrenceWeekdays([])
            setSelectedPlayerIds([])
          } else if (unsavedModalTarget === 'edit') {
            setIsEditModalOpen(false)
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

export default CalendarPage
