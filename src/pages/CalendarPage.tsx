import React, { useEffect, useRef, useState } from 'react'
import {
  MapPin,
  Users,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  PartyPopper,
  Trophy,
  Pencil
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useVoltarDaFicha } from '../hooks/useVoltarDaFicha'
import { nomeDoEcra } from '../lib/rotas'
import type { Profile } from '../context/AuthContext'
import { TrainingIcon } from './EventsPage'
import { EcraDetalhe } from '../components/EcraDetalhe'
import { ConfirmModal } from '../components/ConfirmModal'
import { parseMatchReportMetadata } from '../components/MatchReportModal'
import { BlocoConvocatoria } from '../components/callups/BlocoConvocatoria'
import { ProcuraEFiltros } from '../components/ProcuraEFiltros'
import { AniversariosDoMes } from '../components/AniversariosDoMes'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { BottomSheet } from '../components/BottomSheet'
import { CabecalhoEcra, Pastilha, Botao, EtiquetaSeccao, ACarregar, EstadoVazio } from '../components/ui'
import { SlidersHorizontal, Shield } from 'lucide-react'
import { formatClubSigla, formatOpponentSigla } from '../lib/siglas'
import { compararPorCamisola, convocatoriaFechada, textoConvocatoriaFechada, textoPrazoResposta, formatDataCurta, localDoEvento, CORES_TIPO } from '../lib/eventos'
import { mensagemDeErro } from '../lib/erros'
import { CLASSE_ETIQUETA_CAMPO as ETIQUETA_FILTRO } from '../components/ui/formulario'

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
 * Campo branco dos formulários de evento (ecrã 2e) — 46px, como no handoff.
 * É o mesmo desenho dos campos do Perfil, dois pixels mais alto porque aqui
 * há menos campos por ecrã e mais dedo a preencher.
 */

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
  // Por ordem alfabética do nome da camisola, como todas as listas de atletas.
  return [...remoteProfiles].sort(compararPorCamisola)
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

/*
  Quem pode ser convocado para um evento. Fora do componente porque não
  depende de estado nenhum — e porque é usado a carregar a Agenda, antes de
  onde estava declarado.
*/
const isPlayerEligible = (player: Profile, eventType: string) => {
  if (player.status === 'inactive') return false
  if (eventType === 'gathering') return true
  // Jogos e treinos são só para quem tem o papel de Jogador — membros só
  // Treinador ou só Direção ficam disponíveis apenas nos convívios.
  if (!extractRolesFromProfile(player).includes('player')) return false
  return player.status === 'active'
}

const CalendarPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  /*
    O detalhe do evento **não tem estado de aberto/fechado**: quem manda é o
    endereço. Tinha, sincronizado do `?event=` por um efeito, e era daí que
    vinha a falha do retroceder do browser — o efeito dependia do objeto dos
    parâmetros, e quando a identidade dele não mudava não corria: o endereço
    perdia o `?event=` e o detalhe ficava aberto por cima da lista.

    Derivado durante o render não há nada a sincronizar, e o retroceder volta
    sempre à agenda.
  */
  const isEventSheetOpen = Boolean(searchParams.get('event'))
  const [loading, setLoading] = useState(true)

  // Calendar View States
  // A pesquisa e o filtro de estado não estão à vista (ver o cabeçalho): vivem
  // numa persiana, e o cabeçalho diz quando estão a filtrar alguma coisa.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [typeFilter, setTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'past' | 'my_confirmed' | 'my_declined' | 'my_pending' | 'my_called'>(ESTADO_POR_OMISSAO)

  // Callups state
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])

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
  
  // O gesto horizontal do detalhe do evento: deslizar entre convocatórias
  // pendentes no carrossel do topo.
  const carouselDragRef = React.useRef<{ startX: number; startY: number; lastDeltaX: number; lastDeltaY: number } | null>(null)

  // Ver um evento é navegar: o endereço passa a ter ?event=<id>, portanto o
  // detalhe tem link próprio e o botão de retroceder do browser volta à agenda.
  const abrirEvento = (ev: Event) => {
    setSelectedEvent(ev)
    setSearchParams({ event: ev.id })
  }

  const voltaDoEvento = useVoltarDaFicha(['event'], 'Agenda')
  const handleCloseEventModal = () => {
    // `selectedEvent` fica retido; o que fecha o detalhe é o endereço.
    voltaDoEvento.aoVoltar()
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
          window.scrollTo(0, 0)
        } else if (lastDeltaX > 40) {
          // Slide para a Direita (Retroceder para o Evento Pendente Anterior)
          const prevIdx = (activeIdx - 1 + myPendingEvents.length) % myPendingEvents.length
          setSelectedEvent(myPendingEvents[prevIdx])
          window.scrollTo(0, 0)
        }
      }
    }
  }

  /**
   * O mesmo que `getEventLocation`, mas com o nome e a morada separados —
   * é assim que o cartão os desenha, um por linha, como no cartão do jogo da
   * Home. A precedência é a mesma: um local escrito à mão ganha ao campo.
   */
  const getEventLocationParts = (
    ev: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null | undefined,
  ): { nome: string; morada: string } => localDoEvento(ev, fields)

  /* A consulta que vai para o Google Maps. Segue a mesma precedência do resto
     — o campo ganha ao local escrito à mão —, senão o cartão dizia um sítio e
     o mapa abria noutro. */
  const getEventLocation = (ev: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null | undefined) => {
    const { nome, morada } = localDoEvento(ev, fields)
    if (!nome) return ''
    return morada ? `${nome} (${morada})` : nome
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

      const [evRes, callupsRes, myCallupsRes, profilesRes, fieldsRes] = await Promise.all([
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
      ])

      if (fieldsRes.data) {
        setFields(fieldsRes.data as Field[])
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

        const eventsList = (evRes.data as Event[]) || []
        const practiceEventIds = new Set(eventsList.filter(e => e.type === 'practice').map(e => e.id))

        const map: Record<string, CallupWithPlayer[]> = {}
        uniqueCallups.forEach((c: any) => {
          /* A convocatória traz `player_id`, que é a chave estrangeira para a
             ficha. Havia aqui um recurso ao email e ao nome quando o id não
             estivesse no plantel carregado — e com homónimos colava a ficha
             errada, incluindo o estado clínico que a linha seguinte lê. */
          const fullP = playerMap.get(c.player_id) || c.player

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

        // Para treinos: garantir que todos os atletas aptos estão convocados.
        // Atletas, pela regra do `isPlayerEligible`: o treinador e a direção
        // que não jogam apareciam aqui como convocados de todos os treinos.
        const activePlayers = mergedPlayers.filter(p => isPlayerEligible(p, 'practice'))
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
      toast.error('Erro ao atualizar resposta: ' + mensagemDeErro(err))
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
  /**
   * A minha convocatória para um evento.
   *
   * **A identidade é o `id`, e mais nada.** Isto aceitava também uma
   * convocatória cujo atleta tivesse o meu nome ou o meu email — dois sócios
   * com o mesmo nome respondiam um pela convocatória do outro, e o
   * `profiles.email` é escrevível pelo próprio, por isso não prova identidade
   * nenhuma (é a mesma lição que tirou o telefone e o nome da associação de
   * conta a ficha). Não era um buraco de segurança, porque a RLS recusa a
   * escrita numa linha que não é da pessoa — era pior de outra maneira: a app
   * mostrava a convocatória de outro como sendo minha, e responder não fazia
   * nada.
   *
   * O `player_id` referencia `profiles.id`, que é o `auth.uid()`. Chega.
   *
   * O que fica é o **auto-convocado**: num treino ou convívio, quem está apto
   * conta como chamado mesmo sem linha em `callups` — é a convocatória
   * automática dos aptos, e não uma forma de descobrir quem eu sou.
   */
  const getMyCallupForEvent = (eventId: string): CallupWithPlayer | null => {
    if (!profile) return null
    const callups = eventCallups[eventId] || []

    const minha = callups.find(c => c.player_id === profile.id || c.player?.id === profile.id)
    if (minha) return minha

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
        className="cartao-simples overflow-hidden border-csc-gold/35 cursor-pointer
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
                bg-white/10 text-white/70 shrink-0"
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
            state={{ origem: nomeDoEcra(location.pathname, location.search) }}
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
    /*
      A minha convocatória, pela regra única do `getMyCallupForEvent`.

      Havia aqui uma segunda regra, mais larga: se eu não estivesse na
      convocatória, inventava-se-me uma sempre que eu fosse **jogador**, fosse
      qual fosse o evento. Num treino isso é a regra do clube — convocam-se
      todos os aptos —, mas num **jogo** dava a qualquer jogador a pergunta
      "Contamos contigo?" sem a equipa técnica o ter chamado, e responder
      inscrevia-o na convocatória. Quem escolhe quem joga é quem treina.
    */
    const myCallup = getMyCallupForEvent(event.id)
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
        className="cartao-simples text-white overflow-hidden cursor-pointer flex flex-col justify-between transition-transform duration-150 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
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
                px-2.5 py-1 rounded-full ${cores.texto} ${cores.pastilha}`}
            >
              <TipoIcon size={13} />
              <span>{isMatch ? 'Jogo' : isPractice ? 'Treino' : 'Convívio'}</span>
            </span>

            {/* Só chega aqui a quem gere: os rascunhos são filtrados antes. */}
            {event.is_active === false && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/12 text-white/75 uppercase tracking-wider">
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
                className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                  confirmedCount > 0
                    ? 'bg-csc-light/16 text-csc-verde-texto'
                    : 'bg-csc-gold/16 text-csc-gold'
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
                      {/*
                        Ao lado da pergunta, o atleta lia a contagem de
                        confirmados — e numa base com 0,7% de respostas isso é
                        "0 confirmados" colado a "Contamos contigo?": a prova
                        de que ninguém responde, no momento em que se pede que
                        responda. A contagem é de quem gere, como já era nas
                        pastilhas do cabeçalho deste cartão; a ele dá-se o que
                        lhe falta e a app sempre soube, que é o prazo.
                      */}
                      <span className="text-[11px] text-white/70 flex-none">
                        {isCoachOrAdmin
                          ? `${confirmedCount} ${confirmedCount === 1 ? 'confirmado' : 'confirmados'}`
                          : textoPrazoResposta(event)}
                      </span>
                    </div>
                    <div className="flex gap-2.5 mt-3">
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'confirmed')}
                        aria-pressed={myCallup.status === 'confirmed'}
                        className={`flex-1 h-11 rounded-[22px] font-display font-bold text-[13px] cursor-pointer
                          flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                            myCallup.status === 'confirmed'
                              ? 'bg-csc-light text-csc-tinta'
                              : 'bg-white/9 text-white'
                          }`}
                      >
                        {myCallup.status === 'confirmed' && <CheckCircle2 size={14} />}
                        Sim, vou
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCallupResponse(event.id, 'declined')}
                        aria-pressed={myCallup.status === 'declined'}
                        className={`flex-1 h-11 rounded-[22px] font-display font-bold text-[13px] cursor-pointer
                          flex items-center justify-center gap-1.5 transition-transform duration-150 active:scale-97
                          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                            myCallup.status === 'declined'
                              ? 'bg-white/90 text-csc-tinta'
                              : 'bg-white/9 text-white'
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

  /**
   * O que está escondido na persiana de filtros. Um filtro que não se vê é um
   * filtro que se esquece — e depois a agenda parece vazia sem razão —, por
   * isso o cabeçalho acende e uma linha por baixo diz o que está a filtrar.
   * As pastilhas de tipo não entram: essas estão à vista.
   */
  const temFiltros =
    searchQuery.trim() !== '' || statusFilter !== ESTADO_POR_OMISSAO || typeFilter !== 'all'

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
      />

      {/*
        **Procura à vista, tudo o resto atrás do funil** — a mesma forma em
        todos os ecrãs de lista da app.

        As pastilhas do tipo de evento estavam aqui fora, e as Fichas de Jogo
        e as Estatísticas escondiam o filtro equivalente: o mesmo filtro
        tratado de duas maneiras conforme o ecrã. Uma pastilha à vista é
        navegação; o que filtra fica atrás do funil.
      */}
      <ProcuraEFiltros
        procura={searchQuery}
        aoProcurar={setSearchQuery}
        placeholder="Título, adversário ou local"
        rotulo="Procurar na agenda"
        aoAbrirFiltros={() => setFiltrosAbertos(true)}
        filtrosAtivos={statusFilter !== ESTADO_POR_OMISSAO || typeFilter !== 'all'}
        resumo={[
          statusFilter !== ESTADO_POR_OMISSAO ? ROTULOS_ESTADO[statusFilter] : null,
          typeFilter !== 'all' ? ROTULOS_TIPO[typeFilter] : null,
        ].filter((x): x is string => Boolean(x))}
        contagem={`${filteredEvents.length} ${filteredEvents.length === 1 ? 'evento' : 'eventos'}`}
        aoLimpar={() => { setSearchQuery(''); setStatusFilter(ESTADO_POR_OMISSAO); setTypeFilter('all') }}
      />

      {loading ? (
        <ACarregar />
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
            data-cartao="calendario"
            className="cartao-simples px-3 pt-3.5 pb-3"
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
                className="h-11 min-w-0 flex-1 px-2.5 rounded-[18px] bg-white/8 text-white font-display font-bold text-[11px]
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
                className="h-11 min-w-0 flex-none px-2.5 rounded-[18px] bg-white/8 text-white font-display font-bold text-[11px]
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
                  className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/75 cursor-pointer
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
                  className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white/75 cursor-pointer
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
          <div className="space-y-3">
            {/*
              Com a agenda toda vazia (ecrã 11b) este painel calava-se: dizia
              "Sem eventos neste dia" logo por cima de "Nada marcado ainda", e
              duas mensagens de vazio seguidas leem-se como uma avaria. O
              painel do dia só faz sentido quando há eventos noutros dias.
            */}
            {/*
              **Um dia sem eventos não desenha nada.**

              Este painel dizia "Sem eventos neste dia" e ocupava 160px logo
              abaixo do calendário — e, como a Agenda abre no dia de hoje e o
              clube tem 52 eventos por época, essa era a primeira frase do ecrã
              em quase todos os dias do ano. Medido: com ele, nenhum pixel de
              nenhum evento ficava acima da dobra num telemóvel de 727px.

              É também uma resposta a uma pergunta que ninguém fez: o dia não
              foi escolhido, foi o de hoje. Quem toca num dia à espera de
              eventos vê a lista aparecer; quem não toca não precisa de ser
              informado de um vazio. A lista completa vem logo por baixo.
            */}
            {selectedDate && selectedDayEvents.length > 0 && (
              <div className="space-y-3">
                {selectedDayEvents.map(event => renderEventCard(event))}
              </div>
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
              <EstadoVazio icone={CalendarRange} titulo="Nenhum evento encontrado." texto="Limpa os filtros para ver o resto da agenda." />
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
                <div className="cartao-simples text-center px-5 py-10">
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
            <p className={ETIQUETA_FILTRO}>
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
            <p className={ETIQUETA_FILTRO}>
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

      {/* O detalhe do evento é um ecrã, não uma persiana — ver `EcraDetalhe`.
          Continua no endereço (`?event=`). A ficha de jogo abre a partir
          dele, como o ecrã seguinte. */}
      <div>
      {selectedEvent && (
        <EcraDetalhe
          aberto={isEventSheetOpen}
          voltarPara={voltaDoEvento.voltarPara}
          aoVoltar={handleCloseEventModal}
          sobrancelha="Evento"
          titulo={
            selectedEvent.type === 'match' && selectedEvent.opponent
              ? selectedEvent.home_away === 'away'
                ? `${formatOpponentSigla(selectedEvent.opponent)} vs ${formatClubSigla(clubSettings?.initials)}`
                : `${formatClubSigla(clubSettings?.initials)} vs ${formatOpponentSigla(selectedEvent.opponent)}`
              : selectedEvent.title
                || (selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio')
          }
          legenda={new Date(selectedEvent.date_time).toLocaleDateString('pt-PT', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        >
          {/* O gesto horizontal entre convocatórias por responder: era do
              conteúdo da persiana, passou a ser do ecrã. */}
          <div
            className="space-y-4 select-none"
            onTouchStart={handleCarouselTouchStart}
            onTouchMove={handleCarouselTouchMove}
            onTouchEnd={handleCarouselTouchEnd}
          >
            {/* O tipo, o amigável e a casa/fora: pastilhas soltas por baixo do
                título, sem cartão à volta — era um cartão só para elas. */}
            <div className="text-white relative space-y-2.5">
              
              {/* Barra Integrada de Convocatórias Pendentes (Apenas se existirem múltiplos eventos pendentes) */}
              {myPendingEvents.length > 1 && myPendingEvents.some(pe => pe.id === selectedEvent.id) && (() => {
                const curIdx = myPendingEvents.findIndex(pe => pe.id === selectedEvent.id)
                const activeIndex = curIdx !== -1 ? curIdx : 0

                const nextEvent = (e?: React.MouseEvent) => {
                  e?.stopPropagation()
                  const nextIdx = (activeIndex + 1) % myPendingEvents.length
                  setSelectedEvent(myPendingEvents[nextIdx])
                  window.scrollTo(0, 0)
                }

                const prevEvent = (e?: React.MouseEvent) => {
                  e?.stopPropagation()
                  const prevIdx = (activeIndex - 1 + myPendingEvents.length) % myPendingEvents.length
                  setSelectedEvent(myPendingEvents[prevIdx])
                  window.scrollTo(0, 0)
                }

                return (
                  <div className="bg-black/25 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={prevEvent}
                      className="w-11 h-11 rounded-full flex items-center justify-center transition-transform duration-150 cursor-pointer active:scale-97 shrink-0 bg-white/10 text-white
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                      aria-label="Convocatória anterior"
                      title="Convocatória anterior (ou desliza para a direita)"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="flex items-center gap-2 select-none min-w-0">
                      <span className="text-xs font-black text-csc-gold flex items-center gap-1.5">
                        <span>Por responder</span>
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-white/20 text-white tracking-wider">
                          {activeIndex + 1}/{myPendingEvents.length}
                        </span>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={nextEvent}
                      className="w-11 h-11 rounded-full flex items-center justify-center transition-transform duration-150 cursor-pointer active:scale-97 shrink-0 bg-white/10 text-white
                        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                      aria-label="Convocatória seguinte"
                      title="Convocatória seguinte (ou desliza para a esquerda)"
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
                  <span className="inline-flex items-center h-[22px] px-2.5 rounded-[11px] bg-white/10 font-display font-bold text-[9.5px] text-white">
                    Amigável
                  </span>
                )}

                {selectedEvent.tournament?.name && !selectedEvent.is_friendly && (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2.5 rounded-[11px] bg-white/10 font-display font-bold text-[9.5px] text-white max-w-[170px]">
                    {selectedEvent.tournament.image_url && (
                      <img src={selectedEvent.tournament.image_url} alt="" className="w-3.5 h-3.5 object-contain rounded-full shrink-0" />
                    )}
                    <span className="truncate">{selectedEvent.tournament.name}</span>
                  </span>
                )}

                {selectedEvent.type === 'match' && (
                  <span className="inline-flex items-center h-[22px] px-2.5 rounded-[11px] bg-white/10 font-display font-bold text-[9.5px] text-white">
                    {selectedEvent.home_away === 'away' ? 'Fora' : selectedEvent.home_away === 'neutral' ? 'Campo neutro' : 'Em casa'}
                  </span>
                )}
              </div>

            </div>

            {/* Grelha Responsiva Versão Web (2 Colunas Amplas no Desktop) */}
            <div className="grid grid-cols-1 gap-6 items-start">
              
              {/* COLUNA ESQUERDA (5 Colunas): Detalhes do Evento, Matchup VS e Presença Pessoal */}
              <div className="space-y-5">

                {/* O confronto era aqui um cartão com os dois emblemas e a
                    linha "Condição: Visitado". Passou a ser o título do ecrã
                    (ver acima) e uma etiqueta — dizia-se três vezes a mesma
                    coisa, e uma delas com outras palavras. */}

                {/*
                  As horas e o local num só cartão, como no 2c: a concentração
                  e o início lado a lado divididos por uma linha, e o campo por
                  baixo com o nome em cima da morada. Eram três blocos soltos —
                  uma pastilha de concentração, uma caixa de data e uma linha de
                  local — a dizer coisas da mesma natureza.
                */}
                <div className="cartao-simples overflow-hidden">
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
                    const { nome, morada } = localDoEvento(selectedEvent, fields)
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
                  /* A mesma regra do cartão, e do resto da app: quem não foi
                     convocado para um jogo não tem nada a responder. O ramo
                     que aqui estava inventava uma convocatória a qualquer
                     jogador, e responder inscrevia-o. */
                  const myCallup = getMyCallupForEvent(selectedEvent.id)

                  const fechada = convocatoriaFechada(
                    selectedEvent,
                    (eventCallups[selectedEvent.id] || []).length > 0,
                  )

                  /*
                    Sem convocatória minha, o painel não desaparece — diz
                    porquê. Calado, quem abre um jogo não distingue "não fui
                    chamado" de "a app não está a funcionar", e é uma pergunta
                    que se faz a quem convoca em vez de se ler no ecrã.

                    Se a convocatória inteira está fechada ou por fazer, essa é
                    a razão e é a que se dá — é também a que explica a ausência
                    a quem gere, que não é convocado para nada.
                  */
                  if (!myCallup) {
                    return (
                      <div className="p-4 bg-white/[0.07] rounded-2xl">
                        <p className="text-xs text-white/70 font-medium">
                          {fechada
                            ? `${textoConvocatoriaFechada(fechada, selectedEvent)}.`
                            : 'Não estás nesta convocatória.'}
                        </p>
                      </div>
                    )
                  }

                  return (
                    <div className={!fechada ? 'rounded-2xl overflow-hidden shadow-lg shadow-black/20' : 'p-4 bg-white/[0.07] rounded-2xl space-y-3 border-t-white/20 shadow-md shadow-black/20'}>
                      {!fechada ? (
                        // Barra de ação dourada, de bordo a bordo — a mesma linguagem do cartão da Home.
                        // Mostra-se sempre que ainda dá para responder, mesmo que já tenha respondido antes —
                        // até à hora de concentração o jogador pode sempre mudar de ideias.
                        <div className="bg-csc-gold/13 px-4 py-3.5 flex flex-col items-center justify-center gap-2.5">
                          <span className="font-display font-extrabold text-[14px] text-white">
                            {myCallup.status === 'called' ? 'Contamos contigo?' :
                              myCallup.status === 'confirmed' ? 'Contamos contigo.' : 'Ficas de fora.'}
                          </span>
                          <div className="flex items-center gap-2.5 w-full">
                            <button
                              type="button"
                              onClick={() => handleCallupResponse(selectedEvent.id, 'confirmed')}
                              className={`flex-1 min-h-11 px-5 rounded-[22px] font-display font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer
                                transition-transform duration-150 active:scale-97
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                myCallup.status === 'confirmed'
                                  ? 'bg-csc-light text-csc-tinta'
                                  : 'bg-white/9 text-white'
                              }`}
                            >
                              {myCallup.status === 'confirmed' && <CheckCircle2 size={15} />}
                              Sim, vou
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCallupResponse(selectedEvent.id, 'declined')}
                              className={`flex-1 min-h-11 px-5 rounded-[22px] font-display font-bold text-[13px] flex items-center justify-center gap-1.5 cursor-pointer
                                transition-transform duration-150 active:scale-97
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                                myCallup.status === 'declined'
                                  ? 'bg-white/90 text-csc-tinta'
                                  : 'bg-white/9 text-white'
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
                                myCallup.status === 'confirmed' ? 'text-csc-verde-texto' :
                                myCallup.status === 'declined' ? 'text-csc-vermelho-texto' : 'text-csc-gold'
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

              {/*
                A convocatória vê-se aqui e edita-se nos Eventos — é o mesmo
                bloco (`BlocoConvocatoria`), sem as ações. Havia dois sítios a
                escrever a mesma tabela, com ferramentas diferentes em cada um.
              */}
              <BlocoConvocatoria
                key={selectedEvent.id}
                convocatorias={eventCallups[selectedEvent.id] || []}
                maxJogadores={selectedEvent.max_players}
                gere={Boolean(isCoachOrAdmin)}
                estadoQueImpede={c => {
                  const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                  if (!p || isPlayerEligible(p, selectedEvent.type)) return null
                  if (p.status === 'inactive') return 'Inativo'
                  if (p.status === 'injured') return 'Lesionado'
                  // Apto, mas sem o papel de atleta: só entra em convívios.
                  return 'Não é atleta'
                }}
              />

            </div>

            {/*
              Gestão do evento: um sítio só, os Eventos. A Agenda e a Home
              mostram o evento; quem gere salta daqui para o mesmo evento lá,
              já aberto, e o "‹" traz de volta a esta ficha.
            */}
            {isCoachOrAdmin && (
              <div className="rounded-[20px] bg-csc-gold/10 p-3.5">
                <p className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-csc-gold">
                  Gestão do evento
                </p>
                <div className="mt-3">
                  <Botao
                    largo
                    onClick={() => {
                      triggerHaptic('light')
                      navigate(`/events?convocatoria=${selectedEvent.id}`, { state: { origem: nomeDoEcra(location.pathname, location.search) } })
                    }}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    <span>Editar nos Eventos</span>
                  </Botao>
                </div>
                <p className="text-[10px] leading-snug text-white/62 mt-2.5">
                  O evento, a convocatória e a ficha de jogo editam-se nos Eventos.
                </p>
              </div>
            )}
          </div>
        </EcraDetalhe>
      )}

      </div>

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
