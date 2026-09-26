import { triggerHaptic } from '../../utils/haptics'

export interface Mosaico<K extends string> {
  chave: K
  etiqueta: string
  valor: number
  /** Cor da etiqueta ("text-csc-verde-texto"). */
  cor: string
  /** Fundo e aro quando aceso. */
  fundoAtivo: string
}

export interface MosaicosProps<K extends string> {
  mosaicos: Mosaico<K>[]
  /** O mosaico aceso; `null` quando nenhum filtra. */
  ativo: K | null
  aoEscolher: (chave: K | null) => void
  /**
   * O mosaico que quer dizer "todos" (o total da convocatória). Tocar num
   * mosaico aceso volta a ele — ou a nenhum, quando não há.
   */
  todos?: K
}

/**
 * Contadores que também filtram: cada mosaico diz quantos há e, tocado, mostra
 * só esses. **Tocar no mosaico aceso volta a todos** — o mesmo gesto em todo o
 * lado.
 *
 * São a exceção à regra "o que filtra fica atrás do funil" (decisão de
 * 2026-09-26): o número é o resumo do ecrã, e escondê-lo num funil perdia-o.
 * Havia duas versões, a da convocatória (com um "Limpar Filtro" à parte) e uma
 * cópia à mão no Plantel.
 */
export function Mosaicos<K extends string>({ mosaicos, ativo, aoEscolher, todos }: MosaicosProps<K>) {
  const colunas = mosaicos.length === 4 ? 'grid-cols-4' : mosaicos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid ${colunas} gap-2`}>
      {mosaicos.map(m => {
        const aceso = ativo === m.chave
        return (
          <button
            key={m.chave}
            type="button"
            onClick={() => {
              triggerHaptic('selection')
              aoEscolher(aceso && m.chave !== todos ? (todos ?? null) : m.chave)
            }}
            aria-pressed={aceso}
            className={`min-h-14 px-2.5 py-2.5 rounded-2xl text-left cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                aceso ? m.fundoAtivo : 'bg-white/5 '
              }`}
          >
            <span className={`block font-display font-extrabold text-[8px] tracking-[0.1em] uppercase leading-tight ${m.cor}`}>
              {m.etiqueta}
            </span>
            <span className="block font-display font-extrabold text-[19px] text-white mt-1 tabular-nums">
              {m.valor}
            </span>
          </button>
        )
      })}
    </div>
  )
}
