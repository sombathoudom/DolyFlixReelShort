import { type NextRequest, NextResponse } from "next/server";

import { getPlayback } from "@/server/reelshort/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			bookId?: string;
			chapterId?: string;
		};
		if (!body.bookId?.trim() || !body.chapterId?.trim()) {
			return NextResponse.json(
				{ error: "bookId and chapterId are required." },
				{ status: 400 },
			);
		}

		const playback = await getPlayback(
			body.bookId.trim(),
			body.chapterId.trim(),
		);
		return NextResponse.json({ playback });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Playback lookup failed.",
			},
			{ status: 500 },
		);
	}
}
