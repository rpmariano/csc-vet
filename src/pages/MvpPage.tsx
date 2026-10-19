import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Award,
  Trophy,
  Vote,
  ChevronDown,
  ChevronUp,
  Lock,
  Sparkles,
  Calendar,
  SlidersHorizontal,
  FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { temAcessoMVP, obterTodosVotosMvp, isVotacaoMvpAberta, type MvpVote, type PlayerSummary } from '../lib/mvp'
import { ACarregar, EstadoVazio, FilaSeparadores, Botao } from '../components/ui'
import { BottomSheet } from '../components/BottomSheet'
import { ProcuraEFiltros } from '../components/ProcuraEFiltros'
import { MatchReportModal } from '../components/MatchReportModal'
import { triggerHaptic } from '../utils/haptics'
import { formatClubSigla, formatOpponentSigla } from '../lib/siglas'
import { obterEmblemaEfetivo } from '../lib/sincronizarEquipas'
import { CLASSE_CAMPO as CAMPO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from '../components/ui/formulario'

interface Opponent {
  id: string
  name: string
  initials?: string | null
  logo_url?: string | null
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
  matchday?: number | null
  description?: string | null
  mvp_voting_closed?: boolean | null
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
  const { clubSettings } = useClub()
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<MatchEvent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [playersMap, setPlayersMap] = useState<Map<string, PlayerSummary>>(new Map())
  const [allVotes, setAllVotes] = useState<MvpVote[]>([])

  // Filtros
  const [selectedComp, setSelectedComp] = useState<string>('all')
  const [voteFilter, setVoteFilter] = useState<'all' | 'with_votes' | 'no_votes'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  // Vistas e Seleção
  const [vistaIndice, setVistaIndice] = useState(0)
  const [tabelaAtiva, setTabelaAtiva] = useState<'mvpWins' | 'totalVotes'>('mvpWins')
  const [jogoExpandido, setJogoExpandido] = useState<string | null>(null)
  const [eventoParaFicha, setEventoParaFicha] = useState<MatchEvent | null>(null)

  const autorizado = useMemo(() => temAcessoMVP(profile), [profile])
  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  const carregarDados = useCallback(async () => {
    if (!autorizado) return
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
          .select('id, title, date_time, is_friendly, matchday, description, mvp_voting_closed, tournament_id, opponent_id, home_away, home_score, away_score, opponent:opponents(id, name, initials, logo_url), tournament:tournaments(id, name, season, rules)')
          .eq('type', 'match')
          .order('date_time', { ascending: false }),
        supabase.from('tournaments').select('id, name, season').order('name'),
        supabase.from('v_players_public').select('id, name, shirt_name, jersey_number, photo_url, position'),
        obterTodosVotosMvp(),
      ])

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
      setAllVotes((votosData || []) as MvpVote[])
    } catch (err) {
      console.error('Erro ao carregar dados do ecrã MVP:', err)
    } finally {
      setLoading(false)
    }
  }, [autorizado, profile])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Processar votos e apurar MVP por jogo com base em PONTOS (3 pts para 1º, 1 pt para 2º)
  const resultadosPorJogo = useMemo(() => {
    const mapa = new Map<
      string,
      {
        totalVotantes: number
        totalVotos: number
        totalPontos: number
        contagem: {
          playerId: string
          pontos: number
          votos1: number
          votos2: number
          votos: number
          player?: PlayerSummary
        }[]
        mvpIds: string[]
        maxPontos: number
        votosDetalhados: { voterId: string; voterName: string; escolhas: [string, string] }[]
      }
    >()

    for (const m of matches) {
      const votosDoJogo = allVotes.filter(v => v.event_id === m.id)
      const pontosMap: Record<string, number> = {}
      const votos1Map: Record<string, number> = {}
      const votos2Map: Record<string, number> = {}
      const votosTotalMap: Record<string, number> = {}

      for (const v of votosDoJogo) {
        if (v.player1_id) {
          pontosMap[v.player1_id] = (pontosMap[v.player1_id] || 0) + 3
          votos1Map[v.player1_id] = (votos1Map[v.player1_id] || 0) + 1
          votosTotalMap[v.player1_id] = (votosTotalMap[v.player1_id] || 0) + 1
        }
        if (v.player2_id) {
          pontosMap[v.player2_id] = (pontosMap[v.player2_id] || 0) + 1
          votos2Map[v.player2_id] = (votos2Map[v.player2_id] || 0) + 1
          votosTotalMap[v.player2_id] = (votosTotalMap[v.player2_id] || 0) + 1
        }
      }

      let maxPontos = 0
      for (const p of Object.values(pontosMap)) {
        if (p > maxPontos) maxPontos = p
      }

      const mvpIds = maxPontos > 0 ? Object.entries(pontosMap).filter(([, p]) => p === maxPontos).map(([pid]) => pid) : []

      const contagem = Object.keys(pontosMap)
        .map(playerId => ({
          playerId,
          pontos: pontosMap[playerId] || 0,
          votos1: votos1Map[playerId] || 0,
          votos2: votos2Map[playerId] || 0,
          votos: votosTotalMap[playerId] || 0,
          player: playersMap.get(playerId),
        }))
        .sort((a, b) => {
          if (b.pontos !== a.pontos) return b.pontos - a.pontos
          return b.votos - a.votos
        })

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
        totalPontos: votosDoJogo.length * 4,
        contagem,
        mvpIds,
        maxPontos,
        votosDetalhados,
      })
    }

    return mapa
  }, [matches, allVotes, playersMap])

  // 1. Filtrar apenas jogos ocorridos (data passada OU com resultado OU com votos)
  const pastMatches = useMemo(() => {
    const now = Date.now()
    return matches.filter(m => {
      const eventTime = new Date(m.date_time).getTime()
      const hasScore = m.home_score !== null && m.home_score !== undefined
      const hasVotes = (resultadosPorJogo.get(m.id)?.totalVotos || 0) > 0
      return eventTime <= now || hasScore || hasVotes
    })
  }, [matches, resultadosPorJogo])

  // 2. Filtrar jogos pela competição selecionada ('all' | tournament_id | 'friendly')
  const matchesByComp = useMemo(() => {
    return pastMatches.filter(m => {
      if (selectedComp === 'all') return true
      if (selectedComp === 'friendly') {
        return m.is_friendly || !m.tournament_id
      }
      return m.tournament_id === selectedComp
    })
  }, [pastMatches, selectedComp])

  // 3. Filtrar jogos por pesquisa de texto e estado de votação
  const filteredMatches = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return matchesByComp.filter(m => {
      const res = resultadosPorJogo.get(m.id)
      const temVotos = (res?.totalVotos || 0) > 0
      if (voteFilter === 'with_votes' && !temVotos) return false
      if (voteFilter === 'no_votes' && temVotos) return false

      if (!term) return true
      const oppName = (m.opponent?.name || '').toLowerCase()
      const oppInitials = (m.opponent?.initials || '').toLowerCase()
      const tourName = (m.tournament?.name || '').toLowerCase()
      const title = (m.title || '').toLowerCase()

      const playersInMatch = (res?.contagem || []).some(c => {
        const pName = (c.player?.name || '').toLowerCase()
        const pShirt = (c.player?.shirt_name || '').toLowerCase()
        return pName.includes(term) || pShirt.includes(term)
      })

      return (
        oppName.includes(term) ||
        oppInitials.includes(term) ||
        tourName.includes(term) ||
        title.includes(term) ||
        playersInMatch
      )
    })
  }, [matchesByComp, searchTerm, voteFilter, resultadosPorJogo])

  // Votos relevantes para o filtro ativo de competição
  const filteredCompMatchIds = useMemo(() => new Set(matchesByComp.map(m => m.id)), [matchesByComp])
  const filteredVotes = useMemo(() => {
    return allVotes.filter(v => filteredCompMatchIds.has(v.event_id))
  }, [allVotes, filteredCompMatchIds])

  // Totalizadores para as 2 tabelas classificativas (baseados na competição ativa)
  const leaderboard = useMemo(() => {
    const stats: Record<string, PlayerStatsMvp> = {}

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

    for (const m of matchesByComp) {
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
  }, [filteredVotes, matchesByComp, resultadosPorJogo, playersMap])

  // Tabela 1: Mais Prémios MVP — Apenas atletas que ganharam prémios de MVP (> 0)
  const rankingMvpWins = useMemo(() => {
    return [...leaderboard]
      .filter(p => p.mvpWins > 0)
      .sort((a, b) => {
        if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
        return a.name.localeCompare(b.name, 'pt')
      })
  }, [leaderboard])

  // Tabela 2: Mais Votados (Total de Votos) — Em caso de igualdade de votos, desempata quem tem mais prémios MVP
  const rankingTotalVotes = useMemo(() => {
    return [...leaderboard]
      .filter(p => p.totalVotes > 0)
      .sort((a, b) => {
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes
        if (b.mvpWins !== a.mvpWins) return b.mvpWins - a.mvpWins
        return a.name.localeCompare(b.name, 'pt')
      })
  }, [leaderboard])

  // Rótulo descritivo da competição ativa
  const compLabel = useMemo(() => {
    if (selectedComp === 'all') return 'Toda a Época'
    if (selectedComp === 'friendly') return 'Amigáveis / Treino'
    const tour = tournaments.find(t => t.id === selectedComp)
    return tour?.name || 'Competição'
  }, [selectedComp, tournaments])

  const resumoFiltros = useMemo(() => {
    const list: string[] = []
    if (selectedComp !== 'all') {
      list.push(compLabel)
    }
    if (voteFilter === 'with_votes') {
      list.push('Com votos')
    } else if (voteFilter === 'no_votes') {
      list.push('Sem votos')
    }
    return list
  }, [selectedComp, compLabel, voteFilter])

  const temFiltros = selectedComp !== 'all' || voteFilter !== 'all' || searchTerm.trim() !== ''

  const limparFiltros = () => {
    triggerHaptic('light')
    setSelectedComp('all')
    setVoteFilter('all')
    setSearchTerm('')
  }

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
    <div className="space-y-4 pb-12">
      {/* 1. Seletor de Vista (Classificações vs Jogos & Votos) */}
      <FilaSeparadores
        itens={SEPARADORES_VISTA}
        ativo={vistaIndice}
        onEscolher={idx => { triggerHaptic('light'); setVistaIndice(idx) }}
        ariaLabel="Vistas MVP"
        idPainel="painel-mvp-vistas"
      />

      {/* 2. Barra de Procura e Filtro Integrada */}
      <ProcuraEFiltros
        procura={searchTerm}
        aoProcurar={setSearchTerm}
        placeholder={vistaIndice === 0 ? "Procurar atleta ou prova..." : "Adversário, prova ou atleta..."}
        rotulo="Procurar no MVP"
        aoAbrirFiltros={() => setFiltrosAbertos(true)}
        filtrosAtivos={resumoFiltros.length > 0}
        resumo={resumoFiltros}
        contagem={
          vistaIndice === 0
            ? `${rankingMvpWins.length} atletas`
            : `${filteredMatches.length} ${filteredMatches.length === 1 ? 'jogo' : 'jogos'}`
        }
        aoLimpar={limparFiltros}
      />

      {/* 3. Persiana de Filtros (BottomSheet com Competição Dinâmica e Estado de Votos) */}
      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Filtrar MVP"
        description="Escolhe a competição ou âmbito dos jogos"
        tone="dark"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <SlidersHorizontal size={17} />
          </div>
        }
        footer={
          <>
            <Botao aparencia="vidro" onClick={limparFiltros} disabled={!temFiltros}>
              Limpar
            </Botao>
            <Botao onClick={() => setFiltrosAbertos(false)}>
              Aplicar filtros
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          {/* Seletor Dinâmico de Competição */}
          <div>
            <label className={ETIQUETA} htmlFor="filtro-mvp-comp">
              Competição / Âmbito
            </label>
            <select
              id="filtro-mvp-comp"
              value={selectedComp}
              onChange={e => { triggerHaptic('selection'); setSelectedComp(e.target.value) }}
              className={CAMPO}
            >
              <option value="all">Toda a Época (Geral)</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.season ? ` (${t.season})` : ''}
                </option>
              ))}
              <option value="friendly">Jogos Amigáveis & Treino</option>
            </select>
          </div>

          {/* Filtro de Estado de Voto (relevante para os jogos) */}
          {vistaIndice === 1 && (
            <div>
              <label className={ETIQUETA} htmlFor="filtro-mvp-estado">
                Estado da Votação
              </label>
              <select
                id="filtro-mvp-estado"
                value={voteFilter}
                onChange={e => { triggerHaptic('selection'); setVoteFilter(e.target.value as any) }}
                className={CAMPO}
              >
                <option value="all">Todos os jogos realizados</option>
                <option value="with_votes">Apenas jogos com votos registados</option>
                <option value="no_votes">Apenas jogos sem votos ainda</option>
              </select>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* 4. VISTA: CLASSIFICAÇÕES */}
      {vistaIndice === 0 && (
        <div className="space-y-4">
          {/* Indicador da competição a contar */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-display font-extrabold uppercase tracking-wider text-csc-gold flex items-center gap-1.5">
              <Trophy size={13} />
              A contar: {compLabel}
            </span>
            {selectedComp !== 'all' && (
              <button
                type="button"
                onClick={() => { triggerHaptic('light'); setSelectedComp('all') }}
                className="text-[10px] text-white/50 hover:text-white underline cursor-pointer"
              >
                Ver época inteira
              </button>
            )}
          </div>

          {/* Seletor entre as 2 tabelas classificativas */}
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
          <div className="px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-[11px] text-white/60 leading-snug flex items-start gap-2">
            <Sparkles size={14} className="text-csc-gold shrink-0 mt-0.5" />
            <p>
              {tabelaAtiva === 'mvpWins' ? (
                <>
                  <strong>Mais Prémios MVP:</strong> Atletas com mais eleições de <em>Melhor em Campo</em> em {compLabel.toLowerCase()} (em cada jogo, o 1º escolhido ganha 3 pts e o 2º ganha 1 pt; vence o jogo quem acumular mais pontos).
                </>
              ) : (
                <>
                  <strong>Mais Votados (Total):</strong> Soma de todas as nomeações individuais ao longo da época (cada voto recebido como 1º ou como 2º conta como 1 voto).
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

                          <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 font-display font-black text-xs flex items-center justify-center shrink-0">
                            {p.jersey_number || '—'}
                          </span>

                          <div className="min-w-0">
                            <p className="font-display font-extrabold text-[13px] text-white truncate">
                              {p.shirt_name || p.name}
                            </p>
                            <p className="text-[10px] text-white/50 truncate">
                              {p.position || 'Jogador'} • {p.totalVotes} {p.totalVotes === 1 ? 'voto recebido' : 'votos recebidos'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-csc-gold/20 text-csc-gold border border-csc-gold/30 font-display font-black text-xs">
                            <Award size={14} />
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
                  texto="Os votos atribuídos aos atletas aparecerão totalizados aqui."
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

                          <span className="w-8 h-8 rounded-full bg-csc-dark text-csc-gold border border-csc-gold/40 font-display font-black text-xs flex items-center justify-center shrink-0">
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
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-csc-blue/20 text-csc-azul-texto border border-csc-blue/30 font-display font-black text-xs">
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

      {/* 5. VISTA: JOGOS & VOTOS (Estilo limpo igual às Fichas de Jogo) */}
      {vistaIndice === 1 && (
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="py-12">
              <EstadoVazio
                icone={Calendar}
                titulo="Nenhum jogo encontrado"
                texto={temFiltros ? "Tenta ajustar a pesquisa ou o filtro de competição." : "Assim que houver jogos realizados, aparecerão listados aqui."}
              />
            </div>
          ) : (
            filteredMatches.map(m => {
              const res = resultadosPorJogo.get(m.id)
              const temVotos = res && res.totalVotos > 0
              const expandido = jogoExpandido === m.id

              const dateObj = new Date(m.date_time)
              const dataCurta = [
                dateObj.toLocaleDateString('pt-PT', { weekday: 'short' }).replace(/\.?(-feira)?,?$/, ''),
                dateObj.getDate(),
                dateObj.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', ''),
              ].join(' ').replace(' ', ', ')
              const hora = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

              const isAway = m.home_away === 'away'
              const cscSigla = formatClubSigla(clubSettings?.initials)
              const oppSigla = formatOpponentSigla(m.opponent)

              const leftSigla = isAway ? oppSigla : cscSigla
              const rightSigla = isAway ? cscSigla : oppSigla

              const cscLogo = obterEmblemaEfetivo(clubSettings?.logo_url, 'Cascais', cscSigla)
              const oppLogo = obterEmblemaEfetivo(m.opponent?.logo_url, m.opponent?.name, oppSigla)
              const leftLogo = isAway ? oppLogo : cscLogo
              const rightLogo = isAway ? cscLogo : oppLogo

              const hasScore = m.home_score !== null && m.home_score !== undefined
              const leftScore = isAway ? m.away_score : m.home_score
              const rightScore = isAway ? m.home_score : m.away_score

              return (
                <div
                  key={m.id}
                  className="cartao-simples w-full p-3.5 space-y-3 transition-colors"
                >
                  {/* Linha superior: Data à esquerda, competição à direita */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display font-black text-[11.5px] text-white capitalize">
                      {dataCurta} · {hora}
                    </span>

                    <span className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {m.tournament ? (
                        <span className="font-display font-bold text-[9.5px] text-csc-verde-texto bg-csc-light/15 px-2.5 py-0.5 rounded-full truncate max-w-[150px]">
                          {m.tournament.name}
                        </span>
                      ) : m.is_friendly ? (
                        <span className="font-display font-bold text-[9.5px] text-csc-gold bg-csc-gold/12 px-2.5 py-0.5 rounded-full">
                          Amigável
                        </span>
                      ) : null}
                      {!isVotacaoMvpAberta(m) && (
                        <span className="font-display font-bold text-[9.5px] text-white/50 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">
                          Votação Encerrada
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Confronto e Placar central */}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {leftLogo ? (
                        <img src={leftLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-display font-black text-[10px] text-white/70 shrink-0">
                          {leftSigla.slice(0, 2)}
                        </span>
                      )}
                      <span className="font-display font-extrabold text-[13px] text-white truncate">
                        {leftSigla}
                      </span>
                    </div>

                    {hasScore ? (
                      <div className="px-3 py-1 rounded-xl bg-black/40 border border-white/10 font-display font-black text-sm text-white tabular-nums shrink-0">
                        {leftScore} - {rightScore}
                      </div>
                    ) : (
                      <span className="text-xs text-white/40 font-semibold px-2 shrink-0">vs</span>
                    )}

                    <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                      <span className="font-display font-extrabold text-[13px] text-white truncate">
                        {rightSigla}
                      </span>
                      {rightLogo ? (
                        <img src={rightLogo} alt="" className="w-6 h-6 object-contain shrink-0" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-display font-black text-[10px] text-white/70 shrink-0">
                          {rightSigla.slice(0, 2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Destaque do MVP do jogo */}
                  {temVotos && res.mvpIds.length > 0 ? (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-csc-gold/20 via-csc-gold/10 to-transparent border border-csc-gold/40 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 font-black shadow-xs">
                          <Award size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-display font-bold uppercase tracking-wider text-csc-gold block">
                            MVP da Partida
                          </span>
                          <p className="font-display font-black text-sm text-white truncate">
                            {res.mvpIds
                              .map(pid => {
                                const p = playersMap.get(pid)
                                return p?.shirt_name || p?.name || 'Atleta'
                              })
                              .join(' & ')}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-display font-black text-csc-gold bg-csc-gold/20 px-2 py-0.5 rounded-lg border border-csc-gold/30 block">
                          {res.maxPontos} {res.maxPontos === 1 ? 'ponto' : 'pontos'}
                        </span>
                        <span className="text-[9.5px] text-white/50 block mt-0.5">
                          {res.totalVotantes} votantes · {res.totalVotos} votos
                        </span>
                      </div>
                    </div>
                  ) : temVotos ? (
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                      <span className="text-white/80 font-bold flex items-center gap-1.5">
                        <Vote size={14} className="text-csc-gold" />
                        {res.totalVotos} votos registados ({res.totalVotantes} votantes)
                      </span>
                      <span className="text-[10px] text-csc-gold font-bold">Votação em aberto</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-white/40 italic flex items-center justify-between">
                      <span>Ainda sem votos registados para este jogo.</span>
                      <span className="text-[10px] text-white/30">Votação na ficha</span>
                    </div>
                  )}

                  {/* Barra de Ações: Ver votos detalhados e Ficha de jogo */}
                  <div className="pt-1 flex items-center justify-between gap-2 border-t border-white/5">
                    {temVotos ? (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light')
                          setJogoExpandido(expandido ? null : m.id)
                        }}
                        className="text-xs font-display font-bold text-white/70 hover:text-white flex items-center gap-1 cursor-pointer py-1"
                      >
                        <span>{expandido ? 'Ocultar detalhes' : `Ver detalhes dos votos (${res.contagem.length})`}</span>
                        {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    ) : (
                      <span className="text-[11px] text-white/30 italic">Sem ocorrências de voto</span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light')
                        setEventoParaFicha(m)
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 text-[11px] font-display font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <FileText size={12} className="text-csc-gold" />
                      <span>Ficha de jogo</span>
                    </button>
                  </div>

                  {/* Detalhe Expandido de Votação do Jogo */}
                  {expandido && temVotos && (
                    <div className="pt-2 space-y-3 border-t border-white/10">
                      {/* Distribuição de Pontos e Votos */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-csc-gold block">
                          Pontuação do Jogo ({res.totalVotantes} votantes · 1º: 3 pts, 2º: 1 pt):
                        </span>

                        <div className="space-y-1">
                          {res.contagem.map(item => {
                            const isMvp = res.mvpIds.includes(item.playerId)

                            return (
                              <div
                                key={item.playerId}
                                className={`p-2 rounded-xl flex items-center justify-between gap-2 text-xs border ${
                                  isMvp
                                    ? 'bg-csc-gold/[0.12] border-csc-gold/30'
                                    : 'bg-white/[0.03] border-white/5'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-5 h-5 rounded-full bg-csc-dark text-csc-gold text-[10px] font-display font-black flex items-center justify-center border border-csc-gold/30 shrink-0">
                                    {item.player?.jersey_number || '—'}
                                  </span>
                                  <div className="min-w-0">
                                    <span className="font-display font-bold text-white truncate text-[11.5px] flex items-center gap-1.5">
                                      <span>{item.player?.shirt_name || item.player?.name || 'Atleta'}</span>
                                      {isMvp && (
                                        <span className="text-[9px] font-black uppercase px-1 rounded bg-csc-gold text-csc-tinta shrink-0">
                                          MVP
                                        </span>
                                      )}
                                    </span>
                                    <p className="text-[10px] text-white/50">
                                      {item.votos1 > 0 ? `${item.votos1}x 1º (3 pts)` : ''}
                                      {item.votos1 > 0 && item.votos2 > 0 ? ' · ' : ''}
                                      {item.votos2 > 0 ? `${item.votos2}x 2º (1 pt)` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[11.5px] font-display font-black text-csc-gold tabular-nums">
                                    {item.pontos} {item.pontos === 1 ? 'pt' : 'pts'}
                                  </span>
                                  <span className="text-[10px] text-white/40 tabular-nums">
                                    ({item.votos} {item.votos === 1 ? 'voto' : 'votos'})
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Transparência dos Votantes */}
                      {res.votosDetalhados.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-white/5">
                          <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-white/50 block">
                            Registo de votos individuais:
                          </span>
                          <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1 text-xs">
                            {res.votosDetalhados.map((v, i) => {
                              const p1 = playersMap.get(v.escolhas[0])
                              const p2 = playersMap.get(v.escolhas[1])
                              const p1Name = p1?.shirt_name || p1?.name || 'Atleta'
                              const p2Name = p2?.shirt_name || p2?.name || 'Atleta'

                              return (
                                <div
                                  key={i}
                                  className="flex items-center justify-between gap-2 py-0.5 border-b border-white/5 last:border-none"
                                >
                                  <span className="text-white/70 font-semibold truncate text-[11.5px]">
                                    {v.voterName}:
                                  </span>
                                  <div className="flex items-center gap-1.5 text-right truncate text-[11px]">
                                    <span className="text-csc-gold font-bold">1º {p1Name} (3 pts)</span>
                                    <span className="text-white/40">·</span>
                                    <span className="text-csc-azul-texto font-bold">2º {p2Name} (1 pt)</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Modal Ficha de Jogo quando se clica em "Ficha de jogo" */}
      {eventoParaFicha && (
        <MatchReportModal
          isOpen={Boolean(eventoParaFicha)}
          onClose={() => setEventoParaFicha(null)}
          eventId={eventoParaFicha.id}
          event={eventoParaFicha}
          isCoachOrAdmin={Boolean(isCoachOrAdmin)}
          voltarPara="MVP"
          onSaved={() => {
            carregarDados()
          }}
        />
      )}
    </div>
  )
}

export default MvpPage
