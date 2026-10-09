// THROWAWAY gallery (see app/src/gallery/REVERT.md). Every icon, and the
// primitives everything else is built from.
import { useEffect, useState, type ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import { BootScreen, LARGE_SPINNER } from '@/components/boot-screen';
import { Brand } from '@/components/brand';
import { CalendarMark } from '@/components/calendar/calendar-mark';
import * as Icons from '@/components/icons';
import { LoadingBar } from '@/components/loading-bar';
import { AppName } from '@/components/settings/app-name';
import { Spinner } from '@/components/spinner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Colors, DangerColor, Spacing } from '@/constants/theme';

import { Row, Section, Specimen, Tag } from '../parts';
import { SAMPLE_CALENDARS } from '../sample-data';

const ICONS = Object.entries(Icons)
  .filter(([name]) => name.endsWith('Icon'))
  .sort(([a], [b]) => a.localeCompare(b)) as [
  string,
  ComponentType<Icons.IconProps>,
][];

const INKS = [
  ['accent', AccentColor],
  ['text', Colors.dark.text],
  ['danger', DangerColor],
] as const;

export function IconsSection() {
  return (
    <Section
      id="icons"
      title="Icons"
      intro={`All ${ICONS.length} icons exported by components/icons.tsx (Tabler outline), at 24 and 18 px, in the accent, text and danger inks.`}
    >
      <View style={styles.iconGrid}>
        {ICONS.map(([name, Icon]) => (
          <View key={name} style={styles.iconCell}>
            <View style={styles.iconRow}>
              {INKS.map(([ink, color]) => (
                <Icon key={ink} size={24} color={color} />
              ))}
            </View>
            <View style={styles.iconRow}>
              {INKS.map(([ink, color]) => (
                <Icon key={ink} size={18} color={color} />
              ))}
            </View>
            <ThemedText style={styles.iconName}>{name}</ThemedText>
          </View>
        ))}
      </View>
      <Specimen
        name="CalendarMark"
        file="components/calendar/calendar-mark.tsx"
        shows="A calendar's mark in its colour: gift for birthdays, else a calendar. 14 (default) and 16 px."
      >
        <Row>
          {SAMPLE_CALENDARS.map((c) => (
            <View key={c.url} style={styles.markRow}>
              <CalendarMark icon={c.icon} color={c.color ?? AccentColor} />
              <CalendarMark
                icon={c.icon}
                size={16}
                color={c.color ?? AccentColor}
              />
              <ThemedText type="small">{c.name}</ThemedText>
            </View>
          ))}
        </Row>
      </Specimen>
    </Section>
  );
}

/** Toggles a value every few seconds, to show a fade in and out. */
function useBlink(ms: number) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((v) => !v), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return on;
}

export function PrimitivesSection() {
  const blink = useBlink(3000);
  return (
    <Section id="primitives" title="Primitives">
      <Specimen
        name="ThemedText"
        file="components/themed-text.tsx"
        shows="Every type, in the text and textSecondary inks."
      >
        {(
          [
            'title',
            'subtitle',
            'default',
            'small',
            'smallBold',
            'code',
          ] as const
        ).map((type) => (
          <View key={type} style={styles.textRow}>
            <Tag>{type}</Tag>
            <ThemedText type={type} numberOfLines={1}>
              The quick brown fox 09:30
            </ThemedText>
            <ThemedText
              type={type}
              themeColor="textSecondary"
              numberOfLines={1}
            >
              Secondary ink
            </ThemedText>
          </View>
        ))}
        <View style={styles.textRow}>
          <Tag>themeColor placeholder / link</Tag>
          <ThemedText themeColor="placeholder">Add a title</ThemedText>
          <ThemedText themeColor="link">A link-coloured line</ThemedText>
        </View>
      </Specimen>

      <Row>
        <Specimen
          name="ThemedView"
          file="components/themed-view.tsx"
          shows="type = background, backgroundElement, backgroundSelected"
        >
          <Row gap={Spacing.two}>
            {(
              ['background', 'backgroundElement', 'backgroundSelected'] as const
            ).map((type) => (
              <ThemedView key={type} type={type} style={styles.viewBox}>
                <Tag>{type}</Tag>
              </ThemedView>
            ))}
          </Row>
        </Specimen>
        <Specimen
          name="Spinner"
          file="components/spinner.tsx"
          shows="18 (button), 14 (busy row), 32 (LARGE_SPINNER)"
        >
          <Row>
            <Spinner color={AccentColor} />
            <Spinner color={Colors.dark.textSecondary} size={14} />
            <Spinner color={AccentColor} size={LARGE_SPINNER} />
            <Spinner color={Colors.dark.text} />
          </Row>
        </Specimen>
      </Row>

      <Specimen
        name="LoadingBar"
        file="components/loading-bar.tsx"
        shows="visible (always on) and toggling every 3 s to show the fade"
      >
        <View style={styles.barStage}>
          <LoadingBar visible />
        </View>
        <View style={styles.barStage}>
          <LoadingBar visible={blink} />
        </View>
      </Specimen>

      <Row>
        <Specimen
          name="Brand"
          file="components/brand.tsx"
          shows="inline in a sentence, size 14 and 18"
        >
          <ThemedText type="small">
            Reminders from <Brand /> arrive here.
          </ThemedText>
          <ThemedText style={styles.big}>
            Open <Brand size={18} /> on the phone.
          </ThemedText>
        </Specimen>
        <Specimen
          name="AppName"
          file="components/settings/app-name.tsx"
          shows="The connect screens' name, set as the month title"
        >
          <AppName />
        </Specimen>
      </Row>

      <Specimen
        name="BootScreen"
        file="components/boot-screen.tsx"
        shows="Full screen while the shell boots (here in a 200 px box)"
        bare
      >
        <View style={styles.bootBox}>
          <BootScreen />
        </View>
      </Specimen>
    </Section>
  );
}

const styles = StyleSheet.create({
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconCell: {
    width: 108,
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3F4249',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
  },
  iconName: {
    fontSize: 10,
    lineHeight: 13,
    color: '#8A8F98',
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  textRow: {
    gap: 2,
    paddingVertical: Spacing.one,
  },
  viewBox: {
    borderWidth: 1,
    borderColor: '#3F4249',
    width: 120,
    height: 56,
    padding: Spacing.one,
    justifyContent: 'flex-end',
  },
  barStage: {
    height: 24,
    backgroundColor: '#000000',
  },
  big: {
    fontSize: 18,
    lineHeight: 26,
  },
  bootBox: {
    height: 200,
  },
});
