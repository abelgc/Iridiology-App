import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportSection } from '../report-section'

describe('ReportSection', () => {
  const mockSection = 'section_1_general_terrain'
  const mockContent = 'This is a sample report content with some findings.'
  const mockOnEdit = vi.fn()

  it('renders the section label', () => {
    render(
      <ReportSection
        sectionKey={mockSection}
        content={mockContent}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('General Terrain')).toBeInTheDocument()
  })

  it('shows quality warning when content contains "Hallazgo limitado por calidad de imagen"', () => {
    const lowQualityContent = 'Some findings. Hallazgo limitado por calidad de imagen'

    render(
      <ReportSection
        sectionKey={mockSection}
        content={lowQualityContent}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('Low Quality')).toBeInTheDocument()
  })

  it('does NOT show quality warning for normal content', () => {
    render(
      <ReportSection
        sectionKey={mockSection}
        content={mockContent}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.queryByText('Low Quality')).not.toBeInTheDocument()
  })

  it('displays correction count when corrections exist', () => {
    render(
      <ReportSection
        sectionKey={mockSection}
        content={mockContent}
        correctionCount={3}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('3 corrections')).toBeInTheDocument()
  })

  it('displays singular "correction" when count is 1', () => {
    render(
      <ReportSection
        sectionKey={mockSection}
        content={mockContent}
        correctionCount={1}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('1 correction')).toBeInTheDocument()
  })

  it('renders the Edit button when not editing', () => {
    render(
      <ReportSection
        sectionKey={mockSection}
        content={mockContent}
        isEditing={false}
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('REGRESSION (comparison layout): each system is its own block and the em dash is not shown', () => {
    const content = [
      "Circulatory/Corneal Rim: dense pale-grey arcus at the outer iris margin has thinned markedly in current session — reduced peripheral cholesterol-lipid deposition, better circulatory clearance.",
      "Lymphatic-Eliminative: outer ciliary rim shows less grey-white haze than previously — peripheral lymphatic drainage improving.",
    ].join('\n')

    render(
      <ReportSection sectionKey="comp_1_improvements" content={content} onEdit={mockOnEdit} />
    )

    const circulatory = screen.getByText('Circulatory/Corneal Rim')
    const lymphatic = screen.getByText('Lymphatic-Eliminative')
    expect(circulatory).not.toBe(lymphatic)
    expect(circulatory.closest('p')?.textContent).not.toMatch(/Lymphatic-Eliminative/)
    expect(screen.getByText('Dense pale-grey arcus at the outer iris margin has thinned markedly in current session.')).toBeInTheDocument()
    expect(screen.getByText('Reduced peripheral cholesterol-lipid deposition, better circulatory clearance.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('—')
  })

  it('keeps a comparison line that has no em dash as a name plus one sentence', () => {
    render(
      <ReportSection
        sectionKey="comp_2_not_improved"
        content="Digestive: collarette displacement at 2 o'clock structurally unchanged since previous session."
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText('Digestive')).toBeInTheDocument()
    expect(screen.getByText('Collarette displacement at 2 o\'clock structurally unchanged since previous session.')).toBeInTheDocument()
  })

  it('leaves an em dash in a standard section untouched', () => {
    render(
      <ReportSection
        sectionKey="section_1_general_terrain"
        content="Fibre tone is stable — burden continues."
        onEdit={mockOnEdit}
      />
    )

    expect(screen.getByText(/Fibre tone is stable — burden continues\./)).toBeInTheDocument()
  })
})
