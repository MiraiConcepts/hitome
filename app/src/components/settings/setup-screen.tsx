import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  ConnectionFields,
  useServerForm,
} from '@/components/settings/server-form';
import { SettingsButton } from '@/components/settings/settings-parts';
import { HEADER_TITLE_TYPE } from '@/components/calendar/month-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, FontFamilyBold, Spacing } from '@/constants/theme';

const ICON_SIZE = 72;
/** Collapsed while typing: the icon sits beside the name as a header. */
const ICON_SIZE_COLLAPSED = 40;

/** One shared timing for every piece that moves, so they land together. */
const COLLAPSE = LinearTransition.duration(220);

/**
 * First run. Nothing in this app works without a calendar server, so this is a
 * gate rather than a prompt over an empty grid: the app's icon and name, the
 * connection fields settings also uses, and Connect pinned to the bottom-right
 * corner, where it rides up with the keyboard.
 *
 * Typing collapses the icon and name into a header — icon shrunk beside the
 * name, top-left, the way the month view's title sits — which gives the
 * keyboard the room the big centred brand was taking.
 */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const form = useServerForm();
  const { collapsed, keyboardInset, onFieldFocus, onFieldBlur } =
    useCollapsedWhileTyping();
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={[
            styles.body,
            collapsed && styles.bodyCollapsed,
          ]}
          keyboardShouldPersistTaps="handled"
          testID="setup-screen"
        >
          <Animated.View
            layout={COLLAPSE}
            style={[styles.brand, collapsed && styles.brandCollapsed]}
          >
            <Animated.Image
              layout={COLLAPSE}
              source={require('@/assets/images/icon.png')}
              style={collapsed ? styles.iconCollapsed : styles.icon}
              accessibilityIgnoresInvertColors
            />
            <Animated.View layout={COLLAPSE}>
              <AppName centred={!collapsed} />
            </Animated.View>
          </Animated.View>
          <Animated.View layout={COLLAPSE}>
            <ConnectionFields
              form={form}
              onFieldFocus={onFieldFocus}
              onFieldBlur={onFieldBlur}
              help
            />
          </Animated.View>
        </ScrollView>
        <View
          style={[
            styles.footer,
            {
              // Above the keyboard while it is up, above the nav bar when not.
              paddingBottom:
                (keyboardInset > 0 ? keyboardInset : insets.bottom) +
                Spacing.three,
            },
          ]}
        >
          <SettingsButton
            label="Connect"
            variant="filled"
            busy={form.busy}
            onPress={form.save}
            testID="settings-save"
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Whether the screen is in its typing layout. Focusing any field collapses it;
 * it opens back up when the keyboard goes away or focus leaves the fields.
 * Blur waits a moment because moving between fields blurs one before focusing
 * the next, which would otherwise bounce the header open and shut. The
 * keyboard events cover Android's back button, which hides the keyboard but
 * leaves the field focused.
 *
 * Also reports how much of the screen the keyboard covers, so the Connect
 * button can sit on top of it. Measured here rather than left to
 * KeyboardAvoidingView, which on an edge-to-edge Android window kept part of
 * its padding after the keyboard closed and stranded the button mid-screen.
 */
function useCollapsedWhileTyping() {
  const [collapsed, setCollapsed] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      setCollapsed(true);
      setKeyboardInset(
        Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY)
      );
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setCollapsed(false);
      setKeyboardInset(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  function onFieldFocus() {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setCollapsed(true);
  }

  function onFieldBlur() {
    blurTimer.current = setTimeout(() => setCollapsed(false), 100);
  }

  return { collapsed, keyboardInset, onFieldFocus, onFieldBlur };
}

/**
 * "hitome" with the build's version set small on its baseline, as a
 * subscript. Centred under the icon, a transparent copy of the version leads
 * the row so the name itself stays dead centre; as a header it is dropped.
 */
function AppName({ centred }: { centred: boolean }) {
  const version = `v${Constants.expoConfig?.version ?? '?'}${__DEV__ ? ' dev' : ''}`;
  return (
    <View style={styles.nameRow}>
      {centred && (
        <ThemedText
          style={[styles.version, styles.hidden]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {version}
        </ThemedText>
      )}
      <ThemedText style={styles.title}>hitome</ThemedText>
      <ThemedText
        themeColor="textSecondary"
        style={styles.version}
        testID="setup-version"
      >
        {version}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  body: {
    padding: Spacing.three,
    paddingTop: Spacing.six + Spacing.five,
    gap: Spacing.five,
    // Centred on a wide window — this is a form, not the full-bleed grid.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  bodyCollapsed: {
    paddingTop: Spacing.three,
    gap: Spacing.five + Spacing.two,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  brandCollapsed: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: Spacing.three - Spacing.one,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  iconCollapsed: {
    width: ICON_SIZE_COLLAPSED,
    height: ICON_SIZE_COLLAPSED,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  title: {
    fontFamily: FontFamilyBold,
    color: AccentColor,
    // Set exactly as the month title is once you are through.
    ...HEADER_TITLE_TYPE,
  },
  version: {
    fontSize: 11,
    lineHeight: 14,
  },
  hidden: {
    opacity: 0,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
