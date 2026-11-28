'use client';

import { useState, type FormEvent } from 'react';
import { askParkPlan, type ParkPlanReply } from '@/features/park-plan/park-plan-api';
import { ParkPlanResult } from '@/features/park-plan/park-plan-result';

const examples = [
  ['Một ngày cùng bé', 'Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 122 cm. Đi 09:00–14:00, ngân sách 1.400.000 đồng, ưu tiên trò nhẹ và cần ăn trưa.'],
  ['Show buổi sáng', 'Công viên Mẫu có những suất show nào buổi sáng?'],
  ['Trò thiếu giá', 'Công viên Mẫu, 2 người lớn, 10:00–13:00, ngân sách 900.000 đồng. Bắt buộc chơi Vườn âm thanh.'],
] as const;

export default function ParkPlanner() {
  const [text, setText] = useState<string>(examples[0][1]);
  const [reply, setReply] = useState<ParkPlanReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setReply(null);
    setError('');
    try {
      setReply(await askParkPlan(text));
    } catch {
      setError('Chưa nhận được câu trả lời từ Vini. Bạn vui lòng gửi lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-warm-mist px-4 py-12 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Lập lịch Công viên Mẫu</h1>
          <p className="mt-2">Vini xếp lịch một ngày cho cả nhà: trò phù hợp với từng bé, suất diễn, giờ ăn và ngân sách.</p>
          <p className="mt-1 text-xs">Bản demo: giá và lịch diễn dùng để minh hoạ.</p>
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
            <section className="rounded-2xl bg-background p-6 shadow-sm">
              <ParkPlanResult reply={reply} />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
