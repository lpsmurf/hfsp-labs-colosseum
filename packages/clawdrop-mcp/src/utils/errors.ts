// STREAM 3 & 4: Error Classification + Logging (Kimi)
// Status: STUB - Ready for implementation

export class HFSPError extends Error {
  constructor(
    message: string,
    public error_type: 'transient' | 'permanent' | 'unknown',
    public status_code?: number
  ) {
    super(message);
    this.name = 'HFSPError';
  }
}

export function classifyError(error: any): 'transient' | 'permanent' | 'unknown' {
  // TODO: Task 3.3 - Classify errors
  // 4xx = permanent, 5xx = transient, network errors = transient, unknown = unknown
  return 'unknown'; // Placeholder
}
