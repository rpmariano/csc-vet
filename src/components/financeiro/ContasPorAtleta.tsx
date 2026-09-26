import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Copy, Search, Share2, SlidersHorizontal } from 'lucide-react'
import { BottomSheet } from '../BottomSheet'
import { Botao, LinhaAtleta, NumeroCamisola, Pastilha } from '../ui'
import { toast } from '../../context/ToastContext'
import { triggerHaptic } from '../../utils/haptics'
import { BARRA_ATRASO, BARRA_AVISO, BARRA_PAGO, ETIQUETA_GRUPO, fmtEuro } from './estilos'
import {
  ESTADOS, diaEMes, enderecoWhatsApp, filtrarConta, nomeDoMes, resumoDasLinhas, textoDaConta, textoDaLista,
  type ContaDoAtleta, type EstadoDaLinha, type LinhaDeConta,
} from './contasDosAtletas'
import { CLASSE_CAMPO as CAMPO, CLASSE_ETIQUETA_CAMPO as ETIQUETA } from '../ui/formulario'

/**
 * Contas por atleta (Financeiro) — quem deve o quê, o que está a pagamento e
 * o que já entrou, e a mesma coisa em texto para o WhatsApp.
 *
 * Responde a duas perguntas. **"Quem está em dívida?"** é a lista: uma
 * secção por estado, e em cada uma os atletas que lá têm alguma coisa, com o
 * que é — "Quotas set, out · Seguro Desportivo" — e quanto. Um atleta pode
 * estar nas três secções, e é de propósito: cada banda soma as linhas que tem
 * por baixo, e isso só é verdade se cada linha contar o que é dela. Agrupar
 * cada atleta pelo seu pior estado punha na banda "A pagamento" um total que
 * não era o que estava a pagamento.
 *
 * **"O que é que o X pagou ou deve?"** é a conta do atleta: toca-se no nome e
 * abre por cima a persiana com as três secções, linha a linha, por
 * categoria. Vai no endereço (`?conta=`), como as outras fichas.
 *
 * As regras de dívida vêm de `contasDosAtletas.ts`, e as de lá são as do
 * resto da app.
 */

/** A cor de cada estado — a mesma das Quotas e dos Encargos. */
const COR: Record<EstadoDaLinha, { titulo: string; barra: string; valor: string }> = {
  divida: { titulo: 'text-csc-vermelho-texto', barra: BARRA_ATRASO, valor: 'text-csc-vermelho-texto' },
  'a-pagamento': { titulo: 'text-csc-gold', barra: BARRA_AVISO, valor: 'text-csc-gold' },
  pago: { titulo: 'text-csc-verde-texto', barra: BARRA_PAGO, valor: 'text-white/62' },
}

/** O que se diz numa secção vazia da conta de um atleta. */
const VAZIO: Record<EstadoDaLinha, string> = {
  divida: 'Nada em dívida.',
  'a-pagamento': 'Nada a pagamento.',
  pago: 'Ainda não pagou nada nesta época.',
}

/** Procurar sem contar com maiúsculas nem acentos: "joao" encontra o João. */
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

const ARIA_SECCAO: Record<EstadoDaLinha, string> = {
  divida: 'Em dívida',
  'a-pagamento': 'A pagamento',
  pago: 'Pago',
}

/** A letra pequena de uma linha da conta: o prazo, ou quando se pagou. */
const detalheDaLinha = (l: LinhaDeConta, estado: EstadoDaLinha): string => {
  const partes: string[] = []
  if (estado === 'pago') {
    if (l.pagoEm) partes.push(`pago a ${diaEMes(l.pagoEm)}`)
    if (l.parcial) partes.push(`de ${fmtEuro(l.parcial.total)}`)
  } else {
    partes.push(l.prazo ? `${estado === 'divida' ? 'prazo' : 'até'} ${diaEMes(l.prazo)}` : 'sem prazo')
    if (l.parcial) partes.push(`já pagou ${fmtEuro(l.parcial.pago)}`)
  }
  return partes.join(' · ')
}

/**
 * A mensagem como o WhatsApp a vai mostrar: o `*negrito*` a negrito. É o que
 * sai — e antes de mandar para o grupo da equipa uma lista com nomes e
 * valores, vê-se o que vai.
 */
