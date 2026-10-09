// THROWAWAY gallery (see app/src/gallery/REVERT.md). The month screen's
// toasts and its connection bar, and the widget.
import { StyleSheet, View } from 'react-native';

import { SnackBar } from '@/components/calendar/month-screen';
import {
  AlertCircleIcon,
  CalendarPlusIcon,
  CheckIcon,
  RefreshIcon,
  TrashIcon,
  WifiOffIcon,
} from '@/components/icons';
import { SettingsButton } from '@/components/settings/settings-parts';
import { webConnectionProblem } from '@/config/dav-config';
import { Spacing } from '@/constants/theme';

import { Note, Row, Section, Specimen, Tag, useGalleryToast } from '../parts';
import { WidgetPreviewCard } from '../widget-preview';

const noop = () => {};

const TOASTS = [
  ['Event added', CalendarPlusIcon, undefined],
  ['Saved', CheckIcon, undefined],
  ['Event deleted', TrashIcon, 'Undo'],
  ['Occurrence deleted', TrashIcon, 'Undo'],
  ['Following occurrences deleted', TrashIcon, 'Undo'],
  ['Event changed elsewhere. List refreshed', RefreshIcon, undefined],
  [
    'Not deleted. The calendar server didn’t answer. Try again in a moment.',
    AlertCircleIcon,
    undefined,
  ],
] as const;

export function ToastsSection() {
  const toast = useGalleryToast();
  const offline = webConnectionProblem('unreachable', '');
  const login = webConnectionProblem('unauthorized', '');
  return (
    <Section
      id="toasts"
      title="Toasts and banners"
      intro="SnackBar (month-screen.tsx, exported for the gallery). Bottom right in the app, 8 s, one at a time; the connection bar stays while the problem lasts."
    >
      <Specimen
        name="SnackBar: results"
        file="components/calendar/month-screen.tsx"
        shows="Every message the editor and the day list end with; the bin's toasts carry Undo; a failed delete or undo shows the reason"
      >
        {TOASTS.map(([message, icon, action]) => (
          <View key={message} style={styles.toast}>
            <SnackBar
              icon={icon}
              message={message}
              action={action ? { label: action, onPress: noop } : undefined}
            />
          </View>
        ))}
      </Specimen>

      <Specimen
        name="SnackBar: connection bar"
        file="components/calendar/month-screen.tsx (error-banner)"
        shows="When a fetch fails after something has loaded: offline (Retry), login rejected (web: Retry; Android without a problem text: Settings)"
      >
        <View style={styles.toast}>
          <SnackBar
            icon={WifiOffIcon}
            message={offline.title}
            action={{ label: 'Retry', onPress: noop }}
          />
        </View>
        <View style={styles.toast}>
          <SnackBar
            icon={AlertCircleIcon}
            message={login.title}
            action={{ label: 'Retry', onPress: noop }}
          />
        </View>
        <View style={styles.toast}>
          <SnackBar
            icon={AlertCircleIcon}
            message="Login rejected"
            action={{ label: 'Settings', onPress: noop }}
          />
        </View>
        <Tag>a long message, cut at two lines</Tag>
        <View style={styles.toast}>
          <SnackBar
            icon={WifiOffIcon}
            message="The calendar server didn’t answer. Check that this device is on the network or VPN the server is on, then try again, and if that fails too, try again later."
            action={{ label: 'Retry', onPress: noop }}
          />
        </View>
      </Specimen>

      <Specimen
        name="Raise a toast in place"
        file="parts.tsx ToastHost (the month screen's placement)"
        shows="Bottom right, fades in, gone after 8 s or on its action"
      >
        <Row gap={Spacing.two}>
          <SettingsButton
            label="Event added"
            onPress={() =>
              toast({ icon: CalendarPlusIcon, message: 'Event added' })
            }
          />
          <SettingsButton
            label="Event deleted + Undo"
            onPress={() =>
              toast({
                icon: TrashIcon,
                message: 'Event deleted',
                action: 'Undo',
              })
            }
          />
          <SettingsButton
            label="Offline bar"
            onPress={() =>
              toast({
                icon: WifiOffIcon,
                message: offline.title,
                action: 'Retry',
              })
            }
          />
        </Row>
      </Specimen>

      <Note>
        Status lines elsewhere: the header&apos;s second line (today, Offline ·
        Updated, Login rejected) is under Calendar; Version and Channel are in
        About under Settings card.
      </Note>
    </Section>
  );
}

export function WidgetSection() {
  return (
    <Section
      id="widget"
      title="Android widget"
      intro="Drawn with react-native-android-widget's own primitives (widget/agenda.tsx), not React Native views."
    >
      <WidgetPreviewCard />
    </Section>
  );
}

const styles = StyleSheet.create({
  toast: {
    alignItems: 'flex-start',
  },
});
