import React, { useEffect, useState } from 'react'
import { MapPin, Clock, Plus, X, Award } from 'lucide-react'
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

const CalendarPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentName, setTournamentName] = useState('')

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*, opponent:opponents(name, initials, logo_url)')
        .order('date_time', { ascending: true })

      if (error) throw error
      if (data && data.length > 0) {
        setEvents(data as Event[])
      } else {
        // Mock data
        setEvents([
          {
            id: '1',
            title: 'Treino Semanal Veteranos',
            type: 'practice',
            date_time: new Date(Date.now() + 86400000 * 2).toISOString(),
            location: 'Campo Sintético Municipal',
            description: 'Treino geral com foco físico e tático.'
          },
          {
            id: '2',
            title: 'Veteranos F.C. vs GD Cascais',
            type: 'match',
            date_time: new Date(Date.now() + 86400000 * 5).toISOString(),
            location: 'Estádio de Cascais',
            description: 'Grande jogo contra o rival de Cascais.',
            is_friendly: false,
            tournament_name: 'Torneio Inter-concelhos'
          },
          {
            id: '3',
            title: 'Churrasco de Convívio',
            type: 'gathering',
            date_time: new Date(Date.now() + 86400000 * 6).toISOString(),
            location: 'Sede do Clube',
            description: 'Convívio aberto a todos os atletas e familiares.'
          }
        ])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const newEvent = {
        title,
        type,
        date_time: new Date(dateTime).toISOString(),
        location,
        description,
        is_friendly: type === 'match' ? isFriendly : undefined,
        tournament_name: type === 'match' ? tournamentName : undefined,
        created_by: profile?.id
      }

      const { error } = await supabase.from('events').insert([newEvent])
      if (error) throw error

      fetchEvents()
      setIsAddModalOpen(false)
      // Reset form
      setTitle('')
      setLocation('')
      setDescription('')
      setDateTime('')
      setTournamentName('')
      setIsFriendly(false)
    } catch (err) {
      alert('Erro ao guardar o evento. Salvando localmente para demonstração.')
      const localEvent: Event = {
        id: Math.random().toString(),
        title,
        type,
        date_time: new Date(dateTime).toISOString(),
        location,
        description,
        is_friendly: isFriendly,
        tournament_name: tournamentName
      }
      setEvents(prev => [...prev, localEvent].sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()))
      setIsAddModalOpen(false)
    }
  }

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-csc-dark">Calendário de Eventos</h1>
          <p className="text-gray-500 mt-1">Consulte os treinos, jogos e convívios agendados.</p>
        </div>

        {isCoachOrAdmin && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 bg-csc-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow"
          >
            <Plus size={18} />
            <span>Criar Evento</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div
              key={event.id}
              onClick={() => setSelectedEvent(event)}
              className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className={`
                    text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider
                    ${event.type === 'match' ? 'bg-csc-light/20 text-csc-dark' : event.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}
                  `}>
                    {event.type === 'match' ? 'Jogo' : event.type === 'practice' ? 'Treino' : 'Convívio'}
                  </span>
                </div>
                
                {event.type === 'match' && event.opponent ? (
                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex flex-col items-center gap-1 w-12">
                      {clubSettings?.logo_url ? (
                        <img src={clubSettings.logo_url} alt="Nós" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">{clubSettings?.initials || 'CSC'}</div>
                      )}
                    </div>
                    <span className="text-gray-400 font-bold text-xs">VS</span>
                    <div className="flex flex-col items-center gap-1 w-12">
                      {event.opponent.logo_url ? (
                        <img src={event.opponent.logo_url} alt="Adv" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">{event.opponent.initials || 'ADV'}</div>
                      )}
                    </div>
                  </div>
                ) : null}

                <h3 className="text-lg font-bold text-gray-800">{event.title}</h3>
                <p className="text-gray-550 text-xs mt-1 line-clamp-2">{event.description}</p>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                <div className="flex items-center text-xs text-gray-600 space-x-2">
                  <Clock size={14} className="text-gray-400" />
                  <span>
                    {new Date(event.date_time).toLocaleDateString('pt-PT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-center text-xs text-gray-600 space-x-2">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="truncate">{event.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Detalhes Evento */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-650"
            >
              <X size={20} />
            </button>
            <span className={`
              text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider
              ${selectedEvent.type === 'match' ? 'bg-csc-light/20 text-csc-dark' : selectedEvent.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}
            `}>
              {selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio'}
            </span>
            <h2 className="text-2xl font-bold text-gray-805 mt-3">{selectedEvent.title}</h2>
            
            {selectedEvent.tournament_name && (
              <div className="mt-2 flex items-center space-x-1 text-xs text-csc-dark bg-gray-50 px-2 py-1 rounded inline-flex">
                <Award size={14} />
                <span>{selectedEvent.tournament_name} {selectedEvent.is_friendly ? '(Amigável)' : ''}</span>
              </div>
            )}

            <p className="text-gray-600 text-sm mt-4 leading-relaxed">{selectedEvent.description}</p>

            <div className="mt-6 space-y-3 bg-gray-55 p-4 rounded-lg">
              <div className="flex items-center text-sm text-gray-700 space-x-3">
                <Clock size={18} className="text-csc-dark" />
                <div>
                  <p className="font-semibold">Data e Hora</p>
                  <p className="text-xs text-gray-500">
                    {new Date(selectedEvent.date_time).toLocaleString('pt-PT')}
                  </p>
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-700 space-x-3">
                <MapPin size={18} className="text-csc-dark" />
                <div>
                  <p className="font-semibold">Localização</p>
                  <p className="text-xs text-gray-500">{selectedEvent.location}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar Evento */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-650"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-csc-dark mb-6">Criar Novo Evento</h2>
            
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Título</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder="Ex: Treino de Quinta"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Evento</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                >
                  <option value="practice">Treino</option>
                  <option value="match">Jogo</option>
                  <option value="gathering">Convívio</option>
                </select>
              </div>

              {type === 'match' && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isFriendly"
                      checked={isFriendly}
                      onChange={(e) => setIsFriendly(e.target.checked)}
                      className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded"
                    />
                    <label htmlFor="isFriendly" className="ml-2 text-sm font-medium text-gray-700">
                      Jogo Amigável
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Torneio / Liga</label>
                    <input
                      type="text"
                      value={tournamentName}
                      onChange={(e) => setTournamentName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      placeholder="Ex: Taça da Associação"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Data e Hora</label>
                <input
                  type="datetime-local"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Localização</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder="Ex: Campo Sintético"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder="Instruções adicionais..."
                />
              </div>

              <button
                type="submit"
                className="w-full bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow"
              >
                Guardar Evento
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage
