"use client";

import * as React from "react";
import { Streamdown } from "streamdown";

import { CodeBlock } from "@/components/chat/code-block";
import { cn } from "@/lib/utils";

/** Extracts the plain text of a rendered markdown node (for code contents). */
function textOf(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

/**
 * Streamdown parses; our overrides style it with Forge's tokens rather than
 * its bundled look. `parseIncompleteMarkdown` completes unterminated blocks
 * mid-stream, so a half-written fence renders as code instead of flickering.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <Streamdown
      parseIncompleteMarkdown
      className="text-sm/relaxed"
      components={{
        p: ({ className, node: _node, ...props }) => (
          <p className={cn("mb-3 last:mb-0", className)} {...props} />
        ),
        h1: ({ className, node: _node, ...props }) => (
          <h2
            className={cn("mt-4 mb-2 text-base font-semibold first:mt-0", className)}
            {...props}
          />
        ),
        h2: ({ className, node: _node, ...props }) => (
          <h3
            className={cn("mt-4 mb-2 text-base font-semibold first:mt-0", className)}
            {...props}
          />
        ),
        h3: ({ className, node: _node, ...props }) => (
          <h4
            className={cn("mt-3 mb-1.5 text-sm font-semibold first:mt-0", className)}
            {...props}
          />
        ),
        ul: ({ className, node: _node, ...props }) => (
          <ul
            className={cn("mb-3 ml-5 list-disc space-y-1 last:mb-0", className)}
            {...props}
          />
        ),
        ol: ({ className, node: _node, ...props }) => (
          <ol
            className={cn("mb-3 ml-5 list-decimal space-y-1 last:mb-0", className)}
            {...props}
          />
        ),
        a: ({ className, node: _node, ...props }) => (
          <a
            target="_blank"
            rel="noreferrer"
            className={cn(
              "underline underline-offset-2 hover:text-foreground",
              className
            )}
            {...props}
          />
        ),
        blockquote: ({ className, node: _node, ...props }) => (
          <blockquote
            className={cn(
              "mb-3 border-l-2 border-border pl-3 text-muted-foreground last:mb-0",
              className
            )}
            {...props}
          />
        ),
        hr: ({ className, node: _node, ...props }) => (
          <hr className={cn("my-4 border-border", className)} {...props} />
        ),
        table: ({ className, node: _node, ...props }) => (
          <div className="mb-3 overflow-x-auto last:mb-0">
            <table
              className={cn("w-full border-collapse text-xs", className)}
              {...props}
            />
          </div>
        ),
        th: ({ className, node: _node, ...props }) => (
          <th
            className={cn(
              "border border-border bg-muted/50 px-2 py-1 text-left font-medium",
              className
            )}
            {...props}
          />
        ),
        td: ({ className, node: _node, ...props }) => (
          <td
            className={cn("border border-border px-2 py-1", className)}
            {...props}
          />
        ),
        // Streamdown routes both inline code and fenced blocks here; only a
        // fenced block carries a language class.
        code: ({ className, children, node: _node, ...props }) => {
          const language = /language-(\w+)/.exec(className ?? "")?.[1];
          if (!language) {
            return (
              <code
                className={cn(
                  "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            );
          }
          return (
            <CodeBlock code={textOf(children).replace(/\n$/, "")} language={language} />
          );
        },
        // The block wrapper would nest a <div> inside a <pre>; CodeBlock owns
        // its own container, so let it through untouched.
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {children}
    </Streamdown>
  );
}
