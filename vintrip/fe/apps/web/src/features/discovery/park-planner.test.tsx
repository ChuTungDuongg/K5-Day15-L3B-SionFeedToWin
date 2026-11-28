import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vi as copy } from '@vintrip/i18n';

// Same hook-level test approach as shared/use-image-zoom.test.ts: no browser/backend needed.
const hooks = vi.hoisted(() => {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const effects: Array<{ effect: () => void | (() => void); deps?: readonly unknown[]; pending: boolean; cleanup?: () => void }> = [];
  let stateIndex = 0; let refIndex = 0; let effectIndex = 0;
  return {
    begin() { stateIndex = 0; refIndex = 0; effectIndex = 0; },
    unmount() { for (const entry of effects) entry.cleanup?.(); effects.length = 0; },
    reset() { this.unmount(); states.length = 0; refs.length = 0; this.begin(); },
    useState<T>(initial: T): [T, (value: T) => void] {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index] as T, (value) => { states[index] = value; }];
    },
    useRef<T>(initial: T): { current: T } {
      const index = refIndex++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = effectIndex++;
      const previous = effects[index];
      if (!previous || !deps || !previous.deps || deps.length !== previous.deps.length
        || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
        previous?.cleanup?.(); effects[index] = { effect, deps, pending: true };
      }
    },
    flush() {
      for (const entry of effects) {
        if (entry.pending) { entry.pending = false; entry.cleanup = entry.effect() ?? undefined; }
      }
    },
  };
});
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: hooks.useState, useRef: hooks.useRef, useEffect: hooks.useEffect,
  useId: () => 'park-question-test',
}));
vi.mock('./park-planner-api', () => ({ askParkPlanner: vi.fn() }));

