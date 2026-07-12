"use client";

import { Folder2 } from "reicon-react";

export default function ProjectsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <Folder2 className="size-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Projects</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Group chats and files around what you&apos;re working on. Projects are
        coming soon.
      </p>
    </div>
  );
}
