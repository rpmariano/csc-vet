import React, { useEffect, useState } from 'react'
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  Calendar,
  Megaphone,
  Pencil
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAnnouncements } from '../context/AnnouncementsContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import Modal from '../components/Modal'
import { useAlteracoesPorGravar } from '../hooks/useAlteracoesPorGravar'
import { useGuardaDeSaida } from '../context/SaidaGuardadaContext'
import { UnsavedChangesModal } from '../components/UnsavedChangesModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { CabecalhoEcra, Interruptor, BotaoIcone, ACarregar, EstadoVazio, Botao, Pastilha, BotaoCriar } from '../components/ui'
import { mensagemDeErro } from '../lib/erros'
import { CLASSE_CAMPO as CAMPO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from '../components/ui/formulario'
import { ProcuraEFiltros } from '../components/ProcuraEFiltros'
import BottomSheet from '../components/BottomSheet'

/** Um submit sem evento a sério — o formulário só lhe chama `preventDefault`. */
const EVENTO_FALSO = { preventDefault: () => {} } as React.FormEvent

interface Announcement {
  id: string
  title: string
  content: string
  published_at: string
  is_active?: boolean
  created_by?: string | null
}

/** Campo branco do handoff, o mesmo do Perfil (ecrã 5b). */

const AnnouncementsPage: React.FC = () => {
  const { profile } = useAuth()
  // A rota está aberta a todos os autenticados (a RLS já protege a escrita);
  // só coach/admin veem o formulário de criação e as ações de gestão.
  const isCoachOrAdmin = profile?.role === 'coach' || profile?.role === 'admin'
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isActiveOnCreate, setIsActiveOnCreate] = useState(true)
  const [loading, setLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  // Estados para Modal de Edição
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Estados para Confirmação de Eliminação
  const [deletingAnn, setDeletingAnn] = useState<Announcement | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  /*
    O sino do cabeçalho abre este ecrã, e é aqui que se leem os comunicados —
    quem só lê e quem gere. Era uma persiana à parte, com a mesma lista; uma
    mensagem longa lia-se mal a 90% da altura, e eram duas portas para o
    mesmo sítio.

    **Abrir o ecrã é lê-los.** A persiana marcava cada um como lido ao
    expandi-lo; aqui o conteúdo está à vista, por isso os que estavam por ler
    ficam marcados como "Novo" durante esta visita e passam a lidos logo ao
    entrar — o sino apaga-se, e o "Novo" continua a dizer o que era novo.
  */
  const { announcements: ativos, isRead, markAsRead, loading: aCarregarLeituras } = useAnnouncements()
  const [novos, setNovos] = useState<Set<string> | null>(null)

  /* O formulário de publicar começa recolhido: quem gere também chega aqui
     pelo sino, para ler, e abrir o ecrã num formulário vazio empurrava os
     comunicados para baixo da dobra. */
  const [aEscrever, setAEscrever] = useState(false)
  useEffect(() => {
    if (novos !== null || aCarregarLeituras) return
    const porLer = ativos.filter(a => !isRead(a.id)).map(a => a.id)
    setNovos(new Set(porLer))
    porLer.forEach(markAsRead)
  }, [novos, aCarregarLeituras, ativos, isRead, markAsRead])

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    if (type === 'success') toast.success(text)
    else if (type === 'error') toast.error(text)
    else toast.info(text)
  }

  const fetchAnnouncements = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('published_at', { ascending: false })

      if (error) throw error
      /* Sem comunicados, a lista fica vazia e diz isso. Havia aqui dois
         comunicados inventados ("1º Treino da época dia 2") para quando a
         tabela vinha vazia — a gestão via-os como se fossem reais, e com o
         ecrã aberto a toda a gente passavam a chegar ao plantel. */
      setAnnouncements((data ?? []).map(item => ({
        ...item,
        is_active: item.is_active !== false, // Por defeito é ativo se null/undefined
      })) as Announcement[])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  // Publicar Novo Comunicado
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setIsPublishing(true)

    const newAnn: Partial<Announcement> = {
      title: title.trim(),
      content: content.trim(),
      published_at: new Date().toISOString(),
      created_by: profile?.id,
      is_active: isActiveOnCreate
    }

    try {
      let createdItem: Announcement | null = null

      try {
        const { data, error } = await supabase
          .from('announcements')
          .insert([newAnn])
          .select()
          .single()

        if (error) {
          // Se falhar porque a coluna is_active ainda não existe na base de dados
          if (error.message?.includes('is_active')) {
            const { is_active: _is_active, ...withoutActive } = newAnn
            const { data: fallbackData, error: fallbackErr } = await supabase
              .from('announcements')
              .insert([withoutActive])
              .select()
              .single()
            if (fallbackErr) throw fallbackErr
            createdItem = { ...(fallbackData as Announcement), is_active: isActiveOnCreate }
          } else {
            throw error
          }
        } else {
          createdItem = data as Announcement
        }
      } catch {
        // Fallback local se estiver offline ou em simulação
        createdItem = {
          id: `local-${Date.now()}`,
          title: title.trim(),
          content: content.trim(),
          published_at: new Date().toISOString(),
          is_active: isActiveOnCreate
        }
      }

      if (createdItem) {
        setAnnouncements(prev => [createdItem!, ...prev.filter(a => a.id !== createdItem!.id)])
      }

      setTitle('')
      setContent('')
      setIsActiveOnCreate(true)
      toast.success('Comunicado publicado com sucesso!')
      fetchAnnouncements()
    } catch (err: any) {
      toast.error('Erro ao publicar comunicado: ' + mensagemDeErro(err))
    } finally {
      setIsPublishing(false)
    }
  }

  // Alternar Ativar / Desativar
  const handleToggleActive = async (ann: Announcement) => {
    const nextStatus = !ann.is_active
    setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_active: nextStatus } : a))

    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: nextStatus })
        .eq('id', ann.id)

      if (error && error.message?.includes('is_active')) {
        // Ignora caso a coluna não exista na BD e mantém estado em memória
      } else if (error) {
        throw error
      }

      toast.info(nextStatus ? 'Comunicado ativado (visível na homepage)' : 'Comunicado desativado (oculto da homepage)')
    } catch (err: any) {
      console.error('Erro ao alternar estado do comunicado:', err)
      toast.error('Erro ao alterar estado do comunicado.')
    }
  }

  // Abrir Modal de Edição
  const handleStartEdit = (ann: Announcement) => {
    setEditingAnn(ann)
    setEditTitle(ann.title)
    setEditContent(ann.content)
    setEditIsActive(ann.is_active !== false)
  }

  // Guardar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAnn || !editTitle.trim() || !editContent.trim()) return
    setIsSavingEdit(true)

    try {
      const updatePayload = {
        title: editTitle.trim(),
        content: editContent.trim(),
        is_active: editIsActive
      }

      const { error } = await supabase
        .from('announcements')
        .update(updatePayload)
        .eq('id', editingAnn.id)

      if (error && error.message?.includes('is_active')) {
        const { is_active: _is_active, ...withoutActive } = updatePayload
        await supabase.from('announcements').update(withoutActive).eq('id', editingAnn.id)
      } else if (error) {
        throw error
      }

      setAnnouncements(prev => prev.map(a => a.id === editingAnn.id ? {
        ...a,
        title: editTitle.trim(),
        content: editContent.trim(),
        is_active: editIsActive
      } : a))

      setEditingAnn(null)
      toast.success('Alterações guardadas com sucesso!')
    } catch (err: any) {
      toast.error('Erro ao guardar alterações: ' + mensagemDeErro(err))
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Confirmar e Executar Eliminação
  const handleConfirmDelete = async () => {
    if (!deletingAnn) return
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', deletingAnn.id)

      if (error) throw error

      setAnnouncements(prev => prev.filter(ann => ann.id !== deletingAnn.id))
      setDeletingAnn(null)
      showToast('Comunicado eliminado do histórico.')
    } catch {
      setAnnouncements(prev => prev.filter(ann => ann.id !== deletingAnn.id))
      setDeletingAnn(null)
      showToast('Comunicado eliminado.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Filtragem
  const filteredAnnouncements = announcements.filter(ann => {
    // Um jogador só deve ver o que está ativo — o filtro de estado e o ver
    // inativos são ferramentas de gestão, não fazem sentido para quem só lê.
    if (!isCoachOrAdmin && ann.is_active === false) return false

    // Filtro por Estado
    if (statusFilter === 'active' && ann.is_active === false) return false
    if (statusFilter === 'inactive' && ann.is_active !== false) return false

    // Filtro por Pesquisa
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      const matchTitle = ann.title?.toLowerCase().includes(term)
      const matchContent = ann.content?.toLowerCase().includes(term)
      return matchTitle || matchContent
    }

    return true
  })

  const activeCount = announcements.filter(a => a.is_active !== false).length
  const inactiveCount = announcements.filter(a => a.is_active === false).length

  // Escape, prisão de foco e anúncio a leitores de ecrã, mantendo o visual próprio de cada painel.
  /*
    Um comunicado em edição não se perde por um Escape ou um clique ao lado. A
    fotografia é tirada depois de `handleStartEdit` encher os campos, por isso
    abrir e fechar sem tocar em nada não pergunta nada.
  */
  const guardaEdicao = useAlteracoesPorGravar({
    aberto: !!editingAnn,
    valores: [editTitle, editContent, editIsActive],
    aoGravar: () => handleSaveEdit(EVENTO_FALSO),
    aoSair: () => setEditingAnn(null),
    descricao: 'As alterações a este comunicado ainda não foram gravadas. Se saíres agora, perdem-se.',
  })

  /*
    O formulário de publicar ocupa a página e não se fecha — sai-se dele a
    navegar. Um comunicado escrito e ainda não publicado ia à vida num toque na
    barra de baixo.
  */
  const guardaNovo = useAlteracoesPorGravar({
    aberto: true,
    valores: [title, content, isActiveOnCreate],
    aoGravar: () => handlePublish(EVENTO_FALSO),
    aoSair: () => {},
    descricao: 'O comunicado que escreveste ainda não foi publicado. Se saíres agora, perde-se.',
  })

  useGuardaDeSaida({
    sujo: guardaNovo.sujo,
    gravar: () => handlePublish(EVENTO_FALSO),
    descricao: 'O comunicado que escreveste ainda não foi publicado. Se saíres agora, perde-se.',
  })

  return (
    <div className="relative space-y-4 pb-2">
      <CabecalhoEcra
        titulo="Comunicados"
        sobrancelha="Avisos à equipa"
        legenda={isCoachOrAdmin ? 'Os avisos à equipa: aqui leem-se, publicam-se e editam-se.' : undefined}
        /* Escrever é o [+] do canto, como criar em todos os ecrãs; era uma
           barra dourada à mão por baixo do título. Com o formulário aberto
           não há nada a criar. */
        acoes={isCoachOrAdmin && !aEscrever ? (
          <BotaoCriar rotulo="Escrever comunicado" onClick={() => setAEscrever(true)} />
        ) : undefined}
      />

      <div className="space-y-4">
        {/* Publicar e editar. A rota é de treinador e direção (ver App.tsx);
            este `isCoachOrAdmin` fica como segunda linha, porque um papel
            simulado muda o que se pode fazer sem mudar de rota. */}

        {isCoachOrAdmin && aEscrever && (
          <div className="cartao-vidro p-5 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
              <div className="w-8 h-8 rounded-xl bg-csc-gold text-csc-dark flex items-center justify-center text-sm font-bold">
                <Megaphone size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Novo Comunicado</h3>
                <p className="text-[11px] text-white/70">Escreve e publica um aviso para todo o plantel.</p>
              </div>
            </div>

            <form onSubmit={handlePublish} className="space-y-4">
              <div>
                <label className={ETIQUETA}>
                  Título do Comunicado *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={CAMPO}
                  placeholder="Ex: Ponto de Encontro Alterado"
                />
              </div>

              <div>
                <label className={ETIQUETA}>
                  Conteúdo da Mensagem *
                </label>
                <textarea
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  className={`${CAMPO} h-auto py-3 leading-relaxed resize-none`}
                  placeholder="Escreve aqui a mensagem completa para os atletas e equipa técnica..."
                />
              </div>

              {/* Opção de Ativar de Imediato */}
              <Interruptor
                ligado={isActiveOnCreate}
                aoMudar={setIsActiveOnCreate}
                titulo="Ativar de imediato"
                nota="Fica visível no sino dos comunicados, na Home"
                className="cartao-simples"
              />

              <button
                type="submit"
                disabled={isPublishing || !title.trim() || !content.trim()}
                className="w-full min-h-12 flex items-center justify-center gap-2 bg-csc-gold text-csc-tinta rounded-3xl font-display font-extrabold text-[12.5px] transition-transform duration-150 active:scale-97 disabled:opacity-45 cursor-pointer"
              >
                <Plus size={16} />
                <span>{isPublishing ? 'A publicar...' : 'Publicar Comunicado'}</span>
              </button>
            </form>
          </div>
        )}

        {/* Lista e Histórico de Comunicados */}
        <div className="space-y-4">
          {/* Procura à vista; o estado (ativos/inativos) é filtro e vai
              para trás do funil, como em todas as listas. Era um controlo
              segmentado à vista, com uma cor diferente por opção. Ver
              ativos e inativos é gestão, por isso quem só lê não tem funil. */}
          <ProcuraEFiltros
            procura={searchTerm}
            aoProcurar={setSearchTerm}
            placeholder="Título ou texto"
            rotulo="Procurar nos comunicados"
            aoAbrirFiltros={isCoachOrAdmin ? () => setFiltrosAbertos(true) : undefined}
            filtrosAtivos={statusFilter !== 'all'}
            resumo={statusFilter === 'all' ? [] : [statusFilter === 'active' ? 'Ativos' : 'Inativos']}
            contagem={`${filteredAnnouncements.length} ${filteredAnnouncements.length === 1 ? 'comunicado' : 'comunicados'}`}
            aoLimpar={() => { setSearchTerm(''); setStatusFilter('all') }}
          />

          <div className="cartao-simples p-5 space-y-4">
            

            <BottomSheet
              isOpen={filtrosAbertos}
              onClose={() => setFiltrosAbertos(false)}
              title="Filtrar comunicados"
              tone="dark"
              footer={
                <>
                  <Botao aparencia="vidro" onClick={() => setStatusFilter('all')} disabled={statusFilter === 'all'}>
                    Limpar
                  </Botao>
                  <Botao onClick={() => setFiltrosAbertos(false)}>
                    Ver {filteredAnnouncements.length}
                  </Botao>
                </>
              }
            >
              <p className={ETIQUETA}>Estado</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ['all', `Todos · ${announcements.length}`],
                  ['active', `Ativos · ${activeCount}`],
                  ['inactive', `Inativos · ${inactiveCount}`],
                ] as const).map(([valor, rotulo]) => (
                  <Pastilha key={valor} ativa={statusFilter === valor} onClick={() => setStatusFilter(valor)}>
                    {rotulo}
                  </Pastilha>
                ))}
              </div>
            </BottomSheet>

            {/* Listagem */}
            {loading ? (
              <ACarregar texto="A carregar comunicados…" />
            ) : filteredAnnouncements.length === 0 ? (
              <EstadoVazio
                icone={Megaphone}
                titulo={searchTerm ? 'Nenhum comunicado encontrado.' : 'Ainda não há comunicados.'}
                texto={searchTerm
                  ? 'Tenta mudar a procura.'
                  : isCoachOrAdmin
                    ? 'Escreve o primeiro em "Escrever comunicado", lá em cima.'
                    : 'Quando a direção ou a equipa técnica publicar um, aparece aqui.'}
              />
            ) : (
              <div className="space-y-3.5">
                {filteredAnnouncements.map((ann) => {
                  const isActive = ann.is_active !== false

                  return (
                    <div 
                      key={ann.id} 
                      className={`p-4 rounded-2xl border transition-all space-y-3 ${
                        isActive 
                          ? 'bg-white/5 border-csc-light/30 shadow-xs hover:border-csc-light/50' 
                          : 'bg-white/5 border-white/10 opacity-60'
                      }`}
                    >
                      {/* Topo do Card: Título + Badge de Estado */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            {novos?.has(ann.id) && (
                              <span className="shrink-0 inline-flex items-center gap-1 h-5 px-2 rounded-full bg-csc-gold/16 border border-csc-gold/35
                                font-display font-extrabold text-[9px] tracking-[0.1em] uppercase text-csc-gold">
                                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-csc-gold" />
                                Novo
                              </span>
                            )}
                            <h4 className="font-black text-sm text-white leading-snug">
                              {ann.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-white/65 font-medium">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {new Date(ann.published_at).toLocaleDateString('pt-PT')}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(ann.published_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        {/* Badge de Estado — só interessa a quem gere comunicados */}
                        {isCoachOrAdmin && (
                          <div>
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black bg-csc-light/15 text-csc-verde-texto border border-csc-light/35">
                                <span className="w-1.5 h-1.5 rounded-full bg-csc-light animate-pulse"></span>
                                <span>Ativo na Home</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black bg-white/10 text-white/60 border border-white/15">
                                <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                                <span>Desativado</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Conteúdo */}
                      <div className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap bg-white/5 p-3 rounded-xl border border-white/10">
                        {ann.content}
                      </div>

                      {/* Barra de Ações: Ativar/Desativar, Editar, Apagar — gestão, não leitura */}
                      {isCoachOrAdmin && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(ann)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isActive
                                ? 'bg-csc-gold/10 text-csc-gold hover:bg-csc-gold/15 border border-csc-gold/25'
                                : 'bg-csc-light/10 text-csc-verde-texto hover:bg-csc-light/15 border border-csc-light/25 font-black'
                            }`}
                            title={isActive ? 'Ocultar da Homepage' : 'Mostrar na Homepage'}
                          >
                            {isActive ? (
                              <>
                                <EyeOff size={13} className="text-csc-gold" />
                                <span>Desativar</span>
                              </>
                            ) : (
                              <>
                                <Eye size={13} className="text-csc-light" />
                                <span>Ativar na Home</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1.5">
                            <BotaoIcone rotulo="Editar comunicado" icone={Pencil} discreto onClick={() => handleStartEdit(ann)} />

                            <BotaoIcone rotulo="Eliminar comunicado" icone={Trash2} perigo discreto onClick={() => setDeletingAnn(ann)} />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: EDITAR COMUNICADO */}
      <Modal
        isOpen={!!editingAnn}
        onClose={guardaEdicao.tentarFechar}
        title="Editar comunicado"
        description="Muda o texto e se fica visível para a equipa."
        icon={<Pencil size={20} className="text-csc-gold" aria-hidden="true" />}
      >
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className={ETIQUETA}>Título *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA}>Mensagem *</label>
                <textarea
                  required
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className={`${CAMPO} h-auto py-3 leading-relaxed resize-none`}
                />
              </div>

              {/* Switch de Ativo no Modal de Edição */}
              <Interruptor
                ligado={editIsActive}
                aoMudar={setEditIsActive}
                titulo="Estado de publicação"
                nota={editIsActive ? 'Ativo (visível para a equipa)' : 'Inativo (oculto)'}
                className="cartao-simples"
              />

              <div className="flex gap-2.5 pt-3 border-t border-white/10">
                <Botao aparencia="vidro" className="flex-1" onClick={guardaEdicao.tentarFechar}>Cancelar</Botao>
                <Botao type="submit" className="flex-1" disabled={isSavingEdit || !editTitle.trim() || !editContent.trim()}>
                  {isSavingEdit ? 'A guardar…' : 'Guardar alterações'}
                </Botao>
              </div>
            </form>
      </Modal>

      <UnsavedChangesModal {...guardaEdicao.props} />

      {/* Eliminar pergunta pela confirmação partilhada, como em todo o lado.
          Era um diálogo escrito à mão, com botões de 40px. */}
      <ConfirmModal
        isOpen={!!deletingAnn}
        title="Eliminar comunicado"
        description={deletingAnn ? `"${deletingAnn.title}" deixa de aparecer a toda a gente. Não há como desfazer.` : undefined}
        confirmText="Sim, eliminar comunicado"
        cancelText="Cancelar"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingAnn(null)}
      />
    </div>
  )
}

export default AnnouncementsPage
