import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Trophy, Shield, Info } from 'lucide-react'

export const StandingsPage = () => {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [selectedTourId, setSelectedTourId] = useState<string>('')
  
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const [cscMatches, setCscMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activePhase, setActivePhase] = useState<number>(1)

  useEffect(() => {
    fetchTournaments()
  }, [])

  useEffect(() => {
    if (selectedTourId) {
      fetchStandingsData()
    }
  }, [selectedTourId])

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false })
    if (data) {
      setTournaments(data)
      const active = data.find(t => t.status === 'ativo')
      if (active) setSelectedTourId(active.id)
      else if (data.length > 0) setSelectedTourId(data[0].id)
    }
  }

  const fetchStandingsData = async () => {
    setLoading(true)
    const [groupsRes, teamsRes, matchesRes, cscMatchesRes] = await Promise.all([
      supabase.from('tournament_groups').select('*').eq('tournament_id', selectedTourId).order('name'),
      supabase.from('tournament_teams').select('*, opponent:opponents(*)').eq('tournament_id', selectedTourId),
      supabase.from('tournament_matches').select('*').eq('tournament_id', selectedTourId).eq('status', 'finished'),
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

    // Process External Matches
    matches.filter(m => m.group_id === groupId).forEach(m => {
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

  const phaseGroups = groups.filter(g => g.phase === activePhase)
  const phasesAvailable = Array.from(new Set(groups.map(g => g.phase))).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-csc-dark rounded-2xl flex items-center justify-center text-csc-gold shadow-md">
            <Trophy size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Classificações</h1>
            <p className="text-sm font-bold text-gray-500">Tabelas e resultados oficiais.</p>
          </div>
        </div>

        {tournaments.length > 0 && (
          <select
            value={selectedTourId}
            onChange={e => setSelectedTourId(e.target.value)}
            className="w-full sm:w-64 px-4 py-2.5 bg-white border border-gray-200 rounded-xl font-black text-sm text-gray-800 shadow-sm focus:ring-2 focus:ring-csc-dark outline-none"
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name} {t.season}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 font-bold">A carregar classificações...</div>
      ) : groups.length === 0 ? (
        <div className="bg-csc-dark text-white rounded-3xl p-8 border border-white/10 text-center shadow-sm">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info size={30} className="text-white/65" />
          </div>
          <h3 className="text-lg font-black text-white">Ainda não há grupos</h3>
          <p className="text-white/70 text-sm mt-2 max-w-sm mx-auto">As tabelas classificativas ficarão disponíveis assim que a administração configurar os grupos desta prova.</p>
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
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
