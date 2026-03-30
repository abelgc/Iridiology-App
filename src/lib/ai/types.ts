export interface CompletionRequest {
  systemPrompt: string
  userText: string
  images: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }>
  maxTokens: number
}

export interface CompletionResponse {
  text: string
  stopReason: 'end_turn' | 'max_tokens' | string
}

export interface AIProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>
}
