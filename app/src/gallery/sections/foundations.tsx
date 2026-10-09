// THROWAWAY gallery (see app/src/gallery/REVERT.md). Colour tokens, the
// type scale, spacing and the fixed measures.
import { StyleSheet, Text, View } from 'react-native';

import { HEADER_GROUND } from '@/components/calendar/month-header';
import { CONTROL_HEIGHT, Card } from '@/components/settings/settings-parts';
import {
  FieldChrome,
  LabelColumnWidth,
} from '@/components/fields/field-chrome';
import { GRID_RULE, TODAY_FILL } from '@/components/calendar/week-row';
import { EVENT_FONT_SIZE } from '@/components/calendar/event-chip';
import { GRID_SCALE } from '@/components/calendar/grid-scale';
import { ThemedText } from '@/components/themed-text';
import { DayHeading } from '@/constants/heading';
import { LOCATION_FILL, TAG } from '@/constants/tags';
import {
  AccentColor,
  BrandColor,
  Colors,
  DangerColor,
  FontFamily,
  FontFamilyBold,
  MaxContentWidth,
  OnAccentColor,
  Spacing,
  WideLayoutMinWidth,
} from '@/constants/theme';

import { Note, Row, Section, Specimen, Swatch } from '../parts';

/** Literals that are not exported, with where they live. */
const LOCAL_COLOURS = [
  ['OTHER_MONTH_FILL', '#2E3135', 'calendar/week-row.tsx:143'],
  ['INK_COLOR (hold ink)', '#5B9DFF', 'calendar/week-row.tsx:174'],
  ['OFFLINE_COLOR', '#F09595', 'calendar/month-header.tsx:94'],
  ['DIVIDER (editor actions)', '#60646C', 'calendar/event-editor-form.tsx:522'],
  [
    'Button cooldown',
    'rgba(255, 189, 79, 0.35)',
    'settings/settings-parts.tsx:887',
  ],
  [
    'Dialog dim',
    'rgba(0, 0, 0, 0.5)',
    'day-popover:255, event-editor:150, sheet:389, blur-backdrop:72',
  ],
] as const;

/** Every text size the app sets, by where it is set. */
const TYPE_SCALE: {
  name: string;
  size: number;
  line?: number;
  bold?: boolean;
  where: string;
}[] = [
  {
    name: 'ThemedText title',
    size: 48,
    line: 52,
    bold: true,
    where: 'themed-text.tsx (600)',
  },
  {
    name: 'Month title',
    size: 32,
    line: 42,
    bold: true,
    where: 'month-header.tsx Bar.titleSize',
  },
  {
    name: 'ThemedText subtitle',
    size: 32,
    line: 44,
    bold: true,
    where: 'themed-text.tsx (600)',
  },
  {
    name: 'DayHeading (editor, day list, Settings bar)',
    size: DayHeading.size,
    line: Math.round(DayHeading.size * DayHeading.lineRatio),
    bold: true,
    where: 'constants/heading.ts',
  },
  {
    name: 'Card title',
    size: Card.titleSize,
    line: Math.round(Card.titleSize * 1.3),
    bold: true,
    where: 'settings-parts.tsx Card.titleSize',
  },
  {
    name: 'Editor title input',
    size: 17,
    where: 'event-editor-form.tsx titleInput',
  },
  {
    name: 'ThemedText default',
    size: 16,
    line: 24,
    where: 'themed-text.tsx (500)',
  },
  {
    name: 'Weekday row',
    size: 16,
    bold: true,
    where: 'month-screen.tsx weekday',
  },
  {
    name: 'Field text / day list row (wide)',
    size: FieldChrome.fontSize,
    line: 21,
    where: 'field-chrome.ts, day-popover ROW_FONT',
  },
  {
    name: 'Reminder preview title',
    size: 15,
    line: 20,
    bold: true,
    where: 'reminder-preview.tsx',
  },
  {
    name: 'ThemedText small',
    size: 14,
    line: 20,
    where: 'themed-text.tsx (500)',
  },
  {
    name: 'ThemedText smallBold',
    size: 14,
    line: 20,
    bold: true,
    where: 'themed-text.tsx (700)',
  },
  {
    name: 'Header second line, day number',
    size: 14,
    line: 18,
    where: 'month-header Bar.subtitleSize, week-row scaled(14)',
  },
  { name: 'Chip label', size: 13, line: 16, where: 'chip-row.tsx label' },
  {
    name: 'Field caption (FieldLabel)',
    size: 12,
    line: 16,
    bold: true,
    where: 'field-label.tsx',
  },
  {
    name: 'Message line',
    size: 12,
    line: 16,
    where: 'settings-parts.tsx Message',
  },
  {
    name: 'ThemedText code',
    size: 12,
    where: 'themed-text.tsx (Photon credit)',
  },
  {
    name: 'Event text (grid)',
    size: EVENT_FONT_SIZE,
    line: 14,
    where: `event-chip.tsx scaled(11), GRID_SCALE here ${GRID_SCALE}`,
  },
  {
    name: 'Tag',
    size: TAG.fontSize,
    line: TAG.lineHeight,
    where: 'constants/tags.ts TAG',
  },
];

