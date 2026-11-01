/**
 * Parse a subset of markdown (Bold, Italic, Underline, Lists) into styled HTML safely.
 * Escapes raw HTML first to prevent XSS.
 */
export function parseMarkdownToHtml(text: string): string {
  if (!text) return "";

  // 1. Escape HTML to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Parse Underline: __text__ -> <u>text</u>
  html = html.replace(/__([^_]+)__/g, "<u>$1</u>");

  // 3. Parse Bold: **text** -> <strong>$1</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // 4. Parse Italic: *text* -> <em>$1</em> or _text_ -> <em>$1</em>
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  // 5. Parse Lists & Newlines
  const lines = html.split("\n");
  const processedLines: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bullet List: line starts with "- " or "* "
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    // Numbered List: line starts with "1. ", "2. ", etc.
    const numberMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

    if (bulletMatch) {
      if (inOrderedList) {
        processedLines.push("</ol>");
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        processedLines.push("<ul class='list-disc pl-5 my-1'>");
        inUnorderedList = true;
      }
      processedLines.push(`<li>${bulletMatch[2]}</li>`);
    } else if (numberMatch) {
      if (inUnorderedList) {
        processedLines.push("</ul>");
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        processedLines.push("<ol class='list-decimal pl-5 my-1'>");
        inOrderedList = true;
      }
      processedLines.push(`<li>${numberMatch[2]}</li>`);
    } else {
      // Close open lists if any
      if (inUnorderedList) {
        processedLines.push("</ul>");
        inUnorderedList = false;
      }
      if (inOrderedList) {
        processedLines.push("</ol>");
        inOrderedList = false;
      }
      processedLines.push(line);
    }
  }

  if (inUnorderedList) processedLines.push("</ul>");
  if (inOrderedList) processedLines.push("</ol>");

  // Join lines, appending br only for normal text paragraphs
  return processedLines
    .map((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("</ul>") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("</ol>") ||
        trimmed.startsWith("<li>")
      ) {
        return line;
      }
      return line === "" ? "<br />" : line + "<br />";
    })
    .join("");
}

/**
 * Convert HTML from rich text editor back to Markdown syntax
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  if (html === "<p></p>") return "";

  let md = html;

  // Process bold: <strong> or <b>
  md = md.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");

  // Process italic: <em> or <i>
  md = md.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*");

  // Process underline: <u>
  md = md.replace(/<u>([\s\S]*?)<\/u>/gi, "__$1__");

  // Process unordered lists: <ul><li>...</li></ul>
  md = md.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, listContent) => {
    return (
      listContent.replace(
        /<li>([\s\S]*?)<\/li>/gi,
        (_: any, item: string) => `- ${item.trim()}\n`,
      ) + "\n"
    );
  });

  // Process ordered lists: <ol><li>...</li></ol>
  md = md.replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, listContent) => {
    let index = 1;
    return (
      listContent.replace(
        /<li>([\s\S]*?)<\/li>/gi,
        (_: any, item: string) => `${index++}. ${item.trim()}\n`,
      ) + "\n"
    );
  });

  // Process <br> and <p>
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<p>([\s\S]*?)<\/p>/gi, "$1\n");

  // Strip any remaining html tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  md = md
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  return md.trim();
}
