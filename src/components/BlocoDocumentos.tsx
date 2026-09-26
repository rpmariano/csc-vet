import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, FileText, Upload, X } from 'lucide-react'
import { toast } from '../context/ToastContext'
import { triggerHaptic } from '../utils/haptics'
import { mensagemDeErro } from '../lib/erros'
import { useEpocaAtual } from '../hooks/useEpocaAtual'
import {
  MAX_FICHEIROS,
  POR_EPOCA,
  ROTULO_DOCUMENTO,
  TIPOS_DE_FICHEIRO_ACEITES,
  TIPOS_DOCUMENTO,
  acrescentarFicheiros,
  documentoEmVigor,
  especieDoFicheiro,
  lerDocumentos,
  tirarFicheiro,
  type DocumentoAtleta,
  type TipoDocumento,
} from '../lib/documentos'
import { LinkDocumento } from './LinkDocumento'
import { ConfirmModal } from './ConfirmModal'
import { BotaoIcone } from './ui'

/** "Imagem", ou "Imagem 2" quando o documento tem mais do que um ficheiro. */
const nomeDoFicheiro = (caminhos: string[], i: number) =>
  caminhos.length === 1 ? especieDoFicheiro(caminhos[i]) : `${especieDoFicheiro(caminhos[i])} ${i + 1}`

/**
 * Os documentos de uma pessoa — o mesmo bloco na ficha do atleta (Plantel) e
 * no Perfil.
 *
 * **Uma linha por documento, com o estado**: quantos ficheiros tem e quando
 * mudou, ou em falta. A apólice e o atestado dizem de que época são, porque é
 * a época em curso que conta — os das épocas anteriores ficam recolhidos por
 * baixo, só para abrir.
 *
 * **Um documento leva até 4 ficheiros** — a frente e o verso do cartão, as
 * páginas da proposta. Carrega-se o primeiro (podem ser vários de uma vez) e
 * acrescentam-se os outros até 4; cada um abre-se e elimina-se sozinho, e
 * eliminar o último deixa o documento em falta. No telemóvel é assim que se
 * faz: uma fotografia de cada vez.
 *
 * **Carregar e eliminar fazem-se logo, e não com o "Gravar" do formulário.**
 * Eram campos da ficha: o ficheiro subia para o bucket quando se escolhia, mas
 * só ficava ligado à ficha ao gravar, e quem saísse sem gravar deixava um
 * ficheiro órfão e nenhum documento. Agora cada gesto é uma escrita, como
 * marcar um mês de quota.
 *
 * O bloco desenha só as linhas (`.linha-leve`); o cartão é de quem o usa —
 * na ficha já está dentro de um, e cartão dentro de cartão é o que a app
 * deixou de fazer.
 */
