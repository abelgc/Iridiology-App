import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { installAiNetworkGuard, setAiRequestHandler, takeAiGuardViolations } from './ai-replay/guard'

// No test in `npm test` can reach a paid model API: see src/test/ai-replay/guard.ts.
installAiNetworkGuard()

afterEach(() => {
  setAiRequestHandler(null)
  const violations = takeAiGuardViolations()
  if (violations.length) throw new Error(violations.join('\n\n'))
})
