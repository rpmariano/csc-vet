import React, { useEffect, useRef, useState } from 'react'
import {
  Trash2,
  MapPin,
  Clock,
  Check,
  CheckCircle2,
  XCircle,
  HelpCircle,
  UserPlus,
  ExternalLink,
  Repeat,
  Calendar,
  PartyPopper,
  Trophy,
  Send,
  AlertTriangle,
  ClipboardList,
  SlidersHorizontal,
  Pencil
} from 'lucide-react'
import { useAuth, extractRolesFromProfile } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { QuickFieldModal } from '../components/QuickFieldModal'
import { QuickOpponentModal } from '../components/QuickOpponentModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { MatchReportModal } from '../components/MatchReportModal'
import { BlocoConvocatoria } from '../components/callups/BlocoConvocatoria'
import { ProcuraEFiltros } from '../components/ProcuraEFiltros'
import { FichaConvocado } from '../components/callups/FichaConvocado'
import { ConvocatoriaAoCriar } from '../components/callups/ConvocatoriaAoCriar'
import type { EventoCriado } from '../components/callups/ConvocatoriaAoCriar'
import { toast } from '../context/ToastContext'
import { formatClubSigla, formatOpponentSigla } from '../lib/siglas'
import { hasMatchReport, ROTULO_RESPOSTA, CORES_TIPO, compararPorCamisola } from '../lib/eventos'
import { sincronizarJogoNaJornada, AVISO_SEM_EQUIPAS, type EventoParaJornada } from '../lib/jornadaDoJogo'
import { EcraDetalhe } from '../components/EcraDetalhe'
import { EditarEvento } from '../components/eventos/EditarEvento'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useVoltarDaFicha } from '../hooks/useVoltarDaFicha'
import { VoltarAOrigem } from '../components/VoltarAOrigem'
import { BottomSheet } from '../components/BottomSheet'
import { Pastilha, Botao, Interruptor, BotaoIcone, ACarregar, EstadoVazio, BotaoCriar, CabecalhoEcra } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { mensagemDeErro } from '../lib/erros'
import { CLASSE_CAMPO as CAMPO_FORM, CLASSE_ETIQUETA_CAMPO as ETIQUETA_FORM, CLASSE_ETIQUETA_CAMPO as ETIQUETA_FILTRO } from '../components/ui/formulario'
import { fmtData } from '../lib/datas'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

/** Campo branco dos formulários de evento (ecrã 2e), o mesmo da Agenda. */

/**
 * Como se lê cada filtro escondido, na linha de resumo por baixo das pastilhas.
 * Espelha o `ROTULOS_ESTADO` da Agenda — aqui o eixo do tempo e o de rascunho
 * são dois, porque na Gestão de Eventos há rascunhos e na Agenda não.
 */
const ROTULOS_TEMPO: Record<string, string> = {
  upcoming: 'Por realizar',
  past: 'Realizados',
}

