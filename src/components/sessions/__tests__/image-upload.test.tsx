import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeAll, afterAll } from 'vitest'
import { ImageUpload } from '../image-upload'

vi.mock('heic2any', () => ({
  default: vi.fn(async () => new Blob(['jpeg-bytes'], { type: 'image/jpeg' })),
}))

// jsdom has no real image decoding or canvas. Mock the browser APIs the
// component uses to compress images so the onChange pipeline can run.
class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 1000
  height = 1000
  naturalWidth = 1000
  naturalHeight = 1000
  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0)
  }
}

beforeAll(() => {
  vi.stubGlobal('Image', MockImage)
  URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext']
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,TESTBASE64')
})

afterAll(() => {
  vi.unstubAllGlobals()
})

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

    // The photo is not sent until the practitioner accepts the proposed crop.
    expect(mockChange).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }))

    await waitFor(() => {
      expect(mockChange).toHaveBeenCalled()
      const callArg = mockChange.mock.calls[0][0]
      expect(typeof callArg).toBe('string')
    })
  })

  it('shows the crop step instead of sending the photo straight away', async () => {
    const mockChange = vi.fn()
    const { container } = render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'Use crop' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use full photo' })).toBeInTheDocument()
    expect(mockChange).not.toHaveBeenCalled()
  })

  it('Cancel goes back to the drop zone without sending anything', async () => {
    const mockChange = vi.fn()
    const { container } = render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(mockChange).not.toHaveBeenCalled()
    expect(screen.getByText(/browse your photos|drag and drop your image here/i)).toBeInTheDocument()
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
    expect(mockChange).not.toHaveBeenCalled()
  })

  it('accepts a .heic file when the browser reports an empty MIME type', async () => {
    const mockChange = vi.fn()
    const { container } = render(<ImageUpload label="Test Image" value={null} onChange={mockChange} />)

    const file = new File(['heic-bytes'], 'iris.heic', { type: '' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }))

    await waitFor(() => {
      expect(mockChange).toHaveBeenCalledWith('TESTBASE64')
    })
    expect(screen.queryByText('Please select an image file')).not.toBeInTheDocument()
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
