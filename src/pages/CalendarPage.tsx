import React, { useEffect, useRef, useState } from 'react'
import { 
  MapPin, 
  X, 
  Users, 
  CheckCircle2,
  XCircle,
  Trash2,
  ClipboardList,
  Search, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays as CalendarDaysIcon,
  Edit,
  Save,
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
import { VistaDetalhe } from '../components/VistaDetalhe'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { QuickFieldModal } from '../components/QuickFieldModal'
import { QuickOpponentModal } from '../components/QuickOpponentModal'
import { ResendCallupsModal } from '../components/ResendCallupsModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { MatchReportModal, parseMatchReportMetadata } from '../components/MatchReportModal'
import { QuorumFilterCards } from '../components/callups/QuorumFilterCards'
import { CallupRow } from '../components/callups/CallupRow'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { useModalA11y } from '../hooks/useModalA11y'
import { BottomSheet } from '../components/BottomSheet'
import { CabecalhoEcra, Pastilha, CampoEntrada, Botao } from '../components/ui'
import { SlidersHorizontal } from 'lucide-react'

/** Como se lê cada filtro escondido, na linha de resumo do cabeçalho. */
const ROTULOS_ESTADO: Record<string, string> = {
  upcoming: 'Próximos',
  past: 'Realizados',
  my_confirmed: 'Confirmados por mim',
  my_pending: 'Por responder',
  my_declined: 'Recusados por mim',
  my_called: 'Fui convocado',
}

/**
 * Campo branco dos formulários de evento (ecrã 2e) — 46px, como no handoff.
 * É o mesmo desenho dos campos do Perfil, dois pixels mais alto porque aqui
 * há menos campos por ecrã e mais dedo a preencher.
 */
const ETIQUETA_FORM =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/55 mb-1.5'

const CAMPO_FORM =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ROTULOS_TIPO: Record<string, string> = {
  match: 'Jogos',
  practice: 'Treinos',
  gathering: 'Convívios',
}

export const getPlayerDisplayName = (player?: { name?: string; shirt_name?: string | null; nickname?: string | null } | null): string => {
  if (!player) return 'Atleta'
  const shirt = player.shirt_name?.trim()
  if (shirt) return shirt
  const nick = player.nickname?.trim()
  if (nick) return nick
  return player.name || 'Atleta'
}

export const getGoogleMapsUrl = (query: string) => query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '#'

/**
 * Um jogo com ficha de jogo lançada (resultado gravado) fica "fechado": os jogadores já
 * não podem responder à convocatória e o evento deixa de poder ser editado ou apagado
 * — a ficha e as estatísticas associadas já dependem daquele estado do evento.
 */
export const hasMatchReport = (ev?: { type?: string; home_score?: number | null } | null): boolean =>
  !!ev && ev.type === 'match' && ev.home_score !== null && ev.home_score !== undefined

/**
 * Prazo até ao qual o jogador pode responder — ou mudar de ideias sobre uma resposta já
 * dada — à convocatória: a hora de concentração, ou o início do evento quando não há
 * concentração definida. Depois disso a resposta fica fechada (só consulta).
 */
export const getRsvpDeadline = (ev?: { date_time?: string | null; meeting_time?: string | null } | null): number | null => {
  if (!ev?.date_time) return null
  const prazo = new Date(ev.date_time)
  if (ev.meeting_time) {
    const [hh, mm, ss] = ev.meeting_time.split(':').map(Number)
    prazo.setHours(hh || 0, mm || 0, ss || 0, 0)
  }
  return prazo.getTime()
}

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
// treinos). Um único `.select(...).limit(5000)` corta em silêncio a partir desse número de
// linhas — sem ordenação explícita, não há garantia de quais ficam de fora — pelo que
// convocatórias antigas (ou só as de eventos "menos sortudos" na varredura) desapareciam do
// mapa local mesmo continuando a existir na base de dados: "Todos" reportava sucesso porque
// verifica a BD diretamente, mas os checkboxes continuavam por marcar porque liam este cache.
// Percorre a tabela às páginas em vez de confiar num limite fixo.
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
  is_active?: boolean
  tournament_id?: string | null
  tournament?: {
    id: string
    name: string
    season?: string | null
    image_url?: string | null
    organizer_name?: string | null
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
  home_score?: number | null
  away_score?: number | null
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  // Separado de `selectedEvent`: o evento fica retido (para a persiana poder deslizar
  // suavemente para fora ao fechar) mesmo depois de a persiana deixar de estar aberta.
  const [isEventSheetOpen, setIsEventSheetOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Calendar View States
  // A pesquisa e o filtro de estado não estão à vista (ver o cabeçalho): vivem
  // numa persiana, e o cabeçalho diz quando estão a filtrar alguma coisa.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [typeFilter, setTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past' | 'my_confirmed' | 'my_declined' | 'my_pending' | 'my_called'>('all')

  // Callups state
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [modalCallupStatusFilter, setModalCallupStatusFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')
  const [isModalCallupsExpanded, setIsModalCallupsExpanded] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 640 : true)
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
  
  // O arrasto vertical para fechar (e o bloqueio de scroll do fundo) vivem agora
  // no BottomSheet partilhado; aqui só fica o gesto horizontal específico deste
  // modal — deslizar entre convocatórias pendentes no carrossel do topo.
  const modalScrollRef = React.useRef<HTMLDivElement>(null)
  const carouselDragRef = React.useRef<{ startX: number; startY: number; lastDeltaX: number; lastDeltaY: number } | null>(null)

  useEffect(() => {
    if (selectedEvent) {
      setIsModalCallupsExpanded(typeof window !== 'undefined' ? window.innerWidth >= 640 : true)
    }
  }, [selectedEvent])

  // Retroceder no browser (ou qualquer coisa que tire o ?event= do endereço)
  // fecha o detalhe — sem isto o botão de voltar mudava o endereço e deixava a
  // persiana aberta.
  useEffect(() => {
    if (!searchParams.get('event')) {
      setIsEventSheetOpen(false)
    }
  }, [searchParams])

  // Ver um evento é navegar: o endereço passa a ter ?event=<id>, portanto o
  // detalhe tem link próprio e o botão de retroceder do browser fecha-o. No
  // desktop deixa de ser uma persiana e passa a ser a página (ver VistaDetalhe).
  const abrirEvento = (ev: Event) => {
    setSelectedEvent(ev)
    setIsEventSheetOpen(true)
    setSearchParams({ event: ev.id })
  }

  const handleCloseEventModal = () => {
    // Só fecha visualmente — `selectedEvent` fica retido para a persiana poder
    // deslizar para fora antes de o conteúdo desaparecer (ver isEventSheetOpen).
    setIsEventSheetOpen(false)
    setPlayerSearchTerm('')
    setModalCallupStatusFilter('all')
    if (searchParams.get('event')) {
      const restantes = new URLSearchParams(searchParams)
      restantes.delete('event')
      setSearchParams(restantes, { replace: true })
    }
  }

  const handleCarouselTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    carouselDragRef.current = { startX: touch.clientX, startY: touch.clientY, lastDeltaX: 0, lastDeltaY: 0 }
  }

  const handleCarouselTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!carouselDragRef.current) return
    const touch = e.touches[0]
    carouselDragRef.current.lastDeltaX = touch.clientX - carouselDragRef.current.startX
    carouselDragRef.current.lastDeltaY = touch.clientY - carouselDragRef.current.startY
  }

  const handleCarouselTouchEnd = () => {
    const drag = carouselDragRef.current
    carouselDragRef.current = null
    if (!drag || !selectedEvent) return
    const { lastDeltaX, lastDeltaY } = drag

    // Slide / swipe horizontal no carrossel (exclusivo para eventos pendentes no alerta de convocatória)
    if (Math.abs(lastDeltaX) > 40 && Math.abs(lastDeltaX) > Math.abs(lastDeltaY) * 1.1) {
      if (myPendingEvents.length > 1 && myPendingEvents.some(pe => pe.id === selectedEvent.id)) {
        const curIdx = myPendingEvents.findIndex(e => e.id === selectedEvent.id)
        const activeIdx = curIdx >= 0 ? curIdx : 0

        if (lastDeltaX < -40) {
          // Slide para a Esquerda (Avançar para o Próximo Evento Pendente)
          const nextIdx = (activeIdx + 1) % myPendingEvents.length
          setSelectedEvent(myPendingEvents[nextIdx])
          if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
        } else if (lastDeltaX > 40) {
          // Slide para a Direita (Retroceder para o Evento Pendente Anterior)
          const prevIdx = (activeIdx - 1 + myPendingEvents.length) % myPendingEvents.length
          setSelectedEvent(myPendingEvents[prevIdx])
          if (modalScrollRef.current) modalScrollRef.current.scrollTop = 0
        }
      }
    }
  }

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
  // Guarda síncrona (não é estado) contra duplo-clique: entre o clique e o próximo repaint,
  // `isEditBatchCalling` (estado) ainda não travou o botão, o que já causou convocações em
  // duplicado — um segundo clique lia a mesma lista de "por convocar" antes de a primeira
  // chamada terminar, e a segunda tentativa de inserção era ignorada por já existir.
  const isEditBatchCallingRef = useRef(false)

  // Quick Field Modal states (Criação de campo inline a partir da janela de criação/edição)
  const [isQuickFieldModalOpen, setIsQuickFieldModalOpen] = useState(false)
  const [quickFieldName, setQuickFieldName] = useState('')
  const [quickFieldAddress, setQuickFieldAddress] = useState('')
  const [isSavingQuickField, setIsSavingQuickField] = useState(false)

  // Quick Opponent Modal states (Criação de adversário inline a partir da janela de criação/edição)
  const [isQuickOpponentModalOpen, setIsQuickOpponentModalOpen] = useState(false)
  const [quickOppName, setQuickOppName] = useState('')
  const [quickOppInitials, setQuickOppInitials] = useState('')
  const [quickOppHomeFieldId, setQuickOppHomeFieldId] = useState('')
  const [quickOppContactName, setQuickOppContactName] = useState('')
  const [quickOppContactPhone, setQuickOppContactPhone] = useState('')
  const [isSavingQuickOpp, setIsSavingQuickOpp] = useState(false)

  // Unsaved changes prompt state
  const [unsavedModalTarget, setUnsavedModalTarget] = useState<'edit' | 'quickField' | 'quickOpp' | null>(null)


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

      setEditFieldId(resolvedField.id)
      setEditLocation(formattedLoc)

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
      setEditFieldId(fallbackId)
      setEditLocation(formattedLoc)
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

      setEditOpponentId(resolvedOpp.id)
      if (editHomeAway === 'away' && resolvedOpp.home_field_id) {
        setEditFieldId(resolvedOpp.home_field_id)
        const f = fields.find(item => item.id === resolvedOpp.home_field_id)
        if (f) setEditLocation(f.address ? `${f.name} (${f.address})` : f.name)
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
      setEditOpponentId(fallbackId)
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
            .select('id, event_id, player_id, status, player:v_players_public(id, name, photo_url, shirt_name, jersey_number, nickname, role, roles, position, status)')
            .eq('player_id', profile.id)
        : Promise.resolve({ data: [] } as any)

      const [evRes, callupsRes, myCallupsRes, profilesRes, fieldsRes, tourRes, oppsRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season, image_url, organizer_name), field:fields(id, name, address)')
          .order('date_time', { ascending: true }),
        fetchAllCallups('id, event_id, player_id, status, player:v_players_public(id, name, photo_url, shirt_name, jersey_number, nickname, role, roles, position, status)'),
        myCallupsPromise,
        // Plantel: a vista traz só as colunas de equipa (sem IBAN, NIF, morada,
        // contactos ou notas médicas), por isso qualquer membro a pode ler.
        supabase
          .from('v_players_public')
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

      if (evRes.data) {
        setEvents(evRes.data as Event[])
      } else {
        setEvents([])
      }

      let mergedPlayers: Profile[] = []
      if (profilesRes.data) {
        mergedPlayers = ordenarPlantel((profilesRes.data as Profile[]) || [])
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
            player_id: fullP?.id || c.player_id,
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
          .select('*, player:v_players_public(*)')
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
        setIsEventSheetOpen(true)
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
          setIsEventSheetOpen(true)
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
    // Jogos e treinos são só para quem tem o papel de Jogador — membros só
    // Treinador ou só Direção ficam disponíveis apenas nos convívios.
    if (!extractRolesFromProfile(player).includes('player')) return false
    return player.status === 'active'
  }







  // --- EDIT EVENT SPECIFIC HANDLERS ---
  const handleStartEditEvent = (ev: Event) => {
    if (hasMatchReport(ev)) {
      toast.error('Este jogo já tem ficha de jogo lançada — o evento já não pode ser editado.')
      return
    }
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
          setIsEventSheetOpen(false)
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
    const targetEvent = events.find(e => e.id === eventId)
    if (hasMatchReport(targetEvent)) {
      toast.error('Este jogo já tem ficha de jogo lançada — a convocatória está fechada.')
      return
    }
    const deadline = getRsvpDeadline(targetEvent)
    if (deadline !== null && Date.now() >= deadline) {
      toast.error(`Já passou a hora de ${targetEvent?.meeting_time ? 'concentração' : 'início'} — a convocatória está fechada.`)
      return
    }
    try {
      const list = eventCallups[eventId] || []
      const existingCallup = list.find(c => c.player_id === profile.id || c.player?.id === profile.id)
      
      if (existingCallup && existingCallup.id && !existingCallup.id.startsWith('auto-') && !existingCallup.id.startsWith('temp-')) {
        const { error } = await supabase.from('callups').update({ status }).eq('id', existingCallup.id)
        if (error) throw error
      } else {
        // Se ainda não existia linha no Supabase para o atleta ou era id temporário, faz upsert/insert
        const { data: newRow, error } = await supabase.from('callups').upsert([{
          event_id: eventId,
          player_id: profile.id,
          status
        }], { onConflict: 'event_id,player_id' }).select().single()
        if (error) throw error

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

  /** Dois anos para trás e dois para a frente — o clube não agenda mais longe. */
  const anosDisponiveis = Array.from(
    { length: 5 },
    (_, i) => new Date().getFullYear() - 2 + i,
  )

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
            <img src={clubSettings.logo_url} alt={cscSigla} className="w-8 h-8 object-contain shrink-0 bg-white rounded-full p-0.5 shadow-xs" />
          ) : (
            <div className="w-8 h-8 bg-white text-csc-dark rounded-full flex items-center justify-center text-xs font-black shrink-0">
              {cscSigla}
            </div>
          )}
          <span className="font-black text-sm text-white uppercase tracking-tight whitespace-nowrap">
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
            <img src={event.opponent.logo_url} alt={oppSigla} className="w-8 h-8 object-contain shrink-0 bg-white rounded-full p-0.5 shadow-xs" />
          ) : (
            <div className="w-8 h-8 bg-white/15 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {oppSigla}
            </div>
          )}
          <span className="font-black text-sm text-white uppercase tracking-tight whitespace-nowrap">
            {oppSigla}
          </span>
        </div>
      </div>
    )

    const tipoIcon = isMatch ? Trophy : isPractice ? TrainingIcon : PartyPopper
    const tipoCor = isMatch ? 'text-csc-gold' : isPractice ? 'text-emerald-300' : 'text-blue-300'
    const TipoIcon = tipoIcon

    return (
      <div
        key={event.id}
        onClick={() => abrirEvento(event)}
        className="cartao-vidro text-white overflow-hidden cursor-pointer flex flex-col justify-between transition-transform duration-150 active:scale-[0.99]"
      >
        {/* Cabeçalho: tipo de evento por ícone + rótulo, não por cor de fundo */}
        <div className="px-5 pt-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${tipoCor}`}>
              <TipoIcon size={14} />
              <span>{isMatch ? 'Jogo' : isPractice ? 'Treino' : 'Convívio'}</span>
            </span>

            {isMatch && event.is_friendly && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/10 text-white">
                Amigável
              </span>
            )}

            {isMatch && event.tournament?.name && !event.is_friendly && (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-white/10 text-white truncate max-w-[150px] flex items-center gap-1">
                {event.tournament.image_url && (
                  <img src={event.tournament.image_url} alt="" className="w-3.5 h-3.5 object-contain rounded-full shrink-0" />
                )}
                {event.tournament.name}
              </span>
            )}
          </div>

          {callups.length > 0 && (
            <span className="text-xs font-bold flex items-center gap-1 bg-white/10 text-white px-2.5 py-1 rounded-full shrink-0">
              <Users size={13} />
              <span><strong>{confirmedCount}</strong>/{callups.length}</span>
            </span>
          )}
        </div>

        <div className="p-5 space-y-3.5 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            {/* Duelo de equipas (quando é jogo com adversário definido) */}
            {isMatch && event.opponent && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  {isAway ? opponentBlock(false) : cscBlock(false)}
                  <div className="shrink-0 px-1 flex items-center justify-center">
                    <span className="px-2.5 py-1 rounded-[9px] bg-white/10 font-display font-bold text-[11px] text-white/50">
                      VS
                    </span>
                  </div>
                  {isAway ? cscBlock(true) : opponentBlock(true)}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                  <span className="font-bold">
                    Condição: <strong className="text-white">{event.home_away === 'neutral' ? 'Neutro' : isAway ? 'Visitante' : 'Visitado'}</strong>
                  </span>
                </div>
              </div>
            )}

            {/* Title (apenas exibido para convívios) */}
            {event.type === 'gathering' && (
              <div>
                <h4 className="text-base font-black text-white leading-snug">
                  {event.title}
                </h4>
              </div>
            )}

            {/* As duas horas lado a lado, divididas por uma linha: a de
                concentração à esquerda (quando existe) e a de início à
                direita, esta em dourado, porque é a que não se pode falhar. */}
            <div className="flex items-stretch -mx-5 border-y border-white/13">
              {event.meeting_time && (
                <>
                  <div className="flex-none px-5 py-2.5">
                    <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-white/55">
                      Concentração
                    </p>
                    <p className="font-display font-extrabold text-[17px] text-white mt-0.5">
                      {event.meeting_time.substring(0, 5)}
                    </p>
                  </div>
                  <div className="w-px bg-white/13" />
                </>
              )}
              <div className="flex-1 px-5 py-2.5">
                <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-csc-gold">
                  Início
                </p>
                <p className="font-display font-extrabold text-[17px] text-white mt-0.5">
                  {new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

            {/* Horas e Localização / Endereço à frente */}
            {(() => {
              const locStr = getEventLocation(event)
              return (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {/* Localização & Maps */}
                  {locStr && (
                    <div className="inline-flex items-center gap-1 text-xs text-white/80 bg-white/10 px-2.5 py-1 rounded-full max-w-full truncate min-w-0">
                      <MapPin size={13} className="text-csc-gold shrink-0" />
                      <span className="truncate">{locStr}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locStr)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 p-0.5 text-white/60 hover:text-white shrink-0"
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
            {(() => {
              const clean = parseMatchReportMetadata(event.description).cleanDescription
              if (!clean) return null
              return (
                <div className="text-xs text-white/70 bg-white/5 p-2.5 rounded-xl">
                  <p className="whitespace-pre-line leading-relaxed">{clean}</p>
                </div>
              )
            })()}

            {/* Ação rápida de Presença (RSVP) */}
            {myCallup && (() => {
              const eventTime = new Date(event.date_time).getTime()
              const now = new Date().getTime()
              const diffDays = Math.ceil((eventTime - now) / (1000 * 60 * 60 * 24))
              const isPractice = event.type === 'practice'
              const closedByReport = hasMatchReport(event)
              const deadline = getRsvpDeadline(event)
              const pastDeadline = deadline !== null && now >= deadline
              const isRsvpOpen = !closedByReport && !pastDeadline && (!isPractice || diffDays <= 6)

              return (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 flex-wrap"
                >
                  <span className="text-xs font-bold text-white/70">Presença:</span>
                  {closedByReport ? (
                    <span className="text-[11px] font-bold text-white/60 bg-white/10 px-2.5 py-1 rounded-full">
                      Jogo com ficha lançada — convocatória fechada
                    </span>
                  ) : pastDeadline ? (
                    <span className="text-[11px] font-bold text-white/60 bg-white/10 px-2.5 py-1 rounded-full">
                      Convocatória fechada — já passou a hora de {event.meeting_time ? 'concentração' : 'início'}
                    </span>
                  ) : !isRsvpOpen ? (
                    <span className="text-[11px] font-bold text-white/60 bg-white/10 px-2.5 py-1 rounded-full">
                      Confirmações abrem 6 dias antes ({new Date(eventTime - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })})
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'confirmed')}
                        className={`text-xs font-black px-3 py-1.5 rounded-full transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                          myCallup.status === 'confirmed'
                            ? 'bg-csc-gold text-csc-dark ring-2 ring-csc-gold/40'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        <CheckCircle2 size={13} />
                        <span>Confirmar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'declined')}
                        className={`text-xs font-black px-3 py-1.5 rounded-full transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                          myCallup.status === 'declined'
                            ? 'bg-white text-csc-dark ring-2 ring-white/40'
                            : 'border border-white/30 text-white/60 hover:bg-white/10'
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

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.
  const painelEditarEventoRef = useModalA11y({ isOpen: isEditModalOpen, onClose: handleAttemptCloseEditModal })

  /**
   * O que está escondido na persiana de filtros. Um filtro que não se vê é um
   * filtro que se esquece — e depois a agenda parece vazia sem razão —, por
   * isso o cabeçalho acende e uma linha por baixo diz o que está a filtrar.
   * As pastilhas de tipo não entram: essas estão à vista.
   */
  const temFiltros = searchQuery.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all'
  const resumoFiltros = [
    searchQuery.trim() ? `"${searchQuery.trim()}"` : null,
    statusFilter !== 'all' ? ROTULOS_ESTADO[statusFilter] : null,
    typeFilter !== 'all' ? ROTULOS_TIPO[typeFilter] : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-6">
      <div className="space-y-6">

      {/*
        Cabeçalho da Agenda (ecrã 1a): o mês em sobrancelha dourada, o título,
        e os dois botões de mês.

        A pesquisa e o filtro de estado não existem no handoff, e o ecrã fica
        melhor sem eles à vista — mas a app tem 52 eventos na base e alguém
        vai querer procurar um jogo de há dois meses, ou ver só o que
        confirmou. Passam para uma persiana atrás do funil.
      */}
      <CabecalhoEcra
        titulo="Agenda"
        sobrancelha={`${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
        className="mb-3"
        acoes={
          <div className="flex items-center gap-2 flex-none">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/75 cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Mês seguinte"
              className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/75 cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => { triggerHaptic('light'); setFiltrosAbertos(true) }}
              aria-label={temFiltros ? 'Pesquisa e filtros (ativos)' : 'Pesquisa e filtros'}
              className={`relative w-9 h-9 rounded-full border flex items-center justify-center cursor-pointer
                transition-transform duration-150 active:scale-97
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                  temFiltros
                    ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                    : 'bg-white/10 border-white/15 text-white/75'
                }`}
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        }
      />

      {/* Pastilhas de tipo — as do handoff, sem emoji. */}
      <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
        {([
          ['all', 'Todos'],
          ['match', 'Jogos'],
          ['practice', 'Treinos'],
          ['gathering', 'Convívios'],
        ] as const).map(([valor, etiqueta]) => (
          <Pastilha
            key={valor}
            ativa={typeFilter === valor}
            onClick={() => { triggerHaptic('selection'); setTypeFilter(valor) }}
            className="flex-none"
          >
            {etiqueta}
          </Pastilha>
        ))}
      </div>

      {/* O que a persiana esconde tem de continuar visível como estado. */}
      {temFiltros && (
        <button
          type="button"
          onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all') }}
          className="cartao-simples w-full min-h-11 flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer
            bg-csc-gold/10 border-csc-gold/30 transition-transform duration-150 active:scale-97"
        >
          <SlidersHorizontal size={14} className="text-csc-gold shrink-0" />
          <span className="flex-1 font-display font-bold text-[11px] text-white/80">
            {resumoFiltros} · {filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventos'}
          </span>
          <span className="font-display font-bold text-[11px] text-csc-gold">Limpar</span>
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-9 w-9 border-2 border-csc-gold border-t-transparent" />
          <span className="sr-only">A carregar…</span>
        </div>
      ) : (
        <>
        <div className="space-y-4">
          {/*
            O calendário do mês (ecrã 1a): células de 34px, um ponto por baixo
            do número quando há eventos, e o dia escolhido numa pastilha
            dourada. O ponto é da cor do tipo de evento — verde treino, azul
            convívio, dourado jogo — e quando há mais do que um mostram-se até
            três, que é o que cabe.
          */}
          <div className="cartao-vidro px-3 pt-3.5 pb-3">
            {/* Saltos longos: mês, ano, ou voltar a hoje. As setas de mês
                estão no cabeçalho do ecrã. */}
            <div className="flex items-center gap-2 px-1 pb-3">
              <select
                value={currentDate.getMonth()}
                onChange={e => handleMonthChange(Number(e.target.value))}
                aria-label="Mês"
                className="h-11 px-3 rounded-[18px] bg-white/8 border border-white/15 text-white font-display font-bold text-xs
                  outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-csc-gold"
              >
                {monthNames.map((nome, idx) => (
                  <option key={nome} value={idx} className="bg-csc-fundo text-white">{nome}</option>
                ))}
              </select>

              <select
                value={currentDate.getFullYear()}
                onChange={e => handleYearChange(Number(e.target.value))}
                aria-label="Ano"
                className="h-11 px-3 rounded-[18px] bg-white/8 border border-white/15 text-white font-display font-bold text-xs
                  outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-csc-gold"
              >
                {anosDisponiveis.map(ano => (
                  <option key={ano} value={ano} className="bg-csc-fundo text-white">{ano}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleToday}
                className="ml-auto min-h-11 px-4 rounded-[18px] bg-csc-gold text-csc-tinta font-display font-bold text-xs cursor-pointer
                  transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                Hoje
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1.5">
              {weekDayNames.map(w => (
                <span key={w} className="font-display font-bold text-[9px] text-white/40 text-center">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((cell, idx) => {
                const dayEvents = getEventsForDate(cell.date)

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { triggerHaptic('selection'); setSelectedDate(cell.date) }}
                    aria-label={`${cell.date.getDate()} — ${dayEvents.length} ${dayEvents.length === 1 ? 'evento' : 'eventos'}`}
                    aria-pressed={cell.isSelected}
                    className={`h-11 rounded-[11px] flex flex-col items-center justify-center gap-0.5 cursor-pointer
                      transition-colors duration-200
                      focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-csc-gold ${
                        cell.isSelected
                          ? 'bg-csc-gold'
                          : cell.isToday
                            ? 'bg-white/12'
                            : ''
                      }`}
                  >
                    <span
                      className={`font-display text-xs leading-none ${
                        cell.isSelected
                          ? 'font-extrabold text-csc-tinta'
                          : !cell.isCurrentMonth
                            ? 'font-semibold text-white/20'
                            : cell.isToday
                              ? 'font-extrabold text-csc-gold'
                              : 'font-semibold text-white/75'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>

                    {dayEvents.length > 0 && (
                      <span className="flex items-center gap-0.5 h-1">
                        {dayEvents.slice(0, 3).map(ev => (
                          <span
                            key={ev.id}
                            className={`w-1 h-1 rounded-full ${
                              cell.isSelected
                                ? 'bg-csc-tinta'
                                : ev.type === 'match'
                                  ? 'bg-csc-gold'
                                  : ev.type === 'practice'
                                    ? 'bg-csc-verde-texto'
                                    : 'bg-csc-azul-texto'
                            }`}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Coluna Direita: Eventos do Dia Selecionado Diretamente */}
          <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-6">
            {selectedDate && (
              selectedDayEvents.length === 0 ? (
                <div className="cartao-simples border-dashed text-center px-5 py-8">
                  <CalendarDaysIcon size={26} className="mx-auto text-white/25 mb-2.5" />
                  <p className="font-display font-extrabold text-sm text-white">Sem eventos neste dia.</p>
                  <p className="text-[11px] text-white/50 mt-1.5">
                    Escolhe outro dia no calendário, ou vê tudo o que vem a seguir mais abaixo.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map(event => renderEventCard(event))}
                </div>
              )
            )}
          </div>
        </div>

        {/* A lista deixou de ser uma vista alternativa: no handoff vem sempre
            por baixo do calendário, com os eventos do filtro em curso. */}
        <div className="grid grid-cols-1 gap-3">
          {filteredEvents.length === 0 ? (
            <div className="cartao-simples border-dashed text-center px-5 py-10">
              <CalendarRange size={32} className="mx-auto text-white/25 mb-2.5" />
              <p className="font-display font-extrabold text-sm text-white">Nenhum evento encontrado.</p>
              <p className="text-[11px] text-white/50 mt-1.5">Limpa os filtros, ou marca alguma coisa no [+].</p>
            </div>
          ) : (
            filteredEvents.map((event) => renderEventCard(event))
          )}
        </div>
        </>
      )}
      </div>

      {/*
        Pesquisa e filtro de estado. Fora do ecrã porque o handoff quer a
        Agenda limpa, mas a um toque porque a app tem eventos que chegam para
        os tornar necessários.
      */}
      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Procurar na agenda"
        description="Sobre os eventos do tipo escolhido em cima"
        tone="dark"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <SlidersHorizontal size={17} />
          </div>
        }
        footer={
          <>
            <Botao
              aparencia="vidro"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setTypeFilter('all') }}
              disabled={!temFiltros}
            >
              Limpar
            </Botao>
            <Botao onClick={() => setFiltrosAbertos(false)}>
              Ver {filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventos'}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <CampoEntrada
            etiqueta="Procurar"
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Título, adversário ou local"
          />

          <div>
            <p className="font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-2">
              Estado
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                ['all', 'Todos'],
                ['upcoming', 'Próximos'],
                ['past', 'Realizados'],
                ['my_confirmed', 'Confirmados por mim'],
                ['my_pending', 'Por responder'],
                ['my_declined', 'Recusados por mim'],
                ['my_called', 'Fui convocado'],
              ] as const).map(([valor, etiqueta]) => (
                <Pastilha
                  key={valor}
                  ativa={statusFilter === valor}
                  onClick={() => { triggerHaptic('selection'); setStatusFilter(valor) }}
                >
                  {etiqueta}
                </Pastilha>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Modal Detalhes Evento & Convocatória (persiana partilhada).
          A condição usa só `selectedEvent` (nunca voltar a null ao fechar) — a persiana
          controla a própria visibilidade por `isEventSheetOpen`, para poder deslizar
          para fora suavemente em vez de desaparecer no instante em que se fecha. */}
      {/* A ficha de jogo abre a partir do detalhe do evento — uma persiana
          por cima da outra, um nível abaixo na navegação. */}
      <div>
      {selectedEvent && (
        <VistaDetalhe
          isOpen={isEventSheetOpen}
          onClose={handleCloseEventModal}
          ref={modalScrollRef}
          tone="dark"
          size="7xl"
          showCloseButton={false}
          ariaLabel="Detalhe do evento"
          voltarTexto="Voltar à agenda"
          onContentTouchStart={handleCarouselTouchStart}
          onContentTouchMove={handleCarouselTouchMove}
          onContentTouchEnd={handleCarouselTouchEnd}
        >
          <div className="space-y-4 select-none">
            {/* Fechar a persiana. */}
            <button
              type="button"
              onClick={handleCloseEventModal}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center transition-transform duration-150 z-30 cursor-pointer active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              title="Fechar"
            >
              <X size={18} />
            </button>

            {/* Topo Premium Unificado da Persiana (Layout Verde Oficial CSC com Carrossel Integrado) */}
            <div className="cartao-vidro text-white p-4 relative overflow-hidden space-y-2.5">
              
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
                      <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                        <span>🔔 Convocatória Pendente</span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-white/20 text-white tracking-wider">
                          {activeIndex + 1}/{myPendingEvents.length}
                        </span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={nextEvent}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-90 shrink-0 bg-white/10 hover:bg-white/20 text-white"
                      title="Próxima Convocatória"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )
              })()}

              {/*
                O ecrã 2c abre com o que o evento é, não com uma barra de
                ferramentas: as etiquetas, o confronto em grande e a data. As
                ações de quem gere descem para o bloco de gestão, no fim — são
                o que menos vezes se faz aqui.
              */}
              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center h-[22px] px-2.5 rounded-[11px] border font-display font-bold text-[9.5px] ${
                  selectedEvent.type === 'match'
                    ? 'bg-csc-gold/16 border-csc-gold/35 text-csc-gold'
                    : selectedEvent.type === 'practice'
                      ? 'bg-csc-light/18 border-csc-light/35 text-csc-verde-texto'
                      : 'bg-csc-blue/20 border-csc-blue/40 text-csc-azul-texto'
                }`}>
                  {selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio'}
                </span>

                {selectedEvent.type === 'match' && selectedEvent.is_friendly && (
                  <span className="inline-flex items-center h-[22px] px-2.5 rounded-[11px] bg-white/10 border border-white/16 font-display font-bold text-[9.5px] text-white">
                    Amigável
                  </span>
                )}

                {selectedEvent.tournament?.name && !selectedEvent.is_friendly && (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-[11px] bg-white/10 border border-white/16 font-display font-bold text-[9.5px] text-white max-w-[170px]">
                    {selectedEvent.tournament.image_url && (
                      <img src={selectedEvent.tournament.image_url} alt="" className="w-3.5 h-3.5 object-contain rounded-full shrink-0" />
                    )}
                    <span className="truncate">{selectedEvent.tournament.name}</span>
                  </span>
                )}

                {selectedEvent.type === 'match' && (
                  <span className="inline-flex items-center h-[22px] px-2.5 rounded-[11px] bg-white/10 border border-white/16 font-display font-bold text-[9.5px] text-white">
                    {selectedEvent.home_away === 'away' ? 'Fora' : selectedEvent.home_away === 'neutral' ? 'Campo neutro' : 'Em casa'}
                  </span>
                )}
              </div>

              <div>
                <h2 className="font-display font-black text-[30px] leading-[1.05] text-white tracking-[-0.03em]">
                  {selectedEvent.type === 'match' && selectedEvent.opponent ? (
                    selectedEvent.home_away === 'away' ? (
                      <>{formatOpponentSigla(selectedEvent.opponent)} <span className="text-white/40 text-xl">vs</span> {formatClubSigla(clubSettings?.initials)}</>
                    ) : (
                      <>{formatClubSigla(clubSettings?.initials)} <span className="text-white/40 text-xl">vs</span> {formatOpponentSigla(selectedEvent.opponent)}</>
                    )
                  ) : (
                    selectedEvent.title
                  )}
                </h2>
                <p className="text-[11.5px] text-white/60 mt-1.5">
                  {new Date(selectedEvent.date_time).toLocaleDateString('pt-PT', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Grelha Responsiva Versão Web (2 Colunas Amplas no Desktop) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              
              {/* COLUNA ESQUERDA (5 Colunas): Detalhes do Evento, Matchup VS e Presença Pessoal */}
              <div className="lg:col-span-5 space-y-5">

                {/* O confronto era aqui um cartão com os dois emblemas e a
                    linha "Condição: Visitado". Passou a ser o título do ecrã
                    (ver acima) e uma etiqueta — dizia-se três vezes a mesma
                    coisa, e uma delas com outras palavras. */}

                {/* Title (apenas exibido para convívios) */}
                {selectedEvent.type === 'gathering' && (
                  <h2 className="text-2xl font-black text-white leading-tight">{selectedEvent.title}</h2>
                )}

                {/*
                  As horas e o local num só cartão, como no 2c: a concentração
                  e o início lado a lado divididos por uma linha, e o campo por
                  baixo com o nome em cima da morada. Eram três blocos soltos —
                  uma pastilha de concentração, uma caixa de data e uma linha de
                  local — a dizer coisas da mesma natureza.
                */}
                <div className="cartao-vidro overflow-hidden">
                  <div className="flex items-stretch">
                    {selectedEvent.meeting_time && (
                      <>
                        <div className="flex-none px-4 py-3">
                          <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-white/55">
                            Concentração
                          </p>
                          <p className="font-display font-extrabold text-[18px] text-white mt-0.5">
                            {selectedEvent.meeting_time.substring(0, 5)}
                          </p>
                        </div>
                        <div className="w-px bg-white/13" />
                      </>
                    )}
                    <div className="flex-1 px-4 py-3">
                      <p className="font-display font-bold text-[8.5px] tracking-[0.14em] uppercase text-csc-gold">
                        Início
                      </p>
                      <p className="font-display font-extrabold text-[18px] text-white mt-0.5">
                        {new Date(selectedEvent.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {(() => {
                    const campo = selectedEvent.field
                      ?? fields.find(f => f.id === selectedEvent.field_id)
                      ?? null
                    const nome = campo?.name || selectedEvent.location?.trim() || ''
                    const morada = campo?.address || ''
                    const paraMaps = getEventLocation(selectedEvent)

                    if (!nome && !paraMaps) return null

                    return (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(paraMaps || nome)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-4 py-3 border-t border-white/13 min-h-14
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                      >
                        <MapPin size={15} className="text-csc-red shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-bold text-xs text-white truncate">
                            {nome || 'Sem local definido'}
                          </span>
                          {morada && (
                            <span className="block text-[11px] leading-snug text-white/60 truncate">{morada}</span>
                          )}
                        </span>
                        <ExternalLink size={14} className="text-white/40 shrink-0" />
                      </a>
                    )
                  })()}
                </div>

                {/* Observações / Descrição (diretamente acima da confirmação) */}
                {(() => {
                  const clean = parseMatchReportMetadata(selectedEvent.description).cleanDescription
                  if (!clean) return null
                  return (
                    <div className="p-3.5 bg-white/[0.07] rounded-2xl text-xs text-white/70 space-y-1 border border-white/10 border-t-white/20 shadow-md shadow-black/20">
                      <p className="font-black text-white">Observações & Informações:</p>
                      <p className="leading-relaxed">{clean}</p>
                    </div>
                  )
                })()}

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
                  const closedByReport = hasMatchReport(selectedEvent)
                  const deadline = getRsvpDeadline(selectedEvent)
                  const pastDeadline = deadline !== null && now >= deadline
                  const isRsvpOpen = !closedByReport && !pastDeadline && (!isPractice || ((eventTime - now) <= 6 * 24 * 60 * 60 * 1000))

                  return (
                    <div className={isRsvpOpen ? 'rounded-2xl overflow-hidden shadow-lg shadow-black/20' : 'p-4 bg-white/[0.07] rounded-2xl space-y-3 border border-white/10 border-t-white/20 shadow-md shadow-black/20'}>
                      {isRsvpOpen ? (
                        // Barra de ação dourada, de bordo a bordo — a mesma linguagem do cartão da Home.
                        // Mostra-se sempre que ainda dá para responder, mesmo que já tenha respondido antes —
                        // até à hora de concentração o jogador pode sempre mudar de ideias.
                        <div className="bg-[rgba(11,45,11,.55)] border-t border-csc-light/35 px-4 py-3.5 flex flex-col items-center justify-center gap-2.5">
                          <span className="font-display font-extrabold text-[13px] text-white">
                            {myCallup.status === 'called' ? 'Vais estar presente?' :
                              myCallup.status === 'confirmed' ? '✓ Confirmaste presença' : '✕ Recusaste presença'}
                          </span>
                          <div className="flex items-center gap-2.5 w-full">
                            <button
                              type="button"
                              onClick={() => handleCallupResponse(selectedEvent.id, 'confirmed')}
                              className={`flex-1 min-h-11 px-5 rounded-[22px] border font-display font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer
                                transition-transform duration-150 active:scale-97
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                myCallup.status === 'confirmed'
                                  ? 'bg-csc-light border-csc-light text-white'
                                  : 'bg-white/9 border-white/20 text-white'
                              }`}
                            >
                              {myCallup.status === 'confirmed' && <CheckCircle2 size={15} />}
                              Sim
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCallupResponse(selectedEvent.id, 'declined')}
                              className={`flex-1 min-h-11 px-5 rounded-[22px] border font-display font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer
                                transition-transform duration-150 active:scale-97
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                myCallup.status === 'declined'
                                  ? 'bg-white/90 border-white/90 text-csc-tinta'
                                  : 'bg-white/9 border-white/20 text-white'
                              }`}
                            >
                              {myCallup.status === 'declined' && <XCircle size={15} />}
                              Não
                            </button>
                          </div>
                          {myCallup.status !== 'called' && (
                            <span className="text-[10.5px] text-white/55">Toca no outro botão para mudar de resposta.</span>
                          )}
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">A tua convocatória para este evento</p>
                            <p className="text-sm font-black text-white mt-0.5">
                              Estado: <span className={
                                myCallup.status === 'confirmed' ? 'text-emerald-300' :
                                myCallup.status === 'declined' ? 'text-red-300' : 'text-csc-gold'
                              }>
                                {myCallup.status === 'confirmed' ? 'Confirmaste presença' :
                                 myCallup.status === 'declined' ? 'Recusaste presença' : 'Aguarda a tua resposta'}
                              </span>
                            </p>
                          </div>
                          {closedByReport ? (
                            <div className="p-3 bg-white/10 rounded-xl text-xs text-white/70 font-medium">
                              Este jogo já tem <strong className="text-white">ficha de jogo lançada</strong> — a convocatória está fechada e já não pode ser alterada.
                            </div>
                          ) : pastDeadline ? (
                            <div className="p-3 bg-white/10 rounded-xl text-xs text-white/70 font-medium">
                              Já passou a hora de <strong className="text-white">{selectedEvent.meeting_time ? 'concentração' : 'início'}</strong> — a convocatória está fechada e já não pode ser alterada.
                            </div>
                          ) : !isRsvpOpen && (
                            <div className="p-3 bg-white/10 rounded-xl text-xs text-white/70 font-medium">
                              O pedido de confirmação de presença abre <strong className="text-white">6 dias antes do treino</strong> (a {new Date(eventTime - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}).
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* COLUNA DIREITA (7 Colunas): Convocatória Completa, Filtros Interativos e Gestão */}
              {(() => {
                const rawCallups = eventCallups[selectedEvent.id] || []
                const callups = rawCallups.filter(c => {
                  const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                  return p ? isPlayerEligible(p, selectedEvent.type) : true
                })
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
                  <div className="lg:col-span-7 bg-white/[0.07] p-4 sm:p-5 rounded-3xl space-y-3.5 transition-all border border-white/10 border-t-white/20 shadow-lg shadow-black/20">
                    {/* Topo da Convocatória com Botão de Colapsar / Expandir */}
                    <div
                      onClick={() => setIsModalCallupsExpanded(prev => !prev)}
                      className="flex items-center justify-between cursor-pointer select-none group"
                    >
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-white flex items-center gap-2 group-hover:text-csc-gold transition-colors">
                            <Users size={18} className="text-csc-gold" />
                            <span>Convocatória ({callups.length}{selectedEvent.max_players ? ` / ${selectedEvent.max_players} máx` : ''})</span>
                          </h3>
                        </div>

                        {/* Resumo quando colapsado ou expandido — as cores de estado mantêm-se
                            (verde/âmbar/vermelho): é informação, não decoração. */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10.5px] font-bold text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md">
                            {confirmedList.length} {confirmedList.length === 1 ? 'confirmado' : 'confirmados'}
                          </span>
                          <span className="text-[10.5px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-md">
                            {pendingList.length} {pendingList.length === 1 ? 'pendente' : 'pendentes'}
                          </span>
                          {declinedList.length > 0 && (
                            <span className="text-[10.5px] font-bold text-red-300 bg-red-500/15 px-2 py-0.5 rounded-md">
                              {declinedList.length} {declinedList.length === 1 ? 'recusado' : 'recusados'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-white/70 group-hover:text-white hidden sm:inline">
                          {isModalCallupsExpanded ? 'Recolher' : 'Expandir'}
                        </span>
                        <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 text-white transition-all">
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
                      <div className="space-y-4 pt-3 border-t border-white/10 animate-fade-in">
                        {/* Resumo de Quórum como Botões de Filtro Acionáveis */}
                        <div className="space-y-2">
                          <QuorumFilterCards
                            totalCount={callups.length}
                            confirmedCount={confirmedList.length}
                            pendingCount={pendingList.length}
                            declinedCount={declinedList.length}
                            activeFilter={modalCallupStatusFilter}
                            onSelect={setModalCallupStatusFilter}
                          />

                          {/* Campo de Pesquisa e Limpeza de Filtros */}
                          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                            <div className="relative flex-1 w-full">
                              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/65" />
                              <input
                                type="text"
                                value={playerSearchTerm}
                                onChange={(e) => setPlayerSearchTerm(e.target.value)}
                                placeholder="Pesquisar convocado por nome..."
                                className="w-full pl-8 pr-3 py-1.5 bg-white/10 text-white placeholder:text-white/65 rounded-xl text-xs outline-none focus:ring-2 focus:ring-csc-gold"
                              />
                            </div>

                            {modalCallupStatusFilter !== 'all' && (
                              <button
                                type="button"
                                onClick={() => setModalCallupStatusFilter('all')}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                              >
                                <X size={12} /> Limpar Filtro
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Lista de Convocados Filtrada */}
                        {callups.length === 0 ? (
                          <div className="text-center py-8 bg-white/5 rounded-2xl border border-dashed border-white/15">
                            <Users size={32} className="mx-auto text-white/65 mb-1" />
                            <p className="text-xs font-bold text-white/60">Nenhum jogador convocado ainda.</p>
                          </div>
                        ) : filteredCallups.length === 0 ? (
                          <div className="text-center py-8 bg-white/5 rounded-2xl text-white/60 space-y-2">
                            <p className="text-xs font-bold">Nenhum atleta encontrado para os critérios selecionados.</p>
                            <button
                              onClick={() => {
                                setModalCallupStatusFilter('all')
                                setPlayerSearchTerm('')
                              }}
                              className="text-xs font-black text-csc-gold underline cursor-pointer"
                            >
                              Ver todos os {callups.length} convocados
                            </button>
                          </div>
                        ) : (
                          <div className="max-h-[480px] overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {filteredCallups.map(c => (
                                <CallupRow
                                  key={c.id}
                                  status={c.status}
                                  player={c.player}
                                  displayName={getPlayerDisplayName(c.player)}
                                  isCoachOrAdmin={isCoachOrAdmin}
                                  onConfirm={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'confirmed')}
                                  onDecline={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'declined')}
                                  onSetPending={() => handleUpdateCallupStatus(c.id, selectedEvent.id, 'called')}
                                  onRemove={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

            </div>

            {/*
              Gestão do evento (ecrã 2c). Estava no topo, em botões de ícone
              apertados ao lado da data; é o que menos vezes se faz nesta
              persiana e passa para o fim, com os nomes por extenso.
            */}
            {isCoachOrAdmin && (
              <div className="rounded-[20px] bg-csc-gold/10 border border-csc-gold/26 p-3.5">
                <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold">
                  Gestão do evento
                </p>

                <div className="flex flex-col gap-2.5 mt-3">
                  {!hasMatchReport(selectedEvent) && (
                    <button
                      type="button"
                      onClick={() => handleStartEditEvent(selectedEvent)}
                      className="min-h-11 rounded-[22px] bg-csc-gold text-csc-tinta font-display font-extrabold text-[12.5px]
                        flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                    >
                      <Edit size={15} />
                      <span>Editar evento</span>
                    </button>
                  )}

                  {selectedEvent.type === 'match' &&
                    (new Date(selectedEvent.date_time).getTime() <= Date.now() ||
                      selectedEvent.home_score !== null) && (
                      <button
                        type="button"
                        onClick={() => setIsMatchReportOpen(true)}
                        className="min-h-11 rounded-[22px] bg-white/8 border border-white/18 text-white font-display font-bold text-[11.5px]
                          flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                      >
                        <ClipboardList size={15} />
                        <span>{hasMatchReport(selectedEvent) ? 'Ver ficha de jogo' : 'Lançar ficha de jogo'}</span>
                      </button>
                    )}

                  <button
                    type="button"
                    onClick={() => handleDeleteSpecificEvent(selectedEvent.id)}
                    className="min-h-11 rounded-[22px] bg-csc-red/10 border border-csc-red/35 text-csc-vermelho-texto
                      font-display font-bold text-xs flex items-center justify-center gap-2 cursor-pointer
                      transition-transform duration-150 active:scale-97
                      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <Trash2 size={15} />
                    <span>Eliminar evento</span>
                  </button>
                </div>

                <p className="text-[10px] leading-snug text-white/45 mt-2.5">
                  Com ficha de jogo lançada, o evento fecha: deixa de ser editável e a convocatória
                  não aceita respostas.
                </p>
              </div>
            )}
          </div>
        </VistaDetalhe>
      )}
      </div>

      {/* MODAL 3: EDITAR EVENTO ESPECÍFICO (Versão Larga 2 Colunas) */}
      {isEditModalOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto animate-fade-in"
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
            className="bg-csc-dark text-white rounded-3xl max-w-5xl xl:max-w-6xl w-full p-6 sm:p-8 relative max-h-[92vh] overflow-y-auto shadow-2xl border border-white/10 outline-none"
          >
            <button
              type="button"
              onClick={handleAttemptCloseEditModal}
              aria-label="Fechar"
              className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center transition-transform duration-150 z-20 cursor-pointer active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              title="Fechar"
            >
              <X size={20} className="stroke-[2.5]" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Edit size={22} className="text-csc-gold" />
              <h2 id="editar-evento-titulo" className="text-2xl font-black text-white">Editar Dados do Evento</h2>
            </div>
            <p className="text-xs text-white/60 mb-6">
              Altera a data, horário, localização, notas ou gere a convocatória deste evento na agenda.
            </p>

            <form onSubmit={handleSaveEditedEvent} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* COLUNA ESQUERDA: Dados do Evento (6 Colunas) */}
              <div className="lg:col-span-6 space-y-4">
                {editType === 'gathering' && (
                  <div>
                    <label className={ETIQUETA_FORM}>Título do Convívio *</label>
                    <input
                      type="text"
                      required={editType === 'gathering'}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={CAMPO_FORM}
                      placeholder="Ex: Jantar de Natal / Reentré"
                    />
                  </div>
                )}

                <div>
                  <label className={ETIQUETA_FORM}>Tipo de Evento</label>
                  <div className="w-full px-3 py-2.5 border border-white/10 bg-white/5 text-white rounded-xl text-xs font-black flex items-center justify-between shadow-2xs">
                    <span className="flex items-center gap-1.5">
                      <span>{editType === 'match' ? '⚽ Jogo' : editType === 'practice' ? '🏃 Treino' : '🍻 Convívio'}</span>
                    </span>
                    <span className="text-[10px] font-bold text-white/70 bg-white/10 px-2 py-0.5 rounded-md">
                      🔒 Tipo Bloqueado
                    </span>
                  </div>
                </div>

                {editType === 'match' && (
                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="editIsFriendly"
                        checked={editIsFriendly}
                        onChange={(e) => {
                          setEditIsFriendly(e.target.checked)
                          if (e.target.checked) setEditTournamentId('')
                        }}
                        className="h-4 w-4 accent-csc-gold rounded cursor-pointer"
                      />
                      <label htmlFor="editIsFriendly" className="ml-2 text-sm font-semibold text-white/80 cursor-pointer">
                        Jogo Amigável
                      </label>
                    </div>
                    {!editIsFriendly && (
                      <div className="animate-fade-in">
                        <label className={ETIQUETA_FORM}>Torneio / Competição</label>
                        <select
                          value={editTournamentId}
                          onChange={(e) => setEditTournamentId(e.target.value)}
                          className={CAMPO_FORM}
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
                        <label className={ETIQUETA_FORM}>Adversário</label>
                        <select
                          value={editOpponentId}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setIsQuickOpponentModalOpen(true)
                            } else {
                              setEditOpponentId(e.target.value)
                            }
                          }}
                          className={CAMPO_FORM}
                        >
                          <option value="">-- Selecionar Adversário --</option>
                          <option value="__new__" className="font-bold text-amber-800 bg-amber-50">➕ Criar Novo Adversário...</option>
                          {opponents.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={ETIQUETA_FORM}>Condição de Jogo</label>
                        <select
                          value={editHomeAway}
                          onChange={(e) => setEditHomeAway(e.target.value as any)}
                          className={CAMPO_FORM}
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
                    <label className={ETIQUETA_FORM}>Data e Hora *</label>
                    <input
                      type="datetime-local"
                      required
                      value={editDateTime}
                      onChange={(e) => setEditDateTime(e.target.value)}
                      className={CAMPO_FORM}
                    />
                  </div>

                  <div>
                    <label className={ETIQUETA_FORM}>Concentração (opcional)</label>
                    <input
                      type="time"
                      value={editMeetingTime}
                      onChange={(e) => setEditMeetingTime(e.target.value)}
                      className={CAMPO_FORM}
                      placeholder="Ex: 19:30"
                    />
                  </div>
                </div>

                {/* Campo / Instalação do Evento */}
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
                    {editLocation && (
                      <a
                        href={getGoogleMapsUrl(editLocation)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/16 text-csc-gold font-display font-bold text-[10.5px] cursor-pointer shrink-0 transition-transform duration-150 active:scale-97"
                        title="Ver no Google Maps"
                      >
                        <MapPin size={12} className="text-red-500" />
                        <span>Maps</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-white/5 border border-white/10 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-white/80 flex items-center gap-1.5">
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
                      className={CAMPO_FORM}
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
                  <label className={ETIQUETA_FORM}>Descrição / Notas</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className={CAMPO_FORM}
                    placeholder="Observações ou notas do evento..."
                  />
                </div>
              </div>

              {/* COLUNA DIREITA: GESTÃO DA CONVOCATÓRIA (6 Colunas) */}
              <div className="lg:col-span-6 bg-white/5 p-5 rounded-2xl border border-white/10 space-y-3.5">
                {selectedEvent && (() => {
                  const rawCurrentCallups = eventCallups[selectedEvent.id] || []
                  const eligibleMembers = allPlayers.filter(p => isPlayerEligible(p, editType))
                  const currentCallups = rawCurrentCallups.filter(c => {
                    const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                    return p ? isPlayerEligible(p, editType) : false
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
                    if (editUncalledPlayers.length === 0 || isEditBatchCallingRef.current) return
                    isEditBatchCallingRef.current = true
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
                        // Mensagem com a contagem real inserida — ver nota em isEditBatchCallingRef.
                        toast.success(
                          toInsert.length > 0
                            ? `${toInsert.length} membro(s) convocado(s) com sucesso!`
                            : 'Já estavam todos convocados.'
                        )
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar todos: ' + err.message)
                    } finally {
                      isEditBatchCallingRef.current = false
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditAddOnlyPlayers = async () => {
                    const uncalledAthletes = editUncalledPlayers.filter(p => p.role === 'player' || !['coach', 'admin'].includes(p.role))
                    if (uncalledAthletes.length === 0 || isEditBatchCallingRef.current) return
                    isEditBatchCallingRef.current = true
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
                        toast.success(
                          toInsert.length > 0
                            ? `${toInsert.length} jogador(es) convocado(s) com sucesso!`
                            : 'Já estavam todos os jogadores convocados.'
                        )
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar jogadores: ' + err.message)
                    } finally {
                      isEditBatchCallingRef.current = false
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditAddStaff = async () => {
                    const uncalledStaff = editUncalledPlayers.filter(p => ['coach', 'admin'].includes(p.role))
                    if (uncalledStaff.length === 0 || isEditBatchCallingRef.current) return
                    isEditBatchCallingRef.current = true
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
                        toast.success(
                          toInsert.length > 0
                            ? `${toInsert.length} membro(s) de staff convocado(s) com sucesso!`
                            : 'Já estava todo o staff convocado.'
                        )
                      }
                    } catch (err: any) {
                      toast.error('Erro ao convocar staff: ' + err.message)
                    } finally {
                      isEditBatchCallingRef.current = false
                      setIsEditBatchCalling(false)
                    }
                  }

                  const handleEditRemoveAll = () => {
                    if (currentCallups.length === 0 || isEditBatchCallingRef.current) return
                    setConfirmModalConfig({
                      isOpen: true,
                      title: 'Limpar Todos os Convocados',
                      description: 'Tens a certeza que desejas remover todos os membros e atletas convocados para este evento?',
                      confirmText: 'Sim, Limpar Convocatória',
                      cancelText: 'Cancelar',
                      variant: 'danger',
                      onConfirm: async () => {
                        if (isEditBatchCallingRef.current) return
                        isEditBatchCallingRef.current = true
                        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
                        setIsEditBatchCalling(true)
                        try {
                          const { error } = await supabase.from('callups').delete().eq('event_id', selectedEvent.id)
                          if (error) throw error
                          await fetchEventsAndData()
                          toast.info('Todos os convocados foram removidos.')
                        } catch (err: any) {
                          toast.error('Erro ao remover todos: ' + err.message)
                        } finally {
                          isEditBatchCallingRef.current = false
                          setIsEditBatchCalling(false)
                        }
                      }
                    })
                  }

                  const handleToggleCallup = async (player: Profile) => {
                    const existing = currentCallups.find(c => 
                      c.player_id === player.id || 
                      (c.player && (
                        c.player.id === player.id ||
                        (c.player.name && player.name && c.player.name.toLowerCase().trim() === player.name.toLowerCase().trim()) ||
                        (c.player.email && player.email && c.player.email.toLowerCase().trim() === player.email.toLowerCase().trim())
                      ))
                    )
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
                      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <Users size={15} className="text-csc-gold" />
                          <span>Convocatória ({calledMembersCount} convocados)</span>
                        </span>
                        <span className="text-[10px] bg-white/10 text-csc-gold font-bold px-2.5 py-0.5 rounded-full">
                          {eligibleMembers.length} Membros
                        </span>
                      </div>

                      {/* Botões Rápidos de Convocação */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={handleEditAddAll}
                          disabled={editUncalledPlayers.length === 0 || isEditBatchCalling}
                          className="px-2 py-1.5 bg-csc-gold hover:brightness-95 text-csc-dark rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-2xs cursor-pointer active:scale-95 disabled:opacity-40"
                        >
                          <Sparkles size={11} className="text-csc-dark" />
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
                          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-csc-dark font-medium text-gray-900"
                        />
                      </div>

                      {/* Lista Selecionável Um a Um */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[380px] overflow-y-auto p-1.5 bg-white border border-gray-200 rounded-xl">
                        {filteredMembers.map(p => {
                          const isCalled = isMemberCalled(p)
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
              <div className="col-span-full pt-5 border-t border-white/10 flex items-center justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleAttemptCloseEditModal}
                  className="px-5 py-2.5 border border-white/15 hover:border-white/25 bg-white/5 hover:bg-white/10 rounded-xl text-xs sm:text-sm font-bold text-white transition-colors cursor-pointer shadow-2xs"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-csc-gold hover:brightness-95 text-csc-dark rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 shadow-md hover:shadow-lg cursor-pointer active:scale-95"
                >
                  <Save size={16} className="text-csc-dark" />
                  <span>Guardar Alterações</span>
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
        onResend={() => handleConfirmSaveEditedEvent(true)}
        onKeepAnswers={() => handleConfirmSaveEditedEvent(false)}
        onBack={() => setIsResendPromptOpen(false)}
        isSaving={isSavingEditLoading}
      />

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

      {/* Modal de Ficha de Jogo (Esquema Tático, Marcadores, Cartões e Ocorrências) */}
      {selectedEvent && selectedEvent.type === 'match' && (
        <MatchReportModal
          isOpen={isMatchReportOpen}
          onClose={() => setIsMatchReportOpen(false)}
          eventId={selectedEvent.id}
          event={selectedEvent}
          isCoachOrAdmin={!!isCoachOrAdmin}
          onSaved={() => {
            fetchEventsAndData()
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

export default CalendarPage
