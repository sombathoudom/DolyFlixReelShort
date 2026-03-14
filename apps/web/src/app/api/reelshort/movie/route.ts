import { type NextRequest, NextResponse } from "next/server";

import { getMovieWithPlayback } from "@/server/reelshort/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			bookId?: string;
			chapterId?: string;
		};
		if (!body.bookId?.trim()) {
			return NextResponse.json(
				{ error: "bookId is required." },
				{ status: 400 },
			);
		}

		const result = await getMovieWithPlayback(
			body.bookId.trim(),
			body.chapterId?.trim(),
		);
		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Movie lookup failed.",
			},
			{ status: 500 },
		);
	}
}
