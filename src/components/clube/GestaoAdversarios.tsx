import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, Trash2, Save, Pencil, Shirt, RefreshCw } from 'lucide-react'
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
import { CAMPO, ETIQUETA, type Adversario, type Campo } from './comum'
import { mensagemDeErro } from '../../lib/erros'
import { BotaoIcone, EstadoVazio, Botao, BotaoCriar } from '../ui'
import { ProcuraEFiltros } from '../ProcuraEFiltros'
import {
  BadgeCoresEquipamento,
  formatarCoresEquipamento,
  separarCoresDigitadas,
  CORES_EQUIPAMENTO_SUGERIDAS,
} from './equipamentos'
import {
  sincronizarEquipasEOficiais,
  obterCampoEquipaOficial,
  obterEquipamentoEquipaOficial,
  obterEmblemaEfetivo,
} from '../../lib/sincronizarEquipas'
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
  const [sincronizando, setSincronizando] = useState(false)
  const sincronizacaoExecutadaRef = useRef(false)

  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [sigla, setSigla] = useState('')
  const [contacto, setContacto] = useState('')
  const [telefone, setTelefone] = useState('')
  const [campoHabitual, setCampoHabitual] = useState('')
  const [homeKitColor1, setHomeKitColor1] = useState('')
  const [homeKitColor2, setHomeKitColor2] = useState('')
  const [awayKitColor1, setAwayKitColor1] = useState('')
  const [awayKitColor2, setAwayKitColor2] = useState('')
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
    const advs = (resAdv.data as Adversario[]) ?? []
    const cmps = (resCampos.data as Campo[]) ?? []
    setAdversarios(advs)
    setCampos(cmps)
    setCarregado(true)

    // Sincronização automática transparente: se equipas estiverem sem campo, equipamentos ou emblema
    const precisaSincronizar = advs.some(a => !a.home_field_id || !a.home_kit_color_1 || !a.logo_url) || advs.length < 14
    if (precisaSincronizar && !sincronizacaoExecutadaRef.current) {
      sincronizacaoExecutadaRef.current = true
      executarSincronizacao(true)
    }
  }

  const executarSincronizacao = async (silencioso = false) => {
    if (sincronizando) return
    setSincronizando(true)
    if (!silencioso) {
      toast.info('A sincronizar equipas oficiais, campos e equipamentos…')
    }
    try {
      const res = await sincronizarEquipasEOficiais()
      const [resAdv, resCampos] = await Promise.all([
        supabase.from('opponents').select('*').order('name'),
        supabase.from('fields').select('*').order('name'),
      ])
      setAdversarios((resAdv.data as Adversario[]) ?? [])
      setCampos((resCampos.data as Campo[]) ?? [])
      if (!silencioso) {
        toast.success(`Sincronização concluída! ${res.equipasAtualizadas} equipas e ${res.camposAtualizados} campos sincronizados.`)
      }
    } catch (err: any) {
      console.error('Erro ao sincronizar equipas:', err)
      if (!silencioso) {
        toast.error('Erro ao sincronizar equipas: ' + mensagemDeErro(err))
      }
    } finally {
      setSincronizando(false)
    }
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
    setHomeKitColor1('')
    setHomeKitColor2('')
    setAwayKitColor1('')
    setAwayKitColor2('')
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
    setHomeKitColor1(a.home_kit_color_1 || '')
    setHomeKitColor2(a.home_kit_color_2 || '')
    setAwayKitColor1(a.away_kit_color_1 || '')
    setAwayKitColor2(a.away_kit_color_2 || '')
    setEmblemaAtual(a.logo_url || null)
    setEmblemaNovo(null)
    setModalAberto(true)
  }

  const aoMudarCor = (tipo: 'home' | 'away', num: 1 | 2, valor: string) => {
    if (num === 1) {
      const separadas = separarCoresDigitadas(valor)
      if (separadas) {
        if (tipo === 'home') {
          setHomeKitColor1(separadas.cor1)
          setHomeKitColor2(separadas.cor2)
        } else {
          setAwayKitColor1(separadas.cor1)
          setAwayKitColor2(separadas.cor2)
        }
        return
      }
    }
    if (tipo === 'home') {
      if (num === 1) setHomeKitColor1(valor)
      else setHomeKitColor2(valor)
    } else {
      if (num === 1) setAwayKitColor1(valor)
      else setAwayKitColor2(valor)
    }
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
        home_kit_color_1: homeKitColor1.trim() || null,
        home_kit_color_2: homeKitColor2.trim() || null,
        away_kit_color_1: awayKitColor1.trim() || null,
        away_kit_color_2: awayKitColor2.trim() || null,
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
    valores: [
      emEdicao,
      nome,
      sigla,
      contacto,
      telefone,
      campoHabitual,
      emblemaNovo?.name ?? null,
      homeKitColor1,
      homeKitColor2,
      awayKitColor1,
      awayKitColor2,
    ],
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
    let campo = campos.find(c => c.id === a.home_field_id)
    if (!campo) {
      const ofc = obterCampoEquipaOficial(a.name)
      if (ofc) campo = { id: '', name: ofc.nome, address: ofc.morada }
    }
    const ofcEq = obterEquipamentoEquipaOficial(a.name)
    const hk1 = a.home_kit_color_1 || ofcEq?.home1
    const hk2 = a.home_kit_color_2 || ofcEq?.home2
    const ak1 = a.away_kit_color_1 || ofcEq?.away1
    const ak2 = a.away_kit_color_2 || ofcEq?.away2

    return (
      a.name.toLowerCase().includes(q) ||
      (a.initials && a.initials.toLowerCase().includes(q)) ||
      (a.contact_name && a.contact_name.toLowerCase().includes(q)) ||
      (a.contact_phone && a.contact_phone.includes(q)) ||
      (campo && (campo.name.toLowerCase().includes(q) || (campo.address && campo.address.toLowerCase().includes(q)))) ||
      (hk1 && hk1.toLowerCase().includes(q)) ||
      (hk2 && hk2.toLowerCase().includes(q)) ||
      (ak1 && ak1.toLowerCase().includes(q)) ||
      (ak2 && ak2.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-4">
      {cabecalho(
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); executarSincronizacao(false) }}
            disabled={sincronizando}
            aria-label="Sincronizar equipas oficiais e campos habituais"
            className="h-11 px-3.5 rounded-[18px] bg-white/8 hover:bg-white/12 text-white
              font-display font-extrabold text-[11px] flex items-center gap-2 shrink-0 cursor-pointer
              transition-transform duration-150 active:scale-97 disabled:opacity-50
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            <RefreshCw size={14} className={sincronizando ? 'animate-spin text-csc-gold' : 'text-csc-gold'} />
            <span>{sincronizando ? 'A sincronizar…' : 'Sincronizar dados oficiais'}</span>
          </button>
          <BotaoCriar rotulo="Criar adversário" onClick={abrirCriacao} />
        </div>
      )}
      <ProcuraEFiltros
        procura={procura}
        aoProcurar={setProcura}
        placeholder="Equipa, sigla, contacto ou campo"
        rotulo="Procurar adversários"
        contagem={`${filtrados.length} de ${adversarios.length}`}
        aoLimpar={() => setProcura('')}
      />

      {/* Um cartão, e os adversários como linhas lá dentro (a app mais leve,
          2026-09-26). Cada um era um cartão dentro do cartão, com o contacto,
          um "Ver campo" em caixa e os dois botões em caixa por baixo de um
          fio — o campo e o contacto vivem na ficha, que a linha abre. */}
      <div className="cartao-simples text-white overflow-hidden">

        {filtrados.length === 0 ? (
          <EstadoVazio icone={Shield} titulo="Nenhum adversário encontrado." texto="Tenta mudar a procura ou cria um adversário novo." />
        ) : (
          <div>
            {filtrados.map(a => {
              let campo = campos.find(c => c.id === a.home_field_id)
              if (!campo) {
                const ofcCampo = obterCampoEquipaOficial(a.name)
                if (ofcCampo) {
                  const cExistente = campos.find(c => c.name.toLowerCase().trim() === ofcCampo.nome.toLowerCase().trim())
                  campo = cExistente ?? { id: 'ofc-' + a.id, name: ofcCampo.nome, address: ofcCampo.morada }
                }
              }

              const ofcEquip = obterEquipamentoEquipaOficial(a.name)
              const homeKit1 = a.home_kit_color_1 || ofcEquip?.home1 || null
              const homeKit2 = a.home_kit_color_2 || ofcEquip?.home2 || null
              const awayKit1 = a.away_kit_color_1 || ofcEquip?.away1 || null
              const awayKit2 = a.away_kit_color_2 || ofcEquip?.away2 || null
              const emblemaSrc = obterEmblemaEfetivo(a.logo_url, a.name, a.initials)

              return (
                <div key={a.id} className="linha-leve flex items-center gap-2 pl-4 pr-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => abrirFicha(a.id)}
                    aria-label={`Ver a ficha do adversário ${a.name}`}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-11 cursor-pointer rounded-xl transition-transform duration-150 active:scale-97 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
                  >
                    {/* Sem emblema desenha-se um escudo, nunca as iniciais: a
                        sigla já vai na letra pequena. */}
                    {emblemaSrc ? (
                      <img src={emblemaSrc} alt="" className="w-10 h-10 object-contain bg-white rounded-full p-1 shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0" aria-hidden="true">
                        <Shield size={17} className="text-white/45" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-display font-extrabold text-[13.5px] text-white truncate">{a.name}</span>
                      <span className="block text-[11px] text-white/55 mt-0.5 truncate">
                        {[a.initials, campo?.name ?? 'Sem campo associado'].filter(Boolean).join(' · ')}
                      </span>
                      {(homeKit1 || awayKit1) && (
                        <span className="flex items-center gap-2 mt-1 text-[10px] text-white/70">
                          {homeKit1 && (
                            <span className="inline-flex items-center gap-1 bg-white/6 px-1.5 py-0.5 rounded-md">
                              <BadgeCoresEquipamento cor1={homeKit1} cor2={homeKit2} tamanho="pequeno" />
                              <span className="truncate">{formatarCoresEquipamento(homeKit1, homeKit2)}</span>
                            </span>
                          )}
                          {awayKit1 && awayKit1.toUpperCase() !== 'X' && (
                            <span className="inline-flex items-center gap-1 bg-white/6 px-1.5 py-0.5 rounded-md">
                              <BadgeCoresEquipamento cor1={awayKit1} cor2={awayKit2} tamanho="pequeno" />
                              <span className="truncate">{formatarCoresEquipamento(awayKit1, awayKit2)}</span>
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center shrink-0">
                    <BotaoIcone discreto rotulo={`Editar o adversário ${a.name}`} icone={Pencil} onClick={() => abrirEdicao(a)} />
                    <BotaoIcone discreto rotulo={`Eliminar o adversário ${a.name}`} icone={Trash2} perigo onClick={() => eliminar(a.id, a.name)} />
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
              <div className="flex items-center gap-3 mb-2 p-2 bg-white/5 rounded-xl">
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
              className="w-full px-4 py-2 rounded-xl text-xs bg-white/5 text-white/70 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-csc-gold file:text-csc-tinta"
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

          {/* Equipamentos / Camisolas (Casa e Fora) */}
          <div className="pt-2 border-t border-white/10 space-y-3">
            <div>
              <span className="block font-display font-extrabold text-[10px] tracking-[0.14em] uppercase text-csc-gold">
                Cores dos equipamentos
              </span>
              <p className="text-[11px] text-white/60 mt-0.5">
                Indica as cores da camisola principal (em casa) e alternativa (fora). Podem ser até duas cores cada.
              </p>
            </div>

            {/* Camisola Principal (Em Casa) */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-[11px] text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Shirt size={13} className="text-csc-gold" /> Camisola Principal (Casa)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-white/70">
                    {formatarCoresEquipamento(homeKitColor1, homeKitColor2, 'Por definir')}
                  </span>
                  <BadgeCoresEquipamento cor1={homeKitColor1} cor2={homeKitColor2} tamanho="medio" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={ETIQUETA} htmlFor="clube-adv-home-cor1">Cor principal</label>
                  <input
                    id="clube-adv-home-cor1"
                    type="text"
                    list="lista-cores-sugeridas-adv"
                    value={homeKitColor1}
                    onChange={e => aoMudarCor('home', 1, e.target.value)}
                    placeholder="Ex: Vermelho"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="clube-adv-home-cor2">2.ª cor (opcional)</label>
                  <input
                    id="clube-adv-home-cor2"
                    type="text"
                    list="lista-cores-sugeridas-adv"
                    value={homeKitColor2}
                    onChange={e => aoMudarCor('home', 2, e.target.value)}
                    placeholder="Ex: Branco"
                    className={CAMPO}
                  />
                </div>
              </div>
            </div>

            {/* Camisola Alternativa (Fora) */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-[11px] text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Shirt size={13} className="text-csc-gold" /> Camisola Alternativa (Fora)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] font-bold text-white/70">
                    {formatarCoresEquipamento(awayKitColor1, awayKitColor2, 'Por definir (X)')}
                  </span>
                  <BadgeCoresEquipamento cor1={awayKitColor1} cor2={awayKitColor2} tamanho="medio" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={ETIQUETA} htmlFor="clube-adv-away-cor1">Cor principal</label>
                  <input
                    id="clube-adv-away-cor1"
                    type="text"
                    list="lista-cores-sugeridas-adv"
                    value={awayKitColor1}
                    onChange={e => aoMudarCor('away', 1, e.target.value)}
                    placeholder="Ex: Verde"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="clube-adv-away-cor2">2.ª cor (opcional)</label>
                  <input
                    id="clube-adv-away-cor2"
                    type="text"
                    list="lista-cores-sugeridas-adv"
                    value={awayKitColor2}
                    onChange={e => aoMudarCor('away', 2, e.target.value)}
                    placeholder="Ex: Preto"
                    className={CAMPO}
                  />
                </div>
              </div>
            </div>

            <datalist id="lista-cores-sugeridas-adv">
              {CORES_EQUIPAMENTO_SUGERIDAS.map(cor => (
                <option key={cor} value={cor} />
              ))}
            </datalist>
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
          adversarioAberto
            ? (() => {
                const cEncontrado = campos.find(c => c.id === adversarioAberto.home_field_id)
                if (cEncontrado) return cEncontrado
                const ofc = obterCampoEquipaOficial(adversarioAberto.name)
                if (!ofc) return null
                const cExistente = campos.find(c => c.name.toLowerCase().trim() === ofc.nome.toLowerCase().trim())
                return cExistente ?? { id: 'ofc-' + adversarioAberto.id, name: ofc.nome, address: ofc.morada }
              })()
            : null
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
