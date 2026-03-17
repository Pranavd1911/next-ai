import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexa AI",
  description: "Multi-mode AI chat app with guest mode, chat history, and image generation"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
