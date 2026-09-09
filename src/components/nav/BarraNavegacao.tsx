import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, type LucideIcon } from 'lucide-react'
import { useRealceDeslizante } from '../../hooks/useRealceDeslizante'
import { triggerHaptic } from '../../utils/haptics'
import { useSaidaGuardada } from '../../context/SaidaGuardadaContext'

/**
 * A barra de navegação inferior — a única navegação da app.
 *
 * Flutua sobre o conteúdo em vez de estar encostada à base, com o realce
 * dourado a correr por trás do item ativo (o mesmo mecanismo dos separadores
 * das páginas, ver `useRealceDeslizante`). Ao chegar, o ícone do ativo desce
 * 8px para o meio do realce e a etiqueta apaga-se: fica só o ícone sobre o
 * dourado, e a etiqueta volta quando se sai.
 *
 * Tem duas formas, conforme o perfil:
 *  - **três lugares**, sem botão central, para quem só consulta;
 *  - **quatro lugares com [+] ao meio**, para quem cria — o [+] não é uma
 *    rota, é uma folha de criação, por isso nunca fica ativo nem entra na
 *    conta do realce.
 */

export interface ItemNavegacao {
  to: string
  etiqueta: string
  Icone: LucideIcon
  /** Rotas que também acendem este item (ex.: o detalhe de um evento). */
  tambemEm?: readonly string[]
}

export interface BarraNavegacaoProps {
  itens: readonly ItemNavegacao[]
  /** Caminho atual, para decidir o item ativo. */
  caminho: string
  /** Mostra o [+] ao meio da fila. Só para treinador e direção. */
  aoCriar?: () => void
}

/**
 * Largura da pastilha de realce, igual em todos os lugares da barra. Fixa, e
 * não a largura do item: senão "Competição" teria uma pastilha do dobro de
 * "Hoje" e o realce mudaria de tamanho ao passear pela barra.
 */
const LARGURA_REALCE = 46

/** Verdadeiro se o caminho atual pertence a este item. */
function estaAtivo(item: ItemNavegacao, caminho: string): boolean {
  if (item.to === '/') return caminho === '/'
  return caminho === item.to || (item.tambemEm?.includes(caminho) ?? false)
}

export const BarraNavegacao: React.FC<BarraNavegacaoProps> = ({ itens, caminho, aoCriar }) => {
  const indiceAtivo = itens.findIndex(item => estaAtivo(item, caminho))
  const navegar = useNavigate()
  /*
    Sair de um ecrã com um formulário por gravar — o Perfil, um comunicado por
    publicar, as definições financeiras — passa quase sempre por aqui. A página
    regista-se no guarda e este pergunta antes de a barra levar o utilizador
    embora; sem isto o trabalho ia à vida por um toque.
  */
  const { pedirSaida } = useSaidaGuardada()
  const { refFila, refItem, estiloRealce } = useRealceDeslizante(indiceAtivo, {
    larguraFixa: LARGURA_REALCE,
  })

  // Com [+], ele ocupa o meio da fila: os itens seguintes ficam à sua direita.
  const meio = aoCriar ? Math.ceil(itens.length / 2) : -1

  const renderItem = (item: ItemNavegacao, i: number) => {
    const ativo = i === indiceAtivo
    return (
      <Link
        key={item.to}
        to={item.to}
        ref={refItem(i)}
        onClick={e => {
          triggerHaptic('selection')
          if (!pedirSaida(() => navegar(item.to))) e.preventDefault()
        }}
        aria-current={ativo ? 'page' : undefined}
        className="relative z-1 flex flex-1 flex-col items-center justify-center gap-1.5 min-h-11 rounded-[22px]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
      >
        <item.Icone
          size={19}
          strokeWidth={2}
          className={ativo ? 'text-csc-tinta' : 'text-white/82'}
          style={{
            transform: ativo ? 'translateY(8px)' : 'translateY(0)',
            transition: ativo
              ? 'transform .42s cubic-bezier(.34,1.5,.56,1) .3s, color .3s ease .3s'
              : 'transform .34s ease, color .3s ease',
          }}
        />
        {/*
          O rótulo inativo é `/82` com opacidade cheia, e não `/62` com
          `opacity-90`: a opacidade multiplicava o alfa e punha o texto em
          3,65:1 — o pior contraste da app. Um alfa só, para se ver o que se
          está a pedir.
        */}
        <span
          className={`font-display text-[9px] transition-[color,opacity] duration-400 ${
            ativo ? 'font-extrabold text-csc-tinta opacity-0' : 'font-semibold text-white/82 opacity-100'
          }`}
        >
          {item.etiqueta}
        </span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed z-40 flex items-center px-1.5 py-2.5 rounded-[26px] vidro-barra sombra-barra"
      style={{
        // Ancorada à coluna da app (max-w do `#root`), não ao ecrã todo: num
        // monitor largo a barra tem de ficar por baixo do conteúdo, não a
        // atravessar o desktop de lado a lado.
        left: 'max(20px, calc(50vw - 240px + 20px))',
        right: 'max(20px, calc(50vw - 240px + 20px))',
        bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div ref={refFila} className="relative flex flex-1 items-center">
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 rounded-[22px] bg-csc-gold z-0"
          style={{ boxShadow: '0 6px 16px -6px rgba(227,192,77,.45)', ...estiloRealce }}
        />

        {itens.map((item, i) => (
          <React.Fragment key={item.to}>
            {i === meio && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium')
                  // O [+] leva a criar um evento noutra rota: também pergunta.
                  pedirSaida(() => aoCriar?.())
                }}
                aria-label="Criar"
                className="relative z-1 flex-none w-12 h-12 mx-1 rounded-full bg-csc-gold text-csc-tinta
                  flex items-center justify-center cursor-pointer sombra-fab transition-transform duration-150 active:scale-97
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
              >
                <Plus size={22} strokeWidth={2.5} />
              </button>
            )}
            {renderItem(item, i)}
          </React.Fragment>
        ))}
      </div>
    </nav>
  )
}

export default BarraNavegacao
