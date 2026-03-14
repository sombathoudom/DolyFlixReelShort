import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DownloadJob } from "@/lib/reelshort/types";
import {
	readDownloadJobs,
	type StoredDownloadJob,
	sortDownloadJobs,
	updateDownloadJob,
	writeDownloadJob,
} from "@/server/reelshort/download-store";

type QueueRequest = {
	bookId: string;
	chapterId: string;
	saveDirectory?: string;
};

const DEFAULT_SAVE_DIRECTORY = join(homedir(), "Movies", "ReelShort");

function now() {
	return Date.now();
}

function jobId(bookId: string, chapterId: string) {
	return `${bookId}:${chapterId}`;
}

function toSerializable(job: StoredDownloadJob): DownloadJob {
	const {
		pid: _pid,
		saveDirectory: _saveDirectory,
		lastLog: _lastLog,
		requestedStop: _requestedStop,
		...rest
	} = job;
	return rest;
}

function getWorkerPath() {
	const candidates = [
		join(process.cwd(), "apps/web/src/server/reelshort/download-worker.ts"),
		join(process.cwd(), "src/server/reelshort/download-worker.ts"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error("Unable to locate download worker script.");
}

async function canWriteDirectory(directory: string) {
	try {
		await access(directory);
		return true;
	} catch {
		return false;
	}
}

export async function spawnPendingWorkers(concurrentDownloads = 2) {
	const jobs = await readDownloadJobs();
	const runningCount = jobs.filter((job) =>
		["resolving", "downloading", "remuxing"].includes(job.status),
	).length;
	const availableSlots = Math.max(0, concurrentDownloads - runningCount);
	if (availableSlots === 0) {
		return;
	}

	const pending = jobs
		.filter((job) => job.status === "queued")
		.slice(0, availableSlots);
	if (pending.length === 0) {
		return;
	}

	const workerPath = getWorkerPath();
	for (const job of pending) {
		const child = spawn(
			"bun",
			[workerPath, job.id, String(concurrentDownloads)],
			{
				detached: true,
				stdio: "ignore",
				env: process.env,
			},
		);
		child.unref();
	}
}

export function getDefaultSaveDirectory() {
	return DEFAULT_SAVE_DIRECTORY;
}

export async function listDownloads() {
	const jobs = await readDownloadJobs();
	return sortDownloadJobs(jobs.map((job) => toSerializable(job)));
}

export async function stopDownload(id: string) {
	const jobs = await readDownloadJobs();
	const job = jobs.find((entry) => entry.id === id);
	if (!job) {
		return null;
	}

	if (job.pid) {
		try {
			process.kill(job.pid, "SIGTERM");
		} catch {}
	}

	const updatedJob = await updateDownloadJob(id, (current) => ({
		...current,
		pid: undefined,
		requestedStop: true,
		status: "stopped",
		error: undefined,
		progress: 0,
		updatedAt: now(),
	}));

	return updatedJob ? toSerializable(updatedJob) : null;
}

export async function queueDownloads(
	requests: QueueRequest[],
	options?: { concurrentDownloads?: number },
) {
	const concurrency = Math.max(
		1,
		Math.min(4, options?.concurrentDownloads ?? 2),
	);
	const jobs = await readDownloadJobs();
	const jobMap = new Map(jobs.map((job) => [job.id, job]));
	const queuedJobs: StoredDownloadJob[] = [];

	for (const request of requests) {
		const id = jobId(request.bookId, request.chapterId);
		const existing = jobMap.get(id);
		if (
			existing &&
			["queued", "resolving", "downloading", "remuxing"].includes(
				existing.status,
			)
		) {
			queuedJobs.push(existing);
			continue;
		}

		const saveDirectory =
			request.saveDirectory?.trim() || DEFAULT_SAVE_DIRECTORY;
		const directoryOk = await canWriteDirectory(saveDirectory);
		const job: StoredDownloadJob = {
			id,
			bookId: request.bookId,
			chapterId: request.chapterId,
			movieTitle: "ReelShort",
			episodeTitle: `Episode ${request.chapterId}`,
			status: directoryOk ? "queued" : "failed",
			progress: 0,
			outputPath: saveDirectory,
			saveDirectory,
			error: directoryOk
				? undefined
				: `Save directory does not exist: ${saveDirectory}`,
			createdAt: existing?.createdAt ?? now(),
			updatedAt: now(),
		};

		jobMap.set(id, job);
		queuedJobs.push(job);
		await writeDownloadJob(job);
	}

	await spawnPendingWorkers(concurrency);

	return queuedJobs.map((job) => toSerializable(job));
}
