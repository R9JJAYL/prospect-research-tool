import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospect Research Tool",
  description: "Research company ATS, live roles, and find recruiters",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
