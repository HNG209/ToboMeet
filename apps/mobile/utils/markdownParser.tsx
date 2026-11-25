import React from "react";
import { Linking, Platform, Text, TextStyle, View, ViewStyle } from "react-native";

interface InlineFormatFlags {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * Chuẩn hóa HTML (nếu nội dung có chứa thẻ HTML từ editor) về cú pháp Markdown thống nhất
 * để bộ parser React Native hiển thị đồng bộ hoàn toàn với Web (TipTap / markdownParser.ts).
 */
function normalizeRichTextInput(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/\r\n/g, "\n");

  // Nếu có chứa thẻ HTML (như <strong>, <em>, <u>, <p>, <ul>, <ol>, <li>, <br>)
  if (/<[a-z][\s\S]*?>/i.test(text)) {
    text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
    text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
    text = text.replace(/<u\b[^>]*>([\s\S]*?)<\/u>/gi, "__$1__");
    text = text.replace(/<(s|del|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, "~~$2~~");
    text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

    // Unordered lists
    text = text.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
      return (
        "\n" +
        inner.replace(
          /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
          (__: string, item: string) => `- ${item.trim()}\n`,
        )
      );
    });

    // Ordered lists
    text = text.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let idx = 1;
      return (
        "\n" +
        inner.replace(
          /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
          (__: string, item: string) => `${idx++}. ${item.trim()}\n`,
        )
      );
    });

    // Headings
    text = text.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
    text = text.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
    text = text.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");

    // Blockquotes
    text = text.replace(
      /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
      "\n> $1\n",
    );

    // Line breaks & paragraphs
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>\s*<p\b[^>]*>/gi, "\n");
    text = text.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "$1\n");

    // Strip any remaining HTML tags
    text = text.replace(/<[^>]+>/g, "");
  }

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text.replace(/\n{3,}/g, "\n\n").trimEnd();
}

function buildTextStyle(
  flags: InlineFormatFlags,
  baseStyle?: TextStyle,
): TextStyle {
  const decorations: ("underline" | "line-through")[] = [];
  if (flags.underline) decorations.push("underline");
  if (flags.strike) decorations.push("line-through");

  const textDecorationLine: TextStyle["textDecorationLine"] =
    decorations.length === 2
      ? "underline line-through"
      : decorations.length === 1
      ? decorations[0]
      : baseStyle?.textDecorationLine || "none";

  const style: TextStyle = {
    ...(baseStyle || {}),
    fontWeight: flags.bold ? "700" : baseStyle?.fontWeight || "normal",
    fontStyle: flags.italic ? "italic" : baseStyle?.fontStyle || "normal",
    textDecorationLine,
  };

  if (flags.code) {
    style.fontFamily = Platform.OS === "ios" ? "Menlo" : "monospace";
    style.backgroundColor = "#F1F5F9";
    style.color = "#0F172A";
    style.fontSize = ((baseStyle?.fontSize as number) || 15) - 1;
  }

  return style;
}

/**
 * Regex ưu tiên token dài hơn trước để hỗ trợ lồng nhau:
 * - ***bold italic***
 * - **bold**
 * - __underline__
 * - ~~strikethrough~~
 * - `inline code`
 * - *italic* hoặc _italic_
 * - URL (https://... hoặc http://...)
 * - @mention
 */
