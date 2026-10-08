/**
 * F1 · Task 3 — un estado vacío que sobreviva a que el layout se esconda.
 *
 * El defecto: el mensaje de "sin hallazgos" vivía dentro del `<aside>` del rack,
 * que solo se renderiza con `rackVisible`. Con la ventana bajo 1180 px el rack no
 * existe, y con el no existía el mensaje — pantalla vacía sin explicación. Un
 * estado vacío que depende de que un panel esté abierto no es un estado vacío.
 *
 * Estas pruebas fijan las dos cosas que hacen que sirva: que cada motivo diga su
 * CAUSA y no un texto genérico, y que el de `sin-resultados` nombre el filtro que
 * dejó la pantalla vacía, que es lo único que el usuario puede tocar para
 * arreglarlo.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EstadoVacio, type MotivoVacio } from '../components/shared/EstadoVacio';

const MOTIVOS: MotivoVacio[] = [
  'sin-documento', 'sin-motor', 'sin-resultados', 'sin-seleccion',
  'corriendo', 'sugerencias-apagadas',
];

describe('EstadoVacio', () => {
  it('cada motivo dice algo distinto, y ninguno es un texto generico', () => {
    const vistos = new Set<string>();
    for (const motivo of MOTIVOS) {
      const { unmount } = render(<EstadoVacio motivo={motivo} />);
      const texto = (screen.getByTestId('estado-vacio').textContent ?? '').trim();
      expect(texto.length, `motivo ${motivo} sin texto`).toBeGreaterThan(20);
      vistos.add(texto);
      unmount();
    }
    /* Cuatro motivos, cuatro textos. Un estado vacío con un solo texto para
       cuatro causas es un texto que no sabe por qué está la pantalla vacía. */
    expect(vistos.size).toBe(MOTIVOS.length);
  });

  it('el motivo de sin-documento dice que abra un documento, no que revise', () => {
    render(<EstadoVacio motivo="sin-documento" />);
    expect(screen.getByTestId('estado-vacio').textContent).toMatch(/documento/i);
  });

  it('el motivo de sin-resultados NOMBRA el filtro, que es lo que se puede tocar', () => {
    /* "No hay resultados" a secas no dice qué hacer. El filtro activo es la
       única palanca que el usuario tiene en la mano en ese momento, así que el
       texto tiene que nombrarla o el estado vacío no informa: entretiene. */
    const texto = renderYTexto(<EstadoVacio motivo="sin-resultados" filtroActivo="Ortografia" />);
    expect(texto).toMatch(/ortograf/i);
    expect(texto).toMatch(/filtro/i);
  });

  it('sin filtro activo, sin-resultados igual dice cuál quitar', () => {
    /* No se puede nombrar un filtro que no esta. Lo que si se puede es decir de
       donde sale el recorte, y eso es lo que hace. */
    const texto = renderYTexto(<EstadoVacio motivo="sin-resultados" />);
    expect(texto.length).toBeGreaterThan(20);
    expect(texto).toMatch(/filtro/i);
  });

  it('el motivo de sin-seleccion dice la ACCION, no la posición de un panel', () => {
    /* El rack está a la derecha en ventana ancha, pero en angosta no hay rack.
       Un texto que nombra una posición que puede no existir es un texto que
       miente, y por eso este caso no dice "panel de la derecha". */
    const texto = renderYTexto(<EstadoVacio motivo="sin-seleccion" />);
    expect(texto).not.toMatch(/panel de la derecha/i);
    expect(texto).toMatch(/siguiente hallazgo/i);
  });

  it('la acción opcional se monta cuando viene, y no estorba cuando no', () => {
    /* La etiqueta del botón es un dato del que llama, no del componente: por eso
       el test usa una que no aparece en ningun texto, para poder afirmar que lo
       que falta es el BOTON y no la palabra. */
    const conAccion = renderYTexto(
      <EstadoVacio motivo="sin-motor" accion={<button type="button">Correr la revision</button>} />,
    );
    expect(conAccion).toContain('Correr la revision');

    cleanup();
    const sinAccion = renderYTexto(<EstadoVacio motivo="sin-motor" />);
    expect(sinAccion).not.toContain('Correr la revision');
  });
});

