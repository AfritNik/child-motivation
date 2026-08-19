import type { Metadata } from "next";
import "./globals.css";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "Семейная система мотивации",
  description: "Мобильное семейное приложение",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Саша",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#285f66",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
