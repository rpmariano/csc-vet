import React, { useEffect, useState } from 'react'
import { Bell, Calendar, DollarSign, MapPin, Clock, Info, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
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
          .limit(2)

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
    <div className="max-w-md mx-auto space-y-5 pb-16">
      
      {/* ALERTA DE CONVOCATÓRIAS PENDENTES */}
      {pendingCallupsCount > 0 && (
        <div className="bg-amber-500 text-white rounded-2xl p-4 shadow-md flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} className="shrink-0" />
            <div>
              <p className="font-extrabold text-sm">
                Tens {pendingCallupsCount} {pendingCallupsCount === 1 ? 'convocatória pendente' : 'convocatórias pendentes'}!
              </p>
              <p className="text-xs text-amber-100">Confirma a tua disponibilidade para os próximos jogos.</p>
            </div>
          </div>
          <Link
            to="/calendar"
            className="bg-white text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow shrink-0 hover:bg-amber-50"
          >
            Ver
          </Link>
        </div>
      )}

      {/* 1. SECÇÃO: Comunicações */}
      <div className="bg-white rounded-2xl border-2 border-gray-800 p-5 shadow-sm">
        <h2 className="text-xl font-black text-gray-900 mb-3 flex items-center gap-2">
          <Bell size={20} className="text-csc-dark" />
          Comunicações
        </h2>
        <div className="space-y-3">
          {announcements.map(ann => (
            <div key={ann.id} className="text-gray-800 text-sm leading-relaxed">
              <p className="font-bold mb-1">{ann.title}</p>
              <p>{ann.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. SECÇÃO: Próximo Jogo */}
      {nextMatch && (
        <div className="bg-white rounded-2xl border-2 border-gray-800 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-black text-gray-900">Próximo jogo</h2>
            <span className="text-xs font-bold text-csc-dark bg-gray-50 px-2.5 py-0.5 rounded-full uppercase">
              {nextMatch.is_friendly ? 'Amigável' : nextMatch.tournament_name || 'Competição'}
            </span>
          </div>
          
          {nextMatch.opponent ? (
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="flex flex-col items-center gap-2 w-20">
                {clubSettings?.logo_url ? (
                  <img src={clubSettings.logo_url} alt="Nós" className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-lg font-bold">{clubSettings?.initials || 'CSC'}</div>
                )}
                <span className="text-xs font-bold text-gray-800 text-center">{clubSettings?.initials || 'Nós'}</span>
              </div>
              <span className="text-gray-400 font-black text-lg">VS</span>
              <div className="flex flex-col items-center gap-2 w-20">
                {nextMatch.opponent.logo_url ? (
                  <img src={nextMatch.opponent.logo_url} alt="Adv" className="w-16 h-16 object-contain" />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-lg font-bold">{nextMatch.opponent.initials || 'ADV'}</div>
                )}
                <span className="text-xs font-bold text-gray-800 text-center line-clamp-1">{nextMatch.opponent.initials || nextMatch.opponent.name}</span>
              </div>
            </div>
          ) : (
            <h3 className="text-2xl font-extrabold text-gray-800 mb-4">{nextMatch.title}</h3>
          )}
          
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" />
              <span><strong>Local:</strong> {nextMatch.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              <span>
                <strong>Data:</strong> {new Date(nextMatch.date_time).toLocaleDateString('pt-PT', {
                  day: '2-digit',
                  month: 'long'
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              <span>
                <strong>Horário:</strong> {new Date(nextMatch.date_time).toLocaleTimeString('pt-PT', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>

          {/* Convocatória ligada a este jogo */}
          {(() => {
            const currentMatchCallup = myCallups.find(c => c.event_id === nextMatch.id)
            if (!currentMatchCallup) return null

            return (
              <div className="mt-5 pt-4 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">A tua convocatória:</span>
                    <p className="text-xs font-extrabold mt-0.5">
                      {currentMatchCallup.status === 'confirmed' ? (
                        <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={14}/> Presença Confirmada</span>
                      ) : currentMatchCallup.status === 'declined' ? (
                        <span className="text-red-700 flex items-center gap-1"><XCircle size={14}/> Marcaste Ausência</span>
                      ) : (
                        <span className="text-amber-700">A aguardar a tua resposta</span>
                      )}
                    </p>
                  </div>
                  
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleCallupResponse(currentMatchCallup.id, 'confirmed')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm ${
                        currentMatchCallup.status === 'confirmed'
                          ? 'bg-green-700 text-white'
                          : 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                      }`}
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleCallupResponse(currentMatchCallup.id, 'declined')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm ${
                        currentMatchCallup.status === 'declined'
                          ? 'bg-red-700 text-white'
                          : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
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

      {/* 3. SECÇÃO: Próximo Treino */}
      {nextPractice && (
        <div className="bg-white rounded-2xl border-2 border-gray-800 p-5 shadow-sm">
          <h2 className="text-xl font-black text-gray-900 mb-3">Próximo treino</h2>
          
          <div className="space-y-2 text-sm text-gray-700 mb-4">
            <div className="flex items-center gap-2">
              <MapPin size={16} className="text-gray-400" />
              <span><strong>Local:</strong> {nextPractice.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-gray-400" />
              <span>
                <strong>Data:</strong> {new Date(nextPractice.date_time).toLocaleDateString('pt-PT', {
                  day: '2-digit',
                  month: 'long'
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              <span>
                <strong>Horário:</strong> {new Date(nextPractice.date_time).toLocaleTimeString('pt-PT', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-start gap-2 text-xs text-csc-dark">
            <Info size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>Obs:</strong> {nextPractice.description}
            </div>
          </div>
        </div>
      )}

      {/* 4. SECÇÃO: Próximo Pagamento */}
      {pendingDues.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-gray-800 p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1 text-sm">
            <p className="font-bold text-gray-900">
              Próximo pagamento até <span className="underline">{pendingDues[0].month_year}</span>
            </p>
            <p className="text-red-600 font-extrabold flex items-center gap-1">
              <DollarSign size={16} />
              Em dívida: {pendingDues[0].amount}€
            </p>
          </div>
        </div>
      )}
      
    </div>
  )
}

export default Home
