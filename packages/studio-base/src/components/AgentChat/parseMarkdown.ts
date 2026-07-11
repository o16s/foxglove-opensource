// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Minimal markdown-to-HTML converter. Handles bold, italic, inline code,
 * code blocks, and newlines. Escapes HTML to prevent XSS.
 */
export function parseMarkdown(input: string): string {
  // First escape HTML
  let text = escapeHtml(input);

  // Code blocks (```...```) — must come before inline code
  text = text.replace(/```\n?([\s\S]*?)```/g, (_match, code: string) => {
    return `<pre><code>${code.replace(/\n$/, "")}</code></pre>`;
  });

  // Inline code (`...`)
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold (**...**)
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic (*...*)
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Newlines to <br> (but not inside <pre>)
  text = text.replace(/\n/g, "<br>");

  // Fix <br> inside <pre><code> — replace back
  text = text.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_match, code: string) => {
    return `<pre><code>${code.replace(/<br>/g, "\n")}</code></pre>`;
  });

  return text;
}
