import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface TelegramRichTextProps {
  content: string;
}

const PLUGINS = [remarkGfm];
const COMPONENTS = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      scope="col"
      style={style}
      className="border border-current/20 px-3 py-2"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-current/20 px-3 py-2 align-top">
      {children}
    </td>
  ),
} satisfies Components;

/** Preview the text formats Sydia sends through Telegram's Rich Markdown API.
 * Native Telegram also supports media and other blocks; this local preview
 * deliberately renders text only, without web-chat entity pills or raw HTML.
 */
export function TelegramRichText({ content }: TelegramRichTextProps) {
  return (
    <div className="min-w-0 break-words [overflow-wrap:anywhere] [&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_code]:rounded-sm [&_code]:bg-current/5 [&_code]:px-1 [&_code]:font-mono [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_h4]:text-base [&_h5]:text-base [&_h6]:text-base [&_hr]:my-4 [&_hr]:border-current/20 [&_li>p]:my-0 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p]:whitespace-pre-wrap [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:bg-current/5 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_:is(h1,h2,h3,h4,h5,h6)]:mt-4 [&_:is(h1,h2,h3,h4,h5,h6)]:mb-2 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold">
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
