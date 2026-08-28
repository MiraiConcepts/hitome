// Basil icons (https://icon-sets.iconify.design/basil/) — the app's icon set.
// Raw 24x24 outline SVG bodies (fill-based, using `currentColor`). Shared by the
// in-app <Icon> components (components/icons.tsx, via react-native-svg) and the
// Android widget's SvgWidget (widget/agenda.tsx), so both render the same glyph.
// Consumers swap `currentColor` for the desired color.

export const AddOutlineBody =
  '<path fill="currentColor" d="M7.007 12a.75.75 0 0 1 .75-.75h3.493V7.757a.75.75 0 0 1 1.5 0v3.493h3.493a.75.75 0 1 1 0 1.5H12.75v3.493a.75.75 0 0 1-1.5 0V12.75H7.757a.75.75 0 0 1-.75-.75"/><path fill="currentColor" fill-rule="evenodd" d="M7.317 3.769a42.5 42.5 0 0 1 9.366 0c1.827.204 3.302 1.643 3.516 3.48c.37 3.157.37 6.346 0 9.503c-.215 1.837-1.69 3.275-3.516 3.48a42.5 42.5 0 0 1-9.366 0c-1.827-.205-3.302-1.643-3.516-3.48a41 41 0 0 1 0-9.503c.214-1.837 1.69-3.276 3.516-3.48m9.2 1.49a41 41 0 0 0-9.034 0A2.486 2.486 0 0 0 5.29 7.424a39.4 39.4 0 0 0 0 9.154a2.486 2.486 0 0 0 2.193 2.164c2.977.332 6.057.332 9.034 0a2.486 2.486 0 0 0 2.192-2.164a39.4 39.4 0 0 0 0-9.154a2.486 2.486 0 0 0-2.192-2.163" clip-rule="evenodd"/>';

export const RefreshOutlineBody =
  '<path fill="currentColor" d="M6.545 8.163a.75.75 0 0 1-.487-1.044l1.66-3.535a.75.75 0 0 1 1.36.002l.732 1.569l.08-.027a8.15 8.15 0 1 1-5.8 5.903a.75.75 0 1 1 1.456.364a6.65 6.65 0 1 0 4.907-4.862l.74 1.583a.75.75 0 0 1-.872 1.043z"/>';

export const SunOutlineBody =
  '<path fill="currentColor" d="M12 1.25a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0V2a.75.75 0 0 1 .75-.75"/><path fill="currentColor" fill-rule="evenodd" d="M6.25 12a5.75 5.75 0 1 1 11.5 0a5.75 5.75 0 0 1-11.5 0M12 7.75a4.25 4.25 0 1 0 0 8.5a4.25 4.25 0 0 0 0-8.5" clip-rule="evenodd"/><path fill="currentColor" d="M5.46 4.399a.75.75 0 0 0-1.061 1.06l.707.707a.75.75 0 1 0 1.06-1.06zM22.75 12a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75m-3.149-6.54a.75.75 0 1 0-1.06-1.061l-.707.707a.75.75 0 1 0 1.06 1.06zM12 20.25a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1a.75.75 0 0 1 .75-.75m6.894-2.416a.75.75 0 1 0-1.06 1.06l.707.707a.75.75 0 1 0 1.06-1.06zM3.75 12a.75.75 0 0 1-.75.75H2a.75.75 0 0 1 0-1.5h1a.75.75 0 0 1 .75.75m2.416 6.894a.75.75 0 0 0-1.06-1.06l-.707.707a.75.75 0 0 0 1.06 1.06z"/>';

export const NotificationOutlineBody =
  '<path fill="currentColor" fill-rule="evenodd" d="M13 3a1 1 0 1 0-2 0v.75h-.557A4.214 4.214 0 0 0 6.237 7.7l-.221 3.534a7.4 7.4 0 0 1-1.308 3.754a1.617 1.617 0 0 0 1.135 2.529l3.407.408V19a2.75 2.75 0 1 0 5.5 0v-1.075l3.407-.409a1.617 1.617 0 0 0 1.135-2.528a7.4 7.4 0 0 1-1.308-3.754l-.221-3.533a4.214 4.214 0 0 0-4.206-3.951H13zm-2.557 2.25a2.714 2.714 0 0 0-2.709 2.544l-.22 3.534a8.9 8.9 0 0 1-1.574 4.516a.117.117 0 0 0 .082.183l3.737.449c1.489.178 2.993.178 4.482 0l3.737-.449a.117.117 0 0 0 .082-.183a8.9 8.9 0 0 1-1.573-4.516l-.221-3.534a2.714 2.714 0 0 0-2.709-2.544zm1.557 15c-.69 0-1.25-.56-1.25-1.25v-.75h2.5V19c0 .69-.56 1.25-1.25 1.25" clip-rule="evenodd"/>';

// "Ran overnight into this day" marker — the widget puts it before the end time
// on the final day of a timed multi-day event, where the all-day sun would
// otherwise lie. Deliberately the sun's counterpart.
export const MoonOutlineBody =
  '<path fill="currentColor" fill-rule="evenodd" d="M11.486 4.768a7.25 7.25 0 1 0 7.399 9.51a6.25 6.25 0 0 1-7.398-9.51M3.25 12a8.75 8.75 0 0 1 10.074-8.65a.75.75 0 0 1 .336 1.342a4.75 4.75 0 1 0 5.83 7.499a.75.75 0 0 1 1.22.654A8.751 8.751 0 0 1 3.25 12" clip-rule="evenodd"/>';

// Birthday-calendar marker (basil gift-outline; Basil has no cake) — the
// widget's all-day glyph for the birthday calendar.
export const GiftOutlineBody =
  '<path fill="currentColor" fill-rule="evenodd" d="M6.25 5.5A3.25 3.25 0 0 1 12 3.423a3.25 3.25 0 0 1 5.24 3.827H18A2.75 2.75 0 0 1 20.75 10v2a1.75 1.75 0 0 1-1.281 1.687c.144 1.826.06 3.665-.25 5.473a2.46 2.46 0 0 1-2.15 2.028l-.915.102a37.4 37.4 0 0 1-8.309 0l-.914-.102a2.46 2.46 0 0 1-2.15-2.028a22 22 0 0 1-.25-5.473A1.75 1.75 0 0 1 3.25 12v-2A2.75 2.75 0 0 1 6 7.25h.76a3.24 3.24 0 0 1-.51-1.75m5 0a1.75 1.75 0 1 0-3.5 0a1.75 1.75 0 0 0 3.5 0m3.25 1.75a1.75 1.75 0 1 0 0-3.5a1.75 1.75 0 0 0 0 3.5M4.75 10c0-.69.56-1.25 1.25-1.25h5.25v3.5H5a.25.25 0 0 1-.25-.25zm8 3.75h5.219c.14 1.72.064 3.453-.228 5.156a.96.96 0 0 1-.839.791l-.914.103q-1.615.18-3.238.214zm0-1.5H19a.25.25 0 0 0 .25-.25v-2c0-.69-.56-1.25-1.25-1.25h-5.25zm-1.5 1.5v6.264a36 36 0 0 1-3.238-.214l-.914-.103a.96.96 0 0 1-.839-.79a20.6 20.6 0 0 1-.228-5.157z" clip-rule="evenodd"/>';
