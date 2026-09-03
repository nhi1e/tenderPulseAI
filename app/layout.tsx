import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "TenderPulse AI",
	description:
		"Phân tích thị trường Covidien từ dữ liệu trúng thầu công khai tại Việt Nam.",
	icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="vi">
			<body>{children}</body>
		</html>
	);
}
