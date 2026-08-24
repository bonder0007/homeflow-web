import type { Metadata } from "next";
import "./globals.css";
import "./dashboard.css";
import "./import.css";

export const metadata: Metadata = {
  title: "HomeFlow — התזרים הביתי שלנו",
  description: "ניהול תזרים, תקציבים והוצאות לבית",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="he" dir="rtl"><body>{children}</body></html>;
}
