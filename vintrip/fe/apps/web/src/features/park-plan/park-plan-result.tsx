import type { ParkPlanCoreValidation, ParkPlanReply } from './park-plan-api';

const coreMessages: Record<ParkPlanCoreValidation['status'], { text: string; tone: string }> = {
  VALID: { text: 'Hệ thống đã kiểm tra lại độc lập: không có xung đột.', tone: 'bg-teal-soft text-teal-ink' },
  INVALID: { text: 'Hệ thống kiểm tra lại và phát hiện:', tone: 'bg-coral-tint text-coral-ink' },
  SNAPSHOT_MISMATCH: { text: 'Dữ liệu công viên vừa được cập nhật, Vini cần xếp lại lịch này.', tone: 'bg-coral-tint text-coral-ink' },
  UNAVAILABLE: { text: 'Chưa kết nối được hệ thống kiểm tra; lịch mới qua bước kiểm tra của Vini.', tone: 'bg-sun-soft text-teal-ink' },
};

const statusColors: Record<string, string> = {
  VALID: 'bg-success text-white',
  NEEDS_INPUT: 'bg-sun-soft text-teal-ink',
  SEARCH_TIMEOUT: 'bg-sun-soft text-teal-ink',
  MISSING_DATA: 'bg-teal-soft text-teal-ink',
  INFEASIBLE: 'bg-coral-tint text-coral-ink',
  'CHƯA HỢP LỆ': 'bg-coral-tint text-coral-ink',
  'TỪ CHỐI': 'bg-coral-tint text-coral-ink',
};

const formatVnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

export function ParkPlanStatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusColors[status] ?? 'bg-surface-muted'}`}>{label || status}</span>
  );
}

/** Ô kết quả Core API kiểm lại lịch trên server. */
export function ParkPlanCoreCheck({ core }: { core: ParkPlanCoreValidation }) {
  const coreLines = [...(core.violations ?? []), ...(core.warnings ?? [])];
  return (
    <div className={`rounded-xl p-4 text-sm ${coreMessages[core.status].tone}`}>
      <p className="font-bold">{coreMessages[core.status].text}</p>
      {core.status === 'VALID' && core.totalVnd !== undefined && <p>Tổng chi phí được xác nhận: {formatVnd(core.totalVnd)}</p>}
      {coreLines.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {coreLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ParkPlanTrace({ reply }: { reply: ParkPlanReply }) {
  return (
    <details className="border-t border-border pt-3 text-sm">
      <summary className="cursor-pointer">Chi tiết kỹ thuật ({reply.trace.length} bước)</summary>
      <p className="my-2">Snapshot {reply.snapshot_id}</p>
      <ol className="list-inside list-decimal space-y-1">
        {reply.trace.map((step, index) => (
          <li key={index}>
            {step.kind} · <code>{step.name}</code> · {step.latency_s} giây
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Kết quả của trợ lý C1 trên trang /c1: nhãn trạng thái, lịch và bảng tiền, kiểm của Core API, trace. */
export function ParkPlanResult({ reply }: { reply: ParkPlanReply }) {
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Kết quả</h2>
        <ParkPlanStatusChip status={reply.status} label={reply.status_label} />
      </header>
      <p className="whitespace-pre-wrap break-words">{reply.reply || reply.output}</p>
      {reply.core_validation && <ParkPlanCoreCheck core={reply.core_validation} />}
      <ParkPlanTrace reply={reply} />
    </div>
  );
}
