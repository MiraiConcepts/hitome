import appConfig from '../../app.json';

import { APP_LINK, eventLink, newEventLink } from './links';

// The widget's taps are deep links into this app. They once used a scheme the
// release manifest no longer carried, so the published widget opened nothing
// (the dev build still had it, which hid the problem). Tie the two together.
describe('widget deep links', () => {
  it('open the app through the scheme app.json registers', () => {
    expect(APP_LINK).toBe(`${appConfig.expo.scheme}:///`);
  });

  it('carry the day and event, or a new-event stamp', () => {
    expect(eventLink('2026-10-12', 'a b:1')).toBe(
      `${APP_LINK}?day=2026-10-12&event=a%20b%3A1`
    );
    expect(newEventLink(5)).toBe(`${APP_LINK}?new=5`);
  });
});
