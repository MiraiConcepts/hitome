import { Stack } from 'expo-router';

import { SettingsScreen } from '@/components/settings/settings-screen';

export default function SettingsRoute() {
  return (
    <>
      {/* Presented over the calendar rather than in place of it. A pushed
          screen hides the one below, and on web a hidden scroll container
          loses its offset for good (display:none zeroes scrollTop), so the
          month grid came back five years off — at the top of its ±5y range
          instead of the month the header still named. The settings screen is
          opaque, so "over" and "instead of" look identical. */}
      <Stack.Screen options={{ presentation: 'transparentModal' }} />
      <SettingsScreen />
    </>
  );
}
