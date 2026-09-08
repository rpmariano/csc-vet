import React from 'react'
import { AvatarPerfil } from './AvatarPerfil'
import { TituloEcra } from './Tipografia'

/**
 * O cabeçalho de um ecrã: uma sobrancelha dourada, o nome do ecrã em grande e
 * a fotografia no canto.
 *
 * No redesenho não há barra de topo comum a todos os ecrãs — cada um tem o seu
 * título, e o que se repete é só a fotografia, que abre o Perfil. A Home é a
 * exceção: em vez de um título tem a saudação, e é o único sítio onde aparece
 * também o sino dos comunicados.
 *
 * A sobrancelha ("ÉPOCA 25/26", "GESTÃO") é opcional e serve para situar sem
 * gastar uma linha de texto corrido.
 */

export interface CabecalhoEcraProps {
  titulo: string
  /** Linha pequena e espaçada por cima do título. */
  sobrancelha?: string
  /** Linha discreta por baixo do título. */
  legenda?: string
  /** Ações à direita, antes da fotografia. */
  acoes?: React.ReactNode
  className?: string
}

export const CabecalhoEcra: React.FC<CabecalhoEcraProps> = ({
  titulo,
  sobrancelha,
  legenda,
  acoes,
  className = '',
}) => (
  <header className={`flex items-center gap-3 pt-safe ${className}`}>
    <div className="flex-1 min-w-0">
      {sobrancelha && (
        <p className="font-display font-extrabold text-[10px] tracking-[0.24em] text-csc-gold uppercase">
          {sobrancelha}
        </p>
      )}
      <TituloEcra className={sobrancelha ? 'mt-2' : ''}>{titulo}</TituloEcra>
      {legenda && <p className="text-[11px] text-white/62 mt-1.5">{legenda}</p>}
    </div>

    {acoes}
    <AvatarPerfil />
  </header>
)

export default CabecalhoEcra
