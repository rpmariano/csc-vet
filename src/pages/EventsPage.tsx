import React, { useEffect, useState } from 'react'
import { Plus, Trash2, MapPin, Clock, Check, Shield, Users, CheckCircle2, XCircle, HelpCircle, X, UserPlus, Search, RotateCcw, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../context/AuthContext'

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
  max_players?: number | null
}

interface Field { id: string; name: string }
interface Opponent { id: string; name: string; home_field_id: string | null }
interface Tournament { id: string; name: string; season: string }

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

const EventsPage: React.FC = () => {
  const { profile } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  
  // Lookups
  const [fields, setFields] = useState<Field[]>([])
  const [opponents, setOpponents] = useState<Opponent[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [allPlayers, setAllPlayers] = useState<Profile[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [eventCallups, setEventCallups] = useState<Record<string, CallupWithPlayer[]>>({})
  const [activeCallupModalEvent, setActiveCallupModalEvent] = useState<Event | null>(null)
  const [playerSearchTerm, setPlayerSearchTerm] = useState('')
  
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form states
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'practice' | 'match' | 'gathering'>('match')
  const [dateTime, setDateTime] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [fieldId, setFieldId] = useState('')
  const [locationText, setLocationText] = useState('') // fallback for informal gatherings
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState<number | ''>(16)
  
  // Match specifics
  const [isFriendly, setIsFriendly] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  const [opponentId, setOpponentId] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away' | 'neutral'>('home')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [evRes, fRes, oRes, tRes, profRes, callRes] = await Promise.all([
        supabase.from('events').select('*').order('date_time', { ascending: false }),
        supabase.from('fields').select('id, name'),
        supabase.from('opponents').select('id, name, home_field_id'),
        supabase.from('tournaments').select('id, name, season'),
        supabase.from('profiles').select('*').neq('status', 'inactive').order('name', { ascending: true }),
        supabase.from('callups').select('id, event_id, player_id, status, player:profiles(id, name, photo_url)')
      ])

      if (evRes.data) setEvents(evRes.data as Event[])
      if (fRes.data) setFields(fRes.data)
      if (oRes.data) setOpponents(oRes.data)
      if (tRes.data) setTournaments(tRes.data)
      if (profRes.data) {
        setAllPlayers(profRes.data as Profile[])
        const initialEligible = (profRes.data as Profile[]).filter(p => p.status === 'active')
        setSelectedPlayerIds(initialEligible.map(p => p.id))
      }

      if (callRes.data) {
        const map: Record<string, CallupWithPlayer[]> = {}
        callRes.data.forEach((c: any) => {
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
    fetchData()
  }, [])

  const isPlayerEligible = (player: Profile, eventType: string) => {
    if (player.status === 'inactive') return false
    if (eventType === 'gathering') return true
    return player.status === 'active'
  }

  // Ao mudar o tipo de evento, desmarca automaticamente jogadores inelegíveis (ex: lesionados em jogos/treinos)
  useEffect(() => {
    setSelectedPlayerIds(prev => prev.filter(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? isPlayerEligible(p, type) : false
    }))
  }, [type, allPlayers])

  // Auto-fill field based on opponent and home/away
  useEffect(() => {
    if (type === 'match' && opponentId) {
      const opp = opponents.find(o => o.id === opponentId)
      if (homeAway === 'away' && opp?.home_field_id) {
        setFieldId(opp.home_field_id)
      }
    }
  }, [opponentId, homeAway, type, opponents])

  const handleSelectAll = () => {
    const eligible = allPlayers.filter(p => isPlayerEligible(p, type))
    setSelectedPlayerIds(eligible.map(p => p.id))
  }
  const handleClearAll = () => setSelectedPlayerIds([])
  const handleRepeatLastCallup = () => {
    const sortedEvents = [...events].sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
    const lastEventWithCallups = sortedEvents.find(e => (eventCallups[e.id] || []).length > 0)
    
    if (lastEventWithCallups && eventCallups[lastEventWithCallups.id]) {
      const lastPlayerIds = eventCallups[lastEventWithCallups.id].map(c => c.player_id)
      const validLastIds = lastPlayerIds.filter(id => {
        const p = allPlayers.find(pl => pl.id === id)
        return p ? isPlayerEligible(p, type) : false
      })
      setSelectedPlayerIds(validLastIds)
    } else {
      alert('Ainda não existem convocatórias anteriores para repetir.')
    }
  }
  const togglePlayer = (id: string) => {
    const p = allPlayers.find(pl => pl.id === id)
    if (p && !isPlayerEligible(p, type)) {
      alert('Este jogador está lesionado e não pode ser convocado para jogos ou treinos (apenas convívios).')
      return
    }

    const willSelect = !selectedPlayerIds.includes(id)
    if (willSelect && maxPlayers !== '' && selectedPlayerIds.length >= Number(maxPlayers)) {
      if (!confirm(`⚠️ Aviso de Limite: A convocatória já atingiu o limite definido de ${maxPlayers} jogadores (${selectedPlayerIds.length} selecionados).\n\nDeseja selecionar este atleta a mais mesmo assim?`)) {
        return
      }
    }

    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id])
  }

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
        max_players: maxPlayers !== '' ? Number(maxPlayers) : null,
        is_friendly: type === 'match' ? isFriendly : false,
        tournament_id: (type === 'match' && !isFriendly) ? (tournamentId || null) : null,
        opponent_id: type === 'match' ? (opponentId || null) : null,
        home_away: type === 'match' ? homeAway : null,
        created_by: profile?.id
      }

      const { data: createdEvent, error } = await supabase
        .from('events')
        .insert([newEvent])
        .select()
        .single()

      if (error) throw error

      // Inserir convocatórias se houver atletas selecionados
      if (createdEvent && selectedPlayerIds.length > 0) {
        const rows = selectedPlayerIds.map(pId => ({
          event_id: createdEvent.id,
          player_id: pId,
          status: 'called'
        }))
        await supabase.from('callups').insert(rows)
      }

      setSuccessMessage('Evento criado e convocatória enviada com sucesso!')
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
      setMaxPlayers(16)
      setSelectedPlayerIds(allPlayers.filter(p => isPlayerEligible(p, type)).map(p => p.id))
    } catch (err: any) {
      console.error(err)
      alert("Erro ao criar evento: " + (err.message || 'Verifique a base de dados'))
    }
  }

  const handleDeleteEvent = async (id: string) => {
    if(!confirm("Tem a certeza que deseja eliminar este evento?")) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (!error) {
      setEvents(prev => prev.filter(e => e.id !== id))
    }
  }

  const handleAddPlayerToCallup = async (eventId: string, playerId: string) => {
    if (activeCallupModalEvent?.max_players) {
      const currentCallupsCount = eventCallups[eventId]?.length || 0
      if (currentCallupsCount >= activeCallupModalEvent.max_players) {
        if (!confirm(`⚠️ Aviso: Este evento tem um limite máximo de ${activeCallupModalEvent.max_players} jogadores (já tem ${currentCallupsCount} convocados).\n\nDeseja adicionar mais um atleta mesmo assim?`)) {
          return
        }
      }
    }

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
      alert('Erro ao convocar: ' + err.message)
    }
  }

  const handleRemovePlayerFromCallup = async (callupId: string, eventId: string) => {
    try {
      const { error } = await supabase.from('callups').delete().eq('id', callupId)
      if (error) throw error

      setEventCallups(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(c => c.id !== callupId)
      }))
    } catch (err: any) {
      alert('Erro ao remover: ' + err.message)
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
        <p className="text-gray-550 mt-1">Crie jogos, treinos e convoque os atletas da equipa.</p>
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
                <option value="match">Jogo</option>
                <option value="practice">Treino</option>
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
                placeholder={type === 'match' ? "Ex: Taça da Linha - Jornada 1" : "Ex: Treino Físico"}
              />
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Data e Hora *</label>
                <input
                  type="datetime-local"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Concentração</label>
                <input
                  type="time"
                  value={meetingTime}
                  onChange={(e) => setMeetingTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white"
                  title="Hora de chegada ao balneário"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nº Máx Convocados</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm bg-white"
                  placeholder="Ex: 16"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Campo / Estádio</label>
              <select
                value={fieldId}
                onChange={(e) => setFieldId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark bg-white text-sm"
              >
                <option value="">Selecione um Campo...</option>
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
                  placeholder="Apenas se não houver campo registado."
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Observações</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-csc-dark text-sm"
              />
            </div>

            {/* SELEÇÃO DE JOGADORES NA CONVOCATÓRIA */}
            <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <Users size={14} className="text-csc-dark" />
                  <span>
                    Convocatória ({selectedPlayerIds.length}{maxPlayers !== '' ? ` / ${maxPlayers} máx` : ''})
                  </span>
                </span>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={handleRepeatLastCallup}
                    className="font-bold text-csc-dark bg-white border border-gray-300 px-1.5 py-0.5 rounded text-[11px] hover:bg-gray-50 flex items-center gap-1 shadow-sm"
                    title="Repetir a última convocatória"
                  >
                    <RotateCcw size={10} /> Repetir
                  </button>
                  <button type="button" onClick={handleSelectAll} className="font-bold text-csc-dark hover:underline text-[11px]">Todos</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={handleClearAll} className="font-bold text-gray-500 hover:underline text-[11px]">Limpar</button>
                </div>
              </div>

              {/* Banner de Aviso de Limite */}
              {maxPlayers !== '' && selectedPlayerIds.length > Number(maxPlayers) && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-bold flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle size={14} className="shrink-0 text-red-600" />
                  <span>Aviso: Ultrapassou o limite definido de {maxPlayers} jogadores ({selectedPlayerIds.length} selecionados)!</span>
                </div>
              )}
              {maxPlayers !== '' && selectedPlayerIds.length === Number(maxPlayers) && (
                <div className="p-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="shrink-0 text-green-600" />
                  <span>Limite máximo de {maxPlayers} jogadores preenchido.</span>
                </div>
              )}

              {/* Barra de Pesquisa */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2 text-gray-400" />
                <input
                  type="text"
                  value={playerSearchTerm}
                  onChange={(e) => setPlayerSearchTerm(e.target.value)}
                  placeholder="Pesquisar por nome..."
                  className="w-full pl-7 pr-3 py-1 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-csc-dark"
                />
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto p-1 bg-white border border-gray-200 rounded-lg">
                {allPlayers
                  .filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase()))
                  .map(p => {
                    const isSel = selectedPlayerIds.includes(p.id)
                    const isEligible = isPlayerEligible(p, type)
                    const isInjured = p.status === 'injured'

                    return (
                      <div
                        key={p.id}
                        onClick={() => togglePlayer(p.id)}
                        className={`flex items-center justify-between p-1.5 rounded text-xs transition-colors ${
                          !isEligible 
                            ? 'bg-red-50/60 border border-red-200 text-red-700 opacity-60 cursor-not-allowed'
                            : isSel 
                              ? 'bg-csc-dark/5 font-bold text-csc-dark cursor-pointer' 
                              : 'text-gray-600 hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!isEligible}
                            onChange={() => {}}
                            className="h-3.5 w-3.5 text-csc-dark rounded border-gray-300 pointer-events-none"
                          />
                          <span className="truncate">{p.name}</span>
                        </div>
                        {isInjured && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0 ml-1">
                            {type === 'gathering' ? 'Lesionado (Pode ir)' : 'Lesionado'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                {allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchTerm.toLowerCase())).length === 0 && (
                  <div className="text-center py-2 text-xs text-gray-500">
                    Nenhum jogador com "{playerSearchTerm}".
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="w-full bg-csc-dark text-white py-3 rounded-xl font-bold hover:bg-csc-dark/80 transition-colors shadow">
              Criar Evento e Convoques
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
                {events.map((event) => {
                  const callups = eventCallups[event.id] || []
                  const confirmedCount = callups.filter(c => c.status === 'confirmed').length

                  return (
                    <div key={event.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-start hover:bg-gray-50/80 transition-colors">
                      <div className="space-y-2 flex-1 mr-4">
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

                        {/* Botão para ver Convocatória */}
                        <div className="pt-2">
                          <button
                            onClick={() => setActiveCallupModalEvent(event)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-300 rounded-lg text-xs font-bold text-csc-dark hover:bg-gray-100 shadow-sm"
                          >
                            <Users size={14} />
                            <span>Convocatória: <strong>{confirmedCount}</strong>/{callups.length} Confirmados</span>
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="text-red-400 hover:text-red-600 p-1.5 rounded-lg transition-colors shrink-0"
                        title="Eliminar evento"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Convocatória para Treinador */}
      {activeCallupModalEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 relative max-h-[90vh] overflow-y-auto shadow-2xl">
            <button
              onClick={() => setActiveCallupModalEvent(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1"
            >
              <X size={22} />
            </button>

            <h2 className="text-xl font-black text-gray-900 mb-1">
              Convocatória: {activeCallupModalEvent.title}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {new Date(activeCallupModalEvent.date_time).toLocaleString('pt-PT', { dateStyle: 'full', timeStyle: 'short' })}
            </p>

            {(() => {
              const callups = eventCallups[activeCallupModalEvent.id] || []
              const confirmedList = callups.filter(c => c.status === 'confirmed')
              const declinedList = callups.filter(c => c.status === 'declined')
              const pendingList = callups.filter(c => c.status === 'called')
              const calledPlayerIds = callups.map(c => c.player_id)
              const uncalledPlayers = allPlayers.filter(p => !calledPlayerIds.includes(p.id))

              return (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-3 gap-2">
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

                  {/* Adicionar Atleta à Convocatória */}
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                      <UserPlus size={14} />
                      <span>Convidar mais atletas:</span>
                    </p>
                    {(() => {
                      const eligibleUncalled = uncalledPlayers.filter(p => isPlayerEligible(p, activeCallupModalEvent.type))
                      if (eligibleUncalled.length === 0) {
                        return <p className="text-xs text-gray-500">Todos os atletas elegíveis já foram convocados.</p>
                      }
                      return (
                        <div className="flex flex-wrap gap-2">
                          {eligibleUncalled.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleAddPlayerToCallup(activeCallupModalEvent.id, p.id)}
                              className="bg-white border border-gray-300 hover:border-csc-dark text-xs px-2.5 py-1 rounded-lg font-semibold text-gray-700 flex items-center gap-1 shadow-sm"
                            >
                              <span>+ {p.name}</span>
                              {p.status === 'injured' && (
                                <span className="text-[9px] bg-red-100 text-red-800 px-1 rounded">Lesionado</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Listas */}
                  <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                    {/* Confirmados */}
                    <div>
                      <p className="text-xs font-bold text-green-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <CheckCircle2 size={14} /> Confirmados ({confirmedList.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {confirmedList.map(c => (
                          <div key={c.id} className="flex justify-between items-center p-2 bg-green-50 rounded-lg border border-green-200 text-xs">
                            <span className="font-bold text-gray-800">{c.player?.name || 'Jogador'}</span>
                            <button onClick={() => handleRemovePlayerFromCallup(c.id, activeCallupModalEvent.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pendentes */}
                    <div>
                      <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <HelpCircle size={14} /> Aguardam Resposta ({pendingList.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {pendingList.map(c => (
                          <div key={c.id} className="flex justify-between items-center p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs">
                            <span className="font-semibold text-gray-700">{c.player?.name || 'Jogador'}</span>
                            <button onClick={() => handleRemovePlayerFromCallup(c.id, activeCallupModalEvent.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recusados */}
                    <div>
                      <p className="text-xs font-bold text-red-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <XCircle size={14} /> Indisponíveis ({declinedList.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {declinedList.map(c => (
                          <div key={c.id} className="flex justify-between items-center p-2 bg-red-50 rounded-lg border border-red-200 text-xs">
                            <span className="font-semibold text-gray-500 line-through">{c.player?.name || 'Jogador'}</span>
                            <button onClick={() => handleRemovePlayerFromCallup(c.id, activeCallupModalEvent.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

          </div>
        </div>
      )}
    </div>
  )
}

export default EventsPage
