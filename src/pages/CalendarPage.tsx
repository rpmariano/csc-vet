import React, { useEffect, useState } from 'react'
import { MapPin, Clock, Plus, X, Award, Users, CheckCircle2, XCircle, HelpCircle, UserPlus, Trash2, Search, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'

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

interface CallupWithPlayer {
  id: string
  event_id: string
  player_id: string
  status: 'called' | 'confirmed' | 'declined'
  player: {
    id: string
    name: string
    photo_url: string | null
  }
}

const CalendarPage: React.FC = () => {
  const { profile } = useAuth()
  const { clubSettings } = useClub()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Callups state
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [managingCallupsInModal, setManagingCallupsInModal] = useState(false)
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('match')
  const [dateTime, setDateTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentName, setTournamentName] = useState('')

  const fetchEventsAndData = async () => {
    setLoading(true)
    try {
      const [evRes, callupsRes, profilesRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, opponent:opponents(name, initials, logo_url)')
          .order('date_time', { ascending: true }),
        supabase
          .from('callups')
          .select('id, event_id, player_id, status, player:profiles(id, name, photo_url)'),
        supabase
          .from('profiles')
          .select('*')
          .eq('status', 'active')
          .order('name', { ascending: true })
      ])

      if (evRes.data && evRes.data.length > 0) {
        setEvents(evRes.data as Event[])
      } else {
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
          }
        ])
      }

      if (profilesRes.data) {
        setAllPlayers(profilesRes.data as Profile[])
      }

      if (callupsRes.data) {
        const map: Record<string, CallupWithPlayer[]> = {}
        callupsRes.data.forEach((c: any) => {
          if (!map[c.event_id]) map[c.event_id] = []
          map[c.event_id].push(c as CallupWithPlayer)
        })
        setEventCallups(map)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEventsAndData()
  }, [])

  const isCoachOrAdmin = profile && ['coach', 'admin'].includes(profile.role)

  const handleSelectAllPlayers = () => {
    setSelectedPlayerIds(allPlayers.map(p => p.id))
  }

  const handleClearPlayers = () => {
    setSelectedPlayerIds([])
  }

  const handleRepeatLastCallup = () => {
    const sortedEvents = [...events].sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
    const lastEventWithCallups = sortedEvents.find(e => (eventCallups[e.id] || []).length > 0)
    
    if (lastEventWithCallups && eventCallups[lastEventWithCallups.id]) {
      const lastPlayerIds = eventCallups[lastEventWithCallups.id].map(c => c.player_id)
      setSelectedPlayerIds(lastPlayerIds)
    } else {
      alert('Ainda não existem convocatórias anteriores para repetir.')
    }
  }

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    )
  }

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

      const { data: createdEvent, error } = await supabase
        .from('events')
        .insert([newEvent])
        .select()
        .single()

      if (error) throw error

      // Se houver jogadores selecionados, criar convocatórias
      if (createdEvent && selectedPlayerIds.length > 0) {
        const callupRows = selectedPlayerIds.map(playerId => ({
          event_id: createdEvent.id,
          player_id: playerId,
          status: 'called'
        }))
        await supabase.from('callups').insert(callupRows)
      }

      fetchEventsAndData()
      setIsAddModalOpen(false)
      // Reset form
      setTitle('')
      setLocation('')
      setDescription('')
      setDateTime('')
      setTournamentName('')
      setIsFriendly(false)
      setSelectedPlayerIds([])
    } catch (err: any) {
      alert('Erro ao guardar o evento: ' + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleCallupResponse = async (eventId: string, status: 'confirmed' | 'declined') => {
    if (!profile) return
    try {
      const existingCallup = eventCallups[eventId]?.find(c => c.player_id === profile.id)
      
      if (existingCallup) {
        await supabase.from('callups').update({ status }).eq('id', existingCallup.id)
      } else {
        // Se ainda não existia linha para o atleta, insere
        await supabase.from('callups').insert([{
          event_id: eventId,
          player_id: profile.id,
          status
        }])
      }

      // Atualiza estado local imediatamente
      setEventCallups(prev => {
        const list = prev[eventId] ? [...prev[eventId]] : []
        const index = list.findIndex(c => c.player_id === profile.id)
        if (index >= 0) {
          list[index] = { ...list[index], status }
        } else {
          list.push({
            id: Math.random().toString(),
            event_id: eventId,
            player_id: profile.id,
            status,
            player: {
              id: profile.id,
              name: profile.name,
              photo_url: profile.photo_url || null
            }
          })
        }
        return { ...prev, [eventId]: list }
      })
    } catch (err: any) {
      alert('Erro ao atualizar resposta: ' + err.message)
    }
  }

  // Treinador adiciona jogador a um evento existente no modal
  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    try {
      const { data, error } = await supabase.from('callups').insert([{
        event_id: eventId,
        player_id: playerId,
        status: 'called'
      }]).select('id, event_id, player_id, status, player:profiles(id, name, photo_url)').single()

      if (error) throw error

      if (data) {
        setEventCallups(prev => ({
          ...prev,
          [eventId]: [...(prev[eventId] || []), data as unknown as CallupWithPlayer]
        }))
      }
    } catch (err: any) {
      alert('Erro ao adicionar jogador: ' + err.message)
    }
  }

  // Treinador remove jogador de uma convocatória existente
  const handleRemovePlayerFromCallup = async (callupId: string, eventId: string) => {
    try {
      const { error } = await supabase.from('callups').delete().eq('id', callupId)
      if (error) throw error

      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(c => c.id !== callupId)
      }))
    } catch (err: any) {
      alert('Erro ao remover jogador: ' + err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-csc-dark">Calendário de Eventos</h1>
          <p className="text-gray-500 mt-1">Consulte os treinos, jogos e responda às convocatórias.</p>
        </div>

        {isCoachOrAdmin && (
          <button
            onClick={() => {
              setSelectedPlayerIds(allPlayers.map(p => p.id)) // Pre-seleciona todos por padrão
              setIsAddModalOpen(true)
            }}
            className="flex items-center space-x-2 bg-csc-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-csc-dark/80 transition-colors shadow"
          >
            <Plus size={18} />
            <span>Criar Jogo / Treino</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => {
            const callups = eventCallups[event.id] || []
            const myCallup = profile ? callups.find(c => c.player_id === profile.id) : null
            const confirmedCount = callups.filter(c => c.status === 'confirmed').length

            return (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="bg-white rounded-xl shadow-sm border border-gray-150 p-5 hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`
                      text-[11px] font-bold px-2.5 py-0.5 rounded uppercase tracking-wider
                      ${event.type === 'match' ? 'bg-csc-light/20 text-csc-dark' : event.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}
                    `}>
                      {event.type === 'match' ? 'Jogo' : event.type === 'practice' ? 'Treino' : 'Convívio'}
                    </span>

                    {callups.length > 0 && (
                      <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
                        <Users size={12} className="text-csc-dark" />
                        <span><strong>{confirmedCount}</strong>/{callups.length} conf.</span>
                      </span>
                    )}
                  </div>
                  
                  {event.type === 'match' && event.opponent ? (
                    <div className="flex items-center gap-4 mb-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      <div className="flex flex-col items-center gap-1 w-12">
                        {clubSettings?.logo_url ? (
                          <img src={clubSettings.logo_url} alt="Nós" className="w-10 h-10 object-contain" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">{clubSettings?.initials || 'CSC'}</div>
                        )}
                        <span className="text-[10px] font-bold text-gray-700">{clubSettings?.initials || 'CSC'}</span>
                      </div>
                      <span className="text-gray-400 font-black text-xs">VS</span>
                      <div className="flex flex-col items-center gap-1 w-12">
                        {event.opponent.logo_url ? (
                          <img src={event.opponent.logo_url} alt="Adv" className="w-10 h-10 object-contain" />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-xs font-bold">{event.opponent.initials || 'ADV'}</div>
                        )}
                        <span className="text-[10px] font-bold text-gray-700 line-clamp-1">{event.opponent.initials || event.opponent.name}</span>
                      </div>
                    </div>
                  ) : null}

                  <h3 className="text-lg font-bold text-gray-850">{event.title}</h3>
                  {event.description && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{event.description}</p>}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <div className="flex items-center space-x-1.5">
                      <Clock size={13} className="text-gray-400" />
                      <span>
                        {new Date(event.date_time).toLocaleDateString('pt-PT', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 max-w-[50%] truncate">
                      <MapPin size={13} className="text-gray-400 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  </div>

                  {/* Ação rápida para o jogador se for convocado */}
                  {myCallup && (
                    <div 
                      onClick={(e) => e.stopPropagation()} 
                      className="pt-2 border-t border-gray-100 flex items-center justify-between"
                    >
                      <span className="text-[11px] font-semibold text-gray-600">A tua presença:</span>
                      {myCallup.status === 'called' ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleCallupResponse(event.id, 'confirmed')}
                            className="bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold px-2.5 py-1 rounded transition-colors shadow-sm"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => handleCallupResponse(event.id, 'declined')}
                            className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-2.5 py-1 rounded transition-colors shadow-sm"
                          >
                            Recusar
                          </button>
                        </div>
                      ) : (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                          myCallup.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {myCallup.status === 'confirmed' ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
                          {myCallup.status === 'confirmed' ? 'Confirmado' : 'Recusado'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Detalhes Evento & Convocatória */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => {
                setSelectedEvent(null)
                setManagingCallupsInModal(false)
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
            >
              <X size={22} />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className={`
                text-xs font-bold px-2.5 py-0.5 rounded uppercase tracking-wider
                ${selectedEvent.type === 'match' ? 'bg-csc-light/20 text-csc-dark' : selectedEvent.type === 'practice' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'}
              `}>
                {selectedEvent.type === 'match' ? 'Jogo' : selectedEvent.type === 'practice' ? 'Treino' : 'Convívio'}
              </span>

              {selectedEvent.tournament_name && (
                <span className="flex items-center space-x-1 text-xs text-csc-dark bg-gray-100 px-2 py-0.5 rounded font-medium">
                  <Award size={13} />
                  <span>{selectedEvent.tournament_name} {selectedEvent.is_friendly ? '(Amigável)' : ''}</span>
                </span>
              )}
            </div>

            <h2 className="text-2xl font-extrabold text-gray-900 mt-1">{selectedEvent.title}</h2>
            {selectedEvent.description && (
              <p className="text-gray-600 text-sm mt-2 leading-relaxed">{selectedEvent.description}</p>
            )}

            {/* Info Box */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
              <div className="flex items-center text-sm text-gray-700 space-x-2.5">
                <Clock size={18} className="text-csc-dark shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500">Data e Hora</p>
                  <p className="font-bold text-sm text-gray-850">
                    {new Date(selectedEvent.date_time).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-700 space-x-2.5">
                <MapPin size={18} className="text-csc-dark shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-gray-500">Local</p>
                  <p className="font-bold text-sm text-gray-850">{selectedEvent.location}</p>
                </div>
              </div>
            </div>

            {/* SECÇÃO CONVOCATÓRIA */}
            {(() => {
              const callups = eventCallups[selectedEvent.id] || []
              const myCallup = profile ? callups.find(c => c.player_id === profile.id) : null
              const confirmedList = callups.filter(c => c.status === 'confirmed')
              const declinedList = callups.filter(c => c.status === 'declined')
              const pendingList = callups.filter(c => c.status === 'called')
              const calledPlayerIds = callups.map(c => c.player_id)
              const uncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id))

              return (
                <div className="mt-6 pt-5 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                      <Users size={20} className="text-csc-dark" />
                      <span>Convocatória ({callups.length})</span>
                    </h3>

                    {isCoachOrAdmin && (
                      <button
                        onClick={() => setManagingCallupsInModal(!managingCallupsInModal)}
                        className="text-xs font-bold text-csc-dark hover:underline flex items-center gap-1"
                      >
                        <UserPlus size={14} />
                        {managingCallupsInModal ? 'Fechar Gestão' : 'Gerir Convocados'}
                      </button>
                    )}
                  </div>

                  {/* Painel do Atleta Atual */}
                  {myCallup && (
                    <div className="mb-5 p-4 bg-gray-100 rounded-xl border border-gray-300 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-600">A tua convocatória</p>
                        <p className="text-sm font-extrabold text-gray-850">
                          Estado atual: <span className={
                            myCallup.status === 'confirmed' ? 'text-green-700' :
                            myCallup.status === 'declined' ? 'text-red-700' : 'text-amber-700'
                          }>
                            {myCallup.status === 'confirmed' ? 'Confirmaste presença' :
                             myCallup.status === 'declined' ? 'Recusaste presença' : 'Ainda não respondeste'}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handleCallupResponse(selectedEvent.id, 'confirmed')}
                          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                            myCallup.status === 'confirmed' ? 'bg-green-700 text-white shadow' : 'bg-white border border-green-600 text-green-700 hover:bg-green-50'
                          }`}
                        >
                          <CheckCircle2 size={16} /> Confirmar
                        </button>
                        <button
                          onClick={() => handleCallupResponse(selectedEvent.id, 'declined')}
                          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg font-bold text-xs transition-colors flex items-center justify-center gap-1.5 ${
                            myCallup.status === 'declined' ? 'bg-red-700 text-white shadow' : 'bg-white border border-red-600 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          <XCircle size={16} /> Recusar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Gestão do Treinador para Adicionar Atletas */}
                  {managingCallupsInModal && (
                    <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-xl space-y-3">
                      <p className="text-xs font-bold text-yellow-800 uppercase">Adicionar atletas à convocatória</p>
                      {uncalledPlayers.length === 0 ? (
                        <p className="text-xs text-gray-600">Todos os atletas ativos já foram convocados.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 divide-y divide-yellow-100">
                          {uncalledPlayers.map(p => (
                            <div key={p.id} className="flex justify-between items-center pt-1.5">
                              <span className="text-xs font-bold text-gray-800">{p.name}</span>
                              <button
                                onClick={() => handleAddPlayerToCallup(selectedEvent.id, p.id)}
                                className="bg-csc-dark text-white text-[10px] font-bold px-2 py-1 rounded hover:bg-csc-dark/80"
                              >
                                + Convocar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Resumo de Quórum */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-2.5 text-center">
                      <p className="text-xl font-black text-green-700">{confirmedList.length}</p>
                      <p className="text-[11px] font-bold text-green-800">Confirmados</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center">
                      <p className="text-xl font-black text-amber-700">{pendingList.length}</p>
                      <p className="text-[11px] font-bold text-amber-800">Pendentes</p>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center">
                      <p className="text-xl font-black text-red-700">{declinedList.length}</p>
                      <p className="text-[11px] font-bold text-red-800">Recusados</p>
                    </div>
                  </div>

                  {/* Lista de Convocados */}
                  {callups.length === 0 ? (
                    <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                      <Users size={32} className="mx-auto text-gray-400 mb-1" />
                      <p className="text-xs font-bold text-gray-600">Nenhum jogador convocado ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                      
                      {/* Confirmados */}
                      {confirmedList.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-green-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <CheckCircle2 size={13} /> Confirmados ({confirmedList.length})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {confirmedList.map(c => (
                              <div key={c.id} className="flex items-center justify-between p-2 bg-green-50/60 rounded-lg border border-green-200 text-xs">
                                <span className="font-bold text-gray-800 truncate">{c.player?.name || 'Jogador'}</span>
                                {isCoachOrAdmin && (
                                  <button onClick={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)} className="text-red-400 hover:text-red-600 ml-2" title="Remover da convocatória">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pendentes */}
                      {pendingList.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <HelpCircle size={13} /> Aguardam Resposta ({pendingList.length})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {pendingList.map(c => (
                              <div key={c.id} className="flex items-center justify-between p-2 bg-amber-50/60 rounded-lg border border-amber-200 text-xs">
                                <span className="font-semibold text-gray-700 truncate">{c.player?.name || 'Jogador'}</span>
                                {isCoachOrAdmin && (
                                  <button onClick={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)} className="text-red-400 hover:text-red-600 ml-2" title="Remover da convocatória">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recusados */}
                      {declinedList.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-red-800 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <XCircle size={13} /> Recusados / Indisponíveis ({declinedList.length})
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {declinedList.map(c => (
                              <div key={c.id} className="flex items-center justify-between p-2 bg-red-50/60 rounded-lg border border-red-200 text-xs">
                                <span className="font-semibold text-gray-500 line-through truncate">{c.player?.name || 'Jogador'}</span>
                                {isCoachOrAdmin && (
                                  <button onClick={() => handleRemovePlayerFromCallup(c.id, selectedEvent.id)} className="text-red-400 hover:text-red-600 ml-2" title="Remover da convocatória">
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )
            })()}

          </div>
        </div>
      )}

      {/* Modal Criar Evento com Seleção de Convocatória */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
            >
              <X size={22} />
            </button>
            <h2 className="text-2xl font-extrabold text-csc-dark mb-6">Criar Novo Evento</h2>
            
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Título do Evento *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark"
                  placeholder={type === 'match' ? "Ex: Taça da Linha - Jornada 1" : "Ex: Treino de Quinta"}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Evento</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white"
                >
                  <option value="match">Jogo</option>
                  <option value="practice">Treino</option>
                  <option value="gathering">Convívio</option>
                </select>
              </div>

              {type === 'match' && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isFriendly"
                      checked={isFriendly}
                      onChange={(e) => setIsFriendly(e.target.checked)}
                      className="h-4 w-4 text-csc-dark focus:ring-csc-dark border-gray-300 rounded"
                    />
                    <label htmlFor="isFriendly" className="ml-2 text-sm font-semibold text-gray-700">
                      Jogo Amigável
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Nome do Torneio / Liga</label>
                    <input
                      type="text"
                      value={tournamentName}
                      onChange={(e) => setTournamentName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                      placeholder="Ex: Liga de Veteranos"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Data e Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Localização *</label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm"
                    placeholder="Ex: Campo Sintético"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Descrição / Instruções</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm"
                  placeholder="Horário de chegada, equipamento a levar..."
                />
              </div>

              {/* SELEÇÃO DE JOGADORES (CONVOCATÓRIA) */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                      <Users size={16} className="text-csc-dark" />
                      <span>Convocatória Inicial ({selectedPlayerIds.length} selecionados)</span>
                    </label>
                    <p className="text-[11px] text-gray-500">Selecione os atletas a convocar para este jogo/treino.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleRepeatLastCallup}
                      className="font-bold text-csc-dark bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50 flex items-center gap-1 shadow-sm"
                      title="Repetir a lista de convocados do jogo anterior"
                    >
                      <RotateCcw size={12} /> Repetir Última
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllPlayers}
                      className="font-bold text-csc-dark hover:underline"
                    >
                      Todos
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearPlayers}
                      className="font-bold text-gray-500 hover:underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Barra de Pesquisa de Jogadores */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={playerSearchTerm}
                    onChange={(e) => setPlayerSearchTerm(e.target.value)}
                    placeholder="Pesquisar jogador por nome..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-csc-dark"
                  />
                  {playerSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearchTerm('')}
                      className="absolute right-2.5 top-2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1 bg-white border border-gray-200 rounded-lg">
                  {allPlayers
                    .filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase()))
                    .map(p => {
                      const isSelected = selectedPlayerIds.includes(p.id)
                      return (
                        <div
                          key={p.id}
                          onClick={() => togglePlayerSelection(p.id)}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-xs border transition-colors ${
                            isSelected ? 'bg-csc-dark/5 border-csc-dark font-bold text-csc-dark' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // controlado pelo onClick pai
                            className="h-3.5 w-3.5 text-csc-dark rounded border-gray-300 focus:ring-0 pointer-events-none"
                          />
                          <span className="truncate">{p.name}</span>
                        </div>
                      )
                    })}
                  {allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase())).length === 0 && (
                    <div className="col-span-2 text-center py-3 text-xs text-gray-500">
                      Nenhum jogador encontrado com "{playerSearchTerm}".
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-csc-dark text-white py-3 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow-md mt-4 text-sm"
              >
                Criar Evento e Enviar Convocatória
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalendarPage
