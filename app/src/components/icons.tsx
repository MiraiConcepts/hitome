// Tabler icons (https://icon-sets.iconify.design/tabler/) rendered in-app as
// React Native SVG. Path data is shared with the Android widget via constants/icon-paths
// so both surfaces stay on the same glyphs. Props mirror the old lucide API
// (`size`, `color`) to keep call sites simple.
import { SvgXml } from 'react-native-svg';

import {
  AddOutlineBody,
  AlertCircleOutlineBody,
  CalendarEventOutlineBody,
  CheckOutlineBody,
  ChevronLeftOutlineBody,
  InfoCircleOutlineBody,
  CircleDashedOutlineBody,
  LockOutlineBody,
  RefreshOutlineBody,
  ServerOutlineBody,
  SettingsOutlineBody,
  UserOutlineBody,
  PencilOutlineBody,
  CalendarOutlineBody,
  ClockPlayOutlineBody,
  ClockStopOutlineBody,
  RepeatOutlineBody,
  BellOutlineBody,
  MapPinOutlineBody,
  NotesOutlineBody,
  FlagOutlineBody,
  EyeOutlineBody,
  EyeOffOutlineBody,
  GithubOutlineBody,
  FileTextOutlineBody,
  BugOutlineBody,
  GiftOutlineBody,
  CalendarPlusOutlineBody,
  TrashOutlineBody,
  WifiOffOutlineBody,
} from '@/constants/icon-paths';

export type IconProps = { size?: number; color: string };

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

export function SettingsIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(SettingsOutlineBody, size, color)} />;
}

export function ChevronLeftIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(ChevronLeftOutlineBody, size, color)} />;
}

export function ServerIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(ServerOutlineBody, size, color)} />;
}

export function UserIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(UserOutlineBody, size, color)} />;
}

export function LockIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(LockOutlineBody, size, color)} />;
}

export function CircleDashedIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(CircleDashedOutlineBody, size, color)} />;
}

export function CalendarEventIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(CalendarEventOutlineBody, size, color)} />;
}

export function CheckIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(CheckOutlineBody, size, color)} />;
}

export function AlertCircleIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(AlertCircleOutlineBody, size, color)} />;
}

export function InfoCircleIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(InfoCircleOutlineBody, size, color)} />;
}

export function PencilIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(PencilOutlineBody, size, color)} />;
}

export function CalendarIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(CalendarOutlineBody, size, color)} />;
}

export function ClockPlayIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(ClockPlayOutlineBody, size, color)} />;
}

export function ClockStopIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(ClockStopOutlineBody, size, color)} />;
}

export function RepeatIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(RepeatOutlineBody, size, color)} />;
}

export function BellIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(BellOutlineBody, size, color)} />;
}

export function MapPinIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(MapPinOutlineBody, size, color)} />;
}

export function NotesIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(NotesOutlineBody, size, color)} />;
}

export function FlagIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(FlagOutlineBody, size, color)} />;
}

export function EyeIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(EyeOutlineBody, size, color)} />;
}

export function EyeOffIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(EyeOffOutlineBody, size, color)} />;
}

export function GithubIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(GithubOutlineBody, size, color)} />;
}

export function FileTextIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(FileTextOutlineBody, size, color)} />;
}

export function BugIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(BugOutlineBody, size, color)} />;
}

export function GiftIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(GiftOutlineBody, size, color)} />;
}

export function CalendarPlusIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(CalendarPlusOutlineBody, size, color)} />;
}

export function TrashIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(TrashOutlineBody, size, color)} />;
}

export function WifiOffIcon({ size = 24, color }: IconProps) {
  return <SvgXml xml={svg(WifiOffOutlineBody, size, color)} />;
}
