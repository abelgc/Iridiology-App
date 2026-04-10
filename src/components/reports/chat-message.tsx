'use client'

import React from 'react'
import { ChatMessage as ChatMessageType } from '@/types/claude'
import { MarkdownRenderer } from '@/components/shared/markdown-renderer'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85vw] sm:max-w-xs md:max-w-md lg:max-w-lg px-4 py-3 rounded-lg ${
          isUser
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none dark:bg-gray-800 dark:text-gray-100'
        }`}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <div className="text-sm">
            <MarkdownRenderer content={message.content} className="prose-sm" />
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-current ml-1 animate-pulse">|</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
