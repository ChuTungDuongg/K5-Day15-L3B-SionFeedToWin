import { formatParkPlannerOutput } from './park-planner-format';
import styles from './park-planner.module.css';

function OutputIcon({ kind }: { kind: 'walk' | 'show' | 'lunch' | 'check' | 'warning' }) {
  const paths = {
    walk: 'M14 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 7l-3 5-4 2m7-7 4 5 4 1m-8-6-1 8-4 6m4-6 5 6',
    show: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
    lunch: 'M4 3v6m3-6v6m3-6v6M4 9h6M7 9v12M18 3c-3 4-3 8 0 9h2V3Zm2 9v9',
    check: 'm5 12 4 4L19 6',
    warning: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v1',
  };
  return <svg className={styles.outputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}

/** All visible output text comes from the original fields; icons contain no extra text. */
export function ParkPlannerOutput({ output }: { output: string }) {
  const formatted = formatParkPlannerOutput(output);
  if (formatted.kind === 'plain') {
    return <div className={styles.output} data-output-format="plain"><p className={styles.paragraph}>{formatted.text}</p></div>;
  }
  return (
    <div className={styles.output} data-output-format="structured">
      {formatted.lines.map((line, index) => {
        if (line.kind === 'heading') {
          return <h4 key={index} className={styles.outputHeading}>{line.raw}{line.newline}</h4>;
        }
        if (line.kind === 'schedule') {
          return (
            <div key={index} className={`${styles.timelineItem} ${line.isWalk ? styles.walkItem : ''}`}>
              <span className={styles.timeCell}>{line.prefix}<span className={styles.timeBadge}>
                {line.start}{line.dash}{line.end}
              </span></span>
              <span className={styles.activityText}>{line.separator}
                {line.isWalk ? <OutputIcon kind="walk" /> : line.icon ? <OutputIcon kind={line.icon} /> : null}
                {line.text}
              </span>{line.newline}
            </div>
          );
        }
        if (line.kind === 'money') {
          const amount = line.isTotal ? line.amount.match(/^(\d[\d., \t]*(?:đ|₫|VND))(.*)$/u) : null;
          return (
            <div key={index} className={`${styles.moneyRow} ${line.isTotal ? styles.totalRow : ''}`}>
              <span className={styles.moneyLabel}>{line.prefix}{line.label}{line.delimiter}</span>
              <span className={styles.moneyAmount}>{amount ? amount[1] : line.amount}
                {amount?.[2] && <span className={styles.budgetRemainder}>{amount[2]}</span>}
              </span>{line.newline}
            </div>
          );
        }
        if (line.kind === 'check') {
          return <p key={index} className={`${styles.checkNotice} ${line.success ? styles.checkSuccess : styles.checkWarning}`}>
            <OutputIcon kind={line.success ? 'check' : 'warning'} /><span>{line.raw}{line.newline}</span>
          </p>;
        }
        return <p key={index} className={`${styles.paragraph} ${line.section === 'intro' ? styles.intro : ''}`}>{line.raw}{line.newline}</p>;
      })}
    </div>
  );
}
