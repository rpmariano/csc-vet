import React, { useEffect, useMemo, useState } from 'react'
import { zipSync } from 'fflate'
import { Download, Share2, FileArchive } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { compararPorCamisola, getPlayerDisplayName } from '../../lib/eventos'
import { eJogador } from '../../lib/papeis'
import type { UserRole } from '../../context/AuthContext'
import { mensagemDeErro } from '../../lib/erros'
import { useEpocaAtual } from '../../hooks/useEpocaAtual'
import {
  POR_EPOCA,
  ROTULO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  descarregarFicheiro,
  extensaoDoFicheiro,
  lerDocumentos,
  type DocumentoAtleta,
  type TipoDocumento,
} from '../../lib/documentos'
import { Botao, CaixaProcura, EtiquetaSeccao, NumeroCamisola, Pastilha } from '../ui'
import { ConfirmModal } from '../ConfirmModal'

/**
 * Documentos dos atletas — o relatório que junta num `.zip` um tipo de
 * documento de vários atletas: o cartão de cidadão, a proposta de sócio, a
 * apólice do seguro, o atestado médico, ou a fotografia de perfil.
 *
 * **A apólice e o atestado escolhem-se por época** — a em curso por omissão,
 * e as anteriores que tenham documentos. **E o relatório diz também quem não
 * tem** o documento: os atletas no ativo sem ele, numa lista à parte e fora
 * do `.zip`, para a direção saber a quem o pedir.
 *
 * **Só a direção** (a secção Relatórios é da direção, e a função que regista
 * a exportação recusa quem não é). **Cada exportação fica registada** — quem,
 * quando, que documento, de que época, de quem, e se se descarregou ou
 * partilhou — pela função `registar_exportacao_documentos()`, que é o servidor
 * a escrever; o cliente não tem como inventar outro autor ou outra hora.
 *
 * **Dois passos: preparar, e depois entregar.** No iPhone a partilha nativa só
 * abre logo a seguir a um toque; com o tempo de descarregar os documentos pelo
 * meio, o Safari recusava. Por isso "Preparar o .zip" junta os ficheiros, e só
 * com o ficheiro pronto aparecem "Descarregar" e "Partilhar" — cada um abre de
 * imediato. O registo parte ao mesmo tempo que a entrega.
 *
 * **Partilhar pergunta antes.** Pela partilha do telemóvel o ficheiro sai do
 * clube — para o email, para o WhatsApp — com documentos pessoais dentro. É
 * uma escolha da direção, mas uma escolha que se faz a saber disso.
 */

type TipoExportavel = TipoDocumento | 'foto'

const TIPOS_EXPORTAVEIS: readonly TipoExportavel[] = [...TIPOS_DOCUMENTO, 'foto']

const ROTULO: Record<TipoExportavel, string> = { ...ROTULO_DOCUMENTO, foto: 'Fotografia de perfil' }

const SIGLA: Record<TipoExportavel, string> = {
  cc: 'CC',
  proposta: 'Proposta',
  seguro: 'Seguro',
  atestado: 'Atestado',
  foto: 'Foto',
}

/** "1 cartão de cidadão", "2 cartões de cidadão". */
const SINGULAR: Record<TipoExportavel, string> = {
  cc: 'cartão de cidadão',
  proposta: 'proposta de sócio',
  seguro: 'apólice do seguro',
  atestado: 'atestado médico',
  foto: 'fotografia',
}
const PLURAL: Record<TipoExportavel, string> = {
  cc: 'cartões de cidadão',
  proposta: 'propostas de sócio',
  seguro: 'apólices do seguro',
  atestado: 'atestados médicos',
  foto: 'fotografias',
}
const contar = (n: number, t: TipoExportavel) => `${n} ${n === 1 ? SINGULAR[t] : PLURAL[t]}`

const ePorEpoca = (t: TipoExportavel) => t !== 'foto' && POR_EPOCA[t]

interface Ficha {
  id: string
  name: string
  shirt_name?: string | null
  nickname?: string | null
  jersey_number?: number | null
  photo_url?: string | null
  status?: string | null
  role: UserRole
  roles?: UserRole[] | null
}

interface Exportacao {
  id: string
  feito_por: string | null
  feito_em: string
  tipo: TipoExportavel
  epoca: string | null
  perfis: string[]
  destino: 'descarregar' | 'partilhar'
}

