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
  ArrowRight
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  location: string
  description: string
  is_friendly?: boolean
  tournament_name?: string
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
  const [nextMatch, setNextMatch] = useState<Event | null>(null)
  const [nextPractice, setNextPractice] = useState<Event | null>(null)
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

        // 1. Fetch next match
        const { data: matches } = await supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url)')
          .eq('type', 'match')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })
          .limit(1)

        if (matches && matches.length > 0) {
          setNextMatch(matches[0] as Event)
        } else {
          setNextMatch({
            id: 'm-demo',
            title: 'Pescadores CC vs CSC',
            type: 'match',
            date_time: '2026-09-12T18:00:00Z',
            location: 'Costa da Caparica',
            description: 'Jogo Amigável de preparação.',
            is_friendly: true,
            tournament_name: 'Amigável'
          })
        }

        // 2. Fetch next practice
        const { data: practices } = await supabase
          .from('events')
          .select('*')
          .eq('type', 'practice')
          .gte('date_time', nowStr)
          .order('date_time', { ascending: true })
          .limit(1)

        if (practices && practices.length > 0) {
          setNextPractice(practices[0] as Event)
        } else {
          setNextPractice({
            id: 'p-demo',
            title: 'Treino Semanal',
            type: 'practice',
            date_time: '2026-09-02T22:00:00Z',
            location: 'Campo Cascais',
            description: 'Balneário 4 às 21h'
          })
        }

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

  const pendingCallupsCount = myCallups.filter(c => c.status === 'called').length

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
                Camisola #{profile.jersey_number}
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

          {/* CARD: PRÓXIMO JOGO */}
          {nextMatch && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚽</span>
                  <h2 className="text-lg font-black text-gray-900">Próximo Jogo</h2>
                </div>
                <span className="text-xs font-bold text-csc-dark bg-amber-50 border border-amber-200 px-3 py-0.5 rounded-full uppercase">
                  {nextMatch.is_friendly ? 'Jogo Amigável' : nextMatch.tournament_name || 'Competição Oficial'}
                </span>
              </div>
              
              {nextMatch.opponent ? (
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-150 mb-5">
                  <div className="flex items-center justify-around gap-4">
                    {/* Clube da Casa */}
                    <div className="flex flex-col items-center gap-2 w-28 text-center">
                      {clubSettings?.logo_url ? (
                        <img src={clubSettings.logo_url} alt="Nós" className="w-16 h-16 object-contain" />
                      ) : (
                        <div className="w-16 h-16 bg-csc-dark text-white rounded-2xl flex items-center justify-center text-lg font-black shadow-sm">
                          {clubSettings?.initials || 'CSC'}
                        </div>
                      )}
                      <span className="text-xs font-bold text-gray-800">{clubSettings?.initials || clubSettings?.name || 'CSC'}</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="text-gray-300 font-black text-xl">VS</span>
                      <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">Confronto</span>
                    </div>

                    {/* Adversário */}
                    <div className="flex flex-col items-center gap-2 w-28 text-center">
                      {nextMatch.opponent.logo_url ? (
                        <img src={nextMatch.opponent.logo_url} alt="Adv" className="w-16 h-16 object-contain" />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded-2xl flex items-center justify-center text-lg font-black text-gray-600 shadow-sm">
                          {nextMatch.opponent.initials || 'ADV'}
                        </div>
                      )}
                      <span className="text-xs font-bold text-gray-800 line-clamp-1">{nextMatch.opponent.initials || nextMatch.opponent.name}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <h3 className="text-xl font-extrabold text-gray-850 mb-4">{nextMatch.title}</h3>
              )}
              
              {/* Detalhes do Jogo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 bg-white p-3 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-csc-gold shrink-0" />
                  <span>
                    <strong>Data:</strong> {new Date(nextMatch.date_time).toLocaleDateString('pt-PT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-csc-gold shrink-0" />
                  <span>
                    <strong>Horário:</strong> {new Date(nextMatch.date_time).toLocaleTimeString('pt-PT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2.5 truncate">
                    <MapPin size={16} className="text-csc-gold shrink-0" />
                    <span className="truncate"><strong>Local:</strong> {nextMatch.location}</span>
                  </div>
                  {nextMatch.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextMatch.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow-2xs"
                      title="Abrir no Google Maps"
                    >
                      <MapPin size={12} className="text-red-500" />
                      <span>Google Maps</span>
                      <ExternalLink size={10} className="opacity-70" />
                    </a>
                  )}
                </div>
              </div>

              {/* Convocatória ligada a este jogo */}
              {(() => {
                const currentMatchCallup = myCallups.find(c => c.event_id === nextMatch.id)
                if (!currentMatchCallup) return null

                return (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">A tua convocatória:</span>
                        <p className="text-xs font-black mt-0.5">
                          {currentMatchCallup.status === 'confirmed' ? (
                            <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={15}/> Presença Confirmada</span>
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
                          className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-xs ${
                            currentMatchCallup.status === 'confirmed'
                              ? 'bg-green-700 text-white font-black'
                              : 'bg-white text-green-700 border border-green-300 hover:bg-green-50'
                          }`}
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                          className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-xs ${
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
            </div>
          )}

          {/* CARD: PRÓXIMO TREINO */}
          {nextPractice && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🏃</span>
                  <h2 className="text-lg font-black text-gray-900">Próximo Treino</h2>
                </div>
                <span className="text-xs font-bold text-green-800 bg-green-50 border border-green-200 px-3 py-0.5 rounded-full uppercase">
                  Semanal
                </span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 mb-4">
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-csc-gold shrink-0" />
                  <span>
                    <strong>Data:</strong> {new Date(nextPractice.date_time).toLocaleDateString('pt-PT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'long'
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Clock size={16} className="text-csc-gold shrink-0" />
                  <span>
                    <strong>Horário:</strong> {new Date(nextPractice.date_time).toLocaleTimeString('pt-PT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:col-span-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2.5 truncate">
                    <MapPin size={16} className="text-csc-gold shrink-0" />
                    <span className="truncate"><strong>Local:</strong> {nextPractice.location}</span>
                  </div>
                  {nextPractice.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextPractice.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow-2xs"
                      title="Abrir no Google Maps"
                    >
                      <MapPin size={12} className="text-red-500" />
                      <span>Google Maps</span>
                      <ExternalLink size={10} className="opacity-70" />
                    </a>
                  )}
                </div>
              </div>

              {nextPractice.description && (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900 font-medium">
                  <Info size={16} className="shrink-0 mt-0.5 text-amber-700" />
                  <div>
                    <strong>Instruções do Balneário:</strong> {nextPractice.description}
                  </div>
                </div>
              )}
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
