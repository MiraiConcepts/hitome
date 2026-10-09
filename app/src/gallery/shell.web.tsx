// THROWAWAY gallery (see app/src/gallery/REVERT.md). The web shell: a bar
// with the width buttons and the section index, over the content.
//
// Not an iframe: hitome's server sends `X-Frame-Options: DENY` and
// `frame-ancestors 'none'` on every page (app/server/index.ts), so the app
// cannot be framed, by itself included. The width buttons open the content
// in a window of exactly that width instead: a real window, so the app's
// responsive code (useIsWide, the grid's scale, dialog or sheet) answers to
// it as it would to a phone's or a desktop's, with nothing shared changed.
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColor, Colors, Spacing } from '@/constants/theme';

import { GalleryView, SECTIONS } from './gallery-view';

const SIZES = {
  mobile: { label: 'Mobile 390', width: 390, height: 844 },
  desktop: { label: 'Desktop 1100', width: 1100, height: 820 },
} as const;
type Size = keyof typeof SIZES;

export function GalleryShell() {
  const windows = useRef<Partial<Record<Size, Window | null>>>({});
  const open = (size: Size) => {
    const { width, height } = SIZES[size];
    const hash = window.location.hash;
    const win = window.open(
      `/gallery/view?w=${size}${hash}`,
      `hitome-gallery-${size}`,
      `popup,width=${width},height=${height}`
    );
    windows.current[size] = win;
    win?.focus();
  };
  const jump = (id: string) => {
    window.history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    // Open preview windows follow along.
    for (const win of Object.values(windows.current))
      if (win && !win.closed) win.location.hash = id;
  };
  return (
    <ThemedView style={styles.fill}>
      <View style={styles.bar}>
        <ThemedText style={styles.title}>Components</ThemedText>
        <View style={styles.sizes}>
          <ThemedText style={styles.hint}>Open at</ThemedText>
          {(Object.keys(SIZES) as Size[]).map((size) => (
            <Pressable
              key={size}
              accessibilityRole="button"
              onPress={() => open(size)}
              style={({ pressed }) => [
                styles.option,
                pressed && styles.optionPressed,
              ]}
            >
              <ThemedText style={styles.optionText}>
                {SIZES[size].label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={styles.index}>
          {SECTIONS.map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="link"
              onPress={() => jump(id)}
            >
              <ThemedText style={styles.link}>{label}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
      <ThemedText style={styles.notice}>
        Below: this window&apos;s own width. The buttons open a window of
        exactly 390 or 1100 px (the page cannot be framed: the server forbids
        it), and the index follows in them.
      </ThemedText>
      <View style={styles.fill}>
        <GalleryView index={false} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    // The page itself is black; the specimens keep the app's own grounds.
    backgroundColor: '#000000',
  },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.ruleStrong,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
    color: AccentColor,
  },
  sizes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8A8F98',
  },
  option: {
    borderWidth: 1,
    borderColor: AccentColor,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one,
  },
  optionPressed: {
    backgroundColor: Colors.dark.backgroundSelected,
  },
  optionText: {
    fontSize: 13,
    lineHeight: 18,
    color: AccentColor,
  },
  index: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.dark.link,
  },
  notice: {
    fontSize: 11,
    lineHeight: 15,
    color: '#8A8F98',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    backgroundColor: '#000000',
  },
});
