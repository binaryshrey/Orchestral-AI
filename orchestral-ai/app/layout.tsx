import type { Metadata } from "next";
import { Lora } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orchestral AI",
  description:
    "Orchestrate Your Agents, Automate Your Workflows & Scale Your Success!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${lora.variable} font-(family-name:--font-lora) antialiased`}
      >
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
