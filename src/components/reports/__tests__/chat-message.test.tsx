import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMessage } from '../chat-message'
import type { ChatMessage as ChatMessageType } from '@/types/claude'

// Mock the MarkdownRenderer component
vi.mock('@/components/shared/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

describe('ChatMessage', () => {
  it('renders user message with correct styling', () => {
    const message: ChatMessageType = {
      role: 'user',
      content: 'This is a user message',
    }

    render(<ChatMessage message={message} />)

    const messageContent = screen.getByText('This is a user message')
    expect(messageContent).toBeInTheDocument()

    // Check that the message wrapper has the blue styling for user messages
    const wrapper = messageContent.closest('div[class*="bg-blue"]')
    expect(wrapper).toHaveClass('bg-blue-500')
  })

  it('renders assistant message with correct styling', () => {
    const message: ChatMessageType = {
      role: 'assistant',
      content: 'This is an assistant message',
    }

    render(<ChatMessage message={message} />)

    const messageContent = screen.getByText('This is an assistant message')
    expect(messageContent).toBeInTheDocument()

    // Check that the message wrapper has the gray styling for assistant messages
    const wrapper = messageContent.closest('div[class*="bg-gray"]')
    expect(wrapper).toHaveClass('bg-gray-100')
  })

  it('shows streaming indicator when isStreaming is true', () => {
    const message: ChatMessageType = {
      role: 'assistant',
      content: 'Streaming message',
    }

    render(<ChatMessage message={message} isStreaming={true} />)

    // The streaming indicator should be present
    const cursorIndicator = screen.getByText('|')
    expect(cursorIndicator).toBeInTheDocument()
    expect(cursorIndicator).toHaveClass('animate-pulse')
  })

  it('does not show streaming indicator when isStreaming is false', () => {
    const message: ChatMessageType = {
      role: 'assistant',
      content: 'Non-streaming message',
    }

    render(<ChatMessage message={message} isStreaming={false} />)

    // The cursor indicator should not be present
    const messageContent = screen.getByText('Non-streaming message')
    const cursor = messageContent.parentElement?.querySelector('.animate-pulse')
    expect(cursor).not.toBeInTheDocument()
  })
})
