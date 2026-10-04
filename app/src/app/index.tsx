import { MonthScreen } from '@/components/calendar/month-screen';
import { useWeekStart } from '@/config/week-start';

export default function HomeRoute() {
  // The grid's week rows and weekday labels are laid out from the first day
  // of the week; changing it in settings rebuilds the screen around it.
  const weekStart = useWeekStart();
  return <MonthScreen key={weekStart} />;
}
