import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KE Control Tower — GoKwik",
  description: "KwikEngage merchant intelligence platform",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-background text-on-background antialiased">
        {children}
      </body>
    </html>
  );
}
