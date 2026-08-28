import React, { useEffect, useState } from 'react'
import { Plus, Trash2, MapPin, Clock, Check, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface Event {
  id: string
  title: string
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string
  field_id?: string | null
  location?: string // fallback
  description: string
  is_friendly?: boolean
  tournament_id?: string | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
}

interface Field { id: string; name: string }
interface Opponent { id: string; name: string; home_field_id: string | null }
interface Tournament { id: string; name: string; season: string }

const EventsPage: React.FC = () => {
  const { profile } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  
  // Lookups
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('practice')
  const [dateTime, setDateTime] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [locationText, setLocationText] = useState('') // fallback for informal gatherings
  const [description, setDescription] = useState('')
  
  // Match specifics
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [evRes, fRes, oRes, tRes] = await Promise.all([
        supabase.from('events').select('*').order('date_time', { ascending: false }),
        supabase.from('fields').select('id, name'),
        supabase.from('opponents').select('id, name, home_field_id'),
        supabase.from('tournaments').select('id, name, season')
      ])

      if (evRes.data) setEvents(evRes.data as Event[])
      if (fRes.data) setFields(fRes.data)
      if (oRes.data) setOpponents(oRes.data)
      if (tRes.data) setTournaments(tRes.data)
      
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Auto-fill field based on opponent and home/away
  useEffect(() => {
    if (type === 'match' && opponentId) {
      const opp = opponents.find(o => o.id === opponentId)
      if (homeAway === 'away' && opp?.home_field_id) {
        setFieldId(opp.home_field_id)
      }
    }
  }, [opponentId, homeAway, type, opponents])

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccessMessage(null)
    try {
      const newEvent = {
        title,
        type,
        date_time: new Date(dateTime).toISOString(),
        meeting_time: meetingTime || null,
        field_id: fieldId || null,
        location: !fieldId ? locationText : null,
        description,
        is_friendly: type === 'match' ? isFriendly : false,
        tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
        opponent_id: type === 'match' ? (opponentId || null) : null,
        home_away: type === 'match' ? homeAway : null,
        created_by: profile?.id
      }

      const { error } = await supabase.from('events').insert([newEvent])
      if (error) throw error

      setSuccessMessage('Evento criado com sucesso!')
      fetchData()
      
      // Reset form
      setTitle('')
      setDateTime('')
      setMeetingTime('')
      setFieldId('')
      setLocationText('')
      setDescription('')
      setTournamentId('')
      setOpponentId('')
      setIsFriendly(false)
      setHomeAway('home')
    } catch (err) {
      console.error(err)
      alert("Erro ao criar evento. Verifique se correu a migração de SQL na consola do Supabase.")
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if(!confirm("Tem a certeza que deseja eliminar este evento?")) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id))
    }
  }

  const getFieldName = (id?: string | null) => {
    if (!id) return ''
    const f = fields.find(f => f.id === id)
    return f ? f.name : ''
  }

  const getOpponentName = (id?: string | null) => {
    if (!id) return ''
    const o = opponents.find(o => o.id === id)
    return o ? o.name : ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-csc-dark">Gestão de Eventos</h1>
        <p className="text-gray-550 mt-1">Crie jogos, treinos ou convívios associando-os aos adversários e campos criados no Backoffice.</p>
      </div>

      {successMessage && (
        <div className="bg-green-50 text-green-700 p-4 rounded-xl border border-green-150 text-sm font-semibold flex items-center gap-2">
          <Check size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6 h-fit">
          <h3 className="text-lg font-bold text-gray-805 mb-4 flex items-center gap-2 border-b pb-3">
            <Plus size={20} className="text-csc-dark" />
            <span>Criar Evento</span>
          </h3>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Evento</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white"
              >
                <option value="practice">Treino</option>
                <option value="match">Jogo</option>
                <option value="gathering">Convívio</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Título do Evento *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                placeholder={type === 'match' ? "Ex: Jornada 1" : "Ex: Treino Físico"}
              />
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

                {!isFriendly && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Torneio / Competição</label>
                    <select
                      value={tournamentId}
                      onChange={(e) => setTournamentId(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">Nenhum</option>
                      {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} ({t.season})</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Adversário</label>
                  <select
                    value={opponentId}
                    onChange={(e) => setOpponentId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Selecione...</option>
                    {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Localização Jogo</label>
                  <select
                    value={homeAway}
                    onChange={(e) => setHomeAway(e.target.value as any)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="home">Casa</option>
                    <option value="away">Fora</option>
                    <option value="neutral">Campo Neutro</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Data e Hora *</label>
                <input
                  type="datetime-local"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                />
              </div>
              <div className="w-1/3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Concentração</label>
                <input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  title="Hora de chegada ao balneário"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Campo / Estádio</label>
              <select
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white"
              >
                <option value="">Selecione um Campo da Base de Dados...</option>
                {fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            
            {!fieldId && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Outro Local (Texto livre)</label>
                <input
                  type="text"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm"
                  placeholder="Apenas preencher se não houver um campo."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observações</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
              />
            </div>

            <button type="submit" className="w-full bg-csc-dark text-white py-2.5 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow">
              Criar Evento
            </button>
          </form>
        </div>

        {/* List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-150 p-6">
            <h3 className="text-lg font-bold text-gray-805 mb-6">Lista de Eventos</h3>

            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-csc-dark"></div>
              </div>
            ) : events.length === 0 ? (
              <p className="text-gray-550 text-sm">Não há eventos registados.</p>
            ) : (
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${event.type === 'match' ? 'bg-csc-light/20 text-csc-dark' : event.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}`}>
                          {event.type === 'match' ? 'Jogo' : event.type === 'practice' ? 'Treino' : 'Convívio'}
                        </span>
                        {event.is_friendly && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-yellow-100 text-yellow-800">
                            Amigável
                          </span>
                        )}
                        {event.type === 'match' && event.home_away && (
                           <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-gray-200 text-gray-700">
                             {event.home_away === 'home' ? 'Casa' : event.home_away === 'away' ? 'Fora' : 'Neutro'}
                           </span>
                        )}
                      </div>
                      
                      <h4 className="font-bold text-gray-850 text-base">
                        {event.type === 'match' && event.opponent_id ? `CSC vs ${getOpponentName(event.opponent_id)} - ${event.title}` : event.title}
                      </h4>
                      
                      {event.description && <p className="text-xs text-gray-500">{event.description}</p>}
                      
                      <div className="flex flex-wrap gap-4 text-xs text-gray-600 mt-2">
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-gray-400" />
                          <span>
                            {new Date(event.date_time).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                            {event.meeting_time && <span className="text-csc-dark font-bold ml-1">(Conc: {event.meeting_time.substring(0, 5)})</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin size={14} className="text-gray-400" />
                          <span>{event.field_id ? getFieldName(event.field_id) : (event.location || 'Sem local')}</span>
                        </div>
                        {event.opponent_id && (
                          <div className="flex items-center gap-1">
                            <Shield size={14} className="text-gray-400" />
                            <span>Adv: {getOpponentName(event.opponent_id)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-red-400 hover:text-red-600 p-1.5 rounded-lg transition-colors"
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
