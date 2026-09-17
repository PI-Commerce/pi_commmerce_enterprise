// The actual Thesys C1 render path, isolated in its own module so it can be lazy-loaded
// (browser-only) — see PiThesysResult. C1Component is a pure renderer: given a captured
// c1Response DSL string it draws Thesys/Crayon UI with no API key and no network call.
import { C1Component, ThemeProvider } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";

// Give the two bar-chart series strong contrast: a muted slate for "Share of all
// calls" (context) against a bold brand blue for "Reached interest" (the signal).
// Crayon's grouped bar chart consumes palette indices 1 and 3 for the two series,
// so slate sits at 1 and blue at 3 (the off slots are filler).
const CHART_PALETTE = ["#94A3B8", "#94A3B8", "#2563EB", "#2563EB"];

export default function PiThesysInner({ c1Response }: { c1Response: string }) {
  return (
    <ThemeProvider theme={{ barChartPalette: CHART_PALETTE }}>
      <C1Component c1Response={c1Response} isStreaming={false} />
    </ThemeProvider>
  );
}
