import React, { useEffect, useState } from 'react'
import { Plus, Trash2, MapPin, Clock, Check } from 'lucide-react'
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

const EventsPage: React.FC = () => {
  const { profile } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
        .select('*')
        .order('date_time', { ascending: false })

      if (error) throw error
      if (data && data.length > 0) {
        setEvents(data as Event[])
      } else {
        setEvents([
          {
            id: '1',
            title: 'Treino Semanal Veteranos',
            type: 'practice',
            date_time: new Date(Date.now() + 86400000 * 2).toISOString(),
            location: 'Campo Sintético Municipal',
            description: 'Treino geral com foco físico.'
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

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
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

      setSuccessMessage('Evento criado com sucesso!')
      fetchEvents()
      // Reset form
      setTitle('')
      setLocation('')
      setDescription('')
      setDateTime('')
      setTournamentName('')
      setIsFriendly(false)
    } catch (err) {
      // offline fallback
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
      setEvents(prev => [localEvent, ...prev])
      setSuccessMessage('Evento criado com sucesso (Local)!')
      setTitle('')
      setLocation('')
      setDescription('')
      setDateTime('')
      setTournamentName('')
      setIsFriendly(false)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    try {
      const { error } = await supabase.from('events').delete().eq('id', id)
      if (error) throw error
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch {
      setEvents(prev => prev.filter(e => e.id !== id))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-blue-900">Gestão de Eventos</h1>
        <p className="text-gray-550 mt-1">Crie e remova jogos, treinos ou convívios da equipa.</p>
      </div>

      {successMessage && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-150 text-sm font-semibold flex items-center gap-2">
          <Check size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form para Criar Evento */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-805 mb-4 flex items-center gap-2 border-b pb-3">
            <Plus size={20} className="text-blue-900" />
            <span>Criar Evento</span>
          </h3>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Título</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
                placeholder="Ex: Pescadores CC vs CSC"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Evento</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900 bg-white"
              >
                <option value="practice">Treino</option>
                <option value="match">Jogo</option>
                <option value="gathering">Convívio</option>
              </select>
            </div>

            {type === 'match' && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isFriendly"
                    checked={isFriendly}
                    onChange={(e) => setIsFriendly(e.target.checked)}
                    className="h-4 w-4 text-blue-900 focus:ring-blue-900 border-gray-300 rounded"
                  />
                  <label htmlFor="isFriendly" className="ml-2 text-sm font-medium text-gray-700">
                    Jogo Amigável
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Torneio</label>
                  <input
                    type="text"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    placeholder="Ex: Torneio de Veteranos"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Localização</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
                placeholder="Ex: Costa da Caparica"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição / Obs</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-900"
                placeholder="Obs: Balneário 4 às 21h..."
              />
            </div>

            <button
              type="submit"
              className="w-full bg-blue-900 text-white py-2.5 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow"
            >
              Criar Evento
            </button>
          </form>
        </div>

        {/* Lista de Eventos Existentes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-805 mb-6">Lista de Eventos</h3>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-900"></div>
              </div>
            ) : events.length === 0 ? (
              <p className="text-gray-550 text-sm">Não há eventos registados.</p>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${event.type === 'match' ? 'bg-blue-100 text-blue-800' : event.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}>
                          {event.type === 'match' ? 'Jogo' : event.type === 'practice' ? 'Treino' : 'Convívio'}
                        </span>
                        {event.is_friendly && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-yellow-100 text-yellow-800">
                            Amigável
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-gray-850 text-base">{event.title}</h4>
                      <p className="text-xs text-gray-500">{event.description}</p>
                      
                      <div className="flex flex-wrap gap-4 text-xs text-gray-600 mt-2">
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-gray-400" />
                          <span>{new Date(event.date_time).toLocaleString('pt-PT')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin size={14} className="text-gray-400" />
                          <span>{event.location}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-red-650 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                      title="Eliminar evento"
                    >
                      <Trash2 size={16} />
                    </button>
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

export default EventsPage
