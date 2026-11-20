import * as WebBrowser from "expo-web-browser";
import { Square, SquareCheck } from "lucide-react-native";
import { Fragment, useMemo, type ReactNode } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type TextStyle,
} from "react-native";
import type { ChatEntity } from "@/components/chat/chat-entities";
import {
  ENTITY_PILL_STYLES,
  entityDisplayLabel,
  EntityGlyph,
  useOpenEntity,
} from "@/components/chat/entity-pill";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { colors, entityColors, radius, spacing } from "@/lib/theme";
import {
  parseAssistantMarkdown,
  type BlockNode,
  type InlineNode,
  type Mark,
  type TableAlign,
} from "./markdown-model";

type RenderContext = {
  locale: SupportedLocale;
  openEntity: (entity: ChatEntity) => void;
  /** Text color for the current block (quotes are muted). */
  color: string;
};

function openLink(href: string) {
  if (/^https?:\/\//i.test(href) || href.startsWith("//")) {
    const url = href.startsWith("//") ? `https:${href}` : href;
    WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.foreground,
    }).catch((error: unknown) =>
      console.warn("Link could not be opened", error)
    );
    return;
  }

  if (/^(mailto|tel|sms):/i.test(href))
    Linking.openURL(href).catch((error: unknown) =>
      console.warn("Link could not be opened", error)
    );
}

function isOpenable(href: string) {
  return /^(https?:\/\/|\/\/|mailto:|tel:|sms:)/i.test(href);
}

function markStyle(marks: Mark[]): TextStyle | null {
  if (!marks.length) return null;

  return {
    ...(marks.includes("strong")
      ? { fontFamily: fonts.semibold, color: colors.foreground }
      : null),
    ...(marks.includes("em") ? { fontStyle: "italic" as const } : null),
    ...(marks.includes("del")
      ? {
          textDecorationLine: "line-through" as const,
          color: colors.mutedForeground,
        }
      : null),
  };
}

function InlinePill({
  entity,
  label,
  marks,
  context,
}: {
  entity: ChatEntity;
  label: string;
  marks: Mark[];
  context: RenderContext;
}) {
  const tint = entityColors[entity.kind];
  const text = entityDisplayLabel(entity, label, context.locale);

  return (
    <NativeText
      accessibilityRole="button"
      accessibilityLabel={`${ENTITY_PILL_STYLES[entity.kind][context.locale]}: ${text}`}
      onPress={() => context.openEntity(entity)}
      suppressHighlighting={false}
      style={[
        styles.pill,
        markStyle(marks),
        { backgroundColor: tint.background, color: tint.foreground },
      ]}
    >
      {" "}
      <View style={styles.pillIcon}>
        <EntityGlyph
          entity={entity}
          size={13}
          color={tint.foreground}
          strokeWidth={2.25}
        />
      </View>
      {` ${text} `}
    </NativeText>
  );
}

function renderInline(
  nodes: InlineNode[],
  context: RenderContext
): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return node.marks.length ? (
          <NativeText key={index} style={markStyle(node.marks)}>
            {node.text}
          </NativeText>
        ) : (
          <Fragment key={index}>{node.text}</Fragment>
        );
      case "break":
        return <Fragment key={index}>{"\n"}</Fragment>;
      case "code":
        return (
          <NativeText key={index} style={styles.inlineCode}>
            {` ${node.text} `}
          </NativeText>
        );
      case "link":
        return isOpenable(node.href) ? (
          <NativeText
            key={index}
            accessibilityRole="link"
            onPress={() => openLink(node.href)}
            style={styles.link}
          >
            {renderInline(node.children, context)}
          </NativeText>
        ) : (
          <Fragment key={index}>
            {renderInline(node.children, context)}
          </Fragment>
        );
      case "entity":
        return (
          <InlinePill
            key={index}
            entity={node.entity}
            label={node.label}
            marks={node.marks}
            context={context}
          />
        );
    }
  });
}

const HEADING_STYLES: Record<number, TextStyle> = {
  1: { fontSize: 19, lineHeight: 26, fontFamily: fonts.semibold },
  2: { fontSize: 17, lineHeight: 24, fontFamily: fonts.semibold },
  3: { fontSize: 16, lineHeight: 24, fontFamily: fonts.bold },
};

function inlineTextLength(nodes: InlineNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total +
      (node.type === "text" || node.type === "code"
        ? node.text.length
        : node.type === "entity"
          ? node.label.length + 3
          : node.type === "link"
            ? inlineTextLength(node.children)
            : 0),
    0
  );
}

const ALIGN: Record<Exclude<TableAlign, null>, TextStyle["textAlign"]> = {
  left: "left",
  center: "center",
  right: "right",
};

