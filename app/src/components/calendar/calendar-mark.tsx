import type { EventIcon } from '@/caldav/types';
import {
  CalendarIcon,
  ConfettiIcon,
  GiftIcon,
  type IconProps,
} from '@/components/icons';

type Props = IconProps & { icon?: EventIcon };

/**
 * A calendar's mark, in its colour: the gift for a birthday calendar and
 * confetti for a holiday one (the widget's markers for them), a calendar for
 * any other. Used wherever a
 * calendar is named — the chips, the day list, Settings.
 */
export function CalendarMark({ icon, size = 14, color }: Props) {
  const Icon =
    icon === 'gift'
      ? GiftIcon
      : icon === 'confetti'
        ? ConfettiIcon
        : CalendarIcon;
  return <Icon size={size} color={color} />;
}
