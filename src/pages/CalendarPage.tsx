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
import { Link, useSearchParams } from 'react-router-dom'
import type { Profile } from '../context/AuthContext'
import { TrainingIcon } from './EventsPage'
import { VistaDetalhe } from '../components/VistaDetalhe'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { QuickFieldModal } from '../components/QuickFieldModal'
import { QuickOpponentModal } from '../components/QuickOpponentModal'
import { ResendCallupsModal } from '../components/ResendCallupsModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { MatchReportModal, parseMatchReportMetadata } from '../components/MatchReportModal'
import { QuorumFilterCards } from '../components/callups/QuorumFilterCards'
import { CallupRow } from '../components/callups/CallupRow'
import { AniversariosDoMes } from '../components/AniversariosDoMes'
import { FichaConvocado } from '../components/callups/FichaConvocado'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { useModalA11y } from '../hooks/useModalA11y'
import { BottomSheet } from '../components/BottomSheet'
import { CabecalhoEcra, Pastilha, Botao, EtiquetaSeccao } from '../components/ui'
import { SlidersHorizontal, Shield } from 'lucide-react'
import { formatClubSigla, formatOpponentSigla } from '../lib/siglas'
import { getPlayerDisplayName, getGoogleMapsUrl, hasMatchReport, convocatoriaFechada, textoConvocatoriaFechada, formatDataCurta } from '../lib/eventos'
import { sincronizarJogoNaJornada, AVISO_SEM_EQUIPAS, type EventoParaJornada } from '../lib/jornadaDoJogo'

/** Como se lê cada filtro de estado — no título da lista e no resumo do cabeçalho. */
const ROTULOS_ESTADO: Record<string, string> = {
  all: 'Todos os eventos',
  upcoming: 'Por realizar',
  past: 'Realizados',
  my_confirmed: 'Confirmados por mim',
  my_pending: 'Por responder',
  my_declined: 'Recusados por mim',
  my_called: 'Fui convocado',
}

/**
 * A Agenda abre no que está **por realizar**, e não em tudo.
 *
 * A lista por baixo do calendário é ordenada por data e a época tem meses
 * feitos: abrir em "Todos" era abrir num jogo de janeiro, com o próximo a
 * dezenas de cartões de distância. Isto é o ponto de partida, não um filtro
 * posto por alguém — daí o `temFiltros` medir-se a partir daqui, e o funil não
 * acender só por a app ter aberto.
 */
const ESTADO_POR_OMISSAO = 'upcoming'

/**
 * A cor de cada tipo de evento, num sítio só.
 *
 * O ponto do calendário e o rótulo do cartão diziam a mesma coisa em tons
 * diferentes — o convívio era `csc-azul-texto` no ponto e `blue-300` no
 * rótulo — e nenhum dos dois se via bem: pontos de 4px e uma palavra de 10px
 * sem fundo. O ponto passa a 6px e o rótulo a pastilha da mesma cor, para o
 * tipo de evento se ler de relance no calendário e no cartão.
 */
const CORES_TIPO = {
  /*
    O jogo é vermelho, e chegou lá por eliminação. Dourado é a moldura — a
    data no topo do próprio cartão, os títulos, os botões —, e branco é o
    lettering de tudo o resto: os dois liam-se como mais do mesmo, e não como
    o tipo do evento. Verde é o treino e azul o convívio. Sobra o vermelho do
    clube, que é o que a paleta tem para o dizer.

    O risco assumido: nesta app o vermelho costuma querer dizer que há um
    problema (recusou, lesionado, sem condições). No cartão da Agenda não há
    nenhum desses — as pastilhas de estado ali são verdes ou douradas — e o
    vermelho fica livre para o que é, à conta do desenho não voltar a pôr um
    estado vermelho ao lado deste.
  */
  match: {
    ponto: 'bg-csc-vermelho-texto',
    halo: 'shadow-csc-vermelho-texto/70',
    texto: 'text-csc-vermelho-texto',
    pastilha: 'bg-csc-red/20 border-csc-red/50',
  },
  practice: {
    ponto: 'bg-csc-verde-texto',
    halo: 'shadow-csc-verde-texto/70',
    texto: 'text-csc-verde-texto',
    pastilha: 'bg-csc-light/22 border-csc-verde-texto/45',
  },
  gathering: {
    ponto: 'bg-csc-azul-texto',
    halo: 'shadow-csc-azul-texto/70',
    texto: 'text-csc-azul-texto',
    pastilha: 'bg-csc-blue/28 border-csc-azul-texto/45',
  },
} as const

/**
 * Campo branco dos formulários de evento (ecrã 2e) — 46px, como no handoff.
 * É o mesmo desenho dos campos do Perfil, dois pixels mais alto porque aqui
 * há menos campos por ecrã e mais dedo a preencher.
 */
const ETIQUETA_FORM =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

const CAMPO_FORM =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ROTULOS_TIPO: Record<string, string> = {
  match: 'Jogos',
  practice: 'Treinos',
  gathering: 'Convívios',
}