const ROTULOS_PUBLICACAO: Record<string, string> = {
  active: 'Ativos',
  inactive: 'Rascunhos',
}

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
  // Por ordem alfabética do nome da camisola, como todas as listas de atletas.
  return [...remoteProfiles].sort(compararPorCamisola)
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
  /** Jornada da prova em que este jogo conta — ver `jornadaDoJogo.ts`. */
  matchday?: number | null
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
  /** Quando o atleta respondeu. Escrito por gatilho no servidor; NULL nas respostas anteriores a set/2026. */
  responded_at?: string | null
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
  const estadoDaEntrada = useLocation().state
  const [activeCallupModalEvent, setActiveCallupModalEvent] = useState<Event | null>(null)
  /* A ficha rápida do convocado (4a), por cima do dossier de convocatória. */
  const [convocadoAberto, setConvocadoAberto] = useState<string | null>(null)
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
  /* A jornada em que o jogo conta. Obrigatória com torneio escolhido: é ela
     que põe o jogo na tabela e deixa a ficha lançar lá o resultado. */
  const [matchday, setMatchday] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')

  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([3]) // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')

  // Quick Field Modal
  const [isQuickFieldModalOpen, setIsQuickFieldModalOpen] = useState(false)
  const [quickFieldName, setQuickFieldName] = useState('')
  const [quickFieldAddress, setQuickFieldAddress] = useState('')
  const [isSavingQuickField, setIsSavingQuickField] = useState(false)

  // Quick Opponent Modal
  const [isQuickOpponentModalOpen, setIsQuickOpponentModalOpen] = useState(false)
  const [quickOppName, setQuickOppName] = useState('')
  const [quickOppInitials, setQuickOppInitials] = useState('')
  const [quickOppHomeFieldId, setQuickOppHomeFieldId] = useState('')
  const [quickOppContactName, setQuickOppContactName] = useState('')
  const [quickOppContactPhone, setQuickOppContactPhone] = useState('')
  const [isSavingQuickOpp, setIsSavingQuickOpp] = useState(false)

  /* O evento em edição — o formulário é o `EditarEvento`, o mesmo da Agenda. */
  const [eventoAEditar, setEventoAEditar] = useState<Event | null>(null)
  // Evita duplo-submit ao criar/publicar um evento (duplo clique/toque em ligação lenta
  // criava o evento e enviava a convocatória duas vezes). Guarda síncrona com ref
  // acima: o estado só serve para desativar o botão na UI, a guarda real é o ref síncrono.
  const [isCreatingEvent, setIsCreatingEvent] = useState(false)
  const isCreatingEventRef = useRef(false)
  // Ativação e Publicação de Convocatórias
  const [isActiveOnCreate, setIsActiveOnCreate] = useState(true)

  // Estados para Filtros da Lista de Eventos Agendados
  const [eventListSearch, setEventListSearch] = useState('')
  const [eventListTypeFilter, setEventListTypeFilter] = useState<'all' | 'match' | 'practice' | 'gathering'>('all')
  const [eventListTimeFilter, setEventListTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [eventListStatusFilter, setEventListStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [filtrosListaAbertos, setFiltrosListaAbertos] = useState(false)

  /* O evento acabado de criar, à espera de convocatória (ecrãs 4f/4g). */
  const [eventoAConvocar, setEventoAConvocar] = useState<EventoCriado | null>(null)
  const [preEscolhidos, setPreEscolhidos] = useState<string[]>([])
  const [viewModeTab, setViewModeTab] = useState<'create' | 'list'>('list')

  /*
    O guarda do formulário de criação. Não tinha nenhum: fechar a folha de
    criar um evento com data, campo e adversário já escolhidos voltava à lista
    sem uma palavra.
  */
  const guardaCriacao = useAlteracoesPorGravar({
    aberto: viewModeTab === 'create',
    // É um ecrã: o retroceder do browser é o "‹".
    ecraDeFormulario: true,
    valores: [
      title, type, eventDate, eventTime, meetingTime, fieldId, locationText, description,
      maxPlayers, isFriendly, tournamentId, matchday, opponentId, homeAway,
      isRecurring, recurrenceWeekdays, recurrenceEndDate, isActiveOnCreate,
    ],
    aoGravar: () => handleCreateEvent(EVENTO_FALSO),
    aoSair: () => setViewModeTab('list'),
    descricao: 'O evento que estás a criar ainda não foi gravado. Se saíres agora, perde-se.',
  })

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

      setFieldId(resolvedField.id)
      setLocationText(formattedLoc)

      setIsQuickFieldModalOpen(false)
      setQuickFieldName('')
      setQuickFieldAddress('')
      toast.success('Campo criado e selecionado com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao criar campo: ' + mensagemDeErro(err))
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

      setOpponentId(resolvedOpp.id)
      if (homeAway === 'away' && resolvedOpp.home_field_id) {
        setFieldId(resolvedOpp.home_field_id)
        const f = fields.find(item => item.id === resolvedOpp.home_field_id)
        if (f) setLocationText(f.address ? `${f.name} (${f.address})` : f.name)
      }

      setIsQuickOpponentModalOpen(false)
      setQuickOppName('')
      setQuickOppInitials('')
      setQuickOppHomeFieldId('')
      setQuickOppContactName('')
      setQuickOppContactPhone('')
      toast.success('Adversário registado com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao criar adversário: ' + mensagemDeErro(err))
    } finally {
      setIsSavingQuickOpp(false)
    }
  }

  const openEditModal = (ev: Event) => {
    if (hasMatchReport(ev)) {
      toast.error('Este jogo já tem ficha de jogo lançada — o evento já não pode ser editado.')
      return
    }
    setEventoAEditar(ev)
  }

  /*
    Espelha o jogo na jornada da prova. O aviso é um `warning` e não um erro:
    o evento ficou criado — o que falhou foi pô-lo na tabela, e isso resolve-se
    inscrevendo as equipas no grupo.
  */
  const espelharNaJornada = async (evento: EventoParaJornada) => {
    const r = await sincronizarJogoNaJornada(evento)
    if (r.estado === 'sem-equipas') toast.warning(AVISO_SEM_EQUIPAS)
    if (r.estado === 'erro') toast.warning('O jogo ficou gravado, mas não entrou na tabela da prova: ' + r.mensagem)
  }

  /* Um jogo de torneio tem de dizer em que jornada conta — é o que o põe na
     tabela da prova. Vale para criar e para editar. */
  const faltaAJornada = (tipo: string, amigavel: boolean, prova: string, jornada: string) =>
    tipo === 'match' && !amigavel && Boolean(prova) && !Number(jornada)

  // Ativar evento inativo e disparar convocatória
  const handleActivateEvent = async (ev: Event) => {
    const callups = eventCallups[ev.id] || []
    
    // Se o evento não tiver convocatórias gravadas e não for treino automático:
    if (callups.length === 0 && ev.type !== 'practice') {
      toast.warning('Ainda não há atletas escolhidos para este evento. Escolhe quem convocar na convocatória.')
      openEditModal(ev)
      return
    }

    const countToNotify = ev.type === 'practice'
      ? (callups.length > 0 ? callups.length : allPlayers.filter(p => isPlayerEligible(p, 'practice')).length)
      : callups.length

    setConfirmModalConfig({
      isOpen: true,
      title: 'Ativar evento e enviar convocatória',
      description: `Queres ativar este evento e disparar a convocatória para os ${countToNotify} membros selecionados? O evento ficará imediatamente visível para todos os atletas na agenda e página principal.`,
      confirmText: 'Sim, ativar e enviar convocatória',
      cancelText: 'Cancelar',
      variant: 'success',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        try {
          /* Uma falha aqui já não se engole: era assim que a app dizia
             "Evento ativado com sucesso!" com o evento ainda em rascunho. Só
             se tolera a base sem a coluna `is_active`. */
          const { error: erroAtivar } = await supabase
            .from('events')
            .update({ is_active: true })
            .eq('id', ev.id)
          if (erroAtivar && !erroAtivar.message?.includes('is_active')) {
            throw erroAtivar
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
              const { error: erroConvocar } = await supabase.from('callups').insert(rows)
              if (erroConvocar) throw erroConvocar
            }
          }

          setEvents(prev => prev.map(item => item.id === ev.id ? { ...item, is_active: true } : item))
          if (activeCallupModalEvent && activeCallupModalEvent.id === ev.id) {
            setActiveCallupModalEvent(prev => prev ? { ...prev, is_active: true } : null)
          }
          await fetchData()
          toast.success(`Evento ativado com sucesso! Convocatória enviada a ${countToNotify} membros.`)
        } catch (err: any) {
          console.error(err)
          toast.error('Erro ao ativar evento: ' + mensagemDeErro(err))
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
        // Plantel: a vista traz só as colunas de equipa (sem IBAN, NIF, morada,
        // contactos ou notas médicas), por isso qualquer membro a pode ler.
        supabase.from('v_players_public').select('*').order('name', { ascending: true }),
        fetchAllCallups('id, event_id, player_id, status, responded_at, player:v_players_public(id, name, photo_url, jersey_number, role, roles, position)'),
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

        // Para treinos: garantir que todos os atletas aptos estão convocados.
        // Atletas, pela regra do `isPlayerEligible`: o treinador e a direção
        // que não jogam apareciam aqui como convocados de todos os treinos.
        const activePlayers = merged.filter(p => isPlayerEligible(p, 'practice'))
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
    // Jogos e treinos são só para quem tem o papel de Jogador — membros só
    // Treinador ou só Direção ficam disponíveis apenas nos convívios.
    if (!extractRolesFromProfile(player).includes('player')) return false
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
      toast.warning('Escolhe a data e a hora do evento.')
      return
    }

    /* Um jogo de torneio sem jornada não vai parar à tabela — e é a jornada
       que faz a ficha de jogo lançar lá o resultado sozinha. */
    if (faltaAJornada(type, isFriendly, tournamentId, matchday)) {
      isCreatingEventRef.current = false
      setIsCreatingEvent(false)
      toast.warning('Escolhe a jornada em que este jogo conta para a prova.')
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
          matchday: (type === 'match' && !isFriendly && tournamentId) ? Number(matchday) : null,
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
              const withoutActive = eventsToInsert.map(({ is_active: _is_active, ...rest }) => rest)
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
            const withoutActive = eventsToInsert.map(({ is_active: _is_active, ...rest }) => rest)
            const { data: fbData, error: fbErr } = await supabase.from('events').insert(withoutActive).select()
            if (fbErr) throw fbErr
            createdBatchResult = (fbData || []).map((e: any) => ({ ...e, is_active: isActiveOnCreate }))
          } else {
            throw dbErr
          }
        }

        if (createdBatchResult) createdEventsList = createdBatchResult as Event[]

        for (const criado of createdEventsList) {
          await espelharNaJornada(criado as EventoParaJornada)
        }

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
          ? `${createdEventsList.length} eventos criados com sucesso até ${fmtData(recurrenceEndDate)}!`
          : `${createdEventsList.length} eventos guardados como Rascunho (Inativos) até ${fmtData(recurrenceEndDate)}!`
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
          matchday: (type === 'match' && !isFriendly && tournamentId) ? Number(matchday) : null,
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
              const { is_active: _is_active, ...withoutActive } = newEvent
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
            const { is_active: _is_active, ...withoutActive } = newEvent
            const { data: fbData, error: fbErr } = await supabase.from('events').insert([withoutActive]).select().single()
            if (fbErr) throw fbErr
            createdEventResult = { ...fbData, is_active: isActiveOnCreate }
          } else {
            throw dbErr
          }
        }

        const createdEvent = createdEventResult as Event

        if (createdEvent) await espelharNaJornada(createdEvent as EventoParaJornada)

        /*
          Guardar leva à convocatória (ecrãs 4f e 4g). A inserção das linhas
          de `callups` acontece lá e não aqui: antes era um bloco no meio do
          formulário, e quem criava um jogo às pressas guardava e ia à sua
          vida — o evento ficava na agenda sem ninguém chamado.
        */
        if (createdEvent) {
          const preEscolha = type === 'practice'
            ? allPlayers.filter(p => isPlayerEligible(p, 'practice')).map(p => p.id)
            : selectedPlayerIds
          setEventoAConvocar({
            id: createdEvent.id,
            tipo: type as 'match' | 'practice' | 'gathering',
            // `getEventHeading` devolve JSX (o placar com as siglas); aqui
            // quer-se uma linha de texto.
            titulo: type === 'match'
              ? `${formatClubSigla(clubSettings?.initials)} vs ${formatOpponentSigla(opponents.find(o => o.id === opponentId))}`
              : (createdEvent.title || (type === 'practice' ? 'Treino' : 'Convívio')),
            quando: createdEvent.date_time,
            local: createdEvent.field_id ? getFieldName(createdEvent.field_id) : (createdEvent.location || null),
            ativo: isActiveOnCreate,
          })
          setPreEscolhidos(await ensurePlayerIdsForSupabase(preEscolha, allPlayers))
        }
      }

      await fetchData()
      
      // Reset form e fechar modal
      setTitle('')
      setDescription('')
      setTournamentId('')
      setMatchday('')
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
      toast.error("Erro ao criar evento: " + mensagemDeErro(err))
    } finally {
      isCreatingEventRef.current = false
      setIsCreatingEvent(false)
    }
  }

  const handleDeleteEvent = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Eliminar evento',
      description: 'Tens a certeza que queres eliminar este evento? Todas as convocatórias e respostas associadas são eliminadas.',
      confirmText: 'Sim, eliminar evento',
      cancelText: 'Cancelar',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('events').delete().eq('id', id)
        if (!error) {
          setEvents(prev => prev.filter(e => e.id !== id))
          toast.success('Evento eliminado com sucesso!')
        } else {
          toast.error('Erro ao eliminar evento: ' + mensagemDeErro(error))
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
      toast.success(`Resposta marcada: ${ROTULO_RESPOSTA[newStatus]}`)
    } catch (err: any) {
      toast.error('Erro ao marcar a resposta: ' + mensagemDeErro(err))
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
      }], { onConflict: 'event_id, player_id' }).select('id, event_id, player_id, status, responded_at, player:v_players_public(id, name, photo_url, jersey_number, role, roles, position)').single()

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
      toast.error('Erro ao adicionar atleta: ' + mensagemDeErro(err))
    }
  }

  const handleRemovePlayerFromCallup = async (callupId: string, eventId: string) => {
    /* Faz-se logo e desfaz-se no toast (decisão da auditoria de design):
       tirar um atleta é um gesto frequente, e uma pergunta a cada um cansava. */
    const removida = (eventCallups[eventId] || []).find(c => c.id === callupId)
    try {
      const { error } = await supabase.from('callups').delete().eq('id', callupId)
      if (error) throw error

      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(c => c.id !== callupId)
      }))
      if (!removida) {
        toast.success('Atleta tirado da convocatória.')
        return
      }
      toast.comAnular('Atleta tirado da convocatória.', async () => {
        const { data, error: erroRepor } = await supabase
          .from('callups')
          .insert({ event_id: eventId, player_id: removida.player_id, status: removida.status })
          .select('id')
          .single()
        if (erroRepor || !data) {
          toast.error('Não foi possível repor o atleta: ' + mensagemDeErro(erroRepor))
          return
        }
        setEventCallups(prev => ({
          ...prev,
          [eventId]: [...(prev[eventId] || []), { ...removida, id: data.id }]
        }))
      })
    } catch (err: any) {
      toast.error('Erro ao tirar da convocatória: ' + mensagemDeErro(err))
    }
  }

  /** Tirar de uma vez quem ficou sem condições depois de convocado. */
  const handleTirarVarios = async (callupIds: string[], eventId: string) => {
    if (callupIds.length === 0) return
    try {
      const { error } = await supabase.from('callups').delete().in('id', callupIds)
      if (error) throw error
      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(c => !callupIds.includes(c.id)),
      }))
      toast.info(
        callupIds.length === 1
          ? 'Convocado tirado da convocatória.'
          : `${callupIds.length} convocados tirados da convocatória.`,
      )
    } catch (err: any) {
      toast.error('Erro ao atualizar a convocatória: ' + mensagemDeErro(err))
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
        <span className="text-white/62"> • </span>
        <span className="text-csc-gold">{competitionLabel}</span>
      </>
    )
  }

  const currentLocationStr = getActiveLocationString()

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.

  // Ver a convocatória de um evento é navegar: o endereço passa a ter
  // ?convocatoria=<id>, portanto o dossier tem link próprio e o retroceder do
  // browser fecha-o.
  const abrirDossier = (ev: Event) => {
    setActiveCallupModalEvent(ev)
    setSearchParams({ convocatoria: ev.id })
  }

  const { voltarPara: voltarDoDossier, aoVoltar: fecharDossier } = useVoltarDaFicha(['convocatoria'], 'Eventos')

  /*
    O [+] da barra manda para cá com `?criar=match|practice|gathering`.

    Sem isto o pedido caía na lista: quem escolhia "Jogo" na folha do [+] era
    posto na gestão de eventos, com o formulário a um toque de distância e sem
    nada a dizer que tinha de o abrir. O tipo já vem escolhido, que é a única
    coisa que a folha sabe e a lista não.

    O parâmetro sai do endereço a seguir, com `replace`, como o `?criar=jornada`
    dos torneios: recarregar a página não volta a atirar ninguém para dentro de
    um formulário.
  */
  useEffect(() => {
    const pedido = searchParams.get('criar')
    if (!pedido) return
    if (pedido === 'match' || pedido === 'practice' || pedido === 'gathering') {
      setType(pedido)
      setViewModeTab('create')
    }
    const restantes = new URLSearchParams(searchParams)
    restantes.delete('criar')
    // O `state` segue: é nele que vem a origem do "‹".
    setSearchParams(restantes, { replace: true, state: estadoDaEntrada })
  }, [searchParams, setSearchParams, estadoDaEntrada])

  /*
    O dossier aberto pelo endereço. Só enche o evento — quem manda em estar
    aberto é o próprio endereço, e não um estado sincronizado por este efeito:
    era daí que vinha a falha do retroceder do browser, com o `?convocatoria=`
    a sair do endereço e a persiana a ficar aberta por cima da lista.
  */
  useEffect(() => {
    const idEvento = searchParams.get('convocatoria')
    if (!idEvento) return
    const alvo = events.find(e => e.id === idEvento)
    if (alvo) setActiveCallupModalEvent(alvo)
  }, [searchParams, events])

  const dossierAberto = Boolean(searchParams.get('convocatoria'))

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-6">
      {/* O cabeçalho de todos os ecrãs (decisão de 2026-09-26). Tinha sido
          tirado, e os Eventos eram o único ecrã de lista sem dizer onde se
          estava, com o criar numa barra dourada de largura inteira por cima
          da procura. */}
      <CabecalhoEcra
        voltar={<VoltarAOrigem />}
        titulo="Eventos"
        sobrancelha={`${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`}
        acoes={isCoachOrAdmin ? (
          <BotaoCriar rotulo="Novo evento" onClick={() => { triggerHaptic('light'); setViewModeTab('create') }} />
        ) : undefined}
      />

      {successMessage && (
        <div className="bg-csc-light/12 text-csc-verde-texto p-4 rounded-2xl text-sm font-bold flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 size={20} className="text-csc-light shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}


      {/* Criar um evento é um ecrã: o passo 1 de um fluxo cujo passo 2, a
          convocatória, já era ecrã. Era um modal de 14 campos, e o fluxo
          mudava de forma a meio. */}
      <EcraDetalhe
        aberto={viewModeTab === 'create'}
        voltarPara="Eventos"
        aoVoltar={guardaCriacao.tentarFechar}
        sobrancelha="Novo evento"
        titulo={type === 'match' ? 'Novo jogo' : type === 'practice' ? 'Novo treino' : 'Novo convívio'}
      >
          <form onSubmit={handleCreateEvent} className="space-y-5">
            
            {/* 1. Tipo de Evento */}
            <div>
              <label className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-1.5">
                Tipo de Evento
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'gathering', label: 'Convívio', icon: PartyPopper, color: 'text-csc-azul-texto bg-csc-blue/12 border-csc-blue/35' },
                  { id: 'practice', label: 'Treino', icon: TrainingIcon, color: 'text-csc-verde-texto bg-csc-light/12 border-csc-light/35' },
                  { id: 'match', label: 'Jogo', icon: Trophy, color: 'text-csc-gold bg-csc-gold/12 border-csc-gold/35' },
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
                          : 'bg-white/6 border-white/12 text-white/60 hover:bg-white/10'
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
                <label className={ETIQUETA_FORM}>
                  Título do Convívio *
                </label>
                <input
                  type="text"
                  required={type === 'gathering'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={CAMPO_FORM}
                  placeholder="Ex: Jantar de Natal / Reentré"
                />
              </div>
            )}

            {/* Específico de Jogo */}
            {type === 'match' && (
              <div className="p-3.5 bg-csc-gold/8 rounded-2xl space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isFriendly"
                    checked={isFriendly}
                    onChange={(e) => {
                      setIsFriendly(e.target.checked)
                      if (e.target.checked) { setTournamentId(''); setMatchday('') }
                    }}
                    className="h-4 w-4 text-csc-tinta focus:ring-csc-dark border-white/15 rounded cursor-pointer"
                  />
                  <label htmlFor="isFriendly" className="ml-2 text-xs font-bold text-white cursor-pointer">
                    Jogo Amigável / Treino Conjunto
                  </label>
                </div>

                {!isFriendly && (
                  /* A jornada aparece ao lado assim que há prova escolhida: é
                     ela que põe o jogo na tabela da prova, e sem ela a ficha
                     de jogo não tem onde lançar o resultado. */
                  <div className="flex gap-2.5">
                    <div className="flex-1 min-w-0">
                      <label className={ETIQUETA_FORM} htmlFor="prova-nova">Torneio / Competição</label>
                      <select
                        id="prova-nova"
                        value={tournamentId}
                        onChange={(e) => setTournamentId(e.target.value)}
                        className={CAMPO_FORM}
                      >
                        <option value="">-- Selecionar Torneio --</option>
                        {tournaments.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.season})</option>
                        ))}
                      </select>
                    </div>
                    {tournamentId && (
                      <div className="w-[96px] flex-none">
                        <label className={ETIQUETA_FORM} htmlFor="jornada-nova">Jornada *</label>
                        <input
                          id="jornada-nova"
                          type="number"
                          min="1"
                          inputMode="numeric"
                          value={matchday}
                          onChange={e => setMatchday(e.target.value)}
                          placeholder="1"
                          className={CAMPO_FORM}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className={ETIQUETA_FORM}>Adversário</label>
                    <select
                      value={opponentId}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setIsQuickOpponentModalOpen(true)
                        } else {
                          setOpponentId(e.target.value)
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
                      value={homeAway}
                      onChange={(e) => setHomeAway(e.target.value as any)}
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

            {/* 3. Data/Hora */}
            <div className="grid grid-cols-1 gap-2.5">
              <div>
                <label className={ETIQUETA_FORM}>Data *</label>
                <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={CAMPO_FORM} />
              </div>
              <div>
                <label className={ETIQUETA_FORM}>Hora *</label>
                <input type="time" required value={eventTime} onChange={(e) => setEventTime(e.target.value)} className={CAMPO_FORM} />
              </div>
              <div>
                <label className={ETIQUETA_FORM}>Concentração</label>
                <input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className={CAMPO_FORM} />
              </div>
            </div>

            {/* 4. Localização / Campo */}
            {type === 'match' && homeAway === 'home' ? (
              <div className="p-3.5 bg-csc-light/10 rounded-2xl flex items-center justify-between">
                <div className="space-y-1 min-w-0 flex-1 pr-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-csc-verde-texto flex items-center gap-1.5">
                    <MapPin size={13} className="text-csc-light shrink-0" />
                    <span>Campo do Jogo (Automático - Em Casa)</span>
                  </span>
                  <p className="text-xs font-black text-white truncate">
                    {(() => {
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
                    className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-[18px] bg-white/8 text-csc-gold font-display font-bold text-[10.5px] cursor-pointer shrink-0 transition-transform duration-150 active:scale-97"
                    title="Ver no Google Maps"
                  >
                    <MapPin size={12} className="text-csc-vermelho-texto" />
                    <span>Maps</span>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-white/6 rounded-2xl space-y-2.5">
                <label className="block text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><MapPin size={14} className="text-csc-vermelho-texto" /> Campo / Instalação</span>
                  {currentLocationStr && <span className="text-[10px] text-csc-verde-texto font-bold bg-csc-light/15 px-2 py-0.5 rounded-full truncate max-w-[150px]">✓ {currentLocationStr}</span>}
                </label>
                <select required value={fieldId} onChange={(e) => {
                    if (e.target.value === '__new__') { setIsQuickFieldModalOpen(true) } else { setFieldId(e.target.value); const sel = fields.find(f => f.id === e.target.value); setLocationText(sel ? (sel.address ? `${sel.name} (${sel.address})` : sel.name) : '') }
                  }} className={CAMPO_FORM}>
                  <option value="">-- Escolher Campo / Instalação --</option>
                  <option value="__new__" className="font-bold text-csc-gold bg-csc-gold/10">Criar novo campo…</option>
                  {fields.map(f => <option key={f.id} value={f.id}>{f.name} {f.address ? `(${f.address})` : ''}</option>)}
                </select>
                {currentLocationStr && (
                  <div className="pt-1">
                    <a
                      href={getGoogleMapsUrl(currentLocationStr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black text-csc-tinta bg-csc-gold hover:brightness-95 border border-csc-gold px-3 min-h-11 rounded-xl transition-all shadow-2xs active:scale-95"
                    >
                      <MapPin size={13} className="text-csc-vermelho-texto" />
                      <span>Ver no Google Maps: "{currentLocationStr}"</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* 5. Descrição */}
            <div>
              <label className={ETIQUETA_FORM}>Descrição</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Ex: Menus disponíveis, valor por pessoa, ordem de trabalhos ou recomendações..."
                className={`${CAMPO_FORM} h-auto py-3 leading-relaxed resize-none`}
              />
            </div>

            {/* 6. Recorrência (Treinos) */}
            {type === 'practice' && (
              <div className="p-3.5 bg-csc-gold/8 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="h-4 w-4 text-csc-tinta focus:ring-csc-dark border-white/15 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-white flex items-center gap-1">
                      <Repeat size={14} className="text-csc-gold" />
                      <span>Marcar Treino com Recorrência Semanal</span>
                    </span>
                  </label>
                </div>

                {isRecurring && (
                  <div className="space-y-2 pt-2 border-t border-csc-gold/25 text-xs">
                    <div>
                      <label className={ETIQUETA_FORM}>Dias da semana:</label>
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
                              aria-pressed={isChecked}
                              onClick={() => {
                                if (isChecked) {
                                  setRecurrenceWeekdays(prev => prev.filter(x => x !== d.val))
                                } else {
                                  setRecurrenceWeekdays(prev => [...prev, d.val])
                                }
                              }}
                              className={`min-w-11 min-h-11 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                                isChecked
                                  ? 'bg-csc-gold text-csc-tinta'
                                  : 'bg-white/10 text-white/80 hover:bg-white/15'
                              }`}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <label className={ETIQUETA_FORM}>Repetir até:</label>
                      <input
                        type="date"
                        required={isRecurring}
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className={CAMPO_FORM}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/*
              A convocatória saiu daqui. Era um bloco no meio do formulário com
              a lista inteira do plantel, e depois de guardar havia um segundo
              sítio — a persiana 4f/4g — a escrever a mesma tabela. Fica um só:
              guardar leva à convocatória, e é lá que se escolhe.
            */}

            {/* 8. Opção de Ativação / Envio de Convocatória */}
            <Interruptor
              ligado={isActiveOnCreate}
              aoMudar={setIsActiveOnCreate}
              titulo={
                <span className="flex items-center gap-1.5">
                  <Send size={15} className={isActiveOnCreate ? 'text-csc-light' : 'text-csc-gold'} aria-hidden="true" />
                  Publicar já na agenda
                </span>
              }
              nota={isActiveOnCreate
                ? 'Ao guardar, escolhes quem convocas. O evento fica visível na agenda.'
                : 'O evento fica em rascunho: ninguém é avisado e não entra no alerta de convocatórias. A convocatória fica guardada.'}
              className="bg-csc-gold/8 rounded-2xl"
            />

            <button
              type="submit"
              disabled={isCreatingEvent}
              className={`w-full min-h-12 rounded-3xl font-display font-extrabold text-[12.5px]
                flex items-center justify-center gap-2 cursor-pointer transition-transform duration-150 active:scale-97
                disabled:opacity-45 disabled:cursor-not-allowed
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                  isActiveOnCreate
                    ? 'bg-csc-gold text-csc-tinta'
                    : 'bg-white/9 text-white'
                }`}
            >
              {isCreatingEvent ? (
                <span>A processar…</span>
              ) : isActiveOnCreate ? (
                <>
                  <Check size={18} />
                  <span>Guardar e convocar</span>
                </>
              ) : (
                <>
                  <Clock size={18} />
                  <span>Guardar como rascunho</span>
                </>
              )}
            </button>
          </form>
      </EcraDetalhe>

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

        /**
         * O que a persiana de filtros esconde, para o cabeçalho poder acender e
         * a linha de resumo poder dizê-lo. As pastilhas de tipo não entram no
         * resumo — essas estão à vista — mas entram no "tem filtros", senão o
         * botão "Limpar" não as limpava.
         */
        const temFiltrosLista =
          eventListSearch.trim() !== '' ||
          eventListTimeFilter !== 'upcoming' ||
          eventListStatusFilter !== 'all' ||
          eventListTypeFilter !== 'all'

        const ROTULOS_TIPO_LISTA: Record<string, string> = { match: 'Jogos', practice: 'Treinos', gathering: 'Convívios' }
        const resumoFiltrosLista = [
          eventListTimeFilter !== 'upcoming' ? (ROTULOS_TEMPO[eventListTimeFilter] ?? 'Todas as datas') : null,
          eventListTypeFilter !== 'all' ? ROTULOS_TIPO_LISTA[eventListTypeFilter] : null,
          eventListStatusFilter !== 'all' ? ROTULOS_PUBLICACAO[eventListStatusFilter] : null,
        ].filter((x): x is string => Boolean(x))

        return (
          <div className="w-full space-y-4">
            {/*
              Filtros da lista (ecrã 4a). **Procura à vista, tudo o resto atrás
              do funil** — a mesma forma em todos os ecrãs de lista da app.

              A fila de pastilhas do tipo de evento estava aqui fora, e as
              Fichas de Jogo e as Estatísticas escondiam o filtro equivalente:
              o mesmo filtro tratado de duas maneiras conforme o ecrã. Uma
              pastilha à vista é navegação; o que filtra fica atrás do funil.

              O que a persiana esconde acende o funil e escreve-se por baixo:
              um filtro que não se vê é um filtro que se esquece, e depois a
              lista parece vazia sem razão.
            */}
            <ProcuraEFiltros
              procura={eventListSearch}
              aoProcurar={setEventListSearch}
              placeholder="Título, adversário ou local"
              rotulo="Procurar nos eventos"
              aoAbrirFiltros={() => setFiltrosListaAbertos(true)}
              filtrosAtivos={resumoFiltrosLista.length > 0}
              resumo={resumoFiltrosLista}
              contagem={`${filteredScheduledEvents.length} ${filteredScheduledEvents.length === 1 ? 'evento' : 'eventos'}`}
              aoLimpar={() => {
                setEventListSearch('')
                setEventListTimeFilter('upcoming')
                setEventListStatusFilter('all')
                setEventListTypeFilter('all')
              }}
            />

            <BottomSheet
              isOpen={filtrosListaAbertos}
              onClose={() => setFiltrosListaAbertos(false)}
              title="Filtrar eventos"
              description="Tipo, quando e publicação"
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
                    onClick={() => {
                      setEventListSearch('')
                      setEventListTimeFilter('upcoming')
                      setEventListStatusFilter('all')
                      setEventListTypeFilter('all')
                    }}
                    disabled={!temFiltrosLista}
                  >
                    Limpar
                  </Botao>
                  <Botao onClick={() => setFiltrosListaAbertos(false)}>
                    Ver {filteredScheduledEvents.length}{' '}
                    {filteredScheduledEvents.length === 1 ? 'evento' : 'eventos'}
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
                        ativa={eventListTypeFilter === valor}
                        onClick={() => { triggerHaptic('selection'); setEventListTypeFilter(valor) }}
                      >
                        {etiqueta}
                      </Pastilha>
                    ))}
                  </div>
                </div>

                <div>
                  <p className={ETIQUETA_FILTRO}>
                    Quando
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['upcoming', 'Por realizar'],
                      ['past', 'Realizados'],
                      ['all', 'Todos'],
                    ] as const).map(([valor, etiqueta]) => (
                      <Pastilha
                        key={valor}
                        ativa={eventListTimeFilter === valor}
                        onClick={() => { triggerHaptic('selection'); setEventListTimeFilter(valor) }}
                      >
                        {etiqueta}
                      </Pastilha>
                    ))}
                  </div>
                </div>

                {/* Rascunhos são coisa de quem gere: um atleta nunca os vê. */}
                {isCoachOrAdmin && (
                  <div>
                    <p className={ETIQUETA_FILTRO}>
                      Publicação
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['all', 'Todos'],
                        ['active', 'Ativos'],
                        ['inactive', 'Rascunhos'],
                      ] as const).map(([valor, etiqueta]) => (
                        <Pastilha
                          key={valor}
                          ativa={eventListStatusFilter === valor}
                          onClick={() => { triggerHaptic('selection'); setEventListStatusFilter(valor) }}
                        >
                          {etiqueta}
                        </Pastilha>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </BottomSheet>

            {/* O cartão não repete o título do ecrã: "Eventos & quórum" e o
                "A mostrar N de M" diziam o que o cabeçalho e a linha de resumo
                do filtro já dizem. */}
            {/* Um cartão, e os eventos lá dentro como linhas separadas por um
                fio — dois níveis, e mais nenhum. Eram cinco caixas encaixadas
                (a lista, o evento com borda de 2px, a data e o local, o "Maps",
                as pastilhas), e o branco translúcido de cada uma somava-se até
                um cinzento opaco. */}
            <div className="cartao-simples text-white overflow-hidden">

              {loading ? (
                <ACarregar />
              ) : filteredScheduledEvents.length === 0 ? (
                <EstadoVazio icone={Calendar} titulo="Nenhum evento encontrado." texto="Tenta mudar os filtros ou a procura." />
              ) : (
                <div>
                  {filteredScheduledEvents.map((event) => {
                  const callups = eventCallups[event.id] || []
                  const confirmedList = callups.filter(c => c.status === 'confirmed')
                  const declinedList = callups.filter(c => c.status === 'declined')
                  const pendingList = callups.filter(c => c.status === 'called')
                  
                  const fieldObj = fields.find(f => f.id === event.field_id)
                  const locationName = event.field_id ? getFieldName(event.field_id) : (event.location || 'Sem local')
                  const mapsQuery = fieldObj ? (fieldObj.address ? `${fieldObj.name}, ${fieldObj.address}` : fieldObj.name) : (event.location || '')

                  return (
                    /*
                      O cartão inteiro abre o detalhe. Não pode ser um
                      `<button>` porque tem o link do Maps lá dentro, por isso
                      leva `role="button"`, foco por teclado e um `aria-label`
                      que diz o que abre — a regra dos cartões clicáveis.
                      Editar e eliminar deixaram de estar aqui: vivem no
                      detalhe, que é onde se percebe o que se está a mexer.
                    */
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver os detalhes de ${getEventHeading(event)}`}
                      onClick={() => { abrirDossier(event) }}
                      onKeyDown={e => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        abrirDossier(event)
                      }}
                      /* Um rascunho diz-se com a barra dourada à esquerda, e não
                         com uma moldura de outra cor. */
                      className={`linha-leve px-4 py-4 space-y-2 cursor-pointer transition-colors hover:bg-white/[0.03]
                        focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-csc-gold ${
                        event.is_active === false ? 'shadow-[inset_3px_0_0_var(--color-csc-gold)]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-black text-white text-base leading-tight">
                              {getEventHeading(event)}
                            </h4>
                            {event.is_active === false && (
                              <span className="font-display font-extrabold text-[10px] tracking-[0.12em] uppercase text-csc-gold">
                                Rascunho
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* A data e o local são texto com ícone, não uma caixa. A
                          concentração vai na mesma linha, e o "Maps" é uma
                          ligação dourada — sem moldura, com 44px de alvo. */}
                      <div className="space-y-0.5 text-[12px] text-white/70">
                        <p className="flex items-center gap-1.5">
                          <Clock size={13} className="text-white/45 shrink-0" aria-hidden="true" />
                          <span className="font-bold text-white/85">
                            {new Date(event.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(event.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {event.meeting_time && (
                            <span className="text-white/62">· concentração {event.meeting_time.substring(0, 5)}</span>
                          )}
                        </p>

                        <div className="flex items-center justify-between gap-2 -my-2">
                          <p className="flex items-center gap-1.5 min-w-0">
                            <MapPin size={13} className="text-white/45 shrink-0" aria-hidden="true" />
                            <span className="truncate">{locationName}</span>
                          </p>
                          {mapsQuery && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="min-h-11 pl-3 text-csc-gold font-display font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                              title="Abrir no Google Maps"
                            >
                              <span>Maps</span>
                              <ExternalLink size={11} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* As respostas dizem-se pela cor do texto, sem pastilha:
                          é o estado, e a cor chega para o ler. */}
                      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap font-display font-bold text-[11px]">
                        <span className="flex items-center gap-1 text-csc-verde-texto">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          {confirmedList.length} sim
                        </span>
                        <span className="flex items-center gap-1 text-csc-gold">
                          <HelpCircle size={12} aria-hidden="true" />
                          {pendingList.length} sem resposta
                        </span>
                        {declinedList.length > 0 && (
                          <span className="flex items-center gap-1 text-csc-vermelho-texto">
                            <XCircle size={12} aria-hidden="true" />
                            {declinedList.length} não
                          </span>
                        )}
                        <span className="text-white/45">· {callups.length} {callups.length === 1 ? 'convocado' : 'convocados'}</span>
                        {isCoachOrAdmin && event.is_active === false && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleActivateEvent(event) }}
                            className="ml-auto min-h-11 px-3.5 bg-csc-light text-white rounded-[18px] text-[11px] font-display font-extrabold flex items-center gap-1.5 cursor-pointer active:scale-97"
                            title="Ativar evento e enviar convocatória aos membros"
                          >
                            <Send size={13} aria-hidden="true" />
                            <span>Ativar e convocar</span>
                          </button>
                        )}
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
      {/* O dossier de convocatória é um ecrã, não uma persiana — ver
          `EcraDetalhe`. A ficha de jogo abre a partir dele, como o ecrã
          seguinte; a ficha rápida do convocado continua persiana, por cima. */}
      <div>
      {activeCallupModalEvent && (
        <EcraDetalhe
          aberto={dossierAberto}
          voltarPara={voltarDoDossier}
          aoVoltar={fecharDossier}
          sobrancelha="Convocatória"
          titulo={activeCallupModalEvent.title || 'Convocatória'}
        >
          <div className="relative">
            {/* O emblema, o tipo, a data e os botões numa linha solta. Era um
                cartão verde com moldura dourada de 2px e sombra — a peça mais
                pesada do dossier, logo por baixo do título. */}
            <div className="text-white mb-5 relative">
              <div className="flex items-center justify-between gap-3">
                {/* 1. Símbolo + 2. Pílula de Tipo + 3. Data e Hora */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Símbolo Oficial do CSC */}
                  <div className="w-11 h-11 rounded-2xl bg-white p-1 shadow-md shrink-0 border border-csc-gold flex items-center justify-center">
                    <img 
                      src="/csc-vet/cascais-emblem.png" 
                      alt="CSC" 
                      className="w-full h-full object-contain" 
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* A cor de cada tipo é a da Agenda (`CORES_TIPO`): aqui o jogo
                          era azul e o convívio roxo, e lá o jogo é vermelho. */}
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${
                        CORES_TIPO[activeCallupModalEvent.type as keyof typeof CORES_TIPO]?.pastilha ?? ''
                      } ${CORES_TIPO[activeCallupModalEvent.type as keyof typeof CORES_TIPO]?.texto ?? 'text-white'}`}>
                        {activeCallupModalEvent.type === 'match' ? 'Jogo' : activeCallupModalEvent.type === 'practice' ? 'Treino' : 'Convívio'}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
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
                    className="px-3 py-1.5 bg-csc-gold hover:bg-csc-gold text-csc-tinta font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm shrink-0"
                  >
                    <ClipboardList size={13} />
                    <span>Ficha de Jogo</span>
                  </button>
                )}

                {/* 4. Botões Modificar e Apagar (Apenas Admin / Treinador) */}
                {isCoachOrAdmin && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <BotaoIcone
                      rotulo="Modificar evento"
                      icone={Pencil}
                      destaque
                      onClick={() => openEditModal(activeCallupModalEvent)}
                    />
                    <BotaoIcone
                      rotulo="Eliminar evento"
                      icone={Trash2}
                      perigo
                      onClick={() => {
                        const evId = activeCallupModalEvent.id
                        fecharDossier()
                        handleDeleteEvent(evId)
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Se o evento estiver inativo, alerta proeminente */}
            {activeCallupModalEvent.is_active === false && (
              <div className="mb-4 p-3.5 bg-csc-gold/10 rounded-2xl flex flex-col items-start justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-csc-gold">
                  <AlertTriangle size={18} className="text-csc-gold shrink-0" />
                  <span>Este evento está em modo <strong>Rascunho (Inativo)</strong>. A convocatória não foi enviada e não está visível para os atletas.</span>
                </div>
                {isCoachOrAdmin && (
                  <button
                    type="button"
                    onClick={() => handleActivateEvent(activeCallupModalEvent)}
                    className="w-full px-4 py-2 bg-csc-light hover:bg-csc-light text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 shrink-0"
                  >
                    <Send size={13} className="text-csc-verde-texto" />
                    <span>Ativar e Enviar Convocatória</span>
                  </button>
                )}
              </div>
            )}

            {(() => {
              const callups = eventCallups[activeCallupModalEvent.id] || []

              /*
                Quem foi convocado apto e entretanto ficou lesionado ou inativo
                continua aqui — a linha existe e a resposta que já deu conta.
                Fica marcado, para se ver de relance quem já não tem condições.
              */
              const estadoQueImpede = (c: { player_id: string; player?: Profile | null }): string | null => {
                const p = allPlayers.find(pl => pl.id === c.player_id) || c.player
                if (!p || isPlayerEligible(p, activeCallupModalEvent.type, activeCallupModalEvent.tournament_id)) return null
                if (p.status === 'inactive') return 'Inativo'
                if (p.status === 'injured') return 'Lesionado'
                return 'Não é atleta'
              }

              const calledPlayerIds = callups.map(c => c.player_id)
              /* Só quem pode ir: jogadores aptos num jogo ou treino, toda a
                 gente menos os inativos num convívio. A lista mostrava o
                 plantel inteiro, e tocar num treinador para um jogo dava um
                 aviso em vez de o esconder à partida. */
              const uncalledPlayers = allPlayers.filter(p =>
                !calledPlayerIds.includes(p.id) &&
                isPlayerEligible(p, activeCallupModalEvent.type, activeCallupModalEvent.tournament_id))
              const evId = activeCallupModalEvent.id

              /* O bloco é o da Agenda (`BlocoConvocatoria`); aqui leva as
                 ações, porque é o único sítio onde a convocatória se edita. */
              return (
                <BlocoConvocatoria
                  key={evId}
                  convocatorias={callups}
                  maxJogadores={activeCallupModalEvent.max_players}
                  gere={Boolean(isCoachOrAdmin)}
                  estadoQueImpede={estadoQueImpede}
                  abertoInicial
                  acoes={isCoachOrAdmin ? {
                    mudarEstado: (id, estado) => handleUpdateCallupStatus(id, evId, estado),
                    tirar: id => handleRemovePlayerFromCallup(id, evId),
                    tirarVarios: ids => handleTirarVarios(ids, evId),
                    abrir: setConvocadoAberto,
                  } : undefined}
                  acrescentar={isCoachOrAdmin && uncalledPlayers.length > 0 && (
                    <div className="p-3.5 bg-white/5 rounded-2xl space-y-2">
                      <p className="text-xs font-black text-white/80 flex items-center gap-1.5">
                        <UserPlus size={14} className="text-csc-gold" />
                        <span>Adicionar mais membros ao evento:</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                        {uncalledPlayers.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleAddPlayerToCallup(evId, p.id)}
                            className="bg-white/8 text-xs px-2.5 py-1 rounded-xl font-bold text-white flex items-center gap-1 shadow-2xs hover:bg-white/15 cursor-pointer active:scale-97"
                          >
                            <span>+ {p.name}</span>
                            {p.jersey_number && <span className="text-csc-gold font-black">#{p.jersey_number}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                />
              )
            })()}

          </div>
        </EcraDetalhe>
      )}

      {/* A ficha rápida do convocado (4a), uma persiana por cima do dossier. */}
      {activeCallupModalEvent && (() => {
        const tira = (eventCallups[activeCallupModalEvent.id] || []) as CallupWithPlayer[]
        const aberta = tira.find(c => c.id === convocadoAberto) ?? null
        return (
          <FichaConvocado
            convocatoria={aberta}
            tira={tira}
            displayName={aberta ? getPlayerDisplayName(aberta.player) : ''}
            aoEscolher={setConvocadoAberto}
            aoFechar={() => setConvocadoAberto(null)}
            aoConfirmar={() => aberta && handleUpdateCallupStatus(aberta.id, activeCallupModalEvent.id, 'confirmed')}
            aoRecusar={() => aberta && handleUpdateCallupStatus(aberta.id, activeCallupModalEvent.id, 'declined')}
            aoRemover={() => {
              if (!aberta) return
              handleRemovePlayerFromCallup(aberta.id, activeCallupModalEvent.id)
              setConvocadoAberto(null)
            }}
          />
        )
      })()}
      </div>
      {/* Editar um evento: o mesmo ecrã da Agenda (`EditarEvento`). Abre por
          cima do dossier de onde se veio, e o "‹" volta a ele. */}
      <EditarEvento
        evento={eventoAEditar}
        voltarPara={dossierAberto ? 'Convocatória' : 'Eventos'}
        aoFechar={() => setEventoAEditar(null)}
        aoGravado={async gravado => {
          setActiveCallupModalEvent(prev => (prev && prev.id === gravado.id ? { ...prev, ...gravado } as Event : prev))
          setEventoAEditar(null)
          await fetchData()
        }}
        aoMudarConvocatoria={() => fetchData()}
        convocatorias={eventoAEditar ? (eventCallups[eventoAEditar.id] || []) : []}
        plantel={allPlayers}
        campos={fields}
        adversarios={opponents}
        provas={tournaments}
        aoCriarCampo={campo => setFields(prev => [...prev.filter(f => f.id !== campo.id), campo].sort((x, y) => x.name.localeCompare(y.name)))}
        aoCriarAdversario={adv => setOpponents(prev => [...prev.filter(o => o.id !== adv.id), adv as Opponent].sort((x, y) => x.name.localeCompare(y.name)))}
      />

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

      <UnsavedChangesModal {...guardaCriacao.props} />

      {/* Modal de Ficha de Jogo (Esquema Tático, Marcadores, Cartões e Ocorrências) */}
      {activeCallupModalEvent && activeCallupModalEvent.type === 'match' && (
        <MatchReportModal
          isOpen={isMatchReportOpen}
          onClose={() => setIsMatchReportOpen(false)}
          eventId={activeCallupModalEvent.id}
          event={activeCallupModalEvent}
          isCoachOrAdmin={!!isCoachOrAdmin}
          tournamentRules={tournaments.find(t => t.id === activeCallupModalEvent.tournament_id)?.rules}
          voltarPara="Convocatória"
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

      {/* Guardar leva à convocatória (ecrãs 4f e 4g). */}
      <ConvocatoriaAoCriar
        evento={eventoAConvocar}
        aoFechar={() => setEventoAConvocar(null)}
        aptos={allPlayers.filter(p => isPlayerEligible(p, eventoAConvocar?.tipo ?? 'match'))}
        todos={allPlayers}
        preEscolhidos={preEscolhidos}
        aoConvocar={() => { fetchData() }}
      />

    </div>
  )
}

export default EventsPage
