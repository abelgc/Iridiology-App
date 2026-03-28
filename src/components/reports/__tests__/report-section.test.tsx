import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReportSection } from '../report-section'

describe('ReportSection', () => {
  const mockSection = 'section_1_terreno_general'
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

    expect(screen.getByText('Terreno General')).toBeInTheDocument()
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
})
