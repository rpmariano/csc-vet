import React, { useEffect, useState } from 'react'
import { 
  MapPin, 
  Clock, 
  Plus, 
  X, 
  Award, 
  Users, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  UserPlus, 
  Trash2, 
  Search, 
  RotateCcw, 
  AlertTriangle, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  CalendarDays as CalendarDaysIcon,
  List as ListIcon,
  Repeat,
  Edit,
  Save,
  CalendarRange,
  Link2,
  PartyPopper,
  Trophy,
  Sparkles
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'
import { TrainingIcon } from './EventsPage'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'

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
      })
    } else {
      emailMap.set(remotePlayer.id, remotePlayer)
    }
  })

  return Array.from(emailMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  location: string
  description: string
  is_friendly?: boolean | null
  tournament_name?: string | null
  max_players?: number | null
  home_away?: 'home' | 'away' | 'neutral' | null
  related_gathering_id?: string | null
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
  player: {
    id: string
    name: string
    photo_url: string | null
  }
}

const CalendarPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
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
  const [managingCallupsInModal, setManagingCallupsInModal] = useState(false)
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [modalCallupStatusFilter, setModalCallupStatusFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [dateTime, setDateTime] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentName, setTournamentName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('')
  const [relatedGatheringId, setRelatedGatheringId] = useState('')

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([3]) // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  // Edit Event states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [editDateTime, setEditDateTime] = useState('')
  const [editMeetingTime, setEditMeetingTime] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMaxPlayers, setEditMaxPlayers] = useState<number | ''>('')
  const [editTournamentName, setEditTournamentName] = useState('')
  const [editIsFriendly, setEditIsFriendly] = useState(false)
  const [editRelatedGatheringId, setEditRelatedGatheringId] = useState('')

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

  // Desativar recorrência em eventos que não sejam treino
  useEffect(() => {
    if (type !== 'practice') {
      setIsRecurring(false)
    }
  }, [type])

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

  const fetchEventsAndData = async () => {
    setLoading(true)
    try {
      const [evRes, callupsRes, profilesRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url)')
          .order('date_time', { ascending: true }),
        supabase
          .from('callups')
          .select('id, event_id, player_id, status, player:profiles(id, name, photo_url)'),
        supabase
          .from('profiles')
          .select('*')
          .neq('status', 'inactive')
          .order('name', { ascending: true })
      ])

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

      if (callupsRes.data) {
        const map: Record<string, CallupWithPlayer[]> = {}
        callupsRes.data.forEach((c: any) => {
          if (!map[c.event_id]) map[c.event_id] = []
          map[c.event_id].push(c as CallupWithPlayer)
        })
        setEventCallups(map)
      }

      if (profilesRes.data) {
        const merged = mergeProfilesWithSeedData((profilesRes.data as Profile[]) || [])
        setAllPlayers(merged)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEventsAndData()
  }, [])

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
    } else {
      alert('Ainda não existem convocatórias anteriores para repetir.')
    }
  }

  const togglePlayerSelection = (playerId: string) => {
    const p = allPlayers.find(pl => pl.id === playerId)
    if (p && !isPlayerEligible(p, type)) {
      alert('Este jogador está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
      return
    }

    const willSelect = !selectedPlayerIds.includes(playerId)
    if (willSelect && maxPlayers !== '' && selectedPlayerIds.length >= Number(maxPlayers)) {
      if (!confirm(`⚠️ Aviso de Limite: A convocatória já atingiu o limite definido de ${maxPlayers} jogadores (${selectedPlayerIds.length} selecionados).\n\nDeseja selecionar este atleta a mais mesmo assim?`)) {
        return
      }
    }

    setSelectedPlayerIds(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    )
  }

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let createdEventsList: Event[] = []

      const computedTitle = type === 'match'
        ? (isFriendly ? 'Jogo Amigável' : (tournamentName ? `Jogo ${tournamentName}` : 'Jogo'))
        : type === 'practice'
        ? 'Treino'
        : (title.trim() || 'Convívio')

      if (isRecurring && recurrenceEndDate && recurrenceWeekdays.length > 0) {
        const dates = calculateRecurringDates(dateTime, recurrenceEndDate, recurrenceWeekdays)
        if (dates.length === 0) {
          alert('Nenhuma data encontrada para os dias da semana e intervalo escolhidos.')
          return
        }

        const eventsToInsert = dates.map(d => ({
          title: computedTitle,
          type,
          date_time: d.toISOString(),
          location,
          description,
          max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
          is_friendly: type === 'match' ? isFriendly : undefined,
          tournament_name: (type === 'match' && !isFriendly) ? tournamentName : undefined,
          created_by: profile?.id
        }))

        const { data: createdBatch, error } = await supabase
          .from('events')
          .insert(eventsToInsert)
          .select()

        if (error) throw error
        if (createdBatch) createdEventsList = createdBatch as Event[]

        // Inserir convocatórias para todos os eventos criados
        if (createdEventsList.length > 0 && selectedPlayerIds.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(selectedPlayerIds, allPlayers)
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

        alert(`✨ ${createdEventsList.length} eventos criados com sucesso até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`)
      } else {
        const newEvent = {
          title: computedTitle,
          type,
          date_time: new Date(dateTime).toISOString(),
          meeting_time: meetingTime ? `${meetingTime}:00` : null,
          location,
          description,
          max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
          is_friendly: type === 'match' ? isFriendly : undefined,
          tournament_name: (type === 'match' && !isFriendly) ? tournamentName : undefined,
          related_gathering_id: relatedGatheringId || null,
          created_by: profile?.id
        }

        const { data: createdEvent, error } = await supabase
          .from('events')
          .insert([newEvent])
          .select()
          .single()

        if (error) throw error

        // Se tiver evento associado, atualizar o outro evento bidirecionalmente
        if (createdEvent && relatedGatheringId) {
          await supabase
            .from('events')
            .update({ related_gathering_id: createdEvent.id })
            .eq('id', relatedGatheringId)
        }

        // Se houver jogadores selecionados, criar convocatórias
        if (createdEvent && selectedPlayerIds.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(selectedPlayerIds, allPlayers)
          const callupsToInsert = validIds.map(pId => ({
            event_id: createdEvent.id,
            player_id: pId,
            status: 'called'
          }))
          await supabase.from('callups').insert(callupsToInsert)
        }
        alert('✨ Evento criado com sucesso!')
      }

      setIsAddModalOpen(false)
      // Reset form
      setTitle('')
      setDescription('')
      setMaxPlayers('')
      setTournamentName('')
      setIsFriendly(true)
      setIsRecurring(false)
      setRecurrenceEndDate('')
      setRecurrenceWeekdays([])
      setSelectedPlayerIds([])
      setRelatedGatheringId('')
      fetchEventsAndData()
    } catch (err: any) {
      alert('Erro ao criar evento: ' + (err.message || 'Erro'))
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
    setEditLocation(ev.location || '')
    setEditDescription(ev.description || '')
    setEditMaxPlayers(ev.max_players ?? '')
    setEditTournamentName(ev.tournament_name || '')
    setEditIsFriendly(Boolean(ev.is_friendly))
    // Look up existing related event (bidirectional)
    const linked = events.find(e => e.id !== ev.id && (e.id === ev.related_gathering_id || e.related_gathering_id === ev.id))
    setEditRelatedGatheringId(linked ? linked.id : (ev.related_gathering_id || ''))
    setIsEditModalOpen(true)
  }

  const handleSaveEditedEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEvent) return
    try {
      const computedTitle = editType === 'match'
        ? (editIsFriendly ? 'Jogo Amigável' : (editTournamentName ? `Jogo ${editTournamentName}` : 'Jogo'))
        : editType === 'practice'
        ? 'Treino'
        : (editTitle.trim() || 'Convívio')

      const payload: any = {
        title: computedTitle,
        type: editType,
        date_time: new Date(editDateTime).toISOString(),
        meeting_time: editMeetingTime ? `${editMeetingTime}:00` : null,
        location: editLocation,
        description: editDescription,
        max_players: editMaxPlayers !== '' ? Number(editMaxPlayers) : null,
        tournament_name: (editType === 'match' && !editIsFriendly) ? editTournamentName : null,
        is_friendly: editType === 'match' ? editIsFriendly : false,
        related_gathering_id: editRelatedGatheringId || null
      }

      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', selectedEvent.id)

      if (error) throw error

      // Atualização Bidirecional no Supabase
      if (editRelatedGatheringId) {
        await supabase
          .from('events')
          .update({ related_gathering_id: selectedEvent.id })
          .eq('id', editRelatedGatheringId)
      } else {
        // Se removeu a associação, limpa o evento anteriormente associado
        const prevLinked = events.find(e => e.id !== selectedEvent.id && (e.id === selectedEvent.related_gathering_id || e.related_gathering_id === selectedEvent.id))
        if (prevLinked) {
          await supabase
            .from('events')
            .update({ related_gathering_id: null })
            .eq('id', prevLinked.id)
        }
      }

      setSelectedEvent(prev => prev ? { ...prev, ...payload } : null)
      setIsEditModalOpen(false)
      fetchEventsAndData()
      alert('Evento atualizado com sucesso!')
    } catch (err: any) {
      alert('Erro ao atualizar evento: ' + (err.message || 'Erro'))
    }
  }

  const handleDeleteSpecificEvent = async (eventId: string) => {
    if (!confirm('Tem a certeza que deseja eliminar este evento da agenda?')) return
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) throw error
      setSelectedEvent(null)
      setIsEditModalOpen(false)
      fetchEventsAndData()
      alert('Evento eliminado!')
    } catch (err: any) {
      alert('Erro ao eliminar evento: ' + (err.message || 'Erro'))
    }
  }

  const handleCallupResponse = async (eventId: string, status: 'confirmed' | 'declined') => {
    if (!profile) return
    try {
      const existingCallup = eventCallups[eventId]?.find(c => c.player_id === profile.id)
      
      if (existingCallup) {
        await supabase.from('callups').update({ status }).eq('id', existingCallup.id)
      } else {
        // Se ainda não existia linha para o atleta, insere
        await supabase.from('callups').insert([{
          event_id: eventId,
          player_id: profile.id,
          status
        }])
      }

      // Atualiza estado local imediatamente
      setEventCallups(prev => {
        const list = prev[eventId] ? [...prev[eventId]] : []
        const index = list.findIndex(c => c.player_id === profile.id)
        if (index >= 0) {
          list[index] = { ...list[index], status }
        } else {
          list.push({
            id: Math.random().toString(),
            event_id: eventId,
            player_id: profile.id,
            status,
            player: {
              id: profile.id,
              name: profile.name,
              photo_url: profile.photo_url || null
            }
          })
        }
        return { ...prev, [eventId]: list }
      })
    } catch (err: any) {
      alert('Erro ao atualizar resposta: ' + err.message)
    }
  }

  // Treinador adiciona jogador a um evento existente no modal
  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    if (selectedEvent?.max_players) {
      const currentCallupsCount = eventCallups[eventId]?.length || 0
      if (currentCallupsCount >= selectedEvent.max_players) {
        if (!confirm(`⚠️ Aviso: Este evento tem um limite máximo de ${selectedEvent.max_players} jogadores (já tem ${currentCallupsCount} convocados).\n\nDeseja adicionar mais um atleta mesmo assim?`)) {
          return
        }
      }
    }

    try {
      const { data, error } = await supabase.from('callups').insert([{
        event_id: eventId,
        player_id: playerId,
        status: 'called'
      }]).select('id, event_id, player_id, status, player:profiles(id, name, photo_url)').single()

      if (error) throw error

      if (data) {
        setEventCallups(prev => ({
          ...prev,
          [eventId]: [...(prev[eventId] || []), data as unknown as CallupWithPlayer]
        }))
      }
    } catch (err: any) {
      alert('Erro ao adicionar jogador: ' + err.message)
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
    } catch (err: any) {
      alert('Erro ao atualizar RSVP: ' + err.message)
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
    } catch (err: any) {
      alert('Erro ao remover jogador: ' + err.message)
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
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const handleMonthChange = (newMonth: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), newMonth, 1))
  }

  const handleYearChange = (newYear: number) => {
    setCurrentDate(prev => new Date(newYear, prev.getMonth(), 1))
  }

  const handleToday = () => {
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
      const tourMatch = e.tournament_name?.toLowerCase().includes(q)
      const oppMatch = e.opponent?.name?.toLowerCase().includes(q) || e.opponent?.initials?.toLowerCase().includes(q)
      if (!titleMatch && !locMatch && !descMatch && !tourMatch && !oppMatch) {
        return false
      }
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
        const myCallup = profile ? (eventCallups[e.id] || []).find(c => c.player_id === profile.id) : null
        if (!myCallup || myCallup.status !== 'confirmed') return false
      } else if (statusFilter === 'my_declined') {
        const myCallup = profile ? (eventCallups[e.id] || []).find(c => c.player_id === profile.id) : null
        if (!myCallup || myCallup.status !== 'declined') return false
      } else if (statusFilter === 'my_pending') {
        const myCallup = profile ? (eventCallups[e.id] || []).find(c => c.player_id === profile.id) : null
        if (!myCallup || myCallup.status !== 'called') return false
      } else if (statusFilter === 'my_called') {
        const myCallup = profile ? (eventCallups[e.id] || []).find(c => c.player_id === profile.id) : null
        if (!myCallup) return false
      }
    }

    return true
  })

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
    const myCallup = profile ? callups.find(c => c.player_id === profile.id) : null
    const confirmedCount = callups.filter(c => c.status === 'confirmed').length
    const linkedEvent = events.find(e => e.id !== event.id && (e.id === event.related_gathering_id || e.related_gathering_id === event.id))

    const isMatch = event.type === 'match'
    const isPractice = event.type === 'practice'
    const isAway = event.home_away === 'away'

    const cscSigla = clubSettings?.initials || 'CSC'
    const oppSigla = event.opponent?.initials || event.opponent?.name?.substring(0, 6) || 'ADV'

    // Bloco equipa Cascais
    const cscBlock = (isRight: boolean) => (
      <div className={`flex-1 flex flex-col ${isRight ? 'items-end text-right' : 'items-start text-left'} min-w-0 justify-center`}>
        {/* Top: Símbolo + Sigla */}
        <div className={`flex items-center gap-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          {clubSettings?.logo_url ? (
            <img src={clubSettings.logo_url} alt="CSC" className="w-8 h-8 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
          ) : (
            <div className="w-8 h-8 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
              CSC
            </div>
          )}
          <span className="font-black text-sm text-gray-900 uppercase tracking-tight whitespace-nowrap">
            {cscSigla}
          </span>
        </div>
        {/* Bottom: Nome completo da equipa */}
        <span className="text-[11px] font-semibold text-gray-500 truncate mt-1 max-w-full block">
          {clubSettings?.name || 'CSC Cascais'}
        </span>
      </div>
    )

    // Bloco equipa Adversário
    const opponentBlock = (isRight: boolean) => (
      <div className={`flex-1 flex flex-col ${isRight ? 'items-end text-right' : 'items-start text-left'} min-w-0 justify-center`}>
        {/* Top: Símbolo + Sigla */}
        <div className={`flex items-center gap-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          {event.opponent?.logo_url ? (
            <img src={event.opponent.logo_url} alt={event.opponent.name} className="w-8 h-8 object-contain shrink-0 drop-shadow-xs bg-white rounded-lg p-0.5 border border-gray-100" />
          ) : (
            <div className="w-8 h-8 bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
              ADV
            </div>
          )}
          <span className="font-black text-sm text-gray-900 uppercase tracking-tight whitespace-nowrap">
            {oppSigla}
          </span>
        </div>
        {/* Bottom: Nome completo da equipa */}
        <span className="text-[11px] font-semibold text-gray-500 truncate mt-1 max-w-full block">
          {event.opponent?.name || 'Adversário'}
        </span>
      </div>
    )

    return (
      <div
        key={event.id}
        onClick={() => setSelectedEvent(event)}
        className={`rounded-2xl border transition-all cursor-pointer bg-white overflow-hidden shadow-xs hover:shadow-md hover:border-csc-gold flex flex-col justify-between ${
          isMatch 
            ? 'border-blue-200/80 hover:bg-blue-50/5' 
            : isPractice 
            ? 'border-emerald-200/80 hover:bg-emerald-50/5' 
            : 'border-purple-200/80 hover:bg-purple-50/5'
        }`}
      >
        {/* Top Accent Line / Header */}
        <div className={`px-4 py-2.5 flex items-center justify-between border-b ${
          isMatch 
            ? 'bg-gradient-to-r from-blue-50 via-indigo-50 to-white border-blue-100' 
            : isPractice 
            ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-emerald-100' 
            : 'bg-gradient-to-r from-purple-50 via-fuchsia-50 to-white border-purple-100'
        }`}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs ${
              isMatch 
                ? 'bg-blue-600 text-white' 
                : isPractice 
                ? 'bg-emerald-700 text-white' 
                : 'bg-purple-700 text-white'
            }`}>
              {isMatch ? <Trophy size={12} /> : isPractice ? <TrainingIcon size={12} className="text-white" /> : <PartyPopper size={12} />}
              <span>{isMatch ? 'Jogo' : isPractice ? 'Treino' : 'Convívio'}</span>
            </span>

            {isMatch && event.is_friendly && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                Amigável
              </span>
            )}

            {isMatch && event.tournament_name && !event.is_friendly && (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-blue-100 text-blue-900 border border-blue-200 truncate max-w-[130px]">
                🏆 {event.tournament_name}
              </span>
            )}
          </div>

          {callups.length > 0 && (
            <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1 bg-white px-2.5 py-0.5 rounded-full border border-gray-200 shadow-2xs">
              <Users size={12} className="text-csc-dark" />
              <span><strong className="text-csc-dark">{confirmedCount}</strong>/{callups.length} conf.</span>
            </span>
          )}
        </div>

        <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
          <div className="space-y-2.5">
            {/* Matchup Box (when event is a match with opponent) */}
            {isMatch && event.opponent && (
              <div className="bg-gradient-to-b from-gray-50 to-white p-3.5 rounded-xl border border-gray-200/90 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between gap-2.5">
                  {/* Left Team (if away -> Opponent, else -> Cascais) */}
                  {isAway ? opponentBlock(false) : cscBlock(false)}

                  {/* VS Badge */}
                  <div className="shrink-0 flex flex-col items-center">
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
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

            {/* Concentração Acima da Hora */}
            {event.meeting_time && (
              <div className="flex items-center">
                <div className="inline-flex items-center gap-1 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-xl shadow-2xs">
                  <span>⏱️ Conc: {event.meeting_time.substring(0, 5)}</span>
                </div>
              </div>
            )}

            {/* Horas e Localização / Endereço à frente */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {/* Hora */}
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-800 bg-gray-100 px-2.5 py-1 rounded-xl shrink-0">
                <Clock size={13} className="text-csc-dark" />
                <span>{new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>

              {/* Localização & Maps */}
              {event.location && (
                <div className="inline-flex items-center gap-1 text-xs text-gray-700 bg-gray-100 px-2.5 py-1 rounded-xl max-w-full truncate min-w-0">
                  <MapPin size={13} className="text-red-600 shrink-0" />
                  <span className="truncate">{event.location}</span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
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

            {/* Linked / Associated Event (Bidirecional) */}
            {linkedEvent && (
              <div 
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedEvent(linkedEvent)
                }}
                className="p-2.5 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-indigo-200 text-indigo-950 flex items-center justify-between gap-2 shadow-2xs hover:border-indigo-400 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-2xs">
                    {linkedEvent.type === 'gathering' ? '🎉' : linkedEvent.type === 'match' ? '⚽' : '🏃'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-wider text-indigo-700 block">
                      {linkedEvent.type === 'gathering' ? 'Convívio Associado' : linkedEvent.type === 'match' ? 'Jogo Associado' : 'Treino Associado'}
                    </span>
                    <span className="text-xs font-black text-gray-900 truncate block group-hover:text-indigo-900">
                      {linkedEvent.title}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-white text-indigo-700 border border-indigo-200 shrink-0 shadow-2xs">
                  {new Date(linkedEvent.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} ↗
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {/* Observações / Descrição (diretamente acima da confirmação) */}
            {event.description && (
              <div className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
              </div>
            )}

            {/* Ação rápida de Presença (RSVP) */}
            {myCallup && (
              <div 
                onClick={(e) => e.stopPropagation()} 
                className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-bold text-gray-700">Presença:</span>
                {myCallup.status === 'called' ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCallupResponse(event.id, 'confirmed')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3 py-1.5 rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} />
                      <span>Confirmar</span>
                    </button>
                    <button
                      onClick={() => handleCallupResponse(event.id, 'declined')}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-black px-3 py-1.5 rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                    >
                      <XCircle size={13} />
                      <span>Recusar</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs ${
                      myCallup.status === 'confirmed' 
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' 
                        : 'bg-red-100 text-red-900 border border-rose-300'
                    }`}>
                      {myCallup.status === 'confirmed' ? <CheckCircle2 size={14} className="text-emerald-700" /> : <XCircle size={14} className="text-red-700" />}
                      <span>{myCallup.status === 'confirmed' ? 'Confirmado' : 'Recusado'}</span>
                    </span>
                    <button
                      onClick={() => handleCallupResponse(event.id, myCallup.status === 'confirmed' ? 'declined' : 'confirmed')}
                      className="text-[11px] font-bold text-gray-500 hover:text-gray-800 underline cursor-pointer"
                    >
                      Alterar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-csc-dark">Calendário & Agenda</h1>
          <p className="text-gray-500 mt-1">Consulte os treinos, jogos no calendário e responda às convocatórias.</p>
        </div>

        {isCoachOrAdmin && (
          <button
            onClick={() => {
              setSelectedPlayerIds(allPlayers.map(p => p.id))
              setIsAddModalOpen(true)
            }}
            className="flex items-center justify-center space-x-2 bg-csc-dark text-white px-4 py-2.5 rounded-xl font-bold hover:bg-csc-dark/80 transition-all shadow-sm shrink-0"
          >
            <Plus size={18} />
            <span>Criar Jogo / Treino</span>
          </button>
        )}
      </div>

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

          {/* Coluna Direita: Secção de Eventos do Dia Selecionado */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
            {selectedDate && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-150 space-y-3.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDaysIcon size={18} className="text-csc-gold" />
                    <h3 className="text-sm font-black text-gray-900 capitalize">
                      {selectedDate.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                    {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'evento' : 'eventos'}
                  </span>
                </div>

                {selectedDayEvents.length === 0 ? (
                  <div className="text-center py-6 text-gray-400 text-xs">
                    <p className="font-semibold text-gray-500">Sem eventos neste dia.</p>
                    <p className="mt-1 text-[11px]">Clica num dia com marcações no calendário para ver os detalhes.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDayEvents.map(event => renderEventCard(event))}
                  </div>
                )}
              </div>
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

      {/* Modal Detalhes Evento & Convocatória (Versão Web Expandida) */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-5 sm:p-7 relative max-h-[92vh] overflow-y-auto shadow-2xl border border-gray-100">
            <button
              onClick={() => {
                setSelectedEvent(null)
                setManagingCallupsInModal(false)
                setPlayerSearchTerm('')
                setModalCallupStatusFilter('all')
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 transition-colors z-10"
              title="Fechar"
            >
              <X size={22} />
            </button>

            {/* Grelha Responsiva Versão Web (2 Colunas no Desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUNA ESQUERDA (5 Colunas): Detalhes do Evento, Matchup VS e Presença Pessoal */}
              <div className="lg:col-span-5 space-y-4">
                {/* Header do Evento (Tipo + Badges + Botões de Ação) */}
                <div className="flex items-center justify-between gap-2 pr-10">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`
                      text-xs font-black px-2.5 py-1 rounded-xl uppercase tracking-wider flex items-center gap-1 shadow-2xs
                      ${selectedEvent.type === 'match' ? 'bg-blue-600 text-white' : selectedEvent.type === 'practice' ? 'bg-emerald-700 text-white' : 'bg-purple-700 text-white'}
                    `}>
                      {selectedEvent.type === 'match' ? <Trophy size={13} /> : selectedEvent.type === 'practice' ? <TrainingIcon size={13} className="text-white" /> : <PartyPopper size={13} />}
                      <span>{selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio'}</span>
                    </span>

                    {selectedEvent.is_friendly && selectedEvent.type === 'match' && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300">
                        Amigável
                      </span>
                    )}

                    {selectedEvent.tournament_name && !selectedEvent.is_friendly && (
                      <span className="flex items-center space-x-1 text-xs text-blue-900 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-xl font-extrabold truncate max-w-[150px]">
                        <Award size={13} />
                        <span className="truncate">{selectedEvent.tournament_name}</span>
                      </span>
                    )}
                  </div>

                  {isCoachOrAdmin && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEditEvent(selectedEvent)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-2xs active:scale-95 cursor-pointer"
                        title="Editar dados deste evento"
                      >
                        <Edit size={13} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSpecificEvent(selectedEvent.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer active:scale-95"
                        title="Eliminar este evento"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Matchup Box no Modal (quando Jogo com adversário) */}
                {selectedEvent.type === 'match' && selectedEvent.opponent && (() => {
                  const isAway = selectedEvent.home_away === 'away'
                  return (
                    <div className="bg-gradient-to-b from-gray-50 to-white p-4 rounded-2xl border border-gray-200/90 shadow-2xs space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        {/* Left Team (Adversário se fora, Cascais se casa/neutro) */}
                        <div className={`flex-1 flex flex-col ${isAway ? 'items-start text-left' : 'items-start text-left'} min-w-0`}>
                          <div className="flex items-center gap-1.5">
                            {(isAway ? selectedEvent.opponent?.logo_url : clubSettings?.logo_url) ? (
                              <img src={(isAway ? selectedEvent.opponent?.logo_url : clubSettings?.logo_url) || ''} alt="Team" className="w-8 h-8 object-contain shrink-0 drop-shadow-xs" />
                            ) : (
                              <div className="w-8 h-8 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                                {isAway ? (selectedEvent.opponent?.initials || 'ADV') : (clubSettings?.initials || 'CSC')}
                              </div>
                            )}
                            <span className="font-black text-sm text-gray-900 uppercase">
                              {isAway ? (selectedEvent.opponent?.initials || 'ADV') : (clubSettings?.initials || 'CSC')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-600 truncate mt-0.5 max-w-full">
                            {isAway ? selectedEvent.opponent?.name : (clubSettings?.name || 'CSC Cascais')}
                          </span>
                        </div>

                        {/* VS Badge */}
                        <div className="shrink-0 flex flex-col items-center">
                          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            VS
                          </span>
                        </div>

                        {/* Right Team (Cascais se fora, Adversário se casa/neutro) */}
                        <div className="flex-1 flex flex-col items-end text-right min-w-0">
                          <div className="flex items-center gap-1.5 flex-row-reverse">
                            {(isAway ? clubSettings?.logo_url : selectedEvent.opponent?.logo_url) ? (
                              <img src={(isAway ? clubSettings?.logo_url : selectedEvent.opponent?.logo_url) || ''} alt="Team" className="w-8 h-8 object-contain shrink-0 drop-shadow-xs" />
                            ) : (
                              <div className="w-8 h-8 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                                {isAway ? (clubSettings?.initials || 'CSC') : (selectedEvent.opponent?.initials || 'ADV')}
                              </div>
                            )}
                            <span className="font-black text-sm text-gray-900 uppercase">
                              {isAway ? (clubSettings?.initials || 'CSC') : (selectedEvent.opponent?.initials || 'ADV')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-600 truncate mt-0.5 max-w-full">
                            {isAway ? (clubSettings?.name || 'CSC Cascais') : selectedEvent.opponent?.name}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
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

                  <div className="flex items-center justify-between text-gray-700 pt-2 border-t border-gray-200/60">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <MapPin size={16} className="text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-gray-500 uppercase">Localização</p>
                        <p className="font-extrabold text-xs text-gray-850 truncate">{selectedEvent.location || 'Sem local definido'}</p>
                      </div>
                    </div>
                    {selectedEvent.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.location)}`}
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
                </div>

                {/* Evento Associado / Linkado (Bidirecional) */}
                {(() => {
                  const linked = events.find(e => e.id !== selectedEvent.id && (e.id === selectedEvent.related_gathering_id || e.related_gathering_id === selectedEvent.id))
                  if (!linked) return null
                  return (
                    <div 
                      onClick={() => setSelectedEvent(linked)}
                      className="p-3 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-indigo-200 text-indigo-950 flex items-center justify-between gap-3 shadow-2xs hover:border-indigo-400 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 font-bold text-sm shadow-2xs">
                          {linked.type === 'gathering' ? '🎉' : linked.type === 'match' ? '⚽' : '🏃'}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">
                            {linked.type === 'gathering' ? 'Convívio Associado' : linked.type === 'match' ? 'Jogo Associado' : 'Treino Associado'}
                          </span>
                          <span className="text-sm font-black text-gray-900 truncate block group-hover:text-indigo-900">
                            {linked.title}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-white text-indigo-700 border border-indigo-200 shrink-0 shadow-2xs">
                        {new Date(linked.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} ↗
                      </span>
                    </div>
                  )
                })()}

                {/* Observações / Descrição (diretamente acima da confirmação) */}
                {selectedEvent.description && (
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 text-xs text-gray-700 space-y-1">
                    <p className="font-black text-gray-900">Observações & Informações:</p>
                    <p className="leading-relaxed">{selectedEvent.description}</p>
                  </div>
                )}

                {/* Painel do Atleta Atual (RSVP Pessoal) */}
                {(() => {
                  const callups = eventCallups[selectedEvent.id] || []
                  const myCallup = profile ? callups.find(c => c.player_id === profile.id) : null
                  if (!myCallup) return null

                  return (
                    <div className="p-4 bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl border border-gray-300 space-y-2.5 shadow-2xs">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-600">A tua convocatória</p>
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
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCallupResponse(selectedEvent.id, 'confirmed')}
                          className={`flex-1 px-4 py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 ${
                            myCallup.status === 'confirmed' ? 'bg-emerald-700 text-white' : 'bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <CheckCircle2 size={15} /> Confirmar
                        </button>
                        <button
                          onClick={() => handleCallupResponse(selectedEvent.id, 'declined')}
                          className={`flex-1 px-4 py-2 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 ${
                            myCallup.status === 'declined' ? 'bg-red-700 text-white' : 'bg-white border border-red-600 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          <XCircle size={15} /> Recusar
                        </button>
                      </div>
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
                const calledPlayerIds = callups.map(c => c.player_id)
                const uncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id))

                // Lista de atletas filtrada por status e termo de pesquisa
                const filteredCallups = callups.filter(c => {
                  if (modalCallupStatusFilter !== 'all' && c.status !== modalCallupStatusFilter) return false
                  if (!playerSearchTerm) return true
                  const nameMatch = c.player?.name?.toLowerCase().includes(playerSearchTerm.toLowerCase())
                  return nameMatch
                })

                return (
                  <div className="lg:col-span-7 bg-gray-50/70 p-4 sm:p-5 rounded-3xl border border-gray-200 space-y-4">
                    {/* Topo da Convocatória */}
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-3">
                      <div>
                        <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                          <Users size={18} className="text-csc-dark" />
                          <span>Convocatória ({callups.length}{selectedEvent.max_players ? ` / ${selectedEvent.max_players} máx` : ''})</span>
                        </h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">Consulta e gere o quórum de atletas para este evento.</p>
                      </div>

                      {isCoachOrAdmin && (
                        <button
                          onClick={() => setManagingCallupsInModal(!managingCallupsInModal)}
                          className="px-3 py-1.5 bg-csc-dark hover:bg-black text-white text-xs font-black rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                        >
                          <UserPlus size={14} className="text-csc-gold" />
                          <span>{managingCallupsInModal ? 'Fechar Adição' : '+ Convocar Atletas'}</span>
                        </button>
                      )}
                    </div>

                    {/* Gestão do Treinador para Adicionar Atletas */}
                    {managingCallupsInModal && (
                      <div className="p-3.5 bg-amber-50/80 border-2 border-amber-200 rounded-2xl space-y-2.5 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                            <Sparkles size={14} className="text-amber-700" />
                            <span>Adicionar Membros ao Evento ({uncalledPlayers.length} disponíveis)</span>
                          </p>
                        </div>
                        {(() => {
                          const eligibleUncalled = uncalledPlayers.filter(p => isPlayerEligible(p, selectedEvent.type))
                          if (eligibleUncalled.length === 0) {
                            return <p className="text-xs text-gray-600">Todos os atletas já se encontram convocados.</p>
                          }
                          return (
                            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 p-1 bg-white rounded-xl border border-amber-200">
                              {eligibleUncalled.map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handleAddPlayerToCallup(selectedEvent.id, p.id)}
                                  className="bg-gray-50 hover:bg-csc-dark hover:text-white border border-gray-300 text-xs px-2.5 py-1 rounded-xl font-bold text-gray-800 flex items-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95"
                                >
                                  <span>+ {p.name}</span>
                                  {p.jersey_number && <span className="text-amber-700 font-black">#{p.jersey_number}</span>}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    )}

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

                      {/* Barra de Pesquisa e Reset de Filtro */}
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
                      <div className="max-h-[460px] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {filteredCallups.map(c => {
                            const roles = extractRolesFromProfile(c.player as any)
                            const isConfirmed = c.status === 'confirmed'
                            const isDeclined = c.status === 'declined'

                            return (
                              <div
                                key={c.id}
                                className={`p-2.5 rounded-2xl border flex items-center justify-between text-xs transition-all shadow-2xs ${
                                  isConfirmed 
                                    ? 'bg-emerald-50/90 border-emerald-200' 
                                    : isDeclined 
                                    ? 'bg-red-50/90 border-red-200' 
                                    : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="min-w-0 flex-1 mr-2">
                                  <div className="flex items-center gap-1.5">
                                    {isConfirmed ? (
                                      <CheckCircle2 size={13} className="text-emerald-700 shrink-0" />
                                    ) : isDeclined ? (
                                      <XCircle size={13} className="text-red-700 shrink-0" />
                                    ) : (
                                      <HelpCircle size={13} className="text-amber-700 shrink-0" />
                                    )}
                                    <span className={`font-black truncate ${isDeclined ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                                      {c.player?.name || 'Membro'}
                                    </span>
                                  </div>
                                  <div className="flex gap-1 mt-1 pl-4">
                                    {roles.map(r => (
                                      <span key={r} className="text-[8px] font-black px-1.5 py-0.2 rounded bg-gray-200/80 text-gray-800">
                                        {r === 'admin' ? 'Admin' : r === 'coach' ? 'Treinador' : 'Jogador'}
                                      </span>
                                    ))}
                                    <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded ${
                                      isConfirmed ? 'bg-emerald-200 text-emerald-900' : isDeclined ? 'bg-red-200 text-red-900' : 'bg-amber-100 text-amber-900'
                                    }`}>
                                      {isConfirmed ? 'Confirmado' : isDeclined ? 'Recusado' : 'Pendente'}
                                    </span>
                                  </div>
                                </div>

                                {isCoachOrAdmin && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {!isConfirmed && (
                                      <button 
                                        onClick={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'confirmed')} 
                                        className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer" 
                                        title="Confirmar Presença"
                                      >
                                        <CheckCircle2 size={14} />
                                      </button>
                                    )}
                                    {!isDeclined && (
                                      <button 
                                        onClick={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'declined')} 
                                        className="p-1 text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer" 
                                        title="Recusar Presença"
                                      >
                                        <XCircle size={14} />
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)} 
                                      className="p-1 text-gray-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer" 
                                      title="Remover da Convocatória"
                                    >
                                      <Trash2 size={13} />
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
                )
              })()}

            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Evento com Seleção de Convocatória */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
            >
              <X size={22} />
            </button>
            <h2 className="text-2xl font-extrabold text-csc-dark mb-6">Criar Novo Evento</h2>
            
            <form onSubmit={handleAddEvent} className="space-y-4">
              {type === 'gathering' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Título do Convívio *</label>
                  <input
                    type="text"
                    required={type === 'gathering'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                    placeholder="Ex: Jantar de Natal / Reentré"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Evento</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white"
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
                        if (e.target.checked) setTournamentName('')
                      }}
                      className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="isFriendly" className="ml-2 text-sm font-semibold text-gray-700 cursor-pointer">
                      Jogo Amigável
                    </label>
                  </div>
                  {!isFriendly && (
                    <div className="animate-fade-in">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Torneio / Liga</label>
                      <input
                        type="text"
                        value={tournamentName}
                        onChange={(e) => setTournamentName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                        placeholder="Ex: Liga de Veteranos"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Data e Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Concentração</label>
                  <input
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                    placeholder="Ex: 19:30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Localização *</label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                    placeholder="Ex: Campo Sintético"
                  />
                </div>
              </div>

              {/* Associar a outro Evento (Bidirecional) */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1.5">
                <label className="block text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Link2 size={14} className="text-indigo-600" />
                  <span>🔗 Associar a outro Evento (ex: Convívio pós-jogo/treino, Jogo/Treino)</span>
                </label>
                <select
                  value={relatedGatheringId}
                  onChange={(e) => setRelatedGatheringId(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 bg-white text-xs font-medium"
                >
                  <option value="">-- Nenhum evento associado --</option>
                  {events
                    .filter(e => {
                      if (!dateTime) return true
                      const diffDays = Math.abs(new Date(e.date_time).getTime() - new Date(dateTime).getTime()) / (1000 * 3600 * 24)
                      return diffDays <= 14 // Próximas duas semanas ou mesmo período
                    })
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        [{e.type === 'gathering' ? 'Convívio' : e.type === 'match' ? 'Jogo' : 'Treino'}] {e.title} • {new Date(e.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} às {new Date(e.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição / Instruções</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white"
                  placeholder="Horário de chegada, equipamento a levar..."
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

              {/* SELEÇÃO DE JOGADORES (CONVOCATÓRIA) */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <Users size={16} className="text-csc-dark" />
                      <span>
                        Convocatória Inicial ({selectedPlayerIds.length}{maxPlayers !== '' ? ` / ${maxPlayers} máx` : ''})
                      </span>
                    </label>
                    <p className="text-[11px] text-gray-500">Selecione os atletas a convocar para este jogo/treino.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleRepeatLastCallup}
                      className="font-bold text-csc-dark bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 flex items-center gap-1 shadow-sm"
                      title="Repetir a lista de convocados do jogo anterior"
                    >
                      <RotateCcw size={12} /> Repetir Última
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllPlayers}
                      className="font-bold text-csc-dark hover:underline"
                    >
                      Todos
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearPlayers}
                      className="font-bold text-gray-500 hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Banner de Aviso de Limite */}
                {maxPlayers !== '' && selectedPlayerIds.length > Number(maxPlayers) && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold flex items-center gap-2 animate-pulse">
                    <AlertTriangle size={16} className="shrink-0 text-red-600" />
                    <span>Aviso: O número de atletas convocados ({selectedPlayerIds.length}) ultrapassa o limite definido de {maxPlayers} jogadores!</span>
                  </div>
                )}
                {maxPlayers !== '' && selectedPlayerIds.length === Number(maxPlayers) && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-bold flex items-center gap-2">
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-csc-dark"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1 bg-white border border-gray-200 rounded-lg">
                  {allPlayers
                    .filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase()))
                    .map(p => {
                      const isSelected = selectedPlayerIds.includes(p.id)
                      const isEligible = isPlayerEligible(p, type)
                      const isInjured = p.status === 'injured'

                      return (
                        <div
                          key={p.id}
                          onClick={() => togglePlayerSelection(p.id)}
                          className={`flex items-center justify-between p-2 rounded-md text-xs border transition-colors ${
                            !isEligible 
                              ? 'bg-red-50/60 border-red-200 text-red-700 opacity-60 cursor-not-allowed'
                              : isSelected 
                                ? 'bg-csc-dark/5 border-csc-dark font-bold text-csc-dark cursor-pointer' 
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isEligible}
                              onChange={() => {}} // controlado pelo onClick pai
                              className="h-3.5 w-3.5 text-csc-dark rounded border-gray-300 pointer-events-none"
                            />
                            <span className="truncate">{p.name}</span>
                          </div>
                          {isInjured && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0 ml-1">
                              {type === 'gathering' ? 'Lesionado (Disponível)' : 'Lesionado'}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  {allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase())).length === 0 && (
                    <div className="col-span-2 text-center py-3 text-xs text-gray-500">
                      Nenhum jogador encontrado com "{playerSearchTerm}".
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-csc-dark text-white py-3 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow-md mt-4 text-sm"
              >
                {isRecurring ? 'Criar Eventos Recorrentes e Enviar Convocatórias' : 'Criar Evento e Enviar Convocatória'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EDITAR EVENTO ESPECÍFICO */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Edit size={20} className="text-csc-gold" />
              <h2 className="text-xl font-black text-csc-dark">Editar Dados do Evento</h2>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              Altera a data, horário, localização ou detalhes deste dia específico na agenda.
            </p>

            <form onSubmit={handleSaveEditedEvent} className="space-y-4">
              {editType === 'gathering' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Título do Convívio *</label>
                  <input
                    type="text"
                    required={editType === 'gathering'}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    placeholder="Ex: Jantar de Natal / Reentré"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de Evento</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                >
                  <option value="practice">Treino</option>
                  <option value="match">Jogo</option>
                  <option value="gathering">Convívio</option>
                </select>
              </div>

              {editType === 'match' && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5 text-xs">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="editIsFriendly"
                      checked={editIsFriendly}
                      onChange={(e) => {
                        setEditIsFriendly(e.target.checked)
                        if (e.target.checked) setEditTournamentName('')
                      }}
                      className="h-3.5 w-3.5 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="editIsFriendly" className="ml-2 font-semibold text-gray-700 cursor-pointer">
                      Jogo Amigável
                    </label>
                  </div>
                  {!editIsFriendly && (
                    <div className="animate-fade-in">
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Nome do Torneio / Liga</label>
                      <input
                        type="text"
                        value={editTournamentName}
                        onChange={(e) => setEditTournamentName(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                        placeholder="Ex: Liga de Veteranos"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Data e Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={editDateTime}
                    onChange={(e) => setEditDateTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Concentração</label>
                  <input
                    type="time"
                    value={editMeetingTime}
                    onChange={(e) => setEditMeetingTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                    placeholder="Ex: 19:30"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Localização *</label>
                  <input
                    type="text"
                    required
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                  />
                </div>
              </div>

              {/* Associar a outro Evento (Bidirecional) */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-1.5">
                <label className="block text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                  <Link2 size={14} className="text-indigo-600" />
                  <span>🔗 Associar a outro Evento (ex: Convívio pós-jogo/treino, Jogo/Treino)</span>
                </label>
                <select
                  value={editRelatedGatheringId}
                  onChange={(e) => setEditRelatedGatheringId(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-600 bg-white text-xs font-medium"
                >
                  <option value="">-- Nenhum evento associado --</option>
                  {events
                    .filter(e => e.id !== (selectedEvent?.id || ''))
                    .map(e => (
                      <option key={e.id} value={e.id}>
                        [{e.type === 'gathering' ? 'Convívio' : e.type === 'match' ? 'Jogo' : 'Treino'}] {e.title} • {new Date(e.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} às {new Date(e.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição / Notas</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-csc-dark text-white rounded-lg text-xs font-bold hover:bg-black transition-colors flex items-center gap-1.5 shadow"
                >
                  <Save size={14} />
                  <span>Guardar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage
