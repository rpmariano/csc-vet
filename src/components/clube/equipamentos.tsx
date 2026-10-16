import React from 'react'
import { Shirt } from 'lucide-react'

/**
 * Cores dos equipamentos das equipas adversárias.
 *
 * Cada equipa pode ter cores definidas para:
 * - Camisola principal (usada em casa)
 * - Camisola alternativa (usada fora)
 * Para cada equipamento podem ser indicadas até duas cores.
 */

export const CORES_EQUIPAMENTO_SUGERIDAS = [
  'Branco',
  'Preto',
  'Vermelho',
  'Azul',
  'Azul Celeste',
  'Azul Escuro',
  'Amarelo',
  'Verde',
  'Verde Lima',
  'Laranja',
  'Cinzento',
  'Cinza',
  'Roxo',
  'Rosa',
  'Dourado',
  'Bordeaux',
] as const

const MAPA_CORES: Record<string, string> = {
  branco: '#FFFFFF',
  branca: '#FFFFFF',
  preto: '#18181B',
  preta: '#18181B',
  vermelho: '#DC2626',
  vermelha: '#DC2626',
  encarnado: '#DC2626',
  encarnada: '#DC2626',
  azul: '#2563EB',
  'azul celeste': '#38BDF8',
  celeste: '#38BDF8',
  'azul claro': '#60A5FA',
  'azul escuro': '#1E3A8A',
  'azul marinho': '#1E3A8A',
  marinho: '#1E3A8A',
  amarelo: '#EAB308',
  amarela: '#EAB308',
  verde: '#16A34A',
  'verde escuro': '#15803D',
  'verde lima': '#84CC16',
  'verde fluorescente': '#84CC16',
  lima: '#84CC16',
  laranja: '#EA580C',
  cinzento: '#9CA3AF',
  cinzenta: '#9CA3AF',
  cinza: '#9CA3AF',
  'cinzento escuro': '#4B5563',
  'cinza escuro': '#4B5563',
  'cinzento claro': '#D1D5DB',
  'cinza claro': '#D1D5DB',
  roxo: '#7C3AED',
  roxa: '#7C3AED',
  violeta: '#8B5CF6',
  rosa: '#EC4899',
  'cor de rosa': '#EC4899',
  'cor-de-rosa': '#EC4899',
  dourado: '#CA8A04',
  dourada: '#CA8A04',
  ouro: '#EAB308',
  bordeaux: '#881337',
  bordeau: '#881337',
  grena: '#881337',
  grená: '#881337',
  vinho: '#881337',
  castanho: '#78350F',
  castanha: '#78350F',
  prateado: '#CBD5E1',
  prateada: '#CBD5E1',
  prata: '#CBD5E1',
}

/** Devolve o código HEX para uma cor em português, ou null se não reconhecido. */
export function obterHexDaCor(nome?: string | null): string | null {
  if (!nome) return null
  const normalizado = nome.trim().toLowerCase()
  if (normalizado.startsWith('#')) return normalizado
  return MAPA_CORES[normalizado] ?? null
}

/** Formata as cores para leitura (ex: "Vermelho / Branco", "Azul Celeste", "—"). */
export function formatarCoresEquipamento(
  cor1?: string | null,
  cor2?: string | null,
  textoVazio = '—',
): string {
  const c1 = cor1?.trim() || null
  const c2 = cor2?.trim() || null

  if (!c1 && !c2) return textoVazio
  if (c1 && (c1.toUpperCase() === 'X' || c1.toLowerCase() === 'sem')) return textoVazio

  if (c1 && c2 && c2.toUpperCase() !== 'X') {
    return `${c1} / ${c2}`
  }
  return c1 || c2 || textoVazio
}

/**
 * Se o utilizador colar ou escrever "Vermelho/Branco" ou "Vermelho / Branco",
 * divide automaticamente na cor 1 e cor 2.
 */
export function separarCoresDigitadas(valor: string): { cor1: string; cor2: string } | null {
  if (valor.includes('/')) {
    const partes = valor.split('/').map(p => p.trim())
    return { cor1: partes[0] || '', cor2: partes[1] || '' }
  }
  return null
}

interface BadgeCoresEquipamentoProps {
  cor1?: string | null
  cor2?: string | null
  tamanho?: 'pequeno' | 'medio' | 'grande'
  className?: string
}

/**
 * Badge visual de cores de equipamento (círculo dividido com as duas cores).
 */
export const BadgeCoresEquipamento: React.FC<BadgeCoresEquipamentoProps> = ({
  cor1,
  cor2,
  tamanho = 'medio',
  className = '',
}) => {
  const hex1 = obterHexDaCor(cor1)
  const hex2 = obterHexDaCor(cor2)

  const dimensoes = {
    pequeno: 'w-3.5 h-3.5',
    medio: 'w-5 h-5',
    grande: 'w-7 h-7',
  }[tamanho]

  const textoAcessivel = formatarCoresEquipamento(cor1, cor2, 'Sem equipamento definido')

  // Sem cores definidas ou valor "X"
  if ((!cor1 && !cor2) || cor1?.trim().toUpperCase() === 'X') {
    return (
      <span
        title={textoAcessivel}
        aria-label={textoAcessivel}
        className={`${dimensoes} rounded-full border border-dashed border-white/25 flex items-center justify-center bg-white/5 shrink-0 ${className}`}
      >
        <span className="text-[9px] text-white/35 font-bold leading-none select-none">—</span>
      </span>
    )
  }

  // Se ambas as cores tiverem código HEX reconhecido
  if (hex1 && hex2) {
    return (
      <span
        title={textoAcessivel}
        aria-label={textoAcessivel}
        className={`${dimensoes} rounded-full overflow-hidden border border-white/30 shadow-sm flex shrink-0 ${className}`}
      >
        <span className="w-1/2 h-full inline-block" style={{ backgroundColor: hex1 }} />
        <span className="w-1/2 h-full inline-block" style={{ backgroundColor: hex2 }} />
      </span>
    )
  }

  // Se apenas uma tiver HEX (ou uma foi indicada)
  const hexUnico = hex1 || hex2
  if (hexUnico && (!cor2 || !hex2)) {
    return (
      <span
        title={textoAcessivel}
        aria-label={textoAcessivel}
        className={`${dimensoes} rounded-full border border-white/30 shadow-sm shrink-0 inline-block ${className}`}
        style={{ backgroundColor: hexUnico }}
      />
    )
  }

  // Caso seja um nome personalizado sem hex conhecido
  return (
    <span
      title={textoAcessivel}
      aria-label={textoAcessivel}
      className={`${dimensoes} rounded-full bg-white/15 border border-white/30 flex items-center justify-center shrink-0 ${className}`}
    >
      <Shirt size={tamanho === 'pequeno' ? 8 : tamanho === 'medio' ? 11 : 14} className="text-white/80" />
    </span>
  )
}