const INLINE_TOKEN_REGEX =
  /(\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|`[^`\n]+?`|\*[^*\s][^*\n]*?\*|\*[^*\s]\*|(?<![\w])_[^_\s][^_\n]*?_(?![\w])|(?<![\w])_[^_\s]_(?![\w])|https?:\/\/[^\s<>()]+|@[\p{L}\p{N}_-]+(?:\s[\p{L}\p{N}_-]+)?(?=\s|$|[.,!?;:]))/gu;

function renderInlineNodes(
  input: string,
  baseStyle?: TextStyle,
  flags: InlineFormatFlags = {},
  keyPrefix = "i",
  depth = 0,
): React.ReactNode[] {
  if (!input) return [];
  if (depth > 5) {
    return [
      <Text key={`${keyPrefix}-plain`} style={buildTextStyle(flags, baseStyle)}>
        {input}
      </Text>,
    ];
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE_TOKEN_REGEX.source, INLINE_TOKEN_REGEX.flags);

  while ((match = regex.exec(input)) !== null) {
    const token = match[0];
    const startIdx = match.index;

    if (startIdx > lastIndex) {
      nodes.push(
        <Text
          key={`${keyPrefix}-t-${lastIndex}`}
          style={buildTextStyle(flags, baseStyle)}
        >
          {input.slice(lastIndex, startIdx)}
        </Text>,
      );
    }

    const tokenKey = `${keyPrefix}-m-${startIdx}`;

    if (token.startsWith("***") && token.endsWith("***") && token.length > 6) {
      nodes.push(
        ...renderInlineNodes(
          token.slice(3, -3),
          baseStyle,
          { ...flags, bold: true, italic: true },
          tokenKey,
          depth + 1,
        ),
      );
    } else if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      nodes.push(
        ...renderInlineNodes(
          token.slice(2, -2),
          baseStyle,
          { ...flags, bold: true },
          tokenKey,
          depth + 1,
        ),
      );
    } else if (token.startsWith("__") && token.endsWith("__") && token.length > 4) {
      nodes.push(
        ...renderInlineNodes(
          token.slice(2, -2),
          baseStyle,
          { ...flags, underline: true },
          tokenKey,
          depth + 1,
        ),
      );
    } else if (token.startsWith("~~") && token.endsWith("~~") && token.length > 4) {
      nodes.push(
        ...renderInlineNodes(
          token.slice(2, -2),
          baseStyle,
          { ...flags, strike: true },
          tokenKey,
          depth + 1,
        ),
      );
    } else if (token.startsWith("`") && token.endsWith("`") && token.length > 2) {
      nodes.push(
        <Text
          key={tokenKey}
          style={buildTextStyle({ ...flags, code: true }, baseStyle)}
        >
          {` ${token.slice(1, -1)} `}
        </Text>,
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*") && token.length > 2) ||
      (token.startsWith("_") && token.endsWith("_") && token.length > 2)
    ) {
      nodes.push(
        ...renderInlineNodes(
          token.slice(1, -1),
          baseStyle,
          { ...flags, italic: true },
          tokenKey,
          depth + 1,
        ),
      );
    } else if (/^https?:\/\//i.test(token)) {
      nodes.push(
        <Text
          key={tokenKey}
          onPress={() => Linking.openURL(token).catch(() => {})}
          style={[
            buildTextStyle({ ...flags, underline: true }, baseStyle),
            { color: "#0052FF" },
          ]}
        >
          {token}
        </Text>,
      );
    } else if (token.startsWith("@")) {
      nodes.push(
        <Text
          key={tokenKey}
          style={[
            buildTextStyle({ ...flags, bold: true }, baseStyle),
            { color: "#0052FF" },
          ]}
        >
          {token}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={tokenKey} style={buildTextStyle(flags, baseStyle)}>
          {token}
        </Text>,
      );
    }

    lastIndex = startIdx + token.length;
  }

  if (lastIndex < input.length) {
    nodes.push(
      <Text
        key={`${keyPrefix}-end-${lastIndex}`}
        style={buildTextStyle(flags, baseStyle)}
      >
        {input.slice(lastIndex)}
      </Text>,
    );
  }

  return nodes;
}

/**
 * Component hiển thị Rich Text (Markdown & HTML từ Web/Mobile) đầy đủ block-level cho React Native.
 * Hỗ trợ: In đậm, In nghiêng, Gạch chân (__ / <u>), Gạch ngang (~~), Code, Heading, Trích dẫn,
 * Danh sách dấu chấm (- / *), Danh sách số (1. 2. ...), @mention và link bấm được.
 */
export function RichTextContent({
  content,
  baseStyle,
  containerStyle,
}: {
  content: string;
  baseStyle?: TextStyle;
  containerStyle?: ViewStyle;
}) {
  if (!content) return null;

  const normalized = normalizeRichTextInput(content);
  const lines = normalized.split("\n");
  const defaultTextStyle: TextStyle = {
    fontSize: 15,
    lineHeight: 22,
    color: "#334155",
    ...(baseStyle || {}),
  };

  return (
    <View style={containerStyle}>
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();

        // Dòng trống -> tạo khoảng thở nhẹ giữa đoạn văn
        if (!trimmed) {
          return <View key={`sp-${lineIdx}`} style={{ height: 6 }} />;
        }

        // Heading (#, ##, ###)
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const headingStyle: TextStyle = {
            ...defaultTextStyle,
            fontWeight: "700",
            color: "#0F172A",
            fontSize: level === 1 ? 19 : level === 2 ? 17 : 15.5,
            lineHeight: level === 1 ? 26 : level === 2 ? 24 : 22,
          };
          return (
            <Text key={`h-${lineIdx}`} style={[headingStyle, { marginBottom: 4 }]}>
              {renderInlineNodes(headingMatch[2], headingStyle, {}, `h${lineIdx}`)}
            </Text>
          );
        }

        // Blockquote (> text)
        const quoteMatch = line.match(/^>\s?(.*)$/);
        if (quoteMatch) {
          const quoteStyle: TextStyle = {
            ...defaultTextStyle,
            fontStyle: "italic",
            color: "#475569",
          };
          return (
            <View
              key={`q-${lineIdx}`}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: "#CBD5E1",
                paddingLeft: 10,
                paddingVertical: 2,
                marginVertical: 2,
                backgroundColor: "#F8FAFC",
                borderRadius: 4,
              }}
            >
              <Text style={quoteStyle}>
                {renderInlineNodes(quoteMatch[1], quoteStyle, {}, `q${lineIdx}`)}
              </Text>
            </View>
          );
        }

        // Bullet List (- item, * item, • item) với thụt lề chuẩn
        const bulletMatch = line.match(/^(\s*)[-*•]\s+(.+)$/);
        if (bulletMatch) {
          const indent = Math.min(24, Math.floor(bulletMatch[1].length / 2) * 12);
          return (
            <View
              key={`ul-${lineIdx}`}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingLeft: 6 + indent,
                marginVertical: 1.5,
              }}
            >
              <Text
                style={[
                  defaultTextStyle,
                  { fontWeight: "700", marginRight: 8, color: "#475569" },
                ]}
              >
                •
              </Text>
              <Text style={[defaultTextStyle, { flex: 1 }]}>
                {renderInlineNodes(bulletMatch[2], defaultTextStyle, {}, `ul${lineIdx}`)}
              </Text>
            </View>
          );
        }

        // Numbered List (1. item, 2. item...) với thụt lề chuẩn
        const numMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/);
        if (numMatch) {
          const indent = Math.min(24, Math.floor(numMatch[1].length / 2) * 12);
          return (
            <View
              key={`ol-${lineIdx}`}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingLeft: 4 + indent,
                marginVertical: 1.5,
              }}
            >
              <Text
                style={[
                  defaultTextStyle,
                  {
                    fontWeight: "700",
                    marginRight: 6,
                    minWidth: 20,
                    color: "#475569",
                  },
                ]}
              >
                {numMatch[2]}
              </Text>
              <Text style={[defaultTextStyle, { flex: 1 }]}>
                {renderInlineNodes(numMatch[3], defaultTextStyle, {}, `ol${lineIdx}`)}
              </Text>
            </View>
          );
        }

        // Đoạn văn bản thường
        return (
          <Text key={`p-${lineIdx}`} style={[defaultTextStyle, { marginVertical: 1 }]}>
            {renderInlineNodes(line, defaultTextStyle, {}, `p${lineIdx}`)}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * Helper inline tương thích ngược cho các nơi đang dùng trực tiếp bên trong <Text>.
 */
export function renderFormattedText(text: string, baseStyle?: TextStyle) {
  if (!text) return null;

  const normalized = normalizeRichTextInput(text);
  const lines = normalized.split("\n");

  return lines.map((line, lineIdx) => {
    let prefix: React.ReactNode = null;
    let lineContent = line;

    const bulletMatch = lineContent.match(/^\s*[-*•]\s+(.+)$/);
    if (bulletMatch) {
      prefix = <Text style={[{ fontWeight: "700" }, baseStyle]}>• </Text>;
      lineContent = bulletMatch[1];
    } else {
      const numMatch = lineContent.match(/^\s*(\d+\.)\s+(.+)$/);
      if (numMatch) {
        prefix = (
          <Text style={[{ fontWeight: "700" }, baseStyle]}>{numMatch[1]} </Text>
        );
        lineContent = numMatch[2];
      }
    }

    return (
      <Text key={lineIdx} style={baseStyle}>
        {prefix}
        {renderInlineNodes(lineContent, baseStyle, {}, `ln${lineIdx}`)}
        {lineIdx < lines.length - 1 ? "\n" : ""}
      </Text>
    );
  });
}