const PreVisualizacao: React.FC<{ texto: string }> = ({ texto }) => (
  <figure
    aria-label="Pré-visualização da mensagem"
    className="rounded-2xl rounded-tr-md bg-[#144d37] border border-white/10 px-3.5 py-3 text-[12px] leading-relaxed text-white/90 whitespace-pre-wrap break-words"
  >
    {texto.split('\n').map((linha, i) => (
      <React.Fragment key={i}>
        {i > 0 && '\n'}
        {linha.split(/(\*[^*\n]+\*)/g).map((pedaco, j) =>
          pedaco.startsWith('*') && pedaco.endsWith('*') && pedaco.length > 2
            ? <strong key={j} className="font-bold text-white">{pedaco.slice(1, -1)}</strong>
            : pedaco,
        )}
      </React.Fragment>
    ))}
  </figure>
)

/** Copiar e abrir no WhatsApp — os dois caminhos para a mesma mensagem. */
const usarMensagem = () => {
  const copiar = async (texto: string) => {
    triggerHaptic('light')
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Mensagem copiada. Cola-a no WhatsApp.')
    } catch {
      toast.error('Não foi possível copiar a mensagem neste browser.')
    }
  }
  const abrirWhatsApp = (texto: string) => {
    triggerHaptic('medium')
    window.open(enderecoWhatsApp(texto), '_blank', 'noopener,noreferrer')
  }
  return { copiar, abrirWhatsApp }
}

export interface ContasPorAtletaProps {
  contas: ContaDoAtleta[]
  /** A sigla do clube, para o cabeçalho da mensagem. */
  clube: string
}

