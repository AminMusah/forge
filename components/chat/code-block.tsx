"use client";

import * as React from "react";
import { File } from "@pierre/diffs/react";
import { useTheme } from "next-themes";
import { Check, Copy } from "reicon-react";

import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language: string;
}

/**
 * Chat-sized code block on @pierre/diffs. The library's review chrome (file
 * header, line selection) is stripped; we keep its Shiki highlighting and line
 * numbers and add our own bar with the language and a copy button.
 */
export function CodeBlock({ code, language }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const file = React.useMemo(
    () => ({ name: `snippet.${language}`, contents: code, lang: language }),
    [code, language]
  );

  return (
    <div className="my-3 overflow-hidden rounded-lg border bg-card">
      <div className="flex h-8 items-center justify-between border-b px-3">
        <span className="text-xs text-muted-foreground">{language}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Copy code"
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div className="overflow-x-auto text-sm">
        <File
          file={file}
          options={{
            disableFileHeader: true,
            themeType: resolvedTheme === "dark" ? "dark" : "light",
            theme: { light: "github-light", dark: "github-dark" },
            overflow: "scroll",
          }}
        />
      </div>
    </div>
  );
}
