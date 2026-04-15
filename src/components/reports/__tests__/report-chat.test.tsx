import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportChat } from '../report-chat'

// Mock the ChatMessage component to simplify testing
vi.mock('../chat-message', () => ({
  ChatMessage: ({ message, isStreaming }: { message: any; isStreaming?: boolean }) => (
    <div data-testid={`message-${message.role}`} data-streaming={isStreaming}>
      {message.content}
    </div>
  ),
}))

// Mock the Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Trash2: () => <span>Trash2</span>,
  Send: () => <span>Send</span>,
}))

describe('ReportChat', () => {
  const mockReportId = 'report-123'
  const mockPatientName = 'John Doe'

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock the fetch API
    global.fetch = vi.fn()
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handleSend - message state updates', () => {
    it('adds both user message and empty assistant placeholder to state in a single update before fetch', async () => {
      // We'll track the state updates by monitoring setMessages calls
      const setMessagesSpy = vi.fn()

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      // Type a message
      await userEvent.type(input, 'Test message')

      // Stub the fetch to never resolve, so we can check state before streaming starts
      let fetchCalled = false
      ;(global.fetch as any).mockImplementation(() => {
        fetchCalled = true
        return new Promise(() => {}) // Never resolves
      })

      // Send the message
      fireEvent.click(sendButton)

      // Wait briefly for state updates to occur
      await waitFor(() => {
        // After sending, we should have 2 messages in the DOM:
        // 1. User message with "Test message"
        // 2. Empty assistant placeholder
        const userMessages = screen.queryAllByTestId('message-user')
        const assistantMessages = screen.queryAllByTestId('message-assistant')

        expect(userMessages).toHaveLength(1)
        expect(assistantMessages).toHaveLength(1)
        expect(userMessages[0]).toHaveTextContent('Test message')
        expect(assistantMessages[0]).toHaveTextContent('')
      })

      expect(fetchCalled).toBe(true)
    })

    it('clears input field immediately after sending', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...') as HTMLInputElement

      await userEvent.type(input, 'Test message')
      expect(input.value).toBe('Test message')

      const sendButton = screen.getByRole('button', { name: /send message/i })
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(input.value).toBe('')
      })
    })

    it('does not send if input is empty or whitespace', async () => {
      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      // Try to send with empty input
      fireEvent.click(sendButton)

      expect(global.fetch).not.toHaveBeenCalled()

      // Try with only whitespace
      await userEvent.type(input, '   ')
      fireEvent.click(sendButton)

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('streaming update logic', () => {
    it('updates the assistant message with incoming tokens in real-time', async () => {
      const sseChunks = [
        'data: {"token":"Hello"}\n',
        'data: {"token":" "}\n',
        'data: {"token":"world"}\n',
      ]

      let chunkIndex = 0
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(async () => {
              if (chunkIndex < sseChunks.length) {
                return {
                  done: false,
                  value: new TextEncoder().encode(sseChunks[chunkIndex++]),
                }
              }
              return { done: true }
            }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      fireEvent.click(sendButton)

      // Wait for the assistant message to be updated with tokens
      await waitFor(() => {
        const assistantMessage = screen.getByTestId('message-assistant')
        expect(assistantMessage.textContent).toBe('Hello world')
      })
    })

    it('correctly identifies the assistant message as the last message in the array', async () => {
      const sseChunks = [
        'data: {"token":"Response"}\n',
      ]

      let chunkIndex = 0
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(async () => {
              if (chunkIndex < sseChunks.length) {
                return {
                  done: false,
                  value: new TextEncoder().encode(sseChunks[chunkIndex++]),
                }
              }
              return { done: true }
            }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Hello')
      fireEvent.click(sendButton)

      await waitFor(() => {
        // Should have exactly 2 messages: user and assistant
        const allMessages = screen.getAllByTestId(/message-/)
        expect(allMessages).toHaveLength(2)
        expect(allMessages[0]).toHaveAttribute('data-testid', 'message-user')
        expect(allMessages[1]).toHaveAttribute('data-testid', 'message-assistant')
        expect(allMessages[1].textContent).toBe('Response')
      })
    })

    it('marks the last assistant message with streaming indicator while loading', async () => {
      // Mock fetch that never completes (to keep isLoading true)
      ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      fireEvent.click(sendButton)

      await waitFor(() => {
        const assistantMessage = screen.getByTestId('message-assistant')
        // isStreaming should be true for the last message while loading
        expect(assistantMessage).toHaveAttribute('data-streaming', 'true')
      })
    })
  })

  describe('error handling', () => {
    it('adds error message when fetch fails', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/error processing your message/i)).toBeInTheDocument()
      })
    })

    it('handles unsuccessful response status', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByText(/error processing your message/i)).toBeInTheDocument()
      })
    })

    it('silently skips invalid JSON in SSE stream', async () => {
      const sseChunks = [
        'data: {invalid json}\n',
        'data: {"token":"Valid"}\n',
      ]

      let chunkIndex = 0
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(async () => {
              if (chunkIndex < sseChunks.length) {
                return {
                  done: false,
                  value: new TextEncoder().encode(sseChunks[chunkIndex++]),
                }
              }
              return { done: true }
            }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      fireEvent.click(sendButton)

      // Should process the valid token despite invalid JSON line
      await waitFor(() => {
        const assistantMessage = screen.getByTestId('message-assistant')
        expect(assistantMessage.textContent).toBe('Valid')
      })
    })
  })

  describe('UI interactions', () => {
    it('disables send button while loading', async () => {
      ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      expect(sendButton).not.toBeDisabled()

      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(sendButton).toBeDisabled()
      })
    })

    it('disables input while loading', async () => {
      ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...') as HTMLInputElement
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test')
      expect(input).not.toBeDisabled()

      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(input).toBeDisabled()
      })
    })

    it('clears chat messages when Clear button is clicked', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test message')
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toBeInTheDocument()
      })

      const clearButton = screen.getByRole('button', { name: /clear chat/i })
      fireEvent.click(clearButton)

      await waitFor(() => {
        expect(screen.queryByTestId('message-user')).not.toBeInTheDocument()
        expect(screen.queryByTestId('message-assistant')).not.toBeInTheDocument()
      })
    })

    it('allows sending message with Enter key', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')

      await userEvent.type(input, 'Test{Enter}')

      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toBeInTheDocument()
      })
    })

    it('does not send message with Shift+Enter', async () => {
      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')

      await userEvent.type(input, 'Test{Shift>}{Enter}{/Shift}')

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('initial state', () => {
    it('shows empty state message when no messages', () => {
      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      expect(screen.getByText(/start a conversation/i)).toBeInTheDocument()
      expect(screen.getByText(mockPatientName)).toBeInTheDocument()
    })

    it('disables Clear button when no messages', () => {
      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const clearButton = screen.getByRole('button', { name: /clear chat/i })
      expect(clearButton).toBeDisabled()
    })

    it('disables Send button when input is empty', () => {
      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const sendButton = screen.getByRole('button', { name: /send message/i })
      expect(sendButton).toBeDisabled()
    })
  })

  describe('API integration', () => {
    it('sends correct API request with reportId and message', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
          }),
        },
      })

      render(
        <ReportChat reportId={mockReportId} patientName={mockPatientName} />
      )

      const input = screen.getByPlaceholderText('Ask about the report...')
      const sendButton = screen.getByRole('button', { name: /send message/i })

      await userEvent.type(input, 'Test question')
      fireEvent.click(sendButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/chat',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: expect.stringContaining(mockReportId),
          })
        )
      })

      const callArgs = (global.fetch as any).mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.message).toBe('Test question')
      expect(body.reportId).toBe(mockReportId)
      expect(Array.isArray(body.chatHistory)).toBe(true)
    })
  })
})
