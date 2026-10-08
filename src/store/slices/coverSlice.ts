import { StateCreator } from 'zustand';
import { DocState } from '../types';
import { ActaDocumento, PortadaData, ElementModel } from '../../types';
import {
  CATALOGO_DE_CARRERAS,
  CATALOGO_DE_UNIVERSIDADES,
} from '../../lib/portada/catalogo';
import { FRACCION_DE_ANCHO_DEL_LOGO } from '../../lib/portada/geometria';
import * as api from '../../api/backend';

const getApiBase = () => api.getApiBase();

export const defaultPortada: PortadaData = {
  apa_format: 'student',
  use_original_cover: true,
  title: '',
  institution: '',
  course: '',
  date: '',
  running_head: '',
  author_note: '',
  /* Los logos viajan como dato, no como una constante del `.docx`. El default
     es una lista VACIA y no `undefined`: "no hay logos pedidos" y "el campo no
     existe" son dos estados distintos, y el segundo hace que el `.docx` tenga
     que adivinar. */
  logos: [],
  /* El idioma viaja en `PortadaData` y no en `DocumentMeta` por una razón
     escrita en `python/models.py`: es el único de los dos que el cliente manda
     en cada exportación. El default es el mismo que el del modelo, para que el
     selector de la pestaña Documento no arranque sin opción elegida. */
  language: 'es-ES',
};

export const defaultActa: ActaDocumento = {
  autor: '',
  profesor_asesor: [],
  comite: [],
  fecha_defensa: '',
  grupo: '',
};

/* Los datos del acta salen de la portada: con `use_original_cover: true` el
   bloque de portada no se toca, asi que un autor guardado ahi no tiene de donde
   salir y el `.docx` sale sin el. El motivo entero esta en `python/models.py`
   y en el tipo `PortadaData`; esto es la parte que el usuario no ve. */
/** Sube de `portada` a `acta` los datos de una sesion guardada antes del
 *  cambio de lugar. Idempotente, y nunca pisa un dato que ya este en `acta`: una
 *  sesion migrada dos veces tiene que seguir teniendo el mismo autor, no el
 *  ultimo que se le hizo pasar. */
export function migrarActaDesdePortada(
  portada: Partial<PortadaData> | null | undefined,
  actual: ActaDocumento = defaultActa,
): ActaDocumento {
  const viejo = portada as Record<string, unknown> | null | undefined;
  if (!viejo) return actual;
  const migro = { ...actual };

  const autor = typeof viejo.author === 'string' ? viejo.author.trim() : '';
  if (autor && !migro.autor) migro.autor = autor;

  const grupo = typeof viejo.grupo === 'string' ? viejo.grupo.trim() : '';
  if (grupo && !migro.grupo) migro.grupo = grupo;

  /* `instructor` era texto libre. Se separa por comas o saltos de linea, que es
     como los guardaba el formulario viejo, y se descarta lo que este repetido:
     una lista con el mismo asesor dos veces se dibuja dos veces en el `.docx`. */
  const crudo = typeof viejo.instructor === 'string' ? viejo.instructor : '';
  const nombres = crudo
    .split(/[,\n]/)
    .map((n) => n.trim())
    .filter(Boolean);
  const faltan = nombres.filter((n) => !migro.profesor_asesor.includes(n));
  if (faltan.length > 0) {
    migro.profesor_asesor = [...migro.profesor_asesor, ...faltan];
  }

  return migro;
}

