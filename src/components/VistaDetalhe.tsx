import { forwardRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { BottomSheet, type BottomSheetProps } from './BottomSheet'
import { useEhDesktop } from '../hooks/useEhDesktop'

/**
 * Ecrã de detalhe de uma entidade — um evento, uma ficha de atleta.
 *
 * No **telemóvel** é a persiana de sempre: sobe de baixo, fecha-se com um
 * arrasto, é um diálogo por cima da lista.
 *
 * No **desktop** não é diálogo nenhum: é a página. O conteúdo passa a ocupar a
 * área principal, com uma barra de voltar por cima, e a lista de onde se veio
 * desaparece — como em qualquer site. Sem sobreposição, sem prisão de foco,
 * com o scroll normal da página e um endereço próprio na barra do browser.
 *
 * O conteúdo é exatamente o mesmo nos dois casos: quem usa este componente
 * escreve o detalhe uma vez e não trata do resto.
 */

export interface VistaDetalheProps extends BottomSheetProps {
  /** Texto do botão de voltar no desktop. */
  voltarTexto?: string
}

export const VistaDetalhe = forwardRef<HTMLDivElement, VistaDetalheProps>(function VistaDetalhe(
  { voltarTexto = 'Voltar', children, ...props },
  ref,
) {
  const ehDesktop = useEhDesktop()

  if (!ehDesktop) {
    return (
      <BottomSheet ref={ref} {...props}>
        {children}
      </BottomSheet>
    )
  }

  if (!props.isOpen) return null

  const { onClose, tone = 'dark', className = '', footer, ariaLabel } = props
  const corFundo = tone === 'dark' ? 'bg-csc-dark text-white' : 'bg-white'
  const corBordo = tone === 'dark' ? 'border-white/10' : 'border-gray-100'

  return (
    <section aria-label={ariaLabel} className="space-y-3">
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 text-xs font-black text-gray-500 hover:text-csc-dark transition-colors cursor-pointer group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        <span>{voltarTexto}</span>
      </button>

      <div ref={ref} className={`${corFundo} rounded-3xl shadow-sm border ${corBordo} p-6 ${className}`}>
        {children}
      </div>

      {footer && (
        <div className={`${corFundo} rounded-3xl shadow-sm border ${corBordo} p-4 flex items-center justify-end gap-2.5`}>
          {footer}
        </div>
      )}
    </section>
  )
})

export default VistaDetalhe
