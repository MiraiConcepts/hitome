import {
  commitDeletes,
  deleteEvent,
  fetchMonth,
  setPendingLimitForTests,
  setStoreForTests,
  subscribeStore,
  undoDelete,
} from '../events';
import { fakeStore } from '../fake-store.testing';

// Undo of a whole-event delete on Android. The store cannot put a deleted
// event back as it was (a copy is a new event to the sync app: new UID, no
// sync id, organizer or attendees), so the delete waits out the Undo window
// hidden from every read, and Undo only stops hiding it.

const FROM = new Date(2026, 9, 1);
const TO = new Date(2026, 11, 31);
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour, 0);

let fake: ReturnType<typeof fakeStore>;
let deletes: string[];
beforeEach(() => {
  fake = fakeStore();
  deletes = [];
  const remove = fake.store.delete;
  fake.store.delete = (uri, selection, args) => {
    if (uri.includes('/events/')) deletes.push(uri.split('/').pop()!);
    return remove(uri, selection, args);
  };
  setStoreForTests(fake.store);
  setPendingLimitForTests(10_000);
});
// Nothing left waiting for the next test's store.
afterEach(() => commitDeletes());
afterAll(() => setStoreForTests(null));

/** A row as DAVx⁵ leaves it after a sync, with what a copy would lose. */
async function synced(title: string, uid: string, day = 14) {
  const id = await fake.store.insert('content://com.android.calendar/events', {
    calendar_id: 1,
    title,
    dtstart: at(day).getTime(),
    dtend: at(day, 10).getTime(),
    allDay: 0,
    eventTimezone: 'Asia/Singapore',
    eventStatus: 1,
    deleted: 0,
    uid2445: uid,
    organizer: 'a@example.com',
    hasAttendeeData: 1,
    eventColor: -256,
  });
  await fake.store.insert('content://com.android.calendar/attendees', {
    event_id: Number(id),
    attendeeEmail: 'b@example.com',
  });
  await fake.store.insert('content://com.android.calendar/reminders', {
    event_id: Number(id),
    minutes: 15,
    method: 1,
  });
  const event = (await fetchMonth(FROM, TO)).find((e) => e.summary === title)!;
  return { id: Number(id), event };
}

const row = (id: number) => fake.events.find((e) => e._id === id);
const titles = async () => (await fetchMonth(FROM, TO)).map((e) => e.summary);

describe('store undo of a whole-event delete', () => {
  it('keeps the very same row: id, UID, sync id, organizer, attendees, reminders', async () => {
    const { id, event } = await synced('Board', 'board-1@example.com');
    const before = JSON.stringify(row(id));
    await deleteEvent(event, 'all');
    expect(await titles()).toEqual([]);
    await undoDelete(event, 'all');
    expect(await titles()).toEqual(['Board']);
    expect(fake.events).toHaveLength(1);
    expect(JSON.stringify(row(id))).toBe(before);
    expect(row(id)).toMatchObject({
      uid2445: 'board-1@example.com',
      _sync_id: `remote-${id}`,
      organizer: 'a@example.com',
    });
    expect(fake.attendees).toEqual([
      expect.objectContaining({ event_id: id, attendeeEmail: 'b@example.com' }),
    ]);
    expect(fake.reminders).toHaveLength(1);
    expect(deletes).toEqual([]);
    // Undo wrote nothing, and nothing is left to commit.
    await commitDeletes();
    expect(deletes).toEqual([]);
    expect(row(id)).toBeDefined();
  });

  it('writes nothing until the window ends, and hides the event meanwhile', async () => {
    const { id, event } = await synced('Board', 'board-1@example.com');
    await deleteEvent(event, 'all');
    expect(row(id)).toBeDefined();
    expect(await titles()).toEqual([]);
    await commitDeletes();
    expect(deletes).toEqual([String(id)]);
    expect(row(id)).toBeUndefined();
    await expect(undoDelete(event, 'all')).rejects.toThrow('Nothing to undo');
  });

  it('commits when its time runs out', async () => {
    setPendingLimitForTests(20);
    const { id, event } = await synced('Board', 'board-1@example.com');
    await deleteEvent(event, 'all');
    expect(row(id)).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(deletes).toEqual([String(id)]);
    expect(row(id)).toBeUndefined();
  });

  it('commits the first delete when a second one starts', async () => {
    const first = await synced('Board', 'board-1@example.com', 14);
    const second = await synced('Lunch', 'lunch-1@example.com', 15);
    await deleteEvent(first.event, 'all');
    await deleteEvent(second.event, 'all');
    expect(deletes).toEqual([String(first.id)]);
    expect(row(first.id)).toBeUndefined();
    await expect(undoDelete(first.event, 'all')).rejects.toThrow();
    // The second is still the one Undo can keep.
    await undoDelete(second.event, 'all');
    expect(await titles()).toEqual(['Lunch']);
    expect(row(second.id)?.uid2445).toBe('lunch-1@example.com');
  });

  it('commits once however often the window is ended', async () => {
    const { id, event } = await synced('Board', 'board-1@example.com');
    await deleteEvent(event, 'all');
    // The screen ends it (bar gone, app sent to the back) as the timer does.
    await Promise.all([commitDeletes(), commitDeletes()]);
    await commitDeletes();
    expect(deletes).toEqual([String(id)]);
  });

  it('hides every occurrence of a deleted series and its exceptions', async () => {
    const { id } = await synced('Standup', 'standup-1@example.com', 5);
    await fake.store.update(
      `content://com.android.calendar/events/${id}`,
      { rrule: 'FREQ=WEEKLY;COUNT=4', duration: 'PT3600S', dtend: null },
      null
    );
    await fake.store.insert(`content://com.android.calendar/exception/${id}`, {
      originalInstanceTime: at(12).getTime(),
      title: 'Retro',
    });
    const all = await fetchMonth(FROM, TO);
    expect(all.map((e) => e.summary)).toEqual([
      'Standup',
      'Retro',
      'Standup',
      'Standup',
    ]);
    await deleteEvent(all[1], 'all');
    expect(await titles()).toEqual([]);
    await undoDelete(all[1], 'all');
    expect(await titles()).toHaveLength(4);
    expect(deletes).toEqual([]);
  });

  it('tells subscribers when a delete starts and ends its wait', async () => {
    const { event } = await synced('Board', 'board-1@example.com');
    let calls = 0;
    const stop = subscribeStore(() => calls++);
    await deleteEvent(event, 'all');
    expect(calls).toBe(1);
    await undoDelete(event, 'all');
    expect(calls).toBe(2);
    stop();
  });

  it('leaves a failed commit showing rather than seeming gone', async () => {
    const { event } = await synced('Board', 'board-1@example.com');
    await deleteEvent(event, 'all');
    fake.store.delete = async () => {
      throw new Error('no access');
    };
    await commitDeletes();
    expect(await titles()).toEqual(['Board']);
  });
});
