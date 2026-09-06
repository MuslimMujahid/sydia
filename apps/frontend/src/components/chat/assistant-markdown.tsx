import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils/cn";

const REMARK_PLUGINS = [remarkGfm];

const COMPONENTS = {
  p: ({ children }) => <p className="my-3 whitespace-pre-wrap">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="mt-5 mb-2 font-display text-xl leading-7 font-extrabold text-ink">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-5 mb-2 font-display text-lg leading-6 font-bold text-ink">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 mb-2 font-display text-base leading-6 font-bold text-ink">
      {children}
    </h3>
  ),
  ul: ({ children, className }) => (
    <ul
      className={cn(
        "my-3 list-outside list-disc space-y-1 pl-6 marker:text-ink-muted [&>li>p]:my-0",
        className
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children, className, start }) => (
    <ol
      className={cn(
        "my-3 list-outside list-decimal space-y-1 pl-6 marker:font-mono marker:text-xs marker:text-ink-muted [&>li>p]:my-0",
        className
      )}
      start={start}
    >
      {children}
    </ol>
  ),
  li: ({ children, className }) => (
    <li className={cn("pl-1", className)}>{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l border-hairline pl-4 text-ink-muted [&>p]:my-0">
      {children}
    </blockquote>
  ),
  a: ({ children, href, title }) => {
    const external =
      href?.startsWith("//") === true || /^https?:\/\//i.test(href ?? "");

    return (
      <a
        href={href}
        title={title}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        className="break-words text-link underline decoration-link/40 underline-offset-2 transition-colors hover:decoration-link focus-visible:rounded-xs focus-visible:ring-3 focus-visible:ring-brand/40 focus-visible:outline-none"
      >
        {children}
      </a>
    );
  },
  hr: () => <hr className="my-5 border-0 border-t border-surface-1" />,
  code: ({ children, className }) => (
    <code
      className={cn(
        "break-words rounded-sm bg-surface-1 px-1 py-0.5 font-mono text-xs leading-[18px] text-ink",
        className
      )}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 max-w-full overflow-x-auto rounded-md bg-editorial p-4 font-mono text-xs leading-[18px] text-canvas [&>code]:break-normal [&>code]:whitespace-pre [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-canvas">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 max-w-full overflow-x-auto rounded-md border border-surface-1">
      <table className="w-max min-w-full border-collapse text-left text-sm leading-5">
        {children}
      </table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      className="bg-surface-1/60 px-3 py-2 font-display font-bold text-ink"
      scope="col"
      style={style}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className="border-t border-surface-1 px-3 py-2 align-top" style={style}>
      {children}
    </td>
  ),
} satisfies Components;

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="min-w-0 break-words text-base leading-6 text-ink-soft [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={COMPONENTS}
        urlTransform={defaultUrlTransform}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export { AssistantMarkdown };
