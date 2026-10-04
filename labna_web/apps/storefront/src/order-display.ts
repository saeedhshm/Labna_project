import type { OrderStatus } from '@labna/contracts';

export const statusCopy: Record<OrderStatus, { ar: string; en: string }> = {
  pending: { ar: 'قيد المراجعة', en: 'Pending' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  preparing: { ar: 'جار التحضير', en: 'Preparing' },
  ready: { ar: 'جاهز', en: 'Ready' },
  out_for_delivery: { ar: 'خرج للتوصيل', en: 'Out for delivery' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
};

export const timeline: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];

export function dateTime(value: string, locale: 'ar' | 'en') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
