import React, { useEffect, useState, useRef } from 'react'
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

// Hook para suporte a touch swipe / slide no telemóvel
const useSwipe = (onSwipeLeft?: () => void, onSwipeRight?: () => void) => {
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const minSwipeDistance = 45

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft()
    } else if (isRightSwipe && onSwipeRight) {
      onSwipeRight()
    }
  }

  return { onTouchStart, onTouchMove, onTouchEnd }
}

const Home: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const navigate = useNavigate()

  // Matches Carousel State
  const [upcomingMatches, setUpcomingMatches] = useState<Event[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  // Practices State
  const [upcomingPractices, setUpcomingPractices] = useState<Event[]>([])

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

  const getCountdownLabel = (dateTimeStr: string) => {
    const eventDate = new Date(dateTimeStr).getTime()
    const now = Date.now()
    const diffMs = eventDate - now
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) return '🔥 É Hoje!'
    if (diffDays === 1) return '⚡ Amanhã'
    if (diffDays <= 6) return `⏳ Faltam ${diffDays} dias`
    return `📅 Em ${diffDays} dias`
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
        setUpcomingMatches(resolvedMatches)

        // 2. Fetch upcoming practices
        const { data: practices } = await supabase
          .from('events')
          .select('*, field:fields(id, name, address)')
          .eq('type', 'practice')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })
          .limit(3)
        if (practices) {
          setUpcomingPractices(practices as Event[])
        } else {
          setUpcomingPractices([])
        }

        // 3. Fetch announcements (apenas ativos)
        const { data: anns } = await supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false })

        if (anns && anns.length > 0) {
          const activeAnns = (anns as Announcement[]).filter(a => a.is_active !== false)
          setAnnouncements(activeAnns)
        } else {
          setAnnouncements([])
        }

        // 4. Fetch callups
        const { data: calls } = await supabase
          .from('callups')
          .select('*, event:events(*, field:fields(id, name, address), opponent:opponents(name, initials, logo_url))')
          .eq('player_id', profile.id)

        const rawCalls = (calls || []) as unknown as Callup[]

        if (profile.status === 'injured' || profile.status === 'inactive') {
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

  // Swipe handlers para touch / telemóvel
  const matchSwipeHandlers = useSwipe(() => nextMatchSlide(), () => prevMatchSlide())
  const pendingSwipeHandlers = useSwipe(() => nextPendingSlide(), () => prevPendingSlide())
  const announcementSwipeHandlers = useSwipe(() => nextAnnouncementSlide(), () => prevAnnouncementSlide())

  const isCallupPendingResponse = (callup: Callup) => {
    if (callup.status !== 'called') return false
    const ev = callup.event
    if (!ev || !ev.date_time) return true
    const eventTime = new Date(ev.date_time).getTime()
    const now = new Date().getTime()
    if (eventTime < now) return false 

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
  const currentMatchCallup = currentMatch ? myCallups.find(c => c.event_id === currentMatch.id) : undefined
  const activePendingIndex = Math.min(currentPendingCallupIndex, Math.max(0, pendingCallups.length - 1))
  const currentPending = pendingCallups[activePendingIndex] || pendingCallups[0]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Alerta de Convocatórias Pendentes: Estilo Banner Ação Rápida com Suporte Touch Slide */}
      {pendingCallupsCount > 0 && currentPending && (() => {
        const ev = currentPending.event
        const isPractice = ev?.type === 'practice'
        const evTime = ev?.date_time ? new Date(ev.date_time).getTime() : 0
        const diffDays = Math.ceil((evTime - Date.now()) / (1000 * 60 * 60 * 24))
        const isRsvpOpen = !isPractice || diffDays <= 6
        const evEmoji = ev?.type === 'match' ? '⚽' : ev?.type === 'practice' ? '🏃' : '🎉'

        return (
          <div 
            {...pendingSwipeHandlers}
            className="bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 rounded-3xl p-4 sm:p-5 shadow-sm border-2 border-amber-600 space-y-3 select-none touch-pan-y"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/95 backdrop-blur-xs p-4 rounded-2xl border border-amber-300 shadow-2xs">
              <div 
                onClick={() => navigate(`/calendar?event=${ev?.id || currentPending.event_id}`)}
                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
              >
                <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center text-lg shrink-0 font-black">
                  {evEmoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-950 px-2 py-0.2 rounded bg-amber-200/80">
                      Convocatória Pendente
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      {ev?.date_time && new Date(ev.date_time).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <h4 className="text-sm font-black text-gray-900 truncate mt-0.5">
                    {ev?.type === 'match'
                      ? ev.home_away === 'away'
                        ? `${formatOpponentSigla(ev.opponent)} Vs ${formatClubSigla(clubSettings?.initials)}`
                        : `${formatClubSigla(clubSettings?.initials)} Vs ${formatOpponentSigla(ev.opponent)}`
                      : ev?.title}
                  </h4>
                  <p className="text-xs text-gray-600 truncate flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-red-500 shrink-0" />
                    <span className="truncate">{getEventLocation(ev) || 'Local a definir'}</span>
                  </p>
                </div>
              </div>

              {/* Ações RSVP */}
              {isRsvpOpen ? (
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-amber-100">
                  <button
                    type="button"
                    onClick={() => handleCallupResponse(currentPending.id, 'confirmed')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirmar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCallupResponse(currentPending.id, 'declined')}
                    className="px-4 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-300 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <XCircle size={14} />
                    <span>Recusar</span>
                  </button>
                </div>
              ) : (
                <span className="text-xs font-bold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-300 self-start sm:self-center">
                  Abre 6 dias antes
                </span>
              )}
            </div>

            {/* Navegação do Alerta se existirem múltiplos */}
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

                <div className="flex items-center bg-black/10 px-3.5 py-1 rounded-full border border-black/10">
                  <span className="text-xs font-black text-csc-dark leading-none tracking-wider">
                    {activePendingIndex + 1}/{pendingCallupsCount}
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

      {/* 2. Grelha Principal: Bilhete Matchday Pass (8 Colunas) + Sidebar (4 Colunas: Próximo Treino + Comunicados) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* BILHETE DE JOGO MATCHDAY PASS (8/12) */}
        <div className="lg:col-span-8">
          {currentMatch ? (() => {
            const isAway = currentMatch.home_away === 'away'
            const cscSigla = formatClubSigla(clubSettings?.initials)
            const oppSigla = formatOpponentSigla(currentMatch.opponent)
            const leftLogo = isAway ? currentMatch.opponent?.logo_url : clubSettings?.logo_url
            const leftInitials = isAway ? oppSigla : cscSigla
            const leftName = isAway ? (currentMatch.opponent?.name || oppSigla) : (clubSettings?.name || 'GDS Cascais')

            const rightLogo = isAway ? clubSettings?.logo_url : currentMatch.opponent?.logo_url
            const rightInitials = isAway ? cscSigla : oppSigla
            const rightName = isAway ? (clubSettings?.name || 'GDS Cascais') : (currentMatch.opponent?.name || oppSigla)

            return (
              <div 
                {...matchSwipeHandlers}
                className="bg-gradient-to-br from-[#003322] via-[#004830] to-[#002416] text-white rounded-3xl p-5 sm:p-7 shadow-xl border-2 border-csc-gold relative overflow-hidden space-y-5 select-none touch-pan-y"
              >
                {/* Topo do Bilhete: Competição & Countdown */}
                <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black uppercase px-2.5 py-1 rounded-lg bg-csc-gold text-csc-dark shadow-xs flex items-center gap-1.5">
                      <Trophy size={13} />
                      <span>{currentMatch.is_friendly ? 'Jogo Amigável' : (currentMatch.tournament?.name || currentMatch.tournament_name || 'Jogo Oficial')}</span>
                    </span>
                    <span className="text-xs font-bold text-emerald-200/90 bg-white/10 px-2.5 py-1 rounded-lg border border-white/15">
                      {currentMatch.home_away === 'away' ? '✈️ Fora de Casa' : currentMatch.home_away === 'neutral' ? '🏟️ Campo Neutro' : '🏠 Em Casa'}
                    </span>
                  </div>

                  <span className="text-xs font-black text-amber-300 bg-black/30 border border-amber-400/40 px-3 py-1 rounded-full shrink-0 shadow-2xs">
                    {getCountdownLabel(currentMatch.date_time)}
                  </span>
                </div>

                {/* Duelo de Equipas / Matchup em Destaque */}
                <div 
                  onClick={() => navigate(`/calendar?event=${currentMatch.id}`)}
                  className="bg-black/30 backdrop-blur-xs p-4 sm:p-6 rounded-2xl border border-white/15 hover:border-csc-gold/70 transition-all cursor-pointer group"
                >
                  <div className="grid grid-cols-11 items-center gap-2">
                    {/* Equipa 1 */}
                    <div className="col-span-5 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left min-w-0">
                      {leftLogo ? (
                        <img src={leftLogo} alt={leftInitials} className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0 drop-shadow-md group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/15 text-csc-gold rounded-2xl flex items-center justify-center text-base font-black border border-white/20 shrink-0">
                          {leftInitials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-black text-white truncate leading-tight uppercase">{leftInitials}</p>
                        <p className="text-xs text-emerald-200/80 truncate hidden sm:block font-medium">{leftName}</p>
                      </div>
                    </div>

                    {/* VS Central */}
                    <div className="col-span-1 flex flex-col items-center justify-center">
                      <span className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-csc-dark font-black text-xs flex items-center justify-center shadow-lg border border-white/40">
                        VS
                      </span>
                    </div>

                    {/* Equipa 2 */}
                    <div className="col-span-5 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 text-center sm:text-right min-w-0">
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-black text-white truncate leading-tight uppercase">{rightInitials}</p>
                        <p className="text-xs text-emerald-200/80 truncate hidden sm:block font-medium">{rightName}</p>
                      </div>
                      {rightLogo ? (
                        <img src={rightLogo} alt={rightInitials} className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0 drop-shadow-md group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-white/15 text-csc-gold rounded-2xl flex items-center justify-center text-base font-black border border-white/20 shrink-0">
                          {rightInitials}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Informações de Estádio, Horário e Concentração */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white/10 p-3 rounded-2xl border border-white/15 flex items-center gap-3">
                    <Calendar size={18} className="text-csc-gold shrink-0" />
                    <div>
                      <p className="text-[11px] text-emerald-200 font-bold uppercase">Data e Horário</p>
                      <p className="text-xs font-black text-white">
                        {new Date(currentMatch.date_time).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'long' })} às {new Date(currentMatch.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/10 p-3 rounded-2xl border border-white/15 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <MapPin size={18} className="text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] text-emerald-200 font-bold uppercase">Local do Jogo</p>
                        <p className="text-xs font-black text-white truncate">{getEventLocation(currentMatch) || 'A definir'}</p>
                      </div>
                    </div>
                    {currentMatch.meeting_time && (
                      <span className="text-[11px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-1 rounded-lg shrink-0">
                        ⏱️ {currentMatch.meeting_time.substring(0, 5)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Barra de Presença Integrada no Bilhete */}
                {currentMatchCallup && (
                  <div className="bg-white/10 p-3 rounded-2xl border border-white/15 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <span className="text-xs font-bold text-emerald-100 flex items-center gap-1.5">
                      <span>A tua presença:</span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-black ${
                        currentMatchCallup.status === 'confirmed' ? 'bg-emerald-500 text-white' :
                        currentMatchCallup.status === 'declined' ? 'bg-red-500 text-white' : 'bg-amber-400 text-csc-dark'
                      }`}>
                        {currentMatchCallup.status === 'confirmed' ? 'Confirmada' :
                         currentMatchCallup.status === 'declined' ? 'Recusada' : 'Aguardando Resposta'}
                      </span>
                    </span>

                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        disabled={currentMatchCallup.status === 'confirmed'}
                        onClick={() => handleCallupResponse(currentMatchCallup.id, 'confirmed')}
                        className="flex-1 sm:flex-none px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <CheckCircle2 size={13} /> Confirmar
                      </button>
                      <button
                        type="button"
                        disabled={currentMatchCallup.status === 'declined'}
                        onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                        className="flex-1 sm:flex-none px-4 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 disabled:opacity-40"
                      >
                        <XCircle size={13} /> Recusar
                      </button>
                    </div>
                  </div>
                )}

                {/* Navegação de Jogos no Bilhete (Setas + Contador + Slide Touch) */}
                {upcomingMatches.length > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15">
                    <button
                      type="button"
                      onClick={prevMatchSlide}
                      className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-white/15 shadow-2xs shrink-0"
                      title="Jogo Anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <div className="flex items-center bg-black/30 px-3.5 py-1 rounded-full border border-white/15">
                      <span className="text-xs font-black text-csc-gold leading-none tracking-wider">
                        {currentMatchIndex + 1}/{upcomingMatches.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={nextMatchSlide}
                      className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-white/15 shadow-2xs shrink-0"
                      title="Próximo Jogo"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="bg-white p-8 rounded-3xl border border-gray-200 text-center text-gray-500 font-bold">
              Sem jogos agendados no momento.
            </div>
          )}
        </div>

        {/* SIDEBAR (4/12 Colunas): PRÓXIMO TREINO + COMUNICADOS OFICIAIS */}
        <div className="lg:col-span-4 space-y-5">
          
          {/* Card Comunicados Oficiais com Suporte Touch Slide */}
          <div 
            {...announcementSwipeHandlers}
            className="bg-white rounded-3xl p-5 shadow-sm border border-gray-200/90 space-y-4 select-none touch-pan-y"
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📢</span>
                <h3 className="text-sm font-black text-gray-900">Comunicados Oficiais</h3>
              </div>
              <Link to="/announcements" className="text-xs font-bold text-csc-dark hover:underline flex items-center gap-0.5">
                <span>Ver todos</span>
                <ChevronRight size={12} />
              </Link>
            </div>

            {currentAnnouncement ? (
              <div 
                onClick={() => navigate('/announcements')}
                className="p-4 rounded-2xl bg-gray-50/90 border border-gray-200/70 hover:bg-gray-100/80 transition-all cursor-pointer space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {new Date(currentAnnouncement.published_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-[10.5px] font-bold text-gray-400">Oficial CSC</span>
                </div>
                <h4 className="text-sm font-black text-gray-900 line-clamp-2">{currentAnnouncement.title}</h4>
                <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{currentAnnouncement.content}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">Sem comunicados recentes.</p>
            )}

            {/* Navegação dos Comunicados (Setas + Contador + Slide Touch) */}
            {announcements.length > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={prevAnnouncementSlide}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-gray-200 shrink-0"
                  title="Anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
                  <span className="text-xs font-black text-gray-700 leading-none">
                    {currentAnnouncementIndex + 1}/{announcements.length}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={nextAnnouncementSlide}
                  className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer active:scale-90 border border-gray-200 shrink-0"
                  title="Próximo"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Card Próximo Treino (Adicionado da Versão 2) */}
          <div className="bg-emerald-50/80 border border-emerald-200 p-5 rounded-3xl space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
              <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <span>🏃</span> Próximo Treino
              </span>
              <Link to="/calendar" className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5">
                <span>Agenda</span>
                <ChevronRight size={12} />
              </Link>
            </div>

            {upcomingPractices.length > 0 ? (
              <div 
                onClick={() => navigate(`/calendar?event=${upcomingPractices[0].id}`)}
                className="cursor-pointer hover:opacity-85 transition-opacity space-y-1.5 pt-0.5"
              >
                <p className="text-sm font-black text-emerald-950 capitalize">
                  {new Date(upcomingPractices[0].date_time).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-xs text-emerald-800 font-extrabold flex items-center gap-1">
                  <span>⏰ às {new Date(upcomingPractices[0].date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                </p>
                <p className="text-xs text-emerald-700 font-medium truncate flex items-center gap-1">
                  <MapPin size={13} className="text-emerald-600 shrink-0" />
                  <span className="truncate">{getEventLocation(upcomingPractices[0]) || 'Estádio Municipal'}</span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-emerald-800 py-1">Sem treinos marcados para breve.</p>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}

export default Home
