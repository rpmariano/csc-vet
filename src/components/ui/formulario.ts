/**
 * O campo de formulário da app, e o rótulo por cima dele.
 *
 * Estavam copiados como constante local em treze ficheiros (`CAMPO`,
 * `CAMPO_FORM`, `CAMPO_DIALOGO`) e o rótulo em dez, e já tinham divergido:
 * o Perfil e os Comunicados usavam um campo de 44px com texto a 12px e um
 * rótulo de outro peso, as Estatísticas perdiam o estilo do placeholder. Uma
 * mudança ao campo era treze mudanças — e a décima quarta cópia nascia de
 * uma das treze, qualquer que fosse. (Auditoria de design, vaga 4.)
 *
 * São classes e não componentes porque os campos são `<input>`, `<select>` e
 * `<textarea>` com tudo o que cada um traz; quem precisa de mais altura ou de
 * espaço para um ícone acrescenta (`${CLASSE_CAMPO} pl-9.5`).
 */

/** Campo branco com tinta escura, 46px, cantos de 14px. */
export const CLASSE_CAMPO =
  'w-full h-[46px] px-3.5 rounded-[14px] bg-white text-csc-tinta font-display font-bold text-[12.5px] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-csc-gold placeholder:font-normal placeholder:text-black/40 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

/** O rótulo por cima de um campo — e o de cada grupo numa persiana de filtros. */
export const CLASSE_ETIQUETA_CAMPO =
  'block font-display font-extrabold text-[9px] tracking-[0.14em] uppercase text-white/62 mb-1.5'
