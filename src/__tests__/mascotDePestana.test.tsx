/**
 * La cara de la mascota de cada pestaña sale del ESTADO, no del decorado, y del
 * estado DE ESA PESTAÑA.
 *
 * La regla que más importa es la primera: sin ninguna clave de proveedor la
 * pestaña Conexión tiene que decirlo, y no mostrar trece campos mudos. Eso es
 * un caso de `Review Focus` del plan, y por eso la expresión se prueba con los
 * cuatro estados en vez de contra la captura.
 *
 * Y la segunda mitad del archivo es la que impide la regresión que la Fase 6
 * vino a matar: que las reglas vuelvan a estar en cuatro pestañas a la vez. Acá
 * hay una prueba POR PESTAÑA, y cada una pasa el estado que esa pestaña
 * realmente lee. Si mañana alguien mete `clavesDeProveedor` en la cara de la
 * pestaña Formato, estas pruebas lo dicen.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PESTANAS, pestanaPorId } from '../components/settings/tabs';
import {
  expresionDePestana,
  expresionDeApp,
  expresionDeDocumento,
  expresionDeFormato,
  kindDePestana,
  KIND_SIN_DIBUJO,
  type EstadoDePestana,
} from '../components/settings/mascotDePestana';
import { EditorialMascot, type MascotKind } from '../components/layout/EditorialMascot';

const conexion = pestanaPorId('conexion');

const ESTADOS: Record<string, EstadoDePestana> = {
  sinClaves: { clavesDeProveedor: 0, proveedorElegido: false, hallazgosResueltos: 0 },
  clavesSinElegir: { clavesDeProveedor: 2, proveedorElegido: false, hallazgosResueltos: 0 },
  todoAnda: { clavesDeProveedor: 1, proveedorElegido: true, hallazgosResueltos: 0 },
  todoAndaConHallazgos: { clavesDeProveedor: 1, proveedorElegido: true, hallazgosResueltos: 3 },
};

describe('mascotDePestana — la expresión sale del estado', () => {
  it('SIN NINGUNA clave de proveedor la mascota está preocupada', () => {
    expect(expresionDePestana(conexion, ESTADOS.sinClaves)).toBe('worried');
  });

  it('hay claves pero ninguna elegida: curiosa, no preocupada', () => {
    expect(expresionDePestana(conexion, ESTADOS.clavesSinElegir)).toBe('curious');
  });

  it('todo anda y hay al menos un hallazgo: feliz', () => {
    expect(expresionDePestana(conexion, ESTADOS.todoAndaConHallazgos)).toBe('happy');
  });

  it('todo anda pero sin hallazgos: neutral', () => {
    expect(expresionDePestana(conexion, ESTADOS.todoAnda)).toBe('neutral');
  });

  it('la ausencia de clave gana sobre cualquier otra cosa', () => {
    /* Si no hay clave, no hay proveedor elegido: sin este orden, la cara
     * dependería de en qué orden se escribieron los `if`. */
    const sinClavesConHallazgos: EstadoDePestana = {
      clavesDeProveedor: 0, proveedorElegido: false, hallazgosResueltos: 7,
    };
    expect(expresionDePestana(conexion, sinClavesConHallazgos)).toBe('worried');
  });

  it('las cinco pestañas resuelven una expresión, ninguna queda sin cara', () => {
    for (const p of PESTANAS) {
      for (const nombre of Object.keys(ESTADOS)) {
        expect(expresionDePestana(p, ESTADOS[nombre])).toMatch(
          /^(neutral|happy|excited|curious|worried)$/,
        );
      }
    }
  });
});

/* ── Una regla por pestaña ─────────────────────────────────────────────────
 * Estas son las cinco. La de Conexión y la de Revisión son la misma regla (el
 * motor), y las otras tres NO pueden serlo: preguntar por claves de proveedor en
 * la pestaña Formato pondría una cara preocupada permanente en una pantalla donde
 * no falta nada, que es lo que pasaba cuando la regla era una sola. */