/* Las dos mentiras que este componente terminó contando, y que no se arreglan
   escribiendo un texto más lindo: se arreglan no mintiendo. Los globos se
   disparan solos al abrir un documento, así que "todavía no corrió ningún
   motor" era falso mientras tres motores corrían; y el interruptor de
   sugerencias proactivas descarta el resultado en silencio, así que la pantalla
   vacía no tenía causa. */
describe('EstadoVacio: los dos motivos que corrigen las dos mentiras', () => {
  it('"corriendo" NO dice que no corrió nada, y dice que es automático', () => {
    const texto = renderYTexto(
      <EstadoVacio motivo="corriendo" motoresCorriendo={['citas y estilo']} />,
    );
    expect(texto).not.toMatch(/Todavia no corrio ningun motor/i);
    expect(texto).not.toMatch(/Pulsa "Escanear"/);
    /* Dice que se dispara solo: si no lo dice, el usuario espera un botón que
       ya apretó, y el "Escanear" de la tira le parece la única forma de
       empezarlo. */
    expect(texto).toMatch(/solos al abrir el documento/i);
  });

  it('"corriendo" NOMBRA lo que corre', () => {
    /* Un "cargando" sin decir qué carga no le dice a nadie cuándo termina. Y lo
       nombra en prosa —con "y"— porque "a, b, c" se lee como un campo de texto
       y no como una lista de motores que andan. */
    const texto = renderYTexto(
      <EstadoVacio
        motivo="corriendo"
        motoresCorriendo={['citas y estilo', 'revisión de estilo con IA']}
      />,
    );
    expect(texto).toMatch(/citas y estilo/);
    expect(texto).toMatch(/revisión de estilo con IA/);
    expect(texto).toMatch(/ y /);
  });

  it('sin lista de motores, "corriendo" no inventa uno', () => {
    /* El dato puede no llegar: la lista es opcional y este texto se arma con
       ella. Un texto que se arma con un valor ausente necesita la rama del
       valor ausente, y esa rama no puede ser la que nombra un motor que no
       existe. */
    const texto = renderYTexto(<EstadoVacio motivo="corriendo" />);
    expect(texto.length).toBeGreaterThan(20);
    expect(texto).not.toMatch(/Ahora mismo:/);
  });

  it('"sugerencias-apagadas" Nombra el interruptor y DÓNDE encenderlo', () => {
    /* Un interruptor que descarta el resultado en silencio es un interruptor
       mudo, y la pantalla vacía sin causa entretiene en vez de informar. Lo que
       se nombra no es solo el interruptor: es el LUGAR, porque "las
       sugerencias están apagadas" sin "¿dónde?" deja al usuario igual que
       estaba. */
    const texto = renderYTexto(<EstadoVacio motivo="sugerencias-apagadas" />);
    expect(texto).toMatch(/Sugerencias proactivas/);
    expect(texto).toMatch(/Ajustes/);
  });

  it('"sugerencias-apagadas" NO dice que no corrió ningún motor: los globos SÍ corrieron', () => {
    /* Esta es la diferencia con el motivo de al lado, y es la que hace que el
       texto sea útil: apagado lo que se apaga es la SALIDA de lo que
       encontraron, no los motores. Decir lo otro manda al usuario a apretar
       "Escanear" un documento que ya se escaneó. */
    const texto = renderYTexto(<EstadoVacio motivo="sugerencias-apagadas" />);
    expect(texto).not.toMatch(/Todavia no corrio ningun motor/i);
  });
});

/** El texto del estado vacío, sin repetir el `getByTestId` en cada prueba. */
function renderYTexto(node: React.ReactElement): string {
  render(node);
  return (screen.getByTestId('estado-vacio').textContent ?? '').trim();
}
