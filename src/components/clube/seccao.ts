import type React from 'react'

/**
 * O que o Clube dá a cada secção: o seu cabeçalho ("‹ Clube", sobrancelha e
 * título), já montado. A secção chama-o no topo e passa-lhe o seu [+] — é ela
 * que sabe criar, e o [+] vive no canto da sobrancelha, como em todos os
 * ecrãs. Até 2026-09-26 o cabeçalho era do Clube e o [+] ia ao lado da
 * procura, porque era o único sítio a que a secção chegava.
 */
export interface PropsDaSeccao {
  cabecalho: (acoes?: React.ReactNode) => React.ReactNode
}
