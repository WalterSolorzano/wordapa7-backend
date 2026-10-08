/* WordAPA7 — el catálogo de proveedores de IA, y la regla que decide cuál manda.
 *
 * Antes de este archivo el frontend tenía DOS verdades distintas sobre los
 * proveedores: `documentSlice.ts` caminaba una lista de variables de entorno
 * escrita a mano, y el estudio de Ajustes tenía trece campos con las mismas
 * variables escritas a mano otra vez. Agregar un proveedor era editar dos
 * lugares y acordarse de los dos.
 *
 * El catálogo es la lista de una sola vez, y el ORDEN es el orden de prioridad
 * de `python/classification/llm_classifier.py:_get_active_providers`. No es un
 * detalle: ese orden es el que decide a quién se le pregunta cuando hay más de
 * una clave puesta, y por eso la detección de la clave y el orden del backend
 * tienen que ser el mismo y no dos que se parecen.
 *
 * La elección del proveedor es lo que la Fase 2 volvió posible: antes, con dos
 * claves puestas, mandaba la primera del orden. Ahora manda la elegida —y si la
 * elegida no tiene clave, se vuelve al orden, porque elegir un proveedor sin
 * clave no puede dejar la app sin motor.
 */

/** Cómo leer una variable de proveedor. Se pasa como parámetro para que la
 *  regla sea PURA y se pueda probar sin localStorage ni backend. */
export type LeerVariable = (variable: string) => string;

export interface ProveedorIA {
  /** El `id` que viaja al backend en `provider_id`. Debe coincidir con el `id`
   *  del diccionario de `_get_active_providers`, o el backend responde
   *  "Proveedor no configurado". */
  id: string;
  etiqueta: string;
  /** Las variables sin las cuales el proveedor NO entra en la lista del
   *  backend. Cloudflare necesita dos: sin el id de cuenta su endpoint no se
   *  puede construir, así que saying "tiene clave" con una sola sería mentira. */
  variablesClave: string[];
  /** La variable de modelo, si el backend la lee del entorno. TODOS la leen:
   *  los cuatro que la tenian quemada en el codigo —OpenRouter, Cerebras, Mistral
   *  y OpenCodeZen— salen a leerla con default, asi que `null` ya no describe a
   *  nadie y un campo para eso no tendria a quien escribir. Un `null` aqui
   *  significaria "el modelo no se puede cambiar", y eso es falso. */
  variableModelo: string | null;
  /** El modelo que usa el backend si la variable está vacía. Va acá para que
   *  el campo pueda decir cuál es el de partida, que es lo que hace falta para
   *  decidir si vale la pena cambiarlo. */
  modeloPorDefecto: string | null;
}

export const PROVEEDORES_IA: ProveedorIA[] = [
  {
    id: 'nvidia_nim', etiqueta: 'NVIDIA NIM',
    variablesClave: ['NVIDIA_API_KEY'],
    variableModelo: 'NVIDIA_NIM_MODEL', modeloPorDefecto: 'nvidia/nemotron-3-super-120b-a12b',
  },
  {
    id: 'groq', etiqueta: 'Groq',
    variablesClave: ['GROQ_API_KEY'],
    variableModelo: 'GROQ_MODEL', modeloPorDefecto: 'openai/gpt-oss-120b',
  },
  {
    id: 'openrouter', etiqueta: 'OpenRouter',
    variablesClave: ['OPENROUTER_API_KEY'],
    variableModelo: 'OPENROUTER_MODEL', modeloPorDefecto: 'meta-llama/llama-3.3-70b-instruct',
  },
  {
    id: 'cerebras', etiqueta: 'Cerebras',
    variablesClave: ['CEREBRAS_API_KEY'],
    variableModelo: 'CEREBRAS_MODEL', modeloPorDefecto: 'llama3.1-70b',
  },
  {
    id: 'mistral', etiqueta: 'Mistral AI',
    variablesClave: ['MISTRAL_API_KEY'],
    variableModelo: 'MISTRAL_MODEL', modeloPorDefecto: 'mistral-small-latest',
  },
  {
    id: 'opencodezen', etiqueta: 'OpenCodeZen',
    variablesClave: ['OPENCODEZEN_API_KEY'],
    variableModelo: 'OPENCODEZEN_MODEL', modeloPorDefecto: 'meta-llama/llama-3.3-70b-instruct',
  },
  {
    id: 'zenmux', etiqueta: 'ZenMux',
    variablesClave: ['ZENMUX_API_KEY'],
    variableModelo: 'ZENMUX_MODEL', modeloPorDefecto: 'z-ai/glm-4.6v-flash-free',
  },
  {
    id: 'gemini', etiqueta: 'Gemini',
    variablesClave: ['GEMINI_API_KEY'],
    variableModelo: 'GEMINI_MODEL', modeloPorDefecto: 'gemini-2.5-flash',
  },
  {
    id: 'cloudflare', etiqueta: 'Cloudflare AI',
    variablesClave: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
    variableModelo: 'CLOUDFLARE_AI_MODEL', modeloPorDefecto: '@cf/meta/llama-3.1-8b-instruct',
  },
  {
    id: 'aion', etiqueta: 'Aion Labs',
    variablesClave: ['AION_API_KEY'],
    variableModelo: 'AION_MODEL', modeloPorDefecto: 'aion-labs/aion-3.0-mini',
  },
  {
    id: 'kilocode', etiqueta: 'Kilo Code',
    variablesClave: ['KILOCODE_API_KEY'],
    variableModelo: 'KILOCODE_MODEL', modeloPorDefecto: 'kilo-auto/free',
  },
  {
    id: 'ollama_cloud', etiqueta: 'Ollama Cloud',
    variablesClave: ['OLLAMA_API_KEY'],
    variableModelo: 'OLLAMA_MODEL', modeloPorDefecto: 'gpt-oss:20b',
  },
  {
    id: 'huggingface', etiqueta: 'HuggingFace',
    variablesClave: ['HUGGINGFACE_API_KEY'],
    variableModelo: 'HUGGINGFACE_MODEL', modeloPorDefecto: 'meta-llama/Llama-3.1-8B-Instruct',
  },
  {
    id: 'modelscope', etiqueta: 'ModelScope',
    variablesClave: ['MODELSCOPE_API_KEY'],
    variableModelo: 'MODELSCOPE_MODEL', modeloPorDefecto: 'Qwen/Qwen2.5-72B-Instruct',
  },
  {
    id: 'sambanova', etiqueta: 'SambaNova',
    variablesClave: ['SAMBANOVA_API_KEY'],
    variableModelo: 'SAMBANOVA_MODEL', modeloPorDefecto: 'Meta-Llama-3.3-70B-Instruct',
  },
  {
    id: 'dashscope', etiqueta: 'DashScope',
    variablesClave: ['DASHSCOPE_API_KEY'],
    variableModelo: 'DASHSCOPE_MODEL', modeloPorDefecto: 'qwen-plus',
  },
  {
    id: 'agnes_ai', etiqueta: 'Agnes AI',
    variablesClave: ['AGNES_AI_API_KEY'],
    variableModelo: 'AGNES_AI_MODEL', modeloPorDefecto: 'gpt-4o-mini',
  },
];

