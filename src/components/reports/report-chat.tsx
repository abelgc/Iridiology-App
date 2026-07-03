'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChatMessage as ChatMessageType, ReportModificationResult } from '@/types/claude'
import { ChatMessage } from './chat-message'
import { Button } from '@/components/ui/button'
import { getSectionLabel } from '@/types/report'
import { Trash2, Send, Wand2 } from 'lucide-react'

interface ReportChatProps {
  reportId: string
  patientName: string
}

export function ReportChat({ reportId, patientName }: ReportChatProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [modifyOpen, setModifyOpen] = useState(false)
  const [modifyInstruction, setModifyInstruction] = useState('')
  const [isModifying, setIsModifying] = useState(false)
  const [modifyError, setModifyError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<ReportModificationResult | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  const handleGenerateModification = async () => {
    if (!modifyInstruction.trim()) return
    setIsModifying(true)
    setModifyError(null)
    setProposal(null)
    try {
      const response = await fetch(`/api/reports/${reportId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: modifyInstruction }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to generate changes')
      setProposal(data)
    } catch (error) {
      setModifyError(error instanceof Error ? error.message : 'Failed to generate changes')
    } finally {
      setIsModifying(false)
    }
  }

  const handleApplyModification = async () => {
    if (!proposal) return
    setIsApplying(true)
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_content: proposal.newContent }),
      })
      if (!response.ok) throw new Error('Failed to save changes')
      setApplied(true)
    } catch (error) {
      setModifyError(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setIsApplying(false)
    }
  }

  const handleDiscardModification = () => {
    setProposal(null)
    setModifyInstruction('')
    setModifyError(null)
  }

  const handleCloseModifyPanel = () => {
    setModifyOpen(false)
    setProposal(null)
    setModifyInstruction('')
    setModifyError(null)
    setApplied(false)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    // Add user message to state
    const userMessage: ChatMessageType = {
      role: 'user',
      content: input,
    }
    const userInputText = input
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportId,
          message: userInputText,
          chatHistory: messages,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let assistantContent = ''

      let done = false
      while (!done) {
        const result = await reader.read()
        done = result.done
        if (result.value) {
          const chunk = decoder.decode(result.value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              let data: { token?: string; error?: string; done?: boolean }
              try {
                data = JSON.parse(line.slice(6))
              } catch {
                continue
              }
              if (data.token) {
                assistantContent += data.token
                setMessages((prev) => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last && last.role === 'assistant') {
                    last.content = assistantContent
                  }
                  return updated
                })
              } else if (data.error) {
                throw new Error(data.error)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      // Add error message
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error processing your message. Please try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setMessages([])
    setInput('')
  }

  return (
    <div className="flex flex-col h-full max-h-[100dvh] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p className="text-center">
              Start a conversation about{' '}
              <span className="font-semibold">{patientName}</span>&apos;s report
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage
              key={index}
              message={message}
              isStreaming={isLoading && index === messages.length - 1 && message.role === 'assistant'}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask about the report..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            size="sm"
            className="px-4"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleClear}
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isLoading || messages.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear chat
          </Button>
          <Button
            onClick={() => (modifyOpen ? handleCloseModifyPanel() : setModifyOpen(true))}
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={isLoading}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Modify report
          </Button>
        </div>

        {modifyOpen && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3 bg-gray-50 dark:bg-gray-800">
            {applied ? (
              <div className="space-y-2">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">Report updated.</p>
                <Link
                  href={`/practitioner/reports/${reportId}`}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View updated report
                </Link>
              </div>
            ) : proposal ? (
              <div className="space-y-3">
                {proposal.changedSections.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No changes were needed for that instruction.
                  </p>
                ) : (
                  proposal.changedSections.map((section) => (
                    <div key={section.key} className="space-y-1 text-sm">
                      <p className="font-semibold text-gray-700 dark:text-gray-200">
                        {getSectionLabel(section.key)}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 line-through">{section.before}</p>
                      <p className="text-gray-900 dark:text-white">{section.after}</p>
                    </div>
                  ))
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleDiscardModification}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isApplying}
                  >
                    Discard
                  </Button>
                  <Button
                    onClick={handleApplyModification}
                    size="sm"
                    className="flex-1"
                    disabled={isApplying || proposal.changedSections.length === 0}
                  >
                    {isApplying ? 'Applying...' : 'Apply changes'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={modifyInstruction}
                  onChange={(e) => setModifyInstruction(e.target.value)}
                  placeholder="What should change in the report?"
                  disabled={isModifying}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-600 dark:text-white disabled:opacity-50"
                />
                {modifyError && <p className="text-sm text-red-600 dark:text-red-400">{modifyError}</p>}
                <div className="flex gap-2">
                  <Button
                    onClick={handleCloseModifyPanel}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isModifying}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenerateModification}
                    size="sm"
                    className="flex-1"
                    disabled={isModifying || !modifyInstruction.trim()}
                  >
                    {isModifying ? 'Generating...' : 'Generate changes'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
