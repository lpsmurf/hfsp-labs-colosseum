// Typed error library for the x402-vpn-vps-base backend.
// Every thrown error goes through one of these classes so:
//   1. HTTP responses are consistent (code + status always match)
//   2. Logs are searchable by code
//   3. Client-side troubleshooting docs can reference codes

export type ErrorCode =
  // Payment errors
  | "PAYMENT_REQUIRED"          // No X-PAYMENT header sent
  | "PAYMENT_FAILED"            // x402 facilitator rejected the payment

  // Provisioning errors
  | "PROVISION_ERROR"           // Generic Hetzner provisioning failure
  | "HETZNER_INVALID_INPUT"     // 422 from Hetzner (bad params)
  | "HETZNER_QUOTA_EXCEEDED"    // Hetzner project quota hit
  | "HETZNER_LOCATION_FULL"     // Datacenter has no available capacity
  | "HETZNER_DEPRECATED_TYPE"   // Server type is deprecated
  | "HETZNER_AUTH_FAILED"       // Bad Hetzner API token

  // Input errors
  | "VALIDATION_ERROR"          // Zod schema rejection
  | "REGION_UNAVAILABLE"        // Requested region not in active list

  // System errors
  | "INTERNAL_ERROR";           // Unclassified bug

export interface ApiError {
  ok:      false;
  code:    ErrorCode;
  error:   string;
  detail?: string;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus: number = 500,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = code;
  }

  toResponse(): ApiError {
    return {
      ok:      false,
      code:    this.code,
      error:   this.message,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

// ── Payment errors ────────────────────────────────────────────────────────────
export class PaymentRequired extends AppError {
  constructor(detail?: string) {
    super("PAYMENT_REQUIRED", "Payment required — send Base USDC via x402", 402, detail);
  }
}

export class PaymentFailed extends AppError {
  constructor(detail?: string) {
    super("PAYMENT_FAILED", "x402 payment verification failed", 402, detail);
  }
}

// ── Provisioning errors ───────────────────────────────────────────────────────
export class ProvisionError extends AppError {
  constructor(detail: string) {
    super("PROVISION_ERROR", "Server provisioning failed — contact support if this persists", 500, detail);
  }
}

export class HetznerInvalidInput extends AppError {
  constructor(detail: string) {
    super("HETZNER_INVALID_INPUT", "Invalid provisioning parameters", 422, detail);
  }
}

export class HetznerQuotaExceeded extends AppError {
  constructor() {
    super("HETZNER_QUOTA_EXCEEDED", "Project server quota exceeded — try a different region", 503);
  }
}

export class HetznerLocationFull extends AppError {
  constructor(location: string) {
    super("HETZNER_LOCATION_FULL", `Region ${location} is at capacity — choose a different region`, 503, location);
  }
}

export class HetznerDeprecatedType extends AppError {
  constructor(serverType: string) {
    super("HETZNER_DEPRECATED_TYPE", "Server type is deprecated", 500, `type: ${serverType}`);
  }
}

// ── Input errors ──────────────────────────────────────────────────────────────
export class ValidationError extends AppError {
  constructor(detail: string) {
    super("VALIDATION_ERROR", "Invalid request body", 400, detail);
  }
}

export class RegionUnavailable extends AppError {
  constructor(region: string) {
    super("REGION_UNAVAILABLE", `Region ${region} is not currently available`, 400, region);
  }
}

// ── Hetzner error classifier ──────────────────────────────────────────────────
export function classifyHetznerError(code: string, message: string, status: number): AppError {
  if (code === "invalid_input") {
    if (message.includes("location")) return new HetznerLocationFull(message);
    if (message.includes("deprecated")) return new HetznerDeprecatedType(message);
    return new HetznerInvalidInput(message);
  }
  if (code === "resource_limit_exceeded") return new HetznerQuotaExceeded();
  if (code === "unauthorized") return new AppError("HETZNER_AUTH_FAILED", "Hetzner auth failed — check HETZNER_API_TOKEN", 500);
  return new ProvisionError(`hetzner ${status} ${code}: ${message}`);
}