export const ContasPorAtleta: React.FC<ContasPorAtletaProps> = ({ contas, clube }) => {
  const [params, setParams] = useSearchParams()
  const [procura, setProcura] = useState('')
  const [categoria, setCategoria] = useState('')
  const [mes, setMes] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [partilhaAberta, setPartilhaAberta] = useState(false)
  const [incluir, setIncluir] = useState<Record<EstadoDaLinha, boolean>>({
    divida: true,
    'a-pagamento': true,
    pago: false,
  })
  /* O que já entrou é consulta, e é a secção mais comprida: começa fechada. */
  const [fechadas, setFechadas] = useState<Set<EstadoDaLinha>>(new Set(['pago']))
  const { copiar, abrirWhatsApp } = usarMensagem()

  /* As escolhas do funil saem das próprias contas: só se oferece o que existe. */
  const categorias = useMemo(() => {
    const todas = new Set<string>()
    for (const c of contas) for (const { chave } of ESTADOS) for (const l of c.linhas[chave]) todas.add(l.categoria)
    return [...todas].sort((a, b) =>
      a === 'Quotas' ? -1 : b === 'Quotas' ? 1 : a.localeCompare(b, 'pt', { sensitivity: 'base' }))
  }, [contas])
  const meses = useMemo(() => {
    const todos = new Set<string>()
    for (const c of contas) for (const { chave } of ESTADOS) for (const l of c.linhas[chave]) if (l.mes) todos.add(l.mes)
    return [...todos].sort()
  }, [contas])

  const temFiltros = categoria !== '' || mes !== ''
  const filtradas = useMemo(
    () => contas.map(c => filtrarConta(c, { categoria: categoria || null, mes: mes || null })),
    [contas, categoria, mes],
  )
  const visiveis = useMemo(() => {
    const termo = normalizar(procura)
    return termo ? filtradas.filter(c => normalizar(c.nome).includes(termo)) : filtradas
  }, [filtradas, procura])

  const aProcurar = procura.trim() !== ''
  const estaAberta = (e: EstadoDaLinha) => aProcurar || !fechadas.has(e)
  const alternar = (e: EstadoDaLinha) => {
    triggerHaptic('selection')
    setFechadas(atual => {
      const proximo = new Set(atual)
      if (proximo.has(e)) proximo.delete(e)
      else proximo.add(e)
      return proximo
    })
  }

  const limparFiltros = () => {
    triggerHaptic('light')
    setCategoria('')
    setMes('')
  }
  const resumoFiltros = [categoria || null, mes ? nomeDoMes(mes) : null].filter(Boolean).join(' · ')

  /* ------------------------------------------------ a conta de um atleta */
  /*
    Aberta ou fechada decide-o o endereço, durante o render — nunca uma cópia
    em estado (ver os riscos no CLAUDE.md, ponto 6). A conta fica retida para
    a persiana poder deslizar para fora depois de o `?conta=` sair.
  */
  const idConta = params.get('conta')
  const contaDoEndereco = idConta ? contas.find(c => c.id === idConta) ?? null : null
  const [retida, setRetida] = useState<ContaDoAtleta | null>(null)
  if (contaDoEndereco && contaDoEndereco !== retida) setRetida(contaDoEndereco)
  const contaMostrada = contaDoEndereco ?? retida

  const abrirConta = (id: string) => {
    triggerHaptic('light')
    const seguintes = new URLSearchParams(params)
    seguintes.set('conta', id)
    setParams(seguintes)
  }
  const fecharConta = () => {
    if (!params.get('conta')) return
    const seguintes = new URLSearchParams(params)
    seguintes.delete('conta')
    setParams(seguintes, { replace: true })
  }

  const textoDaListaAtual = useMemo(
    () => textoDaLista(visiveis, { clube, incluir, categoria: categoria || null, mes: mes || null }),
    [visiveis, clube, incluir, categoria, mes],
  )
  const nadaIncluido = !ESTADOS.some(e => incluir[e.chave])

  return (
    <div className="space-y-3">
      <p className="px-1 text-[10.5px] leading-relaxed text-white/50">
        Em dívida é o que passou do prazo. A pagamento, o que ainda está dentro dele — as quotas só
        contam quando vencem.
      </p>

      {/* Procurar, o funil e partilhar. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
          <input
            type="search"
            value={procura}
            onChange={e => setProcura(e.target.value)}
            placeholder="Procurar atleta"
            aria-label="Procurar atleta"
            className={`${CAMPO} pl-9.5`}
          />
        </div>
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setFiltrosAbertos(true) }}
          aria-label={temFiltros ? 'Filtros (ativos)' : 'Filtros'}
          className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer
            transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
              temFiltros
                ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                : 'bg-white/10 border-white/15 text-white/75'
            }`}
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          type="button"
          onClick={() => { triggerHaptic('light'); setPartilhaAberta(true) }}
          className="h-11 px-3.5 rounded-full border bg-white/10 border-white/15 text-white flex items-center gap-1.5 shrink-0
            font-display font-extrabold text-[11.5px] cursor-pointer transition-transform duration-150 active:scale-97
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
        >
          <Share2 size={15} />
          Partilhar
        </button>
      </div>

      {/* O que o funil esconde, escrito — um filtro que não se vê é um filtro que se esquece. */}
      {temFiltros && (
        <button
          type="button"
          onClick={limparFiltros}
          className="cartao-simples w-full min-h-11 flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer
            bg-csc-gold/10 border-csc-gold/30 transition-transform duration-150 active:scale-97"
        >
          <SlidersHorizontal size={14} className="text-csc-gold shrink-0" />
          <span className="flex-1 font-display font-bold text-[11px] text-white/80">{resumoFiltros}</span>
          <span className="font-display font-bold text-[11px] text-csc-gold">Limpar</span>
        </button>
      )}

      {contas.length === 0 ? (
        <p className="cartao-simples p-4 text-[11.5px] text-white/62">
          Ainda não há quotas vencidas, encargos nem pagamentos nesta época.
        </p>
      ) : (
        ESTADOS.map(({ chave, titulo }) => {
          const lista = visiveis.filter(c => c.linhas[chave].length > 0)
          /*
            Uma secção vazia não se desenha — exceto a da dívida: "ninguém em
            dívida" é a resposta à pergunta que traz aqui quase toda a gente,
            e das boas. Com uma procura, a secção vazia não diz nada.
          */
          if (lista.length === 0 && (chave !== 'divida' || aProcurar)) return null
          const aberta = estaAberta(chave)
          const total = lista.reduce((s, c) => s + c.totais[chave], 0)
          return (
            <section key={chave} aria-label={ARIA_SECCAO[chave]} className="rounded-2xl border border-white/12 overflow-hidden">
              <button
                type="button"
                onClick={() => alternar(chave)}
                aria-expanded={aberta}
                disabled={lista.length === 0}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 bg-white/[0.07] text-left cursor-pointer disabled:cursor-default
                  focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold"
              >
                <span className={`font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase ${COR[chave].titulo}`}>
                  {titulo}
                </span>
                <span className="text-[10px] font-bold text-white/45 tabular-nums">{lista.length}</span>
                <span className={`ml-auto font-display font-black text-[10.5px] tabular-nums ${COR[chave].titulo}`}>
                  {fmtEuro(total)}
                </span>
                {lista.length > 0 && (
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className={`shrink-0 text-white/45 transition-transform duration-200 ${aberta ? 'rotate-180' : ''}`}
                  />
                )}
              </button>

              {lista.length === 0 ? (
                <p className="px-3.5 py-3 border-t border-white/12 text-[11.5px] text-white/62">
                  {temFiltros ? 'Ninguém em dívida com estes filtros.' : 'Ninguém em dívida.'}
                </p>
              ) : aberta && (
                <div className="border-t border-white/12">
                  {lista.map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => abrirConta(c.id)}
                      aria-haspopup="dialog"
                      className={`w-full min-h-12 flex items-center gap-2.5 pl-2.5 pr-3 py-2 text-left cursor-pointer transition-colors
                        hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-csc-gold ${
                          i > 0 ? 'border-t border-white/8' : ''
                        }`}
                    >
                      <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full shrink-0 ${COR[chave].barra}`} />
                      <LinhaAtleta
                        numero={c.numero}
                        nome={c.nome}
                        detalhe={resumoDasLinhas(c.linhas[chave], chave, { comCategoria: !categoria })}
                        direita={
                          <span className={`shrink-0 font-display font-black text-[12.5px] tabular-nums ${COR[chave].valor}`}>
                            {fmtEuro(c.totais[chave])}
                          </span>
                        }
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}

      {aProcurar && visiveis.every(c => ESTADOS.every(e => c.linhas[e.chave].length === 0)) && (
        <p className="cartao-simples p-4 text-[11.5px] text-white/62">
          {visiveis.length === 0
            ? `Ninguém com "${procura.trim()}" no nome tem contas nesta época.`
            : visiveis.length === 1
              ? `${visiveis[0].nome} não tem nada em dívida, a pagamento nem pago${temFiltros ? ' com estes filtros' : ' nesta época'}.`
              : `Nada em dívida, a pagamento nem pago${temFiltros ? ' com estes filtros' : ''}.`}
        </p>
      )}

      {/* ---------------------------------------------------- os filtros */}
      <BottomSheet
        isOpen={filtrosAbertos}
        onClose={() => setFiltrosAbertos(false)}
        title="Contas por atleta"
        description="Que categoria e que mês"
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-gold/20 text-csc-gold flex items-center justify-center shrink-0">
            <SlidersHorizontal size={17} />
          </div>
        }
        footer={
          <>
            <Botao aparencia="vidro" onClick={limparFiltros} disabled={!temFiltros}>Limpar</Botao>
            <Botao onClick={() => setFiltrosAbertos(false)}>Ver a lista</Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={ETIQUETA} htmlFor="contas-categoria">Categoria</label>
            <select id="contas-categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className={CAMPO}>
              <option value="">Todas as categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="contas-mes">Mês</label>
            <select id="contas-mes" value={mes} onChange={e => setMes(e.target.value)} className={CAMPO}>
              <option value="">Todos os meses</option>
              {meses.map(m => <option key={m} value={m}>{nomeDoMes(m)}</option>)}
            </select>
            <p className="text-[10.5px] leading-relaxed text-white/50 mt-1.5">
              O mês da quota, ou o mês do prazo do encargo.
            </p>
          </div>
        </div>
      </BottomSheet>

      {/* --------------------------------------------- partilhar a lista */}
      <BottomSheet
        isOpen={partilhaAberta}
        onClose={() => setPartilhaAberta(false)}
        title="Partilhar no WhatsApp"
        description={resumoFiltros || 'Todas as categorias e meses'}
        icon={
          <div className="w-9 h-9 rounded-xl bg-csc-light/20 text-csc-verde-texto flex items-center justify-center shrink-0">
            <Share2 size={17} />
          </div>
        }
        footer={
          <>
            <Botao aparencia="vidro" onClick={() => copiar(textoDaListaAtual)} disabled={nadaIncluido}>
              <Copy size={15} />
              Copiar
            </Botao>
            <Botao onClick={() => abrirWhatsApp(textoDaListaAtual)} disabled={nadaIncluido}>
              Abrir no WhatsApp
            </Botao>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className={ETIQUETA}>O que vai na mensagem</p>
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map(({ chave, titulo }) => (
                <Pastilha
                  key={chave}
                  ativa={incluir[chave]}
                  onClick={() => {
                    triggerHaptic('selection')
                    setIncluir(atual => ({ ...atual, [chave]: !atual[chave] }))
                  }}
                >
                  {titulo}
                </Pastilha>
              ))}
            </div>
            {aProcurar && (
              <p className="text-[10.5px] leading-relaxed text-white/50 mt-2">
                Só os atletas da procura "{procura.trim()}".
              </p>
            )}
          </div>
          {nadaIncluido ? (
            <p className="text-[11.5px] text-white/62">Escolhe pelo menos uma secção.</p>
          ) : (
            <PreVisualizacao texto={textoDaListaAtual} />
          )}
        </div>
      </BottomSheet>

      {/* ---------------------------------------------- a conta do atleta
          Fica persiana, ao contrário das fichas (ver `EcraDetalhe`): é o
          pormenor de uma linha, e o trabalho é a lista — vê-se o que um
          atleta deve e volta-se para o seguinte. */}
      <BottomSheet
        isOpen={Boolean(idConta)}
        onClose={fecharConta}
        title={contaMostrada?.nome ?? 'Contas'}
        description="Quotas e encargos desta época"
        icon={<NumeroCamisola numero={contaMostrada?.numero} />}
        footer={contaMostrada && (
          <>
            <Botao aparencia="vidro" onClick={() => copiar(textoDaConta(contaMostrada, { clube }))}>
              <Copy size={15} />
              Copiar
            </Botao>
            <Botao onClick={() => abrirWhatsApp(textoDaConta(contaMostrada, { clube }))}>
              Enviar pelo WhatsApp
            </Botao>
          </>
        )}
      >
        {contaMostrada ? (
          <div className="space-y-3">
            {ESTADOS.map(({ chave, titulo }) => {
              const linhas = contaMostrada.linhas[chave]
              const grupos = new Map<string, LinhaDeConta[]>()
              for (const l of linhas) grupos.set(l.categoria, [...(grupos.get(l.categoria) ?? []), l])
              return (
                <section key={chave} aria-label={ARIA_SECCAO[chave]} className="rounded-2xl border border-white/12 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.07] border-b border-white/12">
                    <span className={`font-display font-extrabold text-[9.5px] tracking-[0.16em] uppercase ${COR[chave].titulo}`}>
                      {titulo}
                    </span>
                    <span className={`ml-auto font-display font-black text-[12px] tabular-nums ${COR[chave].titulo}`}>
                      {fmtEuro(contaMostrada.totais[chave])}
                    </span>
                  </div>
                  {linhas.length === 0 ? (
                    <p className="px-3.5 py-3 text-[11.5px] text-white/55">{VAZIO[chave]}</p>
                  ) : (
                    [...grupos.entries()].map(([nome, doGrupo]) => (
                      <div key={nome}>
                        <p className={`${ETIQUETA_GRUPO} px-3.5 pt-2.5 pb-1`}>{nome}</p>
                        {doGrupo.map(l => (
                          <div key={l.chave} className="flex items-center gap-3 pl-2.5 pr-3.5 py-2.5 border-t border-white/7 first-of-type:border-t-0">
                            <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full shrink-0 ${COR[chave].barra}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-display font-extrabold text-[13px] text-white break-words">
                                {l.descricao}
                              </span>
                              <span className="block text-[10.5px] text-white/55 mt-0.5">{detalheDaLinha(l, chave)}</span>
                            </span>
                            <span className={`shrink-0 font-display font-black text-[13px] tabular-nums ${
                              chave === 'pago' ? 'text-white/62' : 'text-white'
                            }`}>
                              {fmtEuro(l.valor)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </section>
              )
            })}
          </div>
        ) : (
          <p className="text-[11.5px] text-white/62">Este atleta não tem quotas nem encargos nesta época.</p>
        )}
      </BottomSheet>
    </div>
  )
}

export default ContasPorAtleta
