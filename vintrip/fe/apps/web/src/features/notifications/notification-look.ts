import { getNotificationAge } from '@vintrip/app-core';
import { t, vi } from '@vintrip/i18n';

/** Thông báo do người khác gây ra thì hiện avatar người đó; còn lại là thông báo của Vintrip (đơn, kiểm duyệt, video). */
export type NotificationKind = 'comment' | 'reaction' | 'follow' | 'vintrip';

export function getNotificationKind(type: string): NotificationKind {
  if (type.startsWith('comment.')) return 'comment';
  if (type.startsWith('reaction.')) return 'reaction';
  if (type.startsWith('follow.')) return 'follow';
  return 'vintrip';
}

export function formatNotificationTime(createdAt: Date, now: Date): string {
  const age = getNotificationAge(createdAt, now);
  if (age.kind === 'justNow') return vi.api.notificationsJustNow;
  if (age.kind === 'minutes') return t('api.notificationsMinutesAgo', { count: age.count });
  if (age.kind === 'hours') return t('api.notificationsHoursAgo', { count: age.count });
  if (age.kind === 'yesterday') return vi.api.notificationsYesterday;
  return createdAt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
}
