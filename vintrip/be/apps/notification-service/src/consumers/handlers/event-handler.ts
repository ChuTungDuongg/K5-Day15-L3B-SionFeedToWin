import type { EventEnvelope } from '@vintrip/contracts';

export type EventHandler = (event: EventEnvelope) => Promise<boolean>;
