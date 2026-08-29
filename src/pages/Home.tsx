import React, { useEffect, useState } from 'react'
import { 
  Bell, 
  Calendar, 
  DollarSign, 
  MapPin, 
  Clock, 
  Info, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ExternalLink,
  Users,
  Shield,
  PlusCircle,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Trophy
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { TrainingIcon } from './EventsPage'

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  location: string
  description: string
  home_away?: 'home' | 'away' | 'neutral'
  is_friendly?: boolean
  tournament_id?: string | null
  tournament?: {
    name: string
  } | null
  tournament_name?: string
  field?: {
    name: string
    address?: string | null
  } | null
  opponent?: {
    name: string
    initials: string
    logo_url: string
  }
}

interface Announcement {
  id: string
  title: string
  content: string
  published_at: string
}

interface Callup {
  id: string
  event_id: string
  status: 'called' | 'confirmed' | 'declined'
  event: Event
}

interface Due {
  id: string
  month_year: string
  amount: number
  status: 'pending' | 'paid' | 'late'
}

const Home: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const navigate = useNavigate()

  // Matches Carousel State
  const [upcomingMatches, setUpcomingMatches] = useState<Event[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Practices Carousel State
  const [upcomingPractices, setUpcomingPractices] = useState<Event[]>([])
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0)

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [pendingDues, setPendingDues] = useState<Due[]>([])
  const [loading, setLoading] = useState(true)

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoading(true)
      try {
        const nowStr = new Date().toISOString()

        // 1. Fetch upcoming matches
        const { data: matches } = await supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season), field:fields(id, name, address)')
          .eq('type', 'match')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })

        let resolvedMatches: Event[] = (matches && matches.length > 0) ? (matches as Event[]) : []
        if (resolvedMatches.length === 0) {
          const { data: allM } = await supabase
            .from('events')
            .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season), field:fields(id, name, address)')
            .eq('type', 'match')
            .order('date_time', { ascending: true })
          if (allM && allM.length > 0) {
            resolvedMatches = allM as Event[]
          }
        }
        if (resolvedMatches.length === 0) {
          resolvedMatches = [
            {
              id: 'm-demo',
              title: 'Pescadores CC vs CSC',
              type: 'match',
              date_time: '2026-09-12T18:00:00Z',
              meeting_time: '16:00:00',
              location: 'Costa da Caparica',
              description: 'Jogo Amigável de preparação.',
              is_friendly: true,
              home_away: 'away'
            }
          ]
        }
        setUpcomingMatches(resolvedMatches)

        // 2. Fetch upcoming practices
        const { data: practices } = await supabase
          .from('events')
          .select('*, field:fields(id, name, address)')
          .eq('type', 'practice')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })

        let resolvedPractices: Event[] = (practices && practices.length > 0) ? (practices as Event[]) : []
        if (resolvedPractices.length === 0) {
          const { data: allP } = await supabase
            .from('events')
            .select('*, field:fields(id, name, address)')
            .eq('type', 'practice')
            .order('date_time', { ascending: true })
          if (allP && allP.length > 0) {
            resolvedPractices = allP as Event[]
          }
        }
        if (resolvedPractices.length === 0) {
          resolvedPractices = [
            {
              id: 'p-demo',
              title: 'Treino Semanal Veteranos',
              type: 'practice',
              date_time: '2026-09-02T22:00:00Z',
              meeting_time: '21:30:00',
              location: 'Campo Sintético Municipal',
              description: 'Balneário 4 às 21h30'
            }
          ]
        }
        setUpcomingPractices(resolvedPractices)

        // 3. Fetch announcements
        const { data: anns } = await supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(3)

        if (anns && anns.length > 0) {
          setAnnouncements(anns as Announcement[])
        } else {
          setAnnouncements([
            {
              id: 'a-demo',
              title: 'Comunicações Importantes',
              content: 'Caros atletas, recordamos que os treinos começam pontualmente. A comparência no balneário deve ser feita 30 minutos antes.',
              published_at: new Date().toISOString()
            }
          ])
        }

        // 4. Fetch callups
        const { data: calls } = await supabase
          .from('callups')
          .select('*, event:events(*)')
          .eq('player_id', profile.id)

        if (calls && calls.length > 0) {
          setMyCallups(calls as unknown as Callup[])
        }

        // 5. Fetch dues
        const { data: duesData } = await supabase
          .from('dues')
          .select('*')
          .eq('player_id', profile.id)
          .neq('status', 'paid')

        if (duesData && duesData.length > 0) {
          setPendingDues(duesData as Due[])
        } else {
          setPendingDues([
            { id: 'd-demo', month_year: '08 Setembro', amount: 15, status: 'pending' }
          ])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile])

  const handleCallupResponse = async (callupId: string, status: 'confirmed' | 'declined') => {
    try {
      await supabase.from('callups').update({ status }).eq('id', callupId)
      setMyCallups(prev => prev.map(c => (c.id === callupId ? { ...c, status } : c)))
    } catch {
      setMyCallups(prev => prev.map(c => (c.id === callupId ? { ...c, status } : c)))
    }
  }

  // Carousel Controls
  const nextMatchSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (upcomingMatches.length > 1) {
      setCurrentMatchIndex(prev => (prev + 1) % upcomingMatches.length)
    }
  }

  const prevMatchSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (upcomingMatches.length > 1) {
      setCurrentMatchIndex(prev => (prev - 1 + upcomingMatches.length) % upcomingMatches.length)
    }
  }

  const nextPracticeSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (upcomingPractices.length > 1) {
      setCurrentPracticeIndex(prev => (prev + 1) % upcomingPractices.length)
    }
  }

  const prevPracticeSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (upcomingPractices.length > 1) {
      setCurrentPracticeIndex(prev => (prev - 1 + upcomingPractices.length) % upcomingPractices.length)
    }
  }

  const pendingCallupsCount = myCallups.filter(c => c.status === 'called').length

  const currentMatch = upcomingMatches[currentMatchIndex]
  const currentPractice = upcomingPractices[currentPracticeIndex]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* 1. HERO HEADER DE BOAS-VINDAS (Desktop & Mobile) */}
      <div className="bg-gradient-to-r from-csc-dark via-gray-900 to-csc-dark text-white rounded-2xl p-6 shadow-md border-b-4 border-csc-gold flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-csc-gold text-csc-dark shadow-xs">
              {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'coach' ? 'Treinador' : 'Atleta'}
            </span>
            {profile?.jersey_number && (
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                Camisola #{profile.jersey_number} {profile?.shirt_name ? `(${profile.shirt_name})` : ''}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Olá, {profile?.name || 'Atleta'}!
          </h1>
          <p className="text-gray-300 text-xs sm:text-sm mt-1">
            {clubSettings?.name || 'Veteranos F.C.'} • Painel Central de Informação e Atividade
          </p>
        </div>

        {/* Atalhos de Ação Rápida no Topo */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/calendar"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border border-white/15 shadow-xs"
          >
            <Calendar size={15} className="text-csc-gold" />
            <span>Ver Agenda</span>
          </Link>
          {isCoachOrAdmin && (
            <Link
              to="/events"
              className="px-4 py-2 bg-csc-gold hover:bg-amber-400 text-csc-dark rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <PlusCircle size={15} />
              <span>Criar Jogo/Treino</span>
            </Link>
          )}
        </div>
      </div>

      {/* ALERTA DE CONVOCATÓRIAS PENDENTES */}
      {pendingCallupsCount > 0 && (
        <div className="bg-amber-500 text-csc-dark rounded-2xl p-4 shadow-sm flex items-center justify-between border-2 border-amber-600 animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="shrink-0 text-csc-dark" />
            <div>
              <p className="font-black text-sm">
                Tens {pendingCallupsCount} {pendingCallupsCount === 1 ? 'convocatória pendente' : 'convocatórias pendentes'}!
              </p>
              <p className="text-xs font-medium text-amber-950">Confirma a tua disponibilidade para os próximos eventos.</p>
            </div>
          </div>
          <Link
            to="/calendar"
            className="bg-csc-dark text-white text-xs font-bold px-3.5 py-1.5 rounded-lg shadow-sm shrink-0 hover:bg-black transition-colors flex items-center gap-1"
          >
            <span>Responder</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* 2. GRELHA PRINCIPAL DO DASHBOARD (2 Colunas em Desktop, 1 Coluna em Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* COLUNA ESQUERDA / PRINCIPAL (2/3 da largura em Desktop) */}
        <div className="lg:col-span-2 space-y-6">

          {/* CARROSSEL DE JOGOS MARCADOS */}
          {currentMatch && (
            <div className="bg-white rounded-3xl border-2 border-blue-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-500 transition-all">
              {/* Header com Navegação do Carrossel */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-5 py-3.5 text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <Trophy size={18} className="text-amber-300" />
                  <h2 className="text-sm sm:text-base font-black tracking-wide">
                    Jogos Marcados
                  </h2>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-xs">
                    {upcomingMatches.length} {upcomingMatches.length === 1 ? 'Jogo' : 'Jogos'}
                  </span>
                </div>

                {/* Controles de Navegação */}
                <div className="flex items-center gap-2">
                  {upcomingMatches.length > 1 && (
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-xl border border-white/20">
                      <button
                        onClick={prevMatchSlide}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer active:scale-90"
                        title="Jogo Anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-black px-1.5">
                        {currentMatchIndex + 1} / {upcomingMatches.length}
                      </span>
                      <button
                        onClick={nextMatchSlide}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer active:scale-90"
                        title="Próximo Jogo"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  <span className="text-[11px] font-bold text-blue-200 hidden sm:inline-flex items-center gap-1 ml-1 group-hover:text-white">
                    <span>Ver Detalhes</span>
                    <ChevronRight size={14} />
                  </span>
                </div>
              </div>

              {/* Cartão Clicável do Jogo Atual */}
              <div 
                onClick={() => navigate(`/calendar?event=${currentMatch.id}`)}
                className="p-5 sm:p-6 space-y-4 cursor-pointer hover:bg-blue-50/20 transition-colors group"
              >
                {/* Badges do Jogo */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-blue-600 text-white shadow-2xs uppercase">
                      Jogo
                    </span>
                    {currentMatch.is_friendly ? (
                      <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-amber-100 text-amber-950 border border-amber-300">
                        Amigável
                      </span>
                    ) : (
                      (currentMatch.tournament?.name || currentMatch.tournament_name) && (
                        <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-blue-100 text-blue-900 border border-blue-200">
                          🏆 {currentMatch.tournament?.name || currentMatch.tournament_name}
                        </span>
                      )
                    )}
                  </div>

                  <span className="text-xs font-black text-blue-700 group-hover:text-blue-900 flex items-center gap-1 underline underline-offset-2">
                    <span>Abrir na Agenda</span>
                    <ArrowRight size={13} />
                  </span>
                </div>

                {/* Bloco Matchup VS */}
                {currentMatch.opponent ? (() => {
                  const isAway = currentMatch.home_away === 'away'
                  return (
                    <div className="bg-gradient-to-b from-gray-50 to-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        {/* Equipa Esquerda */}
                        <div className="flex-1 flex flex-col items-start text-left min-w-0">
                          <div className="flex items-center gap-2">
                            {(isAway ? currentMatch.opponent?.logo_url : clubSettings?.logo_url) ? (
                              <img src={(isAway ? currentMatch.opponent?.logo_url : clubSettings?.logo_url) || ''} alt="Team" className="w-10 h-10 object-contain drop-shadow-xs" />
                            ) : (
                              <div className="w-10 h-10 bg-csc-dark text-csc-gold rounded-xl flex items-center justify-center text-xs font-black shadow-2xs">
                                {isAway ? (currentMatch.opponent?.initials || 'ADV') : (clubSettings?.initials || 'CSC')}
                              </div>
                            )}
                            <span className="font-black text-sm sm:text-base text-gray-900 uppercase">
                              {isAway ? (currentMatch.opponent?.initials || 'ADV') : (clubSettings?.initials || 'CSC')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-700 mt-1 leading-snug">
                            {isAway ? currentMatch.opponent?.name : (clubSettings?.name || 'CSC Cascais')}
                          </span>
                        </div>

                        {/* VS Badge */}
                        <div className="shrink-0 flex flex-col items-center">
                          <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            VS
                          </span>
                        </div>

                        {/* Equipa Direita */}
                        <div className="flex-1 flex flex-col items-end text-right min-w-0">
                          <div className="flex items-center gap-2 flex-row-reverse">
                            {(isAway ? clubSettings?.logo_url : currentMatch.opponent?.logo_url) ? (
                              <img src={(isAway ? clubSettings?.logo_url : currentMatch.opponent?.logo_url) || ''} alt="Team" className="w-10 h-10 object-contain drop-shadow-xs" />
                            ) : (
                              <div className="w-10 h-10 bg-csc-dark text-csc-gold rounded-xl flex items-center justify-center text-xs font-black shadow-2xs">
                                {isAway ? (clubSettings?.initials || 'CSC') : (currentMatch.opponent?.initials || 'ADV')}
                              </div>
                            )}
                            <span className="font-black text-sm sm:text-base text-gray-900 uppercase">
                              {isAway ? (clubSettings?.initials || 'CSC') : (currentMatch.opponent?.initials || 'ADV')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-gray-700 mt-1 leading-snug">
                            {isAway ? (clubSettings?.name || 'CSC Cascais') : currentMatch.opponent?.name}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                        <span className="font-bold">
                          Condição: <strong className="text-gray-900">{isAway ? '✈️ Fora de Casa' : currentMatch.home_away === 'neutral' ? '🏟️ Campo Neutro' : '🏠 Em Casa'}</strong>
                        </span>
                      </div>
                    </div>
                  )
                })() : (
                  <h3 className="text-lg font-black text-gray-900">{currentMatch.title}</h3>
                )}

                {/* Concentração por extenso (se existir) */}
                {currentMatch.meeting_time && (
                  <div className="flex items-center">
                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl shadow-2xs">
                      <span>⏱️ Concentração: {currentMatch.meeting_time.substring(0, 5)}</span>
                    </div>
                  </div>
                )}

                {/* Data, Horário e Localização */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-csc-dark shrink-0" />
                    <span>
                      <strong>Data:</strong> {new Date(currentMatch.date_time).toLocaleDateString('pt-PT', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-csc-dark shrink-0" />
                    <span>
                      <strong>Horário:</strong> {new Date(currentMatch.date_time).toLocaleTimeString('pt-PT', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-gray-200">
                    <div className="flex items-center gap-2 truncate">
                      <MapPin size={15} className="text-red-600 shrink-0" />
                      <span className="truncate">
                        <strong>Local:</strong> {currentMatch.location || currentMatch.field?.name || 'Local a definir'}
                      </span>
                    </div>
                    {(currentMatch.location || currentMatch.field?.name) && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentMatch.location || currentMatch.field?.name || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow-2xs ml-2"
                        title="Abrir no Google Maps"
                      >
                        <MapPin size={11} className="text-red-500" />
                        <span>Maps</span>
                        <ExternalLink size={10} className="opacity-70" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Observações / Descrição */}
                {currentMatch.description && (
                  <div className="text-xs text-gray-700 bg-white p-3 rounded-xl border border-gray-200">
                    <p className="whitespace-pre-line leading-relaxed">{currentMatch.description}</p>
                  </div>
                )}

                {/* Convocatória ligada a este jogo */}
                {(() => {
                  const currentMatchCallup = myCallups.find(c => c.event_id === currentMatch.id)
                  if (!currentMatchCallup) return null

                  return (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-gray-100"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">A tua convocatória:</span>
                          <p className="text-xs font-black mt-0.5">
                            {currentMatchCallup.status === 'confirmed' ? (
                              <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 size={15}/> Presença Confirmada</span>
                            ) : currentMatchCallup.status === 'declined' ? (
                              <span className="text-red-700 flex items-center gap-1"><XCircle size={15}/> Marcaste Ausência</span>
                            ) : (
                              <span className="text-amber-700 flex items-center gap-1"><AlertCircle size={15}/> A aguardar a tua resposta</span>
                            )}
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCallupResponse(currentMatchCallup.id, 'confirmed')}
                            className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                              currentMatchCallup.status === 'confirmed'
                                ? 'bg-emerald-700 text-white font-black'
                                : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
                            }`}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                            className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                              currentMatchCallup.status === 'declined'
                                ? 'bg-red-700 text-white font-black'
                                : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                            }`}
                          >
                            Recusar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Indicadores / Pontos do Carrossel de Jogos */}
                {upcomingMatches.length > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    {upcomingMatches.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentMatchIndex(idx)}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === currentMatchIndex ? 'w-6 bg-blue-700' : 'w-2 bg-gray-300 hover:bg-gray-400'
                        }`}
                        title={`Ir para Jogo ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CARROSSEL DE TREINOS MARCADOS */}
          {currentPractice && (
            <div className="bg-white rounded-3xl border-2 border-emerald-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-emerald-500 transition-all">
              {/* Header com Navegação do Carrossel */}
              <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 px-5 py-3.5 text-white flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <TrainingIcon size={18} className="text-white" />
                  <h2 className="text-sm sm:text-base font-black tracking-wide">
                    Treinos Marcados
                  </h2>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 backdrop-blur-xs">
                    {upcomingPractices.length} {upcomingPractices.length === 1 ? 'Treino' : 'Treinos'}
                  </span>
                </div>

                {/* Controles de Navegação */}
                <div className="flex items-center gap-2">
                  {upcomingPractices.length > 1 && (
                    <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-xl border border-white/20">
                      <button
                        onClick={prevPracticeSlide}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer active:scale-90"
                        title="Treino Anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-black px-1.5">
                        {currentPracticeIndex + 1} / {upcomingPractices.length}
                      </span>
                      <button
                        onClick={nextPracticeSlide}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors cursor-pointer active:scale-90"
                        title="Próximo Treino"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  <span className="text-[11px] font-bold text-emerald-200 hidden sm:inline-flex items-center gap-1 ml-1 group-hover:text-white">
                    <span>Ver Detalhes</span>
                    <ChevronRight size={14} />
                  </span>
                </div>
              </div>

              {/* Cartão Clicável do Treino Atual */}
              <div 
                onClick={() => navigate(`/calendar?event=${currentPractice.id}`)}
                className="p-5 sm:p-6 space-y-4 cursor-pointer hover:bg-emerald-50/20 transition-colors group"
              >
                {/* Badges do Treino */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-700 text-white shadow-2xs uppercase flex items-center gap-1">
                      <TrainingIcon size={12} className="text-white" />
                      <span>Treino</span>
                    </span>
                    <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300">
                      Semanal
                    </span>
                  </div>

                  <span className="text-xs font-black text-emerald-700 group-hover:text-emerald-900 flex items-center gap-1 underline underline-offset-2">
                    <span>Abrir na Agenda</span>
                    <ArrowRight size={13} />
                  </span>
                </div>

                <h3 className="text-lg font-black text-gray-900">{currentPractice.title}</h3>

                {/* Concentração por extenso (se existir) */}
                {currentPractice.meeting_time && (
                  <div className="flex items-center">
                    <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1 rounded-xl shadow-2xs">
                      <span>⏱️ Concentração: {currentPractice.meeting_time.substring(0, 5)}</span>
                    </div>
                  </div>
                )}

                {/* Data, Horário e Localização */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-csc-dark shrink-0" />
                    <span>
                      <strong>Data:</strong> {new Date(currentPractice.date_time).toLocaleDateString('pt-PT', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-csc-dark shrink-0" />
                    <span>
                      <strong>Horário:</strong> {new Date(currentPractice.date_time).toLocaleTimeString('pt-PT', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-gray-200">
                    <div className="flex items-center gap-2 truncate">
                      <MapPin size={15} className="text-red-600 shrink-0" />
                      <span className="truncate">
                        <strong>Local:</strong> {currentPractice.location || currentPractice.field?.name || 'Campo Cascais'}
                      </span>
                    </div>
                    {(currentPractice.location || currentPractice.field?.name) && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentPractice.location || currentPractice.field?.name || '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow-2xs ml-2"
                        title="Abrir no Google Maps"
                      >
                        <MapPin size={11} className="text-red-500" />
                        <span>Maps</span>
                        <ExternalLink size={10} className="opacity-70" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Instruções do Balneário / Observações */}
                {currentPractice.description && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-amber-950 font-medium">
                    <Info size={16} className="shrink-0 mt-0.5 text-amber-700" />
                    <div>
                      <strong>Instruções do Balneário:</strong> {currentPractice.description}
                    </div>
                  </div>
                )}

                {/* Convocatória ligada a este treino */}
                {(() => {
                  const currentPracticeCallup = myCallups.find(c => c.event_id === currentPractice.id)
                  if (!currentPracticeCallup) return null

                  return (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-gray-100"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">A tua convocatória:</span>
                          <p className="text-xs font-black mt-0.5">
                            {currentPracticeCallup.status === 'confirmed' ? (
                              <span className="text-emerald-700 flex items-center gap-1"><CheckCircle2 size={15}/> Presença Confirmada</span>
                            ) : currentPracticeCallup.status === 'declined' ? (
                              <span className="text-red-700 flex items-center gap-1"><XCircle size={15}/> Marcaste Ausência</span>
                            ) : (
                              <span className="text-amber-700 flex items-center gap-1"><AlertCircle size={15}/> A aguardar a tua resposta</span>
                            )}
                          </p>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCallupResponse(currentPracticeCallup.id, 'confirmed')}
                            className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                              currentPracticeCallup.status === 'confirmed'
                                ? 'bg-emerald-700 text-white font-black'
                                : 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
                            }`}
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => handleCallupResponse(currentPracticeCallup.id, 'declined')}
                            className={`text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer active:scale-95 ${
                              currentPracticeCallup.status === 'declined'
                                ? 'bg-red-700 text-white font-black'
                                : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                            }`}
                          >
                            Recusar
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Indicadores / Pontos do Carrossel de Treinos */}
                {upcomingPractices.length > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    {upcomingPractices.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentPracticeIndex(idx)}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === currentPracticeIndex ? 'w-6 bg-emerald-700' : 'w-2 bg-gray-300 hover:bg-gray-400'
                        }`}
                        title={`Ir para Treino ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CARD: COMUNICAÇÕES & AVISOS */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell size={20} className="text-csc-dark" />
                <h2 className="text-lg font-black text-gray-900">Comunicados & Avisos Oficiais</h2>
              </div>
              <Link to="/announcements" className="text-xs font-bold text-csc-gold hover:underline flex items-center gap-1">
                <span>Ver todos</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.id} className="p-4 bg-gray-50 rounded-xl border border-gray-150 hover:bg-gray-50/80 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-bold text-sm text-gray-900">{ann.title}</p>
                    <span className="text-[10px] font-semibold text-gray-400">
                      {new Date(ann.published_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* COLUNA DIREITA / SIDEBAR DE ATALHOS & INFO (1/3 em Desktop) */}
        <div className="space-y-6">

          {/* CARD: CARTÃO DO ATLETA / PERFIL */}
          {profile && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-3.5 mb-4 pb-3 border-b border-gray-100">
                {profile.photo_url ? (
                  <img src={profile.photo_url} alt={profile.name} className="w-12 h-12 rounded-full object-cover border-2 border-csc-gold" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-csc-dark text-white flex items-center justify-center font-black text-lg">
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="font-extrabold text-sm text-gray-900 truncate">{profile.name}</p>
                  <p className="text-xs text-gray-500 font-medium">{profile.position || 'Jogador'}</p>
                  <span className="inline-block text-[10px] font-black uppercase px-2 py-0.2 rounded bg-green-100 text-green-800 mt-1">
                    🟢 Disponível
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-gray-600">
                {profile.jersey_number && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="font-semibold text-gray-400">Nº Camisola:</span>
                    <strong className="text-gray-800">#{profile.jersey_number}</strong>
                  </div>
                )}
                {profile.member_number && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="font-semibold text-gray-400">Nº Sócio:</span>
                    <strong className="text-gray-800">{profile.member_number}</strong>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="font-semibold text-gray-400">Email:</span>
                  <span className="text-gray-800 font-medium truncate max-w-[160px]">{profile.email}</span>
                </div>
              </div>

              <Link
                to="/settings"
                className="mt-4 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1"
              >
                <span>Editar o Meu Perfil</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}

          {/* CARD: ESTADO DE QUOTAS */}
          {pendingDues.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-amber-500" />
                  <h3 className="text-sm font-black text-gray-900">Quotas & Mensalidades</h3>
                </div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-700">
                  Pendente
                </span>
              </div>

              <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 space-y-1">
                <p className="text-xs text-gray-600 font-semibold">
                  Mês de referência: <strong className="text-gray-900">{pendingDues[0].month_year}</strong>
                </p>
                <p className="text-lg font-black text-red-700">
                  {pendingDues[0].amount} €
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Regulariza a tua quota junto do responsável financeiro ou tesoureiro.
                </p>
              </div>
            </div>
          )}

          {/* CARD: ATALHOS RÁPIDOS */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider">
              Acesso Rápido
            </h3>

            <div className="grid grid-cols-1 gap-2">
              <Link
                to="/calendar"
                className="p-3 rounded-xl border border-gray-150 hover:border-csc-gold hover:bg-amber-50/20 transition-all flex items-center justify-between text-xs font-bold text-gray-800"
              >
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-csc-gold" />
                  <span>Calendário & Convocatórias</span>
                </div>
                <ChevronRight size={15} className="text-gray-400" />
              </Link>

              <Link
                to="/team-management"
                className="p-3 rounded-xl border border-gray-150 hover:border-csc-gold hover:bg-amber-50/20 transition-all flex items-center justify-between text-xs font-bold text-gray-800"
              >
                <div className="flex items-center gap-2.5">
                  <Users size={16} className="text-emerald-500" />
                  <span>Plantel & Fichas de Jogadores</span>
                </div>
                <ChevronRight size={15} className="text-gray-400" />
              </Link>

              <Link
                to="/stats"
                className="p-3 rounded-xl border border-gray-150 hover:border-csc-gold hover:bg-amber-50/20 transition-all flex items-center justify-between text-xs font-bold text-gray-800"
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={16} className="text-purple-500" />
                  <span>Estatísticas & Desempenho</span>
                </div>
                <ChevronRight size={15} className="text-gray-400" />
              </Link>

              {isCoachOrAdmin && (
                <Link
                  to="/admin"
                  className="p-3 rounded-xl border border-gray-150 hover:border-csc-gold hover:bg-amber-50/20 transition-all flex items-center justify-between text-xs font-bold text-gray-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield size={16} className="text-blue-500" />
                    <span>Backoffice & Gestão de Campos</span>
                  </div>
                  <ChevronRight size={15} className="text-gray-400" />
                </Link>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  )
}

export default Home
