import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, MapPin, Trash2, ExternalLink, Save, User, Phone, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import Modal from '../Modal'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { useVoltarDaFicha } from '../../hooks/useVoltarDaFicha'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { ConfirmModal } from '../ConfirmModal'
import { FichaAdversario } from './FichaAdversario'
import { formatClubSigla } from '../../lib/siglas'
import { CAMPO, ETIQUETA, urlDoGoogleMaps, type Adversario, type Campo } from './comum'
import { mensagemDeErro } from '../../lib/erros'
import { BotaoIcone, EstadoVazio, Botao, BotaoCriar } from '../ui'
import { ProcuraEFiltros } from '../ProcuraEFiltros'
import type { PropsDaSeccao } from './seccao'

/*
  Adversários (ecrã 9d), com a ficha de cada um (9h) no endereço.

  Era um separador do `AdminDashboard`; hoje é um ecrã aberto a partir do
  Clube. Precisa dos campos além dos adversários, para o "campo habitual".
*/

export const GestaoAdversarios: React.FC<PropsDaSeccao> = ({ cabecalho }) => {
  const { clubSettings } = useClub()
  const [params, setParams] = useSearchParams()

  const [adversarios, setAdversarios] = useState<Adversario[]>([])
  const [carregado, setCarregado] = useState(false)
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
    setCarregado(true)
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
      toast.error('Erro ao guardar adversário: ' + mensagemDeErro(err))
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

  const eliminar = (id: string, nomeDoAdversario: string) => {
    setConfirmacao({
      isOpen: true,
      title: 'Eliminar adversário',
      description: `Tens a certeza que queres eliminar o adversário "${nomeDoAdversario}"?`,
      onConfirm: async () => {
        setConfirmacao(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('opponents').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar adversário: ' + mensagemDeErro(error))
          return
        }
        toast.success('Adversário eliminado!')
        carregar()
      },
    })
  }

  const adversarioAberto = adversarios.find(a => a.id === params.get('adversario')) ?? null
  /* Aberta enquanto a lista carrega; um adversário que já não existe volta à
     lista em vez de ficar a carregar. */
  const fichaAberta = params.has('adversario') && (!carregado || Boolean(adversarioAberto))

  const abrirFicha = (id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set('adversario', id)
    setParams(seguintes)
  }

  const { voltarPara, aoVoltar: fecharFicha } = useVoltarDaFicha(['adversario'], 'Adversários')

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
      {cabecalho(<BotaoCriar rotulo="Criar adversário" onClick={abrirCriacao} />)}
      <ProcuraEFiltros
        procura={procura}
        aoProcurar={setProcura}
        placeholder="Equipa, sigla, contacto ou campo"
        rotulo="Procurar adversários"
        contagem={`${filtrados.length} de ${adversarios.length}`}
        aoLimpar={() => setProcura('')}
      />

      <div className="cartao-simples text-white p-4 space-y-3">

        {filtrados.length === 0 ? (
          <EstadoVazio icone={Shield} titulo="Nenhum adversário encontrado." texto="Tenta mudar a procura ou cria um adversário novo." />
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
                        className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-csc-red/60 hover:text-csc-vermelho-texto text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                      >
                        <MapPin size={13} className="text-csc-vermelho-texto shrink-0" />
                        <span>Ver campo</span>
                        <ExternalLink size={10} className="opacity-50" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-white/65 italic">Sem campo associado</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      <BotaoIcone rotulo={`Editar o adversário ${a.name}`} icone={Pencil} onClick={() => abrirEdicao(a)} />
                      <BotaoIcone rotulo={`Eliminar o adversário ${a.name}`} icone={Trash2} perigo onClick={() => eliminar(a.id, a.name)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Criar ou editar adversário (ecrã 9e) */}
      <Modal
        isOpen={modalAberto}
        onClose={guarda.tentarFechar}
        title={emEdicao ? 'Editar adversário' : 'Criar novo adversário'}
        icon={<Shield size={20} className="text-csc-gold" aria-hidden="true" />}
        closeOnOverlayClick={false}
      >
        <form onSubmit={e => { e.preventDefault(); gravar() }} className="space-y-4">
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
            <Botao aparencia="vidro" onClick={guarda.tentarFechar}>Cancelar</Botao>
            <Botao type="submit" disabled={aEnviar}>
              <Save size={16} aria-hidden="true" />
              <span>{aEnviar ? 'A guardar…' : emEdicao ? 'Guardar alterações' : 'Criar adversário'}</span>
            </Botao>
          </div>
        </form>
      </Modal>

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
        aberto={fichaAberta}
        adversario={adversarioAberto}
        campoPrincipal={
          adversarioAberto ? (campos.find(c => c.id === adversarioAberto.home_field_id) ?? null) : null
        }
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={fecharFicha}
        voltarPara={voltarPara}
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
