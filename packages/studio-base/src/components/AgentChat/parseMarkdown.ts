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

function parseTable(lines: string[]): string {
  // lines[0] = header row, lines[1] = separator, lines[2..] = data rows
  const headerCells = lines[0]!
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const headerRow = headerCells.map((c) => `<th>${c}</th>`).join("");

  const bodyRows = lines.slice(2).map((line) => {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  });

  return `<table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`;
}

/**
 * Minimal markdown-to-HTML converter. Handles bold, italic, inline code,
 * code blocks, tables, lists, and newlines. Escapes HTML to prevent XSS.
 */
export function parseMarkdown(input: string): string {
  // First escape HTML
  let text = escapeHtml(input);

  // Code blocks (```...```) — must come before inline code
  text = text.replace(/```\n?([\s\S]*?)```/g, (_match, code: string) => {
    return `<pre><code>${code.replace(/\n$/, "")}</code></pre>`;
  });

  // Parse tables and lists line-by-line (must come before newline→<br> conversion)
  const lines = text.split("\n");
  const outputLines: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // Detect table: current line has |, next line is separator (|---|)
    if (
      i + 1 < lines.length &&
      lines[i]!.includes("|") &&
      /^\|?[\s-:|]+\|[\s-:|]+\|?$/.test(lines[i + 1]!)
    ) {
      const tableLines: string[] = [lines[i]!, lines[i + 1]!];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim().length > 0) {
        tableLines.push(lines[i]!);
        i++;
      }
      outputLines.push(parseTable(tableLines));
      continue;
    }

    // Detect unordered list items (- item or * item)
    if (/^[\s]*[-*]\s/.test(lines[i]!)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^[\s]*[-*]\s/, ""));
        i++;
      }
      outputLines.push(`<ul>${listItems.map((li) => `<li>${li}</li>`).join("")}</ul>`);
      continue;
    }

    outputLines.push(lines[i]!);
    i++;
  }

  text = outputLines.join("\n");

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
