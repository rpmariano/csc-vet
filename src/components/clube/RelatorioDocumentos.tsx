import React, { useEffect, useMemo, useState } from 'react'
import { zipSync } from 'fflate'
import { Download, Share2, FileArchive, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { getPlayerDisplayName } from '../../lib/eventos'
import {
  COLUNA_DO_TIPO,
  ROTULO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  descarregarDocumento,
  extensaoDoDocumento,
  type TipoDocumento,
} from '../../lib/documentos'
import { Botao, EtiquetaSeccao } from '../ui'
import { ConfirmModal } from '../ConfirmModal'

/**
 * Documentos dos atletas — o relatório que junta num `.zip` um tipo de
 * documento (cartão de cidadão, apólice, atestado) de vários atletas.
 *
 * **Só a direção** (a secção Relatórios é da direção, e a função que regista
 * a exportação recusa quem não é). **Cada exportação fica registada** — quem,
 * quando, que documento, de quem, e se se descarregou ou partilhou — pela
 * função `registar_exportacao_documentos()`, que é o servidor a escrever; o
 * cliente não tem como inventar outro autor ou outra hora.
 *
 * **Dois passos: preparar, e depois entregar.** No iPhone a partilha nativa só
 * abre logo a seguir a um toque; com o tempo de descarregar os documentos pelo
 * meio, o Safari recusava. Por isso "Preparar o .zip" junta os ficheiros, e só
 * com o ficheiro pronto aparecem "Descarregar" e "Partilhar" — cada um abre de
 * imediato. O registo parte ao mesmo tempo que a entrega.
 *
 * **Partilhar pergunta antes.** Pela partilha do telemóvel o ficheiro sai do
 * clube — para o email, para o WhatsApp — com documentos de identificação
 * dentro. É uma escolha da direção, mas uma escolha que se faz a saber disso.
 *
 * A fotografia não entra: não é um documento, e já está no plantel.
 */

interface FichaComDocumentos {
  id: string
  name: string
  shirt_name?: string | null
  nickname?: string | null
  jersey_number?: number | null
  id_document_url?: string | null
  insurance_doc_url?: string | null
  medical_exam_doc_url?: string | null
}

interface Exportacao {
  id: string
  feito_por: string | null
  feito_em: string
  tipo: TipoDocumento
  perfis: string[]
  destino: 'descarregar' | 'partilhar'
}

interface Preparado {
  ficheiro: File
  perfis: string[]
  tipo: TipoDocumento
}

/** Um nome de ficheiro sem acentos, espaços nem barras: "Rui-Bandarra". */
const paraNomeDeFicheiro = (texto: string) =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'atleta'

const SIGLA_DOCUMENTO: Record<TipoDocumento, string> = { cc: 'CC', seguro: 'Seguro', atestado: 'Atestado' }

/** "1 cartão de cidadão", "2 cartões de cidadão". */
const PLURAL_DOCUMENTO: Record<TipoDocumento, string> = {
  cc: 'cartões de cidadão',
  seguro: 'apólices do seguro',
  atestado: 'atestados médicos',
}
const contarDocumentos = (n: number, t: TipoDocumento) =>
  `${n} ${n === 1 ? ROTULO_DOCUMENTO[t].toLowerCase() : PLURAL_DOCUMENTO[t]}`

const hoje = () => new Date().toISOString().slice(0, 10)

export const RelatorioDocumentos: React.FC = () => {
  const [fichas, setFichas] = useState<FichaComDocumentos[] | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('cc')
  /* A escolha é de um tipo de documento: mudar de tipo é voltar a ter toda a
     gente que o tem escolhida — derivado, sem repor estado num efeito. */
  const [selecao, setSelecao] = useState<{ tipo: TipoDocumento; ids: Set<string> } | null>(null)
  const [procura, setProcura] = useState('')
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)
  const [preparadoGuardado, setPreparado] = useState<Preparado | null>(null)
  const [confirmarPartilha, setConfirmarPartilha] = useState(false)
  const [historico, setHistorico] = useState<Exportacao[]>([])
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())

  const carregarHistorico = () =>
    supabase
      .from('exportacoes_documentos')
      .select('id, feito_por, feito_em, tipo, perfis, destino')
      .order('feito_em', { ascending: false })
      .limit(5)
      .then(({ data }) => setHistorico((data ?? []) as Exportacao[]))

  useEffect(() => {
    let cancelado = false
    Promise.all([
      supabase
        .from('profiles')
        .select('id, name, shirt_name, nickname, jersey_number, id_document_url, insurance_doc_url, medical_exam_doc_url')
        .order('name'),
      supabase.from('v_players_public').select('id, name, shirt_name, nickname'),
    ]).then(([f, p]) => {
      if (cancelado) return
      setFichas((f.data ?? []) as FichaComDocumentos[])
      setNomes(new Map(((p.data ?? []) as FichaComDocumentos[]).map(x => [x.id, getPlayerDisplayName(x)])))
    })
    carregarHistorico()
    return () => { cancelado = true }
  }, [])

  // Quem tem o documento escolhido.
  const comDocumento = useMemo(
    () => (fichas ?? []).filter(f => Boolean(f[COLUNA_DO_TIPO[tipo]])),
    [fichas, tipo],
  )

  const escolhidos = selecao?.tipo === tipo ? selecao.ids : new Set(comDocumento.map(f => f.id))
  const setEscolhidos = (atualizar: Set<string> | ((atual: Set<string>) => Set<string>)) =>
    setSelecao({ tipo, ids: typeof atualizar === 'function' ? atualizar(escolhidos) : atualizar })
  // O que estava preparado é de um tipo; mudar de tipo deita-o fora.
  const preparado = preparadoGuardado?.tipo === tipo ? preparadoGuardado : null

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
      const valor = f[COLUNA_DO_TIPO[tipo]] as string
      try {
        const blob = await descarregarDocumento(valor)
        let nome = `${paraNomeDeFicheiro(getPlayerDisplayName(f))}-${SIGLA_DOCUMENTO[tipo]}`
        // Dois atletas com o mesmo nome não se sobrepõem dentro do .zip.
        for (let i = 2; usados.has(nome); i++) nome = `${paraNomeDeFicheiro(getPlayerDisplayName(f))}-${SIGLA_DOCUMENTO[tipo]}-${i}`
        usados.add(nome)
        // Nível 0: PDFs e fotografias já vêm comprimidos, e no telemóvel
        // comprimir outra vez era só esperar.
        ficheiros[`${nome}.${extensaoDoDocumento(valor)}`] = new Uint8Array(await blob.arrayBuffer())
        incluidos.push(f.id)
      } catch {
        falharam.push(getPlayerDisplayName(f))
      }
      setProgresso(p => (p ? { ...p, feitos: p.feitos + 1 } : p))
    }

    setProgresso(null)
    if (incluidos.length === 0) {
      toast.error('Não foi possível ler nenhum dos documentos.')
      return
    }
    if (falharam.length > 0) {
      toast.warning(`Ficaram de fora ${falharam.length}: ${falharam.join(', ')}.`)
    }

    const zip = zipSync(ficheiros, { level: 0 })
    const ficheiro = new File([zip], `CSC-${SIGLA_DOCUMENTO[tipo]}-${hoje()}.zip`, { type: 'application/zip' })
    setPreparado({ ficheiro, perfis: incluidos, tipo })
  }

  /** O registo parte ao mesmo tempo que a entrega — ver o comentário do topo. */
  const registar = (destino: Exportacao['destino']) => {
    if (!preparado) return
    supabase
      .rpc('registar_exportacao_documentos', { p_tipo: preparado.tipo, p_perfis: preparado.perfis, p_destino: destino })
      .then(({ error }) => {
        if (error) toast.error('A exportação não ficou registada: ' + error.message)
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

  return (
    <div className="space-y-5">
      {/* Que documento. */}
      <fieldset className="space-y-2">
        <legend className="mb-2">
          <EtiquetaSeccao como="span">Que documento</EtiquetaSeccao>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {TIPOS_DOCUMENTO.map(t => {
            const quantos = (fichas ?? []).filter(f => Boolean(f[COLUNA_DO_TIPO[t]])).length
            const ativo = tipo === t
            return (
              <label
                key={t}
                className={`min-h-14 px-2 py-2 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer
                  font-display font-extrabold text-[11.5px] leading-tight transition-colors
                  has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-csc-gold ${
                    ativo ? 'bg-csc-gold text-csc-tinta border-csc-gold' : 'bg-white/6 text-white border-white/15'
                  }`}
              >
                <input
                  type="radio"
                  name="tipo-documento"
                  value={t}
                  checked={ativo}
                  onChange={() => setTipo(t)}
                  className="sr-only"
                />
                {ROTULO_DOCUMENTO[t]}
                <span className={`mt-0.5 text-[10px] font-bold ${ativo ? 'text-csc-tinta/70' : 'text-white/62'}`}>
                  {fichas === null ? '…' : `${quantos} ${quantos === 1 ? 'atleta' : 'atletas'}`}
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

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
          <p className="cartao-simples border-dashed px-4 py-6 text-center text-[11.5px] text-white/62">
            Nenhum atleta tem {ROTULO_DOCUMENTO[tipo].toLowerCase()} na ficha.
          </p>
        ) : (
          <>
            {comDocumento.length > 6 && (
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" aria-hidden="true" />
                <input
                  type="search"
                  value={procura}
                  onChange={e => setProcura(e.target.value)}
                  placeholder="Procurar por nome ou número…"
                  aria-label="Procurar atleta"
                  className="w-full h-11 pl-9 pr-3 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-xs outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40"
                />
              </div>
            )}
            <ul className="cartao-simples overflow-hidden divide-y divide-white/7">
              {visiveis.map(f => {
                const marcado = escolhidos.has(f.id)
                return (
                  <li key={f.id}>
                    <label className="min-h-12 flex items-center gap-3 px-3.5 py-2 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-csc-gold">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternar(f.id)}
                        className="w-5 h-5 shrink-0 accent-csc-gold cursor-pointer"
                      />
                      <span className="w-7 h-7 rounded-full bg-[rgba(11,45,11,.9)] border border-csc-gold/35 text-csc-gold font-display font-extrabold text-[10px] flex items-center justify-center shrink-0">
                        {f.jersey_number ?? '–'}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-display font-bold text-[12.5px] text-white">
                        {getPlayerDisplayName(f)}
                      </span>
                    </label>
                  </li>
                )
              })}
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
              {preparado.ficheiro.name} · {preparado.perfis.length} {preparado.perfis.length === 1 ? 'documento' : 'documentos'}
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
          Cada exportação fica registada: quem, quando e de quem são os documentos. No telemóvel, o .zip
          abre-se na app Ficheiros (iPhone) ou no gestor de ficheiros (Android).
        </p>
      </div>

      {/* O rasto — as últimas exportações. */}
      {historico.length > 0 && (
        <section aria-labelledby="documentos-historico" className="cartao-simples overflow-hidden">
          <h2 id="documentos-historico" className="px-4 py-2.5 bg-white/5 font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase text-white/70">
            Últimas exportações
          </h2>
          <ul className="divide-y divide-white/7">
            {historico.map(e => (
              <li key={e.id} className="px-4 py-2.5 text-[11.5px] text-white/80">
                <span className="font-bold text-white">{(e.feito_por && nomes.get(e.feito_por)) || 'Alguém da direção'}</span>
                {' · '}
                {e.destino === 'partilhar' ? 'partilhou' : 'descarregou'} {contarDocumentos(e.perfis.length, e.tipo)}
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
        title="Partilhar documentos de identificação?"
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
