import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Trash2, Save, Pencil, Star, Shield } from 'lucide-react'
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
import { formatClubSigla, formatOpponentSigla } from '../../lib/siglas'
import { CAMPO, ETIQUETA, type Campo, type Adversario } from './comum'
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
  const { clubSettings, refreshSettings } = useClub()
  const [params, setParams] = useSearchParams()

  const [campos, setCampos] = useState<Campo[]>([])
  const [adversarios, setAdversarios] = useState<Adversario[]>([])
  const [carregado, setCarregado] = useState(false)
  const [procura, setProcura] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [morada, setMorada] = useState('')
  const [associarClube, setAssociarClube] = useState(false)
  const [adversariosSelecionados, setAdversariosSelecionados] = useState<string[]>([])
  const [pesquisaEquipas, setPesquisaEquipas] = useState('')

  const [confirmacao, setConfirmacao] = useState<{
    isOpen: boolean
    title: string
    description?: string
    onConfirm: () => void | Promise<void>
  }>({ isOpen: false, title: '', onConfirm: () => {} })

  const carregar = async () => {
    const [resCampos, resAdversarios] = await Promise.all([
      supabase.from('fields').select('*').order('name'),
      supabase.from('opponents').select('*').order('name'),
    ])
    setCampos((resCampos.data as Campo[]) ?? [])
    setAdversarios((resAdversarios.data as Adversario[]) ?? [])
    setCarregado(true)
  }

  useEffect(() => { carregar() }, [])

  const abrirCriacao = () => {
    triggerHaptic('light')
    setEmEdicao(null)
    setNome('')
    setMorada('')
    setAssociarClube(false)
    setAdversariosSelecionados([])
    setPesquisaEquipas('')
    setModalAberto(true)
  }

  const abrirEdicao = (c: Campo) => {
    triggerHaptic('light')
    setEmEdicao(c.id)
    setNome(c.name)
    setMorada(c.address || '')
    setAssociarClube(Boolean(clubSettings?.home_field_id === c.id))
    setAdversariosSelecionados(
      adversarios.filter(a => a.home_field_id === c.id).map(a => a.id)
    )
    setPesquisaEquipas('')
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

    let fieldId = emEdicao
    if (emEdicao) {
      const { error } = await supabase.from('fields').update(valores).eq('id', emEdicao)
      if (error) {
        setAGravar(false)
        toast.error(`Erro ao atualizar campo: ${mensagemDeErro(error)}`)
        return
      }
    } else {
      const { data, error } = await supabase.from('fields').insert([valores]).select().single()
      if (error || !data) {
        setAGravar(false)
        toast.error(`Erro ao criar campo: ${mensagemDeErro(error)}`)
        return
      }
      fieldId = data.id
    }

    // 1. Atualizar associação com o Clube (bidirecional)
    const eraCasaDoClube = clubSettings?.home_field_id === fieldId
    if (associarClube && !eraCasaDoClube && fieldId) {
      await supabase.from('club_settings').update({ home_field_id: fieldId }).eq('id', 1)
      localStorage.setItem('csc_club_home_field_id', fieldId)
      await refreshSettings()
    } else if (!associarClube && eraCasaDoClube) {
      await supabase.from('club_settings').update({ home_field_id: null }).eq('id', 1)
      localStorage.removeItem('csc_club_home_field_id')
      await refreshSettings()
    }

    // 2. Atualizar associação com equipas adversárias (um campo pode ter múltiplas equipas)
    if (fieldId) {
      const advsAnteriores = adversarios.filter(a => a.home_field_id === fieldId).map(a => a.id)
      const deselecionados = advsAnteriores.filter(id => !adversariosSelecionados.includes(id))
      const novos = adversariosSelecionados.filter(id => !advsAnteriores.includes(id))

      if (deselecionados.length > 0) {
        await supabase.from('opponents').update({ home_field_id: null }).in('id', deselecionados)
      }
      if (novos.length > 0) {
        await supabase.from('opponents').update({ home_field_id: fieldId }).in('id', novos)
      }
    }

    setAGravar(false)
    toast.success(emEdicao ? 'Campo atualizado com sucesso!' : 'Campo criado com sucesso!')
    setModalAberto(false)
    carregar()
  }

  /* Um campo meio preenchido não se perde por um Escape. */
  const guarda = useAlteracoesPorGravar({
    aberto: modalAberto,
    valores: [emEdicao, nome, morada, associarClube, adversariosSelecionados.slice().sort().join(',')],
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
        if (clubSettings?.home_field_id === id) {
          await supabase.from('club_settings').update({ home_field_id: null }).eq('id', 1)
          localStorage.removeItem('csc_club_home_field_id')
          await refreshSettings()
        }
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
              const advsDoCampo = adversarios.filter(a => a.home_field_id === c.id)
              return (
                <div key={c.id} className="linha-leve flex items-center gap-2 pl-4 pr-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => abrirFicha(c.id)}
                    aria-label={`Ver a ficha do campo ${c.name}`}
                    className="flex-1 min-w-0 text-left min-h-11 cursor-pointer rounded-xl transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    <span className="block font-display font-extrabold text-[13.5px] text-white truncate">{c.name}</span>
                    <span className="block text-[11px] mt-0.5 truncate text-white/55">
                      {c.address || 'Sem morada definida'}
                    </span>
                    {(eCasaDoClube || advsDoCampo.length > 0) && (
                      <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {eCasaDoClube && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-csc-gold/18 text-csc-gold border border-csc-gold/30">
                            <Star size={10} /> Casa do {formatClubSigla(clubSettings?.initials)}
                          </span>
                        )}
                        {advsDoCampo.map(a => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/8 text-white/80 border border-white/10"
                          >
                            <Shield size={10} className="text-white/50" />
                            {a.initials || formatOpponentSigla(a)}
                          </span>
                        ))}
                      </span>
                    )}
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

          {/* Equipas associadas ao campo */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <div>
              <span className={ETIQUETA}>Equipas associadas</span>
              <p className="text-[11px] text-white/60 mt-0.5">
                Um campo pode estar associado ao clube e a várias equipas adversárias em simultâneo.
              </p>
            </div>

            {/* Clube */}
            <label className="cartao-simples p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
                  <Star size={16} />
                </div>
                <div className="min-w-0">
                  <span className="block font-display font-bold text-xs text-white truncate">
                    {clubSettings?.name || 'Clube'} ({formatClubSigla(clubSettings?.initials)})
                  </span>
                  <span className="block text-[10px] text-white/60">
                    Campo de casa oficial do clube
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={associarClube}
                onChange={e => {
                  triggerHaptic('selection')
                  setAssociarClube(e.target.checked)
                }}
                className="w-5 h-5 rounded accent-csc-gold cursor-pointer"
              />
            </label>

            {/* Adversários */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span className="font-semibold">Equipas adversárias ({adversariosSelecionados.length} associadas)</span>
              </div>

              {adversarios.length > 5 && (
                <input
                  type="text"
                  placeholder="Procurar equipa adversária..."
                  value={pesquisaEquipas}
                  onChange={e => setPesquisaEquipas(e.target.value)}
                  className="w-full text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-white/40 focus:outline-none focus:border-csc-gold"
                />
              )}

              {adversarios.length === 0 ? (
                <p className="text-[11px] text-white/50 italic py-1">
                  Ainda não existem equipas adversárias registadas.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 -mr-1">
                  {adversarios
                    .filter(a => {
                      if (!pesquisaEquipas.trim()) return true
                      const q = pesquisaEquipas.toLowerCase()
                      return (
                        a.name.toLowerCase().includes(q) ||
                        (a.initials && a.initials.toLowerCase().includes(q))
                      )
                    })
                    .map(a => {
                      const selecionado = adversariosSelecionados.includes(a.id)
                      const outroCampo = a.home_field_id && a.home_field_id !== emEdicao
                        ? campos.find(c => c.id === a.home_field_id)
                        : null

                      return (
                        <label
                          key={a.id}
                          className={`flex items-center justify-between gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                            selecionado
                              ? 'bg-csc-green/15 border-csc-gold/40 text-white'
                              : 'bg-white/4 border-white/8 text-white/80 hover:bg-white/8'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {a.logo_url ? (
                              <img src={a.logo_url} alt="" className="w-6 h-6 object-contain bg-white rounded-full p-0.5 shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/40">
                                <Shield size={13} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="block font-display font-medium text-xs text-white truncate">
                                {a.name}
                                {a.initials ? ` (${a.initials})` : ''}
                              </span>
                              {outroCampo && (
                                <span className="block text-[9.5px] text-white/45 truncate">
                                  Atualmente em: {outroCampo.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={selecionado}
                            onChange={() => {
                              triggerHaptic('selection')
                              setAdversariosSelecionados(prev =>
                                selecionado ? prev.filter(id => id !== a.id) : [...prev, a.id]
                              )
                            }}
                            className="w-4 h-4 rounded accent-csc-gold cursor-pointer shrink-0 mr-1"
                          />
                        </label>
                      )
                    })}
                </div>
              )}
            </div>
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
