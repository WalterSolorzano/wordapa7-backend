import { describe, it, expect } from 'vitest';
import { sanitizeToPlainText, splitTextAt, extractPlainText } from '../lib/inlineEdit';

describe('inlineEdit — sanitización', () => {
  it('quita tags y decodifica entidades', () => {
    expect(sanitizeToPlainText('<b>hola</b> <i>mundo</i>')).toBe('hola mundo');
    expect(sanitizeToPlainText('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
  });
  it('br y /div → salto de línea', () => {
    expect(sanitizeToPlainText('uno<br>dos')).toBe('uno\ndos');
    expect(sanitizeToPlainText('uno<div>dos</div>')).toBe('uno\ndos');
  });
  it('texto plano pasa igual', () => {
    expect(sanitizeToPlainText('texto plano')).toBe('texto plano');
  });
});

describe('inlineEdit — splitTextAt', () => {
  it('divide en el offset', () => {
    expect(splitTextAt('ABCDEF', 3)).toEqual({ before: 'ABC', after: 'DEF' });
  });
  it('offset 0 → todo after; offset len → todo before', () => {
    expect(splitTextAt('ABC', 0)).toEqual({ before: '', after: 'ABC' });
    expect(splitTextAt('ABC', 3)).toEqual({ before: 'ABC', after: '' });
  });
  it('offset fuera de rango → clamp', () => {
    expect(splitTextAt('ABC', 99)).toEqual({ before: 'ABC', after: '' });
    expect(splitTextAt('ABC', -5)).toEqual({ before: '', after: 'ABC' });
  });
});

describe('inlineEdit — extractPlainText', () => {
  it('textContent de un nodo', () => {
    const el = document.createElement('div');
    el.innerHTML = '<b>hola</b> mundo';
    expect(extractPlainText(el)).toBe('hola mundo');
  });
});
