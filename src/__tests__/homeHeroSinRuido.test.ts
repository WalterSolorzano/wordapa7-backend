/**
 * El texto que se repetía está fuera.
 *
 * El usuario: "estas cosas se repite demasiado". Y la lista era exacta —"Portada,
 * cuerpo y referencias / Corrección sin tocar tu contenido / Citas, DOI y
 * referencias cruzadas / Norma APA 7ma Edición / · Motor editorial local /
 * Perfil:"— y en el código aparecían en dos lugares: los tres pilares en el
 * hero (`HomeHero.tsx`) y la franja de arriba de Inicio (`Step0QuickStart.tsx`).
 *
 * POR QUÉ SE VAN, Y POR QUÉ NO SE VA EL SELECTOR DE PERFILES.
 *
 * Los tres pilares describen lo que la app ya deja ver en cinco pantallas. En el
 * hero —que es la única línea de aire de la pantalla— ocupan el lugar de una
 * escena y se leen como publicidad. No aportan lo que la persona no puede ver
 * todavía, y ese es el criterio: un texto que anuncia la app es ruido en una
 * pantalla cuya función es que la persona empiece a trabajar.
 *
 * El rótulo "Perfil:" sí se va, y el `<select>` NO. El select ya muestra el
 * nombre del perfil elegido; el rótulo agrega una capa de texto que dice lo
 * obvio. Quitar el control, en cambio, es quitar capacidad: es la única forma de
 * cambiar de perfil sin entrar a Ajustes.
 *
 * Estas pruebas leen los archivos porque verifican una decisión sobre QUÉ TEXTO
 * EXISTE, que no es observable desde el DOM salvo por una captura de pantalla.
 */

import { describe, it, expect } from 'vitest';
/* `?raw` y no `node:fs`: el shim de `nodePolyfills()` de `vite.config.ts`
   deja `fs` sin `readFileSync`, así que leer del disco desde un test revienta
   en el import. `?raw` además entrega el texto sin transformar, que es lo que
   estas pruebas miran. */
import heroCrudo from '../components/layout/HomeHero.tsx?raw';
import inicioCrudo from '../components/wizard/Step0QuickStart.tsx?raw';

/**
 * El código SIN comentarios. Un comentario puede —y debe— citar la constante que
 * se borró y decir por qué: es la única forma de que el próximo que lea el
 * archivo entienda que el borrado fue una decisión y no un descuido. Leerlo como
 * si fuera una declaración invierte el sentido, y hace que la prueba falle
 * contra el comentario que explica el arreglo. Es la misma disciplina que
 * `noHardcodedColors.test.ts` aplica con `sinComentarios`, y por qué existe.
 */
const sinComentarios = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const hero = sinComentarios(heroCrudo);
const inicio = sinComentarios(inicioCrudo);

describe('el texto que se repetía está fuera', () => {
  it('no quedan los tres pilares en el hero', () => {
    for (const texto of [
      'Portada, cuerpo y referencias',
      'Corrección sin tocar tu contenido',
      'Citas, DOI y referencias cruzadas',
    ]) {
      expect(hero, `"${texto}" sigue en el hero`).not.toContain(texto);
    }
    expect(hero).not.toContain('PILLARS');
  });

  it('no queda la tabla de colores de etiqueta', () => {
    /* `TAG_COLOR` mapeaba siete etiquetas y su único consumidor era
       `void TAG_COLOR;`: estaba muerto antes de este cambio. Un mapa muerto que
       sobrevive al cambio que lo vuelve más muerto es deuda que se paga sola. */
    expect(hero).not.toContain('TAG_COLOR');
  });

  it('no quedan los rótulos de la franja superior de Inicio', () => {
    expect(inicio).not.toContain('Norma APA 7ma Edición');
    expect(inicio).not.toContain('Motor editorial local');
  });

  it('el rótulo del perfil sí se fue, el control se queda', () => {
    /* La distinción que separa limpiar de quitar capacidad. Si el `<select>`
       desaparece, no hay forma de cambiar de perfil sin ir a Ajustes, y eso es
       una función que la persona usaba. */
    expect(inicio).not.toContain('>Perfil:');
    expect(inicio).toContain('apa-profile-select');
  });

  it('el hero sigue teniendo su frase: no lo dejamos mudo', () => {
    /* Sacar los pilares no es dejar el hero vacío. La frase rotativa es lo que
       hace que la pantalla sea un lugar, y se queda. */
    expect(hero).toContain('phrase.text');
  });
});
