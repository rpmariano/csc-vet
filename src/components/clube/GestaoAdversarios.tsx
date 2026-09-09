import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, MapPin, Plus, Search, X, Edit2, Trash2, ExternalLink, Save, User, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { useModalA11y } from '../../hooks/useModalA11y'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { ConfirmModal } from '../ConfirmModal'
import { FichaAdversario } from './FichaAdversario'
import { formatClubSigla } from '../../pages/CalendarPage'
import { CAMPO, ETIQUETA, urlDoGoogleMaps, type Adversario, type Campo } from './comum'

/*
  Adversários (ecrã 9d), com a ficha de cada um (9h) no endereço.

  Era um separador do `AdminDashboard`; hoje é um ecrã aberto a partir do
  Clube. Precisa dos campos além dos adversários, para o "campo habitual".
*/

export const GestaoAdversarios: React.FC = () => {
  const { clubSettings } = useClub()
  const [params, setParams] = useSearchParams()

  const [adversarios, setAdversarios] = useState<Adversario[]>([])
  const [campos, setCampos] = useState<Campo[]>([])
  const [procura, setProcura] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [sigla, setSigla] = useState('')
  const [contacto, setContacto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [campoHabitual, setCampoHabitual] = useState('')
  const [emblemaAtual, setEmblemaAtual] = useState<string | null>(null)
  const [emblemaNovo, setEmblemaNovo] = useState<File | null>(null)
  const [aEnviar, setAEnviar] = useState(false)

  const [confirmacao, setConfirmacao] = useState<{
    isOpen: boolean
    title: string
    description?: string
    onConfirm: () => void | Promise<void>
  }>({ isOpen: false, title: '', onConfirm: () => {} })

  const carregar = async () => {
    const [resAdv, resCampos] = await Promise.all([
      supabase.from('opponents').select('*').order('name'),
      supabase.from('fields').select('*').order('name'),
    ])
    setAdversarios((resAdv.data as Adversario[]) ?? [])
    setCampos((resCampos.data as Campo[]) ?? [])
  }

  useEffect(() => { carregar() }, [])

  const abrirCriacao = () => {
    triggerHaptic('light')
    setEmEdicao(null)
    setNome('')
    setSigla('')
    setContacto('')
    setTelefone('')
    setCampoHabitual('')
    setEmblemaAtual(null)
    setEmblemaNovo(null)
    setModalAberto(true)
  }

  const abrirEdicao = (a: Adversario) => {
    triggerHaptic('light')
    setEmEdicao(a.id)
    setNome(a.name)
    setSigla(a.initials || '')
    setContacto(a.contact_name || '')
    setTelefone(a.contact_phone || '')
    setCampoHabitual(a.home_field_id || '')
    setEmblemaAtual(a.logo_url || null)
    setEmblemaNovo(null)
    setModalAberto(true)
  }

  const gravar = async () => {
    if (!nome.trim()) {
      toast.warning('O nome da equipa adversária é obrigatório.')
      return
    }

    setAEnviar(true)
    let urlDoEmblema: string | null = emblemaAtual

    try {
      if (emblemaNovo) {
        const extensao = emblemaNovo.name.split('.').pop()
        const ficheiro = `opp_${Math.random()}.${extensao}`
        const { error: erroUpload } = await supabase.storage
          .from('club_assets')
          .upload(ficheiro, emblemaNovo, { upsert: true })
        if (erroUpload) throw erroUpload
        const { data } = supabase.storage.from('club_assets').getPublicUrl(ficheiro)
        urlDoEmblema = data.publicUrl
      }

      const valores = {
        name: nome.trim(),
        initials: sigla.trim() || null,
        logo_url: urlDoEmblema,
        contact_name: contacto.trim(),
        contact_phone: telefone.trim(),
        home_field_id: campoHabitual || null,
      }

      const { error } = emEdicao
        ? await supabase.from('opponents').update(valores).eq('id', emEdicao)
        : await supabase.from('opponents').insert([valores])
      if (error) throw error

      toast.success(emEdicao ? 'Adversário atualizado com sucesso!' : 'Adversário criado com sucesso!')
      setModalAberto(false)
      carregar()
    } catch (err: any) {
      toast.error('Erro ao guardar adversário: ' + err.message)
    } finally {
      setAEnviar(false)
    }
  }

  /*
    O emblema entra na comparação pelo nome do ficheiro: um `File` não se
    serializa, e sem isto escolher um emblema novo não contava como alteração.
  */
  const guarda = useAlteracoesPorGravar({
    aberto: modalAberto,
    valores: [emEdicao, nome, sigla, contacto, telefone, campoHabitual, emblemaNovo?.name ?? null],
    aoGravar: gravar,
    aoSair: () => setModalAberto(false),
    descricao: 'As alterações a este adversário ainda não foram gravadas. Se saíres agora, perdem-se.',
  })
  const painelRef = useModalA11y({ isOpen: modalAberto, onClose: guarda.tentarFechar })

  const eliminar = (id: string, nomeDoAdversario: string) => {
    setConfirmacao({
      isOpen: true,
      title: 'Eliminar adversário',
      description: `Tens a certeza que desejas eliminar o adversário "${nomeDoAdversario}"?`,
      onConfirm: async () => {
        setConfirmacao(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('opponents').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar adversário: ' + error.message)
          return
        }
        toast.success('Adversário eliminado!')
        carregar()
      },
    })
  }

  const adversarioAberto = adversarios.find(a => a.id === params.get('adversario')) ?? null

  const abrirFicha = (id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set('adversario', id)
    setParams(seguintes)
  }

  const fecharFicha = () => {
    const seguintes = new URLSearchParams(params)
    seguintes.delete('adversario')
    setParams(seguintes)
  }

  const filtrados = adversarios.filter(a => {
    const q = procura.toLowerCase().trim()
    if (!q) return true
    const campo = campos.find(c => c.id === a.home_field_id)
    return (
      a.name.toLowerCase().includes(q) ||
      (a.initials && a.initials.toLowerCase().includes(q)) ||
      (a.contact_name && a.contact_name.toLowerCase().includes(q)) ||
      (a.contact_phone && a.contact_phone.includes(q)) ||
      (campo && campo.name.toLowerCase().includes(q))
    )
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
            placeholder="Pesquisar por equipa, sigla, contacto ou campo..."
            aria-label="Pesquisar adversários"
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
          <span className="sr-only">Criar adversário</span>
        </button>
      </div>

      <div className="cartao-simples text-white p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-white/70">
          <span>A apresentar {filtrados.length} de {adversarios.length} equipas registadas</span>
        </div>

        {filtrados.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <Shield size={40} className="mx-auto mb-2 opacity-60" />
            <p className="font-bold text-sm text-white/70">Nenhum adversário encontrado</p>
            <p className="text-xs text-white/65 mt-0.5">Tenta outro termo na pesquisa ou cria um adversário novo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtrados.map(a => {
              const campo = campos.find(c => c.id === a.home_field_id)
              const procuraNoMapa = campo
                ? (campo.address ? `${campo.name}, ${campo.address}` : campo.name)
                : a.name

              return (
                <div
                  key={a.id}
                  className="flex flex-col justify-between p-4 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all gap-3"
                >
                  <button
                    type="button"
                    onClick={() => abrirFicha(a.id)}
                    aria-label={`Ver a ficha do adversário ${a.name}`}
                    className="flex items-start gap-3.5 text-left w-full min-h-11 cursor-pointer rounded-xl transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    {a.logo_url ? (
                      <img
                        src={a.logo_url}
                        alt={a.name}
                        className="w-13 h-13 object-contain bg-white rounded-xl border border-white/12 p-1.5 shadow-2xs shrink-0"
                      />
                    ) : (
                      <div className="w-13 h-13 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center font-black text-white/70 text-sm shrink-0">
                        {a.initials || a.name.substring(0, 3).toUpperCase()}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-sm text-white truncate">
                        {a.name}
                        {a.initials && <span className="text-white/70 font-semibold text-xs ml-1">({a.initials})</span>}
                      </h4>

                      {campo && (
                        <p className="text-xs text-white/60 font-medium flex items-center gap-1 mt-1 truncate">
                          <span className="text-white/62">Campo:</span>
                          <span className="truncate">{campo.name}</span>
                        </p>
                      )}

                      {/* O telefone era um `<a href="tel:">` dentro do que passou a
                          ser o botão que abre a ficha — um interativo dentro de
                          outro. Fica como texto; ligar faz-se na ficha (9h). */}
                      {(a.contact_name || a.contact_phone) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-white/60 font-medium">
                          {a.contact_name && (
                            <span className="flex items-center gap-1">
                              <User size={12} className="text-white/65" />
                              <span>{a.contact_name}</span>
                            </span>
                          )}
                          {a.contact_phone && (
                            <span className="flex items-center gap-1 text-csc-gold font-bold">
                              <Phone size={12} className="text-csc-gold" />
                              <span>{a.contact_phone}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center justify-between pt-2.5 border-t border-white/10 mt-1">
                    {campo ? (
                      <a
                        href={urlDoGoogleMaps(procuraNoMapa)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-red-400 hover:text-red-300 text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                      >
                        <MapPin size={13} className="text-red-400 shrink-0" />
                        <span>Ver campo</span>
                        <ExternalLink size={10} className="opacity-50" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-white/65 italic">Sem campo associado</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(a)}
                        className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-csc-gold text-white/70 hover:text-csc-gold rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                        title="Editar adversário"
                        aria-label={`Editar o adversário ${a.name}`}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(a.id, a.name)}
                        className="w-11 h-11 flex items-center justify-center bg-white/10 border border-white/10 hover:border-red-400 text-red-400 hover:bg-red-500/10 rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
                        title="Eliminar adversário"
                        aria-label={`Eliminar o adversário ${a.name}`}
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

      {/* Criar ou editar adversário (ecrã 9e) */}
      {modalAberto && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clube-adversario-titulo"
            tabIndex={-1}
            className="bg-csc-superficie text-white w-full max-w-lg rounded-3xl shadow-2xl border border-white/12 overflow-hidden animate-scale-in my-8 outline-none"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield size={22} className="text-csc-gold" />
                <h3 id="clube-adversario-titulo" className="font-black text-lg">
                  {emEdicao ? 'Editar adversário' : 'Criar novo adversário'}
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
                <label className={ETIQUETA} htmlFor="clube-adversario-nome">Nome da equipa *</label>
                <input
                  id="clube-adversario-nome"
                  type="text"
                  required
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Grupo Desportivo Pescadores"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-adversario-sigla">Sigla</label>
                <input
                  id="clube-adversario-sigla"
                  type="text"
                  value={sigla}
                  onChange={e => setSigla(e.target.value)}
                  placeholder="Ex: GDPCC"
                  className={CAMPO}
                />
                <p className="text-[11px] text-white/70 mt-1 font-medium">
                  É esta que aparece nos placares e nas tabelas.
                </p>
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-adversario-emblema">Símbolo</label>
                {emblemaAtual && !emblemaNovo && (
                  <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <img
                      src={emblemaAtual}
                      alt="Símbolo atual"
                      className="w-10 h-10 object-contain p-1 bg-white rounded-lg border border-white/20"
                    />
                    <span className="text-xs text-white/60 font-medium truncate flex-1">Símbolo atualmente guardado</span>
                  </div>
                )}
                <input
                  id="clube-adversario-emblema"
                  type="file"
                  accept="image/*"
                  onChange={e => setEmblemaNovo(e.target.files ? e.target.files[0] : null)}
                  className="w-full px-4 py-2 border border-white/15 rounded-xl text-xs bg-white/5 text-white/70 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-csc-gold file:text-csc-tinta"
                />
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-adversario-campo">Campo habitual</label>
                <select
                  id="clube-adversario-campo"
                  value={campoHabitual}
                  onChange={e => setCampoHabitual(e.target.value)}
                  className={CAMPO}
                >
                  <option value="">— Nenhum campo habitual associado —</option>
                  {campos.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.address ? ` · ${c.address}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-adversario-contacto">Pessoa de contacto</label>
                <input
                  id="clube-adversario-contacto"
                  type="text"
                  value={contacto}
                  onChange={e => setContacto(e.target.value)}
                  placeholder="Ex: Sr. Carlos Diretor"
                  className={CAMPO}
                />
              </div>

              <div>
                <label className={ETIQUETA} htmlFor="clube-adversario-telefone">Telefone</label>
                <input
                  id="clube-adversario-telefone"
                  type="text"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  placeholder="Ex: 910 000 000"
                  className={CAMPO}
                />
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
                  disabled={aEnviar}
                  className="px-6 py-2.5 bg-csc-gold text-csc-tinta rounded-xl font-black text-sm hover:brightness-95 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  {aEnviar ? (
                    <span>A enviar dados...</span>
                  ) : (
                    <>
                      <Save size={16} className="text-csc-tinta" />
                      <span>{emEdicao ? 'Atualizar adversário' : 'Guardar adversário'}</span>
                    </>
                  )}
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
        confirmText="Sim, eliminar adversário"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={confirmacao.onConfirm}
        onCancel={() => setConfirmacao(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Ficha do adversário (ecrã 9h) */}
      <FichaAdversario
        adversario={adversarioAberto}
        campoPrincipal={
          adversarioAberto ? (campos.find(c => c.id === adversarioAberto.home_field_id) ?? null) : null
        }
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={fecharFicha}
        aoEditar={() => {
          if (!adversarioAberto) return
          const alvo = adversarioAberto
          fecharFicha()
          abrirEdicao(alvo)
        }}
        aoEliminar={() => {
          if (!adversarioAberto) return
          const alvo = adversarioAberto
          fecharFicha()
          eliminar(alvo.id, alvo.name)
        }}
      />
    </div>
  )
}

export default GestaoAdversarios
