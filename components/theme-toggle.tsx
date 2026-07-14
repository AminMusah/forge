"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Display, Moon, Sun } from "reicon-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // next-themes reads localStorage, so `theme` is unknown during SSR;
  // render a placeholder until mounted to avoid a hydration mismatch.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div className="size-8 shrink-0" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-8 shrink-0" />}
      >
        {theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <Display />}
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-32">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as string)}
        >
          <DropdownMenuRadioItem value="light">
            <Sun />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Display />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
