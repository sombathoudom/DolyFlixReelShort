import { type NextRequest, NextResponse } from "next/server";

import {
	listDownloads,
	queueDownloads,
	stopDownload,
} from "@/server/reelshort/download-manager";

export const runtime = "nodejs";

export async function GET() {
	return NextResponse.json({ jobs: await listDownloads() });
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as
			| {
					action: "queue";
					episodes: Array<{ bookId: string; chapterId: string }>;
					saveDirectory?: string;
					concurrentDownloads?: number;
			  }
			| {
					action: "stop";
					id: string;
			  };

		if (body.action === "queue") {
			const jobs = await queueDownloads(
				body.episodes.map((episode) => ({
					bookId: episode.bookId,
					chapterId: episode.chapterId,
					saveDirectory: body.saveDirectory,
				})),
				{ concurrentDownloads: body.concurrentDownloads },
			);

			return NextResponse.json({ jobs });
		}

		if (body.action === "stop") {
			const job = await stopDownload(body.id);
			return NextResponse.json({ job });
		}

		return NextResponse.json(
			{ error: "Unsupported download action." },
			{ status: 400 },
		);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Download action failed.",
			},
			{ status: 500 },
		);
	}
}
