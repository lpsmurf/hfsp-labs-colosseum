/**
 * Poly Guardrails — Public API
 * Import everything you need from here.
 */

export * from './types.js';
export * from './pipeline.js';

// Individual hooks (for testing or custom pipelines)
export { onboardingHook, configureOnboarding } from './00-onboarding.js';
export type { OnboardingRecord, OnboardingState, OnboardingLookup, OnboardingEmailSaver } from './00-onboarding.js';
export { inputValidationHook }  from './01-input-validation.js';
export { rateLimiterHook }      from './02-rate-limiter.js';
export { authGuardHook, configurePairingLookup } from './03-auth-guard.js';
export { toolAllowlistHook, POLY_TOOLS, BLOCKED_TOOLS } from './04-tool-allowlist.js';
export { swapGuardHook }        from './05-swap-guard.js';
export { executionTimeoutHook, withTimeout, clearExecutionState } from './06-execution-timeout.js';
export { outputSanitizerHook }  from './07-output-sanitizer.js';
export { creditGuardHook, configureCreditLookup } from './08-credit-guard.js';
