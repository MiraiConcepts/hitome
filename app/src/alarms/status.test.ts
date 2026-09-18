import {
  permissionState,
  scheduledLabel,
  statusCopy,
  type PermissionSnapshot,
} from './status';

const NATIVE = { canOpenSystemSettings: true };
const WEB = { canOpenSystemSettings: false };

function snapshot(overrides: Partial<PermissionSnapshot>): PermissionSnapshot {
  return { supported: true, granted: false, canAskAgain: true, ...overrides };
}

describe('permissionState', () => {
  it('unsupported wins over everything else', () => {
    expect(permissionState(snapshot({ supported: false, granted: true }))).toBe(
      'unsupported'
    );
  });

  it('granted', () => {
    expect(permissionState(snapshot({ granted: true }))).toBe('granted');
  });

  it('never asked yet', () => {
    expect(permissionState(snapshot({ canAskAgain: true }))).toBe(
      'undetermined'
    );
  });

  it('denied with no prompt left is blocked', () => {
    expect(permissionState(snapshot({ canAskAgain: false }))).toBe('blocked');
  });
});

describe('statusCopy', () => {
  it('offers the prompt only when one can still be shown', () => {
    expect(statusCopy('undetermined', NATIVE).action).toBe('enable');
    expect(statusCopy('granted', NATIVE).action).toBe('none');
    expect(statusCopy('unsupported', NATIVE).action).toBe('none');
  });

  it('routes a blocked native permission to system settings', () => {
    const copy = statusCopy('blocked', NATIVE);
    expect(copy.label).toBe('Blocked');
    expect(copy.action).toBe('open-system-settings');
  });

  it('blocked on web has no action and names the browser instead', () => {
    const copy = statusCopy('blocked', WEB);
    expect(copy.action).toBe('none');
    expect(copy.detail).toContain('site settings');
  });
});

describe('scheduledLabel', () => {
  it('distinguishes unknown from none', () => {
    expect(scheduledLabel(null)).toBe('Counting scheduled reminders…');
    expect(scheduledLabel(0)).toBe(
      'No reminders scheduled for the next 14 days.'
    );
  });

  it('singularizes one', () => {
    expect(scheduledLabel(1)).toBe(
      '1 reminder scheduled for the next 14 days.'
    );
    expect(scheduledLabel(4)).toBe(
      '4 reminders scheduled for the next 14 days.'
    );
  });
});
