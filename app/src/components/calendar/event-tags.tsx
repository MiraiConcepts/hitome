import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { CalEvent } from '@/caldav/types';
import { ThemedText } from '@/components/themed-text';
import { LOCATION_FILL } from '@/constants/tags';
import { AccentColor, Colors, OnAccentColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { linkHost } from '@/widget/format';
import { toWidgetEvent } from '@/widget/select-upcoming';

/**
 * An event's place, meeting link and other link as the agenda widget's tags:
 * blue for the place (opens it in maps), accent for the meeting, the flat
 * element colour for a bare link, shown as its host. They come from the
 * widget's own snapshot, so both read an event the same way: a location that
 * is really a join link is the meeting tag, not a place.
 */
export function EventTags({
  event,
  compact = false,
}: {
  event: CalEvent;
  /** A notch smaller, for the phone. */
  compact?: boolean;
}) {
  const theme = useTheme();
  const { location, meetingLink, link } = toWidgetEvent(event);
  if (!location && !meetingLink && !link) return null;
  return (
    // Auto: a press here is the tag's, while the rest of the row passes
    // presses through to the row's own button.
    <View style={styles.tags}>
      {location ? (
        <Tag
          label="Open location in maps"
          text={location}
          uri={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
          background={LOCATION_FILL}
          color={Colors.dark.text}
          compact={compact}
        />
      ) : null}
      {meetingLink ? (
        <Tag
          label="Join meeting"
          text="Join Meeting"
          uri={meetingLink}
          background={AccentColor}
          color={OnAccentColor}
          compact={compact}
        />
      ) : null}
      {link ? (
        <Tag
          label="Open event link"
          text={linkHost(link)}
          uri={link}
          background={theme.backgroundElement}
          color={theme.text}
          compact={compact}
        />
      ) : null}
    </View>
  );
}

function Tag({
  label,
  text,
  uri,
  background,
  color,
  compact,
}: {
  label: string;
  text: string;
  uri: string;
  background: string;
  color: string;
  compact: boolean;
}) {
  return (
    <Pressable
      onPress={() => Linking.openURL(uri)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={[styles.tag, { backgroundColor: background }]}
    >
      {/* Wraps rather than cutting a long place short: a name is worth
          reading whole. */}
      <ThemedText
        style={[styles.text, compact && styles.textCompact, { color }]}
      >
        {text}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 5,
    pointerEvents: 'auto',
  },
  tag: {
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
  },
  textCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
});
