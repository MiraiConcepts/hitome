// react-native-android-widget calls these components as raw functions (no React
// renderer), so the React Compiler's memo-cache hooks crash them at runtime.
'use no memo';

// JSX tree for the Android home-screen agenda — react-native-android-widget
// primitives (not RN views), rendered headlessly by the task handler. The
// light/dark pair lets the launcher pick the palette that matches the system.
import type { ReactNode } from 'react';
import type { WidgetRepresentation } from 'react-native-android-widget';
import {
  FlexWidget,
  ListWidget,
  SvgWidget,
  TextWidget,
} from 'react-native-android-widget';

import { davConfigured } from '@/config';
import {
  AddOutlineBody,
  GiftOutlineBody,
  RefreshOutlineBody,
  SunOutlineBody,
  SunriseOutlineBody,
  SunsetOutlineBody,
} from '@/constants/icon-paths';
import {
  AccentColor,
  Colors,
  FontFamily,
  FontFamilyBold,
  OnAccentColor,
  type ThemeColor,
} from '@/constants/theme';
import { rgbHex } from '@/utils/color';
import { toTimeString } from '@/utils/date';

import {
  continuationEnd,
  groupByDay,
  headerDate,
  linkHost,
  type WidgetDayItem,
} from './format';
import type { WidgetCache } from './types';

type Palette = Record<ThemeColor, string>;

/** The rule under each day heading — the widget's only divider. Fixed rather
 *  than a palette token so it matches the app grid's lines, which land on the
 *  same value for the same reason: a mid grey reads on either scheme. */
const DIVIDER = '#60646C';

/** Theme colors are plain strings; widget ColorProp wants a hex template type. */
const hex = (c: string) => c as `#${string}`;

