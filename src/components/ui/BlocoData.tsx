/**
 * O bloco de data à esquerda de uma linha de evento: dia da semana, dia e
 * mês, empilhados como uma folha de calendário.
 *
 * Havia quatro cópias à mão com o dia e o dia da semana — e sem o mês. Numa
 * lista que atravessa a viragem do mês, "16 QUA" não diz se é setembro ou
 * outubro.
 */

type Tamanho = 'pequeno' | 'medio' | 'grande'

const ESTILOS: Record<Tamanho, { caixa: string; dia: string; legenda: string }> = {
  pequeno: { caixa: 'w-9', dia: 'text-[15px]', legenda: 'text-[8px]' },
  medio: { caixa: 'w-11', dia: 'text-[17px]', legenda: 'text-[8.5px]' },
  grande: { caixa: 'w-11', dia: 'text-[19px]', legenda: 'text-[8.5px]' },
}

const DIA_SEMANA = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' })
const MES = new Intl.DateTimeFormat('pt-PT', { month: 'short' })

export function BlocoData({ quando, tamanho = 'medio' }: { quando: Date; tamanho?: Tamanho }) {
  const e = ESTILOS[tamanho]
  const legenda = `block font-display font-bold ${e.legenda} tracking-[0.1em] uppercase text-white/62`
  return (
    <span className={`${e.caixa} shrink-0 text-center`}>
      <span className={legenda}>
        {DIA_SEMANA.format(quando).replace(/\.?(-feira)?,?$/, '')}
      </span>
      <span className={`block font-display font-black ${e.dia} text-csc-gold leading-none tabular-nums my-0.5`}>
        {String(quando.getDate()).padStart(2, '0')}
      </span>
      <span className={legenda}>
        {MES.format(quando).replace('.', '')}
      </span>
    </span>
  )
}
