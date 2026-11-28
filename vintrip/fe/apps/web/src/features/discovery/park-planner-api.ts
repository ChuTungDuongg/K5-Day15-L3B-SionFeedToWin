/** Public C1 API contract: vintrip/CONTRACTS.md §8. */
export type ParkPlanReply = {
  output: string;
  status: string;
  snapshot_id: string;
  trace: { kind: 'tool' | 'model'; name: string; latency_s: number }[];
};

function isParkPlanReply(value: unknown): value is ParkPlanReply {
  if (!value || typeof value !== 'object') return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.output === 'string'
    && typeof reply.status === 'string'
    && typeof reply.snapshot_id === 'string'
    && Array.isArray(reply.trace)
    && reply.trace.every((step: unknown) => {
      if (!step || typeof step !== 'object') return false;
      const entry = step as Record<string, unknown>;
      return (entry.kind === 'tool' || entry.kind === 'model')
        && typeof entry.name === 'string'
        && typeof entry.latency_s === 'number'
        && Number.isFinite(entry.latency_s) && entry.latency_s >= 0;
    });
}

export async function askParkPlanner(text: string, signal?: AbortSignal): Promise<ParkPlanReply> {
  const question = text.trim();
  if (!question || question.length > 4000) throw new RangeError('C1 question must contain 1–4000 characters');
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
  const response = await fetch(`${base}/ai/c1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: question }),
    signal,
  });
  if (response.status !== 200) throw new Error(`C1 request failed: HTTP ${response.status}`);
  const reply: unknown = await response.json();
  if (!isParkPlanReply(reply)) throw new Error('Invalid C1 response');
  return reply;
}
