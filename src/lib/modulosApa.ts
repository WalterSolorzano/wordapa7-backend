/* WordAPA7 — QUÉ SE ESTANDARIZA, declarado UNA vez.
 *
 * Esta lista contesta la pregunta "¿qué módulos APA le ofrezco a la persona?" y
 * la contesta para todas las pantallas. Antes vivía escrita dos veces —el menú
 * de la barra (`APAModuleToggles.tsx`) y el modal Express
 * (`ExpressQuickTransformModal.tsx`)— con dos taxonomías distintas: cinco
 * módulos en una y tres en la otra. La misma decisión con dos formas es una
 * contradicción esperando: cambiabas una y la otra quedaba mintiendo.
 *
 * EL LÍMITE NO LO PONGO YO, LO PONE EL MOTOR. `python/modules/scoped_apply.py`
 * tiene `VALID_SCOPES = ("texto", "tablas_imagenes", "bibliografia")` y rechaza
 * cualquier otro alcance con un `ValueError`. El menú viejo ofrecía cinco
 * (partía texto y tablas_imagenes en dos cada uno), así que apagar "Párrafos &
 * Sangrías" mandaba `["titulos", ...]`, el backend lo rechazaba y la exportación
 * por partes caía al formato completo con un aviso: la pantalla prometía "solo
 * bibliografía" y el `.docx` salía entero. Un control más fino que el motor no
 * es más control, es una mentira con forma de checkbox.
 *
 * Por eso los módulos son TRES, exactamente los del motor, y las dos categorías
 * agrupan sin inventar: "Texto" y "Objetos y fuentes". La granularidad que el
 * usuario ve es la que el archivo final puede cumplir.
 *
 * LA PRUEBA QUE LO SOSTIENE. `modulosApa.test.ts` espeja `VALID_SCOPES` a mano:
 * si el motor suma un alcance, esa prueba y este archivo tienen que moverse
 * juntos, y si no se mueven, se cae. La segunda mitad de la prueba prohíbe que
 * un consumidor se escriba su propia lista.
 */

/** Un alcance que el motor aplica sobre el documento. Espeja
 *  `VALID_SCOPES` de `python/modules/scoped_apply.py`. */
export type AlcanceDeModulo = 'texto' | 'tablas_imagenes' | 'bibliografia';

/** Los dos rótulos con los que se agrupan los módulos. Dos, no cinco: el
 *  usuario pidió dejar de ver una lista plana. */
export type GrupoDeModulo = 'texto' | 'objetos_y_fuentes';

export interface ModuloApa {
  /** El id que viaja al motor. Es único y no se traduce al vuelo. */
  id: AlcanceDeModulo;
  etiqueta: string;
  descripcion: string;
  grupo: GrupoDeModulo;
  /**
   * El alcance del motor que este módulo enciende. Hoy es el mismo id —uno a
   * uno—, pero se declara aparte a propósito: el día que la pantalla quiera
   * partir "objetos" en dos, el mapeo cambia acá y ninguna pantalla se toca.
   */
  alcance: AlcanceDeModulo;
}

export interface GrupoDeModulos {
  id: GrupoDeModulo;
  titulo: string;
}

/** El orden de esta lista es el orden del motor; no lo alteres sin mover el
 *  espejo de `modulosApa.test.ts`. */
export const ALCANCES_DEL_MOTOR: readonly AlcanceDeModulo[] = [
  'texto',
  'tablas_imagenes',
  'bibliografia',
];

export const GRUPOS_DE_MODULOS: readonly GrupoDeModulos[] = [
  { id: 'texto', titulo: 'Texto' },
  { id: 'objetos_y_fuentes', titulo: 'Objetos y fuentes' },
];

export const MODULOS_APA: readonly ModuloApa[] = [
  {
    id: 'texto',
    etiqueta: 'Texto y títulos',
    descripcion:
      'Tipografía, interlineado doble, sangría de 1.27 cm y el formato de cada nivel de título.',
    grupo: 'texto',
    alcance: 'texto',
  },
  {
    id: 'tablas_imagenes',
    etiqueta: 'Tablas y figuras',
    descripcion:
      'Bordes y cabeceras APA en tablas, numeración "Tabla N" arriba y "Figura N" abajo.',
    grupo: 'objetos_y_fuentes',
    alcance: 'tablas_imagenes',
  },
  {
    id: 'bibliografia',
    etiqueta: 'Referencias y fuentes',
    descripcion:
      'Sangría francesa de 1.27 cm, doble espacio y orden alfabético en la lista de referencias.',
    grupo: 'objetos_y_fuentes',
    alcance: 'bibliografia',
  },
];

/** Los módulos de una categoría, en el orden declarado. */
export const modulosDe = (grupo: GrupoDeModulo): ModuloApa[] =>
  MODULOS_APA.filter((m) => m.grupo === grupo);

/** Los cinco ids del menú viejo. Un estado guardado los puede tener escritos, y
 *  mandarlos crudos al motor es el defecto que esta lista arregla. */
const ALIAS_LEGADO: Record<string, AlcanceDeModulo> = {
  titulos: 'texto',
  tablas: 'tablas_imagenes',
  imagenes: 'tablas_imagenes',
};

/**
 * Traduce ids de pantalla a alcances del motor: descarta lo desconocido, une lo
 * repetido y devuelve en el orden del motor. Es el único punto donde una lista
 * de la UI se vuelve una lista que el backend acepta.
 */
export const alcancesDe = (ids: Iterable<string>): AlcanceDeModulo[] => {
  const pedidos = new Set<AlcanceDeModulo>();
  for (const id of ids) {
    const destino = ALIAS_LEGADO[id];
    if (destino) {
      pedidos.add(destino);
    } else if ((ALCANCES_DEL_MOTOR as readonly string[]).includes(id)) {
      pedidos.add(id as AlcanceDeModulo);
    }
  }
  return ALCANCES_DEL_MOTOR.filter((a) => pedidos.has(a));
};
