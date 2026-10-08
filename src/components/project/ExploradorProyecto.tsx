import React, { useRef, useEffect, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { parseDocumentVersion } from '../../lib/projectUtils';
import { crearProyecto } from '../../lib/proyecto';
import { Folder, FileText, Image as ImageIcon, Plus, ExternalLink, X, Check, Layers } from 'lucide-react';
import { EstadoVacio } from '../shared/EstadoVacio';

/** La carpeta de un archivo, si el archivo la trae.
 *
 *  En Electron, `file.path` es la ruta completa y la carpeta es su directorio.
 *  En el navegador no hay `.path`, y devolver `null` es lo honesto: el backend
 *  no puede releer una carpeta que no conoce. */
function directorioDeArchivo(file: File): string | null {
  const ruta = (file as File & { path?: string }).path;
  if (!ruta) return null;
  const i = Math.max(ruta.lastIndexOf('\\'), ruta.lastIndexOf('/'));
  return i > 0 ? ruta.slice(0, i) : null;
}

interface ExploradorProyectoProps {
  /** Apertura del modal de combinación. Opcional: la pantalla que lo monta
   *  puede no ofrecerlo, y el botón "Combinar" simplemente no se dibuja. */
  onOpenMerge?: () => void;
}

/**
 * Explorador de proyecto — panel embebido, NO modal.
 *
 * Antes era `ProjectFolderModal`: una ventana externa con overlay que se
 * montaba encima de lo que hubiera. La decisión de producto (2026-10) fue
 * unificar la superficie de proyecto: el rail tiene UN destino (la pantalla de
 * proyectos) y el explorador vive adentro, centrado, junto a proyectos y
 * versiones. Una ventana externa para un contenido que ya tiene su lugar es un
 * segundo camino al mismo dato.
 *
 * Este componente es contenido puro: no decide si está visible ni cuándo
 * cerrarse. Eso lo resuelve la pantalla que lo monta.
 *
 * Presentación: una tarjeta con borde de 1px y SIN sombra. Declarar elevación
 * con borde y con sombra a la vez es la "ghost card": dos sistemas de
 * profundidad compitiendo por el mismo borde. Acá manda el borde —el resto de
 * la app es tonalmente plana— y la sombra se retiró.
 */
export const ExploradorProyecto: React.FC<ExploradorProyectoProps> = ({ onOpenMerge }) => {
  const {
    tabs,
    activeTabIndex,
    switchToTab,
    removeTab,
    uploadFile,
    isLoading,
    proyecto,
    cargarProyectos,
    projectImages,
    addProjectImage,
    activeFilePath,
    showToast,
    sincronizarProyectoActual,
  } = useDocStore();

  const fileDocxRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  /* Al montar se leen los proyectos del backend, para que la lista que se
     ofrece sea la de verdad y no solo lo que esta pestaña recuerda de
     indexedDB. Sin esto, `api.listarProyectos` no la llamaría nadie: una
     función escrita, probada en Python, y que el frontend no usa. */
  useEffect(() => {
    void cargarProyectos();
  }, [cargarProyectos]);

  /* EL NOMBRE DEL PROYECTO.
   *
   * Antes: `activeParsed?.projectName || 'Proyecto APA 7'`. O sea, el nombre de
   * un trabajo salía del nombre del archivo de la pestaña activa, y cuando no
   * había pestaña la pantalla decía, con todas las letras, "Proyecto APA 7".
   * Un nombre inventado en pantalla es peor que no tener chrome: la persona lo
   * lee y razona sobre un trabajo que no existe.
   *
   * Ahora el nombre viene de `store.proyecto`, que es persistido. Sin proyecto
   * NO HAY título: el bloque entero se sale del render. No se muestra un
   * nombre de reserva, porque cualquier nombre de reserva es mentira, y la
   * mentira más cara es la que se lee como cierta.
   *
   * Y `parseDocumentVersion` sigue usándose ABAJO, para la ETIQUETA DE VERSIÓN
   * de cada documento de la lista: eso es un dato del archivo, y como dato del
   * archivo es correcto. Lo que no puede ser un dato del archivo es el nombre
   * del proyecto. */
  const nombreProyecto = proyecto?.nombre ?? null;

  /* El vacío TOTAL —ni documentos ni imágenes— es un estado propio, no dos
     cajas punteadas apiladas. Dos cupos en blanco ("Todavía no hay documentos"
     y "No hay imágenes") leen como si faltara llenar formularios; un estado
     vacío guiado dice la causa y ofrece la salida en el lugar donde se mira. */
  const vacioTotal = tabs.length === 0 && projectImages.length === 0;

  const handleSelectFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const docxFiles = files.filter((f) => f.name.toLowerCase().endsWith('.docx'));
    const imgFiles = files.filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f.name));

    // Cargar imágenes detectadas en la carpeta
    /* `addProjectImage` es `async`: sube a disco. El `await` en serie es lo
       correcto acá y no una pena: el Explorador ya subía los `.docx` uno por
       uno, y estas son archivos chicos contra un documento completo. */
    for (const img of imgFiles) {
      await addProjectImage(img);
    }

    if (docxFiles.length > 0) {
      /* UNA CARPETA ES UNA OPERACIÓN, NO VEINTE.
       *
       * Antes esto subía un `.docx` por archivo, en serie, cada uno con su
       * auditoría completa y su `isLoading`: veinte capítulos eran veinte
       * pantallas de carga seguidas. Con la entidad del backend, "vincular una
       * carpeta" es UNA llamada a sync: el backend relee el disco y devuelve
       * qué encontró.
       *
       * Y el progreso va por `loadingQue`, que el overlay de carga ya sabe
       * mostrar a través de su prop `que`. Un spinner mudo obliga a adivinar,
       * y adivinar mientras se espera es la peor manera de esperar.
       *
       * Si todavía no hay proyecto, se crea con el nombre del primer archivo y
       * la carpeta si el archivo la trae (Electron sí, navegador no). Sin
       * proyecto no hay contra qué sincronizar. */
      let proyecto = useDocStore.getState().proyecto;
      if (!proyecto) {
        const raiz = directorioDeArchivo(docxFiles[0]);
        await useDocStore.getState().setProyecto(
          crearProyecto({
            nombre: parseDocumentVersion(docxFiles[0].name).projectName,
            raiz,
          }),
        );
        proyecto = useDocStore.getState().proyecto;
      }
      if (proyecto) {
        useDocStore.setState({ loadingQue: `Sincronizando carpeta: ${docxFiles.length} documentos...` });
        const hallados = await sincronizarProyectoActual();
        useDocStore.setState({ loadingQue: null });
        showToast(
          `Carpeta vinculada: ${hallados?.length ?? 0} docx y ${imgFiles.length} imágenes`,
          'success',
        );
      }
    } else {
      showToast(`Carpeta escaneada: ${imgFiles.length} imágenes añadidas`, 'info');
    }

    e.target.value = '';
  };

  const handleAddDocx = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
      showToast(`Documento "${file.name}" agregado al proyecto`, 'success');
      e.target.value = '';
    }
  };

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      await addProjectImage(f);
    }
    if (files.length > 0) {
      showToast(`${files.length} imagen(es) agregada(s) al proyecto`, 'success');
    }
    e.target.value = '';
  };

  return (
    <section
      aria-label="Explorador de proyecto"
      style={{
        width: '100%',
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Encabezado */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          backgroundColor: 'var(--surface-subtle)',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Folder size={17} strokeWidth="var(--icon-stroke)" />
        </div>
        {/* El título del proyecto NO tiene bloque vacío a su lado: sin proyecto
            no hay nombre, y un `div` de 14px reservado para un texto que no
            existe empuja el contenido y deja el hueco como si algo faltara.
            Faltaba algo: falta el proyecto. */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {nombreProyecto && (
            <div
              data-testid="proyecto-titulo"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreProyecto}</span>
            </div>
          )}
          {/* LA RUTA Y EL BOTÓN NO DEPENDEN DEL NOMBRE. La fila vivía dentro
              del bloque del título, o sea que el "Abrir carpeta" —el único
              botón de esta pantalla que hace algo con el disco— era
              inalcanzable sin proyecto. Y `activeFilePath` se establece al
              SUBIR un archivo, que no abre ningún proyecto. Un botón que
              depende de un dato que su propio camino no escribe es un botón
              muerto, y hay que meter el botón y su dato al mismo nivel para que
              se pueda ver que existen juntos. */}
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            {activeFilePath ? (
              <>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {activeFilePath}
                </span>
                {(window as any).electronAPI?.showItemInFolder && (
                  <button
                    type="button"
                    onClick={() => (window as any).electronAPI.showItemInFolder(activeFilePath)}
                    title="Abrir ubicación en el Explorador de Windows"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      padding: '1px 4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={11} strokeWidth="var(--icon-stroke)" /> Abrir carpeta
                  </button>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>Carpeta de trabajo y recursos del proyecto</span>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {vacioTotal ? (
          <EstadoVacio
            motivo="proyecto-vacio"
            accion={
              /* Las dos acciones usan el botón COMPARTIDO (.btn): hover,
                 active, focus y disabled ya están definidos una sola vez en el
                 sistema para todas las superficies. Escribirlos a mano acá
                 creaba una copia que no tenía ninguno de esos estados. */
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <Folder />
                  <span>Vincular carpeta...</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-md"
                  onClick={() => fileDocxRef.current?.click()}
                  disabled={isLoading}
                >
                  <Plus />
                  <span>Agregar .docx</span>
                </button>
              </div>
            }
          />
        ) : (
          <>
        {/* Sección de Documentos */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Documentos ({tabs.length})
            </span>
            <button
              type="button"
              onClick={() => fileDocxRef.current?.click()}
              disabled={isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: isLoading ? 'var(--text-muted)' : 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: isLoading ? 'default' : 'pointer',
              }}
            >
              <Plus size={13} strokeWidth="var(--icon-stroke)" />
              <span>Agregar .docx</span>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tabs.length === 0 && (
              <div
                style={{
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                  border: '1px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                }}
              >
                Todavía no hay documentos. Agregá un .docx o vinculá una carpeta completa.
              </div>
            )}
            {tabs.map((tab, idx) => {
              const isActive = idx === activeTabIndex;
              const parsed = parseDocumentVersion(tab.file_name);
              return (
                <FilaDocumento
                  key={tab.session_id}
                  nombre={tab.file_name}
                  versionLabel={parsed.versionLabel}
                  isActive={isActive}
                  puedeCerrar={tabs.length > 1}
                  onSelect={() => switchToTab(idx)}
                  onRemove={() => removeTab(idx)}
                />
              );
            })}
          </div>
        </div>

        {/* Sección de Recursos e Imágenes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Imágenes ({projectImages.length})
            </span>
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={13} strokeWidth="var(--icon-stroke)" />
              <span>Subir imágenes</span>
            </button>
          </div>

          {projectImages.length === 0 ? (
            <div
              style={{
                padding: 'var(--space-4)',
                textAlign: 'center',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
              }}
            >
              No hay imágenes registradas aún. Podés subir figuras o vincular una carpeta completa.
            </div>
          ) : (
            /* `slice(0, 8)` sin "ver más" era un recorte invisible: las
               imágenes de la novena en adelante existían en el store, no se
               veían, y nadie decía cuántas faltaban. Ahora se ven TODAS: una
               imagen en el store que no se ve es un recurso que la persona no
               sabe que tiene. */
            <div data-testid="galeria-imagenes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 'var(--space-2)' }}>
              {projectImages.map((img) => (
                <div
                  key={img.id}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--surface-subtle)',
                  }}
                  title={img.name}
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    /* `contain` y NO `cover`: sobre un logo vertical, `cover`
                       lo recorta a una banda y lo que se ve no es el logo. Es
                       el mismo defecto de la miniatura de la portada, y con
                       el logo de la UNI se nota a simple vista. */
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Pie con acciones de carpeta. Cuando no hay nada, el estado vacío ya
          trae la acción primaria y este pie solo la repetiría 20px más abajo. */}
      {!vacioTotal && (
      <div
        style={{
          padding: 'var(--space-3) var(--space-5)',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--surface-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--surface-elevated)',
            color: 'var(--text-main)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Folder size={13} strokeWidth="var(--icon-stroke)" />
          <span>Vincular carpeta...</span>
        </button>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {tabs.length > 1 && onOpenMerge && (
            <button
              type="button"
              onClick={onOpenMerge}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--surface-elevated)',
                color: 'var(--text-main)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Layers size={13} strokeWidth="var(--icon-stroke)" />
              <span>Combinar</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* Inputs ocultos */}
      <input
        ref={fileDocxRef}
        type="file"
        accept=".docx"
        style={{ display: 'none' }}
        onChange={handleAddDocx}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error atributo no estandar webkitdirectory fuera de los tipos de React
        webkitdirectory="true"
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleSelectFolder}
      />
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleAddImages}
      />
    </section>
  );
};

interface FilaDocumentoProps {
  nombre: string;
  versionLabel: string;
  isActive: boolean;
  puedeCerrar: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

/** Fila de documento. El estado activo se marca con acento, la fila no activa
 *  con un hover suave: en una lista densa, el hover es lo que dice "esto se
 *  puede tocar" antes de tocarlo. */
const FilaDocumento: React.FC<FilaDocumentoProps> = ({ nombre, versionLabel, isActive, puedeCerrar, onSelect, onRemove }) => {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        backgroundColor: isActive ? 'var(--color-accent-soft)' : hover ? 'var(--surface-elevated)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, flex: 1 }}>
        <FileText size={15} strokeWidth="var(--icon-stroke)" color={isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: isActive ? 700 : 500,
            color: 'var(--text-main)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nombre}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
            color: isActive ? 'var(--color-text-on-accent)' : 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >
          {versionLabel}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {isActive && (
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Check size={12} strokeWidth="var(--icon-stroke)" /> Activo
          </span>
        )}
        {puedeCerrar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
            title="Cerrar versión"
          >
            <X size={12} strokeWidth="var(--icon-stroke)" />
          </button>
        )}
      </div>
    </div>
  );
};
