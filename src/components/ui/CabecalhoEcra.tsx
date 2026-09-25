import React from 'react'
import { TituloEcra } from './Tipografia'

/**
 * O cabeçalho de um ecrã: uma sobrancelha dourada e o nome do ecrã em grande.
 *
 * **O canto já não é daqui.** O clube, a época, o sinal de pagamentos, o
 * estado clínico, o sino e a fotografia são o `CabecalhoApp`, na moldura: um
 * só, igual em todos os ecrãs e preso ao topo ao rolar (2026-09-25). Até aí o
 * canto era desenhado em cada ecrã, numa linha sua ao lado da sobrancelha, e o
 * da Home era outro.
 *
 * A sobrancelha ("ÉPOCA 25/26", "GESTÃO") é opcional e serve para situar sem
 * gastar uma linha de texto corrido; fica numa linha só, cortada se não
 * couber. As `acoes` (o "+" do Plantel, por exemplo) ficam na mesma linha, à
 * direita.
 *
 * O título tem a largura toda — foi para isso que o canto saiu de ao lado
 * dele, e continua a não ter nada ao lado.
 */

export interface CabecalhoEcraProps {
  titulo: string
  /** Linha pequena e espaçada por cima do título. */
  sobrancelha?: string
  /** Linha discreta por baixo do título. */
  legenda?: string
  /** Ações à direita da sobrancelha. */
  acoes?: React.ReactNode
  /** `id` do título, para uma região se nomear por ele (`aria-labelledby`). */
  idTitulo?: string
  className?: string
}

export const CabecalhoEcra: React.FC<CabecalhoEcraProps> = ({
  titulo,
  sobrancelha,
  legenda,
  acoes,
  idTitulo,
  className = '',
}) => (
  <header className={className}>
    {(sobrancelha || acoes) && (
      <div className="flex items-center gap-3 min-h-7">
        <p className="flex-1 min-w-0 font-display font-extrabold text-[10px] tracking-[0.24em] text-csc-gold uppercase truncate">
          {sobrancelha}
        </p>
        {acoes}
      </div>
    )}
    {/* `break-words` é a última rede: uma palavra que não coubesse nunca
        passaria da coluna. */}
    <TituloEcra id={idTitulo} className="mt-2 break-words">{titulo}</TituloEcra>
    {legenda && <p className="text-[11px] text-white/62 mt-1.5">{legenda}</p>}
  </header>
)

export default CabecalhoEcra
