import React, { useEffect, useState, useMemo } from 'react'
import {
  Trophy,
  Search,
  ChevronRight,
  SlidersHorizontal,
  Home,
  Plane,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { MatchReportModal, parseMatchReportMetadata } from '../components/MatchReportModal'
import { formatClubSigla, formatOpponentSigla } from './CalendarPage'
import { useSearchParams } from 'react-router-dom'
import { BottomSheet } from '../components/BottomSheet'
import { Pastilha, Botao } from '../components/ui'
import { triggerHaptic } from '../utils/haptics'

/** Campo e etiqueta dos formulários, o mesmo desenho do resto da app. */
const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/55 mb-1.5'

/** Como se lê cada filtro escondido, na linha de resumo. */
const ROTULOS_TIPO: Record<string, string> = {
  official: 'Oficiais',
  tournament: 'Por torneio',
  friendly: 'Amigáveis',
}

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

interface Field {
  id: string
  name: string
  address?: string | null
}

interface MatchEvent {
  id: string
  title: string
  date_time: string
  meeting_time?: string | null
  type: string
  field_id?: string | null
  location?: string | null
  description?: string | null
  is_friendly?: boolean | null
  is_active?: boolean | null
  tournament_id?: string | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
  home_score?: number | null
  away_score?: number | null
  opponent?: Opponent | null
  tournament?: Tournament | null
  field?: Field | null
}

type FilterType = 'all' | 'official' | 'tournament' | 'friendly'

export const MatchReportsPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState<MatchEvent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  // Modal de Ficha de Jogo
  const [selectedEventForReport, setSelectedEventForReport] = useState<MatchEvent | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  const fetchMatches = async () => {
    setLoading(true)
    try {
      const [{ data: eventsData }, { data: tourData }] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(id, name, initials, logo_url), tournament:tournaments(id, name, season, rules), field:fields(id, name, address)')
          .eq('type', 'match')
          .order('date_time', { ascending: false }),
        supabase
          .from('tournaments')
          .select('id, name, season')
          .order('name', { ascending: true })
      ])

      const now = new Date().getTime()
      
      // Filtrar apenas jogos ocorridos (data passada OU com resultado já registado)
      const pastMatches = (eventsData || []).filter((e: any) => {
        // Se for jogador (não coach/admin), só vê eventos ativos
        if (e.is_active === false && !isCoachOrAdmin) return false
        
        const eventTime = new Date(e.date_time).getTime()
        const hasScore = e.home_score !== null && e.home_score !== undefined
        return eventTime <= now || hasScore
      })

      setMatches(pastMatches)
      setTournaments(tourData || [])
      if (tourData && tourData.length > 0 && !selectedTournamentId) {
        setSelectedTournamentId(tourData[0].id)
      }
    } catch (err) {
      console.error('Error loading match reports:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMatches()
  }, [profile?.role])

  // Anos disponíveis a partir dos jogos registados
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>()
    matches.forEach(m => {
      if (m.date_time) {
        const y = new Date(m.date_time).getFullYear().toString()
        yearsSet.add(y)
      }
    })
    const currentYear = new Date().getFullYear().toString()
    yearsSet.add(currentYear)
    return Array.from(yearsSet).sort((a, b) => Number(b) - Number(a))
  }, [matches])

  const MONTHS = [
    { value: 'all', label: 'Todos os Meses' },
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ]

  // Filtragem e Ordenação dos jogos (do mais recente para o mais antigo)
  const filteredMatches = useMemo(() => {
    return matches
      .filter(m => {
        const q = searchTerm.toLowerCase().trim()
        if (q) {
          const oppName = m.opponent?.name?.toLowerCase() || ''
          const titleStr = (m.title || '').toLowerCase()
          const locationStr = (m.field?.name || m.location || '').toLowerCase()
          const tourName = m.tournament?.name?.toLowerCase() || ''
          if (!oppName.includes(q) && !titleStr.includes(q) && !locationStr.includes(q) && !tourName.includes(q)) {
            return false
          }
        }

        // Filtro de Tipo
        if (filterType === 'official' && m.is_friendly === true) return false
        if (filterType === 'friendly' && m.is_friendly !== true) return false
        if (filterType === 'tournament') {
          if (selectedTournamentId && m.tournament_id !== selectedTournamentId) return false
        }

        // Filtro de Ano
        if (selectedYear !== 'all') {
          const matchYear = new Date(m.date_time).getFullYear().toString()
          if (matchYear !== selectedYear) return false
        }

        // Filtro de Mês
        if (selectedMonth !== 'all') {
          const matchMonth = (new Date(m.date_time).getMonth() + 1).toString()
          if (matchMonth !== selectedMonth) return false
        }

        return true
      })
      .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
  }, [matches, searchTerm, filterType, selectedTournamentId, selectedYear, selectedMonth])

  // Ver uma ficha é navegar: o endereço passa a ter ?jogo=<id>, portanto tem
  // link próprio e o retroceder do browser fecha-a.
  const handleOpenReport = (ev: MatchEvent) => {
    setSelectedEventForReport(ev)
    setIsReportModalOpen(true)
    // Acrescentar, não substituir: esta página vive dentro dos separadores da
    // Competição, e o separador escolhido também vai no endereço (`?ver=`).
    // Um `setSearchParams({ jogo })` apagava-o, a Competição saltava para o
    // primeiro separador e a ficha nunca chegava a abrir.
    const seguintes = new URLSearchParams(searchParams)
    seguintes.set('jogo', ev.id)
    setSearchParams(seguintes)
  }

  const fecharFicha = () => {
    setIsReportModalOpen(false)
    if (searchParams.get('jogo')) {
      const restantes = new URLSearchParams(searchParams)
      restantes.delete('jogo')
      setSearchParams(restantes, { replace: true })
    }
  }

  useEffect(() => {
    const idJogo = searchParams.get('jogo')
    if (!idJogo) {
      setIsReportModalOpen(false)
      return
    }
    const alvo = matches.find(m => m.id === idJogo)
    if (alvo) {
      setSelectedEventForReport(alvo)
      setIsReportModalOpen(true)
    }
  }, [searchParams, matches])

  /**
   * O que a persiana esconde, para o funil poder acender e a linha de resumo
   * dizê-lo. As pastilhas de tipo entram no resumo — ao contrário da Agenda,
   * aqui o "Limpar" tem de as repor também, senão fica meia limpeza.
   */
  const temFiltros =
    searchTerm.trim() !== '' ||
    filterType !== 'all' ||
    selectedYear !== 'all' ||
    selectedMonth !== 'all'

  const resumoFiltros = [
    searchTerm.trim() ? `"${searchTerm.trim()}"` : null,
    filterType !== 'all' ? ROTULOS_TIPO[filterType] : null,
    selectedYear !== 'all' ? selectedYear : null,
    selectedMonth !== 'all' ? MONTHS.find(m => m.value === selectedMonth)?.label : null,
  ]
    .filter(Boolean)
    .join(' · ') || 'Filtrado'

  const limparFiltros = () => {
    setSearchTerm('')
    setFilterType('all')
    setSelectedYear('all')
    setSelectedMonth('all')
  }

  const handleSavedReport = () => {
    fetchMatches()
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="space-y-4">
      
      {/*
        Pesquisa e filtros das fichas (ecrã 1b). O handoff mostra a caixa de
        pesquisa e quatro pastilhas, e mais nada. O ano, o mês e o torneio não
        estão lá mas fazem falta a quem procura um jogo de há duas épocas —
        vão para a persiana atrás do funil, como na Agenda e nos Eventos.
      */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
          <input
            type="search"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Adversário, torneio ou local"
            aria-label="Procurar nas fichas de jogo"
            className={`${CAMPO} pl-9.5`}
          />
        </div>
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setFiltrosAbertos(true) }}
          aria-label={temFiltros ? 'Filtros (ativos)' : 'Filtros'}
          className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              temFiltros
                ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                : 'bg-white/10 border-white/15 text-white/75'
            }`}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      <div className="sem-barra-rolagem flex gap-2 overflow-x-auto pb-0.5">
        {([
          ['all', 'Todos'],
          ['official', 'Oficiais'],
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

      {temFiltros && (
        <button
          type="button"
          onClick={limparFiltros}
          className="cartao-simples w-full min-h-11 flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer
            bg-csc-gold/10 border-csc-gold/30 transition-transform duration-150 active:scale-97"
        >
          <SlidersHorizontal size={14} className="text-csc-gold shrink-0" />
          <span className="flex-1 font-display font-bold text-[11px] text-white/80">
            {resumoFiltros} · {filteredMatches.length} {filteredMatches.length === 1 ? 'jogo' : 'jogos'}
          </span>
          <span className="font-display font-bold text-[11px] text-csc-gold">Limpar</span>
        </button>
      )}

      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Filtrar fichas"
        description="Sobre o tipo de jogo escolhido em cima"
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
              Ver {filteredMatches.length} {filteredMatches.length === 1 ? 'jogo' : 'jogos'}
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={ETIQUETA} htmlFor="ficha-ano">Ano</label>
            <select
              id="ficha-ano"
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className={CAMPO}
            >
              <option value="all">Todos os anos</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="ficha-mes">Mês</label>
            <select
              id="ficha-mes"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className={CAMPO}
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Só faz sentido escolher a prova quando se está a filtrar por ela. */}
          {filterType === 'tournament' && (
            <div>
              <label className={ETIQUETA} htmlFor="ficha-torneio">Torneio</label>
              <select
                id="ficha-torneio"
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
        </div>
      </BottomSheet>

      {/* Lista de Jogos Ocorridos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[35vh] text-white">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-gold mb-3"></div>
          <p className="text-xs font-bold text-white/70">A carregar fichas de jogo...</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="bg-csc-dark text-white rounded-3xl p-10 text-center border border-dashed border-white/15 space-y-3">
          <Trophy size={42} className="mx-auto text-white/20" />
          <p className="font-black text-white text-sm sm:text-base">Nenhum jogo ocorrido encontrado</p>
          <p className="text-xs text-white/70 max-w-sm mx-auto">
            Assim que os jogos da época forem realizados ou tiverem resultado registado, as suas fichas técnicas aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map(m => {
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

            const leftLogo = isAway ? m.opponent?.logo_url : '/csc-vet/cascais-emblem.png'
            const rightLogo = isAway ? '/csc-vet/cascais-emblem.png' : m.opponent?.logo_url

            const locationStr = m.field?.name || m.location || 'Campo a definir'
            const hasScore = m.home_score !== null && m.home_score !== undefined

            const parsedMeta = parseMatchReportMetadata(m.description)
            const formationDisplay = (parsedMeta.tacticalFormation || '4-3-3').replace(/^1-/, '')

            const nomeAdversario = m.opponent?.name || 'adversário'

            return (
              /*
                Cartão de ficha (ecrã 1b): a data e a prova em cima, o placar
                ao meio, o local e a entrada para a ficha em baixo.

                É um `button` e não um `div` com `onClick` — abre a persiana da
                ficha, e quem navega por teclado tem de lá chegar. Ver a
                convenção no CLAUDE.md.
              */
              <button
                key={m.id}
                type="button"
                onClick={() => { triggerHaptic('light'); handleOpenReport(m) }}
                aria-label={`${isCoachOrAdmin ? 'Editar' : 'Ver'} a ficha do jogo com ${nomeAdversario} de ${dataCurta}`}
                className="cartao-simples w-full text-left p-3.5 space-y-3 cursor-pointer
                  transition-transform duration-150 active:scale-[0.99]
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                {/* Data à esquerda, prova à direita. */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-black text-[11.5px] text-white capitalize">
                    {dataCurta} · {hora}
                  </span>

                  <span className="flex items-center gap-1.5 shrink-0">
                    {m.is_active === false && (
                      <span className="font-display font-black text-[8.5px] tracking-[0.1em] uppercase text-csc-gold bg-csc-gold/15 border border-csc-gold/30 px-2 py-0.5 rounded-full">
                        Rascunho
                      </span>
                    )}
                    {m.tournament ? (
                      <span className="font-display font-bold text-[9.5px] text-csc-verde-texto bg-csc-light/15 border border-csc-light/30 px-2.5 py-1 rounded-full truncate max-w-[130px]">
                        {m.tournament.name}
                      </span>
                    ) : m.is_friendly ? (
                      <span className="font-display font-bold text-[9.5px] text-csc-gold bg-csc-gold/12 border border-csc-gold/30 px-2.5 py-1 rounded-full">
                        Amigável
                      </span>
                    ) : null}
                  </span>
                </div>

                {/* Placar. */}
                <div className="flex items-center justify-center gap-2.5">
                  <span className="flex-1 flex items-center justify-end gap-2 min-w-0">
                    <span className="font-display font-black text-[13px] text-white uppercase truncate">
                      {leftSigla}
                    </span>
                    <span className="w-9 h-9 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0">
                      {leftLogo ? (
                        <img src={leftLogo} alt="" className="w-full h-full object-contain rounded-full" />
                      ) : (
                        <span className="font-display font-black text-csc-tinta text-[9px]">{leftSigla}</span>
                      )}
                    </span>
                  </span>

                  <span className="flex items-center gap-1.5 shrink-0">
                    {hasScore ? (
                      <>
                        <span className="min-w-9 text-center font-display font-black text-[22px] text-white bg-white/8 border border-white/12 px-2 py-0.5 rounded-xl tabular-nums">
                          {m.home_score}
                        </span>
                        <span className="font-display font-black text-csc-gold">:</span>
                        <span className="min-w-9 text-center font-display font-black text-[22px] text-white bg-white/8 border border-white/12 px-2 py-0.5 rounded-xl tabular-nums">
                          {m.away_score}
                        </span>
                      </>
                    ) : (
                      <span className="font-display font-black text-[10px] text-white/55 uppercase tracking-[0.14em] px-2.5 py-1.5 bg-white/10 rounded-lg">
                        vs
                      </span>
                    )}
                  </span>

                  <span className="flex-1 flex items-center justify-start gap-2 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-white p-0.5 flex items-center justify-center shrink-0">
                      {rightLogo ? (
                        <img src={rightLogo} alt="" className="w-full h-full object-contain rounded-full" />
                      ) : (
                        <span className="font-display font-black text-csc-tinta text-[9px]">{rightSigla}</span>
                      )}
                    </span>
                    <span className="font-display font-black text-[13px] text-white uppercase truncate">
                      {rightSigla}
                    </span>
                  </span>
                </div>

                {/* Local, casa ou fora, tática — e a entrada para a ficha. */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/10">
                  <span className="flex items-center gap-1.5 min-w-0 text-white/55">
                    {isAway
                      ? <Plane size={12} className="shrink-0 text-white/40" />
                      : <Home size={12} className="shrink-0 text-white/40" />}
                    <span className="text-[10.5px] font-semibold truncate">
                      {isAway ? 'Fora' : 'Casa'} · {locationStr}
                    </span>
                    {formationDisplay && (
                      <span className="shrink-0 text-[9px] bg-white/8 text-white/55 px-1.5 py-0.5 rounded font-bold tabular-nums">
                        {formationDisplay}
                      </span>
                    )}
                  </span>

                  <span className="flex items-center gap-0.5 text-csc-gold font-display font-black text-[11px] shrink-0">
                    {isCoachOrAdmin ? 'Editar ficha' : 'Ver ficha'}
                    <ChevronRight size={14} />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      </div>

      {/* Modal da Ficha de Jogo. A condição usa só `selectedEventForReport` (nunca é
          limpo ao fechar) para a persiana poder deslizar para fora suavemente em vez de
          desaparecer no instante em que `isReportModalOpen` passa a false. */}
      {selectedEventForReport && (
        <MatchReportModal
          isOpen={isReportModalOpen}
          onClose={fecharFicha}
          eventId={selectedEventForReport.id}
          event={selectedEventForReport}
          isCoachOrAdmin={!!isCoachOrAdmin}
          tournamentRules={(selectedEventForReport as any)?.tournament?.rules}
          onSaved={handleSavedReport}
        />
      )}

    </div>
  )
}

export default MatchReportsPage
