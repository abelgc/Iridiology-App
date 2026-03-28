import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { ImageUpload } from '../image-upload'

describe('ImageUpload', () => {
  it('renders the label', () => {
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    expect(screen.getByText('Test Image')).toBeInTheDocument()
  })

  it('shows required indicator when required prop is true', () => {
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={null} onChange={mockChange} required={true} />)

    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows error when required and no image selected', () => {
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={null} onChange={mockChange} required={true} />)

    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('triggers onChange with base64 string when file is selected', async () => {
    const mockChange = vi.fn()
    const { container } = render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(mockChange).toHaveBeenCalled()
      const callArg = mockChange.mock.calls[0][0]
      expect(typeof callArg).toBe('string')
    })
  })

  it('shows error when non-image file is selected', async () => {
    const mockChange = vi.fn()
    const { container } = render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Please select an image file')).toBeInTheDocument()
    })
  })

  it('displays preview when image is selected', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={base64} onChange={mockChange} />)

    const img = screen.getByAltText('Preview')
    expect(img).toBeInTheDocument()
  })

  it('shows Remove button when image is selected', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={base64} onChange={mockChange} />)

    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('calls onChange with null when Remove button is clicked', () => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockChange = vi.fn()
    render(<ImageUpload label="Test Image" value={base64} onChange={mockChange} />)

    fireEvent.click(screen.getByText('Remove'))

    expect(mockChange).toHaveBeenCalledWith(null)
  })
})
