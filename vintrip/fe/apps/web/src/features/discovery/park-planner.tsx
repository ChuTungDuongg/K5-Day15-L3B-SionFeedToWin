'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { vi } from '@vintrip/i18n';
import { askParkPlanner, type ParkPlanReply } from './park-planner-api';
import { PARK_PLANNER_SAMPLE, PARK_PLANNER_SAMPLE_QUESTION } from './park-planner-sample';
import styles from './park-planner.module.css';

type View = { kind: 'empty' | 'loading' | 'error' }
  | { kind: 'result'; reply: ParkPlanReply; sample: boolean };

const copy = vi.parkPlanner;
const tones = {
  VALID: styles.success,
  NEEDS_INPUT: styles.warning,
  MISSING_DATA: styles.warning,
  SEARCH_TIMEOUT: styles.warning,
  INFEASIBLE: styles.caution,
  'TỪ CHỐI': styles.caution,
  'CHƯA HỢP LỆ': styles.caution,
};

export function ParkPlanner() {
  const questionId = useId();
  const [text, setText] = useState('');
  const [view, setView] = useState<View>({ kind: 'empty' });
  const request = useRef<AbortController | null>(null);
  const busy = view.kind === 'loading';
  const status = view.kind === 'result' ? view.reply.status : '';
  const statusLabel = Object.hasOwn(copy.statuses, status)
    ? copy.statuses[status as keyof typeof copy.statuses] : copy.otherStatus;
  const statusTone = Object.hasOwn(tones, status) ? tones[status as keyof typeof tones] : styles.neutral;

  useEffect(() => () => {
    const controller = request.current;
    request.current = null;
    controller?.abort();
  }, []);

  function changeQuestion(value: string) {
    setText(value);
    if (view.kind === 'result') setView({ kind: 'empty' });
  }

  async function ask() {
    if (request.current || !text.trim() || text.trim().length > 4000) return;
    const controller = new AbortController();
    request.current = controller;
    setView({ kind: 'loading' });
    try {
      const reply = await askParkPlanner(text, controller.signal);
      if (request.current === controller) setView({ kind: 'result', reply, sample: false });
    } catch {
      if (request.current === controller && !controller.signal.aborted) setView({ kind: 'error' });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask();
  }

  return (
    <div className={styles.planner}>
      <form onSubmit={submit} className={styles.form} aria-label={copy.pageTitle} aria-busy={busy}>
        <label htmlFor={questionId}>{copy.question}</label>
        <p id={`${questionId}-hint`} className={styles.hint}>{copy.questionHint}</p>
        <textarea id={questionId} aria-describedby={`${questionId}-hint`} rows={6}
          maxLength={4000} required disabled={busy} value={text}
          onChange={(event) => changeQuestion(event.target.value)} />
        <div className={styles.examples} aria-label={copy.examplesLabel}>
          {copy.examples.map((example) => (
            <button type="button" key={example.label} disabled={busy}
              onClick={() => changeQuestion(example.text)}>{example.label}</button>
          ))}
        </div>
        <button type="submit" className="primary-button" disabled={busy || !text.trim()}>
          {busy ? copy.loading : copy.send}
        </button>
      </form>
      <div className={styles.result} aria-live="polite">
        {view.kind === 'empty' && (
          <div className={styles.state}>
            <h3>{copy.empty}</h3>
            <p>{copy.emptyHint}</p>
          </div>
        )}
        {busy && (
          <div className={styles.state} role="status">
            <p className={styles.loading}>{copy.loading}</p>
            <p>{copy.loadingHint}</p>
            <div className={styles.skeleton} aria-hidden="true" />
          </div>
        )}
        {view.kind === 'error' && (
          <div className={styles.state}>
            <p role="alert">{copy.error}</p>
            <button type="button" className="secondary-button" disabled={!text.trim()} onClick={() => void ask()}>{copy.retry}</button>
          </div>
        )}
        {(view.kind === 'empty' || view.kind === 'error') && (
          <button type="button" className={`secondary-button ${styles.sampleButton}`}
            onClick={() => setView({ kind: 'result', reply: PARK_PLANNER_SAMPLE, sample: true })}>
            {copy.sample}
          </button>
        )}
        {view.kind === 'result' && (
          <section className={styles.answer} aria-label={copy.result}>
            {view.sample && (
              <>
                <p className={styles.sampleNotice}>{copy.sampleNotice}</p>
                <p className={styles.sampleQuestion}><strong>{copy.sampleQuestion}: </strong>{PARK_PLANNER_SAMPLE_QUESTION}</p>
              </>
            )}
            <div className={styles.answerHead}>
              <h3>{copy.result}</h3>
              <span className={`${styles.badge} ${statusTone}`}>
                {statusLabel} ({view.reply.status})
              </span>
            </div>
            <p className={styles.output}>{view.reply.output}</p>
            <details className={styles.trace}>
              <summary>{copy.trace} ({view.reply.trace.length})</summary>
              <p>{copy.snapshot} {view.reply.snapshot_id}</p>
              <ol>
                {view.reply.trace.map((step, index) => (
                  <li key={index}>{step.kind} · <code>{step.name}</code> · {step.latency_s} {copy.seconds}</li>
                ))}
              </ol>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}
