// THROWAWAY gallery (see app/src/gallery/REVERT.md). The gallery's own
// furniture: section headings, specimen captions, swatches. Deliberately
// plain (dashed outline, monospace-ish captions) so it never reads as part of
// the app being reviewed.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import type { IconProps } from '@/components/icons';
import { SnackBar } from '@/components/calendar/month-screen';
import { ThemedText } from '@/components/themed-text';
import { AccentColor, Colors, DangerColor, Spacing } from '@/constants/theme';

const CAPTION = '#8A8F98';
const OUTLINE = '#3F4249';

/** One group of specimens, with an anchor the shell's index can jump to. */
export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <View nativeID={id} style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        {intro ? (
          <ThemedText style={styles.sectionIntro}>{intro}</ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One specimen: the thing itself, and under it what it is and where. */
export function Specimen({
  name,
  file,
  shows,
  children,
  bare = false,
  style,
}: {
  name: string;
  file: string;
  /** Which props or state this one shows. */
  shows?: string;
  children: ReactNode;
  /** No padding round the stage (full-bleed pieces like the header). */
  bare?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.specimen, style]}>
      <View style={[styles.stage, bare && styles.stageBare]}>{children}</View>
      <View style={styles.caption}>
        <ThemedText style={styles.captionName}>{name}</ThemedText>
        <ThemedText style={styles.captionText}>{file}</ThemedText>
        {shows ? (
          <ThemedText style={styles.captionText}>{shows}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/** Specimens side by side, wrapping. */
export function Row({
  children,
  gap = Spacing.three,
}: {
  children: ReactNode;
  gap?: number;
}) {
  return <View style={[styles.row, { gap }]}>{children}</View>;
}

/** A small label inside a stage, naming the variant beside it. */
export function Tag({ children }: { children: ReactNode }) {
  return <ThemedText style={styles.tag}>{children}</ThemedText>;
}

/** Something the gallery cannot draw, and why. */
export function Unavailable({
  name,
  file,
  reason,
}: {
  name: string;
  file: string;
  reason: string;
}) {
  return (
    <View style={[styles.specimen, styles.unavailable]}>
      <ThemedText style={styles.captionName}>
        {name}: cannot be previewed here
      </ThemedText>
      <ThemedText style={styles.captionText}>{file}</ThemedText>
      <ThemedText style={styles.unavailableText}>{reason}</ThemedText>
    </View>
  );
}

/** A note in the gallery's own voice. */
export function Note({ children }: { children: ReactNode }) {
  return <ThemedText style={styles.note}>{children}</ThemedText>;
}

/**
 * A live component whose controls would change real settings or sign out:
 * drawn as is, but it takes no presses.
 */
export function ViewOnly({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="none" style={styles.viewOnly}>
      {children}
    </View>
  );
}

/** A colour, its name and value. */
export function Swatch({
  name,
  value,
  source,
}: {
  name: string;
  value: string;
  source?: string;
}) {
  return (
    <View style={styles.swatch}>
      <View
        style={[
          styles.swatchChip,
          styles.swatchEdge,
          { backgroundColor: value },
        ]}
      />
      <ThemedText style={styles.swatchName}>{name}</ThemedText>
      <ThemedText style={styles.captionText}>{value}</ThemedText>
      {source ? (
        <ThemedText style={styles.captionText}>{source}</ThemedText>
      ) : null}
    </View>
  );
}

type Toast = {
  icon: ComponentType<IconProps>;
  message: string;
  action?: string;
  nonce: number;
};

const ToastContext = createContext<
  (toast: Omit<Toast, 'nonce'> | null) => void
>(() => {});

/** The month screen's toast, raised by the gallery's overlays. */
export function useGalleryToast() {
  return useContext(ToastContext);
}

/**
 * Holds the one toast at a time, bottom right, as the month screen does.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback(
    (next: Omit<Toast, 'nonce'> | null) =>
      setToast((prev) =>
        next ? { ...next, nonce: (prev?.nonce ?? 0) + 1 } : null
      ),
    []
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <View style={styles.toastWrap} pointerEvents="box-none">
        {toast && (
          <SnackBar
            key={toast.nonce}
            icon={toast.icon}
            message={toast.message}
            action={
              toast.action
                ? { label: toast.action, onPress: () => setToast(null) }
                : undefined
            }
          />
        )}
      </View>
    </ToastContext.Provider>
  );
}

export const galleryColors = { CAPTION, OUTLINE, DangerColor, AccentColor };

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  sectionHead: {
    gap: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: OUTLINE,
    paddingBottom: Spacing.two,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  sectionIntro: {
    fontSize: 13,
    lineHeight: 18,
    color: CAPTION,
  },
  specimen: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: OUTLINE,
    flexShrink: 1,
    maxWidth: '100%',
  },
  stage: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  stageBare: {
    padding: 0,
  },
  caption: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: OUTLINE,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + Spacing.half,
    gap: 1,
  },
  captionName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  captionText: {
    fontSize: 11,
    lineHeight: 15,
    color: CAPTION,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  tag: {
    fontSize: 10,
    lineHeight: 13,
    color: CAPTION,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  unavailable: {
    padding: Spacing.three,
    gap: Spacing.one,
    borderColor: '#6C4A4F',
  },
  unavailableText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.dark.textSecondary,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: CAPTION,
  },
  viewOnly: {
    alignSelf: 'stretch',
  },
  swatch: {
    width: 150,
    gap: 2,
  },
  swatchChip: {
    height: 44,
    marginBottom: Spacing.one,
  },
  swatchEdge: {
    borderWidth: 1,
    borderColor: OUTLINE,
  },
  swatchName: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 700,
    color: Colors.dark.text,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.four,
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.three,
  },
});
