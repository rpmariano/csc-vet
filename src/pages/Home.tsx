import React, { useEffect, useState } from 'react'
import { Bell, Calendar, DollarSign, MapPin, Award, CheckCircle, XCircle } from 'lucide-react'
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
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [myCallups, setMyCallups] = useState<Callup[]>([])
  const [pendingDues, setPendingDues] = useState<Due[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return
      setLoading(true)
      try {
        // Fetch next event
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .gte('date_time', new Date().toISOString())
          .order('date_time', { ascending: true })
          .limit(1)

        if (eventsData && eventsData.length > 0) {
          setNextEvent(eventsData[0] as Event)
        } else {
          // Fallback static next event for demonstration
          setNextEvent({
            id: 'demo-1',
            title: 'Treino Semanal de Veteranos',
            type: 'practice',
            date_time: new Date(Date.now() + 86400000 * 2).toISOString(), // 2 days from now
            location: 'Campo Sintético Municipal',
            description: 'Treino focado em posse de bola e finalização. Presença obrigatória.'
          })
        }

        // Fetch announcements
        const { data: announcementsData } = await supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(3)

        if (announcementsData && announcementsData.length > 0) {
          setAnnouncements(announcementsData as Announcement[])
        } else {
          setAnnouncements([
            {
              id: 'ann-1',
              title: 'Jantar de Início de Época',
              content: 'No próximo sábado teremos o nosso jantar convívio após o jogo amigável. Por favor confirmem presença até quinta-feira.',
              published_at: new Date().toISOString()
            },
            {
              id: 'ann-2',
              title: 'Pagamento das Quotas de Agosto',
              content: 'Lembramos a todos os jogadores que a quota mensal de Agosto de 15€ já se encontra a pagamento.',
              published_at: new Date(Date.now() - 86400000 * 3).toISOString()
            }
          ])
        }

        // Fetch callups for player
        const { data: callupsData } = await supabase
          .from('callups')
          .select('*, event:events(*)')
          .eq('player_id', profile.id)
          .order('created_at', { ascending: false })

        if (callupsData && callupsData.length > 0) {
          setMyCallups(callupsData as unknown as Callup[])
        } else {
          // Mock callup
          setMyCallups([
            {
              id: 'call-1',
              event_id: 'event-match-1',
              status: 'called',
              event: {
                id: 'event-match-1',
                title: 'Veteranos F.C. vs GD Cascais',
                type: 'match',
                date_time: new Date(Date.now() + 86400000 * 5).toISOString(),
                location: 'Estádio de Cascais',
                description: 'Jogo a contar para o Torneio Inter-concelhos. Ponto de encontro às 19:30 no pavilhão.',
                is_friendly: false,
                tournament_name: 'Torneio Inter-concelhos'
              }
            }
          ])
        }

        // Fetch pending dues
        const { data: duesData } = await supabase
          .from('dues')
          .select('*')
          .eq('player_id', profile.id)
          .neq('status', 'paid')

        if (duesData && duesData.length > 0) {
          setPendingDues(duesData as Due[])
        } else {
          setPendingDues([
            {
              id: 'due-1',
              month_year: '2026-08',
              amount: 15.00,
              status: 'pending'
            }
          ])
        }

      } catch (error) {
        console.error('Erro ao buscar dados:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [profile])

  const handleCallupResponse = async (callupId: string, status: 'confirmed' | 'declined') => {
    try {
      const { error } = await supabase
        .from('callups')
        .update({ status })
        .eq('id', callupId)

      if (error) throw error

      setMyCallups(prev =>
        prev.map(c => (c.id === callupId ? { ...c, status } : c))
      )
    } catch (err) {
      // Offline / Local change simulation
      setMyCallups(prev =>
        prev.map(c => (c.id === callupId ? { ...c, status } : c))
      )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-blue-900">Painel Principal</h1>
        <p className="text-gray-500 mt-1">Bem-vindo de volta ao plantel, {profile?.name}!</p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna Esquerda & Central */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Próximo Evento / Jogo em Destaque */}
          {nextEvent && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
              <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider">
                {nextEvent.type === 'match' ? 'Próximo Jogo' : nextEvent.type === 'practice' ? 'Treino Agendado' : 'Convívio'}
              </span>
              <h2 className="text-xl font-bold text-gray-800 mt-3">{nextEvent.title}</h2>
              <p className="text-gray-650 text-sm mt-1">{nextEvent.description}</p>
              
              {nextEvent.tournament_name && (
                <div className="mt-2 flex items-center space-x-1 text-xs text-blue-900 bg-blue-50 px-2 py-1 rounded inline-flex">
                  <Award size={14} />
                  <span>{nextEvent.tournament_name} {nextEvent.is_friendly ? '(Amigável)' : ''}</span>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div className="flex items-center space-x-2 text-gray-600">
                  <Calendar size={18} className="text-blue-900" />
                  <span className="text-sm">
                    {new Date(nextEvent.date_time).toLocaleDateString('pt-PT', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-gray-600">
                  <MapPin size={18} className="text-blue-900" />
                  <span className="text-sm truncate">{nextEvent.location}</span>
                </div>
              </div>
            </div>
          )}

          {/* Minhas Convocatórias */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-4">
              Minhas Convocatórias
            </h3>
            {myCallups.length === 0 ? (
              <p className="text-gray-500 text-sm">Não tens convocatórias ativas de momento.</p>
            ) : (
              <div className="space-y-4">
                {myCallups.map((call) => (
                  <div key={call.id} className="p-4 bg-gray-50 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-gray-800">{call.event.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(call.event.date_time).toLocaleDateString('pt-PT', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })} - {call.event.location}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {call.status === 'called' ? (
                        <>
                          <button
                            onClick={() => handleCallupResponse(call.id, 'confirmed')}
                            className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold"
                          >
                            <CheckCircle size={14} />
                            <span>Confirmar</span>
                          </button>
                          <button
                            onClick={() => handleCallupResponse(call.id, 'declined')}
                            className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold"
                          >
                            <XCircle size={14} />
                            <span>Recusar</span>
                          </button>
                        </>
                      ) : (
                        <span className={`
                          text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1
                          ${call.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        `}>
                          {call.status === 'confirmed' ? (
                            <>
                              <CheckCircle size={14} />
                              <span>Confirmado</span>
                            </>
                          ) : (
                            <>
                              <XCircle size={14} />
                              <span>Recusado</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita */}
        <div className="space-y-6">
          {/* Quotas Pendentes */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-4 flex items-center space-x-2">
              <DollarSign className="text-blue-900" size={20} />
              <span>Quotas & Mensalidades</span>
            </h3>
            {pendingDues.length === 0 ? (
              <div className="text-center py-4 text-green-700 font-semibold bg-green-50 rounded-lg text-sm">
                Sem quotas em atraso! Tudo em dia.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDues.map((due) => (
                  <div key={due.id} className="flex justify-between items-center p-3 bg-red-50 border border-red-100 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-850">Mês: {due.month_year}</p>
                      <span className="text-xs font-bold text-red-750 uppercase tracking-wider">
                        {due.status === 'late' ? 'Em Atraso' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-lg font-extrabold text-red-700">{due.amount.toFixed(2)}€</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comunicados do Clube */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-800 border-b border-gray-100 pb-3 mb-4 flex items-center space-x-2">
              <Bell className="text-blue-900" size={20} />
              <span>Comunicados Recentes</span>
            </h3>
            {announcements.length === 0 ? (
              <p className="text-gray-500 text-sm">Não há comunicados recentes do clube.</p>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div key={ann.id} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                    <p className="font-bold text-gray-800 text-sm">{ann.title}</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{ann.content}</p>
                    <span className="text-[10px] text-gray-400 block mt-2">
                      {new Date(ann.published_at).toLocaleDateString('pt-PT')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

export default Home