export const BlocoDocumentos: React.FC<{
  perfilId: string
  /** O próprio e a equipa técnica carregam e eliminam; os outros só abrem. */
  podeEditar: boolean
  /** Para os `id` dos campos de ficheiro, que têm de ser únicos na página. */
  idBase: string
}> = ({ perfilId, podeEditar, idBase }) => {
  const epocaAtual = useEpocaAtual()
  /* Os documentos guardam a ficha a que respeitam: mudar de ficha é, até
     chegarem os da nova, voltar a "a ler" — derivado, sem repor estado. */
  const [lidos, setLidos] = useState<{ perfilId: string; documentos: DocumentoAtleta[] } | null>(null)
  const [aCarregar, setACarregar] = useState<TipoDocumento | null>(null)
  const [aEliminar, setAEliminar] = useState<{ documento: DocumentoAtleta; caminho: string; nome: string } | null>(null)
  const [verAnteriores, setVerAnteriores] = useState(false)

  const ler = useCallback(() => {
    let cancelado = false
    lerDocumentos(perfilId)
      .then(documentos => { if (!cancelado) setLidos({ perfilId, documentos }) })
      .catch(err => {
        console.error('Não foi possível ler os documentos:', err)
        if (!cancelado) setLidos({ perfilId, documentos: [] })
      })
    return () => { cancelado = true }
  }, [perfilId])

  useEffect(() => ler(), [ler])

  const documentos = lidos?.perfilId === perfilId ? lidos.documentos : null

  const anteriores = (documentos ?? [])
    .filter(d => POR_EPOCA[d.tipo] && d.epoca !== epocaAtual)
    .sort((a, b) => (b.epoca ?? '').localeCompare(a.epoca ?? '') || TIPOS_DOCUMENTO.indexOf(a.tipo) - TIPOS_DOCUMENTO.indexOf(b.tipo))

  const carregar = async (tipo: TipoDocumento, e: React.ChangeEvent<HTMLInputElement>) => {
    let ficheiros = Array.from(e.target.files ?? [])
    // Limpar já: escolher o mesmo ficheiro outra vez tem de voltar a disparar.
    e.target.value = ''
    if (ficheiros.length === 0) return
    const jaTem = (documentos && documentoEmVigor(documentos, tipo, epocaAtual)?.caminhos.length) || 0
    const cabem = MAX_FICHEIROS - jaTem
    if (ficheiros.length > cabem) {
      toast.warning(`Um documento leva até ${MAX_FICHEIROS} ficheiros: ${ficheiros.length - cabem} ficaram de fora.`)
      ficheiros = ficheiros.slice(0, cabem)
    }
    if (ficheiros.length === 0) return
    setACarregar(tipo)
    try {
      await acrescentarFicheiros(perfilId, tipo, ficheiros)
      toast.success(`${ROTULO_DOCUMENTO[tipo]}: ${ficheiros.length === 1 ? '1 ficheiro guardado' : `${ficheiros.length} ficheiros guardados`}.`)
      ler()
    } catch (err) {
      toast.error(`Não foi possível carregar: ${mensagemDeErro(err)}`)
    } finally {
      setACarregar(null)
    }
  }

  const eliminar = async () => {
    const alvo = aEliminar
    setAEliminar(null)
    if (!alvo) return
    try {
      await tirarFicheiro(alvo.documento, alvo.caminho)
      toast.success('Ficheiro eliminado.')
      ler()
    } catch (err) {
      toast.error(`Não foi possível eliminar: ${mensagemDeErro(err)}`)
    }
  }

  const quando = (d: DocumentoAtleta) => new Date(d.carregado_em).toLocaleDateString('pt-PT')

  /** Os ficheiros de um documento, cada um um link; para quem edita, cada um com o seu eliminar. */
  const ficheirosDe = (documento: DocumentoAtleta, rotulo: string, editavel: boolean) => (
    <ul className="flex flex-wrap items-center gap-x-1 pl-6" aria-label={`Ficheiros: ${rotulo}`}>
      {documento.caminhos.map((caminho, i) => {
        const nome = nomeDoFicheiro(documento.caminhos, i)
        return (
          <li key={caminho} className="flex items-center">
            <LinkDocumento
              valor={caminho}
              className="min-h-11 px-2 inline-flex items-center text-[11.5px] font-bold text-csc-azul-texto hover:underline"
            >
              {nome}<span className="sr-only"> — {rotulo}</span>
            </LinkDocumento>
            {editavel && (
              <BotaoIcone
                discreto
                perigo
                icone={X}
                rotulo={`Eliminar ${nome.toLowerCase()} — ${rotulo}`}
                onClick={() => { triggerHaptic('warning'); setAEliminar({ documento, caminho, nome }) }}
              />
            )}
          </li>
        )
      })}
    </ul>
  )

  if (documentos === null) {
    return (
      <div className="py-3 text-[11px] font-bold text-white/62" role="status">
        A ler os documentos…
      </div>
    )
  }

  return (
    <div>
      <ul aria-label="Documentos">
        {TIPOS_DOCUMENTO.map(tipo => {
          const doc = documentoEmVigor(documentos, tipo, epocaAtual)
          const rotulo = POR_EPOCA[tipo] ? `${ROTULO_DOCUMENTO[tipo]} ${epocaAtual}` : ROTULO_DOCUMENTO[tipo]
          const quantos = doc?.caminhos.length ?? 0
          const ocupado = aCarregar === tipo
          return (
            <li key={tipo} className="linha-leve py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className={`shrink-0 ${doc ? 'text-csc-gold' : 'text-white/35'}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-extrabold text-[12.5px] text-white leading-tight">
                    {ROTULO_DOCUMENTO[tipo]}
                    {POR_EPOCA[tipo] && <span className="font-bold text-white/62"> · {epocaAtual}</span>}
                  </p>
                  <p className={`text-[10.5px] mt-0.5 ${doc ? 'text-white/62' : 'text-white/50'}`}>
                    {ocupado
                      ? 'A carregar…'
                      : doc
                        ? `${quantos} ${quantos === 1 ? 'ficheiro' : 'ficheiros'} · ${quando(doc)}`
                        : 'Em falta'}
                  </p>
                </div>

                {podeEditar && quantos < MAX_FICHEIROS && (
                  /* O campo de ficheiro fica escondido e o rótulo faz de botão; o
                     foco vai para o campo, e o contorno desenha-se no rótulo. */
                  <label
                    className="shrink-0 min-h-11 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl cursor-pointer
                      text-[11.5px] font-display font-extrabold text-csc-gold hover:bg-csc-gold/10
                      has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-csc-gold
                      has-[:disabled]:opacity-45 has-[:disabled]:cursor-not-allowed"
                  >
                    <input
                      id={`${idBase}-doc-${tipo}`}
                      type="file"
                      multiple
                      accept={TIPOS_DE_FICHEIRO_ACEITES}
                      className="sr-only"
                      disabled={aCarregar !== null}
                      onChange={e => carregar(tipo, e)}
                    />
                    <Upload size={14} aria-hidden="true" />
                    {doc ? 'Acrescentar' : 'Carregar'}
                    <span className="sr-only"> — {rotulo.toLowerCase()}</span>
                  </label>
                )}
              </div>

              {doc && ficheirosDe(doc, rotulo.toLowerCase(), podeEditar)}
            </li>
          )
        })}
      </ul>

      {/* As épocas anteriores: guardadas, só para abrir. */}
      {anteriores.length > 0 && (
        <div className="linha-leve">
          <button
            type="button"
            aria-expanded={verAnteriores}
            onClick={() => setVerAnteriores(v => !v)}
            className="w-full min-h-11 flex items-center justify-between gap-2 text-[11px] font-bold text-white/70 cursor-pointer
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Épocas anteriores ({anteriores.length})
            <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${verAnteriores ? 'rotate-180' : ''}`} />
          </button>
          {verAnteriores && (
            <ul aria-label="Documentos de épocas anteriores" className="pb-1">
              {anteriores.map(d => {
                const rotulo = `${ROTULO_DOCUMENTO[d.tipo]} ${d.epoca}`
                return (
                  <li key={d.id} className="linha-leve py-1.5">
                    <p className="pl-6 font-bold text-[12px] text-white/80 leading-tight">{rotulo}</p>
                    <p className="pl-6 text-[10.5px] text-white/50 mt-0.5">
                      {d.caminhos.length} {d.caminhos.length === 1 ? 'ficheiro' : 'ficheiros'} · {quando(d)}
                    </p>
                    {ficheirosDe(d, rotulo.toLowerCase(), false)}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={aEliminar !== null}
        title={`Eliminar ${aEliminar?.nome.toLowerCase() ?? 'ficheiro'}`}
        description={
          aEliminar
            ? aEliminar.documento.caminhos.length === 1
              ? `${ROTULO_DOCUMENTO[aEliminar.documento.tipo]}: é o único ficheiro, e o documento fica em falta.`
              : `${ROTULO_DOCUMENTO[aEliminar.documento.tipo]}: o ficheiro é apagado e não se recupera.`
            : undefined
        }
        confirmText={`Sim, eliminar ${aEliminar?.nome.toLowerCase() ?? 'ficheiro'}`}
        cancelText="Cancelar"
        variant="danger"
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </div>
  )
}

export default BlocoDocumentos
