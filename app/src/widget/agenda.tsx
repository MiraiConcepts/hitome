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
  NotificationOutlineBody,
  RefreshOutlineBody,
  SunOutlineBody,
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
import type { WidgetCache, WidgetEvent } from './types';

type Palette = Record<ThemeColor, string>;

/** Theme colors are plain strings; widget ColorProp wants a hex template type. */
const hex = (c: string) => c as `#${string}`;

// Basil icons (https://icon-sets.iconify.design/basil/) — the app's icon set,
// rendered via SvgWidget. The in-app screens render the same add / refresh glyphs
// via components/icons.tsx; shared 24x24 path data lives in constants/icon-paths.
// Basil bodies are fill-based, so we swap `currentColor` for the actual color.
const basilSvg = (fill: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body.replace(/currentColor/g, fill)}</svg>`;
const ADD_ICON = basilSvg(OnAccentColor, AddOutlineBody);
const REFRESH_ICON = basilSvg(OnAccentColor, RefreshOutlineBody);

/** A per-event marker glyph (sun / repeat / alarm), tinted by the event's
 *  source-calendar color (alpha stripped for the SVG fill); uncolored /
 *  default-calendar events keep the theme accent. */
const markerSvg = (color: string | undefined, body: string) =>
  basilSvg(rgbHex(color ?? AccentColor), body);

// Shared style fragments — the widget's tiny design system. Sizes are plain
// literals by convention (the widget is its own design surface; see the
// Spacing note in constants/theme.ts).
/** Sun / repeat / alarm marker glyph size. */
const MARKER_ICON = { width: 14, height: 14 } as const;
/** An event row's primary line — time, dot, title. */
const rowText = (palette: Palette) => ({
  fontSize: 13,
  fontFamily: FontFamily,
  color: hex(palette.text),
});
/** Tappable secondary lines under a row — location, plain link. */
const linkText = (palette: Palette) => ({
  fontSize: 11,
  fontFamily: FontFamily,
  color: hex(palette.link),
});

/** Heading that opens a day group, e.g. 'Mon 13 July'. */
function DayHeader({ label, palette }: { label: string; palette: Palette }) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        paddingBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: hex(palette.backgroundSelected),
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
 * Status glyphs that follow the row's ▪ dot — repeat, alarm, and any future
 * markers of that kind live here. Packed tighter than the row's other spacing.
 * Only rendered when at least one marker applies: RNAW calls components as raw
 * functions and crashes on a `null` return, so the caller must guard.
 */
function StatusIcons({ event }: { event: WidgetEvent }) {
  const icons = [
    ...(event.recurring ? [markerSvg(event.color, RefreshOutlineBody)] : []),
    ...(event.alarm ? [markerSvg(event.color, NotificationOutlineBody)] : []),
  ];
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexGap: 2,
        marginRight: 4,
      }}
    >
      {icons.map((svg, i) => (
        <SvgWidget key={i} svg={svg} style={MARKER_ICON} />
      ))}
    </FlexWidget>
  );
}

/**
 * Tappable secondary line under an event row (location, plain link). Callers
 * must guard rendering — RNAW components cannot return null (see StatusIcons).
 */
function DetailLine({
  uri,
  label,
  text,
  palette,
}: {
  uri: string;
  label: string;
  text: string;
  palette: Palette;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      accessibilityLabel={label}
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 2,
      }}
    >
      <TextWidget
        text={text}
        maxLines={1}
        truncate="END"
        style={linkText(palette)}
      />
    </FlexWidget>
  );
}

/**
 * One event's row for a given day; tapping deep-links the app to that day. A
 * multi-day event shows a dim `(n/N)` marker; continuation days it fully covers
 * render like an all-day row (sun glyph, no time), and the day a timed one ends
 * leads with `→ end` instead — the sun always means a whole day.
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
  // Markers are cumulative, not either/or. Every row reads
  // `[time|→ time|sun] ▪ [repeat?] [alarm?] [title]` — the leading slot is the
  // start time, `→ end` on the day a timed multi-day event finishes, or the
  // sun for all-day rows; StatusIcons packs what follows the dot.
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `app:///?day=${day}` }}
      style={{
        width: 'match_parent',
        flexDirection: 'column',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        {asAllDay && !endsThisDay ? (
          // Birthday-calendar events get a gift; others keep the generic sun.
          <SvgWidget
            svg={markerSvg(
              event.color,
              event.icon === 'gift' ? GiftOutlineBody : SunOutlineBody
            )}
            style={MARKER_ICON}
          />
        ) : (
          <TextWidget
            text={
              endsThisDay
                ? `→ ${toTimeString(endsThisDay)}`
                : toTimeString(new Date(event.start))
            }
            style={rowText(palette)}
          />
        )}
        <TextWidget
          text="▪"
          style={{ ...rowText(palette), marginHorizontal: 6 }}
        />
        {event.recurring || event.alarm ? <StatusIcons event={event} /> : null}
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
        <DetailLine
          uri={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
          label="Open location in maps"
          text={event.location}
          palette={palette}
        />
      ) : null}
      {event.meetingLink && dayIndex === 1 ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: event.meetingLink }}
          accessibilityLabel="Join meeting"
          style={{
            flexDirection: 'row',
            marginTop: 3,
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: hex(AccentColor),
            borderRadius: 4,
          }}
        >
          <TextWidget
            text="Join Meeting"
            style={{
              fontSize: 11,
              fontFamily: FontFamily,
              color: hex(OnAccentColor),
            }}
          />
        </FlexWidget>
      ) : null}
      {event.link && dayIndex === 1 ? (
        // Only non-meeting URLs land here (meeting links become the Join
        // chip above), rendered as the bare host.
        <DetailLine
          uri={event.link}
          label="Open event link"
          text={linkHost(event.link)}
          palette={palette}
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
        paddingTop: 5,
        paddingBottom: 10,
        flexGap: 5,
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
          paddingBottom: 4,
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
