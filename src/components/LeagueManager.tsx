import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Trophy, Trash2, Shield, Plus, X, Users } from 'lucide-react'
import { toast } from '../context/ToastContext'
import { ConfirmModal } from './ConfirmModal'

interface LeagueManagerProps {
  tournamentId: string
  onClose: () => void
}

// Gestão de Grupos e Equipas de um torneio. A introdução de jornadas e
// resultados passou para a Classificação (StandingsPage) — faz mais sentido
// ficar junto da tabela que esses resultados alimentam, em vez de aqui.
export const LeagueManager: React.FC<LeagueManagerProps> = ({ tournamentId, onClose }) => {
  const [tournament, setTournament] = useState<any>(null)
  const [groups, setGroups] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [opponents, setOpponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroupForTeam, setSelectedGroupForTeam] = useState<string>('')
  const [selectedOpponentToAdd, setSelectedOpponentToAdd] = useState<string>('')

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
    const [tourRes, groupsRes, teamsRes, oppsRes] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
      supabase.from('tournament_groups').select('*').eq('tournament_id', tournamentId).order('name'),
      supabase.from('tournament_teams').select('*, opponent:opponents(*)').eq('tournament_id', tournamentId),
      supabase.from('opponents').select('*').order('name')
    ])

    if (tourRes.data) setTournament(tourRes.data)
    if (groupsRes.data) setGroups(groupsRes.data)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (oppsRes.data) setOpponents(oppsRes.data)

    const firstError = tourRes.error || groupsRes.error || teamsRes.error || oppsRes.error
    if (firstError) {
      toast.error('Erro ao carregar dados da liga: ' + firstError.message)
    }

    setLoading(false)
  }

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return
    const phase = parseInt(newGroupPhase) || 1
    const { error } = await supabase.from('tournament_groups').insert([{ tournament_id: tournamentId, name: newGroupName.trim(), phase }])
    if (error) {
      toast.error('Não foi possível criar o grupo: ' + error.message)
      return
    }
    toast.success('Grupo criado com sucesso!')
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

    const { error } = await supabase.from('tournament_teams').insert([{
      tournament_id: tournamentId,
      group_id: selectedGroupForTeam,
      opponent_id
    }])

    if (error) {
      toast.error('Não foi possível adicionar a equipa: ' + error.message)
      return
    }

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
        const { error } = await supabase.from('tournament_teams').delete().eq('id', id)
        if (error) {
          toast.error('Não foi possível remover a equipa: ' + error.message)
          return
        }
        fetchData()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between bg-gradient-to-r from-gray-50 to-white gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-csc-dark/10 text-csc-dark flex items-center justify-center overflow-hidden shrink-0">
              {tournament?.image_url ? (
                <img src={tournament.image_url} alt="" className="w-full h-full object-contain" />
              ) : (
                <Trophy size={20} />
              )}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-gray-900 leading-tight">
                Grupos e Equipas
              </h2>
              <p className="text-sm font-bold text-gray-500">{tournament?.name} {tournament?.season}</p>
              {tournament?.organizer_name && (
                <p className="text-xs font-semibold text-gray-400">Organização: {tournament.organizer_name}</p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0 self-end sm:self-auto"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50">
          {loading ? (
            <div className="text-center py-10 text-gray-500 font-bold">A carregar...</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                  <Users size={18} className="text-blue-500" />
                  Grupos e Equipas
                </h3>
                <button onClick={() => setIsNewGroupModalOpen(true)} className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold hover:bg-blue-200 transition-colors cursor-pointer">
                  + Novo Grupo
                </button>
              </div>

              <p className="text-xs text-gray-500 -mt-2">
                As jornadas (jogos, datas e resultados) gerem-se na página de Classificações, depois de criares aqui os grupos e as equipas.
              </p>

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
                                  <img src="/csc-vet/cascais-emblem.png" alt="" className="w-5 h-5 object-contain" />
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
              <button onClick={() => setIsNewGroupModalOpen(false)} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white text-csc-dark hover:bg-red-500 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-90 shadow-md border-2 border-white/40">
                <X size={16} className="stroke-[2.5]" />
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
