// React 19's dev build emits "performance tracks" on every commit: for each
// re-rendered component whose props changed by reference, it deep-walks the
// old vs new props (up to depth 3) to build a timeline diff. A component
// receives the full `allData` array (tens of thousands of objects) as a prop,
// so each data update spent hundreds of ms in addObjectDiffToProperties —
// freezing the main thread. That logging is gated on `console.timeStamp`
// existing (`supportsUserTiming`), so removing it disables the walk. Dev-only
// instrumentation; production React has none of this code. Imported FIRST in
// frontend.tsx so it runs before react-dom evaluates `supportsUserTiming`.
if (typeof console !== "undefined" && typeof console.timeStamp === "function") {
  // @ts-expect-error — intentionally neutering the perf-track marker API
  delete console.timeStamp;
}
