'use client';
import * as auth from '@vintrip/api-client/core-api/auth/auth';
import type { MyProfileDto, TravelPreferencesDto } from '@vintrip/api-client/core-api/model/index';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { vi } from '@vintrip/i18n';
import Link from 'next/link';
import { useId, useState } from 'react';
import { surveyHref } from '@/features/onboarding/post-auth';
import { ApiErrorNotice } from '@/features/shared/api-state';
import { useMyProfile } from './account-profile';
import { SaveToast } from './account-toast';
import styles from './account.module.css';

type Draft = Pick<TravelPreferencesDto, 'interests' | 'regions' | 'budgetLevels'>;
type FieldProps = { label: string; options: Record<string, string>; value: string[]; onChange: (next: string[]) => void };

/** Giữ thứ tự mã theo danh sách gốc, không theo thứ tự bấm. */
const ordered = (options: Record<string, string>, codes: string[]) => Object.keys(options).filter((c) => codes.includes(c));

/** Chip chọn nhiều: đang chọn dùng nền --color-coral-soft, chữ --color-coral-ink kèm icon tick. */
function TagPicker({ label, options, value, onChange }: FieldProps) {
  const labelId = useId();
  return (
    <div className="travel-field">
      <span className="travel-field-label" id={labelId}>
        {label}
      </span>
      <div className={styles.chipGroup} role="group" aria-labelledby={labelId}>
        {Object.entries(options).map(([code, text]) => {
          const isSelected = value.includes(code);
          const toggle = () => {
            const next = isSelected ? value.filter((item) => item !== code) : ordered(options, [...value, code]);
            onChange(next);
          };
          return (
            <button
              key={code}
              type="button"
              className={styles.chip}
              aria-pressed={isSelected}
              onClick={toggle}
            >
              {isSelected && (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
                  <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Thẻ "Sở thích du lịch" (TF106): cùng dữ liệu với khảo sát onboarding mobile, lưu vào hồ sơ qua PATCH /auth/me.
 * Chỉ để gợi ý điểm đến; hiện chỉ lưu. Không chọn gì thì lưu status skipped.
 */
export function TravelPreferencesCard({ userId }: { userId: string }) {
  const client = useQueryClient();
  const profile = useMyProfile(userId);
  const saved = profile.data?.travelPreferences ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const current: Draft = draft ?? {
    interests: saved?.interests ?? [],
    regions: saved?.regions ?? [],
    budgetLevels: saved?.budgetLevels ?? [],
  };

  const save = useMutation({
    mutationFn: async (travelPreferences: TravelPreferencesDto | null) =>
      (await auth.accountControllerUpdateProfile({ travelPreferences })).data as MyProfileDto,
    onSuccess: (me) => {
      client.setQueryData(['account', 'me', userId], me);
      setDraft(null);
      setToastKey((k) => k + 1);
    },
  });

  if (!profile.data) return null;
  const isDirty = draft !== null;
  const isEmpty = Object.values(current).every((codes) => !codes.length);

  return (
    <section className={`profile-card ${styles.card}`} aria-labelledby="travel-title">
      <SaveToast message={vi.api.travelSaved} showKey={toastKey} />
      <header className="profile-card-header">
        <div>
          <h2 id="travel-title" className={styles.cardTitle}>
            {vi.api.travelTitle}
          </h2>
        </div>
        <Link prefetch={false} className={`secondary-button ${styles.secondaryBtn}`} href={surveyHref('/account', 'edit')}>
          {vi.api.onboardingRedo}
        </Link>
      </header>
      <form
        className="travel-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ status: isEmpty ? 'skipped' : 'completed', ...current, updatedAt: new Date().toISOString() });
        }}
      >
        <div className="travel-fields">
          <TagPicker
            label={vi.api.travelInterests}
            options={vi.api.travelInterestOptions}
            value={current.interests}
            onChange={(interests) => setDraft({ ...current, interests: interests as Draft['interests'] })}
          />
          <TagPicker
            label={vi.api.travelRegions}
            options={vi.api.travelRegionOptions}
            value={current.regions}
            onChange={(regions) => setDraft({ ...current, regions: regions as Draft['regions'] })}
          />
          <TagPicker
            label={vi.api.travelBudgetLevels}
            options={vi.api.travelBudgetLevelOptions}
            value={current.budgetLevels}
            onChange={(budgetLevels) => setDraft({ ...current, budgetLevels: budgetLevels as Draft['budgetLevels'] })}
          />
        </div>
        {saved && !isDirty && (
          <p className="auth-hint">
            {vi.api.travelUpdatedAt.replace('{time}', new Date(saved.updatedAt).toLocaleString('vi-VN'))}
          </p>
        )}
        <ApiErrorNotice error={save.error} />
        <div className="profile-actions">
          <button className={`primary-button ${styles.primaryBtn}`} disabled={save.isPending || !isDirty} aria-busy={save.isPending}>
            {save.isPending ? vi.api.saving : vi.api.save}
          </button>
          {saved && (
            <button type="button" className={`secondary-button ${styles.secondaryBtn}`} disabled={save.isPending} onClick={() => save.mutate(null)}>
              {vi.api.travelReset}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
