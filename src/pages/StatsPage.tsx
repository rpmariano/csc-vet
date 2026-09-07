import React, { useEffect, useState, useMemo } from 'react'
import { Award, Footprints, Flame, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { Pastilha } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'

/** Campo, etiqueta e sobrancelha de mosaico — o desenho do resto da app. */
const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/55 mb-1.5'

const ETIQUETA_MOSAICO =
  'font-display font-extrabold text-[8.5px] tracking-[0.12em] uppercase text-white/50 leading-tight'

interface LinhaPodio {
  id: string
  nome: string
  valor: string
}

/**
 * Um pódio das estatísticas (ecrã 1d): título, e até três nomes numerados com
 * o número em destaque no primeiro.
 *
 * Eram três blocos escritos três vezes, cada um com a sua paleta e a sua
 * pequena diferença — o dos MVP usava o dourado do primeiro lugar dos golos e
 * o índigo para o resto, cor que não existe no manual do clube. Aqui é um só,
 * com a cor à entrada.
 */
const Podio: React.FC<{
  titulo: string
  icone: React.ReactNode
  cor: string
  corDestaque: string
  vazio: string
  linhas: LinhaPodio[]
}> = ({ titulo, icone, cor, corDestaque, vazio, linhas }) => (
  <div className="cartao-simples p-4 space-y-3">
    <h4 className={`flex items-center gap-2 font-display font-extrabold text-[9.5px] tracking-[0.14em] uppercase ${cor}`}>
      {icone}
      {titulo}
    </h4>

    {linhas.length === 0 ? (
      <p className="text-[11px] text-white/45 italic">{vazio}</p>
    ) : (
      <ol className="space-y-2">
        {linhas.map((l, idx) => (
          <li key={l.id} className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-display font-black text-[10.5px] shrink-0 ${
                idx === 0 ? corDestaque : 'bg-white/10 text-white/60'
              }`}
            >
              {idx + 1}
            </span>
            <span className="flex-1 font-display font-bold text-[12.5px] text-white truncate">{l.nome}</span>
            <span className={`font-display font-black text-[11px] shrink-0 tabular-nums ${cor}`}>{l.valor}</span>
          </li>
        ))}
      </ol>
    )}
  </div>
)

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
            .select('*, events(id, title, date_time, type, is_friendly, tournament_id, home_score, away_score), profiles:v_players_public(id, name, shirt_name, jersey_number, photo_url)'),
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
    if (filterType === 'global_official') return 'Competições oficiais'
    if (filterType === 'friendly') return 'Jogos amigáveis'
    if (filterType === 'tournament') {
      const t = tournaments.find(t => t.id === selectedTournamentId)
      return t ? t.name : 'Torneio específico'
    }
    return 'Todos os jogos'
  }, [filterType, selectedTournamentId, tournaments])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark mb-3"></div>
        <p className="text-xs font-bold text-white/50">A carregar estatísticas desportivas...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-12">

      {/*
        Filtros das estatísticas (ecrã 1d): quatro pastilhas, e o torneio a
        aparecer só quando se filtra por ele. Não há persiana aqui — ao
        contrário das fichas, não há ano nem mês, e um `select` a mais não
        justifica escondê-lo.
      */}
      <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
        {([
          ['all', 'Todos'],
          ['global_official', 'Oficiais'],
          ['tournament', 'Por torneio'],
          ['friendly', 'Amigáveis'],
        ] as const).map(([valor, etiqueta]) => (
          <Pastilha
            key={valor}
            ativa={filterType === valor}
            onClick={() => { triggerHaptic('selection'); setFilterType(valor) }}
            className="flex-none"
          >
            {etiqueta}
          </Pastilha>
        ))}
      </div>

      {filterType === 'tournament' && (
        <div>
          <label className={ETIQUETA} htmlFor="stats-torneio">Torneio</label>
          <select
            id="stats-torneio"
            value={selectedTournamentId}
            onChange={e => setSelectedTournamentId(e.target.value)}
            className={CAMPO}
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

      {/* Os quatro números da época, dois a dois. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="cartao-simples p-3.5">
          <p className={ETIQUETA_MOSAICO}>Jogos registados</p>
          <p className="font-display font-black text-[26px] text-white mt-1 tabular-nums leading-none">
            {distinctMatches}
          </p>
        </div>

        <div className="cartao-simples p-3.5">
          <p className={ETIQUETA_MOSAICO}>Golos marcados</p>
          <p className="font-display font-black text-[26px] text-csc-gold mt-1 tabular-nums leading-none">
            {totalGoals}
          </p>
        </div>

        <div className="cartao-simples p-3.5">
          <p className={ETIQUETA_MOSAICO}>Assistências</p>
          <p className="font-display font-black text-[26px] text-csc-azul-texto mt-1 tabular-nums leading-none">
            {totalAssists}
          </p>
        </div>

        <div className="cartao-simples p-3.5">
          <p className={ETIQUETA_MOSAICO}>Disciplina</p>
          <p className="flex items-center gap-2 mt-1.5">
            <span className="flex items-center gap-1.5 font-display font-black text-[19px] text-csc-gold tabular-nums leading-none">
              <span className="w-3 h-4 rounded-[2px] bg-csc-gold" aria-hidden="true" />
              <span className="sr-only">Cartões amarelos:</span>
              {totalYellows}
            </span>
            <span className="flex items-center gap-1.5 font-display font-black text-[19px] text-csc-vermelho-texto tabular-nums leading-none">
              <span className="w-3 h-4 rounded-[2px] bg-csc-red" aria-hidden="true" />
              <span className="sr-only">Cartões vermelhos:</span>
              {totalReds}
            </span>
          </p>
        </div>
      </div>

      {/* Os três pódios. */}
      <div className="space-y-3">
        <Podio
          titulo="Melhores marcadores"
          icone={<Flame size={15} />}
          cor="text-csc-gold"
          corDestaque="bg-csc-gold text-csc-tinta"
          vazio="Sem registo de golos neste contexto."
          linhas={topScorers.map(p => ({
            id: p.id,
            nome: p.shirt_name || p.name,
            valor: `${p.goals} ${p.goals === 1 ? 'golo' : 'golos'}`,
          }))}
        />

        <Podio
          titulo="Líderes de assistências"
          icone={<Footprints size={15} />}
          cor="text-csc-azul-texto"
          corDestaque="bg-csc-blue text-white"
          vazio="Sem registo de assistências neste contexto."
          linhas={topAssists.map(p => ({
            id: p.id,
            nome: p.shirt_name || p.name,
            valor: `${p.assists} ${p.assists === 1 ? 'assistência' : 'assistências'}`,
          }))}
        />

        <Podio
          titulo="MVP do jogo"
          icone={<Award size={15} />}
          cor="text-csc-verde-texto"
          corDestaque="bg-csc-light text-white"
          vazio="Sem registo de MVPs neste contexto."
          linhas={topMvps.map(p => ({
            id: p.id,
            nome: p.shirt_name || p.name,
            valor: `${p.mvp_count} MVP`,
          }))}
        />
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

  /**
   * O cabeçalho de cada coluna ordena a tabela. Era um `onClick` no `<th>` —
   * o rato chegava lá, o teclado não. Passa a `<button>` dentro do `<th>`,
   * com `aria-sort` a dizer por onde está ordenada.
   */
  const Coluna = ({ col, children, largura }: { col: SortKey; children: React.ReactNode; largura?: string }) => (
    <th
      scope="col"
      aria-sort={sortKey === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`p-0 ${largura ?? ''}`}
    >
      <button
        type="button"
        onClick={() => handleSort(col)}
        className={`w-full min-h-11 px-2 flex items-center justify-center gap-1 cursor-pointer
          font-display font-black text-[9px] tracking-[0.1em] uppercase
          focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
            sortKey === col ? 'text-csc-gold' : 'text-white/45'
          }`}
      >
        {children}
        <span aria-hidden="true" className={sortKey === col ? 'text-csc-gold' : 'text-white/25'}>
          {sortKey === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )

  return (
    <div className="cartao-simples overflow-hidden">
      <div className="px-4 py-3 bg-csc-dark border-b-2 border-csc-gold flex items-center gap-2.5">
        <Users size={16} className="text-csc-gold shrink-0" />
        <div className="min-w-0">
          <h3 className="font-display font-black text-[13.5px] text-white leading-tight">
            Rendimento do plantel
          </h3>
          <p className="text-[10px] text-white/55 mt-0.5 truncate">
            {aggregatedStats.length} {aggregatedStats.length === 1 ? 'atleta' : 'atletas'} · {activeFilterLabel}
          </p>
        </div>
      </div>

      <div className="sem-barra-rolagem overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-white/5">
            <tr>
              <Coluna col="name" largura="text-left">Jogador</Coluna>
              <Coluna col="games_played">J</Coluna>
              <Coluna col="goals">G</Coluna>
              <Coluna col="assists">A</Coluna>
              <Coluna col="mvp_count">MVP</Coluna>
              <Coluna col="red_cards">Disc.</Coluna>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/40 italic text-xs">
                  Sem registos para {activeFilterLabel.toLowerCase()}.
                </td>
              </tr>
            ) : (
              sorted.map(player => (
                <tr key={player.id} className="border-t border-white/7">
                  <td className="pl-3.5 pr-2 py-2.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[10px] flex items-center justify-center shrink-0">
                        {player.jersey_number || '–'}
                      </span>
                      <span className="font-display font-bold text-[12px] text-white truncate">
                        {player.shirt_name || player.name}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center font-bold text-[11.5px] text-white/70 tabular-nums">
                    {player.games_played}
                  </td>
                  <td className={`px-2 py-2.5 text-center font-display font-black text-[12px] tabular-nums ${player.goals > 0 ? 'text-csc-gold' : 'text-white/30'}`}>
                    {player.goals}
                  </td>
                  <td className={`px-2 py-2.5 text-center font-display font-black text-[12px] tabular-nums ${player.assists > 0 ? 'text-csc-azul-texto' : 'text-white/30'}`}>
                    {player.assists}
                  </td>
                  <td className={`px-2 py-2.5 text-center font-display font-black text-[12px] tabular-nums ${player.mvp_count > 0 ? 'text-csc-verde-texto' : 'text-white/30'}`}>
                    {player.mvp_count || '–'}
                  </td>
                  <td className="pl-2 pr-3.5 py-2.5">
                    <span className="flex items-center justify-center gap-1.5">
                      {player.yellow_cards === 0 && player.red_cards === 0 ? (
                        <span className="text-[10.5px] text-csc-verde-texto font-bold">Limpo</span>
                      ) : (
                        <>
                          {player.yellow_cards > 0 && (
                            <span className="flex items-center gap-1 font-display font-black text-[11px] text-csc-gold tabular-nums">
                              <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-gold" aria-hidden="true" />
                              <span className="sr-only">Cartões amarelos:</span>
                              {player.yellow_cards}
                            </span>
                          )}
                          {player.red_cards > 0 && (
                            <span className="flex items-center gap-1 font-display font-black text-[11px] text-csc-vermelho-texto tabular-nums">
                              <span className="w-2.5 h-3.5 rounded-[2px] bg-csc-red" aria-hidden="true" />
                              <span className="sr-only">Cartões vermelhos:</span>
                              {player.red_cards}
                            </span>
                          )}
                        </>
                      )}
                    </span>
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
