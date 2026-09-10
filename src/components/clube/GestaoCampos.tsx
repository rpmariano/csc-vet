import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Plus, Search, X, Edit2, Trash2, ExternalLink, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { useModalA11y } from '../../hooks/useModalA11y'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { ConfirmModal } from '../ConfirmModal'
import { FichaCampo } from './FichaCampo'
import { formatClubSigla } from '../../lib/siglas'
import { CAMPO, ETIQUETA, urlDoGoogleMaps, type Campo } from './comum'

/*
  Campos (ecrã 9f), com a ficha de cada um (9i) no endereço.

  Era um separador do `AdminDashboard`, a página que o handoff diz que não
  devia existir: "tudo o que era gestão vive no ecrã Clube". Hoje é um ecrã
  próprio, aberto a partir do Clube — e por isso trata dos seus próprios
  dados, em vez de os receber de uma página que carregava tudo de uma vez.
*/

export const GestaoCampos: React.FC = () => {
  const { clubSettings } = useClub()
  const [params, setParams] = useSearchParams()

  const [campos, setCampos] = useState<Campo[]>([])
  const [procura, setProcura] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [morada, setMorada] = useState('')

  const [confirmacao, setConfirmacao] = useState<{
    isOpen: boolean
    title: string
    description?: string
    onConfirm: () => void | Promise<void>
  }>({ isOpen: false, title: '', onConfirm: () => {} })

  const carregar = async () => {
    const { data } = await supabase.from('fields').select('*').order('name')
    setCampos((data as Campo[]) ?? [])
  }

  useEffect(() => { carregar() }, [])

  const abrirCriacao = () => {
    triggerHaptic('light')
    setEmEdicao(null)
    setNome('')
    setMorada('')
    setModalAberto(true)
  }

  const abrirEdicao = (c: Campo) => {
    triggerHaptic('light')
    setEmEdicao(c.id)
    setNome(c.name)
    setMorada(c.address || '')
    setModalAberto(true)
  }

  const gravar = async () => {
    if (!nome.trim()) {
      toast.warning('O nome do campo é obrigatório.')
      return
    }
    const valores = { name: nome.trim(), address: morada.trim() }
    const { error } = emEdicao
      ? await supabase.from('fields').update(valores).eq('id', emEdicao)
      : await supabase.from('fields').insert([valores])

    if (error) {
      toast.error(`Erro ao ${emEdicao ? 'atualizar' : 'criar'} campo: ${error.message}`)
      return
    }
    toast.success(emEdicao ? 'Campo atualizado com sucesso!' : 'Campo criado com sucesso!')
    setModalAberto(false)
    carregar()
  }

  /* Um campo meio preenchido não se perde por um Escape. */
  const guarda = useAlteracoesPorGravar({
    aberto: modalAberto,
    valores: [emEdicao, nome, morada],
    aoGravar: gravar,
    aoSair: () => setModalAberto(false),
    descricao: 'As alterações a este campo ainda não foram gravadas. Se saíres agora, perdem-se.',
  })
  const painelRef = useModalA11y({ isOpen: modalAberto, onClose: guarda.tentarFechar })

  const eliminar = (id: string, nomeDoCampo: string) => {
    setConfirmacao({
      isOpen: true,
      title: 'Eliminar campo',
      description: `Tens a certeza que desejas eliminar o campo "${nomeDoCampo}"?`,
      onConfirm: async () => {
        setConfirmacao(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('fields').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar campo: ' + error.message)
          return
        }
        toast.success('Campo eliminado!')
        carregar()
      },
    })
  }

  /* A ficha vai no endereço: dá link próprio e o retroceder do browser fecha. */
  const campoAberto = campos.find(c => c.id === params.get('campo')) ?? null

  const abrirFicha = (id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set('campo', id)
    setParams(seguintes)
  }

  const fecharFicha = () => {
    const seguintes = new URLSearchParams(params)
    seguintes.delete('campo')
    setParams(seguintes)
  }

  const filtrados = campos.filter(c => {
    const q = procura.toLowerCase().trim()
    if (!q) return true
    return c.name.toLowerCase().includes(q) || (c.address && c.address.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/62" />
          <input
            type="text"
            value={procura}
            onChange={e => setProcura(e.target.value)}
            placeholder="Pesquisar por nome ou morada do campo..."
            aria-label="Pesquisar campos"
            className={`${CAMPO} pl-9.5`}
          />
          {procura && (
            <button
              type="button"
              onClick={() => setProcura('')}
              aria-label="Limpar pesquisa"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/62 hover:text-white/80"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={abrirCriacao}
          className="w-11 h-11 rounded-full bg-csc-gold text-csc-tinta flex items-center justify-center shrink-0 cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          <Plus size={19} />
          <span className="sr-only">Criar campo</span>
        </button>
      </div>

      <div className="cartao-simples text-white p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
          <span>A apresentar {filtrados.length} de {campos.length} campos registados</span>
        </div>

        {filtrados.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <MapPin size={40} className="mx-auto mb-2 opacity-60" />
            <p className="font-bold text-sm text-white/70">Nenhum campo encontrado</p>
            <p className="text-xs text-white/65 mt-0.5">Tenta outro termo na pesquisa ou cria um campo novo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {filtrados.map(c => {
              const eCasaDoClube = clubSettings?.home_field_id === c.id
              return (
                <div
                  key={c.id}
                  className="flex flex-col justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all gap-3"
                >
                  <button
                    type="button"
                    onClick={() => abrirFicha(c.id)}
                    aria-label={`Ver a ficha do campo ${c.name}`}
                    className="space-y-1 text-left min-h-11 cursor-pointer rounded-xl transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-csc-gold shrink-0" />
                      <h4 className="font-black text-sm text-white">{c.name}</h4>
                      {eCasaDoClube && (
                        <span className="bg-csc-dark text-csc-gold text-[10px] font-black px-2 py-0.5 rounded-full border border-csc-gold/30">
                          Casa do {formatClubSigla(clubSettings?.initials)}
                        </span>
                      )}
                    </div>
                    {c.address ? (
                      <p className="text-xs text-white/60 font-medium pl-6 leading-relaxed">{c.address}</p>
                    ) : (
                      <p className="text-xs text-white/65 italic pl-6">Sem morada definida</p>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-1">
                    <a
                      href={urlDoGoogleMaps(c.address ? `${c.name}, ${c.address}` : c.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-red-400 hover:text-red-300 text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <MapPin size={13} className="text-red-400 shrink-0" />
                      <span>Google Maps</span>
                      <ExternalLink size={10} className="opacity-50" />
                    </a>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(c)}
                        className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                        title="Editar campo"
                        aria-label={`Editar o campo ${c.name}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(c.id, c.name)}
                        className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                        title="Eliminar campo"
                        aria-label={`Eliminar o campo ${c.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Criar ou editar campo (ecrã 9g) */}
      {modalAberto && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clube-campo-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-lg rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MapPin size={22} className="text-csc-gold" />
                <h3 id="clube-campo-titulo" className="font-black text-lg">
                  {emEdicao ? 'Editar campo' : 'Criar novo campo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={guarda.tentarFechar}
                aria-label="Fechar"
                className="w-11 h-11 rounded-full bg-white/10 border border-white/20 text-white/80 flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <X size={18} className="stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); gravar() }} className="p-6 space-y-4">
              <div>
                <label className={ETIQUETA} htmlFor="clube-campo-nome">Nome do campo *</label>
                <input
                  id="clube-campo-nome"
                  type="text"
                  required
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Estádio Municipal Dramático de Cascais"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-campo-morada">Morada / localização</label>
                <input
                  id="clube-campo-morada"
                  type="text"
                  value={morada}
                  onChange={e => setMorada(e.target.value)}
                  placeholder="Ex: R. da Torre, 2750-760 Cascais"
                  className={CAMPO}
                />
                <p className="text-[11px] text-white/70 mt-1 font-medium">
                  Usada para navegação direta no Google Maps.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={guarda.tentarFechar}
                  className="px-5 py-2.5 border border-white/15 rounded-xl font-bold text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <Save size={16} className="text-csc-tinta" />
                  <span>{emEdicao ? 'Atualizar campo' : 'Guardar campo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <UnsavedChangesModal {...guarda.props} />

      <ConfirmModal
        isOpen={confirmacao.isOpen}
        title={confirmacao.title}
        description={confirmacao.description}
        confirmText="Sim, eliminar campo"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={confirmacao.onConfirm}
        onCancel={() => setConfirmacao(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Ficha do campo (ecrã 9i) */}
      <FichaCampo
        campo={campoAberto}
        eCampoDoClube={Boolean(campoAberto && clubSettings?.home_field_id === campoAberto.id)}
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={fecharFicha}
        aoEditar={() => {
          if (!campoAberto) return
          const alvo = campoAberto
          fecharFicha()
          abrirEdicao(alvo)
        }}
        aoEliminar={() => {
          if (!campoAberto) return
          const alvo = campoAberto
          fecharFicha()
          eliminar(alvo.id, alvo.name)
        }}
      />
    </div>
  )
}

export default GestaoCampos
