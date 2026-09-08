import React, { useEffect, useState } from 'react'
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  Search, 
  X, 
  Clock, 
  Calendar,
  Megaphone
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toast } from '../context/ToastContext'
import { useModalA11y } from '../hooks/useModalA11y'
import { CabecalhoEcra } from '../components/ui'

interface Announcement {
  id: string
  title: string
  content: string
  published_at: string
  is_active?: boolean
  created_by?: string | null
}

/** Campo branco do handoff, o mesmo do Perfil (ecrã 5b). */
const CAMPO =
  'w-full h-11 px-3 rounded-[13px] bg-white text-csc-tinta font-display font-bold text-xs ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-1.5'

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

  // Estados para Modal de Edição
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Estados para Confirmação de Eliminação
  const [deletingAnn, setDeletingAnn] = useState<Announcement | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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
      if (data && data.length > 0) {
        setAnnouncements(data.map(item => ({
          ...item,
          is_active: item.is_active !== false // Por defeito é ativo se null/undefined
        })) as Announcement[])
      } else {
        setAnnouncements([
          {
            id: '1',
            title: '1º Treino da época dia 2',
            content: 'No primeiro treino, devem chegar mais cedo, 21h, para palestra de abertura!',
            published_at: new Date().toISOString(),
            is_active: true
          },
          {
            id: '2',
            title: 'Pagamento quota Setembro',
            content: 'Lembramos a todos os jogadores que a quota mensal de Setembro de 10€ já se encontra a pagamento.',
            published_at: new Date(Date.now() - 86400000).toISOString(),
            is_active: true
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
            const { is_active, ...withoutActive } = newAnn
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
      } catch (dbErr) {
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
      toast.error('Erro ao publicar comunicado: ' + (err.message || 'Erro'))
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
        const { is_active, ...withoutActive } = updatePayload
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
      toast.error('Erro ao guardar alterações: ' + (err.message || 'Erro'))
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
    } catch (err: any) {
      setAnnouncements(prev => prev.filter(ann => ann.id !== deletingAnn.id))
      setDeletingAnn(null)
      showToast('Comunicado removido.')
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
  const painelEdicaoRef = useModalA11y({ isOpen: !!editingAnn, onClose: () => setEditingAnn(null) })
  const painelApagarRef = useModalA11y({ isOpen: !!deletingAnn, onClose: () => setDeletingAnn(null) })

  return (
    <div className="relative space-y-4 pb-2">
      <CabecalhoEcra
        titulo="Comunicados"
        sobrancelha="Avisos à equipa"
        legenda="Quem só lê tem-nos no sino da Home. Aqui publicam-se e editam-se."
        className="mb-1"
      />

      <div className="space-y-4">
        {/* Publicar e editar. A rota é de treinador e direção (ver App.tsx);
            este `isCoachOrAdmin` fica como segunda linha, porque um papel
            simulado muda o que se pode fazer sem mudar de rota. */}
        {isCoachOrAdmin && (
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
              <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white/80 block">Ativar de Imediato</span>
                  <span className="text-[10.5px] text-white/70 block">Fica visível no sino dos comunicados, na Home</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActiveOnCreate(!isActiveOnCreate)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isActiveOnCreate ? 'bg-emerald-600' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isActiveOnCreate ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

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
          <div className="cartao-simples p-5 space-y-4">
            
            {/* Barra de Filtros e Pesquisa */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              {/* Separadores de Filtro — ver ativos/inativos é gestão, não faz sentido para quem só lê */}
              {isCoachOrAdmin && (
                <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-2xl w-fit">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`min-h-11 px-3.5 rounded-[18px] font-display text-xs font-bold transition-colors cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-csc-gold text-csc-tinta'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Todos ({announcements.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('active')}
                    className={`min-h-11 px-3.5 rounded-[18px] font-display text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'active'
                        ? 'bg-csc-light text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <span>Ativos</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      statusFilter === 'active' ? 'bg-csc-dark text-white' : 'bg-white/10 text-white/60'
                    }`}>{activeCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('inactive')}
                    className={`min-h-11 px-3.5 rounded-[18px] font-display text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'inactive'
                        ? 'bg-white/20 text-white shadow-2xs'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <span>Inativos</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      statusFilter === 'inactive' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'
                    }`}>{inactiveCount}</span>
                  </button>
                </div>
              )}

              {/* Input de Pesquisa */}
              <div className="relative flex-1 sm:max-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 z-1" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar..."
                  className={`${CAMPO} pl-9`}
                />
              </div>
            </div>

            {/* Listagem */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/65 space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-csc-gold border-t-transparent"></div>
                <span className="text-xs font-medium">A carregar comunicados...</span>
              </div>
            ) : filteredAnnouncements.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-2xl border border-dashed border-white/15 p-6 space-y-2">
                <Megaphone size={34} className="mx-auto text-white/20" />
                <p className="text-xs font-bold text-white/70">Nenhum comunicado encontrado.</p>
                <p className="text-[11px] text-white/65">
                  {searchTerm
                    ? 'Experimenta ajustar o termo de pesquisa.'
                    : isCoachOrAdmin
                      ? 'Cria um novo comunicado no formulário ao lado.'
                      : 'Ainda não há comunicados publicados.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredAnnouncements.map((ann) => {
                  const isActive = ann.is_active !== false

                  return (
                    <div 
                      key={ann.id} 
                      className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3 ${
                        isActive 
                          ? 'bg-white/5 border-emerald-400/30 shadow-xs hover:border-emerald-400/50' 
                          : 'bg-white/5 border-white/10 opacity-60'
                      }`}
                    >
                      {/* Topo do Card: Título + Badge de Estado */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2">
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
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
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
                            <button
                              type="button"
                              onClick={() => handleStartEdit(ann)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                              title="Editar comunicado"
                            >
                              <Edit3 size={13} className="text-white/70" />
                              <span>Editar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingAnn(ann)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-red-400 hover:bg-red-500/10 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-transparent hover:border-red-400/30"
                              title="Eliminar comunicado"
                            >
                              <Trash2 size={14} />
                              <span>Apagar</span>
                            </button>
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
      {editingAnn && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onMouseDown={(e) => {
            // mousedown no fundo, e não um arrasto que começou dentro do painel (ex.: a selecionar texto)
            if (e.target === e.currentTarget) setEditingAnn(null)
          }}
        >
          <div
            ref={painelEdicaoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editar-comunicado-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white rounded-3xl max-w-lg w-full p-6 relative shadow-2xl border border-white/10 space-y-4 animate-scale-in outline-none"
          >
            <button
              type="button"
              onClick={() => setEditingAnn(null)}
              aria-label="Fechar"
              className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center transition-transform duration-150 cursor-pointer active:scale-97"
            >
              <X size={18} className="stroke-[2.5]" />
            </button>

            <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-white/10 text-csc-gold flex items-center justify-center shadow-xs">
                <Edit3 size={17} />
              </div>
              <div>
                <h3 id="editar-comunicado-titulo" className="text-base font-black text-white">Editar Comunicado</h3>
                <p className="text-[11px] text-white/70">Atualiza os dados e visibilidade deste aviso.</p>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
                  Título do Comunicado *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className={CAMPO}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-white/70 uppercase tracking-wider mb-1">
                  Conteúdo da Mensagem *
                </label>
                <textarea
                  required
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className={`${CAMPO} h-auto py-3 leading-relaxed resize-none`}
                />
              </div>

              {/* Switch de Ativo no Modal de Edição */}
              <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white/80 block">Estado de Publicação</span>
                  <span className="text-[10.5px] text-white/70 block">
                    {editIsActive ? 'Ativo (visível para a equipa)' : 'Inativo (oculto)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditIsActive(!editIsActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    editIsActive ? 'bg-emerald-600' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      editIsActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex gap-2.5 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingAnn(null)}
                  className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || !editTitle.trim() || !editContent.trim()}
                  className="flex-1 px-4 py-2.5 bg-csc-gold hover:brightness-95 text-csc-dark font-black text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {isSavingEdit ? 'A guardar...' : 'Guardar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE ELIMINAÇÃO */}
      {deletingAnn && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-modal-confirm animate-fade-in select-none">
          <div
            ref={painelApagarRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apagar-comunicado-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-white/10 space-y-4 animate-scale-in outline-none"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-csc-red/15 text-csc-vermelho-texto flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 id="apagar-comunicado-titulo" className="text-base font-black text-white leading-tight">Apagar Comunicado?</h3>
                <p className="text-xs text-white/70 mt-0.5">Esta ação não pode ser revertida.</p>
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-white/70">
              <span className="font-bold text-white block truncate">{deletingAnn.title}</span>
              <span className="text-[11px] text-white/70 line-clamp-2 mt-0.5">{deletingAnn.content}</span>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeletingAnn(null)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-md"
              >
                {isDeleting ? 'A apagar...' : 'Sim, Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnnouncementsPage
