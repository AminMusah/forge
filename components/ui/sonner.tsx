"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CheckCircle as CircleCheckIcon,
  InfoCircle as InfoIcon,
  AlertTriangle as TriangleAlertIcon,
  XCircle as OctagonXIcon,
  Loader as Loader2Icon,
} from "reicon-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "420px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast group/toast rounded-md! p-4! pr-6! shadow-lg!",
          title: "text-sm! font-medium!",
          description: "text-current! text-xs! opacity-90!",
          closeButton:
            "absolute! top-1! right-1! left-auto! translate-x-0! translate-y-0! size-6! rounded-md! border-none! bg-transparent! text-current/50! hover:text-current! opacity-0! group-hover/toast:opacity-100! focus-visible:opacity-100! transition-opacity!",
          success:
            "bg-green-100! text-green-800! border-green-200! dark:bg-green-950! dark:text-green-200! dark:border-green-900!",
          error:
            "bg-[#ef4444]! text-[#fafaf9]! border-[#ef4444]! dark:bg-red-950! dark:text-red-200! dark:border-red-900!",
          warning:
            "bg-amber-100! text-amber-800! border-amber-200! dark:bg-amber-950! dark:text-amber-200! dark:border-amber-900!",
          info: "bg-blue-100! text-blue-800! border-blue-200! dark:bg-blue-950! dark:text-blue-200! dark:border-blue-900!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
