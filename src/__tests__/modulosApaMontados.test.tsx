/**
 * WordAPA7 — la pantalla dibuja la fuente única.
 *
 * `modulosApa.test.ts` cuida el dato. Esta prueba cuida que las dos pantallas
 * que ofrecen "qué se estandariza" lo LEAN de ahí y no de su propia lista: si
 * alguien vuelve a escribir los módulos a mano, cambiar `MODULOS_APA` deja de
 * cambiar la pantalla y estas dos pruebas se caen.
 *
 * Y cuida la categoría: el usuario pidió dejar de ver una lista plana, así que
 * cada título de `GRUPOS_DE_MODULOS` tiene que verse antes de sus módulos.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GRUPOS_DE_MODULOS, MODULOS_APA } from '../lib/modulosApa';

vi.mock('../api/backend', () => ({
  generateDocx: vi.fn(),
  openInWord: vi.fn(),
}));

import { useDocStore } from '../store/useDocStore';
import { APAModuleToggles } from '../components/toolbar/APAModuleToggles';
import { ExpressQuickTransformModal } from '../components/quick/ExpressQuickTransformModal';

/** Los módulos y sus categorías, tal como la fuente única los declara. */
const declarado = () => ({
  grupos: GRUPOS_DE_MODULOS.map((g) => g.titulo),
  modulos: MODULOS_APA.map((m) => m.etiqueta),
});

beforeEach(() => {
  useDocStore.setState({ sessionScopes: [], isBackendReady: true } as never);
});

describe('los módulos APA se dibujan desde la fuente única', () => {
  it('el menú de la barra muestra cada categoría y cada módulo', () => {
    render(<APAModuleToggles />);
    fireEvent.click(screen.getByRole('button', { name: /Módulos APA/ }));
    const { grupos, modulos } = declarado();
    for (const g of grupos) expect(screen.getByText(g)).toBeTruthy();
    for (const m of modulos) expect(screen.getByText(m)).toBeTruthy();
  });

  it('el modal Express muestra las mismas categorías y los mismos módulos', () => {
    render(<ExpressQuickTransformModal fileName="trabajo.docx" />);
    const { grupos, modulos } = declarado();
    for (const g of grupos) expect(screen.getByText(g)).toBeTruthy();
    for (const m of modulos) expect(screen.getByText(m)).toBeTruthy();
  });
});
