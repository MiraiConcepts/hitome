// Custom entry: expo-router plus the headless pieces that never pass through
// _layout.tsx — the Android widget task handler, and the task that answers a
// reminder's Snooze while the app is closed — so polyfills load here.
import '@/polyfills';
import 'expo-router/entry';
import '@/widget/register';
import '@/alarms/background-task';
