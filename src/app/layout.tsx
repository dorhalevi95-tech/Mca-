import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCA Slot Monitor",
  description: "Watching for earlier MCA oral exam cancellations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
