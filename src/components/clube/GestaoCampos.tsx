import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Trash2, Save, Pencil } from 'lucide-react'
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
import { CAMPO, ETIQUETA, type Campo } from './comum'
import { mensagemDeErro } from '../../lib/erros'
import { BotaoIcone, EstadoVazio, Botao, BotaoCriar } from '../ui'
import { ProcuraEFiltros } from '../ProcuraEFiltros'
import type { PropsDaSeccao } from './seccao'

/*
  Campos (ecrã 9f), com a ficha de cada um (9i) no endereço.

  Era um separador do `AdminDashboard`, a página que o handoff diz que não
  devia existir: "tudo o que era gestão vive no ecrã Clube". Hoje é um ecrã
  próprio, aberto a partir do Clube — e por isso trata dos seus próprios
  dados, em vez de os receber de uma página que carregava tudo de uma vez.
*/

export const GestaoCampos: React.FC<PropsDaSeccao> = ({ cabecalho }) => {
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
      {cabecalho(<BotaoCriar rotulo="Criar campo" onClick={abrirCriacao} />)}
      <ProcuraEFiltros
        procura={procura}
        aoProcurar={setProcura}
        placeholder="Nome ou morada"
        rotulo="Procurar campos"
        contagem={`${filtrados.length} de ${campos.length}`}
        aoLimpar={() => setProcura('')}
      />

      {/* Um cartão, e os campos como linhas lá dentro (a app mais leve,
          2026-09-26). O "Google Maps" em caixa saiu: está na ficha do campo,
          que a linha abre. */}
      <div className="cartao-simples text-white overflow-hidden">

        {filtrados.length === 0 ? (
          <EstadoVazio icone={MapPin} titulo="Nenhum campo encontrado." texto="Tenta mudar a procura ou cria um campo novo." />
        ) : (
          <div>
            {filtrados.map(c => {
              const eCasaDoClube = clubSettings?.home_field_id === c.id
              return (
                <div key={c.id} className="linha-leve flex items-center gap-2 pl-4 pr-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => abrirFicha(c.id)}
                    aria-label={`Ver a ficha do campo ${c.name}`}
                    className="flex-1 min-w-0 text-left min-h-11 cursor-pointer rounded-xl transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <span className="block font-display font-extrabold text-[13.5px] text-white truncate">{c.name}</span>
                    <span className="block text-[11px] mt-0.5 truncate">
                      {eCasaDoClube && (
                        <span className="font-bold text-csc-gold">Casa do {formatClubSigla(clubSettings?.initials)} · </span>
                      )}
                      <span className="text-white/55">{c.address || 'Sem morada definida'}</span>
                    </span>
                  </button>
                  <div className="flex items-center shrink-0">
                    <BotaoIcone discreto rotulo={`Editar o campo ${c.name}`} icone={Pencil} onClick={() => abrirEdicao(c)} />
                    <BotaoIcone discreto rotulo={`Eliminar o campo ${c.name}`} icone={Trash2} perigo onClick={() => eliminar(c.id, c.name)} />
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
