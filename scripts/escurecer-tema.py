"""
Passa as classes do tema claro para o escuro, num ficheiro ou vários.

    python scripts/escurecer-tema.py src/pages/FinancePage.tsx
    python scripts/escurecer-tema.py --estados src/pages/FinancePage.tsx

O redesenho de 2026 inverteu o tema, e as páginas por redesenhar têm centenas
de `text-gray-700`, `bg-gray-50` e `border-gray-300` espalhados. Traduzi-los à
mão é onde se erra: escapa sempre um, e um cinzento claro sobre fundo preto
não se lê.

Isto trata o mecânico — o mapa abaixo, com os prefixos de variante (`hover:`,
`focus:`, `peer-checked:`…) incluídos — e **não** trata o que exige
julgamento: os `bg-white` opacos, que tanto podem ser um painel de diálogo
(passa a `bg-csc-fundo`) como o fundo de um emblema (fica branco). No fim
imprime quantos sobraram em cada ficheiro, para se olhar um a um.

Não substitui o redesenho do ecrã: é o primeiro passo, que tira do caminho o
que não tem decisão nenhuma.
"""

import io, re, sys

MAPA = {
  'text-gray-900':'text-white', 'text-gray-800':'text-white', 'text-gray-700':'text-white/80',
  'text-gray-600':'text-white/60', 'text-gray-500':'text-white/50', 'text-gray-400':'text-white/40',
  'text-gray-300':'text-white/30', 'text-gray-200':'text-white/20', 'text-gray-100':'text-white',
  'bg-gray-50':'bg-white/6', 'bg-gray-100':'bg-white/10', 'bg-gray-200':'bg-white/15',
  'bg-gray-300':'bg-white/20', 'bg-gray-800':'bg-white/10', 'bg-gray-900':'bg-csc-fundo',
  'border-gray-100':'border-white/10', 'border-gray-200':'border-white/12',
  'border-gray-300':'border-white/15', 'border-gray-400':'border-white/20',
  'divide-gray-100':'divide-white/8', 'divide-gray-200':'divide-white/12',
  'placeholder:text-gray-400':'placeholder:text-black/40',
}

