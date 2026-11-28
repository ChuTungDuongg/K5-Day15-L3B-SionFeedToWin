import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatParkPlannerOutput, joinParkPlannerOutput } from './park-planner-format';
import { ParkPlannerOutput } from './park-planner-output';
import { PARK_PLANNER_SAMPLE } from './park-planner-sample';
import styles from './park-planner.module.css';

function visibleText(output: string) {
  return renderToStaticMarkup(createElement(ParkPlannerOutput, { output }))
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

describe('Định dạng kết quả chỉ thay trình bày, không viết lại nội dung', () => {
  it('run-4: 11 dòng lịch, 5 đi bộ, 4 dòng tiền + 1 tổng và 1 kiểm độc lập; ghép lại đúng nguyên văn', () => {
    const output = formatParkPlannerOutput(PARK_PLANNER_SAMPLE.output);
    expect(output.kind).toBe('structured');
    if (output.kind !== 'structured') throw new Error('Expected structured sample');
    const schedule = output.lines.filter((line) => line.kind === 'schedule');
    expect(schedule).toHaveLength(11);
    expect(schedule.filter((line) => line.isWalk)).toHaveLength(5);
    const money = output.lines.filter((line) => line.kind === 'money');
    expect(money.filter((line) => !line.isTotal)).toHaveLength(4);
    expect(money.filter((line) => line.isTotal)).toHaveLength(1);
    expect(output.lines.filter((line) => line.kind === 'check')).toHaveLength(1);
    expect(schedule[1]).toMatchObject({ start: '09:05', end: '10:15', isWalk: false });
    expect(money.at(-1)).toMatchObject({ label: 'Tổng', amount: '1.370.000đ · còn 130.000đ (ngân sách 1.500.000đ)', isTotal: true });
    expect(joinParkPlannerOutput(output)).toBe(PARK_PLANNER_SAMPLE.output);
    expect(visibleText(PARK_PLANNER_SAMPLE.output)).toBe(PARK_PLANNER_SAMPLE.output);
  });

  it.each([
    'Trạng thái: NEEDS_INPUT\nBạn cho biết giờ đi chơi nhé?',
    'TỪ CHỐI\r\nMình không thể hỗ trợ yêu cầu này.',
    'MISSING_DATA\nBảng tiền: chưa có giá\nKiểm độc lập: chưa đủ dữ liệu.',
    '',
  ])('không có Lịch: giữ thành đoạn văn: %s', (text) => {
    const formatted = formatParkPlannerOutput(text);
    expect(formatted).toEqual({ kind: 'plain', text });
    expect(joinParkPlannerOutput(formatted)).toBe(text);
    expect(visibleText(text)).toBe(text);
  });

  it('giữ dòng lạ, dòng trống, dấu phân cách và xuống dòng khác nhau đúng vị trí', () => {
    const text = 'Chào bạn & cả nhà!\r\n\r\nLịch:\n  08:00-09:00 · Show <mẫu>\rDòng thêm chưa biết\n  25:00–26:00 · Giờ lạ\nBảng tiền (mô phỏng):\r\n  Vé: 012.345đ\n  Chưa có số tiền: đang hỏi\n  Tổng: 012.345đ · còn 0đ\nKiểm độc lập: 2 vi phạm.\nGhi chú cuối.\n';
    const output = formatParkPlannerOutput(text);
    expect(output.kind).toBe('structured');
    if (output.kind !== 'structured') throw new Error('Expected structured output');
    expect(output.lines.find((line) => line.raw === 'Dòng thêm chưa biết')).toMatchObject({ kind: 'paragraph', section: 'schedule' });
    expect(output.lines.find((line) => line.raw.includes('25:00'))).toMatchObject({ kind: 'paragraph' });
    expect(output.lines.find((line) => line.raw.includes('đang hỏi'))).toMatchObject({ kind: 'paragraph', section: 'money' });
    expect(output.lines.at(-1)).toMatchObject({ kind: 'paragraph', raw: 'Ghi chú cuối.' });
    expect(joinParkPlannerOutput(output)).toBe(text);
    expect(visibleText(text)).toBe(text);
  });

  it.each(['0', '2', '10', '0.5'])('kiểm độc lập chỉ hiện thành công khi số vi phạm là 0 (%s)', (count) => {
    const text = `Lịch:\nKiểm độc lập: ${count} vi phạm; cần xem lại.`;
    const formatted = formatParkPlannerOutput(text);
    if (formatted.kind !== 'structured') throw new Error('Expected structured output');
    expect(formatted.lines.at(-1)).toMatchObject({ kind: 'check', success: count === '0' });
    const html = renderToStaticMarkup(createElement(ParkPlannerOutput, { output: text }));
    expect(html).toContain(count === '0' ? styles.checkSuccess : styles.checkWarning);
    expect(visibleText(text)).toBe(text);
  });

  it('khung giờ là phần tử riêng; đi bộ, show và ăn trưa có cách nhấn khác nhau', () => {
    const html = renderToStaticMarkup(createElement(ParkPlannerOutput, { output: PARK_PLANNER_SAMPLE.output }));
    expect(html).toContain(`class="${styles.timeBadge}">09:05–10:15</span>`);
    expect(html).toContain(styles.walkItem);
    expect(html).toContain(styles.totalRow); expect(html).toContain(styles.budgetRemainder);
    const output = formatParkPlannerOutput(PARK_PLANNER_SAMPLE.output);
    if (output.kind !== 'structured') throw new Error('Expected structured output');
    expect(output.lines.filter((line) => line.kind === 'schedule' && line.icon === 'show')).toHaveLength(1);
    expect(output.lines.filter((line) => line.kind === 'schedule' && line.icon === 'lunch')).toHaveLength(1);
  });
});
