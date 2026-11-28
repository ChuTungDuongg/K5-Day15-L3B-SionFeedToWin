import { afterEach, describe, expect, it, vi } from 'vitest';
import { askParkPlanner } from './park-planner-api';

const reply = {
  output: 'Lịch đã kiểm\nTổng: 1.370.000đ', status: 'VALID', snapshot_id: 'test-snapshot',
  trace: [{ kind: 'tool', name: 'validate_park_plan', latency_s: 0.25 }],
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Hợp đồng POST /ai/c1/ask', () => {
  it('gửi đúng URL/body, loại khoảng trắng và chuyển AbortSignal', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://gateway.test///');
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(reply), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    await expect(askParkPlanner('  Gia đình đi chơi  ', controller.signal)).resolves.toEqual(reply);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('https://gateway.test/ai/c1/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Gia đình đi chơi' }), signal: controller.signal,
    });
  });

  it.each([201, 422, 500, 503])('HTTP %i phải báo lỗi, kể cả khi body trông giống kết quả', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(reply), { status })));
    await expect(askParkPlanner('Đi công viên')).rejects.toThrow(`HTTP ${status}`);
  });

  it.each([
    { ...reply, output: undefined }, { ...reply, status: undefined },
    { ...reply, snapshot_id: undefined }, { ...reply, trace: undefined },
    { ...reply, trace: [null] },
    { ...reply, trace: [{ kind: 'other', name: 'step', latency_s: 1 }] },
    { ...reply, trace: [{ kind: 'tool', name: 'step', latency_s: '1' }] },
  ])('không nhận kết quả thiếu trường hoặc sai hình dạng trace', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })));
    await expect(askParkPlanner('Đi công viên')).rejects.toThrow('Invalid C1 response');
  });

  it('giữ trạng thái mới chưa biết để giao diện xử lý bằng nhãn trung tính', async () => {
    const data = { ...reply, status: 'FUTURE_STATUS' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })));
    await expect(askParkPlanner('Đi công viên')).resolves.toEqual(data);
  });

  it.each(['   ', 'a'.repeat(4001)])('không gửi text ngoài giới hạn hợp đồng', async (text) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(askParkPlanner(text)).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
