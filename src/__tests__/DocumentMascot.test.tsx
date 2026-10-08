import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { DocumentMascot, getMascotExpression } from '../components/layout/DocumentMascot';
import { useDocStore } from '../store/useDocStore';

let origState: any;

beforeEach(() => {
  origState = useDocStore.getState();
});

afterEach(() => {
  useDocStore.setState(origState as any);
});

describe('getMascotExpression', () => {
  it('returns neutral when there is no document', () => {
    useDocStore.setState({ doc: null } as any);
    expect(getMascotExpression()).toBe('neutral');
  });

  it('returns excited for a clean document', () => {
    useDocStore.setState({
      doc: { session_id: 'x', elements: Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, type: 'paragraph', text: 'hola' })) } as any,
      citationAuditResult: null,
      validationIssues: [],
    } as any);
    expect(getMascotExpression()).toBe('excited');
  });

  it('returns curious with a few signals (1 ghost citation)', () => {
    useDocStore.setState({
      doc: { session_id: 'x', elements: [{ id: 'e1', type: 'paragraph', text: 'hola' }] } as any,
      citationAuditResult: { ghost_citations: [{ element_id: 'e1' }], orphan_references: [] },
      validationIssues: [],
    } as any);
    expect(getMascotExpression()).toBe('curious');
  });

  it('returns worried when there are many problems', () => {
    useDocStore.setState({
      doc: { session_id: 'x', elements: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, type: 'paragraph', text: 'hola', ai_score: 0.9 })) } as any,
      citationAuditResult: { ghost_citations: [{ element_id: 'e0' }], orphan_references: [{ id: 'r1' }] },
      validationIssues: [{ severity: 'error' }, { severity: 'error' }],
    } as any);
    expect(getMascotExpression()).toBe('worried');
  });
});

describe('DocumentMascot', () => {
  it('renders an SVG for each expression', () => {
    for (const expr of ['neutral', 'happy', 'excited', 'curious', 'worried'] as const) {
      const { container } = render(<DocumentMascot expression={expr} />);
      expect(container.querySelector('svg')).toBeTruthy();
    }
  });

  it('renders each member of the editorial family', () => {
    for (const kind of ['highlighter', 'ruler', 'reference', 'strike'] as const) {
      const { container } = render(<DocumentMascot kind={kind} />);
      expect(container.querySelector(`.editorial-mascot-kind-${kind}`)).toBeTruthy();
    }
  });
});