import { ParkPlanner } from './park-planner';
import { askParkPlanner, type ParkPlanReply } from './park-planner-api';
import { PARK_PLANNER_SAMPLE } from './park-planner-sample';
import styles from './park-planner.module.css';

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}
function render() { hooks.begin(); const tree = ParkPlanner(); hooks.flush(); return tree; }
function textContent(tree: ReactNode) {
  return renderToStaticMarkup(tree).replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function find(tree: ReactNode, type: string, text?: string) {
  const element = elements(tree).find((node) => node.type === type
    && (!text || renderToStaticMarkup(node).includes(text)));
  if (!element) throw new Error(`Missing ${type}: ${text ?? ''}`);
  return element;
}
function click(tree: ReactNode, text: string) {
  (find(tree, 'button', text).props.onClick as () => void)();
}
function submit(tree: ReactNode) {
  (find(tree, 'form').props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
}
function question(value = 'Gia đình đi Công viên Mẫu') {
  (find(render(), 'textarea').props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
  return render();
}
const reply: ParkPlanReply = {
  output: 'Lịch trả về từ API\nTổng: 1.370.000đ', status: 'VALID', snapshot_id: 'api-snapshot',
  trace: [{ kind: 'tool', name: 'validate_park_plan', latency_s: 0.2 }, { kind: 'model', name: 'call_model', latency_s: 5 }],
};

beforeEach(() => { hooks.reset(); vi.mocked(askParkPlanner).mockReset(); });
afterEach(() => hooks.reset());

describe('Khung lập lịch dùng chung trang chủ và /c1', () => {
  it('trống: gợi ý chọn câu hỏi, nút gửi khoá và không tự gọi API', () => {
    const tree = render(); const html = renderToStaticMarkup(tree);
    expect(html).toContain(copy.parkPlanner.empty);
    expect(html).toContain('for="park-question-test"');
    expect(find(tree, 'button', copy.parkPlanner.send).props.disabled).toBe(true);
    click(tree, copy.parkPlanner.examples[0].label);
    expect(find(render(), 'textarea').props.value).toBe(copy.parkPlanner.examples[0].text);
    expect(askParkPlanner).not.toHaveBeenCalled();
  });

  it('200: hiện nhãn trạng thái, output nguyên văn, snapshot và trace', async () => {
    vi.mocked(askParkPlanner).mockResolvedValue(reply);
    submit(question());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(reply.output));
    const html = renderToStaticMarkup(render());
    expect(html).toContain(copy.parkPlanner.statuses.VALID);
    expect(html).toContain('VALID'); expect(html).toContain(reply.snapshot_id);
    expect(html).toContain(`${copy.parkPlanner.trace} (2)`);
    expect(html).toContain('validate_park_plan'); expect(html).toContain('call_model');
    expect(html).not.toContain(copy.parkPlanner.sampleNotice);
  });

  it('500: báo lỗi, có Thử lại, không tự thay bằng mẫu hay kết quả trước đó', async () => {
    vi.mocked(askParkPlanner).mockResolvedValueOnce(reply).mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce(reply);
    submit(question());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(reply.output));
    submit(render());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain('role="alert"'));
    const tree = render(); const html = renderToStaticMarkup(tree);
    expect(html).toContain(copy.parkPlanner.error);
    expect(html).not.toContain(reply.output); expect(textContent(tree)).not.toContain(PARK_PLANNER_SAMPLE.output);
    expect(html).not.toContain(copy.parkPlanner.sampleNotice);
    expect(find(tree, 'button', copy.parkPlanner.sample)).toBeTruthy();
    click(tree, copy.parkPlanner.retry);
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(reply.output));
    expect(askParkPlanner).toHaveBeenCalledTimes(3);
  });

  it('đang chờ: aria-busy, khoá nút/ô nhập/chip, chặn gửi trùng cả trước khi render lại', async () => {
    let resolve!: (reply: ParkPlanReply) => void;
    vi.mocked(askParkPlanner).mockReturnValue(new Promise((done) => { resolve = done; }));
    const initial = question(); submit(initial); submit(initial);
    const tree = render(); const html = renderToStaticMarkup(tree);
    expect(html).toContain('aria-busy="true"'); expect(html).toContain(copy.parkPlanner.loading);
    expect(find(tree, 'button', copy.parkPlanner.loading).props.disabled).toBe(true);
    expect(find(tree, 'textarea').props.disabled).toBe(true);
    expect(find(tree, 'button', copy.parkPlanner.examples[0].label).props.disabled).toBe(true);
    expect(html).not.toContain(copy.parkPlanner.sample);
    expect(askParkPlanner).toHaveBeenCalledTimes(1);
    resolve(reply);
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(reply.output));
  });

  it.each(['empty', 'error'])('bấm Xem kết quả mẫu từ %s mới hiện mẫu và dải chú thích', async (state) => {
    if (state === 'error') {
      vi.mocked(askParkPlanner).mockRejectedValue(new Error('HTTP 500')); submit(question());
      await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain('role="alert"'));
    }
    const callsBefore = vi.mocked(askParkPlanner).mock.calls.length;
    click(render(), copy.parkPlanner.sample);
    const html = renderToStaticMarkup(render());
    expect(textContent(render())).toContain(PARK_PLANNER_SAMPLE.output);
    expect(html).toContain(copy.parkPlanner.sampleNotice);
    expect(html).toContain(`${copy.parkPlanner.trace} (${PARK_PLANNER_SAMPLE.trace.length})`);
    expect(askParkPlanner).toHaveBeenCalledTimes(callsBefore);
  });

  it.each(['FUTURE_STATUS', 'toString'])('trạng thái lạ %s có nhãn trung tính', async (status) => {
    vi.mocked(askParkPlanner).mockResolvedValue({ ...reply, status }); submit(question());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(reply.output));
    const html = renderToStaticMarkup(render());
    expect(html).toContain(copy.parkPlanner.otherStatus); expect(html).toContain(styles.neutral);
  });

  it('rời trang: huỷ request đang chạy bằng AbortSignal', () => {
    vi.mocked(askParkPlanner).mockReturnValue(new Promise(() => {})); submit(question());
    const signal = vi.mocked(askParkPlanner).mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false); hooks.unmount(); expect(signal?.aborted).toBe(true);
  });

  it('kết quả có nhãn giờ riêng, chip snapshot, header và khung cuộn; kết quả mới cuộn về đầu', async () => {
    const node = { scrollTop: 200, clientHeight: 400, scrollHeight: 1000, firstElementChild: null };
    const scroller = elements(render()).find((element) => element.props.className === styles.resultScroll)!;
    (scroller.props.ref as { current: unknown }).current = node;
    vi.mocked(askParkPlanner).mockResolvedValue(PARK_PLANNER_SAMPLE);
    submit(question());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(styles.timeBadge));
    const tree = render(); const html = renderToStaticMarkup(tree);
    expect(html).toContain(`class="${styles.timeBadge}">09:05–10:15</span>`);
    expect(html).toContain(`class="${styles.resultScroll}"`);
    expect(html).toContain(`class="${styles.answerHead}"`);
    expect(html).toContain(`class="${styles.snapshot}"`);
    expect(node.scrollTop).toBe(0);
    expect(html).toContain('data-more-below="true"');
    node.scrollTop = 600;
    const scroll = elements(tree).find((element) => element.props.className === styles.resultScroll)!;
    (scroll.props.onScroll as (event: { currentTarget: typeof node }) => void)({ currentTarget: node });
    expect(renderToStaticMarkup(render())).toContain('data-more-below="false"');
    submit(render());
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(styles.timeBadge));
    expect(node.scrollTop).toBe(0);
  });
});
