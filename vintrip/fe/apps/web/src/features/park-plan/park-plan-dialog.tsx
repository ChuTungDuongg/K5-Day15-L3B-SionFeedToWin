'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { askParkPlan, PARK_PLAN_QUESTION_MAX_CHARS, type ParkPlanReply } from './park-plan-api';
import { ParkPlanCoreCheck, ParkPlanStatusChip, ParkPlanTrace } from './park-plan-result';

type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'agent'; reply: ParkPlanReply }
  | { id: number; role: 'error'; text: string };

const DEFAULT_PLACEHOLDER = 'Hỏi thêm hoặc đổi yêu cầu, ví dụ: tăng ngân sách lên 2 triệu';

/**
 * Khung chat với trợ lý lập lịch C1, mở từ thẻ của Vini: chạy ngay câu phụ huynh vừa hỏi; thiếu dữ liệu thì
 * Vini hỏi lại và phụ huynh trả lời tiếp trong cùng khung. Render qua portal vì khung chat Vini có transform,
 * `position: fixed` bên trong sẽ bị cắt theo khung.
 */
export function ParkPlanDialog({ question, onClose }: { question: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{ id: 0, role: 'user', text: question }]);
  const [draft, setDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);

  /** Gọi trợ lý C1; tin nhắn của phụ huynh đã nằm trong khung trước khi gọi. */
  const requestReply = useCallback((text: string, previous: string[]) => {
    setIsBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    askParkPlan(text, { previous, signal: controller.signal })
      .then((reply) => setMessages((current) => [...current, { id: nextId.current++, role: 'agent', reply }]))
      .catch(() => {
        if (controller.signal.aborted) return;
        setMessages((current) => [
          ...current,
          { id: nextId.current++, role: 'error', text: 'Chưa nhận được câu trả lời từ trợ lý C1. Bạn gửi lại giúp Vini nhé.' },
        ]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsBusy(false);
      });
  }, []);

  useEffect(() => {
    requestReply(question, []);
    return () => abortRef.current?.abort();
  }, [question, requestReply]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isBusy]);

  useEffect(() => {
    closeRef.current?.focus();
    // Bắt ở pha capture và chặn lan: Esc chỉ đóng popup, không đóng luôn khung chat Vini bên dưới.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
    };
    // Khung chat Vini tự đóng khi bấm ra ngoài nó; popup nằm ngoài khung (portal) nên chặn sự kiện đó lại.
    const onPointerDown = (event: PointerEvent) => {
      if (overlayRef.current?.contains(event.target as Node)) event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  const userTexts = messages.flatMap((message) => (message.role === 'user' ? [message.text] : []));
  const lastAgent = [...messages].reverse().find((message) => message.role === 'agent');
  const placeholder = (lastAgent?.role === 'agent' && lastAgent.reply.input_hint) || DEFAULT_PLACEHOLDER;

  function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isBusy) return;
    setDraft('');
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', text }]);
    requestReply(text, userTexts);
  }

  function onDraftKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="park-plan-dialog-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-background text-ink shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 id="park-plan-dialog-title" className="text-lg font-bold">Vini · Trợ lý lập lịch Công viên Mẫu</h2>
            <p className="mt-1 text-sm">Vini lên lịch và kiểm tra giúp bạn. Vé và chỗ do bạn tự đặt tại kênh chính thức.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" className="rounded-full px-3 py-1 text-lg">
            ×
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite" aria-busy={isBusy}>
          {messages.map((message) => {
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-teal-soft px-4 py-2 text-teal-ink">
                    {message.text}
                  </p>
                </div>
              );
            }
            if (message.role === 'error') {
              return (
                <p key={message.id} role="alert" className="max-w-[85%] rounded-2xl bg-coral-tint px-4 py-2 text-coral-ink">
                  {message.text}
                </p>
              );
            }
            const { reply } = message;
            return (
              <div key={message.id} className="max-w-[92%] space-y-3 rounded-2xl rounded-bl-sm bg-warm-mist px-4 py-3">
                <ParkPlanStatusChip status={reply.status} label={reply.status_label} />
                <p className="whitespace-pre-wrap break-words">{reply.reply || reply.output}</p>
                {reply.core_validation && <ParkPlanCoreCheck core={reply.core_validation} />}
                <ParkPlanTrace reply={reply} />
              </div>
            );
          })}
          {isBusy && <p className="text-sm">Vini đang xếp lịch và kiểm lại…</p>}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="space-y-2 border-t border-border p-4">
          <label htmlFor="park-plan-reply" className="sr-only">
            Trả lời Vini
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="park-plan-reply"
              rows={2}
              maxLength={PARK_PLAN_QUESTION_MAX_CHARS}
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              className="flex-1 resize-none rounded-xl border border-border p-3"
            />
            <button type="submit" disabled={isBusy || !draft.trim()} className="rounded-xl bg-coral-ink px-4 py-3 font-bold text-white disabled:opacity-60">
              Gửi
            </button>
          </div>
          <p className="text-sm">
            <Link href="/c1" className="underline" onClick={onClose}>
              Mở trang lập lịch đầy đủ
            </Link>
            <span className="ml-2 text-xs">· Bản demo: giá và lịch diễn dùng để minh hoạ.</span>
          </p>
        </form>
      </div>
    </div>,
    document.body,
  );
}