interface Preparado {
  ficheiro: File
  perfis: string[]
  /** Quantos ficheiros vão dentro — um documento pode ter até 4. */
  ficheiros: number
  tipo: TipoExportavel
  epoca: string | null
}

/** Um nome de ficheiro sem acentos, espaços nem barras: "Rui-Bandarra". */
const paraNomeDeFicheiro = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'atleta'

/** A data de hoje em AAAA-MM-DD, no fuso de quem está a usar a app. */
const hoje = () => new Date().toLocaleDateString('sv-SE')

export const RelatorioDocumentos: React.FC = () => {
  const epocaAtual = useEpocaAtual()
  const [fichas, setFichas] = useState<Ficha[] | null>(null)
  const [documentos, setDocumentos] = useState<DocumentoAtleta[]>([])
  const [tipo, setTipo] = useState<TipoExportavel>('cc')
  const [epocaEscolhida, setEpocaEscolhida] = useState<string | null>(null)
  /* A escolha de quem entra é de um tipo e de uma época: mudar de um ou de
     outra é voltar a ter toda a gente que o tem escolhida — derivado, sem
     repor estado num efeito. */
  const [selecao, setSelecao] = useState<{ chave: string; ids: Set<string> } | null>(null)
  const [procura, setProcura] = useState('')
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)
  const [preparadoGuardado, setPreparado] = useState<(Preparado & { chave: string }) | null>(null)
  const [confirmarPartilha, setConfirmarPartilha] = useState(false)
  const [historico, setHistorico] = useState<Exportacao[]>([])
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())

  const carregarHistorico = () =>
    supabase
      .from('exportacoes_documentos')
      .select('id, feito_por, feito_em, tipo, epoca, perfis, destino')
      .order('feito_em', { ascending: false })
      .limit(5)
      .then(({ data }) => setHistorico((data ?? []) as Exportacao[]))

  useEffect(() => {
    let cancelado = false
    Promise.all([
      supabase
        .from('profiles')
        .select('id, name, shirt_name, nickname, jersey_number, photo_url, status, role, roles'),
      lerDocumentos().catch(err => {
        console.error('Não foi possível ler os documentos:', err)
        return [] as DocumentoAtleta[]
      }),
      supabase.from('v_players_public').select('id, name, shirt_name, nickname'),
    ]).then(([f, docs, p]) => {
      if (cancelado) return
      setFichas(((f.data ?? []) as Ficha[]).sort(compararPorCamisola))
      setDocumentos(docs)
      setNomes(new Map(((p.data ?? []) as Ficha[]).map(x => [x.id, getPlayerDisplayName(x)])))
    })
    carregarHistorico()
    return () => { cancelado = true }
  }, [])

  /* As épocas que se podem escolher para este tipo: a em curso, sempre, e as
     anteriores que tenham algum documento. A escolhida vale enquanto existir
     no tipo — mudar para um documento que não tem essa época volta à atual. */
  const epocasDoTipo = useMemo(() => {
    if (!ePorEpoca(tipo)) return []
    const todas = new Set([epocaAtual])
    for (const d of documentos) if (d.tipo === tipo && d.epoca) todas.add(d.epoca)
    return [...todas].sort((a, b) => b.localeCompare(a))
  }, [documentos, tipo, epocaAtual])
  const epoca = ePorEpoca(tipo)
    ? (epocaEscolhida && epocasDoTipo.includes(epocaEscolhida) ? epocaEscolhida : epocaAtual)
    : null

  /** Os ficheiros de uma pessoa para um tipo e época: os caminhos no bucket, ou o endereço da fotografia. */
  const ficheiroDe = useMemo(() => {
    const porTipo = new Map<string, Map<string, string[]>>()
    for (const d of documentos) {
      const chave = `${d.tipo}|${d.epoca ?? ''}`
      if (!porTipo.has(chave)) porTipo.set(chave, new Map())
      porTipo.get(chave)!.set(d.profile_id, d.caminhos)
    }
    return (f: Ficha, t: TipoExportavel, e: string | null): string[] | null =>
      t === 'foto'
        ? (f.photo_url ? [f.photo_url] : null)
        : (porTipo.get(`${t}|${e ?? ''}`)?.get(f.id) ?? null)
  }, [documentos])

  const comDocumento = useMemo(
    () => (fichas ?? []).filter(f => ficheiroDe(f, tipo, epoca)),
    [fichas, ficheiroDe, tipo, epoca],
  )
  // A quem falta: os atletas no ativo — quem joga e não está inativo.
  const semDocumento = useMemo(
    () => (fichas ?? []).filter(f => !ficheiroDe(f, tipo, epoca) && f.status !== 'inactive' && eJogador(f)),
    [fichas, ficheiroDe, tipo, epoca],
  )

  const chave = `${tipo}|${epoca ?? ''}`
  const escolhidos = selecao?.chave === chave ? selecao.ids : new Set(comDocumento.map(f => f.id))
  const setEscolhidos = (atualizar: Set<string> | ((atual: Set<string>) => Set<string>)) =>
    setSelecao({ chave, ids: typeof atualizar === 'function' ? atualizar(escolhidos) : atualizar })
  // O que estava preparado é de um tipo e de uma época; mudar deita-o fora.
  const preparado = preparadoGuardado?.chave === chave ? preparadoGuardado : null

  const q = procura.trim().toLowerCase()
  const visiveis = comDocumento.filter(f =>
    !q || f.name.toLowerCase().includes(q) || getPlayerDisplayName(f).toLowerCase().includes(q) || String(f.jersey_number ?? '').includes(q),
  )

  const alternar = (id: string) => {
    triggerHaptic('selection')
    setPreparado(null)
    setEscolhidos(atual => {
      const seguinte = new Set(atual)
      if (seguinte.has(id)) seguinte.delete(id)
      else seguinte.add(id)
      return seguinte
    })
  }

  /** "Seguro-2026-2027" — o sufixo dos nomes, com a época quando a há. */
  const sufixo = `${SIGLA[tipo]}${epoca ? `-${epoca.replace('/', '-')}` : ''}`

  const preparar = async () => {
    const alvo = comDocumento.filter(f => escolhidos.has(f.id))
    if (alvo.length === 0) return
    triggerHaptic('light')
    setPreparado(null)
    setProgresso({ feitos: 0, total: alvo.length })

    const ficheiros: Record<string, Uint8Array> = {}
    const usados = new Set<string>()
    const incluidos: string[] = []
    const falharam: string[] = []

    for (const f of alvo) {
      const valores = ficheiroDe(f, tipo, epoca) ?? []
      // Dois atletas com o mesmo nome não se sobrepõem dentro do .zip.
      let base = `${paraNomeDeFicheiro(getPlayerDisplayName(f))}-${sufixo}`
      for (let i = 2; usados.has(base); i++) base = `${paraNomeDeFicheiro(getPlayerDisplayName(f))}-${sufixo}-${i}`
      usados.add(base)
      let algum = false
      let falhou = false
      for (const [i, valor] of valores.entries()) {
        try {
          const blob = await descarregarFicheiro(valor)
          // "RUI-CC.pdf"; com a frente e o verso, "RUI-CC-1.jpg" e "RUI-CC-2.jpg".
          const nome = valores.length === 1 ? base : `${base}-${i + 1}`
          // Nível 0: PDFs e fotografias já vêm comprimidos, e no telemóvel
          // comprimir outra vez era só esperar.
          ficheiros[`${nome}.${extensaoDoFicheiro(valor)}`] = new Uint8Array(await blob.arrayBuffer())
          algum = true
        } catch {
          falhou = true
        }
      }
      if (algum) incluidos.push(f.id)
      if (falhou) falharam.push(getPlayerDisplayName(f))
      setProgresso(p => (p ? { ...p, feitos: p.feitos + 1 } : p))
    }

    setProgresso(null)
    if (incluidos.length === 0) {
      toast.error('Não foi possível ler nenhum dos ficheiros.')
      return
    }
    if (falharam.length > 0) {
      toast.warning(`Não foi possível ler tudo de ${falharam.length}: ${falharam.join(', ')}.`)
    }

    const zip = zipSync(ficheiros, { level: 0 })
    const ficheiro = new File([zip], `CSC-${sufixo}-${hoje()}.zip`, { type: 'application/zip' })
    setPreparado({ ficheiro, perfis: incluidos, ficheiros: Object.keys(ficheiros).length, tipo, epoca, chave })
  }

  /** O registo parte ao mesmo tempo que a entrega — ver o comentário do topo. */
  const registar = (destino: Exportacao['destino']) => {
    if (!preparado) return
    supabase
      .rpc('registar_exportacao_documentos', {
        p_tipo: preparado.tipo,
        p_perfis: preparado.perfis,
        p_destino: destino,
        p_epoca: preparado.epoca,
      })
      .then(({ error }) => {
        if (error) toast.error('A exportação não ficou registada: ' + mensagemDeErro(error))
        else carregarHistorico()
      })
  }

  const descarregar = () => {
    if (!preparado) return
    registar('descarregar')
    const url = URL.createObjectURL(preparado.ficheiro)
    const a = document.createElement('a')
    a.href = url
    a.download = preparado.ficheiro.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    toast.success('Ficheiro descarregado.')
  }

  const podePartilhar = Boolean(
    preparado &&
    typeof navigator !== 'undefined' &&
    navigator.canShare?.({ files: [preparado.ficheiro] }),
  )

  const partilhar = async () => {
    setConfirmarPartilha(false)
    if (!preparado) return
    registar('partilhar')
    try {
      await navigator.share({ files: [preparado.ficheiro], title: preparado.ficheiro.name })
    } catch (err) {
      // Fechar a folha de partilha sem escolher nada não é um erro.
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('O telemóvel não deixou partilhar. Descarrega o ficheiro e envia-o a partir daí.')
    }
  }

  const aPreparar = progresso !== null
  /** "atestado médico de 2026/2027", "cartão de cidadão". */
  const oQue = `${SINGULAR[tipo]}${epoca ? ` de ${epoca}` : ''}`

  return (
    <div className="space-y-5">
      {/* Que documento. */}
      <fieldset>
        <legend className="mb-2">
          <EtiquetaSeccao como="span">Que documento</EtiquetaSeccao>
        </legend>
        <div className="cartao-simples px-4">
          {TIPOS_EXPORTAVEIS.map(t => {
            const e = ePorEpoca(t) ? (t === tipo ? epoca : epocaAtual) : null
            const quantos = (fichas ?? []).filter(f => ficheiroDe(f, t, e)).length
            return (
              <label
                key={t}
                className="linha-leve min-h-12 flex items-center gap-3 py-2 cursor-pointer
                  has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-csc-gold"
              >
                <input
                  type="radio"
                  name="tipo-documento"
                  value={t}
                  checked={tipo === t}
                  onChange={() => { setTipo(t); setPreparado(null) }}
                  className="w-5 h-5 shrink-0 accent-csc-gold cursor-pointer"
                />
                <span className="flex-1 min-w-0 font-display font-extrabold text-[12.5px] text-white">{ROTULO[t]}</span>
                <span className="text-[10.5px] font-bold text-white/62 tabular-nums">
                  {fichas === null ? '…' : `${quantos} ${quantos === 1 ? 'atleta' : 'atletas'}`}
                  {e && <span className="sr-only"> em {e}</span>}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* De que época — só a apólice e o atestado. */}
      {ePorEpoca(tipo) && (
        <section aria-labelledby="documentos-epoca">
          <EtiquetaSeccao como="h2" id="documentos-epoca" className="mb-2">Época</EtiquetaSeccao>
          <div className="flex flex-wrap gap-2">
            {epocasDoTipo.map(e => (
              <Pastilha
                key={e}
                ativa={e === epoca}
                onClick={() => { setEpocaEscolhida(e); setPreparado(null) }}
              >
                {e}{e === epocaAtual && <span className="sr-only"> (em curso)</span>}
              </Pastilha>
            ))}
          </div>
        </section>
      )}

      {/* Quem. */}
      <section aria-labelledby="documentos-quem" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <EtiquetaSeccao como="h2" id="documentos-quem">
            Quem entra ({escolhidos.size} de {comDocumento.length})
          </EtiquetaSeccao>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setPreparado(null); setEscolhidos(new Set(comDocumento.map(f => f.id))) }}
              className="min-h-11 px-2.5 text-[11px] font-bold text-csc-verde-texto cursor-pointer focus-visible:outline-2 focus-visible:outline-csc-gold"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => { setPreparado(null); setEscolhidos(new Set()) }}
              className="min-h-11 px-2.5 text-[11px] font-bold text-white/70 cursor-pointer focus-visible:outline-2 focus-visible:outline-csc-gold"
            >
              Nenhum
            </button>
          </div>
        </div>

        {fichas === null ? (
          <div className="cartao-simples h-32 animate-pulse" role="status" aria-label="A carregar as fichas" />
        ) : comDocumento.length === 0 ? (
          <p className="cartao-simples px-4 py-6 text-center text-[11.5px] text-white/62">
            Nenhum atleta tem {oQue}.
          </p>
        ) : (
          <>
            {comDocumento.length > 6 && (
              <CaixaProcura
                valor={procura}
                aoMudar={setProcura}
                placeholder="Procurar por nome ou número…"
                rotulo="Procurar atleta"
              />
            )}
            <ul className="cartao-simples px-4">
              {visiveis.map(f => (
                <li key={f.id} className="linha-leve">
                  <label className="min-h-12 flex items-center gap-3 py-2 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-csc-gold">
                    <input
                      type="checkbox"
                      checked={escolhidos.has(f.id)}
                      onChange={() => alternar(f.id)}
                      className="w-5 h-5 shrink-0 accent-csc-gold cursor-pointer"
                    />
                    <NumeroCamisola numero={f.jersey_number} />
                    <span className="min-w-0 flex-1 truncate font-display font-bold text-[12.5px] text-white">
                      {getPlayerDisplayName(f)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Preparar e entregar. */}
      <div className="space-y-2">
        {!preparado ? (
          <Botao largo onClick={preparar} disabled={aPreparar || escolhidos.size === 0}>
            <FileArchive size={16} />
            {aPreparar
              ? `A juntar ${progresso.feitos} de ${progresso.total}…`
              : `Preparar o .zip (${escolhidos.size})`}
          </Botao>
        ) : (
          <>
            <p className="text-[11px] text-white/70 text-center" role="status">
              {preparado.ficheiro.name} · {preparado.ficheiros} {preparado.ficheiros === 1 ? 'ficheiro' : 'ficheiros'}
            </p>
            <div className={`grid gap-2 ${podePartilhar ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Botao onClick={descarregar}>
                <Download size={16} />
                Descarregar
              </Botao>
              {podePartilhar && (
                <Botao aparencia="vidro" onClick={() => setConfirmarPartilha(true)}>
                  <Share2 size={16} />
                  Partilhar…
                </Botao>
              )}
            </div>
          </>
        )}
        <p className="text-[10.5px] leading-relaxed text-white/62">
          Cada exportação fica registada: quem, quando e de quem são os ficheiros. No telemóvel, o .zip
          abre-se na app Ficheiros (iPhone) ou no gestor de ficheiros (Android).
        </p>
      </div>

      {/* A quem falta — fora do .zip, para a direção saber a quem pedir. */}
      {fichas !== null && semDocumento.length > 0 && (
        <section aria-labelledby="documentos-em-falta" className="cartao-simples overflow-hidden">
          <h2
            id="documentos-em-falta"
            className="px-4 py-2.5 bg-white/5 font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase text-white/70"
          >
            Sem {oQue} · {semDocumento.length}
          </h2>
          <ul className="px-4">
            {semDocumento.map(f => (
              <li key={f.id} className="linha-leve min-h-11 flex items-center gap-3 py-1.5">
                <NumeroCamisola numero={f.jersey_number} />
                <span className="min-w-0 flex-1 truncate font-display font-bold text-[12.5px] text-white/85">
                  {getPlayerDisplayName(f)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* O rasto — as últimas exportações. */}
      {historico.length > 0 && (
        <section aria-labelledby="documentos-historico" className="cartao-simples overflow-hidden">
          <h2 id="documentos-historico" className="px-4 py-2.5 bg-white/5 font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase text-white/70">
            Últimas exportações
          </h2>
          <ul className="px-4">
            {historico.map(e => (
              <li key={e.id} className="linha-leve py-2.5 text-[11.5px] text-white/80">
                <span className="font-bold text-white">{(e.feito_por && nomes.get(e.feito_por)) || 'Alguém da direção'}</span>
                {' · '}
                {e.destino === 'partilhar' ? 'partilhou' : 'descarregou'} {contar(e.perfis.length, e.tipo)}
                {e.epoca ? ` de ${e.epoca}` : ''}
                <span className="block text-[10.5px] text-white/55 mt-0.5">
                  {new Date(e.feito_em).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmModal
        isOpen={confirmarPartilha}
        title={tipo === 'cc' ? 'Partilhar documentos de identificação?' : `Partilhar ${PLURAL[tipo]}?`}
        description="O ficheiro sai do clube para a app que escolheres — email, WhatsApp — e deixa de estar sob o controlo da direção. Fica registado que partilhaste."
        confirmText="Partilhar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={partilhar}
        onCancel={() => setConfirmarPartilha(false)}
      />
    </div>
  )
}

export default RelatorioDocumentos
