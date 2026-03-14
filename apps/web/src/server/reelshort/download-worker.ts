import { type ChildProcess, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

import { sanitizeFileName } from "@/lib/reelshort/utils";
import { getMovie, getPlayback } from "@/server/reelshort/client";
import { spawnPendingWorkers } from "@/server/reelshort/download-manager";
import type { StoredDownloadJob } from "@/server/reelshort/download-store";
import {
	readDownloadJobs,
	updateDownloadJob,
} from "@/server/reelshort/download-store";

const DEFAULT_SAVE_DIRECTORY = join(homedir(), "Movies", "ReelShort");

function parseManifestDuration(manifest: string) {
	return manifest
		.split("\n")
		.filter((line) => line.startsWith("#EXTINF:"))
		.map((line) =>
			Number.parseFloat(line.replace("#EXTINF:", "").split(",")[0] ?? "0"),
		)
		.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function parseFfmpegTime(stderrChunk: string) {
	const match = stderrChunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
	if (!match) {
		return undefined;
	}

	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function run() {
	const jobId = process.argv[2];
	const concurrency = Number(process.argv[3] ?? "2");
	if (!jobId) {
		process.exit(1);
	}

	const jobs = await readDownloadJobs();
	const job = jobs.find((entry) => entry.id === jobId);
	if (!job || job.requestedStop) {
		process.exit(0);
	}

	let ffmpegProcess: ChildProcess | undefined;
	const stopHandler = async () => {
		if (ffmpegProcess) {
			ffmpegProcess.kill("SIGTERM");
		}
		await updateDownloadJob(jobId, (current) => ({
			...current,
			pid: undefined,
			status: "stopped",
			progress: 0,
			updatedAt: Date.now(),
		}));
		process.exit(0);
	};

	process.on("SIGTERM", () => {
		void stopHandler();
	});

	try {
		await updateDownloadJob(jobId, (current) => ({
			...current,
			status: "resolving",
			pid: process.pid,
			progress: 6,
			updatedAt: Date.now(),
		}));

		if (!ffmpegPath) {
			throw new Error("FFmpeg binary is not available.");
		}

		const movie = await getMovie(job.bookId, job.chapterId);
		const playback = await getPlayback(job.bookId, job.chapterId);
		if (!playback.videoUrl) {
			throw new Error("No playable video URL was returned for this episode.");
		}

		const movieTitle = sanitizeFileName(movie.title || "ReelShort");
		const episodeTitle = sanitizeFileName(playback.title || job.episodeTitle);
		const baseDirectory = job.saveDirectory || DEFAULT_SAVE_DIRECTORY;
		const finalDirectory = baseDirectory.includes(movieTitle)
			? baseDirectory
			: join(baseDirectory, movieTitle);
		await mkdir(finalDirectory, { recursive: true });
		const outputPath = join(finalDirectory, `${episodeTitle}.mp4`);

		await updateDownloadJob(jobId, (current) => ({
			...current,
			movieTitle: movie.title,
			episodeTitle: playback.title,
			status: "downloading",
			outputPath,
			progress: 12,
			updatedAt: Date.now(),
		}));

		const manifestText = await fetch(playback.videoUrl, {
			cache: "no-store",
		}).then((response) => response.text());
		const duration = parseManifestDuration(manifestText);

		ffmpegProcess = spawn(
			ffmpegPath,
			[
				"-y",
				"-protocol_whitelist",
				"file,http,https,tcp,tls,crypto,data",
				"-allowed_extensions",
				"ALL",
				"-i",
				playback.videoUrl,
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				outputPath,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);

		ffmpegProcess.stderr?.setEncoding("utf8");
		ffmpegProcess.stderr?.on("data", (chunk: string) => {
			void updateDownloadJob(jobId, (current) => {
				const time = parseFfmpegTime(chunk);
				const progress =
					time && duration
						? Math.min(96, Math.max(14, (time / duration) * 100))
						: current.progress;
				return {
					...current,
					lastLog: chunk.trim() || current.lastLog,
					status: progress > 94 ? "remuxing" : current.status,
					progress,
					updatedAt: Date.now(),
				};
			});
		});

		const exitCode = await new Promise<number>((resolve, reject) => {
			ffmpegProcess?.on("error", reject);
			ffmpegProcess?.on("close", (code) => resolve(code ?? -1));
		});

		if (exitCode !== 0) {
			const latest = (await readDownloadJobs()).find(
				(entry) => entry.id === jobId,
			)?.lastLog;
			throw new Error(
				latest
					? `FFmpeg exited with code ${exitCode}: ${latest}`
					: `FFmpeg exited with code ${exitCode}`,
			);
		}

		await updateDownloadJob(jobId, (current) => ({
			...current,
			pid: undefined,
			status: "completed",
			progress: 100,
			updatedAt: Date.now(),
		}));
	} catch (error) {
		await updateDownloadJob(jobId, (current) => ({
			...current,
			pid: undefined,
			status: "failed",
			progress: current.progress || 0,
			error: error instanceof Error ? error.message : "Download failed",
			updatedAt: Date.now(),
		}));
	} finally {
		await spawnPendingWorkers(concurrency);
		process.exit(0);
	}
}

void run();
