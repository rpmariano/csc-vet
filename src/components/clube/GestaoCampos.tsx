import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Trash2, ExternalLink, Save, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useClub } from '../../context/ClubContext'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import Modal from '../Modal'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { useVoltarDaFicha } from '../../hooks/useVoltarDaFicha'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { ConfirmModal } from '../ConfirmModal'
import { FichaCampo } from './FichaCampo'
import { formatClubSigla } from '../../lib/siglas'
import { CAMPO, ETIQUETA, urlDoGoogleMaps, type Campo } from './comum'
import { mensagemDeErro } from '../../lib/erros'
import { BotaoIcone, EstadoVazio, Botao, BotaoCriar } from '../ui'
import { ProcuraEFiltros } from '../ProcuraEFiltros'

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
  const [carregado, setCarregado] = useState(false)
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
    setCarregado(true)
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

  const [aGravar, setAGravar] = useState(false)

  const gravar = async () => {
    if (!nome.trim()) {
      toast.warning('O nome do campo é obrigatório.')
      return
    }
    const valores = { name: nome.trim(), address: morada.trim() }
    setAGravar(true)
    const { error } = emEdicao
      ? await supabase.from('fields').update(valores).eq('id', emEdicao)
      : await supabase.from('fields').insert([valores])
    setAGravar(false)

    if (error) {
      toast.error(`Erro ao ${emEdicao ? 'atualizar' : 'criar'} campo: ${mensagemDeErro(error)}`)
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

  const eliminar = (id: string, nomeDoCampo: string) => {
    setConfirmacao({
      isOpen: true,
      title: 'Eliminar campo',
      description: `Tens a certeza que queres eliminar o campo "${nomeDoCampo}"?`,
      onConfirm: async () => {
        setConfirmacao(prev => ({ ...prev, isOpen: false }))
        const { error } = await supabase.from('fields').delete().eq('id', id)
        if (error) {
          toast.error('Erro ao eliminar campo: ' + mensagemDeErro(error))
          return
        }
        toast.success('Campo eliminado!')
        carregar()
      },
    })
  }

  /* A ficha vai no endereço: dá link próprio e o retroceder do browser fecha. */
  const campoAberto = campos.find(c => c.id === params.get('campo')) ?? null
  /* Aberta enquanto a lista carrega; um campo que já não existe (um link
     antigo para um campo apagado) volta à lista em vez de ficar a carregar. */
  const fichaAberta = params.has('campo') && (!carregado || Boolean(campoAberto))

  const abrirFicha = (id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set('campo', id)
    setParams(seguintes)
  }

  const { voltarPara, aoVoltar: fecharFicha } = useVoltarDaFicha(['campo'], 'Campos')

  const filtrados = campos.filter(c => {
    const q = procura.toLowerCase().trim()
    if (!q) return true
    return c.name.toLowerCase().includes(q) || (c.address && c.address.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-4">
      <ProcuraEFiltros
        procura={procura}
        aoProcurar={setProcura}
        placeholder="Nome ou morada"
        rotulo="Procurar campos"
        contagem={`${filtrados.length} de ${campos.length}`}
        aoLimpar={() => setProcura('')}
        acao={
          <BotaoCriar rotulo="Criar campo" onClick={abrirCriacao} />
        }
      />

      <div className="cartao-simples text-white p-4 space-y-3">

        {filtrados.length === 0 ? (
          <EstadoVazio icone={MapPin} titulo="Nenhum campo encontrado." texto="Tenta mudar a procura ou cria um campo novo." />
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
                      className="px-2.5 py-1.5 bg-white/10 border border-white/10 hover:border-csc-red/60 hover:text-csc-vermelho-texto text-white/70 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <MapPin size={13} className="text-csc-vermelho-texto shrink-0" />
                      <span>Google Maps</span>
                      <ExternalLink size={10} className="opacity-50" />
                    </a>

                    <div className="flex items-center gap-1.5">
                      <BotaoIcone rotulo={`Editar o campo ${c.name}`} icone={Pencil} onClick={() => abrirEdicao(c)} />
                      <BotaoIcone rotulo={`Eliminar o campo ${c.name}`} icone={Trash2} perigo onClick={() => eliminar(c.id, c.name)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Criar ou editar campo (ecrã 9g) */}
      <Modal
        isOpen={modalAberto}
        onClose={guarda.tentarFechar}
        title={emEdicao ? 'Editar campo' : 'Criar novo campo'}
        icon={<MapPin size={20} className="text-csc-gold" aria-hidden="true" />}
        closeOnOverlayClick={false}
      >
        <form onSubmit={e => { e.preventDefault(); gravar() }} className="space-y-4">
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
            <Botao aparencia="vidro" onClick={guarda.tentarFechar}>Cancelar</Botao>
            <Botao type="submit" disabled={aGravar}>
              <Save size={16} aria-hidden="true" />
              <span>{aGravar ? 'A guardar…' : emEdicao ? 'Guardar alterações' : 'Criar campo'}</span>
            </Botao>
          </div>
        </form>
      </Modal>

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
        aberto={fichaAberta}
        campo={campoAberto}
        eCampoDoClube={Boolean(campoAberto && clubSettings?.home_field_id === campoAberto.id)}
        siglaClube={formatClubSigla(clubSettings?.initials)}
        aoFechar={fecharFicha}
        voltarPara={voltarPara}
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
