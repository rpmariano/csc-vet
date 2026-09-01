import React, { useEffect, useState, useMemo } from 'react'
import { 
  Trophy, 
  Calendar, 
  MapPin, 
  Search, 
  Filter, 
  ChevronRight
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { MatchReportModal, parseMatchReportMetadata } from '../components/MatchReportModal'
import { formatClubSigla, formatOpponentSigla } from './CalendarPage'

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
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)

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

  const handleOpenReport = (ev: MatchEvent) => {
    setSelectedEventForReport(ev)
    setIsReportModalOpen(true)
  }

  const handleSavedReport = () => {
    fetchMatches()
  }

  return (
    <div className="space-y-4 pb-12">
      
      {/* Barra de Pesquisa e Filtros */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200 space-y-3">
        {/* Pesquisa Rápida */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por adversário, torneio ou local..."
            className="w-full pl-9.5 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm font-semibold outline-none focus:bg-white focus:ring-2 focus:ring-csc-dark transition-all"
          />
        </div>

        {/* Pílulas de Contexto */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'Todos os Jogos', emoji: '🌐' },
            { id: 'official', label: 'Competições Oficiais', emoji: '🏆' },
            { id: 'tournament', label: 'Por Torneio', emoji: '🏅' },
            { id: 'friendly', label: 'Amigáveis', emoji: '⚽' },
          ].map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilterType(opt.id as FilterType)}
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

        {/* Linha 2: Filtro por Ano, Mês e Torneio */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-gray-100">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-1.5 min-w-[120px]">
            <Calendar size={14} className="text-csc-gold shrink-0" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-xl text-xs font-black outline-none cursor-pointer border border-gray-300 bg-gray-50 hover:bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark focus:border-csc-dark transition-all"
            >
              <option value="all">Todos os Anos</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Seletor de Mês */}
          <div className="flex items-center gap-1.5 min-w-[140px]">
            <span className="text-xs">🗓️</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full py-1.5 px-2.5 rounded-xl text-xs font-black outline-none cursor-pointer border border-gray-300 bg-gray-50 hover:bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark focus:border-csc-dark transition-all"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Seletor de Torneio (quando Por Torneio está ativo) */}
          {filterType === 'tournament' && (
            <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
              <Filter size={14} className="text-csc-gold shrink-0" />
              <select
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className="w-full py-1.5 px-2.5 rounded-xl text-xs font-black outline-none cursor-pointer border border-gray-300 bg-gray-50 hover:bg-white text-gray-900 focus:ring-2 focus:ring-csc-dark focus:border-csc-dark transition-all"
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

          {/* Botão Limpar Filtros se algum estiver ativo */}
          {(selectedYear !== 'all' || selectedMonth !== 'all' || filterType !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setSelectedYear('all')
                setSelectedMonth('all')
                setFilterType('all')
                setSearchTerm('')
              }}
              className="text-[11px] font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors cursor-pointer ml-auto"
            >
              ✕ Limpar filtros
            </button>
          )}
        </div>
      </div>

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
            const dateFormatted = dateObj.toLocaleDateString('pt-PT', { 
              weekday: 'short', 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric' 
            })
            const timeFormatted = dateObj.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

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

            return (
              <div
                key={m.id}
                onClick={() => handleOpenReport(m)}
                className="bg-csc-dark text-white rounded-2xl sm:rounded-3xl border border-white/10 hover:border-csc-gold/60 shadow-sm p-4 sm:p-5 transition-all cursor-pointer hover:shadow-md active:scale-[0.99] space-y-3.5 group"
              >
                {/* Header do Card: Data, Competição e Condição */}
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white capitalize flex items-center gap-1.5">
                      <Calendar size={14} className="text-csc-gold" />
                      <span>{dateFormatted} • {timeFormatted}</span>
                    </span>
                    {m.is_active === false && (
                      <span className="text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                        Rascunho
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {m.tournament ? (
                      <span className="text-[10px] font-black bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Trophy size={11} className="text-emerald-700" />
                        <span>{m.tournament.name}</span>
                      </span>
                    ) : m.is_friendly ? (
                      <span className="text-[10px] font-black bg-purple-50 text-purple-900 border border-purple-200 px-2.5 py-0.5 rounded-full">
                        ⚽ Amigável
                      </span>
                    ) : null}

                    <span className="text-[10px] font-extrabold text-white/60 bg-white/10 px-2 py-0.5 rounded-full">
                      {isAway ? '✈️ Fora' : '🏠 Casa'}
                    </span>
                  </div>
                </div>

                {/* Scoreboard Central */}
                <div className="grid grid-cols-11 items-center gap-2 py-1 text-center">
                  {/* Equipa Esquerda */}
                  <div className="col-span-4 flex items-center justify-end gap-2.5 min-w-0">
                    <span className="text-sm sm:text-base font-black text-white uppercase truncate">
                      {leftSigla}
                    </span>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white p-1 border border-white/20 flex items-center justify-center shrink-0 shadow-xs">
                      {leftLogo ? (
                        <img src={leftLogo} alt={leftSigla} className="w-full h-full object-contain rounded-full" />
                      ) : (
                        <span className="font-black text-csc-dark text-xs">{leftSigla}</span>
                      )}
                    </div>
                  </div>

                  {/* Placar */}
                  <div className="col-span-3 flex flex-col items-center justify-center">
                    {hasScore ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xl sm:text-3xl font-black text-white bg-white/10 px-2.5 py-0.5 rounded-xl border border-white/15 shadow-inner">
                          {m.home_score}
                        </span>
                        <span className="text-lg font-black text-csc-gold">:</span>
                        <span className="text-2xl sm:text-3xl font-black text-white bg-white/10 px-2.5 py-0.5 rounded-xl border border-white/15 shadow-inner">
                          {m.away_score}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-black text-white/65 uppercase tracking-widest px-2 py-1 bg-white/10 rounded-lg">
                        VS
                      </span>
                    )}
                  </div>

                  {/* Equipa Direita */}
                  <div className="col-span-4 flex items-center justify-start gap-2.5 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white p-1 border border-white/20 flex items-center justify-center shrink-0 shadow-xs">
                      {rightLogo ? (
                        <img src={rightLogo} alt={rightSigla} className="w-full h-full object-contain rounded-full" />
                      ) : (
                        <span className="font-black text-csc-dark text-xs">{rightSigla}</span>
                      )}
                    </div>
                    <span className="text-sm sm:text-base font-black text-white uppercase truncate">
                      {rightSigla}
                    </span>
                  </div>
                </div>

                {/* Footer do Card: Local e Botão de Ação */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/10 text-xs">
                  <div className="flex items-center gap-1.5 text-white/60 font-semibold truncate min-w-0">
                    <MapPin size={13} className="text-red-500 shrink-0" />
                    <span className="truncate">{locationStr}</span>
                    {formationDisplay && (
                      <span className="hidden sm:inline-block text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded-md font-bold ml-1">
                        Tática: {formationDisplay}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-csc-gold group-hover:text-emerald-300 font-black shrink-0">
                    <span>{isCoachOrAdmin ? 'Editar Ficha' : 'Ver Ficha'}</span>
                    <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Modal da Ficha de Jogo. A condição usa só `selectedEventForReport` (nunca é
          limpo ao fechar) para a persiana poder deslizar para fora suavemente em vez de
          desaparecer no instante em que `isReportModalOpen` passa a false. */}
      {selectedEventForReport && (
        <MatchReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
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
