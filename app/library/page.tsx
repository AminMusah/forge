"use client";

import { Library } from "reicon-react";

export default function LibraryPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <Library className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Library</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Saved prompts and files will live here. The library is coming soon.
      </p>
    </div>
  );
}
