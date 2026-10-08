/** FNV-1a: hash estable de string a índice. Sin azar, sin dependencias. */
export function indiceEstable(seed: string, largo: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, largo);
}
