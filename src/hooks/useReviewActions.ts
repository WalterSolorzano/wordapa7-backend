/* WordAPA7 — review: la CAPA EFECTIVA del workbench.

   `useReviewWorkbench` tenía dos mitades muy distintas en el mismo archivo, y
   la línea que las separaba era invisible:

   - La DERIVACIÓN (`items`, `agruparHallazgos`, `marks`, `metrics`, el
     filtro, la paginación) es pura: mismos datos, mismos números, se puede
     probar sin DOM. Es la que se puede razonar.
   - La EFECCIÓN (`aplicar`, `acceptOne`, `acceptMany`, `markMany`,
     `despachar`, `runGroupAction`, `dismiss`) escribe en el documento, llama
     a la red y decide qué mecanismo ejecuta cada rótulo. Es donde vive cada
     defecto de la rama: el cerrojo que faltaba, el descarte que salía por un
     solo canal, la regla de alcance que la vista re-derivaba.

   No era un problema de LÍNEAS: las dos mitades se probaban distinto, y solo
   la primera se podía probar sin DOM. Esto es la segunda mitad, con las mismas
   reglas y sin cambiar el contrato público: `useReviewWorkbench` sigue
   publicando exactamente lo mismo, y quien importa el hook no tiene que saber
   que ahora hay dos archivos.

   Lo que ESTE archivo no hace: derivar nada. Ni el filtro, ni los grupos, ni
   las páginas. Recibe las acciones del store y el estado de la vista por
   parámetro, y devuelve los cinco verbos. */

import { useCallback, useRef, useState } from 'react';
import * as api from '../api/backend';
import type { DocumentModel } from '../types';
import type { AuditItem } from '../lib/auditItems';
import type { EngineGroup, SubtypeAction, SubtypeGroup } from './useReviewWorkbench';

/** Lo que la capa de efecto necesita del store. Se declara como estructura y no
 *  se lee del store acá: el hook que la usa ya lo tiene, y volver a leerlo
 *  haría dos suscripciones al mismo valor. */
export interface ReviewActionStore {
  doc: DocumentModel | null;
  updateElementText: (elementId: string, text: string) => Promise<void>;
  autoResolveGhosts: () => Promise<void>;
  autoCaptionAll: () => Promise<void>;
  /** El canal de descarte del LIENZO. `dismiss` tiene que salir por los dos:
   *  la lista del workbench y la burbuja con su subrayado (este callback).
   *  AGENTS.md §2 los exige juntos. */
  dismissComment: (elementId: string) => void;
  /** El descarte del WORKBENCH. Es la MISMA lista que cuenta el rail: el
   *  hallazgo sale de `reviewItems` en cuanto el store lo registra. Antes esto
   *  era un `useState` local de la vista, y por eso el rail y la pantalla podían
   *  contar distinto. */
  dismissFinding: (id: string) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  /** Resuelve la acción declarada de un hallazgo. La deriva el hook de
   *  derivación (`accionDeItem`, con la tabla `SUBTYPE_ACTION`); se recibe por
   *  parámetro para que ESTA capa —la que escribe— pueda volver a comprobar que
   *  un lote solo acepta lo aceptable sin importar el módulo de derivación (que
   *  ya la importa a ella: sería un ciclo). */
  accionDeItem: (item: AuditItem) => SubtypeAction;
}

/** El estado de la vista que la capa de efecto muta. El descarte NO vive acá:
 *  vive en el store (`dismissFinding`), que es la fuente que comparte el rail. */
export interface ReviewActionState {
  setMarkedIds: (updater: (prev: string[]) => string[]) => void;
  setSelectedId: (updater: (prev: string | null) => string | null) => void;
}

export interface ReviewActions {
  acceptOne: (item: AuditItem) => Promise<void>;
  acceptMany: (items: AuditItem[]) => Promise<void>;
  markForReview: (item: AuditItem) => void;
  runGroupAction: (group: EngineGroup | SubtypeGroup) => Promise<void>;
  dismiss: (item: AuditItem) => void;
  isApplying: boolean;
}

