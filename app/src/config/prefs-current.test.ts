import { ensureDefaultAlert, setDefaultAlert } from './alert-pref';
import { ensureDefaultCalendar, setDefaultCalendar } from './calendar-pref';
import { ensureCalendarRoles, setCalendarRole } from './calendar-visibility';

// Each pref loads once and is then changed in memory. A later ensure*() must
// answer with the change, not with what the one load first read: the widget's
// fetch and new events read these long after Settings changed them.
describe('prefs answer with their current value', () => {
  it('calendar roles', async () => {
    expect(await ensureCalendarRoles()).toEqual({ hidden: [], tray: [] });
    setCalendarRole('store:2/', 'hidden');
    expect(await ensureCalendarRoles()).toEqual({
      hidden: ['store:2/'],
      tray: [],
    });
    setCalendarRole('store:2/', 'tray');
    expect(await ensureCalendarRoles()).toEqual({
      hidden: [],
      tray: ['store:2/'],
    });
    setCalendarRole('store:2/', 'shown');
    expect(await ensureCalendarRoles()).toEqual({ hidden: [], tray: [] });
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
