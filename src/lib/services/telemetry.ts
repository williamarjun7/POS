/**
 * Telemetry service stub — replace with real analytics when a backend is integrated.
 */

export function trackEvent(_event: string, _data?: Record<string, any>) {
  // No-op: telemetry not yet wired to a backend
}

export function trackPageView(_page: string) {
  // No-op
}

export function trackAction(_action: string, _category: string, _label?: string) {
  // No-op
}

export function getTelemetryMetrics() {
  return {
    queueUsage: 0,
    avgRpcLatencyMs: 0,
    reconnectCount: 0,
    lastHour: 0,
  }
}
