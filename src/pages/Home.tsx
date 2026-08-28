import React, { useEffect, useState } from 'react'
import { Bell, Calendar, DollarSign, MapPin, Clock, Info } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
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
          .select('*')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto space-y-5 pb-16">
      
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-black text-gray-900">Próximo jogo</h2>
            <span className="text-xs font-bold text-csc-dark bg-gray-50 px-2.5 py-0.5 rounded-full uppercase">
              {nextMatch.is_friendly ? 'Amigável' : nextMatch.tournament_name || 'Competição'}
            </span>
          </div>
          
          <h3 className="text-2xl font-extrabold text-gray-800 mb-4">{nextMatch.title}</h3>
          
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
          {myCallups.filter(c => c.event_id === nextMatch.id).map(call => (
            <div key={call.id} className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">Convocatória:</span>
              <div className="flex gap-2">
                {call.status === 'called' ? (
                  <>
                    <button
                      onClick={() => handleCallupResponse(call.id, 'confirmed')}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded-lg font-bold transition-colors"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => handleCallupResponse(call.id, 'declined')}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded-lg font-bold transition-colors"
                    >
                      Recusar
                    </button>
                  </>
                ) : (
                  <span className={`text-xs font-bold px-2 py-1 rounded ${call.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {call.status === 'confirmed' ? 'Confirmado' : 'Recusado'}
                  </span>
                )}
              </div>
            </div>
          ))}
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
