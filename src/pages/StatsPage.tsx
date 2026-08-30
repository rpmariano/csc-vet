import React, { useEffect, useState, useMemo } from 'react'
import { Award, Sparkles, Footprints, Flame, Filter, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

interface Tournament {
  id: string
  name: string
  season?: string | null
}

interface RawStat {
  id: string
  event_id: string
  player_id: string
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  is_mvp: boolean
  events?: {
    id: string
    title: string
    date_time: string
    type: string
    is_friendly?: boolean | null
    tournament_id?: string | null
    home_score?: number | null
    away_score?: number | null
  } | null
  profiles?: {
    id: string
    name: string
    shirt_name?: string | null
    jersey_number?: number | null
    photo_url?: string | null
  } | null
}

interface PlayerStats {
  id: string
  name: string
  shirt_name?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  mvp_count: number
  games_played: number
}

type StatsFilterType = 'global_official' | 'tournament' | 'friendly' | 'all'

const StatsPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [rawStats, setRawStats] = useState<RawStat[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [filterType, setFilterType] = useState<StatsFilterType>('global_official')
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true)
      try {
        const [{ data: statsData }, { data: tourData }] = await Promise.all([
          supabase
            .from('stats')
            .select('*, events(id, title, date_time, type, is_friendly, tournament_id, home_score, away_score), profiles(id, name, shirt_name, jersey_number, photo_url)'),
          supabase
            .from('tournaments')
            .select('id, name, season')
            .order('name', { ascending: true })
        ])

        setRawStats(statsData || [])
        setTournaments(tourData || [])
        if (tourData && tourData.length > 0 && !selectedTournamentId) {
          setSelectedTournamentId(tourData[0].id)
        }
      } catch (err) {
        console.error('Error fetching statistics:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAllData()
  }, [])

  // Filtragem dos registos com base no contexto selecionado
  const filteredRawStats = useMemo(() => {
    return rawStats.filter(item => {
      const ev = item.events
      if (!ev) return true

      if (filterType === 'global_official') {
        // Apenas competições oficiais (exclui jogos amigáveis)
        return ev.is_friendly !== true
      }

      if (filterType === 'tournament') {
        if (!selectedTournamentId) return true
        return ev.tournament_id === selectedTournamentId
      }

      if (filterType === 'friendly') {
        // Apenas amigáveis
        return ev.is_friendly === true
      }

      // 'all'
      return true
    })
  }, [rawStats, filterType, selectedTournamentId])

  // Agregação por atleta
  const aggregatedStats: PlayerStats[] = useMemo(() => {
    const playerMap: Record<string, PlayerStats> = {}

    filteredRawStats.forEach(item => {
      const pid = item.player_id
      const pProfile = item.profiles

      if (!playerMap[pid]) {
        playerMap[pid] = {
          id: pid,
          name: pProfile?.name || 'Atleta',
          shirt_name: pProfile?.shirt_name || null,
          jersey_number: pProfile?.jersey_number || null,
          photo_url: pProfile?.photo_url || null,
          goals: 0,
          assists: 0,
          yellow_cards: 0,
          red_cards: 0,
          mvp_count: 0,
          games_played: 0
        }
      }

      playerMap[pid].goals += item.goals || 0
      playerMap[pid].assists += item.assists || 0
      playerMap[pid].yellow_cards += item.yellow_cards || 0
      playerMap[pid].red_cards += item.red_cards || 0
      playerMap[pid].mvp_count += item.is_mvp ? 1 : 0
      playerMap[pid].games_played += 1
    })

    return Object.values(playerMap).sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals
      if (b.assists !== a.assists) return b.assists - a.assists
      if (b.games_played !== a.games_played) return b.games_played - a.games_played
      return (a.jersey_number || 99) - (b.jersey_number || 99)
    })
  }, [filteredRawStats])

  const topScorers = useMemo(() => {
    return [...aggregatedStats]
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 3)
  }, [aggregatedStats])

  const topAssists = useMemo(() => {
    return [...aggregatedStats]
      .filter(p => p.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 3)
  }, [aggregatedStats])

  const topMvps = useMemo(() => {
    return [...aggregatedStats]
      .filter(p => p.mvp_count > 0)
      .sort((a, b) => b.mvp_count - a.mvp_count)
      .slice(0, 3)
  }, [aggregatedStats])

  // Contadores globais do filtro ativo
  const totalGoals = useMemo(() => aggregatedStats.reduce((sum, p) => sum + p.goals, 0), [aggregatedStats])
  const totalAssists = useMemo(() => aggregatedStats.reduce((sum, p) => sum + p.assists, 0), [aggregatedStats])
  const totalYellows = useMemo(() => aggregatedStats.reduce((sum, p) => sum + p.yellow_cards, 0), [aggregatedStats])
  const totalReds = useMemo(() => aggregatedStats.reduce((sum, p) => sum + p.red_cards, 0), [aggregatedStats])
  const distinctMatches = useMemo(() => {
    const matchIds = new Set(filteredRawStats.map(s => s.event_id))
    return matchIds.size
  }, [filteredRawStats])

  const activeFilterLabel = useMemo(() => {
    if (filterType === 'global_official') return '🏆 Competições Oficiais (Global)'
    if (filterType === 'friendly') return '⚽ Jogos Amigáveis'
    if (filterType === 'tournament') {
      const t = tournaments.find(t => t.id === selectedTournamentId)
      return t ? `🏅 Torneio: ${t.name}` : '🏅 Torneio Específico'
    }
    return '🌐 Todos os Jogos'
  }, [filterType, selectedTournamentId, tournaments])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark mb-3"></div>
        <p className="text-xs font-bold text-gray-500">A carregar estatísticas desportivas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-12">

      {/* 2. Barra de Filtros Redesenhada */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200 space-y-3">
        {/* Linha 1: Pílulas de contexto */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Todos os Jogos', emoji: '🌐' },
            { id: 'global_official', label: 'Competições Oficiais', emoji: '🏆' },
            { id: 'tournament', label: 'Por Torneio', emoji: '🏅' },
            { id: 'friendly', label: 'Amigáveis', emoji: '⚽' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilterType(opt.id as StatsFilterType)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                filterType === opt.id
                  ? 'bg-csc-dark text-white shadow-sm ring-2 ring-csc-gold/40'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`}
            >
              <span>{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Linha 2: Dropdown de torneio (só aparece quando "Por Torneio" está ativo) */}
        {filterType === 'tournament' && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <Filter size={14} className="text-csc-gold shrink-0" />
            <label className="text-xs font-bold text-gray-600 shrink-0">Selecionar torneio:</label>
            <select
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-black outline-none cursor-pointer border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark focus:border-csc-dark"
            >
              {tournaments.length === 0 ? (
                <option value="">Sem torneios registados</option>
              ) : (
                tournaments.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.season ? ` (${t.season})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        )}
      </div>

      {/* 3. Cards Resumo Rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Jogos Registados</p>
          <p className="text-xl sm:text-2xl font-black text-csc-dark mt-1 flex items-center gap-1.5">
            <span>🏟️ {distinctMatches}</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Golos Marcados</p>
          <p className="text-xl sm:text-2xl font-black text-amber-700 mt-1 flex items-center gap-1.5">
            <Flame size={22} className="text-amber-500" />
            <span>{totalGoals}</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Assistências</p>
          <p className="text-xl sm:text-2xl font-black text-blue-700 mt-1 flex items-center gap-1.5">
            <Footprints size={22} className="text-blue-500" />
            <span>{totalAssists}</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs">
          <p className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Disciplina Total</p>
          <p className="text-xl sm:text-2xl font-black text-gray-800 mt-1 flex items-center gap-2">
            <span className="text-amber-700 text-sm sm:text-base bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300">🟨 {totalYellows}</span>
            <span className="text-red-700 text-sm sm:text-base bg-red-100 px-2 py-0.5 rounded-lg border border-red-300">🟥 {totalReds}</span>
          </p>
        </div>
      </div>

      {/* 4. Destaques Top 3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Melhores Marcadores */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex items-center space-x-2 text-amber-700 font-black border-b border-gray-100 pb-3">
            <Flame size={20} className="text-amber-500" />
            <h4 className="text-sm font-black uppercase tracking-wider">Melhores Marcadores</h4>
          </div>
          <div className="space-y-2.5">
            {topScorers.length === 0 ? (
              <p className="text-xs text-gray-400 font-semibold italic py-2">Sem registo de golos neste contexto.</p>
            ) : (
              topScorers.map((player, idx) => (
                <div key={player.id} className="flex justify-between items-center p-2.5 rounded-2xl bg-gray-50 border border-gray-100 hover:border-amber-200 transition-all">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? 'bg-amber-400 text-csc-dark shadow-xs' : idx === 1 ? 'bg-gray-300 text-gray-800' : 'bg-amber-100 text-amber-900'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-gray-800 truncate">{player.name}</span>
                  </div>
                  <span className="text-xs font-black text-amber-950 bg-amber-200/90 border border-amber-300 px-2.5 py-0.5 rounded-xl shrink-0">
                    ⚽ {player.goals} {player.goals === 1 ? 'Golo' : 'Golos'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Melhores Assistentes */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex items-center space-x-2 text-blue-700 font-black border-b border-gray-100 pb-3">
            <Footprints size={20} className="text-blue-500" />
            <h4 className="text-sm font-black uppercase tracking-wider">Líderes de Assistências</h4>
          </div>
          <div className="space-y-2.5">
            {topAssists.length === 0 ? (
              <p className="text-xs text-gray-400 font-semibold italic py-2">Sem registo de assistências neste contexto.</p>
            ) : (
              topAssists.map((player, idx) => (
                <div key={player.id} className="flex justify-between items-center p-2.5 rounded-2xl bg-gray-50 border border-gray-100 hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? 'bg-blue-500 text-white shadow-xs' : idx === 1 ? 'bg-blue-300 text-blue-950' : 'bg-blue-100 text-blue-900'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-gray-800 truncate">{player.name}</span>
                  </div>
                  <span className="text-xs font-black text-blue-900 bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-xl shrink-0">
                    👟 {player.assists} Ass.
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Prémios MVP */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex items-center space-x-2 text-indigo-700 font-black border-b border-gray-100 pb-3">
            <Sparkles size={20} className="text-indigo-500" />
            <h4 className="text-sm font-black uppercase tracking-wider">Prémios MVP (Homem do Jogo)</h4>
          </div>
          <div className="space-y-2.5">
            {topMvps.length === 0 ? (
              <p className="text-xs text-gray-400 font-semibold italic py-2">Sem registo de MVPs neste contexto.</p>
            ) : (
              topMvps.map((player, idx) => (
                <div key={player.id} className="flex justify-between items-center p-2.5 rounded-2xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-all">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                      idx === 0 ? 'bg-amber-400 text-csc-dark shadow-xs' : idx === 1 ? 'bg-gray-300 text-gray-800' : 'bg-indigo-100 text-indigo-900'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-black text-gray-800 truncate">{player.shirt_name || player.name}</span>
                  </div>
                  <span className="text-xs font-black text-indigo-900 bg-indigo-100 border border-indigo-200 px-2.5 py-0.5 rounded-xl shrink-0 flex items-center gap-1">
                    <Award size={13} className="text-indigo-600" />
                    <span>{player.mvp_count} MVP</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Tabela Completa de Rendimento do Plantel */}
      <TableSection
        aggregatedStats={aggregatedStats}
        activeFilterLabel={activeFilterLabel}
      />
    </div>
  )
}

// ─── Componente de Tabela com Ordenação ────────────────────────────────────────
type SortKey = 'name' | 'games_played' | 'goals' | 'assists' | 'mvp_count' | 'yellow_cards' | 'red_cards'
type SortDir = 'asc' | 'desc'

function TableSection({ aggregatedStats, activeFilterLabel }: { aggregatedStats: PlayerStats[], activeFilterLabel: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('goals')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    return [...aggregatedStats].sort((a, b) => {
      let valA: string | number
      let valB: string | number
      if (sortKey === 'name') {
        valA = (a.shirt_name || a.name).toLowerCase()
        valB = (b.shirt_name || b.name).toLowerCase()
      } else if (sortKey === 'red_cards') {
        // disciplina: ordenar por vermelho primeiro, depois amarelos
        valA = a.red_cards * 100 + a.yellow_cards
        valB = b.red_cards * 100 + b.yellow_cards
      } else {
        valA = a[sortKey] as number
        valB = b[sortKey] as number
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [aggregatedStats, sortKey, sortDir])

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-csc-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const thClass = (col: SortKey) =>
    `cursor-pointer select-none transition-colors hover:text-gray-900 hover:bg-gray-100 ${
      sortKey === col ? 'text-csc-dark bg-csc-gold/10' : 'text-gray-500'
    }`

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
          <Users size={18} className="text-csc-dark" />
          <span>Tabela Geral de Rendimento do Plantel ({aggregatedStats.length} Atletas)</span>
        </h3>
        <span className="text-xs text-gray-500 font-bold">
          Filtro ativo: <strong className="text-gray-900">{activeFilterLabel}</strong>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
            <tr>
              <th
                className={`px-4 sm:px-6 py-3.5 ${thClass('name')}`}
                onClick={() => handleSort('name')}
              >
                Jogador <SortIcon col="name" />
              </th>
              <th
                className={`px-3 sm:px-4 py-3.5 text-center ${thClass('games_played')}`}
                onClick={() => handleSort('games_played')}
              >
                Jogos <SortIcon col="games_played" />
              </th>
              <th
                className={`px-3 sm:px-4 py-3.5 text-center ${thClass('goals')}`}
                onClick={() => handleSort('goals')}
              >
                Golos ⚽ <SortIcon col="goals" />
              </th>
              <th
                className={`px-3 sm:px-4 py-3.5 text-center ${thClass('assists')}`}
                onClick={() => handleSort('assists')}
              >
                Ass. 👟 <SortIcon col="assists" />
              </th>
              <th
                className={`px-3 sm:px-4 py-3.5 text-center ${thClass('mvp_count')}`}
                onClick={() => handleSort('mvp_count')}
              >
                MVP ⭐ <SortIcon col="mvp_count" />
              </th>
              <th
                className={`px-4 sm:px-6 py-3.5 text-center ${thClass('red_cards')}`}
                onClick={() => handleSort('red_cards')}
              >
                Disciplina <SortIcon col="red_cards" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 font-semibold">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic text-xs">
                  Sem registos estatísticos para o filtro selecionado ({activeFilterLabel}).
                </td>
              </tr>
            ) : (
              sorted.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 sm:px-6 py-3.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-full bg-csc-dark text-csc-gold text-xs font-black flex items-center justify-center shrink-0 border border-csc-gold/40 shadow-xs">
                        {player.jersey_number || '—'}
                      </span>
                      <div className="min-w-0">
                        <p className="font-black text-gray-900 truncate">
                          {player.shirt_name || player.name}
                        </p>
                        {player.shirt_name && (
                          <p className="text-[10px] text-gray-400 font-bold truncate">
                            {player.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-center text-gray-700 font-black">
                    {player.games_played}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-center">
                    {player.goals > 0 ? (
                      <span className="font-black text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                        {player.goals}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-center">
                    {player.assists > 0 ? (
                      <span className="font-black text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                        {player.assists}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-center">
                    {player.mvp_count > 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
                        <Award size={12} className="text-indigo-600" />
                        <span>{player.mvp_count}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-3.5">
                    <div className="flex items-center justify-center gap-1.5">
                      {player.yellow_cards > 0 && (
                        <span className="flex items-center gap-0.5 bg-yellow-100 text-yellow-900 border border-yellow-300 px-1.5 py-0.5 rounded text-xs font-black">
                          🟨 {player.yellow_cards}
                        </span>
                      )}
                      {player.red_cards > 0 && (
                        <span className="flex items-center gap-0.5 bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 rounded text-xs font-black">
                          🟥 {player.red_cards}
                        </span>
                      )}
                      {player.yellow_cards === 0 && player.red_cards === 0 && (
                        <span className="text-[11px] text-emerald-600 font-bold">Limpo</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StatsPage