describe('mascotDePestana — cada pestaña usa SU regla', () => {
  it('Conexión y Revisión comparten la del motor, y solo ella', () => {
    expect(expresionDePestana(pestanaPorId('conexion'), ESTADOS.sinClaves)).toBe('worried');
    expect(expresionDePestana(pestanaPorId('revision'), ESTADOS.sinClaves)).toBe('worried');
  });

  it('SIN CLAVE DE PROVEEDOR, Documento no se pone preocupado', () => {
    /* La prueba del caso que la regla única rompía. La pestaña Documento con un
     * documento que está bien no puede estar preocupada porque a alguien le falte
     * una clave de NIM: eso no dice nada del papel. */
    const estado = {
      documentoAbierto: true,
      pageSize: 'carta',
      idiomaPortada: 'es-ES',
      clavesDeProveedor: 0,
    };
    expect(expresionDePestana(pestanaPorId('documento'), estado)).toBe('happy');
    expect(expresionDePestana(pestanaPorId('formato'), {
      documentoAbierto: true,
      fuente: 'Times New Roman',
      interlineado: 2,
      alineacion: 'left',
      clavesDeProveedor: 0,
    })).toBe('happy');
  });

  it('Documento: sin hoja o sin idioma, preocupada; fuera de carta, curiosa', () => {
    const de = (pageSize?: string, idiomaPortada?: string) => expresionDePestana(
      pestanaPorId('documento'),
      { documentoAbierto: true, pageSize, idiomaPortada },
    );
    expect(de('carta', 'es-ES')).toBe('happy');
    expect(de('a4', 'es-ES')).toBe('curious');
    expect(de('carta')).toBe('worried');
  });

  it('Formato: se sale de APA 7 es curioso, no roto', () => {
    const de = (alineacion: string) => expresionDePestana(
      pestanaPorId('formato'),
      {
        documentoAbierto: true,
        fuente: 'Times New Roman',
        interlineado: 2,
        alineacion,
      },
    );
    expect(de('left')).toBe('happy');
    expect(de('justify')).toBe('curious');
  });

  it('sin documento abierto, las dos pestañas de documento lo dicen preocupadas', () => {
    expect(expresionDePestana(pestanaPorId('documento'), { documentoAbierto: false })).toBe('worried');
    expect(expresionDePestana(pestanaPorId('formato'), { documentoAbierto: false })).toBe('worried');
  });

  it('las reglas puras se pueden llamar solas, y dicen lo mismo', () => {
    /* `expresionDeDocumento` y `expresionDeFormato` se reexportan desde sus
     * pestañas: quien las importa de ahí tiene que obtener la misma cara que
     * obtiene la pestaña a través de `expresionDePestana`. */
    expect(expresionDeDocumento({ page_size: 'carta' }, { language: 'es-ES' })).toBe('happy');
    expect(expresionDeFormato({
      font_family: 'Comic Sans', font_size_pt: 12, line_spacing: 1, alignment: 'center',
    } as never)).toBe('curious');
  });
});

/* ── La de App ──────────────────────────────────────────────────────────────
 * La regla de la pestaña App no pregunta por el motor, porque la pestaña App no
 * configura el motor. Pregunta si la app está como la dejó quien la usa. */
describe('mascotDePestana — la cara de la pestaña App', () => {
  const app = () => pestanaPorId('app');

  it('tema elegido y nada roto: feliz', () => {
    expect(expresionDePestana(app(), {
      temaElegido: true, ajustesAbiertosAlgunaVez: true, hayAlgoRoto: false,
    })).toBe('happy');
  });

  it('nunca se abrió Ajustes: curiosa', () => {
    expect(expresionDePestana(app(), {
      temaElegido: false, ajustesAbiertosAlgunaVez: false, hayAlgoRoto: false,
    })).toBe('curious');
  });

  it('el resto: neutral', () => {
    expect(expresionDePestana(app(), {
      temaElegido: false, ajustesAbiertosAlgunaVez: true, hayAlgoRoto: false,
    })).toBe('neutral');
  });

  it('algo roto NO es feliz, aunque el tema esté elegido', () => {
    /* Si "nada anda" no estuviera en la regla, `happy` sería una afirmación que
     * nadie comprobó. */
    expect(expresionDePestana(app(), {
      temaElegido: true, ajustesAbiertosAlgunaVez: true, hayAlgoRoto: true,
    })).not.toBe('happy');
  });

  it('la regla pura de App también funciona sola', () => {
    expect(expresionDeApp({ temaElegido: true, hayAlgoRoto: false })).toBe('happy');
  });

  it('la pestaña App NO pregunta por las claves de proveedor', () => {
    /* Cero claves, tema elegido, todo bien: App tiene que estar feliz igual. Si
     * la regla de App compartiera la del motor, esto se caería. */
    expect(expresionDePestana(app(), {
      temaElegido: true, ajustesAbiertosAlgunaVez: true, hayAlgoRoto: false, clavesDeProveedor: 0,
    })).toBe('happy');
  });
});

