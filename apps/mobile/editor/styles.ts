/**
 * Aurora Haze typography for the note WebView, mirroring the web's
 * NOTE_TYPOGRAPHY (daily-note-editor.tsx) with the system font stack.
 */
export const EDITOR_CSS = `
:root {
  --ink: #171419;
  --ink-muted: #6b6470;
  --coral: #ef5a8a;
  --surface: rgba(23, 20, 25, 0.06);
  --hairline: rgba(23, 20, 25, 0.08);
  --input: rgba(23, 20, 25, 0.16);
  --background: #fbf8f5;
  color-scheme: light;
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--background);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.6;
  letter-spacing: -0.005em;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
#app { padding: 12px 20px 45vh; }
[hidden] { display: none !important; }
::selection { background: rgba(239, 90, 138, 0.25); }
textarea, .ProseMirror { caret-color: var(--coral); }

#title {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;
  padding: 4px 0 10px;
  margin: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 26px;
  line-height: 1.22;
  font-weight: 700;
  letter-spacing: -0.02em;
}
#title::placeholder { color: var(--ink-muted); opacity: 0.6; }
#heading { padding: 4px 0 10px; }
#heading-title {
  margin: 0;
  font-size: 26px;
  line-height: 1.22;
  font-weight: 700;
  letter-spacing: -0.02em;
}
#heading-subtitle {
  margin: 4px 0 0;
  color: var(--ink-muted);
  font-size: 14px;
  font-weight: 500;
}

.ProseMirror { outline: none; min-height: 50vh; padding: 4px 0 12px; word-wrap: break-word; white-space: pre-wrap; }
.ProseMirror > * + * { margin-top: 12px; }
.ProseMirror p { margin: 0; }
.ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { margin: 0; font-weight: 600; }
.ProseMirror > h1:not(:first-child) { margin-top: 32px; }
.ProseMirror > h2:not(:first-child) { margin-top: 28px; }
.ProseMirror > h3:not(:first-child) { margin-top: 24px; }
.ProseMirror h1 { font-size: 26px; line-height: 1.22; letter-spacing: -0.018em; }
.ProseMirror h2 { font-size: 20px; line-height: 1.3; letter-spacing: -0.01em; }
.ProseMirror h3 { font-size: 17px; line-height: 1.5; }
.ProseMirror ul, .ProseMirror ol { margin: 0; padding-left: 24px; }
.ProseMirror ul { list-style: disc; }
.ProseMirror ol { list-style: decimal; }
.ProseMirror li { padding-left: 4px; }
.ProseMirror li + li { margin-top: 4px; }
.ProseMirror li > ul, .ProseMirror li > ol { margin-top: 4px; }
.ProseMirror li::marker { color: var(--ink-muted); }
.ProseMirror a {
  color: var(--coral);
  text-decoration: underline;
  text-decoration-color: rgba(239, 90, 138, 0.4);
  text-underline-offset: 4px;
}
.ProseMirror blockquote {
  margin: 0;
  border-left: 3px solid rgba(239, 90, 138, 0.6);
  padding-left: 20px;
  color: var(--ink-muted);
}
.ProseMirror blockquote > * + * { margin-top: 8px; }
.ProseMirror code {
  border-radius: 6px;
  background: var(--surface);
  padding: 2px 4px;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 0.85em;
}
.ProseMirror pre {
  overflow-x: auto;
  border-radius: 16px;
  background: var(--ink);
  color: #ffffff;
  padding: 16px;
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre;
}
.ProseMirror pre code { background: transparent; padding: 0; font-size: 1em; color: inherit; }
.ProseMirror hr { border: 0; border-top: 1px solid var(--hairline); margin: 20px 0; }
.ProseMirror span[data-note-link] {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: rgba(239, 90, 138, 0.7);
  text-underline-offset: 4px;
  cursor: pointer;
}
.ProseMirror span[data-note-link].note-link-missing {
  text-decoration-style: dashed;
  text-decoration-color: var(--ink-muted);
  color: var(--ink-muted);
}
.ProseMirror .ProseMirror-selectednode { background: rgba(239, 90, 138, 0.12); border-radius: 4px; }
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--ink-muted);
  opacity: 0.75;
}
`;
