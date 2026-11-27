'use client';

import { useState, type FormEvent } from 'react';

const examples = [
  ['Một ngày cùng bé', 'Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 122 cm. Đi 09:00–14:00, ngân sách 1.400.000 đồng, ưu tiên trò nhẹ và cần ăn trưa.'],
  ['Show buổi sáng', 'Công viên Mẫu có những suất show nào buổi sáng?'],
  ['Trò thiếu giá', 'Công viên Mẫu, 2 người lớn, 10:00–13:00, ngân sách 900.000 đồng. Bắt buộc chơi Vườn âm thanh.'],
] as const;

type Reply = {
  output: string;
  status: string;
  snapshot_id: string;
  trace: { kind: string; name: string; latency_s: number }[];
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

export default function ParkPlanner() {
  const [text, setText] = useState<string>(examples[0][1]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setReply(null);
    setError('');
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
      const response = await fetch(`${base.replace(/\/$/, '')}/ai/c1/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!response.ok) throw new Error();
      setReply(await response.json());
    } catch {
      setError('Chưa nhận được câu trả lời từ VinTrip. Bạn hãy thử gửi lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-warm-mist px-4 py-12 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Lập lịch Công viên Mẫu</h1>
          <p className="mt-2">Lịch gia đình dùng dữ liệu mô phỏng về trò chơi, suất diễn và giá vé.</p>
        </header>
        <form onSubmit={ask} className="space-y-4 rounded-2xl bg-background p-6 shadow-sm">
          <label htmlFor="question" className="block font-bold">Gia đình bạn muốn đi chơi thế nào?</label>
          <textarea id="question" rows={4} maxLength={4000} required disabled={busy}
            className="w-full rounded-xl border border-border p-3" value={text}
            onChange={(event) => setText(event.target.value)} />
          <div className="flex flex-wrap gap-2" aria-label="Câu hỏi mẫu">
            {examples.map(([label, question]) => (
              <button type="button" key={label} disabled={busy} onClick={() => setText(question)}
                className="rounded-full bg-teal-soft px-3 py-2 text-sm text-teal-ink">{label}</button>
            ))}
          </div>
          <button disabled={busy || !text.trim()} className="rounded-xl bg-coral-ink px-5 py-3 font-bold text-white disabled:opacity-60">
            {busy ? 'Đang xử lý…' : 'Gửi câu hỏi'}
          </button>
        </form>
        {error && <p role="alert" className="text-coral-ink">{error}</p>}
        <div aria-live="polite" aria-busy={busy}>
          {reply && (
            <section className="space-y-4 rounded-2xl bg-background p-6 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl">Kết quả</h2>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${statusColors[reply.status] ?? 'bg-surface-muted'}`}>{reply.status}</span>
              </header>
              <p className="whitespace-pre-wrap break-words">{reply.output}</p>
              <details className="border-t border-border pt-4">
                <summary className="cursor-pointer">Trace công cụ và model ({reply.trace.length})</summary>
                <p className="my-2 text-sm">Snapshot {reply.snapshot_id}</p>
                <ol className="list-inside list-decimal space-y-1 text-sm">
                  {reply.trace.map((step, i) => (
                    <li key={i}>{step.kind} · <code>{step.name}</code> · {step.latency_s} giây</li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
