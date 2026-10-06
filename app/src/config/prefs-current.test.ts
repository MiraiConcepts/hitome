import { ensureDefaultAlert, setDefaultAlert } from './alert-pref';
import { ensureDefaultCalendar, setDefaultCalendar } from './calendar-pref';
import {
  ensureHiddenCalendars,
  setCalendarHidden,
} from './calendar-visibility';

// Each pref loads once and is then changed in memory. A later ensure*() must
// answer with the change, not with what the one load first read: the widget's
// fetch and new events read these long after Settings changed them.
describe('prefs answer with their current value', () => {
  it('hidden calendars', async () => {
    expect(await ensureHiddenCalendars()).toEqual([]);
    setCalendarHidden('store:2/', true);
    expect(await ensureHiddenCalendars()).toEqual(['store:2/']);
    setCalendarHidden('store:2/', false);
    expect(await ensureHiddenCalendars()).toEqual([]);
  });

  it('default calendar', async () => {
    expect(await ensureDefaultCalendar()).toBeNull();
    setDefaultCalendar('store:3/');
    expect(await ensureDefaultCalendar()).toBe('store:3/');
  });

  it('default alert', async () => {
    expect(await ensureDefaultAlert()).toBeNull();
    setDefaultAlert(10);
    expect(await ensureDefaultAlert()).toBe(10);
  });
});
