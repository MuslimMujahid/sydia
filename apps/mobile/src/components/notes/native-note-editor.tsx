import {
  BookOpen,
  Bold,
  Code2,
  Heading,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react-native";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { IconButton } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/states";
import { EDITOR_HTML } from "@/lib/editor/editor-html.generated";
import {
  EMPTY_ACTIVE_STATE,
  type EditorActiveState,
  type EditorCommand,
  type EditorInbound,
  type EditorLinkQuery,
  type EditorOutbound,
} from "@/lib/editor/protocol";
import type { TiptapDoc } from "@/lib/services/api/daily-notes/daily-notes.api";
import { colors, spacing } from "@/lib/theme";

const source = { html: EDITOR_HTML, baseUrl: "about:blank" };

export type NoteEditorBridge = {
  send: (message: EditorInbound) => void;
  flush: () => Promise<void>;
};

type NativeNoteEditorProps = {
  ref?: Ref<NoteEditorBridge>;
  init: Extract<EditorInbound, { type: "init" }>;
  knownRefs: string[];
  editable: boolean;
  onDirty: () => void;
  onContent?: (content: TiptapDoc) => void;
  onHtmlContent?: (html: string) => void;
  onReady?: () => void;
  onTitle?: (title: string) => void;
  onError: (message: string) => void;
  onLink?: (target: string | null, label: string, position: number) => void;
  onExternalLink?: (url: string) => void;
  onPickLink?: (query?: EditorLinkQuery) => void;
  onSetWebLink: (url: string | null) => void;
};

const formats = [
  { command: "bold", label: "Tebal", icon: Bold },
  { command: "italic", label: "Miring", icon: Italic },
  { command: "underline", label: "Garis bawah", icon: Underline },
  { command: "strike", label: "Coret", icon: Strikethrough },
  { command: "bulletList", label: "Daftar poin", icon: List },
  { command: "orderedList", label: "Daftar bernomor", icon: ListOrdered },
  { command: "blockquote", label: "Kutipan", icon: Quote },
] as const;

export function NativeNoteEditor({
  ref,
  init,
  knownRefs,
  editable,
  onDirty,
  onContent,
  onHtmlContent,
  onReady,
  onTitle,
  onError,
  onLink,
  onExternalLink,
  onPickLink,
  onSetWebLink,
}: NativeNoteEditorProps) {
  const webView = useRef<WebView<object>>(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<EditorActiveState>(EMPTY_ACTIVE_STATE);
  const [linkQuery, setLinkQuery] = useState<EditorLinkQuery | null>(null);
  const [bodyFocused, setBodyFocused] = useState(false);
  const nextFlushId = useRef(0);
  const flushes = useRef(
    new Map<
      number,
      {
        timer: ReturnType<typeof setTimeout>;
        resolve: () => void;
        reject: (failure: Error) => void;
      }
    >()
  );

  function send(message: EditorInbound) {
    webView.current?.injectJavaScript(
      `window.sydiaEditor.receive(${JSON.stringify(message)}); true;`
    );
  }

  useImperativeHandle(
    ref,
    () => ({
      send,
      flush: () =>
        new Promise((resolve, reject) => {
          if (!loaded) {
            reject(new Error("Editor belum siap. Coba lagi."));
            return;
          }

          const id = ++nextFlushId.current;
          const timer = setTimeout(() => {
            flushes.current.delete(id);
            reject(
              new Error("Isi terbaru dari editor belum tersedia. Coba lagi.")
            );
          }, 2500);

          flushes.current.set(id, { timer, resolve, reject });
          send({ type: "flush", id });
        }),
    }),
    [loaded]
  );

  useEffect(() => {
    const pending = flushes.current;
    return () => {
      for (const flush of pending.values()) {
        clearTimeout(flush.timer);
        flush.reject(
          new Error("Editor ditutup sebelum isi terbaru diperoleh.")
        );
      }
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (loaded) send({ type: "setKnownRefs", refs: knownRefs });
  }, [knownRefs, loaded]);

  useEffect(() => {
    if (loaded) send({ type: "setEditable", editable });
  }, [editable, loaded]);

  function receive(event: WebViewMessageEvent) {
    let message: EditorOutbound;
    try {
      message = JSON.parse(event.nativeEvent.data) as EditorOutbound;
    } catch (caught) {
      console.warn("Note editor sent unreadable data", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      onError("Editor mengirim data yang tidak dapat dibaca.");
      return;
    }

    switch (message.type) {
      case "ready":
        send({ ...init, knownRefs, editable });
        break;
      case "loaded":
        setLoaded(true);
        onReady?.();
        break;
      case "contentError":
      case "log":
        // Document text and editor-internal exceptions are never logged.
        console.warn("Note editor bridge reported a failure", {
          type: message.type,
        });
        onError("Isi catatan tidak dapat dibuka di editor ini.");
        break;
      case "pendingChange":
        onDirty();
        break;
      case "change":
        onContent?.(message.content);
        if (message.html !== undefined) onHtmlContent?.(message.html);
        break;
      case "title":
        onTitle?.(message.title);
        break;
      case "state":
        setActive(message.state);
        break;
      case "focus":
        setBodyFocused(message.target === "editor");
        break;
      case "linkQuery":
        setLinkQuery(message.query);
        break;
      case "noteLinkTap":
        onLink?.(message.target, message.label, message.position);
        break;
      case "linkTap":
        onExternalLink?.(message.href);
        break;
      case "flushed": {
        const flush = flushes.current.get(message.id);
        if (flush) {
          clearTimeout(flush.timer);
          flushes.current.delete(message.id);
          flush.resolve();
        }
        break;
      }
    }
  }

  function command(value: EditorCommand) {
    send({ type: "command", command: value });
  }

  return (
    <View style={styles.container}>
      <WebView<object>
        source={source}
        ref={webView}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) =>
          request.url === "about:blank"
        }
        onMessage={receive}
        onError={() => {
          console.warn("Note editor WebView failed to load");
          onError("Editor tidak dapat dimuat.");
        }}
        onRenderProcessGone={() => {
          console.warn("Note editor WebView process ended");
          onError("Editor ditutup oleh sistem.");
        }}
        onContentProcessDidTerminate={() => {
          console.warn("Note editor WebView process ended");
          onError("Editor ditutup oleh sistem.");
        }}
        allowFileAccess={false}
        domStorageEnabled={false}
        cacheEnabled={false}
        // This is an iOS prop. The Android Fabric view expects an array and
        // can crash when a string reaches its native prop parser.
        dataDetectorTypes={Platform.OS === "ios" ? ["none"] : undefined}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        style={styles.webView}
      />
      {!loaded ? (
        <View style={styles.loading}>
          <LoadingState label="Membuka editor…" />
        </View>
      ) : null}
      {loaded && editable && bodyFocused ? (
        <View style={styles.toolbar}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
          >
            {onPickLink ? (
              <IconButton
                size={44}
                icon={BookOpen}
                accessibilityLabel="Tautkan catatan"
                onPress={() => onPickLink(linkQuery ?? undefined)}
              />
            ) : null}
            <IconButton
              size={44}
              icon={Undo2}
              accessibilityLabel="Urungkan"
              disabled={!active.canUndo}
              onPress={() => command("undo")}
            />
            <IconButton
              size={44}
              icon={Redo2}
              accessibilityLabel="Ulangi"
              disabled={!active.canRedo}
              onPress={() => command("redo")}
            />
            <IconButton
              size={44}
              icon={Heading}
              accessibilityLabel="Judul bagian"
              accessibilityState={{ selected: active.block === "heading2" }}
              variant={active.block === "heading2" ? "secondary" : "ghost"}
              onPress={() => command("heading2")}
            />
            {formats.map(({ command: format, icon, label }) => (
              <IconButton
                key={format}
                size={44}
                icon={icon}
                accessibilityLabel={label}
                accessibilityState={{ selected: active[format] }}
                variant={active[format] ? "secondary" : "ghost"}
                onPress={() => command(format)}
              />
            ))}
            <IconButton
              size={44}
              icon={Code2}
              accessibilityLabel="Blok kode"
              onPress={() => command("codeBlock")}
            />
            <IconButton
              size={44}
              icon={Link2}
              accessibilityLabel="Tautkan situs web"
              onPress={() => onSetWebLink(active.link)}
            />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webView: { flex: 1, backgroundColor: colors.background },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
  toolbar: {
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardBorder,
  },
  actions: { paddingHorizontal: spacing.sm },
});