export function syncCoverFieldToElements(elements: ElementModel[], field: keyof PortadaData, value: string): ElementModel[] {
  if (!elements || elements.length === 0) return elements;
  const coverElems = elements.filter(e => e.is_cover_section || e.type === 'portada_block');
  if (coverElems.length === 0) return elements;

  const newElements = [...elements];

  if (field === 'title') {
    const titleElem = coverElems.find(e => 
      e.text && (e.text.toLowerCase().includes('tema:') || (e.font_size && e.font_size >= 18))
    ) || coverElems.find(e => 
      e.text && !['universidad', 'facultad', 'recinto', 'departamento', 'direccion', 'área de conocimiento'].some(kw => e.text.toLowerCase().includes(kw))
    );
    if (titleElem) {
      const idx = newElements.findIndex(e => e.id === titleElem.id);
      if (idx !== -1) {
        const prefixMatch = newElements[idx].text.match(/^(tema\s*:\s*)/i);
        const prefix = prefixMatch ? prefixMatch[1] : '';
        newElements[idx] = { ...newElements[idx], text: prefix ? `${prefix}${value}` : value };
      }
    }
  } else if (field === 'date') {
    const dateElem = coverElems.find(e => 
      e.text && (e.text.toLowerCase().includes('fecha') || /\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(e.text))
    );
    if (dateElem) {
      const idx = newElements.findIndex(e => e.id === dateElem.id);
      if (idx !== -1) {
        const prefixMatch = newElements[idx].text.match(/^(fecha(?:\s+de\s+entrega)?\s*:\s*)/i);
        const prefix = prefixMatch ? prefixMatch[1] : 'Fecha: ';
        newElements[idx] = { ...newElements[idx], text: value ? `${prefix}${value}` : '' };
      }
    }
  } else if (field === 'course') {
    const courseElem = coverElems.find(e => 
      e.text && (e.text.toLowerCase().includes('asignatura') || e.text.toLowerCase().includes('curso') || e.text.toLowerCase().includes('materia') || e.text.toLowerCase().includes('unidad'))
    );
    if (courseElem) {
      const idx = newElements.findIndex(e => e.id === courseElem.id);
      if (idx !== -1) {
        newElements[idx] = { ...newElements[idx], text: value };
      }
    }
  } else if (field === 'institution') {
    const instElem = coverElems.find(e => 
      e.text && (e.text.toLowerCase().includes('universidad') || e.text.toLowerCase().includes('facultad') || e.text.toLowerCase().includes('recinto') || e.text.toLowerCase().includes('direccion'))
    );
    if (instElem) {
      const idx = newElements.findIndex(e => e.id === instElem.id);
      if (idx !== -1) {
        newElements[idx] = { ...newElements[idx], text: value };
      }
    }
  }

  return newElements;
}