/* As regras de evento vivem em `src/lib/eventos.ts` e as siglas em
   `src/lib/siglas.ts`: metade da app importava esta página de 3000 linhas só
   para lhes chegar. */

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
  /** Jornada da prova em que este jogo conta — ver `jornadaDoJogo.ts`. */
  matchday?: number | null
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
  /** Quando o atleta respondeu. Escrito por gatilho no servidor; NULL nas respostas anteriores a set/2026. */
  responded_at?: string | null
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
  /*
    A persiana do detalhe **não tem estado de aberta/fechada**: quem manda é o
    endereço. Tinha, sincronizado do `?event=` por um efeito, e era daí que
    vinha a falha do retroceder do browser — o efeito dependia do objeto dos
    parâmetros, e quando a identidade dele não mudava não corria: o endereço
    perdia o `?event=` e a persiana ficava aberta por cima da lista.

    Derivado durante o render não há nada a sincronizar, e o retroceder fecha
    sempre. O `selectedEvent` continua a ser retido, para a persiana poder
    deslizar para fora antes de o conteúdo desaparecer.
  */
  const isEventSheetOpen = Boolean(searchParams.get('event'))
  const [loading, setLoading] = useState(true)

  // Calendar View States
  // A pesquisa e o filtro de estado não estão à vista (ver o cabeçalho): vivem
  // numa persiana, e o cabeçalho diz quando estão a filtrar alguma coisa.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  /* A ficha rápida do convocado (4a), por cima da persiana do evento. Guarda-se
     o id da convocatória e não a linha, para a ficha acompanhar as alterações
     de estado feitas nos seus próprios botões. */
  const [convocadoAberto, setConvocadoAberto] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past' | 'my_confirmed' | 'my_declined' | 'my_pending' | 'my_called'>(ESTADO_POR_OMISSAO)

  // Callups state
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  const [modalCallupStatusFilter, setModalCallupStatusFilter] = useState<'all' | 'confirmed' | 'called' | 'declined'>('all')
  /*
    A convocatória, no detalhe do evento, começa recolhida.

    Começava aberta ou fechada conforme `window.innerWidth >= 640` — resto do
    tempo em que havia duas UIs. Com uma só, isso passou a ser um bug: o mesmo
    evento mostrava a lista de convocados numa janela larga e escondia-a num
    telemóvel, e a regra é que as duas larguras têm de mostrar a mesma coisa.
    Fica o comportamento do telemóvel, que é o que toda a gente vê: a persiana
    abre curta, com a hora, o local e a resposta do próprio à vista, e a lista
    do plantel a um toque.
  */
  const [isModalCallupsExpanded, setIsModalCallupsExpanded] = useState(false)
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

  // Abrir outro evento repõe a convocatória recolhida.
  useEffect(() => {
    if (selectedEvent) setIsModalCallupsExpanded(false)
  }, [selectedEvent])

  // Ver um evento é navegar: o endereço passa a ter ?event=<id>, portanto o
  // detalhe tem link próprio e o botão de retroceder do browser fecha-o. No
  // desktop deixa de ser uma persiana e passa a ser a página (ver VistaDetalhe).
  const abrirEvento = (ev: Event) => {
    setSelectedEvent(ev)
    setSearchParams({ event: ev.id })
  }

  const handleCloseEventModal = () => {
    // `selectedEvent` fica retido para a persiana poder deslizar para fora
    // antes de o conteúdo desaparecer; o que a fecha é o endereço, abaixo.
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
  /* A jornada em que o jogo conta na prova — obrigatória com prova escolhida. */
  const [editMatchday, setEditMatchday] = useState('')
  const [editOpponentId, setEditOpponentId] = useState('')
  const [editHomeAway, setEditHomeAway] = useState<'home' | 'away' | 'neutral'>('home')
  const [editIsFriendly, setEditIsFriendly] = useState(false)
  /* Rascunho: existia só na Gestão de Eventos, e quem edita a partir da Agenda
     não tinha como pôr ou tirar um evento de rascunho. */
  const [editIsActive, setEditIsActive] = useState(true)
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

  /*
    O guarda do formulário de edição de evento. Perguntava sempre — fechar um
    evento que só se tinha aberto para ver dava o aviso de alterações por
    gravar na mesma. Agora compara com a fotografia da abertura.

    A caixa de procura de jogadores fica de fora de propósito: escrever nela
    não é uma alteração ao evento.
  */
  const guardaEdicao = useAlteracoesPorGravar({
    aberto: isEditModalOpen,
    valores: [
      editTitle, editType, editDateTime, editMeetingTime, editFieldId, editLocation,
      editDescription, editMaxPlayers, editTournamentId, editMatchday, editOpponentId, editHomeAway,
      editIsFriendly, editIsActive,
    ],
    // Sair da edição de um evento é sempre deliberado: gravá-la pode reenviar
    // os pedidos de resposta ao plantel todo — ver `sempre` no hook.
    sempre: true,
    // Guardar um evento já convocado pergunta antes se reenvia os pedidos —
    // é esse o caminho de gravação, e não uma escrita direta.
    aoGravar: () => setIsResendPromptOpen(true),
    aoSair: () => setIsEditModalOpen(false),
    descricao: 'As alterações a este evento ainda não foram gravadas. Se saíres agora, perdem-se.',
  })
  const handleAttemptCloseEditModal = guardaEdicao.tentarFechar

  /* Os diálogos rápidos guardam-se a si próprios — ver QuickFieldModal. */
  const fecharQuickFieldModal = () => {
    setIsQuickFieldModalOpen(false)
    setQuickFieldName('')
    setQuickFieldAddress('')
  }

  const fecharQuickOppModal = () => {
    setIsQuickOpponentModalOpen(false)
    setQuickOppName('')
    setQuickOppInitials('')
    setQuickOppHomeFieldId('')
    setQuickOppContactName('')
    setQuickOppContactPhone('')
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


  /**
   * O mesmo que `getEventLocation`, mas com o nome e a morada separados —
   * é assim que o cartão os desenha, um por linha, como no cartão do jogo da
   * Home. A precedência é a mesma: um local escrito à mão ganha ao campo.
   */
  const getEventLocationParts = (
    ev: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null | undefined,
  ): { nome: string; morada: string } => {
    if (!ev) return { nome: '', morada: '' }
    const solto = ev.location?.trim()
    if (solto) return { nome: solto, morada: '' }
    const campo = ev.field ?? (ev.field_id ? fields.find(item => item.id === ev.field_id) ?? null : null)
    if (campo?.name) return { nome: campo.name, morada: campo.address?.trim() || '' }
    return { nome: '', morada: '' }
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
            .select('id, event_id, player_id, status, responded_at, player:v_players_public(id, name, photo_url, shirt_name, jersey_number, nickname, role, roles, position, status)')
            .eq('player_id', profile.id)
        : Promise.resolve({ data: [] } as any)

      const [evRes, callupsRes, myCallupsRes, profilesRes, fieldsRes, tourRes, oppsRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season, image_url, organizer_name), field:fields(id, name, address)')
          .order('date_time', { ascending: true }),
        fetchAllCallups('id, event_id, player_id, status, responded_at, player:v_players_public(id, name, photo_url, shirt_name, jersey_number, nickname, role, roles, position, status)'),
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
    setEditMatchday(ev.matchday ? String(ev.matchday) : '')
    setEditOpponentId(ev.opponent_id || '')
    setEditHomeAway(ev.home_away || 'home')
    setEditIsFriendly(Boolean(ev.is_friendly))
    setEditIsActive(ev.is_active !== false)
    setEditPlayerSearchTerm('')
    setIsEditModalOpen(true)
  }

  const handleSaveEditedEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEvent) return

    /* Um jogo de prova diz sempre em que jornada conta: é o que o põe na
       tabela e o que deixa a ficha de jogo lançar lá o resultado. */
    if (editType === 'match' && !editIsFriendly && editTournamentId && !Number(editMatchday)) {
      toast.warning('Escolhe a jornada em que este jogo conta para a prova.')
      return
    }

    /*
      A pergunta "reenviar o pedido de resposta a todos os convocados?" só faz
      sentido quando há convocados e quando alguém vai ser avisado. Aparecia
      sempre — inclusive ao guardar um rascunho, que por definição não avisa
      ninguém, e num evento sem convocatória feita, onde não há a quem
      reenviar. Nesses dois casos guarda-se logo, mantendo as respostas.
    */
    const temConvocados = (eventCallups[selectedEvent.id] || []).length > 0
    if (!temConvocados || !editIsActive) {
      handleConfirmSaveEditedEvent(false)
      return
    }

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
        matchday: (editType === 'match' && !editIsFriendly && editTournamentId) ? Number(editMatchday) : null,
        opponent_id: editType === 'match' ? (editOpponentId || null) : null,
        home_away: editType === 'match' ? editHomeAway : null,
        is_friendly: editType === 'match' ? editIsFriendly : false,
        is_active: editIsActive,
      }

      const { error } = await supabase
        .from('events')
        .update(payload)
        .eq('id', selectedEvent.id)

      if (error) throw error

      /* E a linha da jornada acompanha: mudar de prova, de jornada, de
         adversário ou de casa/fora reescreve-a; tirar a prova ao jogo
         tira-o da tabela. */
      const espelho = await sincronizarJogoNaJornada({ ...selectedEvent, ...payload, id: selectedEvent.id } as EventoParaJornada)
      if (espelho.estado === 'sem-equipas') toast.warning(AVISO_SEM_EQUIPAS)

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
        ? 'Evento atualizado e pedidos de confirmação reenviados aos atletas!' 
        : 'Evento atualizado com sucesso!'
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
          handleCloseEventModal()
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
    const fechada = convocatoriaFechada(targetEvent, (eventCallups[eventId] || []).length > 0)
    if (fechada) {
      toast.error(textoConvocatoriaFechada(fechada, targetEvent) + '.')
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
      /*
        "Presença confirmada" era o vocabulário errado, e é o que esta app não
        diz: ninguém marca presença nenhuma, o que se sabe é quem disse que ia.
        É o mesmo texto da Home, que já o dizia bem.
      */
      toast.success(status === 'confirmed' ? 'Contamos contigo.' : 'Resposta registada.')
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

  /*
    Passar o mês com o dedo, sobre o calendário.

    Só conta como arrasto lateral se for mesmo lateral: o gesto natural nesta
    página é rolar para baixo, e um calendário que mudasse de mês a meio de um
    scroll era pior do que não ter gesto nenhum. Daí o mínimo de 45px e a
    exigência de o desvio horizontal valer uma vez e meia o vertical.

    As setas ficam: o gesto não chega ao teclado nem a quem usa leitor de ecrã.
  */
  const arrastoRef = useRef<{ x: number; y: number } | null>(null)

  const aoComecarArrasto = (e: React.TouchEvent) => {
    const t = e.touches[0]
    arrastoRef.current = t ? { x: t.clientX, y: t.clientY } : null
  }

  const aoAcabarArrasto = (e: React.TouchEvent) => {
    const inicio = arrastoRef.current
    arrastoRef.current = null
    const t = e.changedTouches[0]
    if (!inicio || !t) return
    const dx = t.clientX - inicio.x
    const dy = t.clientY - inicio.y
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) handleNextMonth()
    else handlePrevMonth()
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

  /*
    Os eventos que passam os filtros **menos o do tempo** — é o que o
    calendário do mês mostra, e o que se vê ao escolher um dia.

    O tempo fica de fora de propósito. Com "Por realizar" por omissão, aplicá-lo
    aqui apagava os pontos dos dias já passados do próprio mês que se está a
    ver, e escolher o dia de um jogo da semana passada respondia "Sem eventos
    neste dia" — que é falso. Um calendário que esconde metade do mês que
    desenha não é um calendário. O filtro de tempo é da lista, que é onde a
    pergunta "o que vem a seguir?" se faz.
  */
  const eventosDoCalendario = events.filter(e => {
    /*
      0. Rascunhos: só para quem gere.

      Um rascunho é um evento que a equipa técnica ainda não quis anunciar —
      aparecia na Agenda de toda a gente sem nada a dizer que não é oficial, e
      um jogador podia contar com um jogo que ainda não está marcado a sério.
      Para quem gere fica, com a pastilha "Rascunho" no cartão.
    */
    if (e.is_active === false && !isCoachOrAdmin) {
      return false
    }

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

    // 3. Status Filter — a parte da resposta à convocatória; o tempo é abaixo.
    if (statusFilter !== 'all') {
      if (statusFilter === 'my_confirmed') {
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

  /** Já sem os que ficaram para trás (ou só com esses): é a lista do fundo. */
  const filteredEvents = eventosDoCalendario.filter(e => {
    if (statusFilter !== 'upcoming' && statusFilter !== 'past') return true
    const passou = new Date(e.date_time).getTime() < Date.now()
    return statusFilter === 'past' ? passou : !passou
  })

  /** Há passado para ver? É o que decide se vale a pena oferecer o atalho. */
  const haRealizados = eventosDoCalendario.some(
    e => new Date(e.date_time).getTime() < Date.now(),
  )

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
    return eventosDoCalendario.filter(e => formatDateKey(e.date_time) === key)
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

  /*
    Ecrã 4e: os eventos por convocar sobem ao topo, fora da lista.

    Quase a mesma regra do alerta da Home (4c) — jogos e convívios, que os
    treinos convocam sozinhos todos os aptos; no futuro; sem uma única linha
    em `callups` — com **uma diferença de propósito: aqui os rascunhos entram**.

    A Agenda é onde se trabalha, e um rascunho por convocar é trabalho por
    acabar: convém estar à vista de quem o criou. A Home é o aviso que insiste,
    e não deve insistir com uma coisa que a equipa técnica pôs de lado de
    propósito. Por isso o cartão marca o rascunho, para se perceber porque é
    que este aparece aqui e não lá.

    Nenhum dos dois tem janela de dias: um jogo daqui a três semanas sem
    ninguém chamado é para tratar quando se repara nele, não só quando fica
    urgente.
  */
  const eventosPorConvocar = !isCoachOrAdmin ? [] : filteredEvents.filter(e =>
    (e.type === 'match' || e.type === 'gathering') &&
    new Date(e.date_time).getTime() >= Date.now() &&
    (eventCallups[e.id] || []).length === 0,
  )
  const idsPorConvocar = new Set(eventosPorConvocar.map(e => e.id))
  const eventosDaLista = filteredEvents.filter(e => !idsPorConvocar.has(e.id))

  /** O cartão destacado de um evento sem ninguém convocado (4e). */
  const renderCartaoPorConvocar = (event: Event) => {
    const quando = new Date(event.date_time)
    const titulo = event.type === 'match'
      ? `${formatClubSigla(clubSettings?.initials)} vs ${event.opponent?.name ?? 'adversário por definir'}`
      : (event.title || 'Convívio')
    const prova = event.is_friendly ? 'Amigável' : event.tournament?.name
    const eRascunho = event.is_active === false

    return (
      /*
        Clicável, como qualquer outro cartão de evento: abria só o "Convocar" e
        não havia como chegar ao evento para o ver ou editar. Leva o botão do
        Maps e o "Convocar" lá dentro, portanto não pode ser um `<button>` —
        fica o papel e o tratamento das teclas à mão, a convenção do CLAUDE.md.
      */
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        onClick={() => abrirEvento(event)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            abrirEvento(event)
          }
        }}
        aria-label={`Ver ${event.type === 'match' ? 'jogo' : 'convívio'} por convocar: ${titulo}, ${formatDataCurta(event.date_time)}`}
        className="cartao-vidro overflow-hidden border-csc-gold/35 cursor-pointer
          transition-transform duration-150 active:scale-[0.99]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <div className="flex items-center gap-3.5 px-4 pt-4">
          <span className="w-11 shrink-0 text-center">
            <span className="block font-display font-black text-[19px] text-csc-gold leading-none tabular-nums">
              {String(quando.getDate()).padStart(2, '0')}
            </span>
            <span className="block font-display font-bold text-[8.5px] tracking-[0.1em] uppercase text-white/62 mt-0.5">
              {quando.toLocaleDateString('pt-PT', { weekday: 'short' }).replace(/\.?(-feira)?,?$/, '')}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-[15px] text-white truncate">{titulo}</span>
            <span className="block text-[11px] text-white/62 mt-0.5 truncate">
              {quando.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              {prova ? ` · ${prova}` : ''}
            </span>
          </span>
          {eRascunho && (
            <span
              className="font-display font-extrabold text-[9px] tracking-[0.12em] uppercase px-2.5 py-1 rounded-full
                bg-white/10 border border-white/20 text-white/70 shrink-0"
            >
              Rascunho
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-3.5 mt-3.5 bg-csc-gold/10 border-t border-csc-gold/25">
          <span className="min-w-0 flex-1">
            <span className="block font-display font-extrabold text-[12.5px] text-csc-gold">
              Ninguém foi convocado
            </span>
            <span className="block text-[10.5px] leading-snug text-white/60 mt-0.5">
              {eRascunho
                ? 'Em rascunho: fica só aqui, não avisa ninguém nem entra no alerta da Home'
                : 'Sem convocatória o plantel não recebe pedido de resposta'}
            </span>
          </span>
          <Link
            to={`/events?convocatoria=${event.id}`}
            onClick={e => { e.stopPropagation(); triggerHaptic('light') }}
            className="h-11 px-4 rounded-[22px] bg-csc-gold text-csc-tinta font-display font-extrabold text-[11.5px]
              flex items-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Convocar
          </Link>
        </div>
      </div>
    )
  }

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
    const semRespostaCount = callups.filter(c => c.status === 'called').length

    const isMatch = event.type === 'match'
    const isPractice = event.type === 'practice'
    const isAway = event.home_away === 'away'

    const cscSigla = formatClubSigla(clubSettings?.initials)
    const oppSigla = formatOpponentSigla(event.opponent)

    // Bloco equipa Cascais
    /*
      O confronto, com o mesmo desenho do cartão do jogo da Home: o emblema
      grande em cima, a sigla por baixo e a condição — Casa, Fora, Neutro —
      em terceiro. Era uma linha de emblema de 32px com a sigla ao lado, mais
      uma frase "Condição: Visitante" numa linha própria por baixo; o cartão
      da Agenda e o da Home mostravam o mesmo jogo de duas maneiras.

      Aqui os emblemas são de 46px e não de 58px: na Home há um jogo por
      ecrã, na Agenda há uma lista.
    */
    const condicao = event.home_away === 'neutral' ? 'Neutro' : null

    const blocoEquipa = (logo: string | null | undefined, sigla: string, emCasa: boolean) => (
      <div className="w-[92px] flex flex-col items-center gap-1.5 min-w-0">
        {logo ? (
          <img
            src={logo}
            alt={sigla}
            className="w-[46px] h-[46px] rounded-full bg-white object-contain p-0.5 flex-none"
          />
        ) : (
          /* Sem emblema fica um escudo, não as iniciais: quem identifica o
             clube é a linha de baixo, e a bola a repetir "GDPCC" por cima do
             "GDPCC" lia-se duas vezes. Tirar antes a linha de baixo também
             não servia — com um clube de emblema e outro sem, os dois blocos
             ficavam com alturas diferentes e desencontravam-se. */
          <div className="w-[46px] h-[46px] rounded-full bg-white/95 text-csc-dark flex items-center justify-center flex-none">
            <Shield size={20} />
          </div>
        )}

        <span className="font-display font-extrabold text-[13px] text-white uppercase tracking-tight truncate max-w-full">
          {sigla}
        </span>

        <span className="font-display font-bold text-[10px] text-white/62">
          {condicao ?? (emCasa ? 'Casa' : 'Fora')}
        </span>
      </div>
    )

    const cscBlock = () => blocoEquipa(clubSettings?.logo_url, cscSigla, !isAway)
    const opponentBlock = () => blocoEquipa(event.opponent?.logo_url, oppSigla, isAway)

    const TipoIcon = isMatch ? Trophy : isPractice ? TrainingIcon : PartyPopper
    const cores = CORES_TIPO[event.type]

    return (
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        onClick={() => abrirEvento(event)}
        onKeyDown={e => {
          // O cartão era um `div` com `onClick`: quem navega por teclado não
          // lhe chegava, e quem usa leitor de ecrã não ouvia que era clicável.
          // O link do Maps lá dentro impede que seja um `<button>` a sério
          // (interativo dentro de interativo), por isso fica o papel e o
          // tratamento das teclas à mão.
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            abrirEvento(event)
          }
        }}
        aria-label={`Ver ${isMatch ? 'jogo' : isPractice ? 'treino' : 'convívio'}: ${
          isMatch && event.opponent ? `${cscSigla} contra ${oppSigla}` : event.title
        }, ${new Date(event.date_time).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}`}
        className="cartao-vidro text-white overflow-hidden cursor-pointer flex flex-col justify-between transition-transform duration-150 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        {/* Quando é. A data vinha só no `aria-label`, e o cartão dizia a hora
            sem dizer o dia — numa lista que percorre o mês, é o que mais falta. */}
        <p className="px-5 pt-4 font-display font-extrabold text-[9.5px] tracking-[0.18em] text-csc-gold">
          {formatDataCurta(event.date_time)}
        </p>

        {/* Cabeçalho: o tipo de evento numa pastilha da sua cor — a mesma do
            ponto no calendário. Continua a não ser o cartão inteiro a mudar de
            cor (o fundo é o vidro, sempre), mas uma palavra de 10px sem fundo
            perdia-se entre as outras pastilhas da linha. */}
        <div className="px-5 pt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5
                px-2.5 py-1 rounded-full border ${cores.texto} ${cores.pastilha}`}
            >
              <TipoIcon size={13} />
              <span>{isMatch ? 'Jogo' : isPractice ? 'Treino' : 'Convívio'}</span>
            </span>

            {/* Só chega aqui a quem gere: os rascunhos são filtrados antes. */}
            {event.is_active === false && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/12 border border-white/25 text-white/75 uppercase tracking-wider">
                Rascunho
              </span>
            )}

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

          {/*
            Quantos foram chamados e quantos responderam (ecrã 4e). **Só a quem
            gere**: para o jogador é ruído — o que lhe diz respeito é a hora, o
            local e a sua própria resposta, que estão mais abaixo no cartão.
            Mostra-se o número de "sim" enquanto houver algum, e só quando não
            há nenhum é que passa a dizer quantos faltam responder: com 0,7% de
            respostas em toda a base, um "0 sim" em cada cartão seria a única
            coisa que a Agenda dizia.
          */}
          {isCoachOrAdmin && callups.length > 0 && (
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold flex items-center gap-1 bg-white/10 text-white/70 px-2.5 py-1 rounded-full">
                <Users size={13} />
                {callups.length} convocados
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  confirmedCount > 0
                    ? 'bg-csc-light/16 border-csc-light/30 text-csc-verde-texto'
                    : 'bg-csc-gold/16 border-csc-gold/30 text-csc-gold'
                }`}
              >
                {confirmedCount > 0 ? `${confirmedCount} sim` : `${semRespostaCount} sem resp.`}
              </span>
            </span>
          )}
        </div>

        {/*
          O corpo, em bandas de largura inteira separadas por uma linha — o
          desenho do cartão do jogo da Home. Era um bloco com `p-5` e caixas
          arredondadas soltas lá dentro (o local numa pastilha truncada, a
          descrição numa caixa cinzenta), e o mesmo jogo aparecia de duas
          maneiras conforme o ecrã em que se estava.
        */}
        <div className="flex flex-col">
          {/* O confronto (só num jogo com adversário definido). */}
          {isMatch && event.opponent && (
            <div className="flex items-center justify-center gap-4 px-5 pt-3 pb-4">
              {isAway ? opponentBlock() : cscBlock()}
              <span
                className="flex-none font-display font-black text-[22px] mb-5 text-transparent"
                style={{ WebkitTextStroke: '1.3px var(--color-csc-gold)' }}
                aria-hidden="true"
              >
                VS
              </span>
              {isAway ? cscBlock() : opponentBlock()}
            </div>
          )}

          {/* O título, que num convívio é o assunto do cartão. */}
          {event.type === 'gathering' && (
            <h4 className="px-5 pt-1 pb-4 font-display font-black text-base text-white leading-snug">
              {event.title}
            </h4>
          )}

          {/* As duas horas lado a lado, divididas por uma linha: a de
              concentração à esquerda (quando existe) e a de início à
              direita, esta em dourado, porque é a que não se pode falhar. */}
          <div className="flex items-stretch border-t border-white/13">
            {event.meeting_time && (
              <>
                <div className="flex-none px-5 py-3">
                  <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-white/55">
                    Concentração
                  </p>
                  <p className="font-display font-extrabold text-[20px] text-white mt-1">
                    {event.meeting_time.substring(0, 5)}
                  </p>
                </div>
                <div className="w-px bg-white/13" />
              </>
            )}
            <div className="flex-1 px-5 py-3">
              <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-csc-gold">
                {isMatch ? 'Pontapé de saída' : 'Início'}
              </p>
              <p className="font-display font-extrabold text-[20px] text-white mt-1">
                {new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          {/* O campo: o nome em cima da morada, e o caminho para o Maps. */}
          {(() => {
            const { nome, morada } = getEventLocationParts(event)
            if (!nome) return null
            return (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  morada ? `${nome}, ${morada}` : nome,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { e.stopPropagation(); triggerHaptic('light') }}
                className="flex items-center gap-2.5 px-5 py-3.5 min-h-11 border-t border-white/13
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <MapPin size={14} className="text-csc-gold shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block font-display font-bold text-[12.5px] text-white truncate">{nome}</span>
                  {morada && (
                    <span className="block text-[11.5px] leading-snug text-white/70 truncate">{morada}</span>
                  )}
                </span>
                <ExternalLink size={14} className="text-white/40 shrink-0" />
              </a>
            )
          })()}

          {/* Observações da equipa técnica. */}
          {(() => {
            const clean = parseMatchReportMetadata(event.description).cleanDescription
            if (!clean) return null
            return (
              <p className="px-5 py-3 border-t border-white/13 text-[11.5px] leading-relaxed text-white/70 whitespace-pre-line">
                {clean}
              </p>
            )
          })()}

          {/* O pedido de resposta, na faixa dourada do cartão da Home. */}
          {myCallup && (() => {
            const fechada = convocatoriaFechada(event, callups.length > 0)

            return (
              <div
                onClick={e => e.stopPropagation()}
                className="px-5 py-3.5 bg-csc-gold/13 border-t border-csc-gold/24"
              >
                {fechada ? (
                  <p className="text-[11.5px] text-white/80 text-center">
                    {textoConvocatoriaFechada(fechada, event)}
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2.5">
                      <span className="font-display font-extrabold text-[14px] text-white">
                        {myCallup.status === 'confirmed'
                          ? 'Contamos contigo.'
                          : myCallup.status === 'declined'
                            ? 'Ficas de fora.'
                            : 'Contamos contigo?'}
                      </span>
                      <span className="text-[11px] text-white/60 flex-none">
                        {confirmedCount} {confirmedCount === 1 ? 'confirmado' : 'confirmados'}
                      </span>
                    </div>
                    <div className="flex gap-2.5 mt-3">
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'confirmed')}
                        aria-pressed={myCallup.status === 'confirmed'}
                        className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                          flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                            myCallup.status === 'confirmed'
                              ? 'bg-csc-light border-csc-light text-white'
                              : 'bg-white/9 border-white/20 text-white'
                          }`}
                      >
                        {myCallup.status === 'confirmed' && <CheckCircle2 size={14} />}
                        Sim, vou
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'declined')}
                        aria-pressed={myCallup.status === 'declined'}
                        className={`flex-1 h-11 rounded-[22px] border font-display font-bold text-[13px] cursor-pointer
                          flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                            myCallup.status === 'declined'
                              ? 'bg-white/90 border-white/90 text-csc-tinta'
                              : 'bg-white/9 border-white/20 text-white'
                          }`}
                      >
                        {myCallup.status === 'declined' && <XCircle size={14} />}
                        Não posso
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })()}
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
  const temFiltros =
    searchQuery.trim() !== '' || statusFilter !== ESTADO_POR_OMISSAO || typeFilter !== 'all'
  const resumoFiltros = [
    searchQuery.trim() ? `"${searchQuery.trim()}"` : null,
    statusFilter !== ESTADO_POR_OMISSAO ? ROTULOS_ESTADO[statusFilter] : null,
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
      />

      {/*
        **Procura à vista, tudo o resto atrás do funil** — a mesma forma em
        todos os ecrãs de lista da app.

        As pastilhas do tipo de evento estavam aqui fora, e as Fichas de Jogo
        e as Estatísticas escondiam o filtro equivalente: o mesmo filtro
        tratado de duas maneiras conforme o ecrã. Uma pastilha à vista é
        navegação; o que filtra fica atrás do funil.
      */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Título, adversário ou local"
            aria-label="Procurar na agenda"
            className={`${CAMPO_FORM} pl-9.5`}
          />
        </div>
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setFiltrosAbertos(true) }}
          aria-label={temFiltros ? 'Pesquisa e filtros (ativos)' : 'Pesquisa e filtros'}
          className={`flex-none w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              temFiltros
                ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                : 'bg-white/10 border-white/15 text-white/75'
            }`}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>

      {/* O que a persiana esconde tem de continuar visível como estado. */}
      {temFiltros && (
        <button
          type="button"
          onClick={() => { setSearchQuery(''); setStatusFilter(ESTADO_POR_OMISSAO); setTypeFilter('all') }}
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
          <div
            className="cartao-vidro px-3 pt-3.5 pb-3"
            onTouchStart={aoComecarArrasto}
            onTouchEnd={aoAcabarArrasto}
          >
            {/* Os controlos do mês, ao pé do que mudam: o mês e o ano em
                saltos longos à esquerda, e à direita as setas com o "Hoje"
                pelo meio. Estavam no cabeçalho do ecrã, longe do calendário e
                encostados ao funil dos filtros, que não tem nada a ver com
                eles. */}
            <div className="flex items-center gap-1.5 px-1 pb-3">
              <select
                value={currentDate.getMonth()}
                onChange={e => handleMonthChange(Number(e.target.value))}
                aria-label="Mês"
                className="h-11 min-w-0 flex-1 px-2.5 rounded-[18px] bg-white/8 border border-white/15 text-white font-display font-bold text-[11px]
                  outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-csc-gold"
              >
                {monthNames.map((nome, idx) => (
                  <option key={nome} value={idx} className="bg-csc-superficie text-white">{nome}</option>
                ))}
              </select>

              <select
                value={currentDate.getFullYear()}
                onChange={e => handleYearChange(Number(e.target.value))}
                aria-label="Ano"
                className="h-11 min-w-0 flex-none px-2.5 rounded-[18px] bg-white/8 border border-white/15 text-white font-display font-bold text-[11px]
                  outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-csc-gold"
              >
                {anosDisponiveis.map(ano => (
                  <option key={ano} value={ano} className="bg-csc-superficie text-white">{ano}</option>
                ))}
              </select>

              <div className="ml-auto flex items-center gap-1.5 flex-none">
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
                  onClick={handleToday}
                  className="min-h-11 px-3 rounded-[18px] bg-csc-gold text-csc-tinta font-display font-bold text-xs cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  Hoje
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
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1.5">
              {weekDayNames.map(w => (
                <span key={w} className="font-display font-bold text-[9px] text-white/62 text-center">
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
                      <span className="flex items-center gap-[3px] h-1.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <span
                            key={ev.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              cell.isSelected
                                ? 'bg-csc-tinta'
                                // O halo da própria cor: seis pixels sobre o vidro
                                // escuro ainda se perdem, e é a cor que diz o tipo.
                                : `${CORES_TIPO[ev.type].ponto} shadow-[0_0_5px] ${CORES_TIPO[ev.type].halo}`
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
            {/*
              Com a agenda toda vazia (ecrã 11b) este painel calava-se: dizia
              "Sem eventos neste dia" logo por cima de "Nada marcado ainda", e
              duas mensagens de vazio seguidas leem-se como uma avaria. O
              painel do dia só faz sentido quando há eventos noutros dias.
            */}
            {selectedDate && !(eventosDoCalendario.length === 0 && !temFiltros) && (
              selectedDayEvents.length === 0 ? (
                <div className="cartao-simples border-dashed text-center px-5 py-8">
                  <CalendarDaysIcon size={26} className="mx-auto text-white/25 mb-2.5" />
                  <p className="font-display font-extrabold text-sm text-white">Sem eventos neste dia.</p>
                  <p className="text-[11px] text-white/62 mt-1.5">
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
          {/* O que a lista está a mostrar, dito por extenso. A Agenda abre em
              "Por realizar" e o passado fica de fora: sem esta linha, quem
              procura o jogo do mês passado não tem como saber que ele existe
              — o filtro está atrás do funil e não se vê. */}
          {(eventosDaLista.length > 0 || eventosPorConvocar.length > 0) && (
            <div className="flex items-center gap-2">
              <EtiquetaSeccao className="flex-1">{ROTULOS_ESTADO[statusFilter]}</EtiquetaSeccao>
              {statusFilter === ESTADO_POR_OMISSAO && haRealizados && (
                <button
                  type="button"
                  onClick={() => { triggerHaptic('selection'); setStatusFilter('past') }}
                  className="flex-none min-h-11 -my-2 px-2 font-display font-bold text-[11px] text-csc-gold cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-xl"
                >
                  Ver realizados
                </button>
              )}
            </div>
          )}

          {eventosPorConvocar.map(event => renderCartaoPorConvocar(event))}

          {eventosDaLista.length === 0 && eventosPorConvocar.length === 0 ? (
            /*
              Dois vazios diferentes, e a diferença importa: com filtro posto o
              que falta é tirá-lo; sem filtro nenhum não há mesmo nada marcado,
              e é o ecrã 11b — a frase que diz que o próximo evento aparece
              aqui, mais os aniversários do mês para a página não ficar em
              branco.
            */
            temFiltros ? (
              <div className="cartao-simples border-dashed text-center px-5 py-10">
                <CalendarRange size={32} className="mx-auto text-white/25 mb-2.5" />
                <p className="font-display font-extrabold text-sm text-white">Nenhum evento encontrado.</p>
                <p className="text-[11px] text-white/62 mt-1.5">Limpa os filtros para ver o resto da agenda.</p>
              </div>
            ) : haRealizados ? (
              /*
                Nada por realizar, mas a época tem jogos feitos — o vazio de
                fora de época. Dizer "Nada marcado ainda" aqui era mentira, e
                deixava o histórico sem porta de entrada.
              */
              <div className="cartao-simples border-dashed text-center px-5 py-10">
                <CalendarRange size={32} className="mx-auto text-white/25 mb-2.5" />
                <p className="font-display font-extrabold text-sm text-white">Nada por realizar.</p>
                <p className="text-[11px] leading-relaxed text-white/62 mt-1.5">
                  Não há nada marcado para os próximos dias. O que já se jogou continua na agenda.
                </p>
                <button
                  type="button"
                  onClick={() => { triggerHaptic('selection'); setStatusFilter('past') }}
                  className="mt-3.5 min-h-11 px-4 rounded-[22px] bg-csc-gold text-csc-tinta font-display font-bold text-[13px] cursor-pointer
                    transition-transform duration-150 active:scale-97
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                >
                  Ver os realizados
                </button>
              </div>
            ) : (
              <>
                <div className="cartao-vidro text-center px-5 py-10">
                  <CalendarRange size={32} className="mx-auto text-white/25 mb-2.5" />
                  <p className="font-display font-extrabold text-sm text-white">Nada marcado ainda</p>
                  <p className="text-[11px] leading-relaxed text-white/62 mt-1.5">
                    O próximo jogo ou treino aparece aqui assim que a equipa técnica o criar.
                    Recebes aviso quando houver convocatória.
                  </p>
                </div>
                <AniversariosDoMes mes={currentDate.getMonth()} />
              </>
            )
          ) : (
            eventosDaLista.map((event) => renderEventCard(event))
          )}
        </div>
        </>
      )}
      </div>

      {/*
        O tipo de evento e o estado. Fora do ecrã porque o handoff quer a
        Agenda limpa, mas a um toque porque a app tem eventos que chegam para
        os tornar necessários.
      */}
      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Filtrar a agenda"
        description="Tipo de evento e estado"
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
              onClick={() => { setSearchQuery(''); setStatusFilter(ESTADO_POR_OMISSAO); setTypeFilter('all') }}
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
          <div>
            <p className="font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-2">
              Tipo de evento
            </p>
            <div className="flex flex-wrap gap-2">
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
                >
                  {etiqueta}
                </Pastilha>
              ))}
            </div>
          </div>

          <div>
            <p className="font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-2">
              Estado
            </p>
            <div className="flex flex-wrap gap-2">
              {/* "Por realizar" à cabeça: é onde a Agenda abre. */}
              {(['upcoming', 'past', 'all', 'my_confirmed', 'my_pending', 'my_declined', 'my_called'] as const).map(valor => (
                <Pastilha
                  key={valor}
                  ativa={statusFilter === valor}
                  onClick={() => { triggerHaptic('selection'); setStatusFilter(valor) }}
                >
                  {ROTULOS_ESTADO[valor]}
                </Pastilha>
              ))}
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Modal Detalhes Evento & Convocatória (persiana partilhada).
          A condição usa só `selectedEvent` (nunca voltar a null ao fechar) — a
          persiana abre e fecha pelo endereço, e o conteúdo fica retido para ela
          poder deslizar para fora em vez de desaparecer de repente. */}
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
                      title="Convocatória anterior (ou desliza para a direita)"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-2 select-none min-w-0">
                      <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                        <span>Convocatória pendente</span>
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
                {/* A mesma pastilha do cartão da Agenda, com a cor de `CORES_TIPO`.
                    Aqui o jogo era dourado — a cor da moldura — e o cartão da
                    lista tinha-o em vermelho: o mesmo jogo mudava de cor conforme
                    o ecrã em que se estava. */}
                {(() => {
                  const cores = CORES_TIPO[selectedEvent.type]
                  const Icone = selectedEvent.type === 'match'
                    ? Trophy
                    : selectedEvent.type === 'practice' ? TrainingIcon : PartyPopper
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-[11px] border
                        font-display font-black text-[9.5px] uppercase tracking-widest ${cores.texto} ${cores.pastilha}`}
                    >
                      <Icone size={12} />
                      {selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio'}
                    </span>
                  )
                })()}

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
                      <>{formatOpponentSigla(selectedEvent.opponent)} <span className="text-white/62 text-xl">vs</span> {formatClubSigla(clubSettings?.initials)}</>
                    ) : (
                      <>{formatClubSigla(clubSettings?.initials)} <span className="text-white/62 text-xl">vs</span> {formatOpponentSigla(selectedEvent.opponent)}</>
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
                          <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-white/55">
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
                      <p className="font-display font-bold text-[9.5px] tracking-[0.16em] uppercase text-csc-gold">
                        {selectedEvent.type === 'match' ? 'Pontapé de saída' : 'Início'}
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
                        <MapPin size={15} className="text-csc-gold shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-display font-bold text-xs text-white truncate">
                            {nome || 'Sem local definido'}
                          </span>
                          {morada && (
                            <span className="block text-[11px] leading-snug text-white/60 truncate">{morada}</span>
                          )}
                        </span>
                        <ExternalLink size={14} className="text-white/62 shrink-0" />
                      </a>
                    )
                  })()}
                </div>

                {/* Observações / Descrição (diretamente acima da confirmação) */}
                {(() => {
                  const clean = parseMatchReportMetadata(selectedEvent.description).cleanDescription
                  if (!clean) return null
                  return (
                    /* Sem o rótulo a negrito: nos outros cartões a nota da equipa
                       técnica é uma banda de texto, e "Observações & Informações:"
                       pesava mais do que o que vinha a seguir. */
                    <div className="cartao-simples px-4 py-3">
                      <p className="text-[11.5px] leading-relaxed text-white/70 whitespace-pre-line">{clean}</p>
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

                  const fechada = convocatoriaFechada(
                    selectedEvent,
                    (eventCallups[selectedEvent.id] || []).length > 0,
                  )

                  return (
                    <div className={!fechada ? 'rounded-2xl overflow-hidden shadow-lg shadow-black/20' : 'p-4 bg-white/[0.07] rounded-2xl space-y-3 border border-white/10 border-t-white/20 shadow-md shadow-black/20'}>
                      {!fechada ? (
                        // Barra de ação dourada, de bordo a bordo — a mesma linguagem do cartão da Home.
                        // Mostra-se sempre que ainda dá para responder, mesmo que já tenha respondido antes —
                        // até à hora de concentração o jogador pode sempre mudar de ideias.
                        <div className="bg-csc-gold/13 border border-csc-gold/24 px-4 py-3.5 flex flex-col items-center justify-center gap-2.5">
                          <span className="font-display font-extrabold text-[14px] text-white">
                            {myCallup.status === 'called' ? 'Contamos contigo?' :
                              myCallup.status === 'confirmed' ? 'Contamos contigo.' : 'Ficas de fora.'}
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
                              Sim, vou
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
                              Não posso
                            </button>
                          </div>
                          {myCallup.status !== 'called' && (
                            <span className="text-[10.5px] text-white/62">Toca no outro botão para mudar de resposta.</span>
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
                                {myCallup.status === 'confirmed' ? 'Disseste que sim' :
                                 myCallup.status === 'declined' ? 'Disseste que não' : 'Aguarda a tua resposta'}
                              </span>
                            </p>
                          </div>
                          <div className="p-3 bg-white/10 rounded-xl text-xs text-white/70 font-medium">
                            {textoConvocatoriaFechada(fechada, selectedEvent)}.
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* COLUNA DIREITA (7 Colunas): Convocatória Completa, Filtros Interativos e Gestão */}
              {(() => {
                /*
                  A convocatória é o que está em `callups`, e mais nada.

                  Havia aqui um filtro por elegibilidade que escondia da lista
                  — e das contagens — quem tivesse ficado lesionado ou inativo
                  **depois** de ser convocado. Consequências, todas medidas em
                  produção no jogo de 12/09: a Agenda dizia "22 convocados" e
                  esta persiana dizia 19; os 3 lesionados não apareciam, e por
                  isso não havia como os tirar da convocatória; e a recusa de um
                  deles desaparecia das contas — uma resposta a menos numa base
                  que tem nove ao todo.

                  Ficam à vista, marcados com o seu estado. Tirá-los é decisão
                  da equipa técnica, não do filtro: um lesionado pode continuar
                  convocado para um convívio, ou o treinador pode querer
                  esperar pela alta.
                */
                const callups = eventCallups[selectedEvent.id] || []

                /** `null` se está disponível; senão o estado que o impede. */
                const estadoQueImpede = (c: CallupWithPlayer): string | null => {
                  const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                  if (!p || isPlayerEligible(p, selectedEvent.type)) return null
                  if (p.status === 'inactive') return 'Inativo'
                  if (p.status === 'injured') return 'Lesionado'
                  // Apto, mas sem o papel de atleta: só entra em convívios.
                  return 'Não é atleta'
                }
                const indisponiveis = callups.filter(c => estadoQueImpede(c) !== null)

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
                    <button
                      type="button"
                      onClick={() => setIsModalCallupsExpanded(prev => !prev)}
                      aria-expanded={isModalCallupsExpanded}
                      className="w-full min-h-11 flex items-center justify-between cursor-pointer select-none group text-left
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold rounded-xl"
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
                          {indisponiveis.length > 0 && (
                            <span className="text-[10.5px] font-bold text-csc-vermelho-texto bg-csc-red/18 border border-csc-red/35 px-2 py-0.5 rounded-md">
                              {indisponiveis.length} sem condições
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* O `hidden sm:inline` que aqui estava nunca mostrava
                            nada: os pontos de corte estão desligados no
                            `@theme`, e o botão ficava só com a seta. */}
                        <span className="text-xs font-bold text-white/70 group-hover:text-white">
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
                    </button>

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

                        {/*
                          A convocatória envelhece: quem foi chamado apto pode
                          ficar lesionado ou ser desativado antes do jogo. Não
                          se corrige sozinha — apagar linhas por trás das costas
                          da equipa técnica apagaria também as respostas já
                          dadas —, mas tem de se poder atualizar num toque.
                        */}
                        {isCoachOrAdmin && indisponiveis.length > 0 && (
                          <div className="rounded-2xl bg-csc-red/12 border border-csc-red/30 p-3.5 flex items-center gap-3">
                            <span className="min-w-0 flex-1">
                              <span className="block font-display font-extrabold text-[12px] text-csc-vermelho-texto">
                                {indisponiveis.length === 1
                                  ? '1 convocado sem condições'
                                  : `${indisponiveis.length} convocados sem condições`}
                              </span>
                              <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">
                                Ficaram lesionados ou inativos depois de serem convocados. Continuam na
                                lista até decidires.
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('medium')
                                setConfirmModalConfig({
                                  isOpen: true,
                                  title: 'Atualizar a convocatória',
                                  description:
                                    indisponiveis.length === 1
                                      ? 'Tirar da convocatória o convocado que já não tem condições para este evento?'
                                      : `Tirar da convocatória os ${indisponiveis.length} convocados que já não têm condições para este evento?`,
                                  confirmText: 'Sim, tirar',
                                  cancelText: 'Cancelar',
                                  variant: 'danger',
                                  onConfirm: async () => {
                                    setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
                                    try {
                                      const { error } = await supabase
                                        .from('callups')
                                        .delete()
                                        .in('id', indisponiveis.map(c => c.id))
                                      if (error) throw error
                                      setEventCallups(prev => ({
                                        ...prev,
                                        [selectedEvent.id]: (prev[selectedEvent.id] || []).filter(
                                          c => !indisponiveis.some(i => i.id === c.id),
                                        ),
                                      }))
                                      toast.info(
                                        indisponiveis.length === 1
                                          ? 'Convocado retirado da convocatória.'
                                          : `${indisponiveis.length} convocados retirados da convocatória.`,
                                      )
                                    } catch (err: any) {
                                      toast.error('Erro ao atualizar a convocatória: ' + err.message)
                                    }
                                  },
                                })
                              }}
                              className="flex-none min-h-11 px-3.5 rounded-[18px] bg-csc-red/20 border border-csc-red/45
                                text-csc-vermelho-texto font-display font-bold text-[12px] cursor-pointer
                                transition-transform duration-150 active:scale-97
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                            >
                              Tirar
                            </button>
                          </div>
                        )}

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
                                  onOpen={isCoachOrAdmin ? () => setConvocadoAberto(c.id) : undefined}
                                  impedimento={estadoQueImpede(c)}
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

                <p className="text-[10px] leading-snug text-white/62 mt-2.5">
                  Com ficha de jogo lançada, o evento fecha: deixa de ser editável e a convocatória
                  não aceita respostas.
                </p>
              </div>
            )}
          </div>
        </VistaDetalhe>
      )}

      {/*
        A ficha rápida do convocado (4a), empilhada por cima da persiana do
        evento — o `useModalA11y` trata da pilha. Fica fora da `VistaDetalhe`
        para não ser desmontada quando ela anima a saída.
      */}
      {selectedEvent && (() => {
        const tira = (eventCallups[selectedEvent.id] || []) as CallupWithPlayer[]
        const aberta = tira.find(c => c.id === convocadoAberto) ?? null
        return (
          <FichaConvocado
            convocatoria={aberta}
            tira={tira}
            displayName={aberta ? getPlayerDisplayName(aberta.player) : ''}
            aoEscolher={setConvocadoAberto}
            aoFechar={() => setConvocadoAberto(null)}
            aoConfirmar={() => aberta && handleUpdateCallupStatus(aberta.id, selectedEvent.id, 'confirmed')}
            aoRecusar={() => aberta && handleUpdateCallupStatus(aberta.id, selectedEvent.id, 'declined')}
            aoRemover={() => {
              if (!aberta) return
              handleRemovePlayerFromCallup(aberta.id, selectedEvent.id)
              setConvocadoAberto(null)
            }}
          />
        )
      })()}
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
                      <span>{editType === 'match' ? 'Jogo' : editType === 'practice' ? 'Treino' : 'Convívio'}</span>
                    </span>
                    <span className="text-[10px] font-bold text-white/70 bg-white/10 px-2 py-0.5 rounded-md">
                      Tipo bloqueado
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
                          if (e.target.checked) { setEditTournamentId(''); setEditMatchday('') }
                        }}
                        className="h-4 w-4 accent-csc-gold rounded cursor-pointer"
                      />
                      <label htmlFor="editIsFriendly" className="ml-2 text-sm font-semibold text-white/80 cursor-pointer">
                        Jogo Amigável
                      </label>
                    </div>
                    {!editIsFriendly && (
                      <div className="animate-fade-in flex gap-2.5">
                        <div className="flex-1 min-w-0">
                          <label className={ETIQUETA_FORM} htmlFor="agenda-prova">Torneio / Competição</label>
                          <select
                            id="agenda-prova"
                            value={editTournamentId}
                            onChange={(e) => setEditTournamentId(e.target.value)}
                            className={CAMPO_FORM}
                          >
                            <option value="">-- Selecionar Torneio --</option>
                            {tournaments.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.season ? `(${t.season})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        {editTournamentId && (
                          <div className="w-[96px] flex-none">
                            <label className={ETIQUETA_FORM} htmlFor="agenda-jornada">Jornada *</label>
                            <input
                              id="agenda-jornada"
                              type="number"
                              min="1"
                              inputMode="numeric"
                              value={editMatchday}
                              onChange={e => setEditMatchday(e.target.value)}
                              placeholder="1"
                              className={CAMPO_FORM}
                            />
                          </div>
                        )}
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
                          <option value="__new__" className="font-bold text-csc-gold bg-csc-gold/10">Criar novo adversário…</option>
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
                          <option value="home">Casa</option>
                          <option value="away">Fora</option>
                          <option value="neutral">Campo neutro</option>
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
                        {(() => {
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
                        <span>Campo / Instalação *</span>
                        {editLocation && (
                          <span className="text-[10px] text-csc-verde-texto font-bold bg-csc-light/15 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                            {editLocation}
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
                      <option value="__new__" className="font-bold text-csc-gold bg-csc-gold/10">Criar novo campo…</option>
                      {fields.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.address ? `(${f.address})` : ''}
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
                          <span>Todos ({editUncalledPlayers.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditAddOnlyPlayers}
                          disabled={editUncalledPlayers.filter(p => p.role === 'player' || !['coach', 'admin'].includes(p.role)).length === 0 || isEditBatchCalling}
                          className="min-h-11 px-3 bg-csc-light/15 hover:bg-csc-light/25 text-csc-verde-texto border border-csc-light/35 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>Jogadores</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditAddStaff}
                          disabled={editUncalledPlayers.filter(p => ['coach', 'admin'].includes(p.role)).length === 0 || isEditBatchCalling}
                          className="min-h-11 px-3 bg-csc-blue/20 hover:bg-csc-blue/30 text-csc-azul-texto border border-csc-blue/40 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>Staff</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleEditRemoveAll}
                          disabled={currentCallups.length === 0 || isEditBatchCalling}
                          className="min-h-11 px-3 bg-csc-red/15 hover:bg-csc-red/25 text-csc-vermelho-texto border border-csc-red/25 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40 shadow-2xs"
                        >
                          <span>Limpar</span>
                        </button>
                      </div>

                      {/* Barra de Pesquisa de Membros */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-2.5 text-white/62" />
                        <input
                          type="text"
                          value={editPlayerSearchTerm}
                          onChange={(e) => setEditPlayerSearchTerm(e.target.value)}
                          placeholder="Pesquisar por nome na camisola ou nº..."
                          className={`${CAMPO_FORM} pl-9`}
                        />
                      </div>

                      {/* Lista Selecionável Um a Um */}
                      <div className="grid grid-cols-1 gap-2 max-h-[380px] overflow-y-auto p-1.5 bg-white/5 border border-white/12 rounded-xl">
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
                                  ? 'bg-csc-red/10 border-csc-red/25 text-csc-vermelho-texto opacity-60 cursor-not-allowed'
                                  : isCalled 
                                    ? 'bg-csc-gold/10 font-black text-white border-csc-gold/35 shadow-2xs' 
                                    : 'bg-white/6 border-white/12 text-white/80 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isCalled}
                                  disabled={!isEligible}
                                  onChange={() => {}}
                                  className="h-4 w-4 text-csc-dark rounded border-white/15 pointer-events-none shrink-0"
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
                                          r === 'admin' ? 'bg-csc-gold/15 text-csc-gold' :
                                          r === 'coach' ? 'bg-csc-blue/20 text-csc-azul-texto' :
                                          'bg-csc-light/15 text-csc-verde-texto'
                                        }`}
                                      >
                                        {r === 'admin' ? 'Admin' : r === 'coach' ? 'Treinador' : 'Jogador'}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {p.status === 'injured' && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-csc-red/15 text-csc-vermelho-texto shrink-0 ml-1">
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

              {/* Rascunho: quem edita a partir da Agenda também tem de o poder
                  publicar ou voltar a guardar sem avisar ninguém. */}
              <div className="col-span-full">
                <label
                  htmlFor="editIsActive"
                  className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer min-h-14"
                >
                  <input
                    type="checkbox"
                    id="editIsActive"
                    checked={!editIsActive}
                    onChange={e => setEditIsActive(!e.target.checked)}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-csc-gold cursor-pointer"
                  />
                  <span className="min-w-0">
                    <span className="block font-display font-bold text-[12.5px] text-white">
                      Guardar como rascunho
                    </span>
                    <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">
                      Fica só para a equipa técnica: não aparece na Agenda de quem não gere, não
                      aceita respostas à convocatória e não entra no alerta da Home.
                    </span>
                  </span>
                </label>
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
        onClose={fecharQuickFieldModal}
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
        onClose={fecharQuickOppModal}
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
      <UnsavedChangesModal {...guardaEdicao.props} />

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