describe('mascotDePestana — el kind que se dibuja', () => {
  it('los cinco kinds del catálogo se dibujan tal cual', () => {
    for (const kind of ['highlighter', 'ruler', 'reference', 'strike', 'gear'] as MascotKind[]) {
      expect(kindDePestana(kind)).toBe(kind);
    }
  });

  it('un kind sin dibujo NO deja la mascota en blanco', () => {
    /* La Fase 6 dibujó `gear`. Este caso sigue vivo para el día que aparezca un
     * sexto kind: un kind en el union type sin SVG sale vacío, sin error y sin
     * aviso, que es el peor de los tres. */
    expect(kindDePestana('engranaje' as MascotKind)).toBe(KIND_SIN_DIBUJO);
    expect(KIND_SIN_DIBUJO).toBe('reference');
  });

  it('ninguna pestaña del catálogo pide un kind que no se sepa dibujar', () => {
    for (const p of PESTANAS) {
      expect(kindDePestana(p.mascotKind)).toBe(p.mascotKind);
    }
  });
});

/* ── El dibujo, que es lo que el union type no puede asegurar ──────────────
 * Un kind en el union type y ausente del switch de `EditorialMascot` no falla
 * nada: renderiza un `<svg>` vacío. Esta es la prueba que se cae si `gear` se
 * declara y no se dibuja. */
describe('EditorialMascot — cada kind DIBUJA algo', () => {
  const KINDS: MascotKind[] = ['highlighter', 'ruler', 'reference', 'strike', 'gear'];

  for (const kind of KINDS) {
    it(`${kind} dibuja un cuerpo, no un svg vacío`, () => {
      const { container } = render(React.createElement(EditorialMascot, { kind }));
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('class')).toContain(`editorial-mascot-kind-${kind}`);
      /* El cuerpo, que es lo único que TODOS los kinds dibujan. Un kind sin él
       * es un kind que no se dibujó. */
      expect(container.querySelector('.editorial-mascot-body')).not.toBeNull();
      /* Y la cara, que es la mitad del contrato: sin cara no hay expresión. */
      expect(container.querySelector('.editorial-mascot-face')).not.toBeNull();
      /* Y algo de contenido de verdad, que no sea solo el andamiaje. */
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(2);
    });
  }

  it('GEAR tiene dientes: es el engranaje de la pestaña App', () => {
    /* Ocho dientes, uno cada 45 grados, y el mismo rectángulo girado: sin ellos
     * el kind `gear` sería un círculo con cara. */
    const { container } = render(React.createElement(EditorialMascot, { kind: 'gear' }));
    expect(container.querySelectorAll('.editorial-mascot-gear-diente')).toHaveLength(8);
    expect(container.querySelector('.editorial-mascot-gear-body')).not.toBeNull();
  });

  it('ningún kind dibuja fuera de la caja de 64x64', () => {
    /* Un diente que se sale del viewBox queda cortado por `overflow: visible` y
     * se come el borde de la tarjeta. */
    for (const kind of KINDS) {
      const { container } = render(React.createElement(EditorialMascot, { kind }));
      for (const hijo of Array.from(container.querySelector('svg')?.children ?? [])) {
        const d = hijo.getAttribute('d');
        const caja = hijo.getAttribute('x');
        if (caja !== null) {
          expect(Number(caja)).toBeGreaterThanOrEqual(0);
        }
        if (d) {
          const numeros = d.match(/-?\d+(\.\d+)?/g) || [];
          /* Solo se miran los valores grandes: los `rotate(45 32 32)` llevan el
           * centro adentro y no cuentan como coordenadas. */
          for (const n of numeros) {
            expect(Math.abs(Number(n))).toBeLessThanOrEqual(64);
          }
        }
      }
    }
  });
});
