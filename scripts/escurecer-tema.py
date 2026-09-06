"""
Passa as classes do tema claro para o escuro, num ficheiro ou vários.

    python scripts/escurecer-tema.py src/pages/FinancePage.tsx

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
padrao = re.compile(r'((?:[a-z-]+:)*)(' + '|'.join(map(re.escape, sorted(MAPA, key=len, reverse=True))) + r')\b')

for p in sys.argv[1:]:
    s = io.open(p, encoding='utf-8').read()
    antes = s
    # `placeholder:text-gray-400` tem de ser tratado antes do genérico.
    s = s.replace('placeholder:text-gray-400', 'placeholder:text-black/40')
    s = padrao.sub(lambda m: m.group(1) + MAPA[m.group(2)], s)
    if s != antes:
        io.open(p, 'w', encoding='utf-8', newline='').write(s)
    restantes = re.findall(r'className="[^"]*\bbg-white[" ][^"]*"', s)
    print('%-46s %s  bg-white opacos: %d' % (p, 'alterado' if s != antes else 'sem mudanças', len(restantes)))
