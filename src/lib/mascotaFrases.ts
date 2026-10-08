/* WordAPA7 — voz de la mascota en las dos salas y el resto de la app.
   Determinista por seed (nada de Math.random): la misma sección dice la misma
   frase entre renders, y por eso es testeable. Sin emojis (AGENTS.md §1).
   Reexporta la biblioteca modularizada de src/lib/mascotaFrases/ */

export * from './mascotaFrases/index';
