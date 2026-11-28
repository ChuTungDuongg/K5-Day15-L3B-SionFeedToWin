/** Trợ lý lập lịch Công viên Mẫu (C1): POST /ai/c1/ask qua gateway. */
export type ParkPlanCoreValidation = {
  status: 'VALID' | 'INVALID' | 'UNAVAILABLE' | 'SNAPSHOT_MISMATCH';
  violations?: string[];
  warnings?: string[];
  totalVnd?: number;
  currentSnapshotId?: string | null;
};

export type ParkPlanReply = {
  output: string;
  status: string;
  snapshot_id: string;
  trace: { kind: string; name: string; latency_s: number }[];
  core_validation?: ParkPlanCoreValidation | null;
  /** Lời Vini nói trong khung chat (đã bỏ mã trạng thái thô). */
  reply?: string;
  status_label?: string;
  /** Gợi ý cách trả lời khi Vini cần hỏi thêm; rỗng nếu không cần. */
  input_hint?: string;
};

export const PARK_PLAN_PREVIOUS_MAX_TURNS = 10;

export const PARK_PLAN_QUESTION_MAX_CHARS = 4000;

// shortcut: /ai/c1/ask chưa có trong OpenAPI để sinh vào @vintrip/api-client; gọi thẳng như trang /c1 trước đây.
/** `previous`: các câu phụ huynh đã gửi trước trong cùng khung chat (cũ → mới), để trả lời bổ sung. */
export async function askParkPlan(text: string, options: { previous?: string[]; signal?: AbortSignal } = {}): Promise<ParkPlanReply> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
  const response = await fetch(`${base.replace(/\/$/, '')}/ai/c1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text.trim().slice(0, PARK_PLAN_QUESTION_MAX_CHARS),
      previous: (options.previous ?? []).slice(-PARK_PLAN_PREVIOUS_MAX_TURNS),
    }),
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`C1 trả HTTP ${response.status}`);
  return (await response.json()) as ParkPlanReply;
}
