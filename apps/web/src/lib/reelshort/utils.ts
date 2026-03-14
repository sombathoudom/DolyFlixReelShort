import type {
	ReelShortEpisode,
	ReelShortSettings,
} from "@/lib/reelshort/types";

export const DEFAULT_ACCENT = "#ff6b4a";

export const DEFAULT_SETTINGS: ReelShortSettings = {
	theme: "system",
	accentColor: DEFAULT_ACCENT,
	saveDirectory: "",
	autoDownload: false,
	concurrentDownloads: 2,
};

export function parseReelShortEpisodeUrl(input: string) {
	try {
		const url = new URL(input.trim());
		if (!url.hostname.includes("reelshort.com")) {
			return null;
		}

		const parts = url.pathname.split("/").filter(Boolean);
		const slug = parts.at(-1);
		if (!slug) {
			return null;
		}

		const segments = slug.split("-");
		const chapterId = segments.pop();
		const bookId = segments.pop();

		if (!bookId || !chapterId) {
			return null;
		}

		return { bookId, chapterId };
	} catch {
		return null;
	}
}

export function formatEpisodeBadge(count: number) {
	if (count <= 0) {
		return "No episodes";
	}

	return `${count} episode${count === 1 ? "" : "s"}`;
}

export function formatProgress(progress: number) {
	return `${Math.max(0, Math.min(100, Math.round(progress)))}%`;
}

export function formatDuration(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return "00:00";
	}

	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hrs > 0) {
		return [hrs, mins, secs]
			.map((part) => String(part).padStart(2, "0"))
			.join(":");
	}

	return [mins, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function getNextEpisode(
	episodes: ReelShortEpisode[],
	chapterId: string,
) {
	const index = episodes.findIndex(
		(episode) => episode.chapterId === chapterId,
	);
	if (index === -1) {
		return undefined;
	}

	return episodes[index + 1];
}

export function sanitizeFileName(value: string) {
	const withoutUnsafe = value.replace(/[<>:"/\\|?*]/g, "");
	const withoutControls = Array.from(withoutUnsafe)
		.filter((character) => character.charCodeAt(0) >= 32)
		.join("");

	return withoutControls.trim() || "episode";
}
