// Tabler icons (https://icon-sets.iconify.design/tabler/) rendered in-app as
// React Native SVG. Path data is shared with the Android widget via constants/icon-paths
// so both surfaces stay on the same glyphs. Props mirror the old lucide API
// (`size`, `color`) to keep call sites simple.
import { SvgXml } from 'react-native-svg';

import { AddOutlineBody, RefreshOutlineBody } from '@/constants/icon-paths';

type IconProps = { size?: number; color: string };

const svg = (body: string, size: number, color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${body.replace(
    /currentColor/g,
    color
  )}</svg>`;

export function RefreshIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(RefreshOutlineBody, size, color)} />;
}

export function AddIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(AddOutlineBody, size, color)} />;
}
