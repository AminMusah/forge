"use client";

import { Check, ChevronExpandY, Eye } from "reicon-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { visionLabel, visionTasks, type VisionToken } from "@/lib/vision";

interface VisionTaskChipProps {
  value: VisionToken;
  onChange: (token: VisionToken) => void;
}

/**
 * What to ask of the next image. Florence-2 does very different jobs from the
 * same weights depending on a task token — captioning and OCR are one download,
 * not two — so this picker is the feature, not a setting.
 */
export function VisionTaskChip({ value, onChange }: VisionTaskChipProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 rounded-full bg-muted px-3 text-xs hover:bg-muted/80"
          />
        }
      >
        <Eye className="size-3.5" />
        <span className="max-w-32 truncate">{visionLabel(value)}</span>
        <ChevronExpandY className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        {visionTasks.map((task) => (
          <DropdownMenuItem
            key={task.token}
            onClick={() => onChange(task.token)}
          >
            <div className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{task.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {task.description}
              </span>
            </div>
            {task.token === value && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
