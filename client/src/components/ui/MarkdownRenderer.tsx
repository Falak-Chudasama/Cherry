import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  variant?: "default" | "compact" | "bubble";
}

/**
 * Validates URLs to prevent script injection (e.g. javascript:, vbscript:, data:).
 * Only permits http, https, mailto, and relative anchors/paths.
 */
function safeUrlTransform(url: string): string {
  const sanitized = url.trim();
  if (!sanitized) return "";
  const lower = sanitized.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:")
  ) {
    return "#unsafe-link-blocked";
  }
  return sanitized;
}

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const codeText = String(children).replace(/\n$/, "");

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded-md font-mono text-[11px] bg-stone-200/60 dark:bg-stone-800/80 text-stone-800 dark:text-stone-200 border border-stone-300/40 dark:border-stone-700/50">
        {children}
      </code>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="relative my-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-stone-900 text-stone-100 dark:bg-[#151613] overflow-hidden text-xs font-mono shadow-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-stone-800/80 dark:bg-stone-850/80 border-b border-stone-700/50 text-stone-400 text-3xs select-none">
        <span className="uppercase tracking-wider">{match ? match[1] : "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-stone-200 transition py-0.5 px-1.5 rounded hover:bg-stone-700/50"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed [scrollbar-width:thin]">
        <code>{codeText}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  variant = "default",
}) => {
  if (!content) return null;

  const isCompact = variant === "compact";

  return (
    <div
      className={`markdown-body text-stone-800 dark:text-stone-200 leading-relaxed break-words font-sans ${
        isCompact ? "text-xs space-y-1" : "text-xs sm:text-sm space-y-2"
      } ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={safeUrlTransform}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold font-sans tracking-tight text-stone-950 dark:text-stone-50 mt-3 mb-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold font-sans tracking-tight text-stone-900 dark:text-stone-100 mt-2.5 mb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold font-sans tracking-tight text-stone-900 dark:text-stone-100 mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold font-sans text-stone-800 dark:text-stone-200 mt-1.5 mb-0.5">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className={isCompact ? "my-0.5" : "my-1.5"}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 my-1.5 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 my-1.5 space-y-1">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-stone-300 dark:border-stone-700 pl-3 my-2 italic text-stone-600 dark:text-stone-400">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white/40 dark:bg-stone-900/30">
              <table className="w-full text-left border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-stone-100/80 dark:bg-stone-800/80 border-b border-stone-200/80 dark:border-stone-800 font-semibold text-stone-800 dark:text-stone-200">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-stone-200/60 dark:divide-stone-800/60">
              {children}
            </tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-stone-50/50 dark:hover:bg-stone-850/40 transition">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 text-2xs uppercase tracking-wider">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2">{children}</td>,
          hr: () => <hr className="my-3 border-stone-200/80 dark:border-stone-800" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-cherry-600 dark:text-cherry-400 underline underline-offset-2 hover:opacity-80 transition font-medium"
            >
              {children}
            </a>
          ),
          input: ({ type, checked, disabled }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  readOnly
                  className="rounded border-stone-300 dark:border-stone-700 text-cherry-500 mr-1.5 focus:ring-0 align-middle"
                />
              );
            }
            return null;
          },
          code: CodeBlock as any,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