export const createCoverSlice: StateCreator<DocState, [], [], Partial<DocState>> = (set, get) => ({
  coverSetupDone: false,
  setCoverSetupDone: (done) => set({ coverSetupDone: done }),
  portada: defaultPortada,
  acta: defaultActa,
  /* `setActa` NO llama a `syncCoverFieldToElements` a proposito, y es la parte
     que mas se nota si se cambia. Esa funcion reescribe los parrafos del
     bloque de portada del documento del usuario, y con `use_original_cover`
     ese bloque es zona protegida: `AGENTS.md` dice que de ahi no se toca ni un
     caracter. El autor, el profesor y el grupo llegan al `.docx` por el bloque
     del acta, que va detras de la portada. */
  setActa: (parcial) => set((state) => ({ acta: { ...state.acta, ...parcial } })),
  updateActaField: (campo, valor) => set((state) => ({
    acta: { ...state.acta, [campo]: valor },
  })),
  migrarActa: (portadaVieja) => set((state) => ({
    acta: migrarActaDesdePortada(portadaVieja, state.acta),
  })),
  setPortada: (newPortada) => set((state) => {
    const updatedPortada = { ...state.portada, ...newPortada };
    let updatedDoc = state.doc;
    if (updatedDoc && updatedDoc.elements && updatedDoc.elements.length > 0) {
      let elements = [...updatedDoc.elements];
      for (const [k, v] of Object.entries(newPortada)) {
        if (typeof v === 'string' && v.trim()) {
          elements = syncCoverFieldToElements(elements, k as keyof PortadaData, v);
        }
      }
      updatedDoc = { ...updatedDoc, elements, portada: { ...updatedDoc.portada, ...newPortada } as any };
    }
    return { portada: updatedPortada, doc: updatedDoc };
  }),
  updateCoverField: (field, value) => {
    /* Escribir a mano en un campo que tiene un selector DESELECCIONA el
       selector. Sin esto el chip queda encendido con un valor que ya no es el del
       catalogo, que es el fallo que se reporto: dos chips encendidos y un valor
       guardado que no es ninguno de los dos. */
    if (field === 'institution') get().updateCoverInstitucion(null);
    if (field === 'departamento') get().updateCoverCarrera(null);
    get().setPortada({ [field]: value });
  },

  /* Elegir una institucion es PONER UN VALOR, no concatenar texto. El codigo va
     al estado y el nombre se resuelve del catalogo, asi que el valor guardado es
     siempre uno de los dos y nunca una frase con las dos instituciones dentro.

     Volver a hacer clic en la ya elegida la quita (`null`) y devuelve el campo de
     texto libre a su estado: un control de un solo valor sin forma de
     deseleccionar esta a medio hacer. */
  updateCoverInstitucion: (codigo) => set((state) => {
    if (codigo === null || state.portada.institucionSeleccionada === codigo) {
      return {
        portada: {
          ...state.portada,
          institucionSeleccionada: null,
          institution: '',
          // El logo se va con la institucion: un documento sin institucion no
          // tiene de que insignia.
          logos: [],
        },
      };
    }
    const delCatalogo = CATALOGO_DE_UNIVERSIDADES.find((u) => u.codigo === codigo);
    if (!delCatalogo) return {};
    return {
      portada: {
        ...state.portada,
        institucionSeleccionada: codigo,
        institution: delCatalogo.nombre,
        departamento: delCatalogo.areaDefault,
        /* El logo viaja con la institucion. Antes era una constante del `.docx`
           y poner el de la UNI era lo unico que sabia hacer: elegir UNAN salia
           con el logo de la UNI, en silencio, y el `.docx` quedaba equivocado
           sin que hubiera ningun error. */
        logos: delCatalogo.logoUrl
          ? [{
              asset: delCatalogo.logoUrl.split('/').pop() as string,
              /* La misma fracción que el default de `LogoPortada` en
                 `python/models.py`, sacada de `geometria.ts` y no escrita a
                 mano: 5.2 cm sobre los 16.51 cm de ancho útil de una carta. Con
                 un 0.16 el logo quedaba en 2.64 cm, la mitad de lo que
                 llevaba, y la miniatura y el `.docx` dejaban de parecerse. */
              ancho_fraccion: FRACCION_DE_ANCHO_DEL_LOGO,
              institucion: delCatalogo.codigo,
            }]
          : [],
      },
    };
  }),

  /* La carrera tiene el mismo patron, y el defecto parejo: su `onClick`
     escribia `departamento`, que es un campo distinto del que usa la
     institucion, y como el nombre de la carrera no matcheaba con el de la
     institucion, elegir una carrera dejaba la institucion en un estado que no
     era el que el usuario habia escrito. */
  updateCoverCarrera: (codigo) => set((state) => {
    if (codigo === null || state.portada.carreraSeleccionada === codigo) {
      return { portada: { ...state.portada, carreraSeleccionada: null, departamento: '' } };
    }
    const delCatalogo = CATALOGO_DE_CARRERAS.find((c) => c.id === codigo);
    if (!delCatalogo) return {};
    return {
      portada: {
        ...state.portada,
        carreraSeleccionada: codigo,
        departamento: delCatalogo.nombre,
      },
    };
  }),
  portadaProfiles: [{ profile_name: 'Portada Estándar', created_at: new Date().toISOString(), data: defaultPortada }],
  savePortadaProfile: (name) => set((state) => {
    const profile = { profile_name: name, created_at: new Date().toISOString(), data: state.portada };
    return { portadaProfiles: [...state.portadaProfiles, profile as any] };
  }),
  showTemplateDialog: false,
  setShowTemplateDialog: (show) => set({ showTemplateDialog: show }),
  availableTemplates: [],
  fetchTemplates: async () => {
    try {
      const res = await fetch(`${getApiBase()}/templates`);
      if (res.ok) {
        const data = await res.json();
        set({ availableTemplates: data.templates || [] });
      }
    } catch (err) {
      console.warn('Error fetching templates:', err);
    }
  },
  applyTemplate: async (templateName) => {
    const { doc, pushHistory } = get();
    if (!doc) return;
    set({ isLoading: true });
    try {
      const res = await fetch(`${getApiBase()}/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: doc.session_id,
          template_name: templateName,
          numbering_style: 'decimal',
        }),
      });
      if (!res.ok) throw new Error('Error al aplicar plantilla');
      const result = await res.json();
      // Reload document to get updated elements
      const updatedRes = await fetch(`${getApiBase()}/session/${doc.session_id}`);
      if (updatedRes.ok) {
        const updatedDoc = await updatedRes.json();
        pushHistory(updatedDoc);
        set({ doc: updatedDoc, isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message || 'Error al aplicar plantilla', isLoading: false });
    }
  },
});