export function Foundations() {
  return (
    <Section
      id="foundations"
      title="Foundations"
      intro="Colour tokens, type, spacing and fixed measures. The app is dark only; Colors.light is used by the widget's light half."
    >
      <Specimen name="Colors.dark" file="constants/theme.ts">
        <Row>
          {Object.entries(Colors.dark).map(([name, value]) => (
            <Swatch key={name} name={name} value={value} />
          ))}
        </Row>
      </Specimen>
      <Specimen
        name="Colors.light"
        file="constants/theme.ts"
        shows="Not used by the app's screens (dark only); the widget renders a light half from it."
      >
        <Row>
          {Object.entries(Colors.light).map(([name, value]) => (
            <Swatch key={name} name={name} value={value} />
          ))}
        </Row>
      </Specimen>
      <Specimen
        name="Fixed colours"
        file="constants/theme.ts, constants/tags.ts, calendar/*"
      >
        <Row>
          <Swatch name="AccentColor" value={AccentColor} />
          <Swatch name="BrandColor" value={BrandColor} />
          <Swatch name="DangerColor" value={DangerColor} />
          <Swatch name="OnAccentColor" value={OnAccentColor} />
          <Swatch
            name="LOCATION_FILL"
            value={LOCATION_FILL}
            source="constants/tags.ts"
          />
          <Swatch name="TODAY_FILL" value={TODAY_FILL} source="week-row.tsx" />
          <Swatch name="GRID_RULE" value={GRID_RULE} source="week-row.tsx" />
          <Swatch
            name="HEADER_GROUND"
            value={HEADER_GROUND}
            source="month-header.tsx"
          />
        </Row>
      </Specimen>
      <Specimen
        name="Colour literals (not exported)"
        file="listed by value, with file:line"
      >
        <Row>
          {LOCAL_COLOURS.map(([name, value, source]) => (
            <Swatch key={name} name={name} value={value} source={source} />
          ))}
        </Row>
      </Specimen>

      <Specimen
        name="Type scale"
        file={`Font: ${FontFamily} / ${FontFamilyBold}`}
        shows="Every size set in the app, largest first: size / line height, weight, where."
      >
        {TYPE_SCALE.map((t) => (
          <View key={t.name} style={styles.typeRow}>
            <Text
              numberOfLines={1}
              style={{
                color: Colors.dark.text,
                fontFamily: t.bold ? FontFamilyBold : FontFamily,
                fontSize: t.size,
                lineHeight: t.line,
              }}
            >
              {t.name}
            </Text>
            <ThemedText style={styles.meta}>
              {t.size}
              {t.line ? ` / ${t.line}` : ''}
              {t.bold ? ' bold' : ''} · {t.where}
            </ThemedText>
          </View>
        ))}
      </Specimen>

      <Specimen name="Spacing" file="constants/theme.ts Spacing">
        {Object.entries(Spacing).map(([name, value]) => (
          <View key={name} style={styles.spaceRow}>
            <View style={[styles.spaceBar, { width: value }]} />
            <ThemedText style={styles.meta}>
              {name}: {value}
            </ThemedText>
          </View>
        ))}
      </Specimen>

      <Row>
        <Specimen
          name="Card shadow"
          file="settings-parts.tsx:742"
          shows="boxShadow 2px 2px 0 rgba(0,0,0,0.55)"
        >
          <View style={[styles.box, styles.cardShadow]} />
        </Specimen>
        <Specimen
          name="Dialog / toast shadow"
          file="day-popover:278, event-editor:176, month-screen:806"
          shows="boxShadow 4px 4px 0 rgba(0,0,0,0.75)"
        >
          <View style={[styles.box, styles.dialogShadow]} />
        </Specimen>
        <Specimen
          name="Dialog dim"
          file="rgba(0,0,0,0.5), blurred 6px on the web"
          shows="constants/backdrop.ts BACKDROP_BLUR"
        >
          <View style={styles.dimStage}>
            <ThemedText type="small">Grid under the dim</ThemedText>
            <View style={styles.dim} />
          </View>
        </Specimen>
      </Row>

      <Specimen name="Fixed measures" file="various">
        <Note>
          CONTROL_HEIGHT {CONTROL_HEIGHT} (buttons and fields) · FieldChrome
          minHeight {FieldChrome.minHeight}, padding{' '}
          {FieldChrome.paddingVertical}/{FieldChrome.paddingHorizontal}, border{' '}
          {FieldChrome.borderWidth}, radius {FieldChrome.borderRadius} ·
          LabelColumnWidth {LabelColumnWidth} · Card accent bar {Card.accentBar}
          , dotted {Card.dotted}, padding {Card.padV}/{Card.padH}, label column{' '}
          {Card.labelColumn} · DayHeading {DayHeading.size} x{' '}
          {DayHeading.lineRatio} · TAG {TAG.fontSize}/{TAG.lineHeight}, padding{' '}
          {TAG.paddingVertical}/{TAG.paddingHorizontal} · WideLayoutMinWidth{' '}
          {WideLayoutMinWidth} · MaxContentWidth {MaxContentWidth} · GRID_SCALE{' '}
          {GRID_SCALE} (1.15 from a 1100px window)
        </Note>
      </Specimen>
    </Section>
  );
}

const styles = StyleSheet.create({
  typeRow: {
    gap: 2,
    paddingVertical: Spacing.one,
  },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    color: '#8A8F98',
  },
  spaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spaceBar: {
    height: 12,
    backgroundColor: AccentColor,
  },
  box: {
    width: 120,
    height: 64,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.rule,
  },
  cardShadow: {
    boxShadow: '2px 2px 0px rgba(0, 0, 0, 0.55)',
  },
  dialogShadow: {
    boxShadow: '4px 4px 0px rgba(0, 0, 0, 0.75)',
  },
  dimStage: {
    width: 160,
    height: 64,
    justifyContent: 'center',
    padding: Spacing.two,
    backgroundColor: Colors.dark.background,
  },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});
