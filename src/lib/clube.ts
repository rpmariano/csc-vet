/**
 * O nome do clube, para quando a base ainda não respondeu.
 *
 * A fonte de verdade é a linha 1 de `club_settings`, que o `ClubContext`
 * carrega. Isto é só o que se mostra enquanto ela não chega — mas andava
 * escrito à mão em seis sítios, e com três nomes diferentes: "Cascais Sport
 * Clube" (que é outro clube), "GD Sport Cascais — Veteranos" e "Veteranos
 * F.C.". Quem lesse a app via um nome diferente conforme o ecrã.
 *
 * Os valores são os que estão na base.
 */

/** Nome por extenso, como aparece nos documentos do clube. */
export const CLUBE_NOME = 'Grupo Dramático e Sportivo de Cascais'

/** Nome curto, para cabeçalhos, placares e sítios apertados. */
export const CLUBE_SIGLA = 'GDS Cascais'
