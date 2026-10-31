import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import {
  Trophy, Shield, Info, Plus, Pencil, Trash2, X, Check,
  Calendar, CalendarDays, ScrollText, SlidersHorizontal, MapPin, Clock, ChevronDown, Sparkles,
} from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal } from '../components/Modal'
import { BottomSheet } from '../components/BottomSheet'
import { ProcuraEFiltros } from '../components/ProcuraEFiltros'
import { useClub } from '../context/ClubContext'
import { Botao, Pastilha, BotaoIcone, ACarregar, EstadoVazio } from '../components/ui'
import { calcularClassificacao, equipaDoTorneio, jogoTerminado } from '../lib/classificacao'
import {
  isTorneioEliminatoria,
  obterRotuloEliminatoria,
  obterFasesEliminatoria,
  DEFAULT_TOURNAMENT_RULES,
  DEFAULT_KNOCKOUT_TOURNAMENT_RULES,
  type KnockoutMatchMeta,
} from '../components/clube/torneios'
import {
  garantirTacaVeteranos2026,
  obterMetaJogoKnockout,
  resolverEquipaKnockout,
  determinarVencedorKnockout,
} from '../lib/tacaVeteranos2026'
import { garantirSidelineVeteranos2026 } from '../lib/sidelineVeteranos2026'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { mensagemDeErro } from '../lib/erros'
import { CLASSE_CAMPO as CAMPO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from '../components/ui/formulario'

const ROTULO_PROVAS = { current: 'Em curso e agendadas', history: 'Terminadas' } as const

/**
 * Emblema pequeno de uma equipa de torneio, o mesmo da tabela. Sem emblema
 * desenha um escudo e nunca as iniciais: a sigla está ao lado, e repeti-la era
 * lê-la duas vezes.
 */
const isEquipaDoClube = (team: any, clubSettings: any): boolean => {
  if (!team) return false
  if (team.opponent_id === null || team.opponent_id === undefined || team.opponent_id === '') return true
  const oppName = (team.opponent?.name || '').toLowerCase().trim()
  const oppSigla = (team.opponent?.initials || '').toLowerCase().trim()
  const cscName = (clubSettings?.name || 'cascais').toLowerCase().trim()
  const cscSigla = (clubSettings?.initials || 'csc').toLowerCase().trim()
  if (oppName === 'cascais' || oppName.includes('veteranos cascais') || oppName.includes('gds cascais') || oppName === cscName) return true
  if (oppSigla === 'csc' || oppSigla === cscSigla) return true
  return false
}

const verificarSeJogoDoClube = (
  match: any,
  meta: any,
  allMatches: any[],
  teams: any[],
  clubSettings: any,
  rules?: any
): boolean => {
  if (!match) return false
  if (match.event_id) return true

  // 1. Equipas resolvidas no confronto
  const casa = resolverEquipaKnockout('home', match, meta, allMatches, teams, clubSettings, rules)
  const fora = resolverEquipaKnockout('away', match, meta, allMatches, teams, clubSettings, rules)
  if (casa.eOClube || fora.eOClube) return true

  // 2. Nomes e siglas
  const nomeCasa = (casa.nome || '').toLowerCase()
  const nomeFora = (fora.nome || '').toLowerCase()
  const siglaCasa = (casa.sigla || '').toLowerCase()
  const siglaFora = (fora.sigla || '').toLowerCase()
  if (nomeCasa.includes('cascais') || siglaCasa === 'csc') return true
  if (nomeFora.includes('cascais') || siglaFora === 'csc') return true

  // 3. IDs em tournament_teams
  const cscTeam = teams.find(t => isEquipaDoClube(t, clubSettings))
  if (cscTeam) {
    if (match.home_team_id === cscTeam.id || match.away_team_id === cscTeam.id) return true
  }

  // 4. Placeholders
  const hp = (meta?.home_placeholder || '').toLowerCase()
  const ap = (meta?.away_placeholder || '').toLowerCase()
  if (hp.includes('cascais') || ap.includes('cascais')) return true

  return false
}

const EmblemaTorneio = ({ logo, eOClube }: { logo: string | null; eOClube: boolean }) => (
  <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
    {logo ? (
      <img src={logo} alt="" className="w-full h-full object-contain bg-white" />
    ) : (
      <Shield size={11} className={eOClube ? 'text-csc-gold' : 'text-white/30'} />
    )}
  </span>
)

export const StandingsPage = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const canManage = profile?.role === 'admin' || profile?.role === 'coach'
  const [params, setParams] = useSearchParams()

  const [tournaments, setTournaments] = useState<any[]>([])
  /*
    A prova escolhida vai no endereço (`?torneio=`), como o separador vai no
    `?ver=`: sem isso não havia como ligar a uma classificação em concreto, e a
    ficha do adversário só podia mandar quem clicasse para a primeira prova da
    lista.
  */
  const [selectedTourId, setSelectedTourId] = useState<string>(params.get('torneio') ?? '')
  // Agendados e ativos ficam juntos em "Em Curso"; terminados passam para o Histórico.
  const [tourViewFilter, setTourViewFilter] = useState<'current' | 'history'>('current')

  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activePhase, setActivePhase] = useState<number>(1)

  // Filtro de eliminatória para torneios de Taça (0 = Todas, 1 = Oitavos, 2 = Quartos, 3 = Meias, 4 = Final)
  const [eliminatoriaFiltro, setEliminatoriaFiltro] = useState<number>(0)

  // Modal de criar/editar jogo de eliminatória (Taça)
  const [knockoutModalOpen, setKnockoutModalOpen] = useState(false)
  const [knockoutEditId, setKnockoutEditId] = useState<string | null>(null)
  const [koMatchNumber, setKoMatchNumber] = useState('1')
  const [koRound, setKoRound] = useState('1')
  const [koHomeTeamId, setKoHomeTeamId] = useState('')
  const [koAwayTeamId, setKoAwayTeamId] = useState('')
  const [koHomePlaceholder, setKoHomePlaceholder] = useState('')
  const [koAwayPlaceholder, setKoAwayPlaceholder] = useState('')
  const [koDate, setKoDate] = useState('')
  const [koTime, setKoTime] = useState('')
  const [koLocation, setKoLocation] = useState('')
  const [koHomeScore, setKoHomeScore] = useState('')
  const [koAwayScore, setKoAwayScore] = useState('')
  const [koHomePenalties, setKoHomePenalties] = useState('')
  const [koAwayPenalties, setKoAwayPenalties] = useState('')
  const [savingKnockout, setSavingKnockout] = useState(false)

  // Encadeamento de equipas no jogo a eliminar
  const [koHomeSourceType, setKoHomeSourceType] = useState<'team' | 'winner' | 'loser' | 'custom'>('team')
  const [koHomeSourceMatch, setKoHomeSourceMatch] = useState('1')
  const [koAwaySourceType, setKoAwaySourceType] = useState<'team' | 'winner' | 'loser' | 'custom'>('team')
  const [koAwaySourceMatch, setKoAwaySourceMatch] = useState('1')



  // Jornadas — só admin/coach mexem aqui; a introdução de resultados vive na Classificação
  // (junto da tabela que alimenta), em vez de num ecrã de administração à parte.
  const [jornadaModalGroupId, setJornadaModalGroupId] = useState<string | null>(null)
  const [jornadaMatchday, setJornadaMatchday] = useState('1')
  const [jornadaDate, setJornadaDate] = useState('')
  const [jornadaFixtures, setJornadaFixtures] = useState<{ home: string; away: string }[]>([{ home: '', away: '' }])

  /* Uma jornada com jogos já marcados não se perde num Escape. */
  const guardaJornada = useAlteracoesPorGravar({
    aberto: !!jornadaModalGroupId,
    valores: [jornadaMatchday, jornadaDate, jornadaFixtures],
    aoGravar: () => handleCreateJornada(),
    aoSair: () => setJornadaModalGroupId(null),
    descricao: 'A jornada que estás a criar ainda não foi gravada. Se saíres agora, perde-se.',
  })
  const [savingJornada, setSavingJornada] = useState(false)

  /*
    Que jornada está aberta em cada grupo. Vazio quer dizer "a que está em
    foco", calculada mais abaixo — só se guarda aqui a escolha de quem tocou
    numa pastilha.
  */
  const [jornadaAberta, setJornadaAberta] = useState<Record<string, number>>({})

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editHomeScore, setEditHomeScore] = useState('')
  const [editAwayScore, setEditAwayScore] = useState('')
  const [editDate, setEditDate] = useState('')

  /*
    O resultado escrito à mão numa linha da tabela — dois números e a data —
    também é trabalho por gravar: fechar a edição com o X deitava-o fora sem
    perguntar.
  */
  const guardaResultado = useAlteracoesPorGravar({
    aberto: !!editingMatchId,
    valores: [editHomeScore, editAwayScore, editDate],
    aoGravar: () => (editingMatchId ? handleSaveMatch(editingMatchId) : undefined),
    aoSair: () => setEditingMatchId(null),
    descricao: 'O resultado que escreveste ainda não foi gravado. Se saíres agora, perde-se.',
  })

  const [matchToDelete, setMatchToDelete] = useState<string | null>(null)

  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  /* O ponto de partida: em curso, ou o histórico quando não há nada em
     curso. Não é um filtro posto por ninguém, e o funil não acende. */
  const [vistaInicial, setVistaInicial] = useState<'current' | 'history'>('current')

  const visibleTournaments = tournaments.filter(t => tourViewFilter === 'history' ? t.status === 'terminado' : t.status !== 'terminado')

  useEffect(() => {
    fetchTournaments()
    garantirTacaVeteranos2026().then(id => {
      if (id) fetchTournaments()
    })
  }, [])

  useEffect(() => {
    if (!selectedTourId) return
    setEliminatoriaFiltro(0)
    fetchStandingsData()
    /* A prova escolhida acompanha o endereço — `replace` porque andar entre
       provas não deve encher o histórico. */
    if (params.get('torneio') === selectedTourId) return
    const seguintes = new URLSearchParams(params)
    seguintes.set('torneio', selectedTourId)
    setParams(seguintes, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTourId])

  /*
    Ao trocar de filtro, se a prova escolhida não pertence à lista visível,
    escolhe a primeira dela. A prova que veio no endereço tem precedência
    enquanto existir: quem chega de um link à ficha do adversário tem de cair
    na prova certa, mesmo que ela esteja no Histórico e o filtro abra em curso.
  */
  useEffect(() => {
    if (visibleTournaments.some(t => t.id === selectedTourId)) return
    const doEndereco = params.get('torneio')
    if (doEndereco && tournaments.some(t => t.id === doEndereco)) {
      setSelectedTourId(doEndereco)
      return
    }
    if (visibleTournaments.length > 0) setSelectedTourId(visibleTournaments[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourViewFilter, tournaments])

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false })
    if (data) {
      setTournaments(data)
      setSelectedTourId(prev => {
        if (prev && data.some(t => t.id === prev)) return prev
        const doEndereco = params.get('torneio')
        if (doEndereco && data.some(t => t.id === doEndereco)) return doEndereco
        const active = data.find(t => t.status === 'ativo')
        if (active) return active.id
        const firstCurrent = data.find(t => t.status !== 'terminado')
        if (firstCurrent) return firstCurrent.id
        if (data.length > 0) {
          setTourViewFilter('history')
          setVistaInicial('history')
          return data[0].id
        }
        return ''
      })
    }
  }

  const fetchStandingsData = async () => {
    setLoading(true)
    const [groupsRes, teamsRes, matchesRes, eventsRes] = await Promise.all([
      supabase.from('tournament_groups').select('*').eq('tournament_id', selectedTourId).order('name'),
      supabase.from('tournament_teams').select('*, opponent:opponents(*)').eq('tournament_id', selectedTourId),
      // Todas as jornadas (agendadas e realizadas) — a classificação só conta as realizadas,
      // mas a lista de jornadas mostra também os jogos ainda por realizar.
      /* Os nossos jogos estão aqui também: o evento espelha-se na jornada
         que se lhe escolheu, e a ficha de jogo lança-lhe o resultado. */
      supabase.from('tournament_matches').select('*').eq('tournament_id', selectedTourId).order('matchday'),
      supabase.from('events').select('id, opponent_id, matchday, home_score, away_score, home_away, date_time, is_active').eq('tournament_id', selectedTourId),
    ])

    const loadedMatches = matchesRes.data || []
    const loadedTeams = teamsRes.data || []
    const loadedEvents = eventsRes.data || []
    const cscTeam = loadedTeams.find(t => isEquipaDoClube(t, clubSettings))

    // Sincronizar e auto-ligar jogos do Cascais que ainda não tenham event_id
    if (cscTeam) {
      for (const m of loadedMatches) {
        const isCscMatch = m.home_team_id === cscTeam.id || m.away_team_id === cscTeam.id
        if (isCscMatch && !m.event_id) {
          const otherTeamId = m.home_team_id === cscTeam.id ? m.away_team_id : m.home_team_id
          const otherTeam = loadedTeams.find(t => t.id === otherTeamId)
          const oppId = otherTeam?.opponent_id ?? null

          const matchedEv = loadedEvents.find(ev => {
            if (oppId && ev.opponent_id === oppId) return true
            if (m.matchday && ev.matchday === m.matchday) return true
            return false
          })

          if (matchedEv) {
            m.event_id = matchedEv.id
            const temScore = matchedEv.home_score !== null && matchedEv.home_score !== undefined
              && matchedEv.away_score !== null && matchedEv.away_score !== undefined
            if (temScore) {
              const cascaisScore = matchedEv.home_away === 'away' ? matchedEv.away_score : matchedEv.home_score
              const elesScore = matchedEv.home_away === 'away' ? matchedEv.home_score : matchedEv.away_score
              m.home_score = m.home_team_id === cscTeam.id ? cascaisScore : elesScore
              m.away_score = m.home_team_id === cscTeam.id ? elesScore : cascaisScore
              m.status = 'finished'
            }
            supabase.from('tournament_matches').update({
              event_id: matchedEv.id,
              home_score: m.home_score,
              away_score: m.away_score,
              status: m.status,
            }).eq('id', m.id).then()
          }
        }
      }
    }

    if (groupsRes.data) {
      setGroups(groupsRes.data)
      const phases = Array.from(new Set(groupsRes.data.map(g => g.phase))).sort((a, b) => a - b)
      setActivePhase(prev => (phases.includes(prev) ? prev : (phases[0] ?? 1)))
    }
    if (teamsRes.data) setTeams(loadedTeams)
    if (matchesRes.data) setMatches(loadedMatches)

    setLoading(false)
  }

  /* A tabela e os desempates vivem em `src/lib/classificacao.ts` — a Home
     mostra a mesma classificação e não pode fazer a conta por sua conta. */
  const getStandingsForGroup = (groupId: string) =>
    calcularClassificacao(teams, matches, groupId, selectedTournament?.rules)

  // --- JORNADAS (agendar + registar resultados) ---
  const openJornadaModal = (groupId: string) => {
    const groupMatchdays = matches.filter(m => m.group_id === groupId).map(m => m.matchday)
    const nextMatchday = groupMatchdays.length > 0 ? Math.max(...groupMatchdays) + 1 : 1
    setJornadaMatchday(String(nextMatchday))
    setJornadaDate('')
    setJornadaFixtures([{ home: '', away: '' }])
    setJornadaModalGroupId(groupId)
  }

  const addFixtureRow = () => setJornadaFixtures(prev => [...prev, { home: '', away: '' }])
  const removeFixtureRow = (idx: number) => setJornadaFixtures(prev => prev.filter((_, i) => i !== idx))
  const updateFixtureRow = (idx: number, field: 'home' | 'away', value: string) => {
    setJornadaFixtures(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f))
  }

  const handleCreateJornada = async () => {
    if (!jornadaModalGroupId) return
    const matchday = parseInt(jornadaMatchday) || 1
    const validFixtures = jornadaFixtures.filter(f => f.home && f.away && f.home !== f.away)
    if (validFixtures.length === 0) {
      toast.warning('Indica pelo menos um jogo com as duas equipas escolhidas.')
      return
    }
    setSavingJornada(true)
    const rows = validFixtures.map(f => ({
      tournament_id: selectedTourId,
      group_id: jornadaModalGroupId,
      matchday,
      home_team_id: f.home,
      away_team_id: f.away,
      match_date: jornadaDate || null,
      status: 'scheduled',
    }))
    const { error } = await supabase.from('tournament_matches').insert(rows)
    setSavingJornada(false)
    if (error) {
      toast.error('Não foi possível criar a jornada: ' + mensagemDeErro(error))
      return
    }
    toast.success(`Jornada ${matchday} criada com ${validFixtures.length} ${validFixtures.length === 1 ? 'jogo' : 'jogos'}.`)
    /* Quem acabou de criar a jornada quer vê-la, não a que estava aberta. */
    setJornadaAberta(prev => ({ ...prev, [jornadaModalGroupId]: matchday }))
    setJornadaModalGroupId(null)
    fetchStandingsData()
  }

  const startEditMatch = (m: any) => {
    setEditingMatchId(m.id)
    setEditHomeScore(m.home_score ?? '')
    setEditAwayScore(m.away_score ?? '')
    setEditDate(m.match_date ? String(m.match_date).slice(0, 10) : '')
  }

  const handleSaveMatch = async (matchId: string) => {
    const hasScore = editHomeScore !== '' && editAwayScore !== ''
    const { error } = await supabase.from('tournament_matches').update({
      home_score: hasScore ? parseInt(editHomeScore) : null,
      away_score: hasScore ? parseInt(editAwayScore) : null,
      match_date: editDate || null,
      status: hasScore ? 'finished' : 'scheduled',
    }).eq('id', matchId)
    if (error) {
      toast.error('Não foi possível guardar o resultado: ' + mensagemDeErro(error))
      return
    }
    toast.success(hasScore ? 'Resultado registado!' : 'Jogo atualizado.')
    setEditingMatchId(null)
    fetchStandingsData()
  }

  const handleDeleteMatch = async () => {
    if (!matchToDelete) return
    const { error } = await supabase.from('tournament_matches').delete().eq('id', matchToDelete)
    setMatchToDelete(null)
    /* Apagar-se agora de dentro da edição: sem isto ficava a edição aberta
       num jogo que já não existe, e o guarda de alterações por gravar
       continuava a achar que havia um resultado por gravar. */
    setEditingMatchId(null)
    setKnockoutModalOpen(false)
    if (error) {
      toast.error('Não foi possível eliminar o jogo: ' + mensagemDeErro(error))
      return
    }
    toast.success('Jogo eliminado.')
    fetchStandingsData()
  }

  // --- KNOCKOUT / ELIMINATÓRIAS (Fases e Encadeamentos Dinâmicos) ---


  const openNewKnockoutMatch = (defaultRound = 1) => {
    triggerHaptic('light')
    const existingNums = matches.map((m, idx) => {
      const meta = obterMetaJogoKnockout(selectedTournament?.rules, m, matches)
      return meta?.match_number ?? idx + 1
    })
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    setKnockoutEditId(null)
    setKoMatchNumber(String(nextNum))
    setKoRound(String(defaultRound || 1))
    setKoHomeTeamId('')
    setKoAwayTeamId('')
    setKoHomePlaceholder('')
    setKoAwayPlaceholder('')
    setKoHomeSourceType('team')
    setKoHomeSourceMatch('1')
    setKoAwaySourceType('team')
    setKoAwaySourceMatch('1')
    setKoDate('')
    setKoTime('15H00')
    setKoLocation('')
    setKoHomeScore('')
    setKoAwayScore('')
    setKoHomePenalties('')
    setKoAwayPenalties('')
    setKnockoutModalOpen(true)
  }

  const openEditKnockoutMatch = (m: any, fallbackNumber: number) => {
    triggerHaptic('light')
    const meta = obterMetaJogoKnockout(selectedTournament?.rules, m, matches)
    setKnockoutEditId(m.id)
    setKoMatchNumber(String(meta?.match_number ?? fallbackNumber))
    setKoRound(String(m.matchday || 1))
    setKoHomeTeamId(m.home_team_id || '')
    setKoAwayTeamId(m.away_team_id || '')
    setKoHomePlaceholder(meta?.home_placeholder || '')
    setKoAwayPlaceholder(meta?.away_placeholder || '')

    // Determinar tipo de origem e número de jogo encadeado (visitado)
    if (m.home_team_id) {
      setKoHomeSourceType('team')
      setKoHomeSourceMatch('1')
    } else {
      const hp = (meta?.home_placeholder || '').trim()
      const mWin = hp.match(/vencedor\s+(?:do\s+)?jogo\s+(\d+)/i)
      const mLos = hp.match(/(?:derrotado|perdedor)\s+(?:do\s+)?jogo\s+(\d+)/i)
      if (mWin) {
        setKoHomeSourceType('winner')
        setKoHomeSourceMatch(mWin[1])
      } else if (mLos) {
        setKoHomeSourceType('loser')
        setKoHomeSourceMatch(mLos[1])
      } else if (hp) {
        setKoHomeSourceType('custom')
      } else {
        setKoHomeSourceType('team')
        setKoHomeSourceMatch('1')
      }
    }

    // Determinar tipo de origem e número de jogo encadeado (visitante)
    if (m.away_team_id) {
      setKoAwaySourceType('team')
      setKoAwaySourceMatch('1')
    } else {
      const ap = (meta?.away_placeholder || '').trim()
      const mWin = ap.match(/vencedor\s+(?:do\s+)?jogo\s+(\d+)/i)
      const mLos = ap.match(/(?:derrotado|perdedor)\s+(?:do\s+)?jogo\s+(\d+)/i)
      if (mWin) {
        setKoAwaySourceType('winner')
        setKoAwaySourceMatch(mWin[1])
      } else if (mLos) {
        setKoAwaySourceType('loser')
        setKoAwaySourceMatch(mLos[1])
      } else if (ap) {
        setKoAwaySourceType('custom')
      } else {
        setKoAwaySourceType('team')
        setKoAwaySourceMatch('1')
      }
    }

    setKoDate(m.match_date ? String(m.match_date).slice(0, 10) : '')
    setKoTime(meta?.match_time || '')
    setKoLocation(meta?.location || '')
    setKoHomeScore(m.home_score !== null && m.home_score !== undefined ? String(m.home_score) : '')
    setKoAwayScore(m.away_score !== null && m.away_score !== undefined ? String(m.away_score) : '')
    setKoHomePenalties(meta?.home_penalties !== null && meta?.home_penalties !== undefined ? String(meta.home_penalties) : '')
    setKoAwayPenalties(meta?.away_penalties !== null && meta?.away_penalties !== undefined ? String(meta.away_penalties) : '')
    setKnockoutModalOpen(true)
  }

  const handleSaveKnockoutMatch = async () => {
    if (!selectedTourId || !selectedTournament) return
    const roundNum = parseInt(koRound, 10) || 1
    const matchNum = parseInt(koMatchNumber, 10) || 1
    const hasScore = koHomeScore !== '' && koAwayScore !== ''
    const hasPens = koHomePenalties !== '' && koAwayPenalties !== ''

    // Calcular placeholders e ids com base no encadeamento configurado
    let finalHomeTeamId: string | null = null
    let finalHomePlaceholder: string | null = null
    let homeSourceType = koHomeSourceType
    let homeSourceMatchNum: number | null = null

    if (koHomeSourceType === 'team') {
      finalHomeTeamId = koHomeTeamId || null
      if (!finalHomeTeamId) {
        toast.warning('Escolhe a equipa visitada (casa).')
        return
      }
    } else if (koHomeSourceType === 'winner') {
      homeSourceMatchNum = parseInt(koHomeSourceMatch, 10) || 1
      finalHomePlaceholder = `VENCEDOR JOGO ${homeSourceMatchNum}`
    } else if (koHomeSourceType === 'loser') {
      homeSourceMatchNum = parseInt(koHomeSourceMatch, 10) || 1
      finalHomePlaceholder = `DERROTADO JOGO ${homeSourceMatchNum}`
    } else {
      finalHomePlaceholder = koHomePlaceholder.trim() || null
      if (!finalHomePlaceholder) {
        toast.warning('Indica a referência da equipa visitada (ex: 1º Grupo A).')
        return
      }
    }

    let finalAwayTeamId: string | null = null
    let finalAwayPlaceholder: string | null = null
    let awaySourceType = koAwaySourceType
    let awaySourceMatchNum: number | null = null

    if (koAwaySourceType === 'team') {
      finalAwayTeamId = koAwayTeamId || null
      if (!finalAwayTeamId) {
        toast.warning('Escolhe a equipa visitante (fora).')
        return
      }
    } else if (koAwaySourceType === 'winner') {
      awaySourceMatchNum = parseInt(koAwaySourceMatch, 10) || 1
      finalAwayPlaceholder = `VENCEDOR JOGO ${awaySourceMatchNum}`
    } else if (koAwaySourceType === 'loser') {
      awaySourceMatchNum = parseInt(koAwaySourceMatch, 10) || 1
      finalAwayPlaceholder = `DERROTADO JOGO ${awaySourceMatchNum}`
    } else {
      finalAwayPlaceholder = koAwayPlaceholder.trim() || null
      if (!finalAwayPlaceholder) {
        toast.warning('Indica a referência da equipa visitante (ex: VENCEDOR JOGO 1).')
        return
      }
    }

    setSavingKnockout(true)
    try {
      // Garantir que existe pelo menos um grupo para o torneio
      let groupId = groups[0]?.id
      if (!groupId) {
        const { data: novoGrupo, error: erroGrupo } = await supabase
          .from('tournament_groups')
          .insert([{ tournament_id: selectedTourId, name: 'Quadro Competitivo', phase: 1 }])
          .select('id')
          .single()
        if (erroGrupo) throw erroGrupo
        groupId = novoGrupo.id
      }

      const matchAEditar = matches.find(m => m.id === knockoutEditId)
      const cscTeamObj = teams.find(t => t.opponent_id === null)
      const ehJogoCascais = matchAEditar
        ? (matchAEditar.home_team_id === cscTeamObj?.id || matchAEditar.away_team_id === cscTeamObj?.id || Boolean(matchAEditar.event_id))
        : (finalHomeTeamId === cscTeamObj?.id || finalAwayTeamId === cscTeamObj?.id)

      let finalHomeScore = hasScore ? parseInt(koHomeScore, 10) : null
      let finalAwayScore = hasScore ? parseInt(koAwayScore, 10) : null
      let finalStatus = hasScore ? 'finished' : 'scheduled'

      if (ehJogoCascais && matchAEditar) {
        finalHomeScore = matchAEditar.home_score
        finalAwayScore = matchAEditar.away_score
        finalStatus = matchAEditar.status
      }

      const payload: any = {
        tournament_id: selectedTourId,
        group_id: groupId,
        matchday: roundNum,
        home_team_id: finalHomeTeamId,
        away_team_id: finalAwayTeamId,
        match_date: koDate || null,
        home_score: finalHomeScore,
        away_score: finalAwayScore,
        status: finalStatus,
      }
      if (matchAEditar?.event_id) {
        payload.event_id = matchAEditar.event_id
      }

      let savedMatchId = knockoutEditId
      if (knockoutEditId) {
        const { error } = await supabase.from('tournament_matches').update(payload).eq('id', knockoutEditId)
        if (error) throw error
      } else {
        const { data: inserido, error } = await supabase
          .from('tournament_matches')
          .insert([payload])
          .select('id')
          .single()
        if (error) throw error
        savedMatchId = inserido?.id ?? null
      }

      // Atualizar metadados do jogo da eliminatória em `tournaments.rules.knockout_matches`
      const currentRules = selectedTournament.rules || DEFAULT_KNOCKOUT_TOURNAMENT_RULES
      const currentMetaMap: Record<string, KnockoutMatchMeta> = {
        ...(currentRules.knockout_matches && !Array.isArray(currentRules.knockout_matches) ? currentRules.knockout_matches : {}),
      }

      const roundLabelCalculado = obterRotuloEliminatoria(roundNum, null, currentRules)
      const newMeta: KnockoutMatchMeta = {
        match_id: savedMatchId || undefined,
        match_number: matchNum,
        matchday: roundNum,
        round_label: roundLabelCalculado,
        home_placeholder: finalHomePlaceholder,
        away_placeholder: finalAwayPlaceholder,
        home_source_type: homeSourceType,
        home_source_match_num: homeSourceMatchNum,
        away_source_type: awaySourceType,
        away_source_match_num: awaySourceMatchNum,
        location: koLocation.trim() || null,
        match_date: koDate || null,
        match_time: koTime.trim() || null,
        home_penalties: hasPens ? parseInt(koHomePenalties, 10) : null,
        away_penalties: hasPens ? parseInt(koAwayPenalties, 10) : null,
      }

      if (savedMatchId) {
        currentMetaMap[savedMatchId] = newMeta
      }
      currentMetaMap[`jogo_${matchNum}`] = newMeta

      const novasRegras = {
        ...currentRules,
        knockout_matches: currentMetaMap,
      }

      const { error: erroTour } = await supabase
        .from('tournaments')
        .update({ rules: novasRegras })
        .eq('id', selectedTourId)
      if (erroTour) throw erroTour

      setTournaments(prev => prev.map(t => (t.id === selectedTourId ? { ...t, rules: novasRegras } : t)))
      setMatches(prev => {
        if (knockoutEditId) {
          return prev.map(m => (m.id === knockoutEditId ? { ...m, ...payload } : m))
        }
        return [...prev, { id: savedMatchId || `ko-${Date.now()}`, ...payload }]
      })
      toast.success(knockoutEditId ? `Jogo ${matchNum} atualizado!` : `Jogo ${matchNum} adicionado!`)
      setKnockoutModalOpen(false)
    } catch (err: any) {
      toast.error('Erro ao guardar jogo da eliminatória: ' + mensagemDeErro(err))
    } finally {
      setSavingKnockout(false)
    }
  }

  const phaseGroups = groups.filter(g => g.phase === activePhase)
  const phasesAvailable = Array.from(new Set(groups.map(g => g.phase))).sort((a, b) => a - b)
  const selectedTournament = tournaments.find(t => t.id === selectedTourId)
  const jornadaModalGroup = groups.find(g => g.id === jornadaModalGroupId)
  const ehTorneioTaca = isTorneioEliminatoria(selectedTournament)
  const isSidelineTournament = Boolean(
    selectedTournament && (
      (selectedTournament.name || '').toLowerCase().includes('sideline') ||
      (selectedTournament.organizer_name || '').toLowerCase().includes('sideline') ||
      (selectedTournament.name || '').toLowerCase().includes('liga masters') ||
      (selectedTournament.name || '').toLowerCase().includes('masters 35')
    )
  )

  useEffect(() => {
    if (!selectedTourId || !isSidelineTournament) return
    garantirSidelineVeteranos2026({ tournamentId: selectedTourId }).then(res => {
      if (res && res.totalCriados > 0) {
        fetchStandingsData()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTourId, isSidelineTournament])

  return (
    <div className="space-y-4">
      {/*
        Cabeçalho das Classificações (ecrã 1c). O título do ecrã é o da
        Competição, aqui em cima — este é o cabeçalho do separador, e por isso
        a sobrancelha diz de que torneios se está a falar em vez de repetir a
        palavra "Classificações".
      */}
      {tournaments.length > 0 && (
        <div className="space-y-3">
          <ProcuraEFiltros
            legenda={
              <>
                <p className="font-display font-bold text-[8.5px] tracking-[0.12em] uppercase text-white/62">A mostrar</p>
                <p className="font-display font-black text-[13px] text-white truncate mt-0.5">
                  {ROTULO_PROVAS[tourViewFilter]}
                </p>
              </>
            }
            aoAbrirFiltros={() => setFiltrosAbertos(true)}
            filtrosAtivos={tourViewFilter !== vistaInicial}
            resumo={[ROTULO_PROVAS[tourViewFilter]]}
            contagem={`${visibleTournaments.length} ${visibleTournaments.length === 1 ? 'prova' : 'provas'}`}
            aoLimpar={() => setTourViewFilter(vistaInicial)}
          />

          {visibleTournaments.length > 0 ? (
            <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
              {visibleTournaments.map(t => (
                <Pastilha
                  key={t.id}
                  ativa={selectedTourId === t.id}
                  onClick={() => { triggerHaptic('selection'); setSelectedTourId(t.id) }}
                  className="flex-none gap-2"
                >
                  {t.image_url ? (
                    <img src={t.image_url} alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />
                  ) : (
                    <Trophy size={13} className="shrink-0 opacity-70" />
                  )}
                  <span className="truncate max-w-[150px]">{t.name}</span>
                </Pastilha>
              ))}
            </div>
          ) : (
            <p className="text-xs font-bold text-white/62">
              {tourViewFilter === 'history' ? 'Sem torneios terminados.' : 'Sem torneios agendados ou ativos.'}
            </p>
          )}

          {/* Quem organiza a prova escolhida — por baixo das pastilhas, e não
              ao lado do filtro, onde se lia como parte dele. */}
          {selectedTournament?.organizer_name && visibleTournaments.some(t => t.id === selectedTourId) && (
            <p className="text-[11px] text-white/62 truncate">
              Organização: <span className="text-white/80 font-semibold">{selectedTournament.organizer_name}</span>
            </p>
          )}
        </div>
      )}

      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Filtrar provas"
        description="Que provas aparecem nas pastilhas"
        tone="dark"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <SlidersHorizontal size={17} />
          </div>
        }
        footer={
          <>
            <Botao aparencia="vidro" onClick={() => setTourViewFilter(vistaInicial)} disabled={tourViewFilter === vistaInicial}>
              Limpar
            </Botao>
            <Botao onClick={() => setFiltrosAbertos(false)}>
              Ver {visibleTournaments.length} {visibleTournaments.length === 1 ? 'prova' : 'provas'}
            </Botao>
          </>
        }
      >
        <div>
          <span className={ETIQUETA}>Estado da prova</span>
          <div className="flex flex-wrap gap-2">
            {(['current', 'history'] as const).map(v => (
              <Pastilha
                key={v}
                ativa={tourViewFilter === v}
                onClick={() => { triggerHaptic('selection'); setTourViewFilter(v) }}
                className="flex-none"
              >
                {ROTULO_PROVAS[v]}
              </Pastilha>
            ))}
          </div>
        </div>
      </BottomSheet>

      {loading ? (
        <ACarregar texto="A carregar classificações…" />
      ) : !visibleTournaments.some(t => t.id === selectedTourId) ? (
        <EstadoVazio
          icone={Trophy}
          titulo={tourViewFilter === 'history' ? 'Ainda não há torneios terminados.' : 'Não há torneios a decorrer.'}
        />
      ) : ehTorneioTaca ? (
        /* =====================================================================
           VISTA DE TAÇA / ELIMINATÓRIAS (Sistema "Taça de Portugal")
           ===================================================================== */
        (() => {
          const rules = { ...DEFAULT_KNOCKOUT_TOURNAMENT_RULES, ...(selectedTournament?.rules || {}) }
          const fasesDisponiveis = obterFasesEliminatoria(rules, matches)
          const rounds = fasesDisponiveis.map(f => f.round)

          // Fase ativa: exatamente como a jornadaAtiva do campeonato
          const fasePorDefeito = rounds.find(r => matches.some(m => (m.matchday || 1) === r && !jogoTerminado(m))) ?? rounds[0] ?? 1
          const faseAtiva = eliminatoriaFiltro > 0 && rounds.includes(eliminatoriaFiltro) ? eliminatoriaFiltro : fasePorDefeito
          const faseAtivaObj = fasesDisponiveis.find(f => f.round === faseAtiva)

          const jogosDaFase = matches
            .filter(m => (m.matchday || 1) === faseAtiva)
            .sort((a, b) => {
              const metaA = obterMetaJogoKnockout(selectedTournament?.rules, a, matches)
              const metaB = obterMetaJogoKnockout(selectedTournament?.rules, b, matches)
              return (metaA?.match_number ?? 99) - (metaB?.match_number ?? 99)
            })

          return (
            <div className="space-y-4">
              {/* Normas e Regras da Prova (colapsável) */}
              <details className="cartao-simples overflow-hidden group">
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between gap-2 hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[9px] tracking-[0.12em] uppercase text-csc-gold">
                      Sistema "Taça de Portugal" · Eliminatórias
                    </p>
                    <p className="font-display font-extrabold text-[13px] text-white truncate mt-0.5">
                      Normas de Participação e Regras ({rules.match_duration_mins ?? 70}' · Máx. {rules.max_match_players ?? 20}/jogo)
                    </p>
                  </div>
                  <ChevronDown size={16} className="text-white/60 shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-3.5 pt-2 border-t border-white/10 space-y-2 text-[11.5px] text-white/80">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Duração e Subs</p>
                      <p className="font-bold text-white mt-0.5">
                        {rules.match_duration_mins ?? 70} min (2×{rules.half_duration_mins ?? 35}' + {rules.halftime_duration_mins ?? 10}' int.)
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.rolling_subs !== false ? 'Substituições volantes sem limite' : 'Substituições limitadas'}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Desempate</p>
                      <p className="font-bold text-white mt-0.5">
                        {rules.knockout_tiebreaker === 'extra_time_penalties'
                          ? 'Prolongamento + Penalties'
                          : rules.knockout_tiebreaker === 'two_legs'
                          ? 'Eliminatória a 2 Mãos'
                          : 'Grandes Penalidades'}
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        No final do tempo regulamentar
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Idades e Plantel</p>
                      <p className="font-bold text-white mt-0.5">
                        {rules.max_birth_year ? `Nascidos ≤ ${rules.max_birth_year}` : `Mín. ${rules.min_age ?? 35} anos`}
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.exceptions_allowed
                          ? `${rules.exceptions_count ?? 1} exceção (${rules.exceptions_max_birth_year ? `nasc. ${rules.exceptions_max_birth_year}` : `≥ ${rules.exceptions_min_age} anos`})`
                          : 'Sem exceções de idade'}
                        {' · '}
                        {rules.unlimited_squad ? 'Inscritos ilimitados' : `Máx. ${rules.max_squad_size} inscritos`}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Disciplina e Árbitros</p>
                      <p className="font-bold text-white mt-0.5">
                        Suspensão ao {rules.yellow_cards_to_suspension ?? 2}º amarelo
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.referee_entity || 'Trios AF Lisboa'}
                        {rules.referee_fee_per_match ? ` (${rules.referee_fee_per_match}€/jogo)` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="bg-csc-gold/10 border border-csc-gold/25 rounded-xl px-3 py-2 text-[11px] text-white/85 space-y-1">
                    <p>
                      <span className="font-bold text-csc-gold">Equipamento Alternativo:</span>{' '}
                      {rules.kit_conflict_rule === 'home_changes'
                        ? 'Muda a equipa considerada a jogar em casa (visitado — lado esquerdo do calendário).'
                        : 'Muda a equipa visitante (fora).'}
                    </p>
                    {rules.roster_update_deadline && (
                      <p>
                        <span className="font-bold text-csc-gold">Inscrições:</span> {rules.roster_update_deadline}
                        {rules.medical_exam_valid_until ? ` · Exame Médico válido até ${new Date(rules.medical_exam_valid_until).toLocaleDateString('pt-PT')}` : ''}
                      </p>
                    )}
                    {rules.suspensions_carry_over && (
                      <p>
                        <span className="font-bold text-csc-gold">Sanções:</span> Jogos de suspensão não cumpridos transitam para a edição seguinte.
                      </p>
                    )}
                  </div>
                </div>
              </details>

              {/* Quadro Único da Eliminatória (UX idêntica à do Campeonato) */}
              <div className="cartao-simples overflow-hidden">
                {/* Cabeçalho da Prova e Ação */}
                <div className="bg-csc-dark px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-black text-white text-[15px] leading-tight flex items-center gap-2">
                      <Trophy size={16} className="text-csc-gold" />
                      <span>{faseAtivaObj?.name || 'Eliminatória'}</span>
                    </h3>
                    <p className="text-[10.5px] text-white/62 mt-0.5">
                      {selectedTournament?.name}
                      {selectedTournament?.season ? ` · ${selectedTournament.season}` : ''}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => openNewKnockoutMatch(faseAtiva)}
                      className="min-h-10 px-3 rounded-[18px] bg-csc-gold/15 text-csc-gold font-display font-extrabold text-[10.5px] flex items-center gap-1.5 shrink-0 cursor-pointer transition-transform duration-150 active:scale-97"
                    >
                      <Plus size={12} />
                      <span>Novo jogo</span>
                    </button>
                  )}
                </div>

                {/* Seletor de Fases (estilo Jornadas: J1, J2...) */}
                {fasesDisponiveis.length > 1 && (
                  <div className="border-b border-white/10 px-3.5 py-3 bg-csc-dark/20 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-csc-gold/70" />
                        Fases da Prova
                      </span>
                      <span className="text-[10.5px] text-white/60 font-semibold">
                        {jogosDaFase.length} {jogosDaFase.length === 1 ? 'jogo' : 'jogos'}
                      </span>
                    </div>

                    <div className="sem-barra-rolagem flex gap-1.5 overflow-x-auto pb-0.5">
                      {fasesDisponiveis.map(f => {
                        const total = matches.filter(m => (m.matchday || 1) === f.round).length
                        const porRealizar = matches.filter(m => (m.matchday || 1) === f.round && !jogoTerminado(m)).length
                        const ativa = f.round === faseAtiva

                        return (
                          <Pastilha
                            key={f.round}
                            ativa={ativa}
                            onClick={() => { triggerHaptic('selection'); setEliminatoriaFiltro(f.round) }}
                            className="flex-none gap-1.5 px-3"
                          >
                            <span>{f.name}</span>
                            {porRealizar > 0 ? (
                              <span className={`w-1.5 h-1.5 rounded-full ${ativa ? 'bg-csc-tinta/45' : 'bg-csc-gold'}`} />
                            ) : total > 0 ? (
                              <span className="text-[9px] opacity-60">✓</span>
                            ) : null}
                          </Pastilha>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Jogos da Fase Ativa */}
                <div className="p-3.5 space-y-2.5 bg-csc-dark/30">
                  {jogosDaFase.length === 0 ? (
                    <div className="text-center py-8 px-4 space-y-2">
                      <p className="text-xs text-white/60 italic">
                        Ainda não há jogos registados em {faseAtivaObj?.name || `Fase ${faseAtiva}`}.
                      </p>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openNewKnockoutMatch(faseAtiva)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-csc-gold/15 text-csc-gold font-display font-bold text-[11px] cursor-pointer hover:bg-csc-gold/25 transition-colors"
                        >
                          <Plus size={12} />
                          <span>Criar jogo nesta fase</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    jogosDaFase.map((m, idx) => {
                      const meta = obterMetaJogoKnockout(selectedTournament?.rules, m, matches)
                      const matchNumber = meta?.match_number ?? idx + 1
                      const casa = resolverEquipaKnockout('home', m, meta, matches, teams, clubSettings, selectedTournament?.rules)
                      const fora = resolverEquipaKnockout('away', m, meta, matches, teams, clubSettings, selectedTournament?.rules)
                      const terminado = jogoTerminado(m)
                      const vencedor = determinarVencedorKnockout(m, meta)
                      const nosso = verificarSeJogoDoClube(m, meta, matches, teams, clubSettings, selectedTournament?.rules)
                      const daFicha = Boolean(m.event_id)
                      const temFicha = daFicha && terminado
                      const dataFormatada = m.match_date
                        ? new Date(m.match_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : 'Data a definir'

                      const corEquipa = (lado: 'home' | 'away', eq: typeof casa) => {
                        if (eq.eOClube) return 'text-csc-gold'
                        if (eq.isPlaceholder) return 'text-white/65 italic'
                        if (!terminado || !vencedor) return 'text-white/90'
                        return vencedor === lado ? 'text-white font-black' : 'text-white/45'
                      }

                      return (
                        <div
                          key={m.id}
                          className={`rounded-[15px] p-3 border-l-[3px] space-y-2 ${
                            nosso ? 'border-l-csc-gold bg-csc-gold/10' : 'border-l-white/20 bg-white/5'
                          }`}
                        >
                          {/* Topo do cartão do jogo: Jogo N | Data | Hora | Local */}
                          <div className="flex items-center justify-between gap-2 text-[10px] text-white/65 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-csc-gold/20 text-csc-gold font-display font-black uppercase tracking-wider">
                                Jogo {matchNumber}
                              </span>
                              <span className="font-bold text-white/80 tabular-nums">{dataFormatada}</span>
                              {meta?.match_time && (
                                <span className="inline-flex items-center gap-0.5 text-csc-gold/90 font-bold">
                                  <Clock size={10} />
                                  {meta.match_time}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {meta?.location && (
                                <span className="inline-flex items-center gap-1 text-white/70 font-semibold">
                                  <MapPin size={10} className="text-csc-gold/75" />
                                  {meta.location}
                                </span>
                              )}
                              {temFicha && (
                                <Link
                                  to={`/competicao?ver=fichas&jogo=${m.event_id}`}
                                  state={{ origem: 'Classificações' }}
                                  onClick={() => triggerHaptic('light')}
                                  title="Abrir Ficha de Jogo"
                                  className="p-1 px-2 rounded-lg bg-csc-gold/20 text-csc-gold hover:bg-csc-gold/30 flex items-center gap-1 text-[10.5px] font-bold"
                                >
                                  <ScrollText size={12} />
                                  <span>Ficha de Jogo</span>
                                </Link>
                              )}
                              {daFicha && !terminado && (
                                <Link
                                  to={`/competicao?ver=fichas&jogo=${m.event_id}`}
                                  state={{ origem: 'Classificações' }}
                                  onClick={() => triggerHaptic('light')}
                                  title="Preencher Ficha de Jogo"
                                  className="p-1 px-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1 text-[10.5px] font-semibold"
                                >
                                  <ScrollText size={12} />
                                  <span>Preencher Ficha</span>
                                </Link>
                              )}
                              {!daFicha && nosso && (
                                <Link
                                  to="/eventos"
                                  onClick={() => triggerHaptic('light')}
                                  title="Criar jogo na Agenda"
                                  className="p-1 px-2 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 flex items-center gap-1 text-[10.5px] font-semibold"
                                >
                                  <Calendar size={12} />
                                  <span>Agendar</span>
                                </Link>
                              )}
                              {canManage && !nosso && (
                                <button
                                  type="button"
                                  onClick={() => openEditKnockoutMatch(m, matchNumber)}
                                  aria-label={`Editar Jogo ${matchNumber}`}
                                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/75 cursor-pointer"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Linha Visitado vs Visitante */}
                          <div className="flex items-center gap-2 pt-0.5">
                            <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0 text-right">
                              <div className="min-w-0">
                                <p className={`truncate font-display font-bold text-[12px] ${corEquipa('home', casa)}`}>
                                  {casa.nome}
                                </p>
                                {casa.placeholder && casa.resolvidoDePlaceholder && (
                                  <p className="text-[9px] text-csc-gold font-bold uppercase tracking-wider">
                                    ({casa.placeholder})
                                  </p>
                                )}
                              </div>
                              {!casa.isPlaceholder && <EmblemaTorneio logo={casa.logo} eOClube={casa.eOClube} />}
                            </div>

                            {terminado ? (
                              <div className="shrink-0 flex flex-col items-center">
                                {temFicha ? (
                                  <Link
                                    to={`/competicao?ver=fichas&jogo=${m.event_id}`}
                                    state={{ origem: 'Classificações' }}
                                    onClick={() => triggerHaptic('light')}
                                    className="px-2.5 py-1 rounded-lg bg-white text-csc-tinta font-display font-black text-[12.5px] tabular-nums hover:bg-csc-gold hover:text-white transition-colors cursor-pointer"
                                    title="Abrir Ficha de Jogo"
                                  >
                                    {m.home_score} - {m.away_score}
                                  </Link>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg bg-white text-csc-tinta font-display font-black text-[12.5px] tabular-nums">
                                    {m.home_score} - {m.away_score}
                                  </span>
                                )}
                                {meta?.home_penalties !== null && meta?.home_penalties !== undefined &&
                                  meta?.away_penalties !== null && meta?.away_penalties !== undefined && (
                                    <span className="text-[9.5px] font-bold text-csc-gold mt-0.5 tabular-nums">
                                      ({meta.home_penalties}-{meta.away_penalties} gp)
                                    </span>
                                  )}
                              </div>
                            ) : (
                              <span className="shrink-0 w-10 text-center font-display font-black text-[11px] tracking-[0.08em] text-csc-gold/85">
                                VS
                              </span>
                            )}

                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                              {!fora.isPlaceholder && <EmblemaTorneio logo={fora.logo} eOClube={fora.eOClube} />}
                              <div className="min-w-0">
                                <p className={`truncate font-display font-bold text-[12px] ${corEquipa('away', fora)}`}>
                                  {fora.nome}
                                </p>
                                {fora.placeholder && fora.resolvidoDePlaceholder && (
                                  <p className="text-[9px] text-csc-gold font-bold uppercase tracking-wider">
                                    ({fora.placeholder})
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )
        })()
      ) : groups.length === 0 ? (
        <EstadoVazio
          icone={Info}
          titulo="Ainda não há grupos."
          texto={canManage
            ? 'Cria primeiro os grupos e as equipas em Clube → Torneios → grupos e equipas.'
            : 'A classificação aparece assim que a direção configurar os grupos desta prova.'}
        />
      ) : (
        <div className="space-y-4">

          {/* Normas e Regras do Campeonato (colapsável - idêntico à Taça) */}
          {(() => {
            const rules = { ...DEFAULT_TOURNAMENT_RULES, ...(selectedTournament?.rules || {}) }
            return (
              <details className="cartao-simples overflow-hidden group">
                <summary className="px-4 py-3 cursor-pointer flex items-center justify-between gap-2 hover:bg-white/5 transition-colors">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[9px] tracking-[0.12em] uppercase text-csc-gold">
                      {rules.format === 'two_phases'
                        ? 'Campeonato · Liga 2 Fases (Grupos + Fase Final)'
                        : 'Campeonato · Liga Corrida'}
                    </p>
                    <p className="font-display font-extrabold text-[13px] text-white truncate mt-0.5">
                      Normas de Participação e Regras ({rules.match_duration_mins ?? 70}' · Máx. {rules.max_match_players ?? 18}/jogo)
                    </p>
                  </div>
                  <ChevronDown size={16} className="text-white/60 shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="px-4 pb-3.5 pt-2 border-t border-white/10 space-y-2 text-[11.5px] text-white/80">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Duração e Subs</p>
                      <p className="font-bold text-white mt-0.5">
                        {rules.match_duration_mins ?? 70} min (2×{rules.half_duration_mins ?? 35}' + {rules.halftime_duration_mins ?? 10}' int.)
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.rolling_subs !== false ? 'Substituições volantes sem limite' : 'Substituições limitadas'}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Pontuação e Desempate</p>
                      <p className="font-bold text-white mt-0.5">
                        Vitória 3 pts · Empate 1 pt
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        Desempate por {rules.tiebreaker === 'head_to_head' ? 'Confronto direto' : rules.tiebreaker === 'goal_difference' ? 'Diferença de golos' : 'Golos marcados'}
                        {rules.format === 'two_phases' ? ` · Apuram-se os ${rules.promotion_spots ?? 2} primeiros` : ''}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Idades e Plantel</p>
                      <p className="font-bold text-white mt-0.5">
                        {rules.max_birth_year ? `Nascidos ≤ ${rules.max_birth_year}` : `Mín. ${rules.min_age ?? 35} anos`}
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.exceptions_allowed
                          ? `${rules.exceptions_count ?? 3} exceções (${rules.exceptions_max_birth_year ? `nasc. ${rules.exceptions_max_birth_year}` : `≥ ${rules.exceptions_min_age ?? 30} anos`})`
                          : 'Sem exceções de idade'}
                        {' · '}
                        {rules.unlimited_squad ? 'Inscritos ilimitados' : `Máx. ${rules.max_squad_size ?? 40} inscritos`}
                      </p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-white/55">Disciplina e Árbitros</p>
                      <p className="font-bold text-white mt-0.5">
                        Suspensão ao {rules.yellow_cards_to_suspension ?? 3}º amarelo
                      </p>
                      <p className="text-[10.5px] text-white/65 mt-0.5">
                        {rules.referee_entity || 'Sideline Events'}
                        {rules.referee_fee_per_match ? ` (${rules.referee_fee_per_match}€/jogo)` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="bg-csc-gold/10 border border-csc-gold/25 rounded-xl px-3 py-2 text-[11px] text-white/85 space-y-1">
                    <p>
                      <span className="font-bold text-csc-gold">Equipamento Alternativo:</span>{' '}
                      {rules.kit_conflict_rule === 'home_changes'
                        ? 'Muda a equipa considerada a jogar em casa (visitado).'
                        : 'Muda a equipa visitante (fora).'}
                    </p>
                    <p>
                      <span className="font-bold text-csc-gold">Falta de Comparência:</span> Derrota por {rules.walkover_score || '3-0'} (tolerância de {rules.delay_tolerance_mins ?? 20} minutos).
                    </p>
                    {rules.roster_update_deadline && (
                      <p>
                        <span className="font-bold text-csc-gold">Inscrições:</span> {rules.roster_update_deadline}
                      </p>
                    )}
                  </div>
                </div>
              </details>
            )
          })()}

          {phasesAvailable.length > 1 && (
            <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
              {phasesAvailable.map(p => (
                <Pastilha
                  key={p}
                  ativa={activePhase === p}
                  onClick={() => { triggerHaptic('selection'); setActivePhase(p) }}
                  className="flex-none"
                >
                  Fase {p}
                </Pastilha>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {phaseGroups.map(g => {
              const standings = getStandingsForGroup(g.id)
              const groupMatches = matches.filter(m => m.group_id === g.id)
              const matchdays = Array.from(new Set(groupMatches.map(m => m.matchday))).sort((a, b) => a - b)
              /*
                A jornada em foco é a primeira com jogos por realizar — é onde
                se vai lançar resultado — e, com tudo lançado, a última. A
                escolha de quem tocou numa pastilha ganha-lhe, enquanto essa
                jornada existir: apagado o último jogo dela, volta-se ao foco.
              */
              const emFoco = matchdays.find(md => groupMatches.some(m => m.matchday === md && !jogoTerminado(m)))
                ?? matchdays[matchdays.length - 1]
              const escolhida = jornadaAberta[g.id]
              const jornadaAtiva = escolhida !== undefined && matchdays.includes(escolhida) ? escolhida : emFoco
              const jogosDaJornada = groupMatches.filter(m => m.matchday === jornadaAtiva)
              return (
                /*
                  Um grupo é um cartão (ecrã 1c): faixa verde com o nome e a
                  prova, régua dourada, e a tabela por baixo.
                */
                <div key={g.id} className="cartao-simples overflow-hidden">
                  <div className="bg-csc-dark px-4 py-3 border-b-2 border-csc-gold">
                    <h3 className="font-display font-black text-white text-[15px] leading-tight">{g.name}</h3>
                    {selectedTournament && (
                      <p className="text-[10.5px] text-white/62 mt-0.5">
                        {selectedTournament.name}
                        {selectedTournament.season ? ` ${selectedTournament.season}` : ''} · Fase {g.phase}
                      </p>
                    )}
                  </div>
                  <div className="sem-barra-rolagem overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-white/5 text-white/62 text-[9px] font-display font-black uppercase tracking-[0.1em]">
                        <tr>
                          <th scope="col" className="pl-3.5 pr-1 py-2.5 w-7 text-center">#</th>
                          <th scope="col" className="px-2 py-2.5">Equipa</th>
                          <th scope="col" className="px-2 py-2.5 text-center" title="Pontos">P</th>
                          <th scope="col" className="px-2 py-2.5 text-center" title="Jogos">J</th>
                          <th scope="col" className="px-2 py-2.5 text-center text-csc-verde-texto/70" title="Vitórias">V</th>
                          <th scope="col" className="px-2 py-2.5 text-center text-csc-gold/70" title="Empates">E</th>
                          <th scope="col" className="px-2 py-2.5 text-center text-csc-vermelho-texto/70" title="Derrotas">D</th>
                          <th scope="col" className="px-2 py-2.5 text-center" title="Golos marcados">GM</th>
                          <th scope="col" className="px-2 py-2.5 text-center" title="Golos sofridos">GS</th>
                          <th scope="col" className="pl-2 pr-3.5 py-2.5 text-center" title="Diferença de golos">DG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s, index) => {
                          const { sigla: tName, logo, eOClube: isCSC } = equipaDoTorneio(s.team, clubSettings)
                          const promotionSpots = selectedTournament?.rules?.promotion_spots ?? (selectedTournament?.rules?.format === 'two_phases' ? 2 : 0)
                          const relegationSpots = selectedTournament?.rules?.relegation_spots ?? 0
                          const isPromoted = promotionSpots > 0 && index < promotionSpots
                          const isRelegated = relegationSpots > 0 && index >= standings.length - relegationSpots

                          return (
                            /* A linha do clube é a dourada — é a que se procura. */
                            <tr
                              key={s.team.id}
                              className={`border-t border-white/7 ${
                                isCSC
                                  ? 'bg-csc-gold/15'
                                  : isPromoted
                                  ? 'bg-csc-light/6'
                                  : ''
                              }`}
                            >
                              <td className={`pl-3.5 pr-1 py-2.5 text-center font-display font-black text-[11px] ${
                                isCSC
                                  ? 'text-csc-gold'
                                  : isPromoted
                                  ? 'text-csc-verde-texto'
                                  : 'text-white/62'
                              }`}>
                                <div className="flex items-center justify-center gap-1">
                                  {isPromoted && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-csc-verde-texto shrink-0" title="Apuramento para Fase Final" />
                                  )}
                                  {isRelegated && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-csc-red shrink-0" title="Zona de descida / consolação" />
                                  )}
                                  <span>{index + 1}</span>
                                </div>
                              </td>
                              <td className="px-2 py-2.5">
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                    {logo ? (
                                      <img src={logo} alt="" className="w-full h-full object-contain bg-white" />
                                    ) : (
                                      <Shield size={12} className={isCSC ? 'text-csc-gold' : 'text-white/30'} />
                                    )}
                                  </span>
                                  <span className="font-display font-bold text-[12px] text-white truncate">
                                    {tName}
                                  </span>
                                </span>
                              </td>
                              <td className={`px-2 py-2.5 text-center font-display font-black text-[15px] tabular-nums ${isCSC ? 'text-csc-gold' : 'text-white'}`}>
                                {s.p}
                              </td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-white/62 tabular-nums">{s.j}</td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-csc-verde-texto tabular-nums">{s.v}</td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-csc-gold tabular-nums">{s.e}</td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-csc-vermelho-texto tabular-nums">{s.d}</td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-white/62 tabular-nums">{s.gm}</td>
                              <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-white/62 tabular-nums">{s.gs}</td>
                              <td className={`pl-2 pr-3.5 py-2.5 text-center font-display font-black text-[11.5px] tabular-nums ${s.dg > 0 ? 'text-csc-verde-texto' : s.dg < 0 ? 'text-csc-vermelho-texto' : 'text-white/62'}`}>
                                {s.dg > 0 ? `+${s.dg}` : s.dg}
                              </td>
                            </tr>
                          )
                        })}
                        {standings.length === 0 && (
                          <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-xs text-white/62 font-bold italic">
                              Nenhuma equipa neste grupo.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Legenda de Apuramento / Fase Final */}
                  {((selectedTournament?.rules?.promotion_spots ?? 0) > 0 || selectedTournament?.rules?.format === 'two_phases') && (
                    <div className="px-4 py-2 bg-white/[0.03] border-t border-white/6 flex items-center gap-3 text-[10px] text-white/60">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-csc-verde-texto shrink-0" />
                        <span>Apuramento para Fase Final ({selectedTournament?.rules?.promotion_spots ?? 2} primeiros)</span>
                      </div>
                      {(selectedTournament?.rules?.relegation_spots ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="w-2 h-2 rounded-full bg-csc-red shrink-0" />
                          <span>Zona de descida / consolação</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Jornadas do grupo */}
                  <div className="border-t border-white/10 px-3.5 py-3.5 space-y-3 bg-csc-dark/30">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-csc-gold/70" />
                        Jornadas
                      </h4>
                      <div className="flex items-center gap-2">
                        {canManage && isSidelineTournament && (g.name || '').toLowerCase().includes('b') && (
                          <button
                            type="button"
                            onClick={async () => {
                              triggerHaptic('light')
                              const res = await garantirSidelineVeteranos2026({ tournamentId: selectedTourId, groupId: g.id, forcar: true })
                              if (res) {
                                toast.success(res.mensagem)
                                fetchStandingsData()
                              }
                            }}
                            className="min-h-11 px-3 rounded-[18px] bg-csc-light/15 text-csc-verde-texto
                              font-display font-extrabold text-[10.5px] flex items-center gap-1.5 cursor-pointer
                              transition-transform duration-150 active:scale-97 hover:bg-csc-light/25
                              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                            title="Preenche com segurança as jornadas oficiais da Sideline sem apagar dados existentes"
                          >
                            <Sparkles size={12} />
                            Sincronizar Oficial
                          </button>
                        )}
                        {canManage && (() => {
                          const groupTeamCount = teams.filter(t => t.group_id === g.id).length
                          return (
                            <button
                              type="button"
                              onClick={() => { triggerHaptic('light'); openJornadaModal(g.id) }}
                              disabled={groupTeamCount < 2}
                              title={groupTeamCount < 2 ? 'Adiciona pelo menos duas equipas ao grupo primeiro' : undefined}
                              className="min-h-11 px-3 rounded-[18px] bg-csc-gold/15 text-csc-gold
                                font-display font-extrabold text-[10.5px] flex items-center gap-1.5 cursor-pointer
                                transition-transform duration-150 active:scale-97 disabled:opacity-40 disabled:cursor-not-allowed
                                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                            >
                              <Plus size={12} />
                              Nova jornada
                            </button>
                          )
                        })()}
                      </div>
                    </div>

                    {canManage && teams.filter(t => t.group_id === g.id).length < 2 && (
                      <p className="text-[10.5px] leading-relaxed text-white/70 bg-csc-gold/10 rounded-xl px-3 py-2">
                        Este grupo tem {teams.filter(t => t.group_id === g.id).length === 0 ? 'nenhuma equipa' : 'só uma equipa'} — para criar jornadas, adiciona pelo menos mais uma no Clube → Torneios → Gerir grupos e equipas.
                      </p>
                    )}

                    {matchdays.length === 0 ? (
                      <p className="text-[11px] text-white/62 italic py-1">Ainda não há jornadas criadas para este grupo.</p>
                    ) : (
                      <>
                        {matchdays.length > 1 && (
                          <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
                            {matchdays.map(md => {
                              const porRealizar = groupMatches.filter(m => m.matchday === md && !jogoTerminado(m)).length
                              return (
                                <Pastilha
                                  key={md}
                                  ativa={md === jornadaAtiva}
                                  onClick={() => { triggerHaptic('selection'); setJornadaAberta(prev => ({ ...prev, [g.id]: md })) }}
                                  className="flex-none gap-1.5 px-3.5"
                                  aria-label={
                                    porRealizar > 0
                                      ? `Jornada ${md}, ${porRealizar} ${porRealizar === 1 ? 'jogo por realizar' : 'jogos por realizar'}`
                                      : `Jornada ${md}, tudo lançado`
                                  }
                                >
                                  J{md}
                                  {porRealizar > 0 && (
                                    <span className={`w-1.5 h-1.5 rounded-full ${md === jornadaAtiva ? 'bg-csc-tinta/45' : 'bg-csc-gold'}`} />
                                  )}
                                </Pastilha>
                              )
                            })}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          {jogosDaJornada.map(m => {
                            const casa = equipaDoTorneio(teams.find(t => t.id === m.home_team_id), clubSettings)
                            const fora = equipaDoTorneio(teams.find(t => t.id === m.away_team_id), clubSettings)
                            const terminado = jogoTerminado(m)
                            const nosso = casa.eOClube || fora.eOClube
                            const daFicha = Boolean(m.event_id)
                            const temFicha = daFicha && terminado
                            const data = m.match_date
                              ? new Date(m.match_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })
                              : '—'

                            const cor = (eq: { eOClube: boolean }, golos: number, contra: number) =>
                              eq.eOClube
                                ? 'text-csc-gold'
                                : !terminado
                                  ? 'text-white/85'
                                  : golos > contra
                                    ? 'text-white'
                                    : golos < contra
                                      ? 'text-white/45'
                                      : 'text-white/75'

                            if (editingMatchId === m.id && !daFicha && !nosso) {
                              return (
                                <div key={m.id} className="rounded-[14px] bg-csc-gold/10 p-2.5 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                                      <span className="truncate font-display font-bold text-[11.5px] text-white">{casa.sigla}</span>
                                      <EmblemaTorneio logo={casa.logo} eOClube={casa.eOClube} />
                                    </span>
                                    <span className="flex items-center gap-1 shrink-0">
                                      <input
                                        type="number"
                                        min="0"
                                        value={editHomeScore}
                                        onChange={e => setEditHomeScore(e.target.value)}
                                        aria-label={`Golos de ${casa.sigla}`}
                                        className="w-11 h-11 px-1 rounded-xl text-center font-display font-black text-[13px] bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                        placeholder="-"
                                        autoFocus
                                      />
                                      <span className="text-white/40 font-black">-</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={editAwayScore}
                                        onChange={e => setEditAwayScore(e.target.value)}
                                        aria-label={`Golos de ${fora.sigla}`}
                                        className="w-11 h-11 px-1 rounded-xl text-center font-display font-black text-[13px] bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                        placeholder="-"
                                      />
                                    </span>
                                    <span className="flex-1 flex items-center gap-1.5 min-w-0">
                                      <EmblemaTorneio logo={fora.logo} eOClube={fora.eOClube} />
                                      <span className="truncate font-display font-bold text-[11.5px] text-white">{fora.sigla}</span>
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {(() => {
                                      const woScoreStr = (selectedTournament?.rules?.walkover_score || '5-0').trim()
                                      const parts = woScoreStr.split('-').map((s: string) => parseInt(s.trim(), 10))
                                      const woGolos = !isNaN(parts[0]) && parts[0] > 0 ? parts[0] : 5
                                      return (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditHomeScore(String(woGolos))
                                              setEditAwayScore('0')
                                            }}
                                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold"
                                            title={`Vitória por Falta de Comparência (${woGolos}-0)`}
                                          >
                                            W.O. {casa.sigla}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditHomeScore('0')
                                              setEditAwayScore(String(woGolos))
                                            }}
                                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold"
                                            title={`Vitória por Falta de Comparência (0-${woGolos})`}
                                          >
                                            W.O. {fora.sigla}
                                          </button>
                                        </div>
                                      )
                                    })()}
                                    <input
                                      type="date"
                                      value={editDate}
                                      onChange={e => setEditDate(e.target.value)}
                                      aria-label="Data do jogo"
                                      className="h-11 min-w-0 flex-1 px-2.5 rounded-xl text-[11.5px] font-bold bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveMatch(m.id)}
                                      className="w-11 h-11 rounded-xl bg-csc-light text-white flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                      title="Guardar resultado"
                                      aria-label="Guardar resultado"
                                    >
                                      <Check size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={guardaResultado.tentarFechar}
                                      className="w-11 h-11 rounded-xl bg-white/10 text-white/70 flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                      title="Cancelar"
                                      aria-label="Cancelar edição do resultado"
                                    >
                                      <X size={15} />
                                    </button>
                                    <BotaoIcone rotulo={`Eliminar o jogo de ${casa.sigla} com ${fora.sigla}`} icone={Trash2} perigo onClick={() => setMatchToDelete(m.id)} />
                                  </div>
                                </div>
                              )
                            }

                            const linha =
                              'w-full min-h-11 flex items-center gap-1.5 px-2 py-1.5 rounded-[14px] border-l-[3px] ' +
                              (nosso ? 'border-l-csc-gold bg-csc-gold/10' : 'border-l-white/15 bg-white/5')

                            const conteudo = (
                              <>
                                <span className={`w-8 shrink-0 font-display font-bold text-[9.5px] tabular-nums ${terminado ? 'text-white/45' : 'text-csc-gold/85'}`}>
                                  {data}
                                </span>
                                <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                                  <span className={`truncate font-display font-bold text-[11.5px] ${cor(casa, m.home_score, m.away_score)}`}>
                                    {casa.sigla}
                                  </span>
                                  <EmblemaTorneio logo={casa.logo} eOClube={casa.eOClube} />
                                </span>
                                {terminado ? (
                                  <span className="shrink-0 px-2 py-1 rounded-lg bg-white text-csc-tinta font-display font-black text-[12px] tabular-nums">
                                    {m.home_score} - {m.away_score}
                                  </span>
                                ) : (
                                  <span className="shrink-0 w-10 text-center font-display font-black text-[11px] tracking-[0.08em] text-csc-gold/80">
                                    VS
                                  </span>
                                )}
                                <span className="flex-1 flex items-center gap-1.5 min-w-0">
                                  <EmblemaTorneio logo={fora.logo} eOClube={fora.eOClube} />
                                  <span className={`truncate font-display font-bold text-[11.5px] ${cor(fora, m.away_score, m.home_score)}`}>
                                    {fora.sigla}
                                  </span>
                                </span>
                              </>
                            )

                            if (temFicha) {
                              return (
                                <Link
                                  key={m.id}
                                  to={`/competicao?ver=fichas&jogo=${m.event_id}`}
                                  state={{ origem: 'Classificações' }}
                                  onClick={() => triggerHaptic('light')}
                                  aria-label={`Abrir a ficha de jogo de ${casa.sigla} com ${fora.sigla}`}
                                  className={`${linha} cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold`}
                                >
                                  {conteudo}
                                  <span className="shrink-0 flex items-center gap-0.5 text-csc-gold" aria-hidden="true">
                                    <ScrollText size={13} />
                                  </span>
                                </Link>
                              )
                            }

                            return canManage && !daFicha && !nosso ? (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => { triggerHaptic('light'); startEditMatch(m) }}
                                aria-label={`${terminado ? 'Editar' : 'Registar'} resultado de ${casa.sigla} com ${fora.sigla}`}
                                className={`${linha} text-left cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold`}
                              >
                                {conteudo}
                                <Pencil size={13} className="shrink-0 text-white/35" />
                              </button>
                            ) : (
                              <div key={m.id} className={linha}>
                                {conteudo}
                                {daFicha && (
                                  <span
                                    className="shrink-0 text-white/20"
                                    title="Jogo nosso, ainda sem ficha de jogo"
                                    aria-label="Ainda sem ficha de jogo"
                                  >
                                    <ScrollText size={13} />
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* MODAL: Editar / Novo Jogo de Eliminatória (Taça) */}
      <Modal
        isOpen={knockoutModalOpen}
        onClose={() => setKnockoutModalOpen(false)}
        size="lg"
        headerStyle="brand"
        icon={<Trophy size={18} className="text-csc-gold" />}
        title={knockoutEditId ? `Editar Jogo ${koMatchNumber}` : 'Novo Jogo da Eliminatória'}
        description={selectedTournament?.name}
        closeOnOverlayClick={false}
        footer={
          <>
            {knockoutEditId && (
              <Botao
                aparencia="perigo"
                onClick={() => setMatchToDelete(knockoutEditId)}
                disabled={savingKnockout}
              >
                <Trash2 size={15} />
                Eliminar
              </Botao>
            )}
            <Botao aparencia="vidro" onClick={() => setKnockoutModalOpen(false)} disabled={savingKnockout}>
              Cancelar
            </Botao>
            <Botao onClick={handleSaveKnockoutMatch} disabled={savingKnockout}>
              {savingKnockout ? 'A guardar…' : 'Guardar jogo'}
            </Botao>
          </>
        }
      >
        <div className="space-y-3.5">
          {/* Seleção dinâmica de Eliminatória e Número do Jogo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETIQUETA} htmlFor="ko-round">Fase / Eliminatória</label>
              <select
                id="ko-round"
                value={koRound}
                onChange={e => setKoRound(e.target.value)}
                className={CAMPO}
              >
                {obterFasesEliminatoria(selectedTournament?.rules, matches).map(f => (
                  <option key={f.round} value={f.round}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="ko-match-num">Número Oficial do Jogo</label>
              <input
                id="ko-match-num"
                type="number"
                min="1"
                value={koMatchNumber}
                onChange={e => setKoMatchNumber(e.target.value)}
                className={CAMPO}
              />
            </div>
          </div>

          {/* Encadeamento configurável: Visitado (Equipa da Casa) */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className={ETIQUETA}>Visitado (Casa — Lado Esquerdo)</label>
              <span className="text-[10px] text-csc-gold font-bold uppercase tracking-wider">
                {koHomeSourceType === 'team' ? 'Equipa Fixa' :
                 koHomeSourceType === 'winner' ? `Vencedor Jogo ${koHomeSourceMatch}` :
                 koHomeSourceType === 'loser' ? `Derrotado Jogo ${koHomeSourceMatch}` : 'Referência'}
              </span>
            </div>

            {/* Pastilhas de Tipo de Origem */}
            <div className="sem-barra-rolagem flex gap-1.5 overflow-x-auto pb-0.5">
              <Pastilha
                ativa={koHomeSourceType === 'team'}
                onClick={() => setKoHomeSourceType('team')}
                className="flex-none text-[10px] py-1"
              >
                Equipa
              </Pastilha>
              <Pastilha
                ativa={koHomeSourceType === 'winner'}
                onClick={() => setKoHomeSourceType('winner')}
                className="flex-none text-[10px] py-1"
              >
                Vencedor de Jogo
              </Pastilha>
              <Pastilha
                ativa={koHomeSourceType === 'loser'}
                onClick={() => setKoHomeSourceType('loser')}
                className="flex-none text-[10px] py-1"
              >
                Derrotado de Jogo
              </Pastilha>
              <Pastilha
                ativa={koHomeSourceType === 'custom'}
                onClick={() => setKoHomeSourceType('custom')}
                className="flex-none text-[10px] py-1"
              >
                Referência Livre
              </Pastilha>
            </div>

            {koHomeSourceType === 'team' && (
              <select
                id="ko-home-team"
                value={koHomeTeamId}
                onChange={e => setKoHomeTeamId(e.target.value)}
                className={CAMPO}
              >
                <option value="">Escolhe a equipa...</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.opponent_id === null ? (clubSettings?.name || 'Cascais') : (t.opponent?.name || equipaDoTorneio(t, clubSettings).sigla)} ({equipaDoTorneio(t, clubSettings).sigla})
                  </option>
                ))}
              </select>
            )}

            {(koHomeSourceType === 'winner' || koHomeSourceType === 'loser') && (
              <div>
                <label className="text-[10.5px] text-white/60 font-semibold mb-1 block">
                  Encadear com o {koHomeSourceType === 'winner' ? 'vencedor' : 'derrotado'} do jogo:
                </label>
                <select
                  value={koHomeSourceMatch}
                  onChange={e => setKoHomeSourceMatch(e.target.value)}
                  className={CAMPO}
                >
                  {matches
                    .filter(m => m.id !== knockoutEditId)
                    .map((m, idx) => {
                      const metaCand = obterMetaJogoKnockout(selectedTournament?.rules, m, matches)
                      const num = metaCand.match_number || idx + 1
                      const c = resolverEquipaKnockout('home', m, metaCand, matches, teams, clubSettings, selectedTournament?.rules)
                      const f = resolverEquipaKnockout('away', m, metaCand, matches, teams, clubSettings, selectedTournament?.rules)
                      return (
                        <option key={m.id || num} value={num}>
                          Jogo {num} ({metaCand.round_label || `Fase ${m.matchday || 1}`}) — {c.sigla} vs {f.sigla}
                        </option>
                      )
                    })}
                  {/* Se ainda não houver jogos criados suficientes, permitir selecionar número 1 a 16 */}
                  {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                    <option key={`fallback-${n}`} value={n}>
                      Jogo {n}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {koHomeSourceType === 'custom' && (
              <input
                type="text"
                value={koHomePlaceholder}
                onChange={e => setKoHomePlaceholder(e.target.value)}
                placeholder="Ex: 1º Grupo A / Vencedor Playoff"
                className={CAMPO}
              />
            )}
          </div>

          {/* Encadeamento configurável: Visitante (Equipa de Fora) */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className={ETIQUETA}>Visitante (Fora — Lado Direito)</label>
              <span className="text-[10px] text-csc-gold font-bold uppercase tracking-wider">
                {koAwaySourceType === 'team' ? 'Equipa Fixa' :
                 koAwaySourceType === 'winner' ? `Vencedor Jogo ${koAwaySourceMatch}` :
                 koAwaySourceType === 'loser' ? `Derrotado Jogo ${koAwaySourceMatch}` : 'Referência'}
              </span>
            </div>

            {/* Pastilhas de Tipo de Origem */}
            <div className="sem-barra-rolagem flex gap-1.5 overflow-x-auto pb-0.5">
              <Pastilha
                ativa={koAwaySourceType === 'team'}
                onClick={() => setKoAwaySourceType('team')}
                className="flex-none text-[10px] py-1"
              >
                Equipa
              </Pastilha>
              <Pastilha
                ativa={koAwaySourceType === 'winner'}
                onClick={() => setKoAwaySourceType('winner')}
                className="flex-none text-[10px] py-1"
              >
                Vencedor de Jogo
              </Pastilha>
              <Pastilha
                ativa={koAwaySourceType === 'loser'}
                onClick={() => setKoAwaySourceType('loser')}
                className="flex-none text-[10px] py-1"
              >
                Derrotado de Jogo
              </Pastilha>
              <Pastilha
                ativa={koAwaySourceType === 'custom'}
                onClick={() => setKoAwaySourceType('custom')}
                className="flex-none text-[10px] py-1"
              >
                Referência Livre
              </Pastilha>
            </div>

            {koAwaySourceType === 'team' && (
              <select
                id="ko-away-team"
                value={koAwayTeamId}
                onChange={e => setKoAwayTeamId(e.target.value)}
                className={CAMPO}
              >
                <option value="">Escolhe a equipa...</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.opponent_id === null ? (clubSettings?.name || 'Cascais') : (t.opponent?.name || equipaDoTorneio(t, clubSettings).sigla)} ({equipaDoTorneio(t, clubSettings).sigla})
                  </option>
                ))}
              </select>
            )}

            {(koAwaySourceType === 'winner' || koAwaySourceType === 'loser') && (
              <div>
                <label className="text-[10.5px] text-white/60 font-semibold mb-1 block">
                  Encadear com o {koAwaySourceType === 'winner' ? 'vencedor' : 'derrotado'} do jogo:
                </label>
                <select
                  value={koAwaySourceMatch}
                  onChange={e => setKoAwaySourceMatch(e.target.value)}
                  className={CAMPO}
                >
                  {matches
                    .filter(m => m.id !== knockoutEditId)
                    .map((m, idx) => {
                      const metaCand = obterMetaJogoKnockout(selectedTournament?.rules, m, matches)
                      const num = metaCand.match_number || idx + 1
                      const c = resolverEquipaKnockout('home', m, metaCand, matches, teams, clubSettings, selectedTournament?.rules)
                      const f = resolverEquipaKnockout('away', m, metaCand, matches, teams, clubSettings, selectedTournament?.rules)
                      return (
                        <option key={m.id || num} value={num}>
                          Jogo {num} ({metaCand.round_label || `Fase ${m.matchday || 1}`}) — {c.sigla} vs {f.sigla}
                        </option>
                      )
                    })}
                  {Array.from({ length: 16 }, (_, i) => i + 1).map(n => (
                    <option key={`fallback-away-${n}`} value={n}>
                      Jogo {n}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {koAwaySourceType === 'custom' && (
              <input
                type="text"
                value={koAwayPlaceholder}
                onChange={e => setKoAwayPlaceholder(e.target.value)}
                placeholder="Ex: VENCEDOR JOGO 1 / 2º Série B"
                className={CAMPO}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className={ETIQUETA} htmlFor="ko-date">Data</label>
              <input
                id="ko-date"
                type="date"
                value={koDate}
                onChange={e => setKoDate(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="ko-time">Horário</label>
              <input
                id="ko-time"
                type="text"
                value={koTime}
                onChange={e => setKoTime(e.target.value)}
                placeholder="Ex: 15H00"
                className={CAMPO}
              />
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="ko-location">Local</label>
              <input
                id="ko-location"
                type="text"
                value={koLocation}
                onChange={e => setKoLocation(e.target.value)}
                placeholder="Ex: Cascais"
                className={CAMPO}
              />
            </div>
          </div>

          {/* Se for jogo do Cascais, o resultado é exclusivamente através da Ficha de Jogo */}
          {(() => {
            const matchAEditar = matches.find(m => m.id === knockoutEditId)
            const metaAEditar = matchAEditar ? obterMetaJogoKnockout(selectedTournament?.rules, matchAEditar, matches) : null
            const cscTeamObj = teams.find(t => isEquipaDoClube(t, clubSettings))
            const ehJogoCascais = verificarSeJogoDoClube(matchAEditar, metaAEditar, matches, teams, clubSettings, selectedTournament?.rules)
              || (cscTeamObj ? (koHomeTeamId === cscTeamObj.id || koAwayTeamId === cscTeamObj.id) : false)

            if (ehJogoCascais) {
              const temPlacar = matchAEditar && jogoTerminado(matchAEditar)
              return (
                <div className="p-3.5 rounded-xl bg-csc-gold/10 border border-csc-gold/30 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <ScrollText size={16} className="text-csc-gold shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-black text-xs text-csc-gold uppercase tracking-wider">
                        Jogo do Cascais · Resultado via Ficha de Jogo
                      </p>
                      <p className="text-[11.5px] text-white/80 mt-1 leading-relaxed">
                        Tal como no campeonato, os golos, marcadores e resultado dos jogos do Cascais são geridos exclusivamente através da Ficha de Jogo oficial.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      Resultado atual: {temPlacar ? `${matchAEditar.home_score} - ${matchAEditar.away_score}` : 'Por realizar'}
                    </span>
                    {matchAEditar?.event_id ? (
                      <Link
                        to={`/competicao?ver=fichas&jogo=${matchAEditar.event_id}`}
                        state={{ origem: 'Classificações' }}
                        onClick={() => { triggerHaptic('light'); setKnockoutModalOpen(false) }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-csc-gold text-csc-tinta font-display font-black text-[11px] hover:bg-csc-gold/90 transition-transform active:scale-97 cursor-pointer"
                      >
                        <ScrollText size={12} />
                        {temPlacar ? 'Ver / Editar Ficha de Jogo' : 'Preencher Ficha de Jogo'}
                      </Link>
                    ) : (
                      <span className="text-[10.5px] text-white/50 italic">
                        Ainda sem evento ligado na Agenda
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <div>
                  <label className={ETIQUETA} htmlFor="ko-home-score">Golos Visitado</label>
                  <input
                    id="ko-home-score"
                    type="number"
                    min="0"
                    value={koHomeScore}
                    onChange={e => setKoHomeScore(e.target.value)}
                    placeholder="—"
                    className={`${CAMPO} text-center font-black`}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="ko-away-score">Golos Visitante</label>
                  <input
                    id="ko-away-score"
                    type="number"
                    min="0"
                    value={koAwayScore}
                    onChange={e => setKoAwayScore(e.target.value)}
                    placeholder="—"
                    className={`${CAMPO} text-center font-black`}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="ko-home-pens">Penalties Visitado (se empate)</label>
                  <input
                    id="ko-home-pens"
                    type="number"
                    min="0"
                    value={koHomePenalties}
                    onChange={e => setKoHomePenalties(e.target.value)}
                    placeholder="Opcional"
                    className={`${CAMPO} text-center`}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="ko-away-pens">Penalties Visitante (se empate)</label>
                  <input
                    id="ko-away-pens"
                    type="number"
                    min="0"
                    value={koAwayPenalties}
                    onChange={e => setKoAwayPenalties(e.target.value)}
                    placeholder="Opcional"
                    className={`${CAMPO} text-center`}
                  />
                </div>
              </div>
            )
          })()}
          <p className="text-[10.5px] text-white/60">
            Quando um jogo termina, qualquer jogo seguinte com referência <span className="text-csc-gold font-bold">VENCEDOR JOGO {koMatchNumber}</span> passa automaticamente a mostrar a equipa vencedora.
          </p>
        </div>
      </Modal>

      {/* MODAL: Nova Jornada — moldura partilhada (Escape, prisão de foco, rodapé fixo) */}
      <Modal
        isOpen={!!jornadaModalGroupId}
        onClose={guardaJornada.tentarFechar}
        size="lg"
        headerStyle="brand"
        icon={<CalendarDays size={18} className="text-csc-gold" />}
        title="Nova Jornada"
        description={jornadaModalGroup?.name}
        closeOnOverlayClick={false}
        footer={
          <>
            <Botao aparencia="vidro" onClick={guardaJornada.tentarFechar}>Cancelar</Botao>
            <Botao onClick={handleCreateJornada} disabled={savingJornada}>
              {savingJornada ? 'A guardar…' : 'Criar jornada'}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETIQUETA} htmlFor="jornada-numero">Jornada nº</label>
              <input
                id="jornada-numero"
                type="number"
                min="1"
                value={jornadaMatchday}
                onChange={e => setJornadaMatchday(e.target.value)}
                className={`${CAMPO} text-center`}
              />
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="jornada-data">Data (opcional)</label>
              <input
                id="jornada-data"
                type="date"
                value={jornadaDate}
                onChange={e => setJornadaDate(e.target.value)}
                className={CAMPO}
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className={ETIQUETA}>Jogos desta jornada</span>
            {jornadaFixtures.map((f, idx) => (
              <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                <select
                  value={f.home}
                  onChange={e => updateFixtureRow(idx, 'home', e.target.value)}
                  aria-label={`Jogo ${idx + 1} — equipa de casa`}
                  className={`${CAMPO} px-2.5`}
                >
                  <option value="">Casa...</option>
                  {teams.filter(t => t.group_id === jornadaModalGroupId).map(t => (
                    <option key={t.id} value={t.id}>{equipaDoTorneio(t, clubSettings).sigla}</option>
                  ))}
                </select>
                <span className="text-white/30 font-black text-xs">vs</span>
                <select
                  value={f.away}
                  onChange={e => updateFixtureRow(idx, 'away', e.target.value)}
                  aria-label={`Jogo ${idx + 1} — equipa visitante`}
                  className={`${CAMPO} px-2.5`}
                >
                  <option value="">Fora...</option>
                  {teams.filter(t => t.group_id === jornadaModalGroupId).map(t => (
                    <option key={t.id} value={t.id}>{equipaDoTorneio(t, clubSettings).sigla}</option>
                  ))}
                </select>
                {jornadaFixtures.length > 1 ? (
                  <BotaoIcone rotulo={`Tirar o jogo ${idx + 1} da jornada`} icone={Trash2} perigo discreto onClick={() => removeFixtureRow(idx)} />
                ) : (
                  <span className="w-7" aria-hidden="true" />
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFixtureRow}
              className="text-xs font-bold text-csc-dark hover:text-csc-light flex items-center gap-1 cursor-pointer"
            >
              <Plus size={13} />
              Adicionar outro jogo à jornada
            </button>
          </div>

          <p className="text-[11px] text-white/62">Os resultados registam-se depois, à medida que os jogos vão acontecendo — não é preciso saber já o resultado.</p>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!matchToDelete}
        title="Eliminar jogo"
        description="Este jogo é eliminado e deixa de constar no quadro competitivo."
        confirmText="Sim, eliminar jogo"
        onConfirm={handleDeleteMatch}
        onCancel={() => setMatchToDelete(null)}
      />

      <UnsavedChangesModal {...guardaJornada.props} />
      <UnsavedChangesModal {...guardaResultado.props} />
    </div>
  )
}
