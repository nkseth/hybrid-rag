import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hasLLM } from "@/lib/llm";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "hybrid-rag · Graph + Vector RAG",
  description: "Continuous ingestion, hybrid graph/vector/keyword retrieval, guardrails, tracing and evals on Next.js + libSQL.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const db = process.env.DATABASE_URL?.startsWith("libsql://") ? "turso" : "sqlite file";
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <AppShell llm={hasLLM() ? "openrouter" : "offline"} db={db}>{children}</AppShell>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
