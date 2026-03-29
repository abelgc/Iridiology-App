import { anthropic } from './client'
import { buildChatSystemPrompt } from './prompts'
import { ReportContent } from '@/types/report'
import { ChatRequest, ChatMessage } from '@/types/claude'

export async function* chatAboutReport(
  request: ChatRequest,
  reportContent: ReportContent,
  patientContext: string,
): AsyncGenerator<string> {
  // Format the full report content for the system prompt
  const fullReportContent = Object.entries(reportContent)
    .map(([key, value]) => `**${key}:**\n${value}`)
    .join('\n\n')

  const systemPrompt = buildChatSystemPrompt(fullReportContent, patientContext)

  // Build messages array including chat history and current message
  const messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }> = [
    ...request.chatHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: request.message,
    },
  ]

  // Stream the response
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages,
  })

  // Yield text chunks as they arrive
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }
  }
}