export function useReviewActions(store: ReviewActionStore, state: ReviewActionState): ReviewActions {
  const { doc, updateElementText, autoResolveGhosts, autoCaptionAll, dismissComment, dismissFinding, showToast, accionDeItem } = store;
  const { setMarkedIds, setSelectedId } = state;

  /* Hay UNA escritura en curso a la vez. `acceptMany` recorre los hallazgos de
     uno en uno y `aplicar` hace una llamada de red por hallazgo sin sugerencia:
     un "Aceptar todas" grande son N llamadas secuenciales. Sin este cerrojo, un
     segundo "Aceptar todas" vuelve a disparar las MISMAS llamadas sobre los
     MISMOS elementos, y el último que escribe gana de forma no determinista: el
     documento queda con una corrección arbitraria de entre las dos. El cerrojo
     no es decoración de estado, es lo que hace la acción idempotente.

     El cerrojo es un REF y no el estado: dos pulsaciones en el mismo tick de
     React leen el mismo `isApplying` del render anterior, y con estado las dos
     entrarían. El ref se escribe en el momento de la llamada. */
  const [isApplying, setIsApplying] = useState(false);
  const aplicando = useRef(false);

  /** El motor probabilístico no aplica nada: sus hallazgos no se aceptan. */
  const aceptaDeIA = (item: AuditItem) => item.category !== 'ai';

  /** Aplica la corrección de un hallazgo objetivo. `false` = el texto original
   *  sigue intacto y el hallazgo sigue en la lista. */
  const aplicar = useCallback(
    async (item: AuditItem): Promise<boolean> => {
      /* EL GUARD DE LA CAPA QUE ESCRIBE. Es el único punto por donde sale una
         escritura al documento, y es donde tiene que vivir la invariante de
         D6: un hallazgo de solo lectura (la portada) se informa y no se
         aplica. Arriba ya la respetan la agrupación y `FindingDetail`, pero
         esas dos no escriben. Hoy esto no es alcanzable por dos coincidencias
         —el subtipo de los kinds de portada cae en `otro`, cuya acción es
         `mark`, y la agrupación exige `every(readOnly)` para no aceptar— y
         cualquiera de las dos se rompe con una fila nueva en
         `PROOFREAD_SPECS`. `AGENTS.md` §1 dice que la portada original no se
         muta; esta línea lo garantiza sin depender de esas coincidencias. */
      if (item.readOnly) return false;
      if (!aceptaDeIA(item) || !doc || !item.element_id) return false;
      try {
        if (item.suggestedText) {
          await updateElementText(item.element_id, item.suggestedText);
        } else if (item.subtype === 'texto_pegado') {
          // Corrección mecánica local: evitar llamada a red síncrona / LLM
          const normalizado = (item.originalText || '').replace(/[ \t]{2,}/g, ' ');
          await updateElementText(item.element_id, normalizado);
        } else {
          const reescrito = await api.rewriteText(
            doc.session_id,
            item.element_id,
            item.originalText,
            'Reescribir en voz formal impersonal académica según APA 7, eliminando rigidez y muletillas',
          );
          if (!reescrito) {
            showToast('No se pudo generar la corrección. El texto original se conserva.', 'error');
            return false;
          }
          await updateElementText(item.element_id, reescrito);
        }
        /* El hallazgo aplicado sale de la lista por el mismo canal que un
           descarte: el store. Un `useState` local habría dejado al rail
           contando un hallazgo que la pantalla ya resolvió. */
        dismissFinding(item.id);
        setSelectedId((prev) => (prev === item.id ? null : prev));
        showToast('Corrección aplicada al documento', 'success');
        return true;
      } catch {
        showToast('Error al aplicar la sugerencia', 'error');
        return false;
      }
    },
    [doc, updateElementText, dismissFinding, setSelectedId, showToast],
  );

  /** El cerrojo, envuelto. Toda escritura al documento pasa por acá: aceptar
   *  uno y aceptar todos son la MISMA escritura, y compartieran cerrojo. */
  const conCerrojo = useCallback(
    async (cuerpo: () => Promise<void>): Promise<void> => {
      if (aplicando.current) return;
      aplicando.current = true;
      setIsApplying(true);
      try {
        await cuerpo();
      } finally {
        aplicando.current = false;
        setIsApplying(false);
      }
    },
    [],
  );

  const acceptOne = useCallback(
    async (item: AuditItem) => {
      if (!aceptaDeIA(item)) {
        showToast('El detector de IA propone, no aplica: márcalo para revisión manual.');
        return;
      }
      await conCerrojo(async () => {
        await aplicar(item);
      });
    },
    [aplicar, conCerrojo, showToast],
  );

  const acceptMany = useCallback(
    async (lista: AuditItem[]) => {
      /* El lote solo acepta lo que la tabla declara `accept`. El filtro de
         categoría no basta: dentro de un mismo motor objetivo conviven subtipos
         `accept` (primera persona, verbo Bloom) y `mark` (voz pasiva, palabra
         repetida), y `aplicar` habría escrito prosa generada en el documento
         para los segundos. La comprobación se repite acá —y no solo en quien
         arma la lista— porque esta es la capa que escribe. */
      const targets = lista.filter((i) => i.element_id && aceptaDeIA(i) && accionDeItem(i) === 'accept');
      if (!targets.length) return;
      await conCerrojo(async () => {
        let ok = 0;
        for (const it of targets) {
          if (await aplicar(it)) ok += 1;
        }
        if (ok > 0) showToast(`${ok} corrección(es) aplicada(s)`, 'success');
        else showToast('No se pudieron aplicar las correcciones', 'error');
      });
    },
    [aplicar, conCerrojo, showToast, accionDeItem],
  );

  const markMany = useCallback(
    (lista: AuditItem[]) => {
      if (!lista.length) return;
      setMarkedIds((prev) => [...new Set([...prev, ...lista.map((i) => i.id)])]);
      showToast(
        lista.length === 1
          ? 'Marcado para revisar. El texto original no se modifica.'
          : `${lista.length} hallazgos marcados para revisar. El texto original no se modifica.`,
        'info',
      );
    },
    [setMarkedIds, showToast],
  );

  const markForReview = useCallback((item: AuditItem) => markMany([item]), [markMany]);

  /** Una acción, sobre los ítems que esa acción cubre. */
  const despachar = useCallback(
    async (action: SubtypeAction, objetivos: AuditItem[]) => {
      switch (action) {
        case 'accept':
          await acceptMany(objetivos);
          return;
        case 'mark':
          markMany(objetivos);
          return;
        case 'resolveGhosts':
          await autoResolveGhosts();
          return;
        case 'autoCaption':
          await autoCaptionAll();
          return;
        case 'none':
          // Sin corrección objetiva no hay nada que ejecutar: se dice, para que
          // el silencio no se lea como "se aplicó y no pasó nada".
          showToast('Este hallazgo no tiene corrección automática: revísalo o descártalo.', 'info');
          return;
      }
    },
    [acceptMany, markMany, autoResolveGhosts, autoCaptionAll, showToast],
  );

  /**
   * La vista NO ejecuta acciones: pregunta. Este hook es la única autoridad
   * sobre qué acción tiene un grupo (su `action`/`massAction`) y sobre cómo se
   * ejecuta, así que la vista no tiene que volver al store para resolver
   * citas fantasma ni rotular figuras, ni adiviar qué hacer con 'none'.
   * Acepta un `EngineGroup` (cabecera de motor) o un `SubtypeGroup` (fila).
   *
   * LA REGLA, en una línea: **la cabecera de un motor actúa solo sobre los
   * subtipos que comparten su acción.** Un subtipo que discrepa no se toca.
   *
   * Sin esa regla, el botón "Aceptar todas" de Redacción & Bloom se llevaba
   * también `palabra_repetida`, `pronombre_ambiguo`, `voz_pasiva`,
   * `oracion_larga`, `idea_incompleta` y el fallback `otro`: subtipos a los que
   * el propio hook les asignó 'mark' porque el motor los detecta con certeza
   * pero no sabe corregirlos. `aplicar` los habría mandado a
   * `api.rewriteText` y escrito prosa generada en el documento del usuario,
   * una llamada de red por hallazgo. Lo mismo con un motor cuyas acciones son
   * de documento (`resolveGhosts`, `autoCaption`): no disparan si ningún
   * subtipo comparte su acción, así que un grupo de citas que solo tenga
   * referencias huérfanas ('none') no resuelve nada.
   *
   * Y lo que NO puede garantizar esta función: `autoResolveGhosts` y
   * `autoCaptionAll` son del store y trabajan sobre todo el documento. Hoy su
   * alcance coincide exactamente con los subtipos que las piden (todas las
   * fantasmas son 'cita_fantasma'; todas las figuras/tablas, 'autoCaption'),
   * así que el filtro de subtipos basta. Si algún día un motor marcara una
   * de esas clases como 'mark', la garantía tendría que bajar al store.
   */
  const runGroupAction = useCallback(
    async (group: EngineGroup | SubtypeGroup) => {
      /* La presencia de una PROPIEDAD, no su ausencia: un discriminante de
         unión escrito al revés (`!'massAction' in group`) no lo cubre `tsc` en
         ninguna forma —agregar una propiedad opcional nueva al tipo lo rompe en
         silencio—, y un `EngineGroup` sin `massAction` sería un tipo
         imposible. `groups` es la propiedad que hace único al motor. */
      if (!('groups' in group)) {
        // Fila de subtipo: su propia acción sobre sus propios ítems, sin más.
        await despachar(group.action, group.items);
        return;
      }
      const deAcuerdo = group.groups.filter((g) => g.action === group.massAction);
      if (!deAcuerdo.length) {
        // El rótulo promete una acción en bloque y no hay ninguna: se dice, para
        // que el silencio no se lea como "se aplicó y no pasó nada".
        showToast(
          'Este motor no tiene nada que aplicar en bloque: revisa sus hallazgos uno por uno.',
          'info',
        );
        return;
      }
      await despachar(group.massAction, deAcuerdo.flatMap((g) => g.items));
    },
    [despachar, showToast],
  );

  /* DESCARTAR tiene que salir por los DOS canales, y no solo por el de esta
     vista. AGENTS.md §2: un hallazgo se anuncia en el subrayado inline y en la
     burbuja del gutter, y se descarta en los dos a la vez — el canal del lienzo
     es `dismissComment(elementId)` del store, que es lo que leen `ReadingText`
     y `WhatsAppComment`. Descartar solo en la lista sacaba el hallazgo del
     workbench y dejaba la burbuja y su subrayado pegados a la página: la misma
     contradicción, al revés. Un hallazgo sin elemento (una referencia huérfana
     vive en la bibliografía) no tiene a qué anclarse en el lienzo, y por eso no
     hay nada que descartar ahí. */
  const dismiss = useCallback(
    (item: AuditItem) => {
      dismissFinding(item.id);
      setSelectedId((prev) => (prev === item.id ? null : prev));
      if (item.element_id) dismissComment(item.element_id);
      showToast('Alerta descartada. Texto original conservado.', 'info');
    },
    [dismissComment, dismissFinding, setSelectedId, showToast],
  );

  return { acceptOne, acceptMany, markForReview, runGroupAction, dismiss, isApplying };
}

export default useReviewActions;
