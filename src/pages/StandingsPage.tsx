import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { Trophy, Shield, Info, Plus, Pencil, Trash2, X, Check, CalendarDays } from 'lucide-react'
import { ConfirmModal } from '../components/ConfirmModal'
import { Modal } from '../components/Modal'

const nomeEquipa = (team: any) => team?.opponent_id ? (team.opponent?.name || 'Desconhecida') : 'GDS Cascais'

export const StandingsPage = () => {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' || profile?.role === 'coach'

  const [tournaments, setTournaments] = useState<any[]>([])
  const [selectedTourId, setSelectedTourId] = useState<string>('')
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
  const [savingJornada, setSavingJornada] = useState(false)

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editHomeScore, setEditHomeScore] = useState('')
  const [editAwayScore, setEditAwayScore] = useState('')
  const [editDate, setEditDate] = useState('')

  const [matchToDelete, setMatchToDelete] = useState<string | null>(null)

  const visibleTournaments = tournaments.filter(t => tourViewFilter === 'history' ? t.status === 'terminado' : t.status !== 'terminado')

  useEffect(() => {
    fetchTournaments()
  }, [])

  useEffect(() => {
    if (selectedTourId) {
      fetchStandingsData()
    }
  }, [selectedTourId])

  // Ao trocar de filtro, se o torneio selecionado não pertence à lista visível, escolhe o primeiro dela.
  useEffect(() => {
    if (visibleTournaments.length > 0 && !visibleTournaments.some(t => t.id === selectedTourId)) {
      setSelectedTourId(visibleTournaments[0].id)
    }
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-csc-dark rounded-2xl flex items-center justify-center text-csc-gold shadow-md overflow-hidden shrink-0">
            {selectedTournament?.image_url ? (
              <img src={selectedTournament.image_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <Trophy size={24} />
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Classificações</h1>
            <p className="text-sm font-bold text-gray-500">
              {selectedTournament?.organizer_name ? `Organização: ${selectedTournament.organizer_name}` : 'Tabelas e resultados oficiais.'}
            </p>
          </div>
        </div>

        {tournaments.length > 0 && (
          <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
            <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 w-full sm:w-fit">
              <button
                type="button"
                onClick={() => setTourViewFilter('current')}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${tourViewFilter === 'current' ? 'bg-csc-dark text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Agendados e Ativos
              </button>
              <button
                type="button"
                onClick={() => setTourViewFilter('history')}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${tourViewFilter === 'history' ? 'bg-csc-dark text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Histórico
              </button>
            </div>
            {visibleTournaments.length > 0 ? (
              <select
                value={selectedTourId}
                onChange={e => setSelectedTourId(e.target.value)}
                className="w-full sm:w-64 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-black text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-csc-dark outline-none"
              >
                {visibleTournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.season}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs font-bold text-gray-400">
                {tourViewFilter === 'history' ? 'Sem torneios terminados.' : 'Sem torneios agendados ou ativos.'}
              </p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 font-bold">A carregar classificações...</div>
      ) : !visibleTournaments.some(t => t.id === selectedTourId) ? (
        <div className="text-center py-12 text-gray-400 font-bold text-sm">
          {tourViewFilter === 'history' ? 'Ainda não há torneios terminados.' : 'Não há torneios agendados ou ativos de momento.'}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-csc-dark text-white rounded-3xl p-8 border border-white/10 text-center shadow-sm">
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
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-200 w-full sm:w-fit mx-auto">
              {phasesAvailable.map(p => (
                <button
                  key={p}
                  onClick={() => setActivePhase(p)}
                  className={`flex-1 sm:flex-none px-6 py-2 rounded-xl text-sm font-black transition-all ${activePhase === p ? 'bg-csc-dark text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Fase {p}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {phaseGroups.map(g => {
              const standings = getStandingsForGroup(g.id)
              const groupMatches = matches.filter(m => m.group_id === g.id)
              const matchdays = Array.from(new Set(groupMatches.map(m => m.matchday))).sort((a, b) => a - b)
              return (
                <div key={g.id} className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-csc-dark px-5 py-4 border-b-4 border-csc-gold flex justify-between items-center">
                    <h3 className="font-black text-white text-lg tracking-wide">{g.name}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-500 text-[10px] font-black uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3 w-8 text-center">#</th>
                          <th className="px-4 py-3">Equipa</th>
                          <th className="px-3 py-3 text-center" title="Pontos">P</th>
                          <th className="px-3 py-3 text-center text-gray-400" title="Jogos">J</th>
                          <th className="px-3 py-3 text-center text-emerald-500" title="Vitórias">V</th>
                          <th className="px-3 py-3 text-center text-amber-500" title="Empates">E</th>
                          <th className="px-3 py-3 text-center text-red-500" title="Derrotas">D</th>
                          <th className="px-3 py-3 text-center text-gray-400 hidden sm:table-cell" title="Golos Marcados">GM</th>
                          <th className="px-3 py-3 text-center text-gray-400 hidden sm:table-cell" title="Golos Sofridos">GS</th>
                          <th className="px-3 py-3 text-center text-gray-600" title="Diferença de Golos">DG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {standings.map((s, index) => {
                          const isCSC = s.team.opponent_id === null
                          const tName = isCSC ? 'GDS Cascais' : s.team.opponent?.name || 'Desconhecida'
                          const logo = isCSC ? null : s.team.opponent?.logo_url

                          return (
                            <tr key={s.team.id} className={`${isCSC ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}>
                              <td className="px-4 py-3.5 text-center font-black text-gray-400">
                                {index + 1}
                              </td>
                              <td className="px-4 py-3.5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white shadow-xs border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                                  {isCSC ? (
                                    <Shield size={16} className="text-blue-500" />
                                  ) : logo ? (
                                    <img src={logo} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <Shield size={16} className="text-gray-300" />
                                  )}
                                </div>
                                <span className={`font-black truncate ${isCSC ? 'text-blue-800' : 'text-gray-800'}`}>
                                  {tName}
                                </span>
                              </td>
                              <td className="px-3 py-3.5 text-center font-black text-lg text-csc-dark bg-gray-50/50">
                                {s.p}
                              </td>
                              <td className="px-3 py-3.5 text-center font-bold text-gray-500">{s.j}</td>
                              <td className="px-3 py-3.5 text-center font-bold text-emerald-600">{s.v}</td>
                              <td className="px-3 py-3.5 text-center font-bold text-amber-600">{s.e}</td>
                              <td className="px-3 py-3.5 text-center font-bold text-red-600">{s.d}</td>
                              <td className="px-3 py-3.5 text-center font-bold text-gray-500 hidden sm:table-cell">{s.gm}</td>
                              <td className="px-3 py-3.5 text-center font-bold text-gray-500 hidden sm:table-cell">{s.gs}</td>
                              <td className={`px-3 py-3.5 text-center font-black ${s.dg > 0 ? 'text-emerald-600' : s.dg < 0 ? 'text-gray-500' : 'text-gray-400'}`}>
                                {s.dg > 0 ? `+${s.dg}` : s.dg}
                              </td>
                            </tr>
                          )
                        })}
                        {standings.length === 0 && (
                          <tr>
                            <td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-400 font-bold italic">
                              Nenhuma equipa neste grupo.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Jornadas — jogos, datas e resultados deste grupo */}
                  <div className="border-t border-gray-100 p-4 sm:p-5 space-y-3 bg-gray-50/60">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                        <CalendarDays size={14} className="text-gray-400" />
                        Jornadas
                      </h4>
                      {canManage && (() => {
                        const groupTeamCount = teams.filter(t => t.group_id === g.id).length
                        return (
                          <button
                            onClick={() => openJornadaModal(g.id)}
                            disabled={groupTeamCount < 2}
                            title={groupTeamCount < 2 ? 'Adiciona pelo menos duas equipas ao grupo primeiro' : undefined}
                            className="text-[11px] px-2.5 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Plus size={12} />
                            Nova Jornada
                          </button>
                        )
                      })()}
                    </div>

                    {canManage && teams.filter(t => t.group_id === g.id).length < 2 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Este grupo tem {teams.filter(t => t.group_id === g.id).length === 0 ? 'nenhuma equipa' : 'só uma equipa'} — para criar jornadas, adiciona pelo menos mais uma em Backoffice → Torneios → Gerir Grupos e Equipas.
                      </p>
                    )}

                    {matchdays.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">Ainda não há jornadas criadas para este grupo.</p>
                    ) : (
                      <div className="space-y-3">
                        {matchdays.map(md => (
                          <div key={md} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-3 py-1.5 bg-gray-100 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                              Jornada {md}
                            </div>
                            <div className="divide-y divide-gray-100">
                              {groupMatches.filter(m => m.matchday === md).map(m => {
                                const homeTeam = teams.find(t => t.id === m.home_team_id)
                                const awayTeam = teams.find(t => t.id === m.away_team_id)
                                const isEditing = editingMatchId === m.id
                                const isFinished = m.status === 'finished' && m.home_score !== null && m.away_score !== null
                                return (
                                  <div key={m.id} className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                                    <div className="flex-1 flex items-center gap-2 min-w-0">
                                      {m.match_date && (
                                        <span className="text-[10px] font-bold text-gray-400 shrink-0 w-14">
                                          {new Date(m.match_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                                        </span>
                                      )}
                                      <span className="flex-1 text-right text-xs font-bold text-gray-700 truncate">{nomeEquipa(homeTeam)}</span>
                                      {isEditing ? (
                                        <div className="flex items-center gap-1 shrink-0">
                                          <input type="number" min="0" value={editHomeScore} onChange={e => setEditHomeScore(e.target.value)} className="w-10 px-1 py-1 border border-gray-300 rounded-md text-center text-xs font-black bg-white text-gray-900" placeholder="-" />
                                          <span className="text-gray-300 font-black">-</span>
                                          <input type="number" min="0" value={editAwayScore} onChange={e => setEditAwayScore(e.target.value)} className="w-10 px-1 py-1 border border-gray-300 rounded-md text-center text-xs font-black bg-white text-gray-900" placeholder="-" />
                                        </div>
                                      ) : (
                                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-black ${isFinished ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                          {isFinished ? `${m.home_score} - ${m.away_score}` : 'vs'}
                                        </span>
                                      )}
                                      <span className="flex-1 text-left text-xs font-bold text-gray-700 truncate">{nomeEquipa(awayTeam)}</span>
                                      {!isFinished && !isEditing && (
                                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">Por realizar</span>
                                      )}
                                    </div>
                                    {canManage && (
                                      <div className="flex items-center justify-end gap-1 shrink-0">
                                        {isEditing ? (
                                          <>
                                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="px-1.5 py-1 border border-gray-300 rounded-md text-[11px] bg-white text-gray-900" />
                                            <button onClick={() => handleSaveMatch(m.id)} className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 cursor-pointer" title="Guardar">
                                              <Check size={13} />
                                            </button>
                                            <button onClick={() => setEditingMatchId(null)} className="p-1.5 bg-gray-100 text-gray-500 rounded-md hover:bg-gray-200 cursor-pointer" title="Cancelar">
                                              <X size={13} />
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button onClick={() => startEditMatch(m)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-md cursor-pointer" title={isFinished ? 'Editar resultado' : 'Registar resultado'}>
                                              <Pencil size={13} />
                                            </button>
                                            <button onClick={() => setMatchToDelete(m.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-md cursor-pointer" title="Apagar jogo">
                                              <Trash2 size={13} />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
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
        onClose={() => setJornadaModalGroupId(null)}
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
              onClick={() => setJornadaModalGroupId(null)}
              className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
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
              <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="jornada-numero">Jornada nº</label>
              <input
                id="jornada-numero"
                type="number"
                min="1"
                value={jornadaMatchday}
                onChange={e => setJornadaMatchday(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm font-black text-center text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1" htmlFor="jornada-data">Data (opcional)</label>
              <input
                id="jornada-data"
                type="date"
                value={jornadaDate}
                onChange={e => setJornadaDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-bold text-gray-600">Jogos desta jornada</span>
            {jornadaFixtures.map((f, idx) => (
              // grid com colunas de 0 mínimo: os nomes longos das equipas truncam
              // dentro do select em vez de esticarem o modal na horizontal.
              <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
                <select
                  value={f.home}
                  onChange={e => updateFixtureRow(idx, 'home', e.target.value)}
                  aria-label={`Jogo ${idx + 1} — equipa de casa`}
                  className="w-full min-w-0 px-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none"
                >
                  <option value="">Casa...</option>
                  {teams.filter(t => t.group_id === jornadaModalGroupId).map(t => (
                    <option key={t.id} value={t.id}>{nomeEquipa(t)}</option>
                  ))}
                </select>
                <span className="text-gray-300 font-black text-xs">vs</span>
                <select
                  value={f.away}
                  onChange={e => updateFixtureRow(idx, 'away', e.target.value)}
                  aria-label={`Jogo ${idx + 1} — equipa visitante`}
                  className="w-full min-w-0 px-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-csc-dark outline-none"
                >
                  <option value="">Fora...</option>
                  {teams.filter(t => t.group_id === jornadaModalGroupId).map(t => (
                    <option key={t.id} value={t.id}>{nomeEquipa(t)}</option>
                  ))}
                </select>
                {jornadaFixtures.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeFixtureRow(idx)}
                    aria-label={`Remover o jogo ${idx + 1}`}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg cursor-pointer"
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

          <p className="text-[11px] text-gray-400">Os resultados registam-se depois, à medida que os jogos vão acontecendo — não é preciso saber já o resultado.</p>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!matchToDelete}
        title="Apagar Jogo"
        description="Este jogo é apagado e, se já tinha resultado, deixa de contar para a classificação do grupo."
        onConfirm={handleDeleteMatch}
        onCancel={() => setMatchToDelete(null)}
      />
    </div>
  )
}
