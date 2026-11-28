type Section = 'intro' | 'schedule' | 'money' | 'closing';
type SourceLine = { raw: string; newline: string; section: Section };

export type ParkPlannerLine = SourceLine & (
  | { kind: 'paragraph' | 'heading' }
  | { kind: 'schedule'; prefix: string; start: string; end: string; dash: string;
      separator: string; text: string; isWalk: boolean; icon?: 'show' | 'lunch' }
  | { kind: 'money'; prefix: string; label: string; delimiter: string; amount: string; isTotal: boolean }
  | { kind: 'check'; success: boolean }
);

export type FormattedParkPlannerOutput =
  | { kind: 'plain'; text: string }
  | { kind: 'structured'; lines: ParkPlannerLine[] };

/** Presentation only: preserve every source character, including unknown lines and CR/LF. */
export function formatParkPlannerOutput(output: string): FormattedParkPlannerOutput {
  const source = Array.from(output.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g))
    .filter((match) => match[0] !== '')
    .map((match) => ({ raw: match[1] ?? '', newline: match[2] ?? '' }));
  if (!source.some((line) => line.raw.trim() === 'Lịch:')) return { kind: 'plain', text: output };

  let section: Section = 'intro';
  const lines: ParkPlannerLine[] = source.map(({ raw, newline }) => {
    if (raw.trim() === 'Lịch:') {
      section = 'schedule';
      return { kind: 'heading', raw, newline, section };
    }
    if (section !== 'intro' && /^\s*Bảng tiền\b/u.test(raw)) {
      section = 'money';
      return { kind: 'heading', raw, newline, section };
    }
    if (section !== 'intro' && /^\s*Kiểm độc lập:/u.test(raw)) {
      section = 'closing';
      return { kind: 'check', raw, newline, section,
        success: /^\s*Kiểm độc lập:\s*0+\s+vi phạm\b/u.test(raw) };
    }
    if (section === 'schedule') {
      const match = raw.match(/^([ \t]*)((?:[01]\d|2[0-3]):[0-5]\d)([–—-])((?:[01]\d|2[0-3]):[0-5]\d)([ \t]*·[ \t]*)(.+)$/u);
      if (match) {
        const [, prefix = '', start = '', dash = '', end = '', separator = '', text = ''] = match;
        return { kind: 'schedule', raw, newline, section, prefix, start, end, dash, separator, text,
          isWalk: /^đi bộ(?:\s|$)/u.test(text),
          icon: /Show/iu.test(text) ? 'show' : /Ăn trưa/iu.test(text) ? 'lunch' : undefined };
      }
    }
    if (section === 'money') {
      const match = raw.match(/^([ \t]*)([^:]+)(:[ \t]*)(\d[\d., \t]*(?:đ|₫|VND).*)$/u);
      if (match) {
        const [, prefix = '', label = '', delimiter = '', amount = ''] = match;
        return { kind: 'money', raw, newline, section, prefix, label, delimiter, amount,
          isTotal: label.trim() === 'Tổng' };
      }
    }
    return { kind: 'paragraph', raw, newline, section };
  });
  return { kind: 'structured', lines };
}

/** Round-trip helper: do not regenerate or recalculate any text/numbers from parsed fields. */
export function joinParkPlannerOutput(output: FormattedParkPlannerOutput): string {
  return output.kind === 'plain' ? output.text : output.lines.map((line) => line.raw + line.newline).join('');
}
