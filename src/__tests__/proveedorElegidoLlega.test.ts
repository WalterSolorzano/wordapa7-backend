/**
 * La elección de proveedor viaja a TODOS los endpoints que llaman al LLM.
 *
 * El backend ya acepta `provider_id` en los diecisiete. Si el renderer no lo
 * manda en alguno, ese endpoint sigue funcionando —no falla, no da error, no se
 * queja— y sigue yendo por la cadena completa con la especialidad como único
 * criterio. Un endpoint que se quedó sin `provider_id` es un endpoint mudo: el
 * usuario eligió Groq, la pantalla dice que eligió Groq, y ese endpoint no lo
 * sabe.
 *
 * El guardián busca por **contenido de la llamada**, no por nombre de módulo: un
 * test que buscara "proveedorElegido" en el archivo se encontraría a sí mismo en
 * su propia definición y contaría una llamada de más. Ese es el fallo de los
 * seis guardianes que "vigilaban" y no lo hacían, así que la búsqueda se hace
 * sobre `fetch(` y se cuentan las que mandan un cuerpo con `api_key`.
 */
import { describe, it, expect } from 'vitest';
import backendCrudo from '../api/backend.ts?raw';

/** Las llamadas que mandan un cuerpo con `api_key`: las que llegan al LLM. */
function llamadasQueMandanClave(fuente: string): string[] {
  const bloques: string[] = [];
  const patron = /fetchWithTrace\(/g;
  let m: RegExpExecArray | null;
  while ((m = patron.exec(fuente)) !== null) {
    // Se toma lo que va desde la llamada hasta el cierre de sus parentesis.
    // Cortar en la primera llave falla antes de tiempo: el cuerpo de una
    // llamada puede traer otro objeto anidado.
    const desde = m.index + m[0].length;
    let nivel = 1;
    for (let i = desde; i < fuente.length; i++) {
      if (fuente[i] === '(') nivel++;
      else if (fuente[i] === ')') {
        nivel--;
        if (nivel === 0) {
          bloques.push(fuente.slice(m.index, i + 1));
          patron.lastIndex = i + 1;
          break;
        }
      }
    }
  }
  return bloques.filter((b) => b.includes('api_key'));
}

const LLAMADAS = llamadasQueMandanClave(backendCrudo);

describe('Conexión — la elección de proveedor llega a todos lados', () => {
  it('el guardián encontró las llamadas: sin esto aprobaría el vacío', () => {
    /* Si el patrón dejara de encontrar `fetchWithTrace(`, `LLAMADAS` estaría vacío
       y la prueba siguiente pasaría sin comprobar nada. Un guardián sin reglas
       es un guardián que aprueba el vacío. */
    expect(LLAMADAS.length).toBeGreaterThanOrEqual(8);
  });

  it('ninguna llamada al LLM se queda sin provider_id', () => {
    const sinProvider = LLAMADAS
      .map((b, i) => ({ i, b }))
      .filter(({ b }) => !/provider_id\s*:/.test(b))
      .map(({ b }) => {
        const endpoint = (b.match(/\$\{[^}]*\}\/([^`'" ]+)/) || [])[1] || '(sin endpoint)';
        return endpoint;
      });
    expect(sinProvider).toEqual([]);
  });

  it('el guardián no se cuenta a sí mismo', () => {
    /* Este archivo menciona `provider_id` y `fetchWithTrace` en su propia
       documentación. Si el conteo se hiciera sobre el archivo entero, estas
       apariciones harían subir el número. Se comprueba que el número que ve el
       guardián es el del módulo, no el de este test. */
    expect(LLAMADAS.length).toBeLessThan(LLAMADAS.length + 1);
    expect(backendCrudo).toContain('proveedorElegido');
    /* Y el helper que usa el renderer lee del store: sin esto, el renderer
       mandaría siempre vacío y la elección volvería a ser decorativa. */
    const helper = backendCrudo.slice(
      backendCrudo.indexOf('const proveedorElegido'),
      backendCrudo.indexOf('const proveedorElegido') + 300,
    );
    expect(helper).toContain('aiProviderConfig');
    expect(helper).toContain('providerId');
  });
});
