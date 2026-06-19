// The actual Thesys C1 render path, isolated in its own module so it can be lazy-loaded
// (browser-only) — see PiThesysResult. C1Component is a pure renderer: given a captured
// c1Response DSL string it draws Thesys/Crayon UI with no API key and no network call.
import { C1Component, ThemeProvider } from "@thesysai/genui-sdk";
import "@crayonai/react-ui/styles/index.css";

export default function PiThesysInner({ c1Response }: { c1Response: string }) {
  return (
    <ThemeProvider>
      <C1Component c1Response={c1Response} isStreaming={false} />
    </ThemeProvider>
  );
}
