export type ReelShortSearchResult = {
	bookId: string;
	chapterId?: string;
	title: string;
	description: string;
	tags: string[];
	thumbnail: string;
	poster: string;
	episodeCount: number;
};

export type ReelShortEpisode = {
	bookId: string;
	chapterId: string;
	title: string;
	index: number;
	thumbnail: string;
	durationLabel?: string;
	isLocked: boolean;
};

export type ReelShortMovie = {
	bookId: string;
	title: string;
	description: string;
	tags: string[];
	thumbnail: string;
	poster: string;
	episodes: ReelShortEpisode[];
};

export type ReelShortPlayback = {
	bookId: string;
	chapterId: string;
	title: string;
	description: string;
	thumbnail: string;
	poster: string;
	videoUrl: string;
	isHls: boolean;
	nextChapterId?: string;
};

export type DownloadStatus =
	| "queued"
	| "resolving"
	| "downloading"
	| "remuxing"
	| "completed"
	| "stopped"
	| "failed";

export type DownloadJob = {
	id: string;
	bookId: string;
	chapterId: string;
	movieTitle: string;
	episodeTitle: string;
	status: DownloadStatus;
	progress: number;
	outputPath?: string;
	error?: string;
	createdAt: number;
	updatedAt: number;
};

export type ReelShortSettings = {
	theme: "light" | "dark" | "system";
	accentColor: string;
	saveDirectory: string;
	autoDownload: boolean;
	concurrentDownloads: number;
};

export type WatchProgress = {
	bookId: string;
	chapterId: string;
	positionSeconds: number;
	durationSeconds: number;
	updatedAt: number;
};
