import { useEffect, useState } from 'react';

/**
 * Ancho de la ventana, reactivo.
 *
 * Patrón extraído de `ReviewWorkbench` (la única otra pantalla de tres columnas
 * que se adapta al ancho): el estado se inicializa con el ancho real de la
 * ventana y un listener de `resize` lo mantiene al día. No se usa
 * `matchMedia`: acá se necesitan umbrales numéricos, no una media query.
 */
export const useWindowWidth = (): number => {
  const [ancho, setAncho] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setAncho(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return ancho;
};

export default useWindowWidth;
