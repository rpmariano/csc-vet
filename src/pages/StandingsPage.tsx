import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { Trophy, Shield, Info, Plus, Pencil, Trash2, X, Check, CalendarDays, ChevronsUpDown } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal } from '../components/Modal'
import { useClub } from '../context/ClubContext'
import { formatClubSigla, formatOpponentSigla } from './CalendarPage'
import { Pastilha } from '../components/ui'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'

/** Campo e etiqueta dos formulários, o mesmo desenho da Agenda e dos Eventos. */
const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

/*
  Uma equipa de torneio mostra-se pela sigla e pelo emblema, e nao pelo nome
  por extenso: numa tabela de classificacao com dez colunas, "Clube Atletismo
  do Montijo" nao cabe e sai truncado a meio, enquanto "CA MONTIJO" cabe.
  Sao as mesmas funcoes que a Agenda usa nos placares, para o mesmo adversario
  nao ter duas siglas conforme o ecra.

  A linha do proprio clube e a que tinha o emblema em falta: o `logo` era
  `isCSC ? null : ...`, portanto o clube ficava sempre com o escudo generico,
  mesmo tendo emblema em `club_settings`.
*/
export const equipaDoTorneio = (
  team: any,
  clube: { initials?: string | null; logo_url?: string | null } | null | undefined,
): { sigla: string; logo: string | null; eOClube: boolean } => {
  if (!team?.opponent_id) {
    return {
      sigla: formatClubSigla(clube?.initials),
      logo: clube?.logo_url ?? null,
      eOClube: true,
    }
  }
  return {
    /* A sigla como a direção a escreveu — "CA Montijo" —, e não a que o
       `formatOpponentSigla` reconstrói para os placares, que recusa espaços e
       corta a seis letras: desse lado "Clube Atletismo do Montijo" dá "CADM",
       que ninguém escreveu. Numa tabela há largura para a sigla a sério; a
       reconstrução fica de reserva, para um adversário sem sigla nenhuma. */
    sigla: team.opponent?.initials?.trim() || formatOpponentSigla(team.opponent),
    logo: team.opponent?.logo_url ?? null,
    eOClube: false,
  }
}

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
  const [cscMatches, setCscMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activePhase, setActivePhase] = useState<number>(1)

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

  const visibleTournaments = tournaments.filter(t => tourViewFilter === 'history' ? t.status === 'terminado' : t.status !== 'terminado')

  useEffect(() => {
    fetchTournaments()
  }, [])

  useEffect(() => {
    if (!selectedTourId) return
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
      const active = data.find(t => t.status === 'ativo')
      if (active) setSelectedTourId(active.id)
      else {
        const firstCurrent = data.find(t => t.status !== 'terminado')
        if (firstCurrent) setSelectedTourId(firstCurrent.id)
        else if (data.length > 0) { setTourViewFilter('history'); setSelectedTourId(data[0].id) }
      }
    }
  }

  const fetchStandingsData = async () => {
    setLoading(true)
    const [groupsRes, teamsRes, matchesRes, cscMatchesRes] = await Promise.all([
      supabase.from('tournament_groups').select('*').eq('tournament_id', selectedTourId).order('name'),
      supabase.from('tournament_teams').select('*, opponent:opponents(*)').eq('tournament_id', selectedTourId),
      // Todas as jornadas (agendadas e realizadas) — a classificação só conta as realizadas,
      // mas a lista de jornadas mostra também os jogos ainda por realizar.
      supabase.from('tournament_matches').select('*').eq('tournament_id', selectedTourId).order('matchday'),
      // Fetch CSC matches that are finished
      supabase.from('events').select('*, opponent:opponents(*)').eq('tournament_id', selectedTourId).eq('type', 'match').eq('status', 'finished')
    ])

    if (groupsRes.data) {
      setGroups(groupsRes.data)
      const maxPhase = Math.max(...groupsRes.data.map(g => g.phase), 1)
      setActivePhase(maxPhase)
    }
    if (teamsRes.data) setTeams(teamsRes.data)
    if (matchesRes.data) setMatches(matchesRes.data)
    if (cscMatchesRes.data) setCscMatches(cscMatchesRes.data)

    setLoading(false)
  }

  // --- ENGINE ---
  const getStandingsForGroup = (groupId: string) => {
    const groupTeams = teams.filter(t => t.group_id === groupId)

    // Initialize stats
    const stats: Record<string, any> = {}
    groupTeams.forEach(t => {
      stats[t.id] = {
        team: t,
        p: t.points_carryover || 0, // points
        j: 0, // matches played
        v: 0, // wins
        e: 0, // draws
        d: 0, // losses
        gm: 0, // goals for
        gs: 0, // goals against
        dg: 0, // goal diff
        headToHead: {} // store match results against other teams for tie-breaking
      }
    })

    const processMatch = (homeId: string, awayId: string, hScore: number, aScore: number) => {
      if (!stats[homeId] || !stats[awayId]) return

      stats[homeId].j++
      stats[awayId].j++

      stats[homeId].gm += hScore
      stats[homeId].gs += aScore
      stats[awayId].gm += aScore
      stats[awayId].gs += hScore

      if (!stats[homeId].headToHead[awayId]) stats[homeId].headToHead[awayId] = { p: 0, gm: 0, gs: 0 }
      if (!stats[awayId].headToHead[homeId]) stats[awayId].headToHead[homeId] = { p: 0, gm: 0, gs: 0 }

      stats[homeId].headToHead[awayId].gm += hScore
      stats[homeId].headToHead[awayId].gs += aScore
      stats[awayId].headToHead[homeId].gm += aScore
      stats[awayId].headToHead[homeId].gs += hScore

      if (hScore > aScore) {
        stats[homeId].p += 3
        stats[homeId].v++
        stats[awayId].d++
        stats[homeId].headToHead[awayId].p += 3
      } else if (hScore < aScore) {
        stats[awayId].p += 3
        stats[awayId].v++
        stats[homeId].d++
        stats[awayId].headToHead[homeId].p += 3
      } else {
        stats[homeId].p += 1
        stats[awayId].p += 1
        stats[homeId].e++
        stats[awayId].e++
        stats[homeId].headToHead[awayId].p += 1
        stats[awayId].headToHead[homeId].p += 1
      }
    }

    // Process External Matches (só as jornadas com resultado lançado)
    matches.filter(m => m.group_id === groupId && m.status === 'finished' && m.home_score !== null && m.away_score !== null).forEach(m => {
      processMatch(m.home_team_id, m.away_team_id, m.home_score, m.away_score)
    })

    // Process CSC Matches
    // We need to find CSC's team ID in this group.
    const cscTeam = groupTeams.find(t => t.opponent_id === null)
    if (cscTeam) {
      cscMatches.forEach(m => {
        // Find opponent team ID in this group
        const oppTeam = groupTeams.find(t => t.opponent_id === m.opponent_id)
        if (oppTeam && m.home_score !== null && m.away_score !== null) {
          if (m.home_away === 'casa') {
            processMatch(cscTeam.id, oppTeam.id, m.home_score, m.away_score)
          } else {
            processMatch(oppTeam.id, cscTeam.id, m.away_score, m.home_score)
          }
        }
      })
    }

    // Calculate overall DG
    Object.values(stats).forEach(s => {
      s.dg = s.gm - s.gs
    })

    // Convert to array and Sort
    const standingsList = Object.values(stats)

    standingsList.sort((a, b) => {
      // 1. Points
      if (a.p !== b.p) return b.p - a.p

      // Tied! Use Head to Head if they played against each other
      const h2hA = a.headToHead[b.team.id]
      const h2hB = b.headToHead[a.team.id]
      if (h2hA && h2hB) {
        // 2. Head to head points
        if (h2hA.p !== h2hB.p) return h2hB.p - h2hA.p
        // 3. Head to head DG
        const dgA = h2hA.gm - h2hA.gs
        const dgB = h2hB.gm - h2hB.gs
        if (dgA !== dgB) return dgB - dgA
        // 4. Head to head GS
        if (h2hA.gm !== h2hB.gm) return h2hB.gm - h2hA.gm
      }

      // 5. Overall DG
      if (a.dg !== b.dg) return b.dg - a.dg
      // 6. Overall GS
      if (a.gm !== b.gm) return b.gm - a.gm

      return 0
    })

    return standingsList
  }

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
      toast.error('Não foi possível criar a jornada: ' + error.message)
      return
    }
    triggerHaptic('success')
    toast.success(`Jornada ${matchday} criada com ${validFixtures.length} ${validFixtures.length === 1 ? 'jogo' : 'jogos'}.`)
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
      toast.error('Não foi possível guardar o resultado: ' + error.message)
      return
    }
    triggerHaptic('success')
    toast.success(hasScore ? 'Resultado registado!' : 'Jogo atualizado.')
    setEditingMatchId(null)
    fetchStandingsData()
  }

  const handleDeleteMatch = async () => {
    if (!matchToDelete) return
    const { error } = await supabase.from('tournament_matches').delete().eq('id', matchToDelete)
    setMatchToDelete(null)
    if (error) {
      toast.error('Não foi possível apagar o jogo: ' + error.message)
      return
    }
    toast.success('Jogo apagado.')
    fetchStandingsData()
  }

  const phaseGroups = groups.filter(g => g.phase === activePhase)
  const phasesAvailable = Array.from(new Set(groups.map(g => g.phase))).sort((a, b) => a - b)
  const selectedTournament = tournaments.find(t => t.id === selectedTourId)
  const jornadaModalGroup = groups.find(g => g.id === jornadaModalGroupId)

  return (
    <div className="space-y-4">
      {/*
        Cabeçalho das Classificações (ecrã 1c). O título do ecrã é o da
        Competição, aqui em cima — este é o cabeçalho do separador, e por isso
        a sobrancelha diz de que torneios se está a falar em vez de repetir a
        palavra "Classificações".

        O handoff escolhe o torneio em pastilhas, não num menu: são dois ou
        três por época, e uma pastilha diz quantos há sem se abrir. O
        "Agendados e ativos" contra "Histórico" fica na sobrancelha, que é
        onde se lê o que a lista de pastilhas está a mostrar.
      */}
      {tournaments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { triggerHaptic('selection'); setTourViewFilter(tourViewFilter === 'current' ? 'history' : 'current') }}
              className="min-h-11 flex items-center gap-1.5 font-display font-extrabold text-[9px] tracking-[0.14em] uppercase
                text-csc-gold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
            >
              {tourViewFilter === 'current' ? 'Agendados e ativos' : 'Histórico'}
              <ChevronsUpDown size={12} className="opacity-70" />
            </button>
            {selectedTournament?.organizer_name && (
              <span className="text-[10px] text-white/62 truncate">
                · {selectedTournament.organizer_name}
              </span>
            )}
          </div>

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
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-white/62 font-bold">A carregar classificações...</div>
      ) : !visibleTournaments.some(t => t.id === selectedTourId) ? (
        <div className="text-center py-12 text-white/62 font-bold text-sm">
          {tourViewFilter === 'history' ? 'Ainda não há torneios terminados.' : 'Não há torneios agendados ou ativos de momento.'}
        </div>
      ) : groups.length === 0 ? (
        <div className="cartao-simples text-white p-8 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info size={30} className="text-white/65" />
          </div>
          <h3 className="text-lg font-black text-white">Ainda não há grupos</h3>
          <p className="text-white/70 text-sm mt-2 max-w-sm mx-auto">
            {canManage
              ? 'Cria primeiro os grupos e as equipas em Backoffice → Torneios → Gerir Grupos e Equipas.'
              : 'As tabelas classificativas ficarão disponíveis assim que a administração configurar os grupos desta prova.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">

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
              return (
                /*
                  Um grupo é um cartão (ecrã 1c): faixa verde com o nome e a
                  prova, régua dourada, e a tabela por baixo.

                  A tabela mostra sempre as dez colunas do handoff. Os golos
                  marcados e sofridos estavam escondidos abaixo de `sm:` —
                  numa app só de telemóvel isso quer dizer escondidos sempre,
                  e são eles que explicam a diferença de golos. Ficam à vista,
                  e a tabela rola na horizontal quando não cabe.
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

                          return (
                            /* A linha do clube é a dourada — é a que se procura. */
                            <tr
                              key={s.team.id}
                              className={`border-t border-white/7 ${isCSC ? 'bg-csc-gold/12' : ''}`}
                            >
                              <td className={`pl-3.5 pr-1 py-2.5 text-center font-display font-black text-[11px] ${isCSC ? 'text-csc-gold' : 'text-white/62'}`}>
                                {index + 1}
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

                  {/*
                    Jornadas do grupo (ecrã 2d), no rodapé do cartão da tabela:
                    é a tabela que elas explicam, e no handoff vêm logo por
                    baixo dela.

                    Os jogos do clube entram na tabela pela ficha de jogo; o
                    que aqui se lança são os resultados das outras equipas da
                    série — daí o aviso ao pé do botão de nova jornada.
                  */}
                  <div className="border-t border-white/10 px-3.5 py-3.5 space-y-3 bg-black/20">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 flex items-center gap-1.5">
                        <CalendarDays size={12} className="text-white/35" />
                        Jornadas
                      </h4>
                      {canManage && (() => {
                        const groupTeamCount = teams.filter(t => t.group_id === g.id).length
                        return (
                          <button
                            type="button"
                            onClick={() => { triggerHaptic('light'); openJornadaModal(g.id) }}
                            disabled={groupTeamCount < 2}
                            title={groupTeamCount < 2 ? 'Adiciona pelo menos duas equipas ao grupo primeiro' : undefined}
                            className="min-h-11 px-3 rounded-[18px] bg-csc-gold/15 border border-csc-gold/35 text-csc-gold
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

                    {canManage && teams.filter(t => t.group_id === g.id).length < 2 && (
                      <p className="text-[10.5px] leading-relaxed text-white/70 bg-csc-gold/10 border border-csc-gold/25 rounded-xl px-3 py-2">
                        Este grupo tem {teams.filter(t => t.group_id === g.id).length === 0 ? 'nenhuma equipa' : 'só uma equipa'} — para criar jornadas, adiciona pelo menos mais uma no Clube → Torneios → Gerir grupos e equipas.
                      </p>
                    )}

                    {matchdays.length === 0 ? (
                      <p className="text-[11px] text-white/62 italic py-1">Ainda não há jornadas criadas para este grupo.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {matchdays.map(md => (
                          <div key={md} className="rounded-2xl border border-white/10 overflow-hidden bg-white/4">
                            <div className="px-3 py-1.5 bg-white/6 font-display font-extrabold text-[9px] tracking-[0.12em] uppercase text-white/62">
                              Jornada {md}
                            </div>
                            <div>
                              {groupMatches.filter(m => m.matchday === md).map(m => {
                                const homeTeam = teams.find(t => t.id === m.home_team_id)
                                const awayTeam = teams.find(t => t.id === m.away_team_id)
                                const isEditing = editingMatchId === m.id
                                const isFinished = m.status === 'finished' && m.home_score !== null && m.away_score !== null
                                return (
                                  <div key={m.id} className="px-3 py-2 border-t border-white/7 first:border-t-0 space-y-1.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {m.match_date && (
                                        <span className="text-[9.5px] font-bold text-white/62 shrink-0 w-9 tabular-nums">
                                          {new Date(m.match_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                      )}
                                      <span className="flex-1 text-right font-display font-bold text-[11.5px] text-white/85 truncate">{equipaDoTorneio(homeTeam, clubSettings).sigla}</span>
                                      {isEditing ? (
                                        <span className="flex items-center gap-1 shrink-0">
                                          <input
                                            type="number"
                                            min="0"
                                            value={editHomeScore}
                                            onChange={e => setEditHomeScore(e.target.value)}
                                            aria-label={`Golos de ${equipaDoTorneio(homeTeam, clubSettings).sigla}`}
                                            className="w-10 h-9 px-1 rounded-lg text-center font-display font-black text-[12px] bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                            placeholder="-"
                                          />
                                          <span className="text-white/30 font-black">-</span>
                                          <input
                                            type="number"
                                            min="0"
                                            value={editAwayScore}
                                            onChange={e => setEditAwayScore(e.target.value)}
                                            aria-label={`Golos de ${equipaDoTorneio(awayTeam, clubSettings).sigla}`}
                                            className="w-10 h-9 px-1 rounded-lg text-center font-display font-black text-[12px] bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                            placeholder="-"
                                          />
                                        </span>
                                      ) : (
                                        <span className={`shrink-0 px-2 py-0.5 rounded-lg font-display font-black text-[11.5px] tabular-nums ${
                                          isFinished ? 'bg-white text-csc-tinta' : 'bg-white/10 text-white/62'
                                        }`}>
                                          {isFinished ? `${m.home_score} - ${m.away_score}` : 'vs'}
                                        </span>
                                      )}
                                      <span className="flex-1 text-left font-display font-bold text-[11.5px] text-white/85 truncate">{equipaDoTorneio(awayTeam, clubSettings).sigla}</span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      {!isFinished && !isEditing && (
                                        <span className="font-display font-black text-[8.5px] tracking-[0.1em] uppercase text-csc-gold bg-csc-gold/15 border border-csc-gold/30 px-2 py-0.5 rounded-full">
                                          Por realizar
                                        </span>
                                      )}
                                      {canManage && (
                                        <span className="flex items-center gap-1 ml-auto shrink-0">
                                          {isEditing ? (
                                            <>
                                              <input
                                                type="date"
                                                value={editDate}
                                                onChange={e => setEditDate(e.target.value)}
                                                aria-label="Data do jogo"
                                                className="h-9 px-2 rounded-lg text-[11px] bg-white text-csc-tinta outline-none focus-visible:ring-2 focus-visible:ring-csc-gold"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => handleSaveMatch(m.id)}
                                                className="w-11 h-11 rounded-xl bg-csc-light text-white flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                                title="Guardar resultado"
                                                aria-label="Guardar resultado"
                                              >
                                                <Check size={15} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={guardaResultado.tentarFechar}
                                                className="w-11 h-11 rounded-xl bg-white/8 text-white/60 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                                title="Cancelar"
                                                aria-label="Cancelar"
                                              >
                                                <X size={15} />
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => startEditMatch(m)}
                                                className="w-11 h-11 rounded-xl bg-white/6 text-white/60 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                                title={isFinished ? 'Editar resultado' : 'Registar resultado'}
                                                aria-label={`${isFinished ? 'Editar' : 'Registar'} resultado de ${equipaDoTorneio(homeTeam, clubSettings).sigla} com ${equipaDoTorneio(awayTeam, clubSettings).sigla}`}
                                              >
                                                <Pencil size={14} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setMatchToDelete(m.id)}
                                                className="w-11 h-11 rounded-xl bg-white/6 text-white/60 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                                                title="Apagar jogo"
                                                aria-label={`Apagar o jogo de ${equipaDoTorneio(homeTeam, clubSettings).sigla} com ${equipaDoTorneio(awayTeam, clubSettings).sigla}`}
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            </>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

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
            <button
              type="button"
              onClick={guardaJornada.tentarFechar}
              className="px-4 py-2 text-sm font-bold text-white/60 bg-white/10 rounded-xl hover:bg-white/15 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreateJornada}
              disabled={savingJornada}
              className="px-4 py-2 text-sm font-bold text-white bg-csc-dark rounded-xl hover:bg-csc-dark/90 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {savingJornada ? 'A criar...' : 'Criar Jornada'}
            </button>
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
              // grid com colunas de 0 mínimo: os nomes longos das equipas truncam
              // dentro do select em vez de esticarem o modal na horizontal.
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
                  <button
                    type="button"
                    onClick={() => removeFixtureRow(idx)}
                    aria-label={`Remover o jogo ${idx + 1}`}
                    className="w-11 h-11 flex items-center justify-center text-csc-vermelho-texto rounded-xl cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <Trash2 size={14} />
                  </button>
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
        title="Apagar Jogo"
        description="Este jogo é apagado e, se já tinha resultado, deixa de contar para a classificação do grupo."
        onConfirm={handleDeleteMatch}
        onCancel={() => setMatchToDelete(null)}
      />

      <UnsavedChangesModal {...guardaJornada.props} />
      <UnsavedChangesModal {...guardaResultado.props} />
    </div>
  )
}
