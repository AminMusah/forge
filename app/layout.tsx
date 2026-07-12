import type { Metadata } from "next";
import { Geist, Geist_Mono, Raleway, Cascadia_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { ModalProvider } from "@/components/modals/modal-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

const raleway = Raleway({ subsets: ["latin"], variable: "--font-sans" });
const cascadia_mono = Cascadia_Mono({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Forge",
  description: "Forge — your AI chat workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        raleway.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster />
          <SidebarProvider>
            <ModalProvider />
            <AppSidebar />
            <div className="h-svh overflow-hidden lg:p-2 pl-0 w-full">
              <div className="lg:border lg:rounded-lg overflow-hidden flex flex-col items-center justify-start bg-background h-full w-full">
                <header className="w-full flex items-center gap-2 border-b px-4 h-10 shrink-0">
                  <SidebarTrigger />
                </header>
                <div className="overflow-auto w-full h-[calc(100svh-40px)] lg:h-[calc(100svh-56px)]">
                  {children}
                </div>
              </div>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
