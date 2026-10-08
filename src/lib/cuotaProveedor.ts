// Formatea la cuota del proveedor para la pestana Conexion. Nunca inventa un
// numero: si el proveedor no declara cuota, dice "sin dato".
export function formatearCuota(
  usado: number | null,
  cupo: number | null,
  restante: number | null,
): string {
  if (cupo === null || usado === null || restante === null) {
    return 'sin dato de cuota';
  }
  return `${usado}/${cupo} hoy · restante: ${restante}`;
}
