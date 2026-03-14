import { type NextRequest, NextResponse } from "next/server";

import { searchMovies } from "@/server/reelshort/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as {
			query?: string;
			page?: number;
			pageSize?: number;
		};
		if (!body.query?.trim()) {
			return NextResponse.json(
				{ error: "Search query is required." },
				{ status: 400 },
			);
		}

		const results = await searchMovies(
			body.query.trim(),
			body.page ?? 1,
			body.pageSize ?? 10,
		);
		return NextResponse.json({ results });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Search failed." },
			{ status: 500 },
		);
	}
}
