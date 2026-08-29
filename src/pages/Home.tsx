import React, { useEffect, useState } from 'react'
import { 
  Calendar, 
  MapPin, 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  ChevronLeft,
  Trophy
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { formatClubSigla, formatOpponentSigla } from './CalendarPage'
import { triggerHaptic } from '../utils/haptics'

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  location: string
  field_id?: string | null
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
  is_active?: boolean
}

interface Callup {
  id: string
  event_id: string
  player_id?: string
  status: 'called' | 'confirmed' | 'declined'
  event: Event
}

const Home: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const navigate = useNavigate()

  // Matches Carousel State
  const [upcomingMatches, setUpcomingMatches] = useState<Event[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)



  // Announcements Carousel State
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0)

  // Pending Callups Carousel State
  const [currentPendingCallupIndex, setCurrentPendingCallupIndex] = useState(0)
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [fields, setFields] = useState<{ id: string; name: string; address?: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  const getEventLocation = (ev?: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null) => {
    if (!ev) return ''
    if (ev.location && ev.location.trim()) return ev.location.trim()
    if (ev.field?.name) {
      return ev.field.address ? `${ev.field.name} (${ev.field.address})` : ev.field.name
    }
    if (ev.field_id) {
      const f = fields.find(item => item.id === ev.field_id)
      if (f) return f.address ? `${f.name} (${f.address})` : f.name
    }
    return ''
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoading(true)
      try {
        const nowStr = new Date().toISOString()

        // 0. Fetch fields
        const { data: fieldsData } = await supabase
          .from('fields')
          .select('id, name, address')
        if (fieldsData) {
          setFields(fieldsData)
        }

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

        // 2. Fetch announcements (apenas ativos)
        const { data: anns } = await supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false })

        if (anns && anns.length > 0) {
          const activeAnns = (anns as Announcement[]).filter(a => a.is_active !== false)
          setAnnouncements(activeAnns)
        } else {
          setAnnouncements([
            {
              id: 'a-demo',
              title: 'Comunicações Importantes',
              content: 'Caros atletas, recordamos que os treinos começam pontualmente. A comparência no balneário deve ser feita 30 minutos antes.',
              published_at: new Date().toISOString(),
              is_active: true
            }
          ])
        }

        // 4. Fetch callups
        const { data: calls } = await supabase
          .from('callups')
          .select('*, event:events(*, field:fields(id, name, address), opponent:opponents(name, initials, logo_url))')
          .eq('player_id', profile.id)

        const rawCalls = (calls || []) as unknown as Callup[]

        if (profile.status === 'injured' || profile.status === 'inactive') {
          // Atleta lesionado ou inativo: não tem convocatórias para treinos
          setMyCallups(rawCalls.filter(c => c.event?.type !== 'practice'))
        } else {
          setMyCallups(rawCalls)
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
    triggerHaptic(status === 'confirmed' ? 'success' : 'warning')
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
      triggerHaptic('light')
      setCurrentMatchIndex(prev => (prev + 1) % upcomingMatches.length)
    }
  }

  const prevMatchSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (upcomingMatches.length > 1) {
      triggerHaptic('light')
      setCurrentMatchIndex(prev => (prev - 1 + upcomingMatches.length) % upcomingMatches.length)
    }
  }

  const nextAnnouncementSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (announcements.length > 1) {
      triggerHaptic('light')
      setCurrentAnnouncementIndex(prev => (prev + 1) % announcements.length)
    }
  }

  const prevAnnouncementSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (announcements.length > 1) {
      triggerHaptic('light')
      setCurrentAnnouncementIndex(prev => (prev - 1 + announcements.length) % announcements.length)
    }
  }

  const nextPendingSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (pendingCallups.length > 1) {
      triggerHaptic('light')
      setCurrentPendingCallupIndex(prev => (prev + 1) % pendingCallups.length)
    }
  }

  const prevPendingSlide = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (pendingCallups.length > 1) {
      triggerHaptic('light')
      setCurrentPendingCallupIndex(prev => (prev - 1 + pendingCallups.length) % pendingCallups.length)
    }
  }

  // Touch swipe support for mobile carousels
  const [touchState, setTouchState] = useState<{ startX: number; target: 'match' | 'announcement' | 'pending' | null }>({ startX: 0, target: null })

  const handleTouchStart = (e: React.TouchEvent, target: 'match' | 'announcement' | 'pending') => {
    setTouchState({ startX: e.targetTouches[0].clientX, target })
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchState.target) return
    const endX = e.changedTouches[0].clientX
    const diff = touchState.startX - endX
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        // Swipe para a esquerda -> Próximo slide
        if (touchState.target === 'match') nextMatchSlide()
        else if (touchState.target === 'announcement') nextAnnouncementSlide()
        else if (touchState.target === 'pending') nextPendingSlide()
      } else {
        // Swipe para a direita -> Slide anterior
        if (touchState.target === 'match') prevMatchSlide()
        else if (touchState.target === 'announcement') prevAnnouncementSlide()
        else if (touchState.target === 'pending') prevPendingSlide()
      }
    }
    setTouchState({ startX: 0, target: null })
  }

  const isCallupPendingResponse = (callup: Callup) => {
    if (callup.status !== 'called') return false
    const ev = callup.event
    if (!ev || !ev.date_time) return true
    const eventTime = new Date(ev.date_time).getTime()
    const now = new Date().getTime()
    if (eventTime < now) return false // Evento no passado não é pendente

    // Para treinos: apenas solicitar resposta a partir de 6 dias antes
    if (ev.type === 'practice') {
      const sixDaysMs = 6 * 24 * 60 * 60 * 1000
      return (eventTime - now) <= sixDaysMs
    }
    return true
  }

  const pendingCallups = myCallups
    .filter(isCallupPendingResponse)
    .sort((a, b) => {
      const timeA = a.event?.date_time ? new Date(a.event.date_time).getTime() : Infinity
      const timeB = b.event?.date_time ? new Date(b.event.date_time).getTime() : Infinity
      return timeA - timeB
    })
  const pendingCallupsCount = pendingCallups.length

  const currentMatch = upcomingMatches[currentMatchIndex]
  const currentAnnouncement = announcements[currentAnnouncementIndex] || announcements[0]

  const renderAnnouncementsCard = () => {
    if (!currentAnnouncement && announcements.length === 0) return null

    return (
      <div 
        onTouchStart={(e) => handleTouchStart(e, 'announcement')}
        onTouchEnd={handleTouchEnd}
        className="bg-gradient-to-r from-emerald-800 via-teal-900 to-emerald-950 text-white rounded-3xl p-4 sm:p-5 shadow-sm border-2 border-emerald-700/70 space-y-3 select-none"
      >
        {/* Header dos Comunicados no Estilo Alerta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">📢</span>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-white">
                {announcements.length === 1 ? '1 Comunicado Oficial' : `${announcements.length} Comunicados Oficiais`}
              </h3>
              <p className="text-[11px] font-semibold text-emerald-200/90">Avisos e notas informativas da equipa:</p>
            </div>
          </div>

          <Link 
            to="/announcements" 
            className="text-[11px] font-bold text-csc-gold hover:text-white flex items-center gap-0.5 shrink-0 bg-white/10 px-2.5 py-1 rounded-xl border border-white/20 hover:bg-white/20 transition-colors"
          >
            <span>Ver todos</span>
            <ChevronRight size={12} />
          </Link>
        </div>

        {/* Card do Comunicado Atual (Inner card branco com sombra) */}
        {currentAnnouncement ? (
          <div 
            onClick={() => navigate('/announcements')}
            className="bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-white/40 shadow-xs space-y-2.5 cursor-pointer hover:bg-white transition-all"
          >
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
              <h4 className="font-black text-sm text-gray-900 truncate flex items-center gap-1.5">
                <span>📌</span>
                <span className="truncate">{currentAnnouncement.title}</span>
              </h4>
              <span className="text-[10.5px] font-extrabold text-emerald-950 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-lg shrink-0">
                {new Date(currentAnnouncement.published_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
              </span>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">
              {currentAnnouncement.content}
            </p>
          </div>
        ) : (
          <div className="bg-white/95 p-4 rounded-2xl text-xs text-gray-400 text-center">
            Sem comunicados recentes.
          </div>
        )}

        {/* Carrossel de Comunicados: Setas e Indicadores (Otimizado para Rato e Desktop) */}
        {announcements.length > 1 && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-700/50">
            <button
              type="button"
              onClick={prevAnnouncementSlide}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-white/15 shadow-2xs shrink-0"
              title="Comunicado Anterior"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-1.5 bg-black/30 px-3 py-1 rounded-full border border-white/15">
              {announcements.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentAnnouncementIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentAnnouncementIndex
                      ? 'bg-csc-gold w-5'
                      : 'bg-white/40 hover:bg-white/60 w-2'
                  }`}
                  title={`Comunicado ${idx + 1}`}
                />
              ))}
              <span className="text-[11px] font-black text-white ml-1 pl-1.5 border-l border-white/20 leading-none">
                {currentAnnouncementIndex + 1}/{announcements.length}
              </span>
            </div>

            <button
              type="button"
              onClick={nextAnnouncementSlide}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-white/15 shadow-2xs shrink-0"
              title="Próximo Comunicado"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-12">
      
      {/* 1. ALERTA DE CONVOCATÓRIAS PENDENTES EM CARROSSEL */}
      {pendingCallupsCount > 0 && (() => {
        const activeIndex = Math.min(currentPendingCallupIndex, pendingCallups.length - 1)
        const currentPending = pendingCallups[activeIndex] || pendingCallups[0]
        const ev = currentPending?.event
        if (!currentPending || !ev) return null

        const evTime = new Date(ev.date_time).getTime()
        const now = Date.now()
        const diffDays = Math.ceil((evTime - now) / (1000 * 60 * 60 * 24))
        const isPractice = ev.type === 'practice'
        const isRsvpOpen = !isPractice || diffDays <= 6
        const evEmoji = ev.type === 'match' ? '⚽' : ev.type === 'practice' ? '🏃' : '🎉'
        const locStr = getEventLocation(ev) || 'Local a definir'
        const dateStr = new Date(ev.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })

        return (
          <div 
            onTouchStart={(e) => handleTouchStart(e, 'pending')}
            onTouchEnd={handleTouchEnd}
            className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-csc-dark rounded-3xl p-4 sm:p-5 shadow-sm border-2 border-amber-600 space-y-3 select-none"
          >
            {/* Header do Alerta */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl shrink-0">🔔</span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-csc-dark">
                    Tens {pendingCallupsCount} {pendingCallupsCount === 1 ? 'convocatória pendente' : 'convocatórias pendentes'}!
                  </h3>
                  <p className="text-[11px] font-semibold text-amber-950">Responde diretamente abaixo ou clica para ver os detalhes:</p>
                </div>
              </div>
            </div>

            {/* Card do Evento Pendente Atual */}
            <div className="bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-amber-300 shadow-xs space-y-3">
              <div 
                onClick={() => navigate(`/calendar?event=${ev.id || currentPending.event_id}`)}
                className="cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-black text-gray-900 truncate flex items-center gap-1.5">
                    <span>{evEmoji}</span>
                    <span>{ev.title}</span>
                  </span>
                  <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 rounded-lg shrink-0">
                    {dateStr}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 truncate flex items-center gap-1">
                  <span>📍</span>
                  <span className="truncate">{locStr}</span>
                </p>
              </div>

              {/* Botões de Ação */}
              {isRsvpOpen ? (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    disabled={currentPending.status === 'confirmed'}
                    onClick={() => handleCallupResponse(currentPending.id, 'confirmed')}
                    className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirmar</span>
                  </button>
                  <button
                    type="button"
                    disabled={currentPending.status === 'declined'}
                    onClick={() => handleCallupResponse(currentPending.id, 'declined')}
                    className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-800 border border-red-300 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <XCircle size={14} />
                    <span>Recusar</span>
                  </button>
                </div>
              ) : (
                <div className="text-[11px] text-center font-bold text-amber-900 bg-amber-50 py-1.5 rounded-xl border border-amber-200">
                  Abre 6 dias antes do treino
                </div>
              )}
            </div>

            {/* Carrossel de Convocatórias Pendentes: Setas e Indicadores (Otimizado para Rato e Desktop) */}
            {pendingCallupsCount > 1 && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-600/40">
                <button
                  type="button"
                  onClick={prevPendingSlide}
                  className="w-8 h-8 rounded-xl bg-black/15 hover:bg-black/25 text-csc-dark flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-2xs shrink-0"
                  title="Convocatória Anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="flex items-center gap-1.5 bg-black/10 px-3 py-1 rounded-full border border-black/10">
                  {pendingCallups.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentPendingCallupIndex(idx)}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === activeIndex
                          ? 'bg-csc-dark w-5'
                          : 'bg-black/25 hover:bg-black/40 w-2'
                      }`}
                      title={`Convocatória ${idx + 1}`}
                    />
                  ))}
                  <span className="text-[11px] font-black text-csc-dark ml-1 pl-1.5 border-l border-black/20 leading-none">
                    {activeIndex + 1}/{pendingCallupsCount}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={nextPendingSlide}
                  className="w-8 h-8 rounded-xl bg-black/15 hover:bg-black/25 text-csc-dark flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-2xs shrink-0"
                  title="Próxima Convocatória"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )
      })()}

      {/* 2. EM MOBILE: COMUNICADOS NO TOPO (DEBAIXO DO ALERTA) */}
      <div className="block lg:hidden space-y-5">
        {renderAnnouncementsCard()}
      </div>

      {/* GRELHA PRINCIPAL DO DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        
        {/* COLUNA ESQUERDA / PRINCIPAL (2/3 em Desktop: Jogos e Treinos) */}
        <div className="lg:col-span-2 space-y-5">

          {/* 1. CARD DO JOGO (VERSÃO COMPACTA) */}
          {currentMatch && (
            <div 
              onTouchStart={(e) => handleTouchStart(e, 'match')}
              onTouchEnd={handleTouchEnd}
              className="bg-white rounded-2xl border border-blue-200 overflow-hidden shadow-xs hover:border-blue-400 transition-all select-none"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-4 py-2.5 text-white flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="text-amber-300" />
                  <h2 className="text-xs sm:text-sm font-black tracking-wide">
                    Próximo Jogo
                  </h2>
                  <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded-full bg-white/20 text-white border border-white/30">
                    {upcomingMatches.length} {upcomingMatches.length === 1 ? 'Jogo' : 'Jogos'}
                  </span>
                </div>

                <span 
                  onClick={() => navigate(`/calendar?event=${currentMatch.id}`)}
                  className="text-[10.5px] font-bold text-blue-200 hover:text-white cursor-pointer flex items-center gap-0.5"
                >
                  <span>Agenda</span>
                  <ChevronRight size={12} />
                </span>
              </div>

              {/* Conteúdo do Jogo */}
              <div 
                onClick={() => navigate(`/calendar?event=${currentMatch.id}`)}
                className="p-4 space-y-3 cursor-pointer hover:bg-blue-50/15 transition-colors group"
              >
                {/* Linha 1: Badges Compactas + Concentração por extenso */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase">
                      Jogo
                    </span>
                    {currentMatch.is_friendly ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300">
                        Amigável
                      </span>
                    ) : (
                      (currentMatch.tournament?.name || currentMatch.tournament_name) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-200">
                          🏆 {currentMatch.tournament?.name || currentMatch.tournament_name}
                        </span>
                      )
                    )}
                  </div>

                  {currentMatch.meeting_time && (
                    <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg shadow-2xs">
                      ⏱️ Concentração: {currentMatch.meeting_time.substring(0, 5)}
                    </span>
                  )}
                </div>

                {/* Linha 2: Matchup VS Compacto */}
                {currentMatch.opponent ? (() => {
                  const isAway = currentMatch.home_away === 'away'
                  const cscSigla = formatClubSigla(clubSettings?.initials)
                  const oppSigla = formatOpponentSigla(currentMatch.opponent)
                  const leftLogo = isAway ? currentMatch.opponent?.logo_url : clubSettings?.logo_url
                  const leftInitials = isAway ? oppSigla : cscSigla

                  const rightLogo = isAway ? clubSettings?.logo_url : currentMatch.opponent?.logo_url
                  const rightInitials = isAway ? cscSigla : oppSigla

                  return (
                    <div className="bg-gray-50/90 p-3 rounded-xl border border-gray-200/80 flex items-center justify-between gap-2">
                      <div className="flex-1 flex items-center gap-2.5 min-w-0">
                        {leftLogo ? (
                          <img src={leftLogo} alt={leftInitials} className="w-9 h-9 object-contain shrink-0" />
                        ) : (
                          <div className="w-9 h-9 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                            {leftInitials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-black text-gray-900 truncate leading-tight uppercase">{leftInitials}</p>
                        </div>
                      </div>

                      <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shrink-0 shadow-2xs">
                        VS
                      </span>

                      <div className="flex-1 flex items-center justify-end gap-2.5 text-right min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-gray-900 truncate leading-tight uppercase">{rightInitials}</p>
                        </div>
                        {rightLogo ? (
                          <img src={rightLogo} alt={rightInitials} className="w-9 h-9 object-contain shrink-0" />
                        ) : (
                          <div className="w-9 h-9 bg-csc-dark text-csc-gold rounded-lg flex items-center justify-center text-xs font-black shrink-0">
                            {rightInitials}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })() : (
                  <h3 className="text-sm font-black text-gray-900">{currentMatch.title}</h3>
                )}

                {/* Linha 3: Data, Horário e Localização Completa */}
                <div className="bg-white p-3 rounded-xl border border-gray-200 text-xs text-gray-700 space-y-2 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-1.5 font-bold text-gray-900">
                      <Calendar size={14} className="text-blue-700 shrink-0" />
                      <span>{new Date(currentMatch.date_time).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })} às {new Date(currentMatch.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span className="font-bold text-[10px] text-gray-700 bg-gray-100 px-2 py-0.5 rounded-md">
                      {currentMatch.home_away === 'away' ? '✈️ Fora de Casa' : currentMatch.home_away === 'neutral' ? '🏟️ Campo Neutro' : '🏠 Em Casa'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-gray-800">
                    <MapPin size={15} className="text-red-600 shrink-0 mt-0.5 self-start" />
                    <div>
                      <span className="font-extrabold text-gray-900">Local: </span>
                      <span className="font-medium text-gray-800">{getEventLocation(currentMatch) || 'Local a definir'}</span>
                    </div>
                  </div>
                </div>

                {/* Linha 4: Convocatória RSVP */}
                {(() => {
                  const currentMatchCallup = myCallups.find(c => c.event_id === currentMatch.id)
                  if (!currentMatchCallup) return null

                  return (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="pt-1.5 border-t border-gray-100 flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold text-gray-700">A tua presença:</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={currentMatchCallup.status === 'confirmed'}
                          onClick={() => handleCallupResponse(currentMatchCallup.id, 'confirmed')}
                          className={`text-xs font-black px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                            currentMatchCallup.status === 'confirmed'
                              ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                              : 'bg-white text-emerald-700 border border-emerald-600 hover:bg-emerald-50 cursor-pointer active:scale-95 shadow-2xs'
                          }`}
                        >
                          <CheckCircle2 size={13} />
                          <span>Confirmar</span>
                        </button>
                        <button
                          type="button"
                          disabled={currentMatchCallup.status === 'declined'}
                          onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                          className={`text-xs font-black px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                            currentMatchCallup.status === 'declined'
                              ? 'bg-gray-100 border border-gray-300 text-gray-400 cursor-not-allowed shadow-none'
                              : 'bg-white text-red-700 border border-red-600 hover:bg-red-50 cursor-pointer active:scale-95 shadow-2xs'
                          }`}
                        >
                          <XCircle size={13} />
                          <span>Recusar</span>
                        </button>
                      </div>
                    </div>
                  )
                })()}
                {/* Carrossel de Jogos: Setas e Indicadores (Otimizado para Rato e Desktop) */}
                {upcomingMatches.length > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        prevMatchSlide()
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0"
                      title="Jogo Anterior"
                    >
                      <ChevronLeft size={16} />
                      <span className="hidden sm:inline text-[11px] font-extrabold">Anterior</span>
                    </button>

                    <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                      {upcomingMatches.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCurrentMatchIndex(idx)
                          }}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === currentMatchIndex ? 'bg-blue-700 w-5' : 'bg-blue-300 hover:bg-blue-400 w-2'
                          }`}
                          title={`Jogo ${idx + 1}`}
                        />
                      ))}
                      <span className="text-[10px] font-black text-blue-900 ml-1 pl-1.5 border-l border-blue-300 leading-none">
                        {currentMatchIndex + 1}/{upcomingMatches.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        nextMatchSlide()
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs shrink-0"
                      title="Próximo Jogo"
                    >
                      <span className="hidden sm:inline text-[11px] font-extrabold">Próximo</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* COLUNA DIREITA / SIDEBAR EM DESKTOP (Comunicações) */}
        <div className="space-y-5">
          {/* APENAS DESKTOP: COMUNICAÇÕES NO TOPO DA SIDEBAR */}
          <div className="hidden lg:block space-y-5">
            {renderAnnouncementsCard()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
