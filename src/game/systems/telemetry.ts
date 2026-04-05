export type TelemetryPayload = Record<string, number | string | boolean | null>

export interface TelemetryClient {
  track(name: string, payload?: TelemetryPayload): void
}

export class ConsoleTelemetryClient implements TelemetryClient {
  track(name: string, payload: TelemetryPayload = {}): void {
    const event = {
      name,
      payload,
      timestamp: new Date().toISOString(),
    }

    window.dispatchEvent(new CustomEvent('tiny-ranch:telemetry', { detail: event }))
    console.info('[tiny-ranch]', event)
  }
}
