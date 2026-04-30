import Anthropic from '@anthropic-ai/sdk'
import { buildChatSystemPrompt } from './prompts'
import { ReportContent } from '@/types/report'
import { ChatRequest } from '@/types/claude'

export async function* chatAboutReport(
  request: ChatRequest,
  reportContent: ReportContent,
  patientContext: string,
  apiKey?: string,
): AsyncGenerator<string> {
  const client = new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    timeout: 120000,
  })

  const fullReportContent = Object.entries(reportContent)
    .map(([key, value]) => `**${key}:**\n${value}`)
    .join('\n\n')

  const systemPrompt = buildChatSystemPrompt(fullReportContent, patientContext)

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...request.chatHistory
      .filter((msg) => msg.content.trim() !== '')
      .map((msg) => ({ role: msg.role, content: msg.content })),
    { role: 'user' as const, content: request.message },
  ]

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  // Yield text chunks as they arrive
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      yield chunk.delta.text
    }
  }
}
