# Mockups de redesenho

Proposta visual para a Home (telemóvel e desktop) e para a linguagem de
componentes da app. Desenhada a partir dos valores reais do código —
tokens de `src/index.css` e o markup de `src/pages/Home.tsx`.

| Ficheiro | Artboard |
|---|---|
| `Atual.dc.html` | Home de telemóvel como está hoje, reproduzida fielmente |
| `Main.dc.html` | Home de telemóvel proposta |
| `Desktop.dc.html` | Home de desktop proposta |
| `Linguagem.dc.html` | Escala tipográfica, níveis de peso, chips de estado |
| `canvas.json` | Disposição das pranchas e notas |

O `.html` publicado é gerado a partir destes ficheiros e por isso não é
versionado (2,5 MB de editor embutido). Para regenerar e voltar a publicar,
peçam ao Claude — a branch já tem o contexto todo no `CLAUDE.md`.

## Decisões que estas pranchas propõem

1. **Um só elemento de nível 1 por ecrã.** Hoje a Home tem três a competir.
2. **Listas em vez de carrosséis.** Três carrosséis passam a zero.
3. **RSVP num só sítio**, dentro do cartão do próximo compromisso.
4. **Piso de 13px** no corpo de texto (hoje há 9px com `font-black`).
5. **Chips de estado sem emoji** — ponto colorido e forma única. Esta ainda
   está por decidir: os emoji são hoje parte do carácter da app.
