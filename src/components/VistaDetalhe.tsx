import { forwardRef } from 'react'
import { BottomSheet, type BottomSheetProps } from './BottomSheet'

/**
 * Ecrã de detalhe de uma entidade — um evento, uma ficha de atleta.
 *
 * Era o componente que decidia a moldura pelo tamanho do ecrã: persiana no
 * telemóvel, página inteira no computador. Com o redesenho de 2026 deixou de
 * haver duas UIs — a app é de telemóvel, e no computador é a mesma coisa numa
 * coluna ao meio — por isso a persiana passou a ser a única forma.
 *
 * O componente fica, e não foi substituído pelo `BottomSheet` em cada sítio,
 * por três razões: marca a intenção (isto é *ver uma entidade*, não um
 * formulário curto), é o gancho onde vive a convenção de o detalhe ir no
 * endereço (`?event=`, `?atleta=`) — o que lhe dá link próprio e faz o
 * retroceder do browser fechá-lo — e é onde se voltaria a mexer se algum dia
 * a moldura tornasse a divergir.
 */

export interface VistaDetalheProps extends BottomSheetProps {
  /**
   * Texto do botão de voltar. Sem efeito desde que o detalhe é sempre
   * persiana; mantido para não obrigar a mexer nos sítios que o passam.
   * @deprecated
   */
  voltarTexto?: string
}

export const VistaDetalhe = forwardRef<HTMLDivElement, VistaDetalheProps>(function VistaDetalhe(
  { voltarTexto: _voltarTexto, children, ...props },
  ref,
) {
  return (
    <BottomSheet ref={ref} {...props}>
      {children}
    </BottomSheet>
  )
})

export default VistaDetalhe
