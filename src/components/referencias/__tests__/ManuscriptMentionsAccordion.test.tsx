import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManuscriptMentionsAccordion } from '../ManuscriptMentionsAccordion';

describe('ManuscriptMentionsAccordion', () => {
  const sampleCitations = [
    {
      page: 3,
      p: 'Párrafo 2',
      text: 'En consonancia con las tendencias recientes, la incorporación de asistentes generativos ha demostrado alterar significativamente la secuencialidad cognitiva durante la redacción académica (García-Mendoza et al., 2023), especialmente en aquellas etapas tempranas.',
    },
    {
      page: 7,
      p: 'Párrafo 4',
      text: 'Tal como documentan García-Mendoza et al. (2023), la recurrencia de errores sintácticos se reduce un 38%.',
    },
  ];

  it('renders trigger with title, citation count badge and toggles accordion body', () => {
    render(<ManuscriptMentionsAccordion citations={sampleCitations} />);

    expect(screen.getByText(/Aparición en el Manuscrito/i)).toBeInTheDocument();
    expect(screen.getByText(/2 citas registradas/i)).toBeInTheDocument();

    // Initially open
    expect(screen.getByText(/Página 3 • Párrafo 2/i)).toBeInTheDocument();

    // Toggle close
    const trigger = screen.getByRole('button', { name: /Aparición en el Manuscrito/i });
    fireEvent.click(trigger);

    // Collapsed: content should no longer be visible or should be hidden
    expect(screen.queryByText(/Página 3 • Párrafo 2/i)).not.toBeInTheDocument();

    // Toggle open again
    fireEvent.click(trigger);
    expect(screen.getByText(/Página 3 • Párrafo 2/i)).toBeInTheDocument();
  });

  it('renders prominent editorial quote marks and in-text citation highlights', () => {
    const { container } = render(<ManuscriptMentionsAccordion citations={sampleCitations} />);

    // Prominent quote marks
    const quoteMarks = screen.getAllByTestId('quote-mark');
    expect(quoteMarks.length).toBe(2);
    expect(quoteMarks[0].textContent).toBe('“');

    // In-text citation highlights
    const highlights = screen.getAllByTestId('citation-highlight');
    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[0].textContent).toContain('García-Mendoza');
  });

  it('fires onJumpToWord callback when clicking jump to word button', () => {
    const handleJump = vi.fn();
    render(
      <ManuscriptMentionsAccordion
        citations={sampleCitations}
        onJumpToWord={handleJump}
      />
    );

    const jumpButtons = screen.getAllByRole('button', { name: /Saltar al párrafo en Word/i });
    expect(jumpButtons.length).toBe(2);

    fireEvent.click(jumpButtons[0]);
    expect(handleJump).toHaveBeenCalledTimes(1);
    expect(handleJump).toHaveBeenCalledWith(3, 'Párrafo 2');

    fireEvent.click(jumpButtons[1]);
    expect(handleJump).toHaveBeenCalledTimes(2);
    expect(handleJump).toHaveBeenCalledWith(7, 'Párrafo 4');
  });

  it('renders orphan state fallback when citations array is empty and triggers onCopyCitation', () => {
    const handleCopy = vi.fn();
    render(
      <ManuscriptMentionsAccordion
        citations={[]}
        onCopyCitation={handleCopy}
      />
    );

    // Badge indicates 0 citations
    expect(screen.getByText(/0 citas/i)).toBeInTheDocument();

    // Orphan fallback card
    expect(screen.getByText(/Esta obra no está citada en el cuerpo del trabajo/i)).toBeInTheDocument();
    expect(screen.getByText(/Aparece en la bibliografía final pero ningún párrafo/i)).toBeInTheDocument();

    // Copy action button
    const copyButton = screen.getByRole('button', { name: /Copiar cita/i });
    fireEvent.click(copyButton);
    expect(handleCopy).toHaveBeenCalledTimes(1);
  });

  it('contains zero emojis in the rendered markup', () => {
    const { container } = render(
      <ManuscriptMentionsAccordion
        citations={sampleCitations}
      />
    );

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });
});
