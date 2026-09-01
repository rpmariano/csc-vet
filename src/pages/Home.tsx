import React, { useEffect, useState, useRef } from 'react'
import {
  MapPin,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ShieldAlert,
  Megaphone,
  Trophy,
  Dumbbell,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { formatClubSigla, formatOpponentSigla, hasMatchReport, getRsvpDeadline } from './CalendarPage'
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
  is_active?: boolean
  home_score?: number | null
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

  // Suspension Alerts State
  const [suspensionAlerts, setSuspensionAlerts] = useState<{key: string, msg: string}[]>([])

  useEffect(() => {
    if (profile && (profile.role === 'coach' || profile.role === 'admin')) {
      const alerts = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('csc_suspension_alert_')) {
          alerts.push({ key, msg: localStorage.getItem(key) || '' })
        }
      }
      setSuspensionAlerts(alerts)
    }
  }, [profile])

  // Practices State
  const [upcomingPractices, setUpcomingPractices] = useState<Event[]>([])

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [fields, setFields] = useState<{ id: string; name: string; address?: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  // Comunicado atualmente aberto na Home (acordeão: um de cada vez, clicar
  // outra vez fecha). Evita ter de sair da Home para ler a mensagem toda.
  const [comunicadoAberto, setComunicadoAberto] = useState<string | null>(null)

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

    if (diffDays <= 0) return 'É hoje'
    if (diffDays === 1) return 'Amanhã'
    if (diffDays <= 6) return `Faltam ${diffDays} dias`
    return `Em ${diffDays} dias`
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoading(true)
      try {
        const nowStr = new Date().toISOString()

        // Um jogo mostra-se na Home até ao fim do próprio dia — no dia seguinte desaparece,
        // já teve o seu momento e passa a viver apenas no Calendário / Ficha de Jogo.
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const startOfTodayStr = startOfToday.toISOString()

        // 0. Fetch fields
        const { data: fieldsData } = await supabase
          .from('fields')
          .select('id, name, address')
        if (fieldsData) {
          setFields(fieldsData)
        }

        // 1. Fetch upcoming matches (inclui jogos de hoje, mesmo já a decorrer ou terminados;
        // exclui jogos de dias anteriores)
        const { data: matches } = await supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url), tournament:tournaments(id, name, season), field:fields(id, name, address)')
          .eq('type', 'match')
          .gte('date_time', startOfTodayStr)
          .order('date_time', { ascending: true })

        const resolvedMatches: Event[] = (matches as Event[]) || []
        // Filtrar apenas jogos ativos (publicados)
        setUpcomingMatches(resolvedMatches.filter(m => m.is_active !== false))

        // 2. Fetch upcoming practices (apenas ativos)
        const { data: practices } = await supabase
          .from('events')
          .select('*, field:fields(id, name, address)')
          .eq('type', 'practice')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })
          .limit(3)
        if (practices) {
          setUpcomingPractices((practices as Event[]).filter(p => p.is_active !== false))
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

        // 4. Fetch callups (apenas para eventos ativos)
        const { data: calls } = await supabase
          .from('callups')
          .select('*, event:events(*, field:fields(id, name, address), opponent:opponents(name, initials, logo_url))')
          .eq('player_id', profile.id)

        const rawCalls = (calls || []) as unknown as Callup[]
        const activeCalls = rawCalls.filter(c => !c.event || c.event.is_active !== false)

        if (profile.status === 'injured' || profile.status === 'inactive') {
          setMyCallups(activeCalls.filter(c => c.event?.type !== 'practice'))
        } else {
          setMyCallups(activeCalls)
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
    const callup = myCallups.find(c => c.id === callupId)
    if (hasMatchReport(callup?.event)) {
      toast.error('Este jogo já tem ficha de jogo lançada — a convocatória está fechada.')
      return
    }
    const deadline = getRsvpDeadline(callup?.event)
    if (deadline !== null && Date.now() >= deadline) {
      toast.error(`Já passou a hora de ${callup?.event?.meeting_time ? 'concentração' : 'início'} — a convocatória está fechada.`)
      return
    }
    triggerHaptic(status === 'confirmed' ? 'success' : 'warning')
    try {
      const { error } = await supabase.from('callups').update({ status }).eq('id', callupId)
      if (error) throw error
      setMyCallups(prev => prev.map(c => (c.id === callupId ? { ...c, status } : c)))
    } catch (err: any) {
      console.error('Erro ao atualizar resposta:', err)
      toast.error('Erro ao atualizar resposta: ' + (err.message || 'Erro'))
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

  // Swipe handlers para touch / telemóvel
  const matchSwipeHandlers = useSwipe(() => nextMatchSlide(), () => prevMatchSlide())

  const isCallupPendingResponse = (callup: Callup) => {
    if (callup.status !== 'called') return false
    const ev = callup.event
    if (hasMatchReport(ev)) return false
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
  const currentMatch = upcomingMatches[currentMatchIndex]
  const currentMatchCallup = currentMatch ? myCallups.find(c => c.event_id === currentMatch.id) : undefined

  // Convocatórias por responder, excluindo o jogo já mostrado no cartão principal
  // (esse tem o próprio RSVP integrado — não faz sentido pedir a mesma resposta duas vezes).
  const outrasPendentes = pendingCallups.filter(c => c.event_id !== currentMatch?.id)

  const proximoTreino = upcomingPractices[0]
  const treinoJaNaLista = proximoTreino ? outrasPendentes.some(c => c.event_id === proximoTreino.id) : false

  const formatarDiaMes = (dateStr: string) => {
    const d = new Date(dateStr)
    return {
      dia: d.toLocaleDateString('pt-PT', { day: '2-digit' }),
      mes: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', ''),
    }
  }

  const tituloEvento = (ev?: Event | null) => {
    if (!ev) return 'Evento'
    if (ev.type === 'match') {
      const isAway = ev.home_away === 'away'
      const csc = formatClubSigla(clubSettings?.initials)
      const opp = formatOpponentSigla(ev.opponent)
      return isAway ? `${opp} vs ${csc}` : `${csc} vs ${opp}`
    }
    if (ev.type === 'practice') return 'Treino'
    return ev.title || 'Convívio'
  }

  const formatarTempoRelativo = (dateStr: string) => {
    const dias = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    if (dias <= 0) return 'hoje'
    if (dias === 1) return 'há 1 dia'
    return `há ${dias} dias`
  }

  // Aparência por tipo de evento — para os diferentes compromissos da lista
  // "Por responder" se distinguirem ao primeiro olhar, sem precisar de ler o título.
  // Tons claros: a lista vive agora num cartão verde-escuro, não em branco.
  const tipoInfo = (tipo?: Event['type']) => {
    if (tipo === 'match') return { Icon: Trophy, cor: 'text-csc-gold' }
    if (tipo === 'practice') return { Icon: Dumbbell, cor: 'text-emerald-300' }
    return { Icon: Users, cor: 'text-blue-300' }
  }

  // Separa o nome do campo da morada, para a morada poder quebrar linha em vez
  // de ser cortada — e para se poder abrir diretamente no Google Maps.
  const infoLocal = (ev?: { location?: string | null; field_id?: string | null; field?: { name: string; address?: string | null } | null } | null) => {
    if (!ev) return null
    const campo = ev.field || (ev.field_id ? fields.find(f => f.id === ev.field_id) : null)
    const nome = campo?.name || ev.location?.trim() || null
    if (!nome) return null
    // A morada só se junta ao nome do campo — texto livre em `location` já vem completo.
    return { nome, morada: campo?.name ? campo.address || null : null }
  }

  const linkMapa = (nome: string, morada?: string | null) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada ? `${nome}, ${morada}` : nome)}`

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Suspension Alerts (Coaches / Admins Only) */}
      {suspensionAlerts.length > 0 && (
        <div className="space-y-2">
          {suspensionAlerts.map(alert => (
            <div key={alert.key} className="bg-red-50 border border-red-300 rounded-3xl p-4 shadow-sm flex items-start gap-3">
              <div className="mt-0.5 text-red-600 bg-red-100 rounded-full p-1.5 shrink-0">
                <ShieldAlert size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-black text-red-900 uppercase tracking-wider mb-1">Alerta de Suspensão</h4>
                <p className="text-sm font-bold text-red-800">{alert.msg}</p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  localStorage.removeItem(alert.key)
                  setSuspensionAlerts(prev => prev.filter(a => a.key !== alert.key))
                }}
                className="w-8 h-8 rounded-full bg-white border border-red-200 text-red-700 hover:bg-red-50 hover:border-red-400 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 shadow-2xs"
                title="Dispensar Alerta"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Nível 1: o próximo compromisso, único elemento alto do ecrã.
          Funde o antigo banner de convocatória pendente com o bilhete de jogo —
          o RSVP passa a existir num só sítio da app. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          {currentMatch ? (() => {
            const isAway = currentMatch.home_away === 'away'
            const cscSigla = formatClubSigla(clubSettings?.initials)
            const oppSigla = formatOpponentSigla(currentMatch.opponent)
            const leftLogo = isAway ? currentMatch.opponent?.logo_url : clubSettings?.logo_url
            const leftInitials = isAway ? oppSigla : cscSigla
            const rightLogo = isAway ? clubSettings?.logo_url : currentMatch.opponent?.logo_url
            const rightInitials = isAway ? cscSigla : oppSigla

            const venueLabel = currentMatch.home_away === 'away' ? 'Fora de casa' : currentMatch.home_away === 'neutral' ? 'Campo neutro' : 'Em casa'
            const competitionLabel = currentMatch.is_friendly ? 'Jogo amigável' : (currentMatch.tournament?.name || currentMatch.tournament_name || 'Jogo oficial')
            const horaJogo = new Date(currentMatch.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
            const horaConcentracao = currentMatch.meeting_time ? currentMatch.meeting_time.substring(0, 5) : null
            const local = infoLocal(currentMatch)

            return (
              <div {...matchSwipeHandlers} className="relative bg-csc-dark text-white rounded-3xl overflow-hidden select-none touch-pan-y shadow-lg">
                {/* Contador de dias: canto, para não quebrar a simetria do resto do cartão */}
                <span className="absolute top-4 right-4 text-xs font-bold text-white bg-white/10 rounded-full px-3 py-1">
                  {getCountdownLabel(currentMatch.date_time)}
                </span>

                <div className="relative p-6 sm:p-8 flex flex-col items-center text-center space-y-5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-csc-gold">Próximo jogo</span>
                    <p className="text-xs text-white/70 mt-1">{competitionLabel} · {venueLabel}</p>
                  </div>

                  <p className="text-lg font-black capitalize">
                    {new Date(currentMatch.date_time).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </p>

                  {/* Campo: nome + morada, centrados — um toque abre a localização no Maps */}
                  {local && (
                    <a
                      href={linkMapa(local.nome, local.morada)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="group/campo inline-flex flex-col items-center gap-0.5 -mt-2"
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold group-hover/campo:underline">
                        <MapPin size={14} className="text-csc-gold shrink-0" />
                        {local.nome}
                      </span>
                      {local.morada && (
                        <span className="text-xs text-white/70 leading-snug max-w-[280px]">{local.morada}</span>
                      )}
                    </a>
                  )}

                  {/* Duelo de equipas: emblemas em círculo e VS em traço dourado, como
                      num bilhete — só as siglas, o nome por extenso já não cabia. */}
                  <div
                    onClick={() => navigate(`/calendar?event=${currentMatch.id}`)}
                    className="w-full flex items-center justify-center gap-4 sm:gap-8 py-2 cursor-pointer group"
                  >
                    <div className="flex flex-col items-center gap-2 w-24">
                      {leftLogo ? (
                        <img src={leftLogo} alt="" className="w-16 h-16 object-contain rounded-full bg-white p-2 shadow-md group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white text-csc-dark flex items-center justify-center text-sm font-black shadow-md">{leftInitials}</div>
                      )}
                      <div>
                        <p className="text-sm font-black uppercase leading-tight">{leftInitials}</p>
                        <p className="text-[11px] text-white/70">{isAway ? 'Fora' : 'Casa'}</p>
                      </div>
                    </div>

                    <span
                      className="text-3xl sm:text-4xl font-black text-transparent shrink-0"
                      style={{ WebkitTextStroke: '1.5px #e3c04d' }}
                    >
                      VS
                    </span>

                    <div className="flex flex-col items-center gap-2 w-24">
                      {rightLogo ? (
                        <img src={rightLogo} alt="" className="w-16 h-16 object-contain rounded-full bg-white p-2 shadow-md group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-white/15 text-white flex items-center justify-center text-sm font-black shadow-md">{rightInitials}</div>
                      )}
                      <div>
                        <p className="text-sm font-black uppercase leading-tight">{rightInitials}</p>
                        <p className="text-[11px] text-white/70">{isAway ? 'Casa' : 'Fora'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Horários: concentração e hora do jogo */}
                  <div className="flex items-center gap-6">
                    {horaConcentracao && (
                      <div>
                        <p className="text-[10px] text-white/70 uppercase tracking-widest font-black">Concentração</p>
                        <p className="text-base font-black">{horaConcentracao}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-white/70 uppercase tracking-widest font-black">Pontapé de saída</p>
                      <p className="text-base font-black">{horaJogo}</p>
                    </div>
                  </div>
                </div>

                {/* RSVP: existe uma vez na app, e é aqui — barra dourada de bordo a bordo.
                    Mostra-se sempre que ainda dá para responder — mesmo que já tenha respondido
                    antes, até à hora de concentração o jogador pode sempre mudar de ideias. */}
                {currentMatchCallup && (() => {
                  const closedByReport = hasMatchReport(currentMatch)
                  const deadline = getRsvpDeadline(currentMatch)
                  const pastDeadline = deadline !== null && Date.now() >= deadline
                  const canRespond = !closedByReport && !pastDeadline

                  if (closedByReport) {
                    return (
                      <div className="relative bg-white/10 px-5 py-3.5 flex items-center justify-center gap-3">
                        <span className="text-sm text-white/80">Jogo com ficha lançada — convocatória fechada</span>
                      </div>
                    )
                  }

                  if (canRespond) {
                    const respondido = currentMatchCallup.status !== 'called'
                    return (
                      <div className="relative bg-csc-gold px-5 py-3.5 flex flex-col items-center justify-center gap-2">
                        <span className="text-sm font-bold text-csc-dark">
                          {respondido ? (
                            currentMatchCallup.status === 'confirmed' ? '✓ Confirmaste presença' : '✕ Recusaste presença'
                          ) : 'Vais estar presente?'}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleCallupResponse(currentMatchCallup.id, 'confirmed')}
                            className={`h-10 px-5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              currentMatchCallup.status === 'confirmed'
                                ? 'bg-csc-dark text-white ring-2 ring-white shadow-md'
                                : 'bg-csc-dark/15 text-csc-dark/70 hover:bg-csc-dark/25'
                            }`}
                          >
                            {currentMatchCallup.status === 'confirmed' && <Check size={15} strokeWidth={3} />}
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                            className={`h-10 px-5 rounded-full text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                              currentMatchCallup.status === 'declined'
                                ? 'bg-csc-dark text-white ring-2 ring-white shadow-md'
                                : 'bg-csc-dark/15 text-csc-dark/70 hover:bg-csc-dark/25'
                            }`}
                          >
                            {currentMatchCallup.status === 'declined' && <X size={15} strokeWidth={3} />}
                            Não
                          </button>
                        </div>
                        {respondido && (
                          <span className="text-[11px] font-bold text-csc-dark/70">Toca no outro botão para mudar de resposta.</span>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div className="relative bg-white/10 px-5 py-3.5 flex items-center justify-center gap-3">
                      <span className="text-sm text-white/80">A tua presença</span>
                      {currentMatchCallup.status === 'called' ? (
                        <span className="text-sm font-bold text-white/60">Sem resposta</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${
                          currentMatchCallup.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${currentMatchCallup.status === 'confirmed' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {currentMatchCallup.status === 'confirmed' ? 'Confirmada' : 'Recusada'}
                        </span>
                      )}
                    </div>
                  )
                })()}

                {upcomingMatches.length > 1 && (
                  <div className="relative flex items-center justify-center gap-4 px-5 py-2.5 border-t border-white/10">
                    <button
                      type="button"
                      onClick={prevMatchSlide}
                      aria-label="Jogo anterior"
                      className="w-9 h-9 rounded-lg hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-xs font-bold text-white/70">{currentMatchIndex + 1} de {upcomingMatches.length}</span>
                    <button
                      type="button"
                      onClick={nextMatchSlide}
                      aria-label="Próximo jogo"
                      className="w-9 h-9 rounded-lg hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="bg-csc-dark rounded-3xl p-8 text-center text-white/70 font-medium">
              Sem jogos agendados no momento.
            </div>
          )}
        </div>

        {/* Níveis 2 e 3 */}
        <div className="lg:col-span-5 space-y-6">

          {/* Nível 2: lista, não carrossel. Cada convocatória por responder
              resolve-se na própria linha. */}
          {outrasPendentes.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Por responder</span>
                <span className="text-xs font-bold text-csc-dark bg-csc-gold rounded-full px-2.5 py-0.5">{outrasPendentes.length}</span>
              </div>
              <div className="bg-csc-dark rounded-3xl overflow-hidden">
                {outrasPendentes.map((callup, idx) => {
                  const ev = callup.event
                  if (!ev) return null
                  const { dia, mes } = formatarDiaMes(ev.date_time)
                  const { Icon, cor } = tipoInfo(ev.type)
                  return (
                    <div
                      key={callup.id}
                      className={`flex items-center gap-3 pl-4 pr-4 py-3 ${idx > 0 ? 'border-t border-white/10' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/calendar?event=${ev.id}`)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <div className="w-10 shrink-0 flex flex-col items-center">
                          <span className="text-lg font-black text-csc-gold leading-none">{dia}</span>
                          <span className="text-[11px] text-white/60 uppercase">{mes}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                            <Icon size={13} className={`${cor} shrink-0`} />
                            <span className="truncate">{tituloEvento(ev)}</span>
                          </p>
                          <p className="text-xs text-white/60 truncate">
                            {new Date(ev.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · {getEventLocation(ev) || 'Local a definir'}
                          </p>
                        </div>
                      </button>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCallupResponse(callup.id, 'confirmed')}
                          aria-label="Confirmar presença"
                          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-emerald-300 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Check size={18} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCallupResponse(callup.id, 'declined')}
                          aria-label="Recusar presença"
                          className="w-11 h-11 rounded-full border border-white/15 hover:bg-white/10 text-white/70 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-5">
            {proximoTreino && !treinoJaNaLista && (
              <div className="space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Próximo treino</span>
                <button
                  type="button"
                  onClick={() => navigate(`/calendar?event=${proximoTreino.id}`)}
                  className="w-full flex items-center gap-3 bg-csc-dark rounded-3xl px-4 py-3.5 text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-2xl bg-white/10 text-emerald-300 flex items-center justify-center shrink-0">
                    <Dumbbell size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white capitalize truncate">
                      {new Date(proximoTreino.date_time).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })}
                      <span className="text-white/60 font-medium"> · {new Date(proximoTreino.date_time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                    <p className="text-xs text-white/60 flex items-center gap-1 mt-0.5">
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{getEventLocation(proximoTreino) || 'Local a definir'}</span>
                    </p>
                  </div>
                </button>
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Comunicados</span>
                <Link to="/announcements" className="text-sm font-bold text-csc-light hover:text-csc-dark transition-colors">
                  Ver todos
                </Link>
              </div>
              {announcements.length > 0 ? (
                <div className="bg-csc-dark rounded-3xl overflow-hidden">
                  {announcements.slice(0, 3).map((a, idx) => {
                    const aberto = comunicadoAberto === a.id
                    return (
                      <div key={a.id} className={idx > 0 ? 'border-t border-white/10' : ''}>
                        <button
                          type="button"
                          onClick={() => setComunicadoAberto(aberto ? null : a.id)}
                          aria-expanded={aberto}
                          className="w-full flex items-start gap-3 px-4 py-3.5 text-left cursor-pointer"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-csc-gold shrink-0 mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white leading-snug">{a.title}</p>
                            <p className="text-xs text-white/70 mt-0.5">{formatarTempoRelativo(a.published_at)}</p>
                          </div>
                          <ChevronDown
                            size={16}
                            className={`text-white/65 shrink-0 mt-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {aberto && (
                          <div className="px-4 pb-4 pl-[26px]">
                            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-line">{a.content}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Megaphone size={14} className="shrink-0" />
                  <span>Sem comunicados recentes.</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Home
