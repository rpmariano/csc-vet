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
  Edit
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'
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
}

interface Field { id: string; name: string; address?: string | null }
interface Opponent { id: string; name: string; home_field_id: string | null }
interface Tournament { id: string; name: string; season: string }

interface CallupWithPlayer {
  id: string
  event_id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined'
  player: {
    id: string
    name: string
    photo_url: string | null
    jersey_number?: number | null
    role?: string
    medical_notes?: string | null
  }
}

const EventsPage: React.FC = () => {
  const { profile } = useAuth()
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

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([3]) // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

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
  const [editMaxPlayers, setEditMaxPlayers] = useState<number | ''>('')
  const [editIsFriendly, setEditIsFriendly] = useState(false)
  const [editTournamentId, setEditTournamentId] = useState('')
  const [editOpponentId, setEditOpponentId] = useState('')
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

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
    setEditMaxPlayers(ev.max_players ?? '')
    setEditIsFriendly(ev.is_friendly ?? false)
    setEditTournamentId(ev.tournament_id || '')
    setEditOpponentId(ev.opponent_id || '')
    setEditHomeAway(ev.home_away || 'home')
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEvent) return
    setIsSavingEdit(true)
    try {
      const fullIsoDateTime = new Date(`${editEventDate}T${editEventTime}:00`).toISOString()
      const payload: any = {
        title: editTitle.trim(),
        type: editType,
        date_time: fullIsoDateTime,
        meeting_time: editMeetingTime ? `${editMeetingTime}:00` : null,
        field_id: editFieldId || null,
        location: !editFieldId ? (editLocationText.trim() || null) : null,
        description: editDescription.trim() || null,
        max_players: editMaxPlayers !== '' ? Number(editMaxPlayers) : null,
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

      setEditingEvent(null)
      setSuccessMessage('✨ Evento atualizado com sucesso!')
      await fetchData()
    } catch (err: any) {
      console.error(err)
      alert('Erro ao atualizar evento: ' + (err.message || 'Erro de ligação'))
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

  // Desativar recorrência em convívios
  useEffect(() => {
    if (type === 'gathering') {
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

      if (callRes.data) {
        const map: Record<string, CallupWithPlayer[]> = {}
        callRes.data.forEach((c: any) => {
          if (!map[c.event_id]) map[c.event_id] = []
          map[c.event_id].push(c as CallupWithPlayer)
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

  useEffect(() => {
    if (type === 'match' && opponentId) {
      const opp = opponents.find(o => o.id === opponentId)
      if (homeAway === 'away' && opp?.home_field_id) {
        setFieldId(opp.home_field_id)
      }
    }
  }, [opponentId, homeAway, type, opponents])

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
    } else {
      alert('Ainda não existem convocatórias anteriores para repetir.')
    }
  }

  const togglePlayer = (id: string) => {
    const p = allPlayers.find(pl => pl.id === id)
    if (p && !isPlayerEligible(p, type)) {
      alert('Este membro está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
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
      alert('Por favor selecione a Data e a Hora do evento.')
      return
    }

    const fullIsoDateTime = new Date(`${eventDate}T${eventTime}:00`).toISOString()

    try {
      let createdEventsList: Event[] = []

      if (isRecurring && recurrenceEndDate && recurrenceWeekdays.length > 0) {
        const dates = calculateRecurringDates(eventDate, eventTime, recurrenceEndDate, recurrenceWeekdays)
        if (dates.length === 0) {
          alert('Nenhuma data encontrada para os dias da semana e intervalo escolhidos.')
          return
        }

        const eventsToInsert = dates.map(d => ({
          title: title.trim(),
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

        setSuccessMessage(`✨ ${createdEventsList.length} eventos criados com sucesso até ${new Date(recurrenceEndDate).toLocaleDateString('pt-PT')}!`)
      } else {
        const newEvent = {
          title: title.trim(),
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

        if (createdEvent && selectedPlayerIds.length > 0) {
          const validIds = await ensurePlayerIdsForSupabase(selectedPlayerIds, allPlayers)
          const rows = validIds.map(pId => ({
            event_id: createdEvent.id,
            player_id: pId,
            status: 'called'
          }))
          if (rows.length > 0) {
            await supabase.from('callups').insert(rows)
          }
        }

        setSuccessMessage('🎉 Evento criado e convocatória enviada aos membros!')
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
      alert("Erro ao criar evento: " + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if(!confirm("Tem a certeza que deseja eliminar este evento?")) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id))
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

  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    try {
      const [validPlayerId] = await ensurePlayerIdsForSupabase([playerId], allPlayers)
      if (!validPlayerId) {
        alert('Não foi possível processar o atleta.')
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
      }
    } catch (err: any) {
      alert('Erro ao convocar: ' + err.message)
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
    } catch (err: any) {
      alert('Erro ao remover: ' + err.message)
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUNA ESQUERDA: Formulário de Criação de Evento */}
        <div className="lg:col-span-5 xl:col-span-5 bg-white rounded-3xl shadow-sm border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-150">
            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Plus size={20} className="text-csc-dark" />
              <span>Novo Evento / Atividade</span>
            </h3>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              CSC Organizer
            </span>
          </div>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            
            {/* 1. Tipo de Evento */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Tipo de Evento
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'gathering', label: 'Convívio', icon: PartyPopper, color: 'text-purple-700 bg-purple-50 border-purple-300' },
                  { id: 'practice', label: 'Treino', icon: TrainingIcon, color: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
                  { id: 'match', label: 'Jogo Oficial', icon: Trophy, color: 'text-amber-800 bg-amber-50 border-amber-300' },
                ].map(t => {
                  const Icon = t.icon
                  const isSelected = type === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id as any)}
                      className={`p-2.5 rounded-2xl border-2 text-xs font-black transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                        isSelected 
                          ? `${t.color} ring-2 ring-csc-dark shadow-xs scale-102` 
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

            {/* 2. Título do Evento */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Título do Evento *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white font-medium"
                placeholder={
                  type === 'gathering'
                    ? "Ex: Jantar de Natal do Clube / Reunião Geral"
                    : type === 'match'
                    ? "Ex: Taça da Linha - Jornada 1"
                    : "Ex: Treino Tático Semanal"
                }
              />
            </div>

            {/* Específico de Jogo */}
            {type === 'match' && (
              <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isFriendly"
                    checked={isFriendly}
                    onChange={(e) => setIsFriendly(e.target.checked)}
                    className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded"
                  />
                  <label htmlFor="isFriendly" className="ml-2 text-xs font-bold text-gray-800">
                    Jogo Amigável / Treino Conjunto
                  </label>
                </div>

                {!isFriendly && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Torneio / Competição</label>
                    <select
                      value={tournamentId}
                      onChange={(e) => setTournamentId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                    >
                      <option value="">Nenhum torneio específico</option>
                      {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} ({t.season})</option>)}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Adversário</label>
                    <select
                      value={opponentId}
                      onChange={(e) => setOpponentId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                    >
                      <option value="">Selecione...</option>
                      {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 mb-1">Condição</label>
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

            {/* 3. Data, Hora e Concentração */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Data *
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Hora *
                </label>
                <input
                  type="time"
                  required
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Concentração
                </label>
                <input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                  title="Hora de chegada"
                />
              </div>
            </div>

            {/* 4. Local com funcionalidade Google Maps */}
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl space-y-2.5">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} className="text-red-600" />
                  <span>Localização do Evento</span>
                </span>
                {currentLocationStr && (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                    ✓ Local definido
                  </span>
                )}
              </label>

              <div>
                <select
                  value={fieldId}
                  onChange={(e) => setFieldId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark bg-white text-xs font-medium"
                >
                  <option value="">-- Escolher Campo/Instalação do Clube --</option>
                  {fields.map(f => (
                    <option key={f.id} value={f.id}>
                      🏟️ {f.name} {f.address ? `(${f.address})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {!fieldId && (
                <div>
                  <input
                    type="text"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
                    placeholder="Ou digite o nome do restaurante, morada ou sede..."
                  />
                </div>
              )}

              {/* Botão de Validação Google Maps em tempo real */}
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

            {/* 5. Descrição / Observações */}
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Descrição & Informações do Evento
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ex: Menus disponíveis, valor por pessoa, ordem de trabalhos ou recomendações..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark text-xs bg-white"
              />
            </div>

            {/* 6. Recorrência Opcional (Apenas para Treinos e Jogos, não para Convívios) */}
            {type !== 'gathering' && (
              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded cursor-pointer"
                    />
                    <span className="font-bold text-gray-900 flex items-center gap-1.5">
                      <Repeat size={14} className="text-csc-gold" />
                      <span>Repetir {type === 'practice' ? 'Treino' : 'Jogo'} Semanalmente</span>
                    </span>
                  </label>
                </div>

                {isRecurring && (
                  <div className="pt-2 space-y-2 border-t border-amber-200/60">
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
                              setRecurrenceWeekdays(prev => 
                                prev.includes(d.val) ? prev.filter(v => v !== d.val) : [...prev, d.val]
                              )
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                              isChecked 
                                ? 'bg-csc-dark text-white font-black' 
                                : 'bg-white text-gray-600 border border-gray-300'
                            }`}
                          >
                            {d.label}
                          </button>
                        )
                      })}
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 mb-1">Repetir até:</label>
                      <input
                        type="date"
                        required={isRecurring}
                        value={recurrenceEndDate}
                        min={eventDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white font-medium"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. Convocatória: Convocação Geral (3 Perfis) ou Escolher 1 a 1 */}
            <div className="p-4 bg-gray-50 border-2 border-amber-200 rounded-2xl space-y-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                    <Users size={15} className="text-csc-dark" />
                    <span>Convocatória ({selectedPlayerIds.length} selecionados)</span>
                  </span>
                  <span className="text-[10px] bg-csc-dark text-csc-gold font-bold px-2 py-0.5 rounded-full">
                    {totalCount} Membros
                  </span>
                </div>
              </div>

              {/* Botões Rápidos de Convocatória Geral */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2.5 py-1.5 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95"
                  title="Convocar todos os membros (Jogadores, Treinadores e Direção)"
                >
                  <Sparkles size={12} className="text-csc-gold" />
                  <span>✨ Todos ({totalCount})</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectOnlyPlayers}
                  className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  title="Convocar apenas os atletas"
                >
                  <span>⚽ Jogadores ({playersCount})</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectStaff}
                  className="px-2.5 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 rounded-xl text-[11px] font-extrabold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  title="Convocar equipa técnica e direção"
                >
                  <span>📋 Staff/Direção ({staffCount})</span>
                </button>

                <button
                  type="button"
                  onClick={handleRepeatLastCallup}
                  className="px-2.5 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                >
                  <RotateCcw size={11} />
                  <span>Repetir Última</span>
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
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
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

            <button
              type="submit"
              className="w-full py-3.5 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-2xl font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 text-sm"
            >
              <Check size={18} className="text-csc-gold" />
              <span>Publicar Evento e Convoques</span>
            </button>
          </form>
        </div>

        {/* COLUNA DIREITA: Lista de Eventos Registados & RSVP */}
        <div className="lg:col-span-7 xl:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 mb-5 border-b border-gray-150">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <CalendarRange size={20} className="text-csc-dark" />
                <span>Lista de Eventos & Quórum RSVP</span>
              </h3>
              <span className="text-xs font-bold text-gray-500">
                {events.length} registados
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-6">
                <Calendar size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="font-bold text-gray-700">Não há eventos agendados.</p>
                <p className="text-xs text-gray-500 mt-1">Crie o primeiro evento no formulário ao lado.</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {events.map((event) => {
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
                      {/* Event Top Bar */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 ${
                              event.type === 'match' ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                              event.type === 'practice' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                              'bg-purple-100 text-purple-900 border border-purple-300'
                            }`}>
                              {event.type === 'match' ? (
                                <><span>🏆</span><span>Jogo</span></>
                              ) : event.type === 'practice' ? (
                                <><TrainingIcon size={12} className="text-emerald-800" /><span>Treino</span></>
                              ) : (
                                <><span>🎉</span><span>Convívio</span></>
                              )}
                            </span>

                            {event.is_friendly && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-900 border border-yellow-300">
                                Amigável
                              </span>
                            )}
                          </div>

                          <h4 className="font-black text-gray-900 text-base leading-tight">
                            {event.type === 'match' && event.opponent_id ? `CSC vs ${getOpponentName(event.opponent_id)} • ${event.title}` : event.title}
                          </h4>

                          {event.description && (
                            <p className="text-xs text-gray-600 line-clamp-2">{event.description}</p>
                          )}
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

                      {/* Event Metadata (Date, Time, Location & Maps) */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 pt-1 border-t border-gray-200">
                        <div className="flex items-center gap-1 font-bold">
                          <Clock size={14} className="text-csc-dark" />
                          <span>
                            {new Date(event.date_time).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                            {event.meeting_time && (
                              <span className="text-amber-900 font-extrabold ml-1 bg-amber-100 px-1.5 py-0.2 rounded">
                                Conc: {event.meeting_time.substring(0, 5)}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 font-semibold">
                          <MapPin size={14} className="text-red-600 shrink-0" />
                          <span className="truncate max-w-[200px]">{locationName}</span>
                          {mapsQuery && (
                            <a
                              href={getGoogleMapsUrl(mapsQuery)}
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
                            <span>{confirmedList.length} Confirmados</span>
                          </span>

                          <span className="flex items-center gap-1 font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                            <HelpCircle size={12} className="text-amber-700" />
                            <span>{pendingList.length} Pendentes</span>
                          </span>

                          {declinedList.length > 0 && (
                            <span className="flex items-center gap-1 font-bold text-red-800 bg-red-100 border border-red-300 px-2 py-0.5 rounded-lg">
                              <XCircle size={12} className="text-red-700" />
                              <span>{declinedList.length} Recusados</span>
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveCallupModalEvent(event)
                            setRsvpTabFilter('all')
                          }}
                          className="px-3.5 py-1.5 bg-csc-dark hover:bg-csc-dark/85 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
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
      </div>

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
                    <div 
                      onClick={() => setRsvpTabFilter('confirmed')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all ${
                        rsvpTabFilter === 'confirmed' ? 'bg-emerald-100 border-emerald-400 shadow-sm' : 'bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/50'
                      }`}
                    >
                      <p className="text-2xl font-black text-emerald-800">{confirmedList.length}</p>
                      <p className="text-[11px] font-bold text-emerald-900 flex items-center justify-center gap-1 mt-0.5">
                        <CheckCircle2 size={12} /> Confirmados
                      </p>
                    </div>

                    <div 
                      onClick={() => setRsvpTabFilter('called')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all ${
                        rsvpTabFilter === 'called' ? 'bg-amber-100 border-amber-400 shadow-sm' : 'bg-amber-50/70 border-amber-200 hover:bg-amber-100/50'
                      }`}
                    >
                      <p className="text-2xl font-black text-amber-800">{pendingList.length}</p>
                      <p className="text-[11px] font-bold text-amber-900 flex items-center justify-center gap-1 mt-0.5">
                        <HelpCircle size={12} /> Pendentes
                      </p>
                    </div>

                    <div 
                      onClick={() => setRsvpTabFilter('declined')}
                      className={`p-3 rounded-2xl border-2 text-center cursor-pointer transition-all ${
                        rsvpTabFilter === 'declined' ? 'bg-red-100 border-red-400 shadow-sm' : 'bg-red-50/70 border-red-200 hover:bg-red-100/50'
                      }`}
                    >
                      <p className="text-2xl font-black text-red-800">{declinedList.length}</p>
                      <p className="text-[11px] font-bold text-red-900 flex items-center justify-center gap-1 mt-0.5">
                        <XCircle size={12} /> Recusados
                      </p>
                    </div>
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
                                  {c.player?.name || 'Membro'}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setEditingEvent(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 rounded-t-3xl flex justify-between items-center z-10">
              <h3 className="text-lg font-black text-gray-900">✏️ Editar {editType === 'gathering' ? 'Convívio' : editType === 'match' ? 'Jogo' : 'Treino'}</h3>
              <button onClick={() => setEditingEvent(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 cursor-pointer"><X size={20} /></button>
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

              {/* Título */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Título</label>
                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" />
              </div>

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

              {/* Local */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">📍 Local</label>
                <select value={editFieldId} onChange={e => setEditFieldId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-medium bg-white">
                  <option value="">-- Escolher Campo/Instalação --</option>
                  {fields.map(f => (
                    <option key={f.id} value={f.id}>🏟️ {f.name} {f.address ? `(${f.address})` : ''}</option>
                  ))}
                </select>
                {!editFieldId && (
                  <input type="text" value={editLocationText} onChange={e => setEditLocationText(e.target.value)} className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" placeholder="Ou digite o local manualmente..." />
                )}
              </div>

              {/* Campos específicos para Jogos */}
              {editType === 'match' && (
                <div className="space-y-3 border-t border-gray-200 pt-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-gray-700">Amigável?</label>
                    <input type="checkbox" checked={editIsFriendly} onChange={e => setEditIsFriendly(e.target.checked)} className="w-4 h-4 rounded" />
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

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Adversário</label>
                    <select value={editOpponentId} onChange={e => setEditOpponentId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white">
                      <option value="">-- Selecionar --</option>
                      {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Casa/Fora</label>
                    <select value={editHomeAway} onChange={e => setEditHomeAway(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white">
                      <option value="home">Casa</option>
                      <option value="away">Fora</option>
                      <option value="neutral">Neutro</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Limite de Convocados */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Limite de Convocados (opcional)</label>
                <input type="number" min="1" max="50" value={editMaxPlayers} onChange={e => setEditMaxPlayers(e.target.value ? Number(e.target.value) : '')} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white" placeholder="Ex: 18" />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Descrição / Notas</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white resize-none" placeholder="Informações adicionais, ementa do convívio..." />
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingEvent(null)} className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer">
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

    </div>
  )
}

export default EventsPage