# As cores de estado do tema claro — os `bg-emerald-100`, `text-amber-900`,
# `border-blue-200` — não são cinzento e por isso escapavam ao mapa de cima.
# Sobre fundo preto ficam a brilhar: uma pastilha verde-menta com texto
# verde-escuro é o que se via em cada ecrã por redesenhar. Passam para o token
# do clube na variante translúcida, que é como o handoff as desenha.
#
# Ficam de fora, de propósito, os tons a partir de 400 usados como cor de
# ícone sobre fundo escuro (o `text-red-500` de um alfinete de mapa, por
# exemplo): esses já se leem, e trocá-los era decidir o que não tem decisão
# feita.
ESTADOS = {
  # verde — presente, pago, apto
  'bg-emerald-50':'bg-csc-light/10', 'bg-emerald-100':'bg-csc-light/15',
  'bg-emerald-200':'bg-csc-light/25', 'bg-green-50':'bg-csc-light/10',
  'bg-green-100':'bg-csc-light/15', 'bg-green-200':'bg-csc-light/25',
  'text-green-700':'text-csc-verde-texto', 'text-green-800':'text-csc-verde-texto',
  'text-green-900':'text-csc-verde-texto', 'text-green-950':'text-csc-verde-texto',
  'text-emerald-950':'text-csc-verde-texto',
  'border-green-200':'border-csc-light/25', 'border-green-300':'border-csc-light/35',
  'text-emerald-600':'text-csc-light', 'text-emerald-700':'text-csc-verde-texto',
  'text-emerald-800':'text-csc-verde-texto', 'text-emerald-900':'text-csc-verde-texto',
  'border-emerald-200':'border-csc-light/25', 'border-emerald-300':'border-csc-light/35',
  # dourado — atenção, rascunho, golo
  'bg-amber-50':'bg-csc-gold/10', 'bg-amber-100':'bg-csc-gold/15',
  'bg-amber-200':'bg-csc-gold/25',
  'bg-yellow-50':'bg-csc-gold/10', 'bg-yellow-100':'bg-csc-gold/15',
  'text-amber-500':'text-csc-gold', 'text-amber-600':'text-csc-gold',
  'text-amber-700':'text-csc-gold', 'text-amber-800':'text-csc-gold',
  'text-amber-900':'text-csc-gold', 'text-amber-950':'text-csc-gold',
  'text-yellow-800':'text-csc-gold', 'text-yellow-900':'text-csc-gold',
  'text-yellow-950':'text-csc-gold',
  'border-amber-200':'border-csc-gold/25', 'border-amber-300':'border-csc-gold/35',
  'border-yellow-300':'border-csc-gold/35', 'border-yellow-500':'border-csc-gold/50',
  # azul — assistência, informação
  'bg-blue-50':'bg-csc-blue/12', 'bg-blue-100':'bg-csc-blue/20',
  'bg-blue-200':'bg-csc-blue/30', 'text-blue-950':'text-csc-azul-texto',
  'bg-indigo-50':'bg-csc-blue/12', 'bg-indigo-100':'bg-csc-blue/20',
  'text-blue-600':'text-csc-azul-texto', 'text-blue-700':'text-csc-azul-texto',
  'text-blue-800':'text-csc-azul-texto', 'text-blue-900':'text-csc-azul-texto',
  'text-indigo-600':'text-csc-azul-texto', 'text-indigo-700':'text-csc-azul-texto',
  'text-indigo-800':'text-csc-azul-texto', 'text-indigo-900':'text-csc-azul-texto',
  'border-blue-200':'border-csc-blue/30', 'border-blue-300':'border-csc-blue/40',
  'border-indigo-200':'border-csc-blue/30', 'border-indigo-300':'border-csc-blue/40',
  # vermelho — falta, recusa, dívida
  'bg-red-50':'bg-csc-red/10', 'bg-red-100':'bg-csc-red/15',
  'bg-red-200':'bg-csc-red/25', 'text-red-950':'text-csc-vermelho-texto',
  'text-red-600':'text-csc-vermelho-texto', 'text-red-700':'text-csc-vermelho-texto',
  'text-red-800':'text-csc-vermelho-texto', 'text-red-900':'text-csc-vermelho-texto',
  'border-red-200':'border-csc-red/25', 'border-red-300':'border-csc-red/35',
  # o roxo não existe no manual do clube: cai no azul
  'bg-purple-50':'bg-csc-blue/12', 'bg-purple-100':'bg-csc-blue/20',
  'text-purple-700':'text-csc-azul-texto', 'text-purple-800':'text-csc-azul-texto',
  'text-purple-900':'text-csc-azul-texto',
  'border-purple-200':'border-csc-blue/30', 'border-purple-300':'border-csc-blue/40',
}

# `--estados` é opção e não omissão: dentro de um `<option>`, que o sistema
# operativo desenha sempre claro, a pastilha clara é o que está certo.
COM_ESTADOS = '--estados' in sys.argv
ALVOS = [a for a in sys.argv[1:] if not a.startswith('--')]

TODOS = dict(MAPA, **ESTADOS) if COM_ESTADOS else MAPA
# O `(/\d+)?` no fim engole o sufixo de opacidade da classe de origem e
# deita-o fora: o token de destino já traz a sua. `bg-amber-50/80` passa a
# `bg-csc-gold/10`, e não a `bg-csc-gold/10/80`, que não é classe nenhuma —
# sem isto o `\b` casava entre o `0` e a barra e deixava o resto pendurado, o
# Tailwind não gerava nada, e o elemento ficava sem fundo sem se dar por isso.
padrao = re.compile(
    r'((?:[a-z-]+:)*)('
    + '|'.join(map(re.escape, sorted(TODOS, key=len, reverse=True)))
    + r')(/\d+)?\b'
)

for p in ALVOS:
    s = io.open(p, encoding='utf-8').read()
    antes = s
    # `placeholder:text-gray-400` tem de ser tratado antes do genérico.
    s = s.replace('placeholder:text-gray-400', 'placeholder:text-black/40')
    s = padrao.sub(lambda m: m.group(1) + TODOS[m.group(2)], s)
    if s != antes:
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
    restantes = re.findall(r'className="[^"]*\bbg-white[" ][^"]*"', s)
    print('%-46s %s  bg-white opacos: %d' % (p, 'alterado' if s != antes else 'sem mudanças', len(restantes)))