function Table({
  node,
  context,
}: {
  node: Extract<BlockNode, { type: "table" }>;
  context: RenderContext;
}) {
  // Size columns from their longest cell; a native table has no auto layout.
  const widths = node.header.map((cell, column) => {
    const longest = Math.max(
      inlineTextLength(cell),
      ...node.rows.map((row) => inlineTextLength(row[column] ?? []))
    );

    return Math.min(240, Math.max(72, longest * 8 + spacing.xl));
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tableScroll}
    >
      <View style={styles.table}>
        {[node.header, ...node.rows].map((row, rowIndex) => (
          <View
            key={rowIndex}
            style={[styles.tableRow, rowIndex === 0 && styles.tableHeader]}
          >
            {row.map((cell, column) => (
              <NativeText
                key={column}
                style={[
                  styles.tableCell,
                  { width: widths[column], color: context.color },
                  rowIndex === 0 && styles.tableHeaderText,
                  { textAlign: ALIGN[node.align[column] ?? "left"] ?? "left" },
                ]}
              >
                {renderInline(cell, context)}
              </NativeText>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Blocks({
  blocks,
  context,
  tight = false,
}: {
  blocks: BlockNode[];
  context: RenderContext;
  tight?: boolean;
}) {
  return (
    <View style={tight ? styles.tightBlocks : styles.blocks}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <NativeText
                key={index}
                style={[styles.paragraph, { color: context.color }]}
              >
                {renderInline(block.children, context)}
              </NativeText>
            );
          case "heading":
            return (
              <NativeText
                key={index}
                accessibilityRole="header"
                style={[
                  styles.paragraph,
                  HEADING_STYLES[block.depth] ?? HEADING_STYLES[3],
                  { color: colors.foreground },
                ]}
              >
                {renderInline(block.children, context)}
              </NativeText>
            );
          case "list":
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, itemIndex) => (
                  <View key={itemIndex} style={styles.listItem}>
                    <View style={styles.marker}>
                      {item.task ? (
                        item.checked ? (
                          <SquareCheck
                            size={16}
                            color={colors.foreground}
                            strokeWidth={2}
                          />
                        ) : (
                          <Square
                            size={16}
                            color={colors.mutedForeground}
                            strokeWidth={2}
                          />
                        )
                      ) : block.ordered ? (
                        <Text variant="mono" tone="muted">
                          {`${block.start + itemIndex}.`}
                        </Text>
                      ) : (
                        <Text variant="body" tone="muted">
                          •
                        </Text>
                      )}
                    </View>
                    <View style={styles.listContent}>
                      <Blocks blocks={item.children} context={context} tight />
                    </View>
                  </View>
                ))}
              </View>
            );
          case "blockquote":
            return (
              <View key={index} style={styles.quote}>
                <Blocks
                  blocks={block.children}
                  context={{ ...context, color: colors.mutedForeground }}
                  tight
                />
              </View>
            );
          case "code":
            return (
              <View key={index} style={styles.codeBlock}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <NativeText style={styles.codeText}>{block.text}</NativeText>
                </ScrollView>
              </View>
            );
          case "table":
            return <Table key={index} node={block} context={context} />;
          case "hr":
            return <View key={index} style={styles.hr} />;
        }
      })}
    </View>
  );
}

interface MarkdownProps {
  content: string;
  entities?: ChatEntity[];
  /** Append mutated records the text never names (off while streaming). */
  appendUnmentioned?: boolean;
  locale: SupportedLocale;
}

const NO_ENTITIES: ChatEntity[] = [];

/** Native rendering of an assistant answer with tappable entity pills. */
export function Markdown({
  content,
  entities = NO_ENTITIES,
  appendUnmentioned = true,
  locale,
}: MarkdownProps) {
  const openEntity = useOpenEntity();
  const document = useMemo(
    () => parseAssistantMarkdown(content, entities, appendUnmentioned),
    [content, entities, appendUnmentioned]
  );

  return (
    <Blocks
      blocks={document.blocks}
      context={{ locale, openEntity, color: colors.foreground }}
    />
  );
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.md },
  tightBlocks: { gap: spacing.xs },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: -0.08,
  },
  link: {
    color: colors.accent,
    textDecorationLine: "underline",
    textDecorationColor: colors.accent,
  },
  inlineCode: {
    fontFamily: fonts.mono,
    fontSize: 13,
    backgroundColor: colors.muted,
    color: colors.foreground,
  },
  pill: {
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  pillIcon: { width: 13, height: 13, marginBottom: -1 },
  list: { gap: spacing.xs },
  listItem: { flexDirection: "row", gap: spacing.sm },
  marker: { minWidth: 18, paddingTop: 3, alignItems: "flex-end" },
  listContent: { flex: 1 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
  },
  codeBlock: {
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    padding: spacing.lg,
  },
  codeText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primaryForeground,
  },
  tableScroll: { flexGrow: 0 },
  table: {
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.muted,
  },
  tableHeader: { borderTopWidth: 0, backgroundColor: colors.muted },
  tableCell: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  tableHeaderText: { fontFamily: fonts.bold, color: colors.foreground },
  hr: { height: 1, backgroundColor: colors.muted, marginVertical: spacing.xs },
});