// Tabler icons (https://icon-sets.iconify.design/tabler/) — the app's icon set,
// rendered via SvgWidget. The in-app screens render the same add / refresh glyphs
// via components/icons.tsx; shared 24x24 path data lives in constants/icon-paths.
// Tabler bodies stroke with `currentColor`, so we swap it for the actual color.
const iconSvg = (color: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body.replace(/currentColor/g, color)}</svg>`;
const ADD_ICON = iconSvg(OnAccentColor, AddOutlineBody);
const REFRESH_ICON = iconSvg(OnAccentColor, RefreshOutlineBody);

/** An event's source-calendar color, alpha stripped for SVG fills / ColorProp;
 *  uncolored / default-calendar events keep the theme accent. */
const markerColor = (color: string | undefined) => rgbHex(color ?? AccentColor);

/** A per-event marker glyph (sun / sunrise / sunset / gift), tinted by the
 *  event's source-calendar color. */
const markerSvg = (color: string | undefined, body: string) =>
  iconSvg(markerColor(color), body);

/** The location chip's fill — Firefox brand blue, fixed rather than
 *  palette.link because the dark scheme's link (#5B9DFF) is far too light to
 *  carry white text. This holds roughly 5:1 against white in either scheme. */
const LOCATION_FILL = '#0060E0';

// Shared style fragments — the widget's tiny design system. Sizes are plain
// literals by convention (the widget is its own design surface; see the
// Spacing note in constants/theme.ts).
/** Marker glyph size. The sub-dp nudge is optical: Android centers a
 *  TextView's whole line box, and Satoshi's ascent + font padding (1.026em)
 *  outweighs its descent (0.224em), so the box's middle sits ~0.043em above
 *  where digits and caps actually look centered — a box-centered glyph reads
 *  high next to the row's text without it. Scales with the row's font size. */
const MARKER_ICON = { width: 14, height: 14, marginTop: 0.5 } as const;
/** An event row's primary line — time, dot, title. */
const rowText = (palette: Palette) => ({
  fontSize: 13,
  fontFamily: FontFamily,
  color: hex(palette.text),
});

/** Heading that opens a day group, e.g. 'Mon 13 July'. */
function DayHeader({ label, palette }: { label: string; palette: Palette }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: hex(DIVIDER),
      }}
    >
      <TextWidget
        text={label}
        style={{
          fontSize: 12,
          fontFamily: FontFamilyBold,
          color: hex(AccentColor),
        }}
      />
    </FlexWidget>
  );
}

/**
 * Tappable pill under an event row — every secondary action on an event is
 * one of these, told apart by fill: accent for the meeting link, blue for the
 * location, the flat element color for a bare link. Callers must guard
 * rendering — RNAW calls components as raw functions and crashes on a `null`
 * return.
 */
function Chip({
  uri,
  label,
  text,
  background,
  color,
}: {
  uri: string;
  label: string;
  text: string;
  background: string;
  color: string;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: hex(background),
        borderRadius: 4,
      }}
    >
      <TextWidget
        text={text}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: 11,
          fontFamily: FontFamily,
          color: hex(color),
        }}
      />
    </FlexWidget>
  );
}

/**
 * One event's row for a given day; tapping deep-links the app to that day. A
 * multi-day event shows a dim `(n/N)` marker; days it fully covers render like
 * an all-day row (sun glyph, no time), and a timed one marks its own edges with
 * sunrise / sunset — the sun always means a whole day.
 */
function EventRow({
  item,
  day,
  palette,
}: {
  item: WidgetDayItem;
  day: string;
  palette: Palette;
}) {
  const { event, dayIndex, spanDays } = item;
  const multiDay = spanDays > 1;
  const asAllDay = event.allDay || dayIndex > 1;
  const endsThisDay = continuationEnd(item, day);
  const wholeDay = asAllDay && !endsThisDay;
  // A whole-day row has no time to separate from, so it drops the dot and reads
  // `[sun] [title]`. Every other row reads `[time] ▪ [title]`, and when it is an
  // edge of a timed multi-day event the time picks up the matching glyph —
  // sunrise on the day it starts, sunset on the day it ends.
  const spanEdge = endsThisDay
    ? { body: SunsetOutlineBody, at: endsThisDay }
    : multiDay && !event.allDay && dayIndex === 1
      ? { body: SunriseOutlineBody, at: new Date(event.start) }
      : null;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `app:///?day=${day}` }}
      style={{
        width: 'match_parent',
        flexDirection: 'column',
        flexGap: 2,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        {wholeDay ? (
          // Birthday-calendar events get a gift; others keep the generic sun.
          // Carries the dot's spacing, since the row drops the dot itself.
          <SvgWidget
            svg={markerSvg(
              event.color,
              event.icon === 'gift' ? GiftOutlineBody : SunOutlineBody
            )}
            style={{ ...MARKER_ICON, marginRight: 6 }}
          />
        ) : spanEdge ? (
          // Glyph + time on the edges of a timed multi-day event. Only the
          // glyph carries the calendar color; the time stays row text, so a
          // time reads the same wherever it appears.
          <FlexWidget
            style={{ flexDirection: 'row', alignItems: 'center', flexGap: 3 }}
          >
            <SvgWidget
              svg={markerSvg(event.color, spanEdge.body)}
              style={MARKER_ICON}
            />
            <TextWidget
              text={toTimeString(spanEdge.at)}
              style={rowText(palette)}
            />
          </FlexWidget>
        ) : (
          <TextWidget
            text={toTimeString(new Date(event.start))}
            style={rowText(palette)}
          />
        )}
        {wholeDay ? null : (
          <TextWidget
            text="▪"
            style={{ ...rowText(palette), marginHorizontal: 6 }}
          />
        )}
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={event.summary || '(untitled)'}
            maxLines={1}
            truncate="END"
            style={rowText(palette)}
          />
        </FlexWidget>
        {multiDay ? (
          <TextWidget
            text={`(${dayIndex}/${spanDays})`}
            style={{
              fontSize: 12,
              fontFamily: FontFamily,
              color: hex(palette.textSecondary),
              marginLeft: 6,
            }}
          />
        ) : null}
      </FlexWidget>
      {event.location && dayIndex === 1 ? (
        <Chip
          uri={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
          label="Open location in maps"
          text={event.location}
          background={LOCATION_FILL}
          color={Colors.dark.text}
        />
      ) : null}
      {event.meetingLink && dayIndex === 1 ? (
        <Chip
          uri={event.meetingLink}
          label="Join meeting"
          text="Join Meeting"
          background={AccentColor}
          color={OnAccentColor}
        />
      ) : null}
      {event.link && dayIndex === 1 ? (
        // Only non-meeting URLs land here (meeting links become the Join
        // chip above), rendered as the bare host.
        <Chip
          uri={event.link}
          label="Open event link"
          text={linkHost(event.link)}
          background={palette.backgroundElement}
          color={palette.text}
        />
      ) : null}
    </FlexWidget>
  );
}

/**
 * Wraps a single day's events (one list item, so they scroll together). Style
 * this to control spacing around / between a day's events — add `flexGap` for
 * the gap between events, or `padding*` for room around the group.
 */
function EventsWrapper({ children }: { children: ReactNode }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'column',
        paddingTop: 6,
        paddingBottom: 10,
        flexGap: 8,
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Body({
  cache,
  now,
  palette,
}: {
  cache: WidgetCache | null;
  now: Date;
  palette: Palette;
}) {
  const message = !davConfigured
    ? 'No server URL in this build'
    : !cache
      ? 'Calendar unreachable — tap ↻ on the tailnet'
      : cache.events.length === 0
        ? 'No events in the next 60 days'
        : null;
  if (message) {
    return (
      <TextWidget
        text={message}
        style={{
          fontSize: 12,
          fontFamily: FontFamily,
          color: hex(palette.textSecondary),
        }}
      />
    );
  }
  return (
    <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
      {groupByDay(cache!.events, now).flatMap((group) => [
        <DayHeader
          key={`h:${group.day}`}
          label={group.header}
          palette={palette}
        />,
        <EventsWrapper key={`e:${group.day}`}>
          {group.items.map((item) => (
            <EventRow
              key={`${item.event.start}:${item.event.summary}:${group.day}`}
              item={item}
              day={group.day}
              palette={palette}
            />
          ))}
        </EventsWrapper>,
      ])}
    </ListWidget>
  );
}

function Agenda({
  cache,
  now,
  palette,
}: {
  cache: WidgetCache | null;
  now: Date;
  palette: Palette;
}) {
  const onAccent = hex(OnAccentColor);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        borderRadius: 4,
        backgroundColor: hex(palette.background),
      }}
    >
      {/* Orange header bar: date + freshness stacked left, add/refresh vertically centered right */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: hex(AccentColor),
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: 'column', flexGap: 4 }}>
          <TextWidget
            text={headerDate(now)}
            style={{
              fontSize: 22,
              fontFamily: FontFamilyBold,
              color: onAccent,
            }}
          />
          {cache ? (
            <TextWidget
              text={`Last Updated: ${toTimeString(new Date(cache.fetchedAt))}`}
              style={{
                fontSize: 10,
                fontFamily: FontFamily,
                color: onAccent,
              }}
            />
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: `app:///?new=${now.getTime()}` }}
            style={{ padding: 6 }}
            accessibilityLabel="Add event"
          >
            <SvgWidget svg={ADD_ICON} style={{ width: 24, height: 24 }} />
          </FlexWidget>
          <FlexWidget
            clickAction="REFRESH"
            style={{ padding: 6, marginLeft: 6 }}
            accessibilityLabel="Refresh events"
          >
            <SvgWidget svg={REFRESH_ICON} style={{ width: 24, height: 24 }} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>
      <FlexWidget
        style={{
          width: 'match_parent',
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 10,
        }}
      >
        <Body cache={cache} now={now} palette={palette} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light/dark pair so the launcher can match the system theme; `now` fixed once
 * so both halves and every day header agree. */
export function renderAgenda(cache: WidgetCache | null): WidgetRepresentation {
  const now = new Date();
  return {
    light: <Agenda cache={cache} now={now} palette={Colors.light} />,
    dark: <Agenda cache={cache} now={now} palette={Colors.dark} />,
  };
}
