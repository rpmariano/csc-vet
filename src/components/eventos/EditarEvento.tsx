import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, ExternalLink, Search, Sparkles, Users, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { toast } from '../../context/ToastContext'
import { useClub } from '../../context/ClubContext'
import { extractRolesFromProfile, type Profile } from '../../context/AuthContext'
import { useAlteracoesPorGravar } from '../../hooks/useAlteracoesPorGravar'
import { getGoogleMapsUrl, getPlayerDisplayName } from '../../lib/eventos'
import { sincronizarJogoNaJornada, AVISO_SEM_EQUIPAS, type EventoParaJornada } from '../../lib/jornadaDoJogo'
import { parseMatchReportMetadata, buildDescriptionWithMatchReport } from '../MatchReportModal'
import { EcraDetalhe } from '../EcraDetalhe'
import { UnsavedChangesModal } from '../UnsavedChangesModal'
import { QuickFieldModal } from '../QuickFieldModal'
import { QuickOpponentModal } from '../QuickOpponentModal'
import { ResendCallupsModal } from '../ResendCallupsModal'
import { ConfirmModal } from '../ConfirmModal'
import { Botao } from '../ui'
import type { TournamentRules } from '../clube/torneios'

/**
 * Editar um evento — o mesmo ecrã na Agenda e nos Eventos.
 *
 * Existia em duas cópias, uma em cada página, e tinham divergido: data e hora
 * juntas numa e separadas na outra, o jogo intitulado "Jogo vs Adversário"
 * numa e "Jogo" na outra, a pergunta de reenvio sempre numa e só quando fazia
 * sentido na outra, as regras da prova (inscritos, suspensos, limite de
 * convocados, exceções de idade) só nos Eventos, a formação e as ocorrências
 * da ficha de jogo guardadas na descrição só numa, e o `max_players` apagado
 * pela outra a cada gravação. Este componente fica com o comportamento mais
 * completo de cada uma, e as duas páginas usam-no.
 *
 * **Tem o seu estado e a sua gravação.** A página diz que evento edita, que
 * listas há (plantel, campos, adversários, provas) e o que fazer depois de
 * gravar — tipicamente recarregar —, e mais nada.
 *
 * **Sair é sempre deliberado** (`sempre` no guarda): gravar pode reenviar os
 * pedidos de resposta ao plantel todo, por isso o "‹" pergunta sempre.
 *
 * **A convocatória é o que está em `callups`** (ver CLAUDE.md): um convocado
 * que entretanto ficou lesionado, inativo ou fora da prova continua marcado,
 * com o impedimento escrito, e pode ser tirado; quem não pode ir e não está
 * convocado não se pode marcar.
 */

export interface EventoEditavel {
  id: string
  title: string | null
  type: 'practice' | 'match' | 'gathering'
  date_time: string
  meeting_time?: string | null
  field_id?: string | null
  location?: string | null
  description?: string | null
  is_friendly?: boolean | null
  is_active?: boolean
  tournament_id?: string | null
  matchday?: number | null
  opponent_id?: string | null
  home_away?: 'home' | 'away' | 'neutral' | null
}

export interface CampoDoEvento { id: string; name: string; address?: string | null }
export interface AdversarioDoEvento { id: string; name: string; initials?: string | null; home_field_id?: string | null }
export interface ProvaDoEvento { id: string; name: string; season?: string | null }

/** Uma linha de `callups` do evento, com o atleta aninhado quando vem. */
export interface ConvocadoDoEvento {
  id: string
  player_id: string
  status: string
  player?: { id?: string } | null
}

/** O que foi gravado — a página junta-o ao evento que tem em memória. */
export type EventoGravado = EventoEditavel

export interface EditarEventoProps {
  /** O evento a editar; sem evento, o ecrã está fechado. */
  evento: EventoEditavel | null
  /** Nome do ecrã para onde o "‹" volta. */
  voltarPara: string
  /** Sair sem gravar (depois de confirmado pelo guarda). */
  aoFechar: () => void
  /** Depois de gravar: a página fecha o ecrã e recarrega o que precisar. */
  aoGravado: (gravado: EventoGravado) => void | Promise<void>
  /** A convocatória mudou (convocar, tirar, limpar): a página recarrega-a. */
  aoMudarConvocatoria: () => void | Promise<void>
  convocatorias: ConvocadoDoEvento[]
  plantel: Profile[]
  campos: CampoDoEvento[]
  adversarios: AdversarioDoEvento[]
  provas: ProvaDoEvento[]
  /** Um campo ou adversário criado aqui dentro entra nas listas da página. */
  aoCriarCampo: (campo: CampoDoEvento) => void
  aoCriarAdversario: (adversario: AdversarioDoEvento) => void
}

const CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40'

const ETIQUETA =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'

const ROTULO_TIPO = { match: 'Jogo', practice: 'Treino', gathering: 'Convívio' } as const

const nomeDoCampo = (c: CampoDoEvento) => (c.address ? `${c.name} (${c.address})` : c.name)

const idade = (nascimento: string) =>
  Math.floor((Date.now() - new Date(nascimento).getTime()) / 3.15576e10)

/** Um jogo de prova diz sempre em que jornada conta — é o que o põe na tabela. */
const faltaAJornada = (tipo: string, amigavel: boolean, prova: string, jornada: string) =>
  tipo === 'match' && !amigavel && Boolean(prova) && !Number(jornada)

const dataLocal = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { data: new Date().toISOString().split('T')[0], hora: '20:00' }
  const p = (n: number) => String(n).padStart(2, '0')
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

export const EditarEvento: React.FC<EditarEventoProps> = ({
  evento,
  voltarPara,
  aoFechar,
  aoGravado,
  aoMudarConvocatoria,
  convocatorias,
  plantel,
  campos,
  adversarios,
  provas,
  aoCriarCampo,
  aoCriarAdversario,
}) => {
  const { clubSettings } = useClub()

  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<EventoEditavel['type']>('practice')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('20:00')
  const [concentracao, setConcentracao] = useState('')
  const [campoId, setCampoId] = useState('')
  const [local, setLocal] = useState('')
  const [descricao, setDescricao] = useState('')
  const [amigavel, setAmigavel] = useState(false)
  const [provaId, setProvaId] = useState('')
  const [jornada, setJornada] = useState('')
  const [adversarioId, setAdversarioId] = useState('')
  const [casaFora, setCasaFora] = useState<'home' | 'away' | 'neutral'>('home')
  const [publicado, setPublicado] = useState(true)
  const [procura, setProcura] = useState('')

  const [perguntaReenvio, setPerguntaReenvio] = useState(false)
  const [aGravar, setAGravar] = useState(false)
  const [aConvocar, setAConvocar] = useState(false)
  // Guarda síncrona contra duplo toque: o estado só trava o botão no repaint
  // seguinte, e um segundo toque entretanto convocava em duplicado.
  const aConvocarRef = useRef(false)
  const [confirmarLimpar, setConfirmarLimpar] = useState(false)

  const [campoRapido, setCampoRapido] = useState({ aberto: false, nome: '', morada: '', aGravar: false })
  const [advRapido, setAdvRapido] = useState({
    aberto: false, nome: '', sigla: '', campoId: '', contacto: '', telefone: '', aGravar: false,
  })

  /* As regras da prova escolhida: quem está inscrito, quem está suspenso, e
     os limites. Carregam-se aqui, e não na página, para as duas páginas
     aplicarem as mesmas — a Agenda não as aplicava de todo. */
  const [inscritos, setInscritos] = useState<Set<string> | null>(null)
  const [suspensos, setSuspensos] = useState<Set<string>>(new Set())
  const [regras, setRegras] = useState<Partial<TournamentRules> | null>(null)

  const aberto = evento !== null

  // Preencher ao abrir outro evento.
  useEffect(() => {
    if (!evento) return
    const { data: d, hora: h } = dataLocal(evento.date_time)
    setTitulo(evento.title || '')
    setTipo(evento.type)
    setData(d)
    setHora(h)
    setConcentracao(evento.meeting_time ? evento.meeting_time.substring(0, 5) : '')
    setCampoId(evento.field_id || '')
    const campo = campos.find(c => c.id === evento.field_id)
    setLocal(evento.location || (campo ? nomeDoCampo(campo) : ''))
    setDescricao(parseMatchReportMetadata(evento.description).cleanDescription)
    setAmigavel(Boolean(evento.is_friendly))
    setProvaId(evento.tournament_id || '')
    setJornada(evento.matchday ? String(evento.matchday) : '')
    setAdversarioId(evento.opponent_id || '')
    setCasaFora(evento.home_away || 'home')
    setPublicado(evento.is_active !== false)
    setProcura('')
    // Só ao mudar de evento: os campos chegarem depois não repõe o formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento?.id])

  const provaDaConvocatoria = tipo === 'match' && !amigavel ? provaId : ''

  useEffect(() => {
    if (!aberto || !provaDaConvocatoria) {
      setInscritos(null)
      setSuspensos(new Set())
      setRegras(null)
      return
    }
    let cancelado = false
    Promise.all([
      supabase.from('tournament_players').select('player_id').eq('tournament_id', provaDaConvocatoria),
      supabase.from('tournament_suspensions').select('player_id, status').eq('tournament_id', provaDaConvocatoria),
      supabase.from('tournaments').select('rules').eq('id', provaDaConvocatoria).maybeSingle(),
    ]).then(([ins, sus, prova]) => {
      if (cancelado) return
      setInscritos(new Set(((ins.data ?? []) as { player_id: string }[]).map(l => l.player_id)))
      setSuspensos(new Set(
        ((sus.data ?? []) as { player_id: string; status: string }[])
          .filter(l => l.status === 'active')
          .map(l => l.player_id),
      ))
      setRegras(((prova.data as { rules?: Partial<TournamentRules> } | null)?.rules) ?? null)
    })
    return () => { cancelado = true }
  }, [aberto, provaDaConvocatoria])

  /* O campo de casa do clube: o de `club_settings`, e só na falta dele os
     restos de antes (o guardado no aparelho, um nome que o denuncie). */
  const campoDeCasa = useMemo(() => {
    const porId = (id?: string | null) => (id ? campos.find(c => c.id === id) : undefined)
    let guardado: string | null = null
    try { guardado = localStorage.getItem('csc_club_home_field_id') } catch { guardado = null }
    return porId(clubSettings?.home_field_id)
      ?? porId(guardado)
      ?? campos.find(c => /cascais|dram[aá]tico/i.test(c.name))
      ?? campos[0]
      ?? null
  }, [campos, clubSettings?.home_field_id])

  // Num jogo, o campo segue a condição: em casa é o do clube, fora o do adversário.
  useEffect(() => {
    if (!aberto || tipo !== 'match') return
    if (casaFora === 'home' && campoDeCasa) {
      setCampoId(campoDeCasa.id)
      setLocal(nomeDoCampo(campoDeCasa))
    } else if (casaFora === 'away' && adversarioId) {
      const adv = adversarios.find(a => a.id === adversarioId)
      const campo = adv?.home_field_id ? campos.find(c => c.id === adv.home_field_id) : undefined
      if (campo) {
        setCampoId(campo.id)
        setLocal(nomeDoCampo(campo))
      }
    }
  }, [aberto, tipo, casaFora, adversarioId, adversarios, campos, campoDeCasa])

  const guarda = useAlteracoesPorGravar({
    aberto,
    // A caixa de procura fica de fora: escrever nela não altera o evento.
    valores: [titulo, tipo, data, hora, concentracao, campoId, local, descricao, amigavel, provaId, jornada, adversarioId, casaFora, publicado],
    sempre: true,
    // Gravar a partir do aviso é o mesmo caminho do botão, com a pergunta de reenvio.
    aoGravar: () => pedirGravacao(),
    aoSair: aoFechar,
    descricao: 'As alterações a este evento ainda não foram gravadas. Se saíres agora, perdem-se.',
  })

  /* ------------------------------------------------------------ elegibilidade */

  /** Porque é que esta pessoa não pode ir a este evento; `null` se pode. */
  const impedimento = (p: Profile): string | null => {
    if (p.status === 'inactive') return 'Inativo'
    if (provaDaConvocatoria && inscritos) {
      if (!inscritos.has(p.id)) return 'Não inscrito na prova'
      if (suspensos.has(p.id)) return 'Suspenso'
    }
    if (tipo === 'gathering') return null
    // Jogos e treinos são de quem tem o papel de Jogador.
    if (!extractRolesFromProfile(p).includes('player')) return 'Não é jogador'
    if (p.status === 'injured') return 'Lesionado'
    return null
  }

  const convocadoDe = (p: Profile) =>
    convocatorias.find(c => c.player_id === p.id || c.player?.id === p.id)

  const aptos = plantel.filter(p => impedimento(p) === null)
  const porConvocar = aptos.filter(p => !convocadoDe(p))
  const eStaff = (p: Profile) => ['coach', 'admin'].includes(p.role)

  /* -------------------------------------------------------------- convocatória */

  const convocarVarios = async (quem: Profile[], texto: (n: number) => string) => {
    if (!evento || quem.length === 0 || aConvocarRef.current) return
    aConvocarRef.current = true
    setAConvocar(true)
    try {
      // Contra a base, e não contra a lista em memória: outra ação pode ter
      // convocado alguém entretanto.
      const { data: existentes } = await supabase.from('callups').select('player_id').eq('event_id', evento.id)
      const ja = new Set(((existentes ?? []) as { player_id: string }[]).map(c => c.player_id))
      const novos = Array.from(new Set(quem.map(p => p.id))).filter(id => !ja.has(id))
      if (novos.length > 0) {
        const linhas = novos.map(id => ({ event_id: evento.id, player_id: id, status: 'called' as const }))
        const { error } = await supabase.from('callups').upsert(linhas, { onConflict: 'event_id, player_id', ignoreDuplicates: true })
        if (error) {
          const { error: erroInsert } = await supabase.from('callups').insert(linhas)
          if (erroInsert) throw erroInsert
        }
      }
      await aoMudarConvocatoria()
      toast.success(novos.length > 0 ? texto(novos.length) : 'Já estavam todos convocados.')
    } catch (err) {
      toast.error('Erro ao convocar: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      aConvocarRef.current = false
      setAConvocar(false)
    }
  }

  const limpar = async () => {
    setConfirmarLimpar(false)
    if (!evento || aConvocarRef.current) return
    aConvocarRef.current = true
    setAConvocar(true)
    try {
      const { error } = await supabase.from('callups').delete().eq('event_id', evento.id)
      if (error) throw error
      await aoMudarConvocatoria()
      toast.info('Todos os convocados foram removidos.')
    } catch (err) {
      toast.error('Erro ao remover todos: ' + (err instanceof Error ? err.message : 'erro inesperado'))
    } finally {
      aConvocarRef.current = false
      setAConvocar(false)
    }
  }

  /** As regras da prova para mais um convocado: o limite e as exceções de idade. */
  const regraQueImpede = (p: Profile): string | null => {
    if (!regras) return null
    if (regras.max_match_players && convocatorias.length >= regras.max_match_players) {
      return `A convocatória atingiu o limite da prova (${regras.max_match_players} convocados).`
    }
    if (p.birth_date && regras.min_age && regras.exceptions_allowed && idade(p.birth_date) < regras.min_age) {
      const excecoes = convocatorias.filter(c => {
        const q = plantel.find(pl => pl.id === c.player_id)
        return q?.birth_date ? idade(q.birth_date) < (regras.min_age ?? 0) : false
      }).length
      if (excecoes >= (regras.exceptions_count ?? 0)) {
        return `Não podes convocar mais jogadores abaixo dos ${regras.min_age} anos. O limite (${regras.exceptions_count}) já foi atingido.`
      }
    }
    return null
  }

  const alternar = async (p: Profile) => {
    if (!evento) return
    /* Só pelo id: a linha é apagada a seguir, e por nome tirar um homónimo
       apagava a do outro, com a resposta dele dentro. */
    const existente = convocadoDe(p)
    if (existente) {
      const { error } = await supabase.from('callups').delete().eq('id', existente.id)
      if (error) toast.error('Erro ao remover: ' + error.message)
      else await aoMudarConvocatoria()
      return
    }
    const motivo = impedimento(p)
    if (motivo) {
      toast.warning(`${getPlayerDisplayName(p)} não pode ser convocado: ${motivo.toLowerCase()}.`)
      return
    }
    const regra = regraQueImpede(p)
    if (regra) {
      toast.error(regra)
      return
    }
    const { error } = await supabase.from('callups').upsert(
      [{ event_id: evento.id, player_id: p.id, status: 'called' }],
      { onConflict: 'event_id, player_id', ignoreDuplicates: true },
    )
    if (error) toast.error('Erro ao convocar: ' + error.message)
    else await aoMudarConvocatoria()
  }

  /* ------------------------------------------------------------------ gravar */

  /*
    A pergunta "reenviar o pedido de resposta?" só faz sentido quando há
    convocados e alguém vai ser avisado: num rascunho, ou sem convocatória,
    grava-se logo e as respostas ficam.
  */
  const pedirGravacao = () => {
    if (faltaAJornada(tipo, amigavel, provaId, jornada)) {
      toast.warning('Escolhe a jornada em que este jogo conta para a prova.')
      return
    }
    if (convocatorias.length === 0 || !publicado) {
      gravar(false)
      return
    }
    setPerguntaReenvio(true)
  }

  const aoSubmeter = (e: React.FormEvent) => {
    e.preventDefault()
    pedirGravacao()
  }

  const gravar = async (reenviar: boolean) => {
    if (!evento) return
    if (faltaAJornada(tipo, amigavel, provaId, jornada)) {
      toast.warning('Escolhe a jornada em que este jogo conta para a prova.')
      return
    }
    setAGravar(true)
    try {
      const adversario = adversarios.find(a => a.id === adversarioId)
      const prova = provas.find(t => t.id === provaId)
      // O mesmo título que o criar dá.
      const tituloFinal = tipo === 'match'
        ? (adversario ? `Jogo vs ${adversario.name}` : amigavel ? 'Jogo Amigável' : prova ? `Jogo ${prova.name}` : 'Jogo')
        : tipo === 'practice'
          ? 'Treino'
          : (titulo.trim() || 'Convívio')

      /* A formação e as ocorrências da ficha de jogo vivem na descrição, numa
         etiqueta escondida; a descrição que se edita é a limpa, e a etiqueta
         volta a juntar-se ao gravar. */
      const original = parseMatchReportMetadata(evento.description)
      const temFicha = (original.tacticalFormation !== '4-3-3' && original.tacticalFormation !== '1-4-3-3') || original.occurrences
      const descricaoFinal = temFicha
        ? buildDescriptionWithMatchReport(descricao, original.tacticalFormation, original.occurrences)
        : (descricao.trim() || null)

      const payload = {
        title: tituloFinal,
        type: tipo,
        date_time: new Date(`${data}T${hora}:00`).toISOString(),
        meeting_time: concentracao ? `${concentracao}:00` : null,
        field_id: campoId || null,
        // O campo ganha (`localDoEvento()`): o texto livre é só para eventos sem campo.
        location: !campoId ? (local.trim() || null) : null,
        description: descricaoFinal,
        is_friendly: tipo === 'match' ? amigavel : false,
        is_active: publicado,
        tournament_id: tipo === 'match' && !amigavel ? (provaId || null) : null,
        matchday: tipo === 'match' && !amigavel && provaId ? Number(jornada) : null,
        opponent_id: tipo === 'match' ? (adversarioId || null) : null,
        home_away: tipo === 'match' ? casaFora : null,
      }

      const { error } = await supabase.from('events').update(payload).eq('id', evento.id)
      if (error) throw error

      /* A jornada acompanha: mudar de prova, de jornada, de adversário ou de
         casa/fora reescreve a linha da tabela, e tirar a prova tira-o de lá. */
      const espelho = await sincronizarJogoNaJornada({ ...evento, ...payload } as unknown as EventoParaJornada)
      if (espelho.estado === 'sem-equipas') toast.warning(AVISO_SEM_EQUIPAS)
      if (espelho.estado === 'erro') toast.warning('O jogo ficou gravado, mas não entrou na tabela da prova: ' + espelho.mensagem)

      if (reenviar) {
        await supabase.from('callups').update({ status: 'called' }).eq('event_id', evento.id)
      }

      setPerguntaReenvio(false)
      guarda.marcarComoGravado()
      toast.success(reenviar
        ? 'Evento atualizado e pedidos de resposta reenviados.'
        : 'Evento atualizado.')
      await aoGravado({ ...evento, ...payload })
    } catch (err) {
      toast.error('Erro ao atualizar evento: ' + (err instanceof Error ? err.message : 'erro de ligação'))
    } finally {
      setAGravar(false)
    }
  }

  /* ----------------------------------------------------------- criar rápidos */

  const gravarCampoRapido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!campoRapido.nome.trim()) return
    setCampoRapido(c => ({ ...c, aGravar: true }))
    try {
      const novo = { id: crypto.randomUUID(), name: campoRapido.nome.trim(), address: campoRapido.morada.trim() || null }
      const { data: linha, error } = await supabase.from('fields').insert([novo]).select().single()
      if (error) throw error
      const campo = (linha as CampoDoEvento) || novo
      aoCriarCampo(campo)
      setCampoId(campo.id)
      setLocal(nomeDoCampo(campo))
      setCampoRapido({ aberto: false, nome: '', morada: '', aGravar: false })
      toast.success('Campo criado e escolhido.')
    } catch (err) {
      toast.error('Erro ao criar campo: ' + (err instanceof Error ? err.message : 'erro de ligação'))
      setCampoRapido(c => ({ ...c, aGravar: false }))
    }
  }

  const gravarAdversarioRapido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!advRapido.nome.trim()) return
    setAdvRapido(a => ({ ...a, aGravar: true }))
    try {
      const novo = {
        id: crypto.randomUUID(),
        name: advRapido.nome.trim(),
        initials: advRapido.sigla.trim() || null,
        home_field_id: advRapido.campoId || null,
        contact_name: advRapido.contacto.trim() || null,
        contact_phone: advRapido.telefone.trim() || null,
      }
      const { data: linha, error } = await supabase.from('opponents').insert([novo]).select().single()
      if (error) throw error
      const adversario = (linha as AdversarioDoEvento) || novo
      aoCriarAdversario(adversario)
      setAdversarioId(adversario.id)
      setAdvRapido({ aberto: false, nome: '', sigla: '', campoId: '', contacto: '', telefone: '', aGravar: false })
      toast.success('Adversário registado.')
    } catch (err) {
      toast.error('Erro ao criar adversário: ' + (err instanceof Error ? err.message : 'erro de ligação'))
      setAdvRapido(a => ({ ...a, aGravar: false }))
    }
  }

  /* ------------------------------------------------------------------ ecrã */

  const q = procura.trim().toLowerCase()
  const lista = plantel.filter(p =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.shirt_name?.toLowerCase().includes(q) ||
    p.nickname?.toLowerCase().includes(q) ||
    String(p.jersey_number ?? '').includes(q),
  )

  return (
    <>
      <EcraDetalhe
        aberto={aberto}
        voltarPara={voltarPara}
        aoVoltar={guarda.tentarFechar}
        sobrancelha="Editar evento"
        titulo={titulo.trim() || ROTULO_TIPO[tipo]}
      >
        <form onSubmit={aoSubmeter} className="space-y-4">
          <div>
            <p className={ETIQUETA}>Tipo de evento</p>
            <div className="w-full min-h-11 px-3.5 border border-white/10 bg-white/5 text-white rounded-[14px] text-xs font-black flex items-center justify-between">
              <span>{ROTULO_TIPO[tipo]}</span>
              <span className="text-[10px] font-bold text-white/70 bg-white/10 px-2 py-0.5 rounded-md">Tipo bloqueado</span>
            </div>
          </div>

          {tipo === 'gathering' && (
            <div>
              <label className={ETIQUETA} htmlFor="editar-evento-titulo">Título do convívio *</label>
              <input
                id="editar-evento-titulo"
                type="text"
                required
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                className={CAMPO}
                placeholder="Ex: Jantar de Natal / Reentré"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ETIQUETA} htmlFor="editar-evento-data">Data *</label>
              <input id="editar-evento-data" type="date" required value={data} onChange={e => setData(e.target.value)} className={CAMPO} />
            </div>
            <div>
              <label className={ETIQUETA} htmlFor="editar-evento-hora">Hora *</label>
              <input id="editar-evento-hora" type="time" required value={hora} onChange={e => setHora(e.target.value)} className={CAMPO} />
            </div>
          </div>

          <div>
            <label className={ETIQUETA} htmlFor="editar-evento-concentracao">Concentração (opcional)</label>
            <input id="editar-evento-concentracao" type="time" value={concentracao} onChange={e => setConcentracao(e.target.value)} className={CAMPO} />
          </div>

          {tipo === 'match' && (
            <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl space-y-3">
              <label htmlFor="editar-evento-amigavel" className="flex items-center gap-2.5 min-h-11 cursor-pointer">
                <input
                  id="editar-evento-amigavel"
                  type="checkbox"
                  checked={amigavel}
                  onChange={e => {
                    setAmigavel(e.target.checked)
                    if (e.target.checked) { setProvaId(''); setJornada('') }
                  }}
                  className="h-5 w-5 accent-csc-gold cursor-pointer"
                />
                <span className="text-sm font-semibold text-white/80">Jogo amigável</span>
              </label>

              {!amigavel && (
                <div className="flex gap-2.5">
                  <div className="flex-1 min-w-0">
                    <label className={ETIQUETA} htmlFor="editar-evento-prova">Torneio / competição</label>
                    <select id="editar-evento-prova" value={provaId} onChange={e => setProvaId(e.target.value)} className={CAMPO}>
                      <option value="">-- Selecionar torneio --</option>
                      {provas.map(t => (
                        <option key={t.id} value={t.id}>{t.name}{t.season ? ` (${t.season})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  {provaId && (
                    <div className="w-[96px] flex-none">
                      <label className={ETIQUETA} htmlFor="editar-evento-jornada">Jornada *</label>
                      <input
                        id="editar-evento-jornada"
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={jornada}
                        onChange={e => setJornada(e.target.value)}
                        placeholder="1"
                        className={CAMPO}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={ETIQUETA} htmlFor="editar-evento-adversario">Adversário</label>
                  <select
                    id="editar-evento-adversario"
                    value={adversarioId}
                    onChange={e => {
                      if (e.target.value === '__new__') setAdvRapido(a => ({ ...a, aberto: true }))
                      else setAdversarioId(e.target.value)
                    }}
                    className={CAMPO}
                  >
                    <option value="">-- Selecionar --</option>
                    <option value="__new__">Criar novo adversário…</option>
                    {adversarios.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="editar-evento-condicao">Condição de jogo</label>
                  <select
                    id="editar-evento-condicao"
                    value={casaFora}
                    onChange={e => setCasaFora(e.target.value as 'home' | 'away' | 'neutral')}
                    className={CAMPO}
                  >
                    <option value="home">Casa</option>
                    <option value="away">Fora</option>
                    <option value="neutral">Campo neutro</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tipo === 'match' && casaFora === 'home' ? (
            <div className="p-3.5 bg-csc-light/10 border border-csc-light/35 rounded-2xl flex items-center justify-between gap-2">
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-csc-verde-texto flex items-center gap-1.5">
                  <MapPin size={13} className="shrink-0" />
                  Campo do jogo · em casa
                </span>
                <p className="text-xs font-black text-white truncate">
                  {campoDeCasa ? nomeDoCampo(campoDeCasa) : 'Sem campo do clube definido'}
                </p>
              </div>
              {local && (
                <a
                  href={getGoogleMapsUrl(local)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-[18px] bg-white/8 border border-white/16 text-csc-gold font-display font-bold text-[10.5px] shrink-0"
                >
                  Maps <ExternalLink size={11} />
                </a>
              )}
            </div>
          ) : (
            <div>
              <label className={ETIQUETA} htmlFor="editar-evento-campo">Campo / instalação *</label>
              <select
                id="editar-evento-campo"
                required
                value={campoId}
                onChange={e => {
                  if (e.target.value === '__new__') {
                    setCampoRapido(c => ({ ...c, aberto: true }))
                    return
                  }
                  setCampoId(e.target.value)
                  const campo = campos.find(c => c.id === e.target.value)
                  setLocal(campo ? nomeDoCampo(campo) : '')
                }}
                className={CAMPO}
              >
                <option value="">-- Escolher campo / instalação --</option>
                <option value="__new__">Criar novo campo…</option>
                {campos.map(c => <option key={c.id} value={c.id}>{nomeDoCampo(c)}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={ETIQUETA} htmlFor="editar-evento-descricao">Descrição / notas</label>
            <textarea
              id="editar-evento-descricao"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={3}
              className={`${CAMPO} h-auto py-3 leading-relaxed resize-none`}
              placeholder="Informações adicionais, ementa do convívio…"
            />
          </div>

          {/* A convocatória — o que está em `callups`, e mais nada. */}
          <section aria-labelledby="editar-evento-convocatoria" className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="editar-evento-convocatoria" className="text-xs font-black text-white flex items-center gap-1.5">
                <Users size={15} className="text-csc-gold" />
                Convocatória ({convocatorias.length})
              </h2>
              <span className="text-[10px] bg-white/10 text-csc-gold font-bold px-2.5 py-0.5 rounded-full">
                {aptos.length} {aptos.length === 1 ? 'pode ir' : 'podem ir'}
              </span>
            </div>

            {tipo === 'practice' && (
              <p className="text-[11px] leading-snug text-white/70 bg-csc-light/10 border border-csc-light/25 rounded-xl px-3 py-2">
                Nos treinos a convocatória é automática: entram todos os aptos. Aqui só se acerta a lista.
              </p>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <Botao
                type="button"
                onClick={() => convocarVarios(porConvocar, n => `${n} convocado(s).`)}
                disabled={porConvocar.length === 0 || aConvocar}
              >
                <Sparkles size={13} />
                {aConvocar ? 'A processar…' : `Todos (${porConvocar.length})`}
              </Botao>
              <Botao
                type="button"
                aparencia="perigo"
                onClick={() => setConfirmarLimpar(true)}
                disabled={convocatorias.length === 0 || aConvocar}
              >
                Limpar
              </Botao>
              {/* Nos convívios vai toda a gente, e aí faz sentido separar. */}
              {tipo === 'gathering' && (
                <>
                  <Botao
                    type="button"
                    aparencia="verde"
                    onClick={() => convocarVarios(porConvocar.filter(p => !eStaff(p)), n => `${n} jogador(es) convocado(s).`)}
                    disabled={porConvocar.filter(p => !eStaff(p)).length === 0 || aConvocar}
                  >
                    Jogadores
                  </Botao>
                  <Botao
                    type="button"
                    aparencia="vidro"
                    onClick={() => convocarVarios(porConvocar.filter(eStaff), n => `${n} do staff convocado(s).`)}
                    disabled={porConvocar.filter(eStaff).length === 0 || aConvocar}
                  >
                    Staff
                  </Botao>
                </>
              )}
            </div>

            <div className="relative">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
              <input
                type="search"
                value={procura}
                onChange={e => setProcura(e.target.value)}
                placeholder="Procurar por nome ou número…"
                aria-label="Procurar no plantel"
                className={`${CAMPO} pl-9`}
              />
            </div>

            <ul className="max-h-[380px] overflow-y-auto rounded-2xl border border-white/12 divide-y divide-white/7">
              {lista.map(p => {
                const convocado = Boolean(convocadoDe(p))
                const motivo = impedimento(p)
                // Quem não pode ir e não está convocado não se marca; quem está, tira-se.
                const bloqueado = Boolean(motivo) && !convocado
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => alternar(p)}
                      disabled={bloqueado}
                      aria-pressed={convocado}
                      className={`w-full min-h-12 flex items-center gap-2.5 px-3 py-2 text-left text-xs cursor-pointer
                        disabled:cursor-not-allowed disabled:opacity-55
                        focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                          convocado ? 'bg-csc-gold/10 text-white' : 'text-white/80'
                        }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                          convocado ? 'bg-csc-gold border-csc-gold text-csc-tinta' : 'border-white/25'
                        }`}
                      >
                        {convocado ? '✓' : ''}
                      </span>
                      <span className="w-7 h-7 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[10px] flex items-center justify-center shrink-0">
                        {p.jersey_number ?? '–'}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-bold">{getPlayerDisplayName(p)}</span>
                      {motivo && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-csc-red/15 text-csc-vermelho-texto shrink-0">
                          {motivo}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <label
            htmlFor="editar-evento-rascunho"
            className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer min-h-14"
          >
            <input
              id="editar-evento-rascunho"
              type="checkbox"
              checked={!publicado}
              onChange={e => setPublicado(!e.target.checked)}
              className="mt-0.5 w-5 h-5 shrink-0 accent-csc-gold cursor-pointer"
            />
            <span className="min-w-0">
              <span className="block font-display font-bold text-[12.5px] text-white">Guardar como rascunho</span>
              <span className="block text-[10.5px] leading-snug text-white/62 mt-0.5">
                Fica só para a equipa técnica: não aparece na Agenda de quem não gere, não aceita respostas à
                convocatória e não entra no alerta da Home.
              </span>
            </span>
          </label>

          {/* Sair sem gravar é o "‹" do topo; aqui fica só gravar. */}
          <div className="pt-2">
            <Botao type="submit" largo disabled={aGravar}>
              <Save size={16} />
              {aGravar ? 'A guardar…' : 'Guardar alterações'}
            </Botao>
          </div>
        </form>
      </EcraDetalhe>

      <QuickFieldModal
        isOpen={campoRapido.aberto}
        name={campoRapido.nome}
        address={campoRapido.morada}
        onNameChange={nome => setCampoRapido(c => ({ ...c, nome }))}
        onAddressChange={morada => setCampoRapido(c => ({ ...c, morada }))}
        onSubmit={gravarCampoRapido}
        onClose={() => setCampoRapido({ aberto: false, nome: '', morada: '', aGravar: false })}
        isSaving={campoRapido.aGravar}
      />

      <QuickOpponentModal
        isOpen={advRapido.aberto}
        name={advRapido.nome}
        initials={advRapido.sigla}
        homeFieldId={advRapido.campoId}
        contactName={advRapido.contacto}
        contactPhone={advRapido.telefone}
        fields={campos}
        onNameChange={nome => setAdvRapido(a => ({ ...a, nome }))}
        onInitialsChange={sigla => setAdvRapido(a => ({ ...a, sigla }))}
        onHomeFieldIdChange={campoId => setAdvRapido(a => ({ ...a, campoId }))}
        onContactNameChange={contacto => setAdvRapido(a => ({ ...a, contacto }))}
        onContactPhoneChange={telefone => setAdvRapido(a => ({ ...a, telefone }))}
        onSubmit={gravarAdversarioRapido}
        onClose={() => setAdvRapido({ aberto: false, nome: '', sigla: '', campoId: '', contacto: '', telefone: '', aGravar: false })}
        isSaving={advRapido.aGravar}
      />

      <ResendCallupsModal
        isOpen={perguntaReenvio}
        onResend={() => gravar(true)}
        onKeepAnswers={() => gravar(false)}
        onBack={() => setPerguntaReenvio(false)}
        isSaving={aGravar}
      />

      <ConfirmModal
        isOpen={confirmarLimpar}
        title="Limpar a convocatória?"
        description="Todos os convocados deste evento são retirados, com as respostas que já deram."
        confirmText="Limpar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={limpar}
        onCancel={() => setConfirmarLimpar(false)}
      />

      <UnsavedChangesModal {...guarda.props} />
    </>
  )
}

export default EditarEvento
