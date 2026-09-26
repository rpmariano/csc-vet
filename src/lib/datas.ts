/**
 * Uma data sem hora (`AAAA-MM-DD`) em 'DD/MM/AAAA', sem passar por `new Date()`.
 *
 * `new Date('2026-10-15')` é a meia-noite **UTC** — a oeste de Greenwich,
 * nos Açores no inverno, é ainda dia 14 às onze da noite, e o
 * `toLocaleDateString` escreve 14/10. Era como se escreviam os prazos, as
 * datas de pagamento, a janela de quota e o nascimento em cinco ecrãs; o
 * `fmtData` já existia no Financeiro e era usado duas vezes. (Auditoria de
 * design, vaga 5.) Para um instante com hora — `published_at`, `date_time`
 * — continua a ser o `toLocaleDateString`, que é o certo.
 */
export const fmtData = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
