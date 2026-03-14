import type { Metadata } from "next";
import { Albert_Sans, Cormorant_Garamond } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const albertSans = Albert_Sans({
	variable: "--font-reel-sans",
	subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
	weight: ["500", "600"],
	variable: "--font-reel-display",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "ReelShort",
	description:
		"Desktop-first movie browser, player, and downloader for ReelShort fans.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${albertSans.variable} ${cormorant.variable} antialiased`}
			>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
