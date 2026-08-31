import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Trophy, Trash2, Shield, Plus, X } from 'lucide-react'
import { toast } from '../context/ToastContext'
import { ConfirmModal } from './ConfirmModal'

interface LeagueManagerProps {
  tournamentId: string
  onClose: () => void
}

export const LeagueManager: React.FC<LeagueManagerProps> = ({ tournamentId, onClose }) => {
  const [tournament, setTournament] = useState<any>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [matches, setMatches] = useState<any[]>([])
  const [opponents, setOpponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroupForTeam, setSelectedGroupForTeam] = useState<string>('')
  const [selectedOpponentToAdd, setSelectedOpponentToAdd] = useState<string>('')

  const [activeTab, setActiveTab] = useState<'groups'|'matches'>('groups')

  // External Match form
  const [newMatchGroup, setNewMatchGroup] = useState<string>('')
  const [newMatchday, setNewMatchday] = useState<string>('1')
  const [newHomeTeam, setNewHomeTeam] = useState<string>('')
  const [newAwayTeam, setNewAwayTeam] = useState<string>('')
  const [newHomeScore, setNewHomeScore] = useState<string>('0')
  const [newAwayScore, setNewAwayScore] = useState<string>('0')

  // New Group modal
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupPhase, setNewGroupPhase] = useState('1')

  // Modal genérico de confirmação — substitui os confirm() nativos do browser
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean
    title: string
    description?: string
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  })
  const closeConfirmModal = () => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))

  useEffect(() => {
    fetchData()
  }, [tournamentId])

  const fetchData = async () => {
    setLoading(true)
    const [tourRes, groupsRes, teamsRes, matchesRes, oppsRes] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
      supabase.from('tournament_groups').select('*').eq('tournament_id', tournamentId).order('name'),
      supabase.from('tournament_teams').select('*, opponent:opponents(*)').eq('tournament_id', tournamentId),
      supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('matchday'),
      supabase.from('opponents').select('*').order('name')
    ])

    if (tourRes.data) setTournament(tourRes.data)
    if (groupsRes.data) setGroups(groupsRes.data)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (matchesRes.data) setMatches(matchesRes.data)
    if (oppsRes.data) setOpponents(oppsRes.data)
    
    setLoading(false)
  }

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return
    const phase = parseInt(newGroupPhase) || 1
    await supabase.from('tournament_groups').insert([{ tournament_id: tournamentId, name: newGroupName.trim(), phase }])
    setNewGroupName('')
    setNewGroupPhase('1')
    setIsNewGroupModalOpen(false)
    fetchData()
  }

  const handleAddTeamToGroup = async () => {
    if (!selectedGroupForTeam || !selectedOpponentToAdd) return
    
    // selectedOpponentToAdd = 'csc' for Cascais, otherwise UUID
    const opponent_id = selectedOpponentToAdd === 'csc' ? null : selectedOpponentToAdd

    // Check if team already exists in any group for this tournament
    const existing = teams.find(t => t.opponent_id === opponent_id)
    if (existing) {
      toast.warning('Esta equipa já está associada a um grupo neste torneio.')
      return
    }

    await supabase.from('tournament_teams').insert([{
      tournament_id: tournamentId,
      group_id: selectedGroupForTeam,
      opponent_id
    }])
    
    setSelectedGroupForTeam('')
    setSelectedOpponentToAdd('')
    fetchData()
  }

  const handleRemoveTeam = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Remover Equipa do Grupo',
      description: 'Esta equipa deixa de fazer parte do grupo. Os resultados já registados não são apagados.',
      onConfirm: async () => {
        closeConfirmModal()
        await supabase.from('tournament_teams').delete().eq('id', id)
        fetchData()
      }
    })
  }

  const handleAddMatch = async () => {
    if (!newMatchGroup || !newHomeTeam || !newAwayTeam) return
    if (newHomeTeam === newAwayTeam) {
      toast.warning('Uma equipa não pode jogar contra si mesma!')
      return
    }

    await supabase.from('tournament_matches').insert([{
      tournament_id: tournamentId,
      group_id: newMatchGroup,
      matchday: parseInt(newMatchday),
      home_team_id: newHomeTeam,
      away_team_id: newAwayTeam,
      home_score: parseInt(newHomeScore),
      away_score: parseInt(newAwayScore),
      status: 'finished'
    }])

    // Reset some fields
    setNewHomeTeam('')
    setNewAwayTeam('')
    setNewHomeScore('0')
    setNewAwayScore('0')
    fetchData()
  }

  const handleRemoveMatch = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Apagar Resultado',
      description: 'Este resultado é apagado e deixa de contar para a classificação do grupo.',
      onConfirm: async () => {
        closeConfirmModal()
        await supabase.from('tournament_matches').delete().eq('id', id)
        fetchData()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between bg-gradient-to-r from-gray-50 to-white gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-csc-dark/10 text-csc-dark flex items-center justify-center">
              <Trophy size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900 leading-tight">
                Gestão da Liga
              </h2>
              <p className="text-sm font-bold text-gray-500">{tournament?.name} {tournament?.season}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab('groups')} 
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${activeTab === 'groups' ? 'bg-white shadow-xs text-csc-dark' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Grupos
              </button>
              <button 
                onClick={() => setActiveTab('matches')} 
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${activeTab === 'matches' ? 'bg-white shadow-xs text-csc-dark' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Resultados
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50">
          {loading ? (
            <div className="text-center py-10 text-gray-500 font-bold">A carregar...</div>
          ) : (
            <>
              {activeTab === 'groups' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                      <Shield size={18} className="text-blue-500" />
                      Grupos e Equipas
                    </h3>
                    <button onClick={() => setIsNewGroupModalOpen(true)} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200 transition-colors cursor-pointer">
                      + Novo Grupo
                    </button>
                  </div>

                  {/* Add Team UI */}
                  {groups.length > 0 && (
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Grupo</label>
                        <select 
                          value={selectedGroupForTeam} 
                          onChange={e => setSelectedGroupForTeam(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="">Selecione o Grupo</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name} (Fase {g.phase})</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-gray-600 mb-1">Equipa</label>
                        <select 
                          value={selectedOpponentToAdd} 
                          onChange={e => setSelectedOpponentToAdd(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="">Selecione a Equipa</option>
                          <option value="csc">🛡️ GDS Cascais (Nós)</option>
                          {opponents.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={handleAddTeamToGroup}
                        disabled={!selectedGroupForTeam || !selectedOpponentToAdd}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                      >
                        Adicionar Equipa
                      </button>
                    </div>
                  )}

                  {groups.length === 0 ? (
                    <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
                      Nenhum grupo configurado. Cria o "Grupo Único" ou "Grupo A", "Grupo B".
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groups.map(g => (
                        <div key={g.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                          <h4 className="font-black text-gray-900 mb-3">{g.name} <span className="text-xs text-gray-400 font-medium">(Fase {g.phase})</span></h4>
                          <div className="space-y-2">
                            {teams.filter(t => t.group_id === g.id).map(t => (
                              <div key={t.id} className="text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 flex justify-between items-center">
                                <span className="flex items-center gap-2">
                                  {t.opponent_id ? (
                                    <>
                                      {t.opponent?.logo_url ? <img src={t.opponent.logo_url} alt="" className="w-5 h-5 rounded-full object-cover" /> : <Shield size={16} className="text-gray-400" />}
                                      {t.opponent?.name}
                                    </>
                                  ) : (
                                    <>
                                      <Shield size={16} className="text-blue-500" />
                                      <span className="font-bold text-blue-800">GDS Cascais</span>
                                    </>
                                  )}
                                </span>
                                <button onClick={() => handleRemoveTeam(t.id)} className="text-red-500 hover:bg-red-50 p-1 rounded cursor-pointer">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            {teams.filter(t => t.group_id === g.id).length === 0 && (
                              <div className="text-xs text-gray-400 italic">Sem equipas neste grupo.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'matches' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">Resultados Externos</h3>
                      <p className="text-xs text-gray-500 font-medium mt-1">Lança aqui os resultados dos jogos onde o Cascais não interveio.</p>
                    </div>
                  </div>

                  {groups.length === 0 ? (
                    <div className="text-center py-6 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm">
                      Cria primeiro os grupos e associa as equipas.
                    </div>
                  ) : (
                    <>
                      {/* ADD MATCH FORM */}
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <h4 className="font-bold text-gray-800 mb-3 text-sm flex items-center gap-2">
                          <Plus size={16} className="text-blue-500" />
                          Lançar Novo Resultado
                        </h4>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
                          <div className="col-span-2 sm:col-span-2">
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Grupo</label>
                            <select 
                              value={newMatchGroup} 
                              onChange={e => {
                                setNewMatchGroup(e.target.value)
                                setNewHomeTeam('')
                                setNewAwayTeam('')
                              }}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold"
                            >
                              <option value="">Selecione o Grupo</option>
                              {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="col-span-1 sm:col-span-1">
                            <label className="block text-[11px] font-bold text-gray-600 mb-1">Jornada</label>
                            <input 
                              type="number" min="1"
                              value={newMatchday}
                              onChange={e => setNewMatchday(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-center font-bold"
                            />
                          </div>
                        </div>

                        {newMatchGroup && (
                          <div className="flex flex-col sm:flex-row items-center gap-3">
                            <div className="flex-1 w-full">
                              <label className="block text-[11px] font-bold text-gray-600 mb-1">Equipa Casa</label>
                              <select 
                                value={newHomeTeam} 
                                onChange={e => setNewHomeTeam(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold"
                              >
                                <option value="">Selecione...</option>
                                {teams.filter(t => t.group_id === newMatchGroup).map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.opponent_id ? t.opponent?.name : 'GDS Cascais'}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="w-16">
                              <label className="block text-[11px] font-bold text-gray-600 mb-1 text-center">Golos</label>
                              <input 
                                type="number" min="0"
                                value={newHomeScore}
                                onChange={e => setNewHomeScore(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-lg text-center font-black"
                              />
                            </div>

                            <div className="text-gray-400 font-black px-2 mt-4">x</div>

                            <div className="w-16">
                              <label className="block text-[11px] font-bold text-gray-600 mb-1 text-center">Golos</label>
                              <input 
                                type="number" min="0"
                                value={newAwayScore}
                                onChange={e => setNewAwayScore(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-lg text-center font-black"
                              />
                            </div>

                            <div className="flex-1 w-full">
                              <label className="block text-[11px] font-bold text-gray-600 mb-1">Equipa Fora</label>
                              <select 
                                value={newAwayTeam} 
                                onChange={e => setNewAwayTeam(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-semibold"
                              >
                                <option value="">Selecione...</option>
                                {teams.filter(t => t.group_id === newMatchGroup).map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.opponent_id ? t.opponent?.name : 'GDS Cascais'}
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div className="mt-5 w-full sm:w-auto">
                              <button 
                                onClick={handleAddMatch}
                                disabled={!newHomeTeam || !newAwayTeam}
                                className="w-full px-5 py-3 sm:py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                              >
                                Guardar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* MATCHES LIST */}
                      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                          <h4 className="font-bold text-gray-800 text-sm">Histórico de Resultados</h4>
                        </div>
                        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                          {matches.length === 0 ? (
                            <p className="text-xs text-gray-500 italic text-center py-4">Nenhum resultado registado.</p>
                          ) : (
                            matches.map((m: any) => {
                              const homeTeam = teams.find(t => t.id === m.home_team_id)
                              const awayTeam = teams.find(t => t.id === m.away_team_id)
                              const group = groups.find(g => g.id === m.group_id)
                              
                              const homeName = homeTeam?.opponent_id ? homeTeam.opponent?.name : 'GDS Cascais'
                              const awayName = awayTeam?.opponent_id ? awayTeam.opponent?.name : 'GDS Cascais'

                              return (
                                <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors gap-2">
                                  <div className="flex items-center gap-3 w-full sm:w-auto">
                                    <div className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-black rounded-md shrink-0">
                                      J{m.matchday}
                                    </div>
                                    <div className="text-xs text-gray-500 font-bold w-20 truncate" title={group?.name}>
                                      {group?.name}
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1 flex items-center justify-center gap-3 min-w-[200px]">
                                    <div className="flex-1 text-right text-sm font-bold text-gray-800 truncate">{homeName}</div>
                                    <div className="px-3 py-1 bg-gray-900 text-white font-black text-sm rounded-lg shrink-0">
                                      {m.home_score} - {m.away_score}
                                    </div>
                                    <div className="flex-1 text-left text-sm font-bold text-gray-800 truncate">{awayName}</div>
                                  </div>

                                  <button onClick={() => handleRemoveMatch(m.id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0 self-end sm:self-auto">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODAL: Criar Novo Grupo */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-modal-top flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-csc-dark text-white">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-csc-gold" />
                <h3 className="font-black text-sm">Novo Grupo</h3>
              </div>
              <button onClick={() => setIsNewGroupModalOpen(false)} aria-label="Fechar" className="p-1 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nome do Grupo *</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  placeholder="Ex: Grupo A, Apuramento Campeão"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-csc-dark outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Fase</label>
                <select
                  value={newGroupPhase}
                  onChange={e => setNewGroupPhase(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold focus:bg-white focus:ring-2 focus:ring-csc-dark outline-none"
                >
                  <option value="1">Fase 1 (Fase Inicial)</option>
                  <option value="2">Fase 2 (Fase Final)</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setIsNewGroupModalOpen(false)}
                  className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                  className="px-4 py-2 text-sm font-bold text-white bg-csc-dark rounded-xl hover:bg-csc-dark/90 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Criar Grupo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  )
}
