import React from 'react'
import { TituloEcra } from './Tipografia'

/**
 * O cabeçalho de um ecrã — o mesmo em todos, pela mesma ordem (decisão de
 * 2026-09-26):
 *
 *     ‹ Origem                       (`voltar`, só quando se veio de outro sítio)
 *     SOBRANCELHA ··············· [+] (a linha existe sempre, 48px)
 *     Título
 *     legenda
 *
 * **A linha da sobrancelha tem sempre a mesma altura**, haja sobrancelha, [+]
 * ou nada. Só aparecia quando havia uma das duas, e com o círculo de 48px do
 * Plantel esticava-se: o título caía em três alturas diferentes conforme o
 * ecrã — colado ao "‹ Clube" nos Torneios, 120px abaixo no Plantel.
 *
 * **Criar é sempre o `<BotaoCriar>` em `acoes`**, no canto da sobrancelha —
 * não ao lado da procura, não numa barra por cima dela, não no meio do
 * conteúdo. Havia os quatro.
 *
 * O canto do clube (época, sino, fotografia) é o `CabecalhoApp`, na moldura.
 * O título tem a largura toda e nada ao lado.
 */

export interface CabecalhoEcraProps {
  titulo: string
  sobrancelha?: string
  legenda?: string
  /** O [+] de criar (`<BotaoCriar>`), à direita da sobrancelha. */
  acoes?: React.ReactNode
  /** O "‹" (`<BotaoVoltar>` ou `<VoltarAOrigem>`), por cima de tudo. */
  voltar?: React.ReactNode
  idTitulo?: string
  className?: string
}

export const CabecalhoEcra: React.FC<CabecalhoEcraProps> = ({
  titulo,
  sobrancelha,
  legenda,
  acoes,
  voltar,
  idTitulo,
  className = '',
}) => (
  /* A margem por baixo é do cabeçalho, e é a mesma em todo o lado: cada
     ecrã punha a sua (4, 12, 16 ou 24px), e com o `space-y` do Tailwind 4 a
     classe do ecrã ganhava à do contentor. */
  <header className={`mb-5 ${className}`}>
    {voltar}
    <div className="flex items-center gap-3 h-12">
      <p className="flex-1 min-w-0 font-display font-extrabold text-[10px] tracking-[0.24em] text-csc-gold uppercase truncate">
        {sobrancelha}
      </p>
      {acoes}
    </div>
    {/* `break-words` é a última rede: uma palavra que não coubesse nunca
        passaria da coluna. */}
    <TituloEcra id={idTitulo} className="mt-1 break-words">{titulo}</TituloEcra>
    {legenda && <p className="text-[11px] text-white/62 mt-1.5">{legenda}</p>}
  </header>
)

export default CabecalhoEcra
