import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DownloadJob } from "@/lib/reelshort/types";

export type StoredDownloadJob = DownloadJob & {
	pid?: number;
	saveDirectory?: string;
	lastLog?: string;
	requestedStop?: boolean;
};

const STORE_DIR = join(homedir(), ".reelshort", "downloads");

function filePathForJob(id: string) {
	return join(STORE_DIR, `${encodeURIComponent(id)}.json`);
}

async function ensureStore() {
	await mkdir(STORE_DIR, { recursive: true });
}

export async function readDownloadJobs() {
	await ensureStore();
	const entries = await readdir(STORE_DIR);
	const jobs = await Promise.all(
		entries
			.filter((entry) => entry.endsWith(".json"))
			.map(async (entry) => {
				try {
					const raw = await readFile(join(STORE_DIR, entry), "utf8");
					return JSON.parse(raw) as StoredDownloadJob;
				} catch {
					return null;
				}
			}),
	);

	return jobs.filter((job): job is StoredDownloadJob => Boolean(job));
}

export async function writeDownloadJob(job: StoredDownloadJob) {
	await ensureStore();
	await writeFile(filePathForJob(job.id), JSON.stringify(job, null, 2), "utf8");
	return job;
}

export async function updateDownloadJob(
	id: string,
	updater: (job: StoredDownloadJob) => StoredDownloadJob,
) {
	await ensureStore();
	const filePath = filePathForJob(id);
	try {
		await access(filePath);
	} catch {
		return null;
	}

	const raw = await readFile(filePath, "utf8");
	const nextJob = updater(JSON.parse(raw) as StoredDownloadJob);
	await writeFile(filePath, JSON.stringify(nextJob, null, 2), "utf8");
	return nextJob;
}

export function sortDownloadJobs<T extends DownloadJob>(jobs: T[]) {
	return [...jobs].sort((left, right) => right.updatedAt - left.updatedAt);
}
