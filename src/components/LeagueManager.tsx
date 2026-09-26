import React, { useEffect, useState } from 'react'
import { Botao, BotaoIcone } from './ui'
import { supabase } from '../lib/supabaseClient'
import { Trash2, Shield, Plus } from 'lucide-react'
import { toast } from '../context/ToastContext'
import { ConfirmModal } from './ConfirmModal'
import { Modal } from './Modal'
import { EcraDetalhe } from './EcraDetalhe'
import { CLUBE_SIGLA } from '../lib/clube'
import { useClub } from '../context/ClubContext'
import { equipaDoTorneio } from '../lib/classificacao'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { mensagemDeErro } from '../lib/erros'
import { CLASSE_CAMPO } from './ui/formulario'

interface LeagueManagerProps {
  tournamentId: string
  onClose: () => void
}

// Gestão de Grupos e Equipas de um torneio. A introdução de jornadas e
// resultados passou para a Classificação (StandingsPage) — faz mais sentido
// ficar junto da tabela que esses resultados alimentam, em vez de aqui.
//
// É um ecrã (`EcraDetalhe`), com "‹ Torneios", desde 2026-09-25. Era uma
// janela escrita à mão sem role="dialog", sem Escape e sem prisão de foco — o
// Tab continuava na lista por baixo —, e é uma área de trabalho, com o seu
// próprio modal de novo grupo por cima.
export const LeagueManager: React.FC<LeagueManagerProps> = ({ tournamentId, onClose }) => {
  const { clubSettings } = useClub()
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

  /* Um grupo meio preenchido não se perde num Escape ou num clique ao lado. */
  const guardaGrupo = useAlteracoesPorGravar({
    aberto: isNewGroupModalOpen,
    valores: [newGroupName, newGroupPhase],
    aoGravar: () => handleAddGroup(),
    aoSair: () => setIsNewGroupModalOpen(false),
    descricao: 'O grupo que estás a criar ainda não foi gravado. Se saíres agora, perde-se.',
  })

  // Modal genérico de confirmação — substitui os confirm() nativos do browser
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean
    title: string
    description?: string
    confirmText?: string
    onConfirm: () => void | Promise<void>
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {}
  })
  const closeConfirmModal = () => setConfirmModalConfig(prev => ({ ...prev, isOpen: false }))

  /* O efeito fica **depois** da função que chama: em cima referia uma `const`
     ainda por inicializar, o que só funciona porque o corpo do componente
     corre inteiro antes de o efeito disparar. */
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
      toast.error('Erro ao carregar dados da liga: ' + mensagemDeErro(firstError))
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [tournamentId])

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return
    const phase = parseInt(newGroupPhase) || 1
    const { error } = await supabase.from('tournament_groups').insert([{ tournament_id: tournamentId, name: newGroupName.trim(), phase }])
    if (error) {
      toast.error('Não foi possível criar o grupo: ' + mensagemDeErro(error))
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
      toast.error('Não foi possível adicionar a equipa: ' + mensagemDeErro(error))
      return
    }

    setSelectedGroupForTeam('')
    setSelectedOpponentToAdd('')
    fetchData()
  }

  const handleRemoveTeam = (id: string) => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Tirar equipa do grupo',
      description: 'Esta equipa deixa de fazer parte do grupo. Os resultados já registados não são eliminados.',
      confirmText: 'Sim, tirar do grupo',
      onConfirm: async () => {
        closeConfirmModal()
        const { error } = await supabase.from('tournament_teams').delete().eq('id', id)
        if (error) {
          toast.error('Não foi possível tirar a equipa: ' + mensagemDeErro(error))
          return
        }
        fetchData()
      }
    })
  }

  return (
    <>
    <EcraDetalhe
      aberto
      voltarPara="Torneios"
      aoVoltar={onClose}
      sobrancelha="Grupos e equipas"
      titulo={tournament?.name ?? 'Torneio'}
      legenda={[tournament?.season, tournament?.organizer_name ? `Organização: ${tournament.organizer_name}` : null]
        .filter(Boolean).join(' · ') || undefined}
    >
        <div>
          {loading ? (
            <div className="text-center py-10 text-white/62 font-bold">A carregar...</div>
          ) : (
            <div className="space-y-6">
              {/* "Grupos e equipas" é a sobrancelha do ecrã; aqui fica só a ação. */}
              <Botao aparencia="vidro" largo onClick={() => setIsNewGroupModalOpen(true)}>
                <Plus size={15} />
                Novo grupo
              </Botao>

              <p className="text-xs text-white/62 -mt-2">
                As jornadas (jogos, datas e resultados) gerem-se na página de Classificações, depois de criares aqui os grupos e as equipas.
              </p>

              {/* Add Team UI */}
              {groups.length > 0 && (
                <div className="cartao-simples p-4 flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-white/60 mb-1">Grupo</label>
                    <select
                      value={selectedGroupForTeam}
                      onChange={e => setSelectedGroupForTeam(e.target.value)}
                      className={CLASSE_CAMPO}
                    >
                      <option value="">Escolhe o grupo</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name} (Fase {g.phase})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-bold text-white/60 mb-1">Equipa</label>
                    <select
                      value={selectedOpponentToAdd}
                      onChange={e => setSelectedOpponentToAdd(e.target.value)}
                      className={CLASSE_CAMPO}
                    >
                      <option value="">Escolhe a equipa</option>
                      <option value="csc">{CLUBE_SIGLA} (nós)</option>
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
                <div className="text-center py-6 bg-white/4 rounded-xl border border-dashed border-white/15 text-white/62 text-sm">
                  Nenhum grupo configurado. Cria o "Grupo Único" ou "Grupo A", "Grupo B".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.map(g => (
                    <div key={g.id} className="cartao-simples p-4">
                      <h4 className="font-black text-white mb-3">{g.name} <span className="text-xs text-white/62 font-medium">(Fase {g.phase})</span></h4>
                      <div className="space-y-2">
                        {teams.filter(t => t.group_id === g.id).map(t => (
                          <div key={t.id} className="text-sm font-medium text-white/80 bg-white/6 px-3 py-2 rounded-lg border border-white/10 flex justify-between items-center">
                            {/* Sigla e emblema, como na classificacao: o nome por
                                extenso nao cabe, e o emblema do proprio clube
                                vinha de um ficheiro estatico em vez de
                                `club_settings`. */}
                            {(() => {
                              const { sigla, logo, eOClube } = equipaDoTorneio(t, clubSettings)
                              return (
                                <span className="flex items-center gap-2 min-w-0">
                                  {logo ? (
                                    <img src={logo} alt="" className="w-5 h-5 rounded-full object-contain bg-white shrink-0" />
                                  ) : (
                                    <Shield size={16} className={eOClube ? 'text-csc-gold' : 'text-white/62'} />
                                  )}
                                  <span className={`truncate ${eOClube ? 'font-bold text-csc-gold' : ''}`}>{sigla}</span>
                                </span>
                              )
                            })()}
                            <BotaoIcone rotulo="Tirar a equipa do grupo" icone={Trash2} perigo discreto onClick={() => handleRemoveTeam(t.id)} />
                          </div>
                        ))}
                        {teams.filter(t => t.group_id === g.id).length === 0 && (
                          <div className="text-xs text-white/62 italic">Sem equipas neste grupo.</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </EcraDetalhe>

      {/* MODAL: Criar Novo Grupo — mesma moldura partilhada da Nova Jornada */}
      <Modal
        isOpen={isNewGroupModalOpen}
        onClose={guardaGrupo.tentarFechar}
        size="md"
        headerStyle="brand"
        icon={<Plus size={18} className="text-csc-gold" />}
        title="Novo Grupo"
        footer={
          <>
            <Botao aparencia="vidro" onClick={guardaGrupo.tentarFechar}>Cancelar</Botao>
            <Botao onClick={handleAddGroup} disabled={!newGroupName.trim()}>
              Criar Grupo
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-white/60 mb-1" htmlFor="novo-grupo-nome">Nome do Grupo *</label>
            <input
              id="novo-grupo-nome"
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="Ex: Grupo A, Apuramento Campeão"
              className={CLASSE_CAMPO}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-white/60 mb-1" htmlFor="novo-grupo-fase">Fase</label>
            <select
              id="novo-grupo-fase"
              value={newGroupPhase}
              onChange={e => setNewGroupPhase(e.target.value)}
              className={CLASSE_CAMPO}
            >
              <option value="1">Fase 1 (Fase Inicial)</option>
              <option value="2">Fase 2 (Fase Final)</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        confirmText={confirmModalConfig.confirmText}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={closeConfirmModal}
      />

      <UnsavedChangesModal {...guardaGrupo.props} />
    </>
  )
}
