import type { EventIcon } from '@/caldav/types';
import { CalendarIcon, GiftIcon, type IconProps } from '@/components/icons';

type Props = IconProps & { icon?: EventIcon };

/**
 * A calendar's mark, in its colour: the gift for a birthday calendar (the
 * widget's marker for it), a calendar for any other. Used wherever a
 * calendar is named — the chips, the day list, Settings.
 */
export function CalendarMark({ icon, size = 14, color }: Props) {
  const Icon = icon === 'gift' ? GiftIcon : CalendarIcon;
  return <Icon size={size} color={color} />;
}
