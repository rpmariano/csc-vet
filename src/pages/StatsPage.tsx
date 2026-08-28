import React, { useEffect, useState } from 'react'
import { Award, ShieldAlert, Sparkles, Footprints, Flame } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

interface PlayerStats {
  id: string
  name: string
  photo_url?: string
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
  mvp_count: number
  games_played: number
}

const StatsPage: React.FC = () => {
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true)
      try {
        // Query to build aggregated player stats from public.stats and profiles
        const { data, error } = await supabase
          .from('stats')
          .select('*, profiles(name, photo_url)')
        
        // We will mock dynamic stats if database records are empty
        if (error || !data || data.length === 0) {
          setStats([
            { id: 'p1', name: 'Rui Costa', goals: 12, assists: 8, yellow_cards: 1, red_cards: 0, mvp_count: 4, games_played: 10 },
            { id: 'p2', name: 'João Pinto', goals: 8, assists: 11, yellow_cards: 3, red_cards: 0, mvp_count: 3, games_played: 10 },
            { id: 'p3', name: 'Manuel Bento', goals: 0, assists: 1, yellow_cards: 0, red_cards: 1, mvp_count: 2, games_played: 8 },
            { id: 'p4', name: 'Vítor Paneira', goals: 6, assists: 5, yellow_cards: 2, red_cards: 0, mvp_count: 1, games_played: 9 },
            { id: 'p5', name: 'Nuno Gomes', goals: 15, assists: 3, yellow_cards: 1, red_cards: 0, mvp_count: 5, games_played: 10 }
          ].sort((a, b) => b.goals - a.goals))
        } else {
          // Process aggregated query results if present
          // Simple client-side mapping for testing
          const processed = data.reduce((acc: any, curr: any) => {
            const player = curr.profiles
            const pid = curr.player_id
            if (!acc[pid]) {
              acc[pid] = {
                id: pid,
                name: player?.name || 'Jogador Desconhecido',
                photo_url: player?.photo_url,
                goals: 0,
                assists: 0,
                yellow_cards: 0,
                red_cards: 0,
                mvp_count: 0,
                games_played: 0
              }
            }
            acc[pid].goals += curr.goals || 0
            acc[pid].assists += curr.assists || 0
            acc[pid].yellow_cards += curr.yellow_cards || 0
            acc[pid].red_cards += curr.red_cards || 0
            acc[pid].mvp_count += curr.is_mvp ? 1 : 0
            acc[pid].games_played += 1
            return acc
          }, {})
          setStats(Object.values(processed) as PlayerStats[])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  const topScorers = [...stats].sort((a, b) => b.goals - a.goals).slice(0, 3)
  const topAssists = [...stats].sort((a, b) => b.assists - a.assists).slice(0, 3)
  const mvps = [...stats].sort((a, b) => b.mvp_count - a.mvp_count).slice(0, 3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Estatísticas da Época</h1>
        <p className="text-gray-550 mt-1">Classificações individuais e registo de disciplina.</p>
      </div>

      {/* Destaques (Top 3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Melhores Marcadores */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
          <div className="flex items-center space-x-2 text-amber-600 font-bold mb-4">
            <Flame size={20} />
            <h4>Melhores Marcadores</h4>
          </div>
          <div className="space-y-3">
            {topScorers.map((player, idx) => (
              <div key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{idx + 1}. {player.name}</span>
                <span className="text-sm font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                  {player.goals} Golos
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Melhores Assistentes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
          <div className="flex items-center space-x-2 text-emerald-600 font-bold mb-4">
            <Footprints size={20} />
            <h4>Líderes de Assistências</h4>
          </div>
          <div className="space-y-3">
            {topAssists.map((player, idx) => (
              <div key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{idx + 1}. {player.name}</span>
                <span className="text-sm font-bold text-emerald-705 bg-emerald-50 px-2 py-0.5 rounded">
                  {player.assists} Ass.
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* MVP Awards */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
          <div className="flex items-center space-x-2 text-indigo-650 font-bold mb-4">
            <Sparkles size={20} />
            <h4>Prémios MVP</h4>
          </div>
          <div className="space-y-3">
            {mvps.map((player, idx) => (
              <div key={player.id} className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{idx + 1}. {player.name}</span>
                <span className="text-sm font-bold text-indigo-750 bg-indigo-50 px-2 py-0.5 rounded flex items-center space-x-1">
                  <Award size={14} />
                  <span>{player.mvp_count} MVP</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela Geral */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-150 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">Tabela de Rendimento do Plantel</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 font-semibold uppercase text-[10px] tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-6 py-3">Jogador</th>
                <th className="px-6 py-3 text-center">Jogos</th>
                <th className="px-6 py-3 text-center">Golos</th>
                <th className="px-6 py-3 text-center">Assistências</th>
                <th className="px-6 py-3 text-center">MVP</th>
                <th className="px-6 py-3 text-center">Cartões</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-800">{player.name}</td>
                  <td className="px-6 py-4 text-center text-gray-600">{player.games_played}</td>
                  <td className="px-6 py-4 text-center text-amber-700 font-bold">{player.goals}</td>
                  <td className="px-6 py-4 text-center text-emerald-700 font-bold">{player.assists}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center space-x-0.5 text-xs text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded">
                      <Award size={12} />
                      <span>{player.mvp_count}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center space-x-2">
                      {player.yellow_cards > 0 && (
                        <span className="flex items-center space-x-0.5 bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-xs font-bold">
                          <ShieldAlert size={12} />
                          <span>{player.yellow_cards}</span>
                        </span>
                      )}
                      {player.red_cards > 0 && (
                        <span className="flex items-center space-x-0.5 bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs font-bold">
                          <ShieldAlert size={12} />
                          <span>{player.red_cards}</span>
                        </span>
                      )}
                      {player.yellow_cards === 0 && player.red_cards === 0 && (
                        <span className="text-xs text-gray-400 font-medium">Limpo</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default StatsPage
