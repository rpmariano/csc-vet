import React, { useEffect, useState, useMemo } from 'react'
import {
  Award,
  Trophy,
  Vote,
  ChevronDown,
  ChevronUp,
  Lock,
  Sparkles,
  Calendar,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { temAcessoMVP, obterTodosVotosMvp, type MvpVote, type PlayerSummary } from '../lib/mvp'
import { CartaoSimples, EtiquetaSeccao, ACarregar, EstadoVazio, FilaSeparadores } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'
import { CLUBE_SIGLA } from '../lib/clube'

interface Opponent {
  id: string
  name: string
  initials?: string | null
}

interface Tournament {
  id: string
  name: string
  season?: string | null
}

interface MatchEvent {
  id: string
  title: string
  date_time: string
  is_friendly?: boolean | null
  tournament_id?: string | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
  home_score?: number | null
  away_score?: number | null
  opponent?: Opponent | null
  tournament?: Tournament | null
}

interface PlayerStatsMvp extends PlayerSummary {
  mvpWins: number
  totalVotes: number
  matchesVotedIn: number
}

const SEPARADORES_VISTA = ['Classificações', 'Jogos & Votos'] as const

export const MvpPage: React.FC = () => {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<MatchEvent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [playersMap, setPlayersMap] = useState<Map<string, PlayerSummary>>(new Map())
  const [allVotes, setAllVotes] = useState<MvpVote[]>([])

  // Filtros
  const [selectedComp, setSelectedComp] = useState<string>('all')
  const [vistaIndice, setVistaIndice] = useState(0)
  const [tabelaAtiva, setTabelaAtiva] = useState<'mvpWins' | 'totalVotes'>('mvpWins')
  const [jogoExpandido, setJogoExpandido] = useState<string | null>(null)

  const autorizado = useMemo(() => temAcessoMVP(profile), [profile])

  useEffect(() => {
    if (!autorizado) return

    let cancelado = false
    const carregar = async () => {
      setLoading(true)
      try {
        const [
          { data: eventsData },
          { data: tourData },
          { data: profilesData },
          votosData,
        ] = await Promise.all([
          supabase
            .from('events')
            .select('id, title, date_time, is_friendly, tournament_id, opponent_id, home_away, home_score, away_score, opponent:opponents(id, name, initials), tournament:tournaments(id, name, season)')
            .eq('type', 'match')
            .order('date_time', { ascending: false }),
          supabase.from('tournaments').select('id, name, season').order('name'),
          supabase.from('v_players_public').select('id, name, shirt_name, jersey_number, photo_url, position'),
          obterTodosVotosMvp(),
        ])

        if (cancelado) return

        const mappedMatches = (eventsData || []).map((e: any) => ({
          ...e,
          opponent: Array.isArray(e.opponent) ? e.opponent[0] : e.opponent,
          tournament: Array.isArray(e.tournament) ? e.tournament[0] : e.tournament,
        })) as MatchEvent[]

        setMatches(mappedMatches)
        setTournaments((tourData || []) as Tournament[])

        const map = new Map<string, PlayerSummary>()
        for (const p of profilesData || []) {
          map.set(p.id, p)
        }
        setPlayersMap(map)
        setAllVotes(votosData)
      } catch (err) {
        console.error('Erro ao carregar dados do ecrã MVP:', err)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    carregar()
    return () => {
      cancelado = true
    }
  }, [autorizado])

  // Filtrar jogos pela competição selecionada
  const filteredMatches = useMemo(() => {
    return matches.filter(m => {
      if (selectedComp === 'all') return true
      if (selectedComp === 'friendly') {
        return m.is_friendly || !m.tournament_id
      }
      return m.tournament_id === selectedComp
    })
  }, [matches, selectedComp])

  const filteredMatchIds = useMemo(() => new Set(filteredMatches.map(m => m.id)), [filteredMatches])

  // Votos relevantes para o filtro ativo
  const filteredVotes = useMemo(() => {
    return allVotes.filter(v => filteredMatchIds.has(v.event_id))
  }, [allVotes, filteredMatchIds])

  // Processar votos e apurar MVP por jogo
  const resultadosPorJogo = useMemo(() => {
    const mapa = new Map<
      string,
      {
        totalVotantes: number
        totalVotos: number
        contagem: { playerId: string; votos: number; player?: PlayerSummary }[]
        mvpIds: string[]
        maxVotos: number
        votosDetalhados: { voterId: string; voterName: string; escolhas: [string, string] }[]
      }
    >()

    for (const m of matches) {
      const votosDoJogo = allVotes.filter(v => v.event_id === m.id)
      const contagemMap: Record<string, number> = {}

      for (const v of votosDoJogo) {
        if (v.player1_id) contagemMap[v.player1_id] = (contagemMap[v.player1_id] || 0) + 1
        if (v.player2_id) contagemMap[v.player2_id] = (contagemMap[v.player2_id] || 0) + 1
      }

      let max = 0
      for (const c of Object.values(contagemMap)) {
        if (c > max) max = c
      }

      const mvpIds = max > 0 ? Object.entries(contagemMap).filter(([, c]) => c === max).map(([pid]) => pid) : []

      const contagem = Object.entries(contagemMap)
        .map(([playerId, votos]) => ({
          playerId,
          votos,
          player: playersMap.get(playerId),
        }))
        .sort((a, b) => b.votos - a.votos)

      const votosDetalhados = votosDoJogo.map(v => {
        const voter = playersMap.get(v.voter_id)
        return {
          voterId: v.voter_id,
          voterName: voter?.shirt_name || voter?.name || 'Votante',
          escolhas: [v.player1_id, v.player2_id] as [string, string],
        }
      })

      mapa.set(m.id, {
        totalVotantes: votosDoJogo.length,
        totalVotos: votosDoJogo.length * 2,
        contagem,
        mvpIds,
        maxVotos: max,
        votosDetalhados,
      })
    }

    return mapa
  }, [matches, allVotes, playersMap])

  // Totalizadores para as 2 tabelas classificativas
  const leaderboard = useMemo(() => {
    const stats: Record<string, PlayerStatsMvp> = {}

    // Inicializar jogadores que receberam votos
    for (const v of filteredVotes) {
      const pids = [v.player1_id, v.player2_id].filter(Boolean)
      for (const pid of pids) {
        if (!stats[pid]) {
          const info = playersMap.get(pid)
          stats[pid] = {
            id: pid,
            name: info?.name || 'Atleta',
            shirt_name: info?.shirt_name,
            jersey_number: info?.jersey_number,
            photo_url: info?.photo_url,
            position: info?.position,
            mvpWins: 0,
            totalVotes: 0,
            matchesVotedIn: 0,
          }
        }
        stats[pid].totalVotes += 1
      }
    }

    // Contar vitórias de MVP por jogo e jogos em que foi votado
    for (const m of filteredMatches) {
      const res = resultadosPorJogo.get(m.id)
      if (!res) continue

      if (res.mvpIds.length > 0) {
        for (const mvpId of res.mvpIds) {
          if (stats[mvpId]) {
            stats[mvpId].mvpWins += 1
          }
        }
      }

      for (const item of res.contagem) {
        if (stats[item.playerId]) {
          stats[item.playerId].matchesVotedIn += 1
        }
      }
    }

    return Object.values(stats)
  }, [filteredVotes, filteredMatches, resultadosPorJogo, playersMap])

  // Tabela 1: Mais Prémios MVP
  const rankingMvpWins = useMemo(() => {
    return [...leaderboard]
      .filter(p => p.mvpWins > 0 || p.totalVotes > 0)
      .sort((a, b) => {
        if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
        return b.totalVotes - a.totalVotes
      })
  }, [leaderboard])

  // Tabela 2: Mais Votados (Total de Votos)
  const rankingTotalVotes = useMemo(() => {
    return [...leaderboard]
      .filter(p => p.totalVotes > 0)
      .sort((a, b) => {
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
        return b.mvpWins - a.mvpWins
      })
  }, [leaderboard])

  // Agrupar jogos por competição
  const jogosAgrupados = useMemo(() => {
    const grupos: { nome: string; torneioId: string | null; isFriendly: boolean; jogos: MatchEvent[] }[] = []

    // 1. Torneios oficiais
    for (const t of tournaments) {
      const jogosDoTorneio = filteredMatches.filter(m => m.tournament_id === t.id)
      if (jogosDoTorneio.length > 0) {
        grupos.push({
          nome: t.name,
          torneioId: t.id,
          isFriendly: false,
          jogos: jogosDoTorneio,
        })
      }
    }

    // 2. Jogos amigáveis / de treino
    const amigaveis = filteredMatches.filter(m => m.is_friendly || !m.tournament_id)
    if (amigaveis.length > 0) {
      grupos.push({
        nome: 'Jogos Amigáveis & Treino',
        torneioId: null,
        isFriendly: true,
        jogos: amigaveis,
      })
    }

    return grupos
  }, [filteredMatches, tournaments])

  if (!autorizado) {
    return (
      <div className="py-12">
        <EstadoVazio
          icone={Lock}
          titulo="Acesso Restrito"
          texto="Este separador é de acesso exclusivo a Pedro Vieira e à administração."
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="py-16">
        <ACarregar texto="A carregar histórico e classificações de MVP..." />
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-8">
      {/* 1. Barra de Filtro de Competição */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setSelectedComp('all') }}
          className={`h-9 px-4 rounded-xl font-display font-extrabold text-xs whitespace-nowrap transition-all cursor-pointer ${
            selectedComp === 'all'
              ? 'bg-csc-gold text-csc-tinta shadow-md shadow-csc-gold/10'
              : 'bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
          }`}
        >
          Toda a Época
        </button>

        {tournaments.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => { triggerHaptic('light'); setSelectedComp(t.id) }}
            className={`h-9 px-4 rounded-xl font-display font-extrabold text-xs whitespace-nowrap transition-all cursor-pointer ${
              selectedComp === t.id
                ? 'bg-csc-gold text-csc-tinta shadow-md shadow-csc-gold/10'
                : 'bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            {t.name}
          </button>
        ))}

        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setSelectedComp('friendly') }}
          className={`h-9 px-4 rounded-xl font-display font-extrabold text-xs whitespace-nowrap transition-all cursor-pointer ${
            selectedComp === 'friendly'
              ? 'bg-csc-gold text-csc-tinta shadow-md shadow-csc-gold/10'
              : 'bg-white/[0.06] text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
          }`}
        >
          Amigáveis / Treino
        </button>
      </div>

      {/* 2. Seletor de Vista (Classificações vs Jogos) */}
      <FilaSeparadores
        itens={SEPARADORES_VISTA}
        ativo={vistaIndice}
        onEscolher={idx => { triggerHaptic('light'); setVistaIndice(idx) }}
        ariaLabel="Vistas MVP"
        idPainel="painel-mvp-vistas"
      />

      {/* 3. VISTA: TABELAS CLASSIFICATIVAS */}
      {vistaIndice === 0 && (
        <div className="space-y-4">
          {/* Seletor entre as 2 competições/totalizadores */}
          <div className="grid grid-cols-2 gap-2 bg-white/[0.04] p-1.5 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { triggerHaptic('light'); setTabelaAtiva('mvpWins') }}
              className={`py-2.5 px-3 rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                tabelaAtiva === 'mvpWins'
                  ? 'bg-csc-gold text-csc-tinta shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Trophy size={14} />
              <span>Mais Prémios MVP</span>
            </button>

            <button
              type="button"
              onClick={() => { triggerHaptic('light'); setTabelaAtiva('totalVotes') }}
              className={`py-2.5 px-3 rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                tabelaAtiva === 'totalVotes'
                  ? 'bg-csc-gold text-csc-tinta shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Vote size={14} />
              <span>Mais Votados (Total)</span>
            </button>
          </div>

          {/* Explicação da métrica */}
          <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-[11.5px] text-white/60 leading-snug flex items-start gap-2">
            <Sparkles size={14} className="text-csc-gold shrink-0 mt-0.5" />
            <p>
              {tabelaAtiva === 'mvpWins' ? (
                <>
                  <strong>Mais Nomeações MVP:</strong> Ordena os atletas pelo número de vezes que foram eleitos o <em>Melhor em Campo</em> num jogo.
                </>
              ) : (
                <>
                  <strong>Total de Votos Recebidos:</strong> Recompensa a regularidade ao somar todos os votos individuais que cada jogador recebeu ao longo da época.
                </>
              )}
            </p>
          </div>

          {/* Tabela Selecionada */}
          {tabelaAtiva === 'mvpWins' ? (
            rankingMvpWins.length === 0 ? (
              <div className="py-12">
                <EstadoVazio
                  icone={Trophy}
                  titulo="Sem eleições de MVP registadas"
                  texto="Quando os jogadores e equipa técnica votarem nas fichas de jogo, os resultados aparecerão aqui."
                />
              </div>
            ) : (
              <div className="bg-white/[0.05] border border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-3.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <span className="font-display font-extrabold text-xs text-csc-gold uppercase tracking-wider flex items-center gap-1.5">
                    <Trophy size={14} />
                    Classificação MVP por Jogo
                  </span>
                  <span className="text-[11px] text-white/50">
                    {rankingMvpWins.length} atletas
                  </span>
                </div>

                <div className="divide-y divide-white/5">
                  {rankingMvpWins.map((p, idx) => {
                    const pos = idx + 1
                    return (
                      <div
                        key={p.id}
                        className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Posição */}
                          <span
                            className={`w-6 text-center font-display font-black text-xs shrink-0 ${
                              pos === 1
                                ? 'text-csc-gold font-extrabold text-sm'
                                : pos === 2
                                ? 'text-white/90'
                                : pos === 3
                                ? 'text-amber-500/90'
                                : 'text-white/40'
                            }`}
                          >
                            {pos}º
                          </span>

                          {/* Número da camisola */}
                          <span className="w-7 h-7 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 font-display font-black text-[11px] flex items-center justify-center shrink-0">
                            {p.jersey_number || '—'}
                          </span>

                          {/* Nome e Posição */}
                          <div className="min-w-0">
                            <p className="font-display font-extrabold text-[13px] text-white truncate">
                              {p.shirt_name || p.name}
                            </p>
                            <p className="text-[10px] text-white/50 truncate">
                              {p.position || 'Jogador'} • {p.totalVotes} {p.totalVotes === 1 ? 'voto total' : 'votos totais'}
                            </p>
                          </div>
                        </div>

                        {/* Contagem de MVP */}
                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-csc-gold/15 text-csc-gold border border-csc-gold/30 font-display font-black text-xs">
                            <Award size={13} />
                            {p.mvpWins} {p.mvpWins === 1 ? 'MVP' : 'MVPs'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          ) : (
            rankingTotalVotes.length === 0 ? (
              <div className="py-12">
                <EstadoVazio
                  icone={Vote}
                  titulo="Sem votos registados"
                  texto="Os votos atribuídos aos atletas ao longo da época aparecerão totalizados aqui."
                />
              </div>
            ) : (
              <div className="bg-white/[0.05] border border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-3.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <span className="font-display font-extrabold text-xs text-csc-gold uppercase tracking-wider flex items-center gap-1.5">
                    <Vote size={14} />
                    Classificação por Total de Votos
                  </span>
                  <span className="text-[11px] text-white/50">
                    {rankingTotalVotes.length} atletas
                  </span>
                </div>

                <div className="divide-y divide-white/5">
                  {rankingTotalVotes.map((p, idx) => {
                    const pos = idx + 1
                    return (
                      <div
                        key={p.id}
                        className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 text-center font-display font-black text-xs shrink-0 ${
                              pos === 1
                                ? 'text-csc-gold font-extrabold text-sm'
                                : pos === 2
                                ? 'text-white/90'
                                : pos === 3
                                ? 'text-amber-500/90'
                                : 'text-white/40'
                            }`}
                          >
                            {pos}º
                          </span>

                          <span className="w-7 h-7 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 font-display font-black text-[11px] flex items-center justify-center shrink-0">
                            {p.jersey_number || '—'}
                          </span>

                          <div className="min-w-0">
                            <p className="font-display font-extrabold text-[13px] text-white truncate">
                              {p.shirt_name || p.name}
                            </p>
                            <p className="text-[10px] text-white/50 truncate">
                              {p.position || 'Jogador'} • {p.matchesVotedIn} {p.matchesVotedIn === 1 ? 'jogo c/ votos' : 'jogos c/ votos'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-csc-blue/20 text-csc-azul-texto border border-csc-blue/30 font-display font-black text-xs">
                            <Vote size={13} />
                            {p.totalVotes} {p.totalVotes === 1 ? 'voto' : 'votos'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* 4. VISTA: JOGOS & VOTAÇÕES (LISTA POR JOGO AGRUPADA) */}
      {vistaIndice === 1 && (
        <div className="space-y-6">
          {jogosAgrupados.length === 0 ? (
            <div className="py-12">
              <EstadoVazio
                icone={Calendar}
                titulo="Nenhum jogo encontrado"
                texto="Não existem jogos registados para o filtro selecionado."
              />
            </div>
          ) : (
            jogosAgrupados.map(grupo => (
              <div key={grupo.nome} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <EtiquetaSeccao como="h3" className="text-csc-gold font-display font-extrabold text-xs uppercase tracking-wider">
                    {grupo.nome}
                  </EtiquetaSeccao>
                  <span className="text-[10px] text-white/40">
                    ({grupo.jogos.length} {grupo.jogos.length === 1 ? 'jogo' : 'jogos'})
                  </span>
                </div>

                <div className="space-y-3">
                  {grupo.jogos.map(j => {
                    const res = resultadosPorJogo.get(j.id)
                    const d = new Date(j.date_time)
                    const dataFmt = d.toLocaleDateString('pt-PT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })
                    const csc = CLUBE_SIGLA
                    const opp = j.opponent?.initials || j.opponent?.name || 'Adversário'
                    const confronto = j.home_away === 'away' ? `${opp} vs ${csc}` : `${csc} vs ${opp}`
                    const placar =
                      j.home_score !== null && j.away_score !== null
                        ? j.home_away === 'away'
                          ? `${j.away_score} - ${j.home_score}`
                          : `${j.home_score} - ${j.away_score}`
                        : null

                    const expandido = jogoExpandido === j.id
                    const temVotos = res && res.totalVotos > 0

                    return (
                      <CartaoSimples key={j.id} className="p-4 space-y-3.5">
                        {/* Linha de Topo do Jogo */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-white/50">
                              {dataFmt}
                            </span>
                            <h4 className="font-display font-extrabold text-sm text-white mt-0.5">
                              {confronto}
                            </h4>
                          </div>

                          {placar && (
                            <span className="px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 text-white font-display font-black text-xs tabular-nums">
                              {placar}
                            </span>
                          )}
                        </div>

                        {/* Destaque do MVP do jogo */}
                        {temVotos ? (
                          <div className="p-3 rounded-xl bg-csc-gold/15 border border-csc-gold/30 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 font-black">
                                <Award size={16} />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-display font-bold uppercase tracking-wider text-csc-gold block">
                                  MVP do Jogo
                                </span>
                                <p className="font-display font-black text-xs text-white truncate">
                                  {res.mvpIds
                                    .map(pid => {
                                      const p = playersMap.get(pid)
                                      return p?.shirt_name || p?.name || 'Atleta'
                                    })
                                    .join(' & ')}
                                </p>
                              </div>
                            </div>

                            <span className="text-[11px] font-display font-black text-csc-gold px-2 py-0.5 rounded-lg bg-csc-gold/20">
                              {res.maxVotos} {res.maxVotos === 1 ? 'voto' : 'votos'}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/50 italic text-center">
                            Ainda sem votos registados para este jogo.
                          </div>
                        )}

                        {/* Lista dos Jogadores Votados no Jogo */}
                        {temVotos && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-white/40 block">
                              Votos da partida ({res.totalVotantes} votantes · {res.totalVotos} votos):
                            </span>

                            <div className="space-y-1">
                              {res.contagem.map(item => {
                                const percentagem =
                                  res.totalVotos > 0 ? Math.round((item.votos / res.totalVotos) * 100) : 0
                                const isMvp = res.mvpIds.includes(item.playerId)

                                return (
                                  <div
                                    key={item.playerId}
                                    className={`p-2 rounded-xl flex items-center justify-between gap-2 text-xs border ${
                                      isMvp
                                        ? 'bg-csc-gold/[0.08] border-csc-gold/25'
                                        : 'bg-white/[0.02] border-white/5'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-5 h-5 rounded-full bg-csc-dark text-csc-gold text-[10px] font-display font-black flex items-center justify-center border border-csc-gold/30 shrink-0">
                                        {item.player?.jersey_number || '—'}
                                      </span>
                                      <span className="font-display font-bold text-white truncate text-[11.5px]">
                                        {item.player?.shirt_name || item.player?.name || 'Atleta'}
                                      </span>
                                      {isMvp && (
                                        <span className="text-[9px] font-black uppercase px-1 rounded bg-csc-gold text-csc-tinta shrink-0">
                                          MVP
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-[11px] font-display font-extrabold text-white/80 tabular-nums">
                                        {item.votos} {item.votos === 1 ? 'voto' : 'votos'}
                                      </span>
                                      <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">
                                        {percentagem}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Detalhes de quem votou (Transparência para Administração / Pedro Vieira) */}
                        {temVotos && res.votosDetalhados.length > 0 && (
                          <div className="pt-2 border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light')
                                setJogoExpandido(expandido ? null : j.id)
                              }}
                              className="w-full flex items-center justify-between text-[11px] font-display font-bold text-white/50 hover:text-white/80 transition-colors cursor-pointer py-1"
                            >
                              <span>Ver detalhe dos votantes ({res.votosDetalhados.length})</span>
                              {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {expandido && (
                              <div className="mt-2 space-y-1 bg-black/30 p-2.5 rounded-xl border border-white/5 text-[11px]">
                                {res.votosDetalhados.map((v, i) => {
                                  const p1 = playersMap.get(v.escolhas[0])
                                  const p2 = playersMap.get(v.escolhas[1])
                                  const p1Name = p1?.shirt_name || p1?.name || 'Atleta'
                                  const p2Name = p2?.shirt_name || p2?.name || 'Atleta'

                                  return (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2 py-1 border-b border-white/5 last:border-none"
                                    >
                                      <span className="text-white/70 font-semibold truncate">
                                        {v.voterName}:
                                      </span>
                                      <span className="text-csc-gold font-bold text-right truncate">
                                        {p1Name} & {p2Name}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </CartaoSimples>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default MvpPage