/** La clave en localStorage de un campo de proveedor. La misma convención que
 *  usa `syncAllProviderKeys` de `src/api/backend.ts`, que lee
 *  `wordapa7-provider-key:${variable}`: por eso el prefijo dice "key" también
 *  para un modelo, y no es una equivocación. */
export const claveDeLocalStorage = (variable: string): string =>
  `wordapa7-provider-key:${variable}`;

/** La elección de proveedor, en localStorage. Existe por un motivo concreto: el
 *  `apiKey` del store se inicializa con una IIFE SÍNCRONA al cargar el módulo,
 *  antes de que `persist` rehidrate desde IndexedDB, así que a esa altura la
 *  única forma de respetar la elección es leerla de acá. El store sigue siendo
 *  la verdad; esta es la copia que permite arrancar bien. */
export const LLAVE_DE_ELECCION = 'wordapa7-proveedor-elegido';

export const leerVariableDeLocalStorage: LeerVariable = (variable) => {
  try {
    return (localStorage.getItem(claveDeLocalStorage(variable)) || '').trim();
  } catch {
    return '';
  }
};

/** La elección guardada. `''` significa automático, que es el valor por
 *  defecto: con `''` el backend no filtra y responde el primero que conteste. */
export function eleccionGuardada(): string {
  try {
    return (localStorage.getItem(LLAVE_DE_ELECCION) || '').trim();
  } catch {
    return '';
  }
}

export function guardarEleccion(id: string): void {
  try {
    if (id) localStorage.setItem(LLAVE_DE_ELECCION, id);
    else localStorage.removeItem(LLAVE_DE_ELECCION);
  } catch {
    /* sin localStorage no hay elección persistente: el store igual la tiene */
  }
}

export function proveedorPorId(id: string | null | undefined): ProveedorIA | null {
  if (!id) return null;
  return PROVEEDORES_IA.find((p) => p.id === id) || null;
}

/** Si el proveedor tiene TODAS las variables que el backend necesita. */
export function estaListo(leer: LeerVariable, p: ProveedorIA): boolean {
  return p.variablesClave.every((v) => leer(v).length > 0);
}

/** Cuántas variables de clave hay escritas. Es lo que decide si la pestaña
 *  tiene algo que mostrar o si tiene que decir que no hay nada. */
export function contarClaves(leer: LeerVariable): number {
  return PROVEEDORES_IA.reduce(
    (n, p) => n + p.variablesClave.filter((v) => leer(v).length > 0).length,
    0,
  );
}

/** Los proveedores que el backend puede usar ahora mismo. */
export function proveedoresListos(leer: LeerVariable): ProveedorIA[] {
  return PROVEEDORES_IA.filter((p) => estaListo(leer, p));
}

/** La clave que se manda como `api_key` para un proveedor dado. La primera de
 *  sus variables es la que viaja: en Cloudflare es el token, y el id de cuenta
 *  va aparte. */
export function claveDeProveedor(leer: LeerVariable, id: string | null | undefined): string {
  const p = proveedorPorId(id);
  if (!p) return '';
  return leer(p.variablesClave[0]);
}

/**
 * EL QUE MANDA. La regla entera de la Fase 2 en una función.
 *
 * Si hay un proveedor elegido y tiene su clave, es el suyo. Si no —no hay
 * elección, o la elección no tiene clave— cae al primero del orden de prioridad
 * que la tenga, que es el comportamiento de siempre. Elegir un proveedor sin
 * clave no puede dejar la app sin motor: el selector es una preferencia, no un
 * interruptor.
 */
export function proveedorManda(
  leer: LeerVariable,
  elegido: string | null | undefined,
): ProveedorIA | null {
  const p = proveedorPorId(elegido);
  if (p && estaListo(leer, p)) return p;
  return proveedoresListos(leer)[0] || null;
}

/** La clave que corresponde a la elección. Es lo que el store guarda en
 *  `apiKey` y lo que viaja al backend en cada llamada. */
export function resolverClave(leer: LeerVariable, elegido: string | null | undefined): string {
  const p = proveedorManda(leer, elegido);
  return p ? leer(p.variablesClave[0]) : '';
}
