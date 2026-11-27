import { startTelemetry } from '@vintrip/observability';

export const telemetry = startTelemetry('core-api');

export class TelemetryLifecycle {
  async onApplicationShutdown(): Promise<void> {
    await telemetry?.shutdown();
  }
}
