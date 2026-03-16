"use client";

import { Button } from "@next-js-and-electron/ui/components/button";
import { Card, CardContent } from "@next-js-and-electron/ui/components/card";
import { cn } from "@next-js-and-electron/ui/lib/utils";
import {
	ArrowRight,
	Bell,
	CheckCircle2,
	ChevronDown,
	Compass,
	Download,
	Film,
	FolderDown,
	ListVideo,
	LoaderCircle,
	Moon,
	PlayCircle,
	Radio,
	Search,
	Settings2,
	Sparkles,
	Sun,
	Users2,
	XCircle,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ReelShortPlayer } from "@/components/reelshort-player";
import type {
	DownloadJob,
	ReelShortEpisode,
	ReelShortMovie,
	ReelShortPlayback,
	ReelShortSearchResult,
	ReelShortSettings,
	WatchProgress,
} from "@/lib/reelshort/types";
import {
	DEFAULT_ACCENT,
	DEFAULT_SETTINGS,
	formatEpisodeBadge,
	formatProgress,
	getNextEpisode,
	parseReelShortEpisodeUrl,
} from "@/lib/reelshort/utils";

type View = "discover" | "downloads" | "settings";

const SETTINGS_STORAGE_KEY = "reelshort-settings";
const WATCH_PROGRESS_STORAGE_KEY = "reelshort-progress";
const DEFAULT_FEED_QUERY = "love";
const accentPresets = ["#ff6b4a", "#ff3d6e", "#f59e0b", "#34d399", "#38bdf8"];

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
	const response = await fetch(input, init);
	const data = (await response.json()) as T & { error?: string };

	if (!response.ok) {
		throw new Error(data.error || "Request failed.");
	}

	return data;
}

function loadStoredSettings() {
	if (typeof window === "undefined") {
		return DEFAULT_SETTINGS;
	}

	try {
		const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
		return raw
			? ({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as ReelShortSettings)
			: DEFAULT_SETTINGS;
	} catch {
		return DEFAULT_SETTINGS;
	}
}

function loadWatchProgress() {
	if (typeof window === "undefined") {
		return {} as Record<string, WatchProgress>;
	}

	try {
		const raw = window.localStorage.getItem(WATCH_PROGRESS_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, WatchProgress>) : {};
	} catch {
		return {} as Record<string, WatchProgress>;
	}
}

export function ReelShortApp() {
	const { resolvedTheme, setTheme } = useTheme();
	const [view, setView] = useState<View>("discover");
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<ReelShortSearchResult[]>([]);
	const [selectedMovie, setSelectedMovie] = useState<ReelShortMovie | null>(
		null,
	);
	const [activePlayback, setActivePlayback] =
		useState<ReelShortPlayback | null>(null);
	const [isPlayerOpen, setIsPlayerOpen] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [isLoadingMovie, setIsLoadingMovie] = useState(false);
	const [downloads, setDownloads] = useState<DownloadJob[]>([]);
	const [settings, setSettings] = useState<ReelShortSettings>(DEFAULT_SETTINGS);
	const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [watchProgress, setWatchProgress] = useState<
		Record<string, WatchProgress>
	>({});
	const [loadingEpisodeId, setLoadingEpisodeId] = useState<string | null>(null);
	const [playerInitialPosition, setPlayerInitialPosition] = useState(0);
	const [isBootstrapping, setIsBootstrapping] = useState(true);
	const [isMounted, setIsMounted] = useState(false);
	const isLightTheme = isMounted && resolvedTheme === "light";
	const shellPanelClass = isLightTheme
		? "border-slate-300 bg-[#17181e] text-white"
		: "border-white/8 bg-[#17181e] text-white";
	const sectionPanelClass = "bg-[#111216] text-white";
	const subtleTextClass = isLightTheme ? "text-slate-500" : "text-white/35";
	const secondaryTextClass = isLightTheme ? "text-slate-600" : "text-white/58";
	const pillClass = isLightTheme
		? "border-slate-200 bg-white text-slate-700"
		: "border-white/10 bg-white/[0.03] text-white/75";

	const loadDefaultFeed = async () => {
		const response = await requestJson<{ results: ReelShortSearchResult[] }>(
			"/api/reelshort/search",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					query: DEFAULT_FEED_QUERY,
					page: 1,
					pageSize: 10,
				}),
			},
		);

		setResults(response.results);
	};

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		const storedSettings = loadStoredSettings();
		const storedProgress = loadWatchProgress();

		setSettings(storedSettings);
		setWatchProgress(storedProgress);
		setTheme(storedSettings.theme);

		void requestJson<{ defaultSaveDirectory: string }>("/api/reelshort/config")
			.then((data) => {
				setSettings((current) => {
					if (current.saveDirectory) {
						return current;
					}

					const next = { ...current, saveDirectory: data.defaultSaveDirectory };
					window.localStorage.setItem(
						SETTINGS_STORAGE_KEY,
						JSON.stringify(next),
					);
					return next;
				});
			})
			.catch(() => {
				toast.error("Unable to load the default save directory.");
			});
	}, []);

	useEffect(() => {
		let cancelled = false;

		const bootstrapDefaultFeed = async () => {
			try {
				await loadDefaultFeed();
				if (!cancelled) {
					setResults((current) => current);
				}
			} catch {
				if (!cancelled) {
					setResults([]);
				}
			} finally {
				if (!cancelled) {
					setIsBootstrapping(false);
				}
			}
		};

		void bootstrapDefaultFeed();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
		setTheme(settings.theme);
	}, [setTheme, settings]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		window.localStorage.setItem(
			WATCH_PROGRESS_STORAGE_KEY,
			JSON.stringify(watchProgress),
		);
	}, [watchProgress]);

	const hasActiveDownloads = useMemo(
		() =>
			downloads.some((job) =>
				["queued", "resolving", "downloading", "remuxing"].includes(job.status),
			),
		[downloads],
	);

	useEffect(() => {
		let cancelled = false;
		const shouldPoll = view === "downloads" && hasActiveDownloads;

		const poll = async () => {
			try {
				const response = await requestJson<{ jobs: DownloadJob[] }>(
					"/api/reelshort/downloads",
				);
				if (!cancelled) {
					setDownloads(response.jobs);
				}
			} catch {
				if (!cancelled) {
					setDownloads([]);
				}
			}
		};

		if (!shouldPoll) {
			return () => {
				cancelled = true;
			};
		}

		void poll();
		const timer = window.setInterval(poll, 2500);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [hasActiveDownloads, view]);

	const activeEpisode = useMemo(() => {
		if (!selectedMovie || !activePlayback) {
			return undefined;
		}

		return selectedMovie.episodes.find(
			(episode) => episode.chapterId === activePlayback.chapterId,
		);
	}, [activePlayback, selectedMovie]);

	const nextEpisode = useMemo(() => {
		if (!selectedMovie || !activeEpisode) {
			return undefined;
		}

		return getNextEpisode(selectedMovie.episodes, activeEpisode.chapterId);
	}, [activeEpisode, selectedMovie]);

	const previousEpisode = useMemo(() => {
		if (!selectedMovie || !activeEpisode) {
			return undefined;
		}

		const index = selectedMovie.episodes.findIndex(
			(episode) => episode.chapterId === activeEpisode.chapterId,
		);
		return index > 0 ? selectedMovie.episodes[index - 1] : undefined;
	}, [activeEpisode, selectedMovie]);

	const selectedEpisodes = useMemo(() => {
		if (!selectedMovie) {
			return [] as ReelShortEpisode[];
		}

		const ids = new Set(selectedEpisodeIds);
		return selectedMovie.episodes.filter((episode) =>
			ids.has(episode.chapterId),
		);
	}, [selectedEpisodeIds, selectedMovie]);

	const activeProgress = activePlayback
		? (watchProgress[`${activePlayback.bookId}:${activePlayback.chapterId}`]
				?.positionSeconds ?? 0)
		: 0;
	const activeDuration = activePlayback
		? (watchProgress[`${activePlayback.bookId}:${activePlayback.chapterId}`]
				?.durationSeconds ?? 0)
		: 0;

	const normalizedActiveProgress =
		activeProgress > 5 &&
		(!activeDuration || activeProgress < activeDuration - 5)
			? activeProgress
			: 0;

	const handleSettingsChange = <T extends keyof ReelShortSettings>(
		key: T,
		value: ReelShortSettings[T],
	) => {
		setSettings((current) => ({ ...current, [key]: value }));
	};

	const queueEpisodes = async (episodes: ReelShortEpisode[]) => {
		if (episodes.length === 0) {
			toast.error("Select at least one episode first.");
			return;
		}

		try {
			const response = await requestJson<{ jobs: DownloadJob[] }>(
				"/api/reelshort/downloads",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						action: "queue",
						episodes: episodes.map((episode) => ({
							bookId: episode.bookId,
							chapterId: episode.chapterId,
						})),
						saveDirectory: settings.saveDirectory,
						concurrentDownloads: settings.concurrentDownloads,
					}),
				},
			);

			setDownloads((current) => {
				const next = new Map(current.map((job) => [job.id, job]));
				for (const job of response.jobs) {
					next.set(job.id, job);
				}
				return Array.from(next.values()).sort(
					(left, right) => right.updatedAt - left.updatedAt,
				);
			});

			toast.success(
				`${episodes.length} episode${episodes.length === 1 ? "" : "s"} added to downloads.`,
			);
			setView("downloads");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to queue downloads.",
			);
		}
	};

	const stopDownload = async (id: string) => {
		try {
			const response = await requestJson<{ job: DownloadJob | null }>(
				"/api/reelshort/downloads",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ action: "stop", id }),
				},
			);
			if (response.job) {
				setDownloads((current) =>
					current.map((job) =>
						job.id === response.job?.id ? response.job : job,
					),
				);
			}
			toast.success("Download stopped.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to stop download.",
			);
		}
	};

	const fetchMovie = async (bookId: string, chapterId?: string) => {
		setIsLoadingMovie(true);

		try {
			const response = await requestJson<{
				movie: ReelShortMovie;
				playback: ReelShortPlayback | null;
			}>("/api/reelshort/movie", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ bookId, chapterId }),
			});

			setSelectedMovie(response.movie);
			setSelectedEpisodeIds([]);
			setActivePlayback(response.playback);
			setResults([]);
			setView("discover");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Unable to load the selected title.",
			);
		} finally {
			setIsLoadingMovie(false);
		}
	};

	const openEpisode = async (
		episode: ReelShortEpisode,
		options?: { resume?: boolean },
	) => {
		setLoadingEpisodeId(episode.chapterId);

		try {
			const response = await requestJson<{ playback: ReelShortPlayback }>(
				"/api/reelshort/playback",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						bookId: episode.bookId,
						chapterId: episode.chapterId,
					}),
				},
			);

			setActivePlayback(response.playback);
			setPlayerInitialPosition(
				options?.resume
					? (watchProgress[`${episode.bookId}:${episode.chapterId}`]
							?.positionSeconds ?? 0)
					: 0,
			);
			setIsPlayerOpen(true);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Unable to start playback.",
			);
		} finally {
			setLoadingEpisodeId(null);
		}
	};

	const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const input = query.trim();
		if (!input) {
			return;
		}

		const parsed = parseReelShortEpisodeUrl(input);
		if (parsed) {
			await fetchMovie(parsed.bookId, parsed.chapterId);
			return;
		}

		setIsSearching(true);
		try {
			const response = await requestJson<{ results: ReelShortSearchResult[] }>(
				"/api/reelshort/search",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ query: input, page: 1, pageSize: 10 }),
				},
			);
			setResults(response.results);
			if (response.results.length === 0) {
				toast.message("No titles matched that search.");
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Search failed.");
		} finally {
			setIsSearching(false);
		}
	};

	const handlePlayerProgress = (
		positionSeconds: number,
		durationSeconds: number,
	) => {
		if (!activePlayback) {
			return;
		}

		const key = `${activePlayback.bookId}:${activePlayback.chapterId}`;
		setWatchProgress((current) => ({
			...current,
			[key]: {
				bookId: activePlayback.bookId,
				chapterId: activePlayback.chapterId,
				positionSeconds,
				durationSeconds,
				updatedAt: Date.now(),
			},
		}));
	};

	const markEpisodeComplete = (episode?: ReelShortEpisode) => {
		if (!episode) {
			return;
		}

		const key = `${episode.bookId}:${episode.chapterId}`;
		setWatchProgress((current) => ({
			...current,
			[key]: {
				bookId: episode.bookId,
				chapterId: episode.chapterId,
				positionSeconds: 0,
				durationSeconds: 0,
				updatedAt: Date.now(),
			},
		}));
	};

	const handlePlayerEnd = () => {
		markEpisodeComplete(activeEpisode);
		if (nextEpisode) {
			void openEpisode(nextEpisode, { resume: false });
			return;
		}

		setIsPlayerOpen(false);
		toast.success("That was the final episode in this run.");
	};

	const handlePlayStart = () => {
		if (!settings.autoDownload || !activeEpisode) {
			return;
		}

		void queueEpisodes([activeEpisode]);
	};

	const handleHeroWatch = async () => {
		if (selectedMovie?.episodes[0]) {
			await openEpisode(selectedMovie.episodes[0], { resume: false });
			return;
		}

		if (results[0]) {
			await fetchMovie(results[0].bookId, results[0].chapterId);
		}
	};

	const handleResumePlayback = () => {
		setPlayerInitialPosition(normalizedActiveProgress || 0);
		setIsPlayerOpen(true);
	};

	const handleBack = () => {
		if (selectedMovie) {
			setSelectedMovie(null);
			setActivePlayback(null);
			setSelectedEpisodeIds([]);
			setView("discover");
			return;
		}

		if (view !== "discover") {
			setView("discover");
			return;
		}

		setQuery("");
		setResults([]);
		setIsBootstrapping(true);
		void loadDefaultFeed()
			.catch(() => setResults([]))
			.finally(() => setIsBootstrapping(false));
	};

	const sidebarItems = [
		{ id: "discover", label: "Browse", icon: Compass },
		{ id: "downloads", label: "Downloads", icon: FolderDown },
		{ id: "settings", label: "Settings", icon: Settings2 },
	] as const;

	const featuredMovie = selectedMovie ?? results[0] ?? null;
	const featuredEpisodes = selectedMovie?.episodes.slice(0, 4) ?? [];
	const featuredCount = selectedMovie
		? selectedMovie.episodes.length
		: (results[0]?.episodeCount ?? 0);
	const downloadSummary = [
		{
			label: "Completed",
			value: downloads.filter((job) => job.status === "completed").length,
			icon: CheckCircle2,
		},
		{
			label: "Running",
			value: downloads.filter((job) =>
				["queued", "resolving", "downloading", "remuxing"].includes(job.status),
			).length,
			icon: LoaderCircle,
		},
		{
			label: "Stopped / Failed",
			value: downloads.filter((job) =>
				["stopped", "failed"].includes(job.status),
			).length,
			icon: XCircle,
		},
	];

	return (
		<div
			className={
				isLightTheme
					? "min-h-svh bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.78),transparent_18%),linear-gradient(180deg,#eef2f7_0%,#dde5ef_14%,#f8fafc_14%,#eef3f8_100%)] px-3 py-3 text-slate-900 sm:px-6 sm:py-6"
					: "min-h-svh bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.24),transparent_18%),linear-gradient(180deg,#d8dee7_0%,#cbd4de_14%,#0b0b10_14%,#09090d_100%)] px-3 py-3 text-foreground sm:px-6 sm:py-6"
			}
			style={{
				["--reel-accent" as string]: settings.accentColor,
				["--reel-accent-soft" as string]: `${settings.accentColor}22`,
			}}
		>
			<div className="mx-auto grid min-h-[calc(100svh-1.5rem)] max-w-[1260px] animate-fade-up gap-px overflow-hidden rounded-[34px] border border-white/10 bg-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.28)] lg:grid-cols-[220px_minmax(0,1fr)]">
				<aside
					className={
						isLightTheme
							? "flex flex-col bg-[#f7f9fc] px-4 py-5 text-slate-900 sm:px-5"
							: "flex flex-col bg-[#101014] px-4 py-5 text-white sm:px-5"
					}
				>
					<div
						className={
							isLightTheme
								? "flex items-center gap-3 border-slate-200 border-b pb-6"
								: "flex items-center gap-3 border-white/6 border-b pb-6"
						}
					>
						<div className="flex size-9 items-center justify-center rounded-full bg-[color:var(--reel-accent)] font-semibold text-white text-xs">
							R
						</div>
						<div>
							<p className="font-semibold text-sm">ReelShort</p>
							<p
								className={
									isLightTheme
										? "text-[11px] text-slate-500 uppercase tracking-[0.28em]"
										: "text-[11px] text-white/40 uppercase tracking-[0.28em]"
								}
							>
								Movie deck
							</p>
						</div>
					</div>

					<div className="pt-6">
						<p
							className={
								isLightTheme
									? "text-[11px] text-slate-500 uppercase tracking-[0.3em]"
									: "text-[11px] text-white/36 uppercase tracking-[0.3em]"
							}
						>
							News Feed
						</p>
						<nav className="mt-4 grid gap-2">
							{sidebarItems.map((item) => {
								const Icon = item.icon;
								const active = item.id === view;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => setView(item.id as View)}
										className={`flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm transition ${active ? "bg-[color:var(--reel-accent)] text-white" : isLightTheme ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900" : "text-white/72 hover:bg-white/[0.04] hover:text-white"}`}
									>
										<Icon className="size-4" />
										{item.label}
									</button>
								);
							})}
						</nav>
					</div>

					<div
						className={
							isLightTheme
								? "mt-8 rounded-[24px] border border-slate-200 bg-white p-4"
								: "mt-8 rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
						}
					>
						<p
							className={
								isLightTheme
									? "text-[11px] text-slate-500 uppercase tracking-[0.3em]"
									: "text-[11px] text-white/36 uppercase tracking-[0.3em]"
							}
						>
							Accent
						</p>
						<div className="mt-4 flex flex-wrap gap-2">
							{accentPresets.map((accent) => (
								<button
									key={accent}
									type="button"
									onClick={() => handleSettingsChange("accentColor", accent)}
									className={`size-8 rounded-full border ${settings.accentColor === accent ? "border-white" : "border-transparent"}`}
									style={{ backgroundColor: accent }}
								/>
							))}
						</div>
					</div>

					<div
						className={
							isLightTheme
								? "mt-auto rounded-[24px] border border-slate-200 bg-white p-4"
								: "mt-auto rounded-[24px] border border-white/8 bg-white/[0.03] p-4"
						}
					>
						<p
							className={
								isLightTheme
									? "text-[11px] text-slate-500 uppercase tracking-[0.3em]"
									: "text-[11px] text-white/36 uppercase tracking-[0.3em]"
							}
						>
							Session
						</p>
						<div
							className={
								isLightTheme
									? "mt-4 space-y-3 text-slate-600 text-sm"
									: "mt-4 space-y-3 text-sm text-white/70"
							}
						>
							<div className="flex items-center justify-between">
								<span>Theme</span>
								<span className="capitalize">{settings.theme}</span>
							</div>
							<div className="flex items-center justify-between">
								<span>Queued</span>
								<span>{downloads.length}</span>
							</div>
							<div className="flex items-center justify-between">
								<span>Resume</span>
								<span>{activePlayback ? "Ready" : "Idle"}</span>
							</div>
						</div>
					</div>
				</aside>

				<main
					className={
						isLightTheme
							? "grid min-h-0 bg-[#fbfcfe] text-slate-900"
							: "grid min-h-0 bg-[#121216] text-white"
					}
				>
					<header
						className={
							isLightTheme
								? "flex flex-wrap items-center justify-between gap-4 border-slate-200 border-b px-5 py-5 sm:px-7"
								: "flex flex-wrap items-center justify-between gap-4 border-white/6 border-b px-5 py-5 sm:px-7"
						}
					>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={handleBack}
								className={
									isLightTheme
										? "flex size-10 items-center justify-center rounded-[14px] border border-slate-300 bg-white text-slate-700"
										: "flex size-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.03] text-white/70"
								}
							>
								<ArrowRight className="size-4 rotate-180" />
							</button>
							<div>
								<p
									className={
										isLightTheme
											? "text-[11px] text-slate-500 uppercase tracking-[0.32em]"
											: "text-[11px] text-white/35 uppercase tracking-[0.32em]"
									}
								>
									Discover
								</p>
								<p
									className={
										isLightTheme
											? "mt-1 font-medium text-slate-700 text-sm"
											: "mt-1 font-medium text-sm text-white/78"
									}
								>
									A streaming layout inspired by your reference board
								</p>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<form
								onSubmit={handleSearch}
								className={
									isLightTheme
										? "flex h-12 min-w-[260px] items-center gap-3 rounded-full border border-slate-300 bg-white px-4 sm:min-w-[360px]"
										: "flex h-12 min-w-[260px] items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 sm:min-w-[360px]"
								}
							>
								<Search
									className={
										isLightTheme
											? "size-4 text-slate-400"
											: "size-4 text-white/40"
									}
								/>
								<input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search everything or paste a ReelShort URL"
									className={
										isLightTheme
											? "w-full bg-transparent text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none"
											: "w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
									}
								/>
								<button
									type="submit"
									className="rounded-full bg-[color:var(--reel-accent)] px-4 py-1.5 font-semibold text-white text-xs"
								>
									{isSearching || isLoadingMovie ? "Loading" : "Search"}
								</button>
							</form>
							<button
								type="button"
								className={
									isLightTheme
										? "flex size-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
										: "flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70"
								}
							>
								<Bell className="size-4" />
							</button>
							<div className="flex size-10 items-center justify-center rounded-full bg-white/90 font-semibold text-black text-sm">
								RS
							</div>
						</div>
					</header>

					<section className="grid min-h-0 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_290px]">
						<div className="grid gap-4">
							<section
								className={cn(
									"animate-fade-up overflow-hidden rounded-[28px]",
									isLightTheme
										? "bg-white text-slate-900 shadow-[0_20px_40px_rgba(15,23,42,0.08)]"
										: "bg-[#0f1016] text-white",
								)}
							>
								<div className="grid min-h-[320px] lg:grid-cols-[0.92fr_1.08fr]">
									<div className="flex flex-col justify-between px-6 py-6 sm:px-8">
										<div>
											<div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--reel-accent)]/14 px-3 py-1 text-[11px] text-[color:var(--reel-accent)] uppercase tracking-[0.26em]">
												<Radio className="size-3" /> Live
											</div>
											<h2 className="mt-6 font-[family-name:var(--font-reel-display)] text-5xl leading-none sm:text-6xl">
												{featuredMovie?.title || "ReelShort"}
											</h2>
											<p
												className={cn(
													"mt-4 line-clamp-3 max-w-md text-sm leading-7",
													isLightTheme ? "text-slate-700" : "text-white/62",
												)}
											>
												{featuredMovie?.description ||
													"Search, watch, and manage serialized short dramas inside a cleaner desktop deck."}
											</p>
											<div
												className={cn(
													"mt-5 flex flex-wrap items-center gap-4 text-sm",
													isLightTheme ? "text-slate-700" : "text-white/68",
												)}
											>
												<span className="inline-flex items-center gap-2">
													<Film className="size-4 text-[color:var(--reel-accent)]" />{" "}
													{featuredCount
														? formatEpisodeBadge(featuredCount)
														: "Stories"}
												</span>
												<span className="inline-flex items-center gap-2">
													<Users2 className="size-4 text-[color:var(--reel-accent)]" />{" "}
													Movie fans
												</span>
											</div>
										</div>

										<div className="flex flex-wrap items-center gap-3">
											<Button
												className="rounded-[18px] bg-[color:var(--reel-accent)] px-8 text-white hover:bg-[color:var(--reel-accent)]/90"
												onClick={() => void handleHeroWatch()}
											>
												<PlayCircle /> Watch
											</Button>
											<Button
												variant="outline"
												className="rounded-[18px] border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
												onClick={() => setView("downloads")}
											>
												<ListVideo /> Queue
											</Button>
										</div>
									</div>

									<div
										className={cn(
											"relative min-h-[260px] overflow-hidden border-t lg:border-t-0 lg:border-l",
											isLightTheme ? "border-slate-200" : "border-white/6",
										)}
									>
										{featuredMovie ? (
											<Image
												src={featuredMovie.poster || featuredMovie.thumbnail}
												alt={featuredMovie.title}
												fill
												unoptimized
												className="object-cover"
											/>
										) : (
											<div className="h-full w-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.22),transparent_18%),linear-gradient(135deg,#2a3650,#111318_70%)]" />
										)}
										<div
											className={cn(
												"absolute inset-0",
												isLightTheme
													? "bg-[linear-gradient(90deg,rgba(255,255,255,0.96)_8%,rgba(255,255,255,0.38)_45%,rgba(255,255,255,0.06)_100%)]"
													: "bg-[linear-gradient(90deg,#0f1016_8%,rgba(15,16,22,0.45)_45%,rgba(15,16,22,0.06)_100%)]",
											)}
										/>
										<div className="absolute inset-x-0 bottom-0 flex items-center gap-3 overflow-auto px-5 pb-5">
											{featuredEpisodes.map((episode) => (
												<button
													key={episode.chapterId}
													type="button"
													onClick={() =>
														void openEpisode(episode, { resume: false })
													}
													className={cn(
														"min-w-32 rounded-[18px] px-4 py-3 text-left backdrop-blur transition hover:border-[color:var(--reel-accent)]/40",
														isLightTheme
															? "border border-white/80 bg-white/80 text-slate-900 shadow-sm"
															: "border border-white/10 bg-black/45 text-white",
													)}
												>
													<p className="text-[11px] text-white/38 uppercase tracking-[0.24em]">
														Episode
													</p>
													<p className="mt-1 font-medium text-sm text-white">
														{episode.index}
													</p>
												</button>
											))}
										</div>
									</div>
								</div>
							</section>

							{view === "discover" ? (
								isBootstrapping ? (
									<section
										className={cn(
											"grid gap-4 rounded-[28px] p-4 sm:p-5",
											sectionPanelClass,
										)}
									>
										<div className="flex items-center justify-between gap-4">
											<div className="space-y-3">
												<div className="skeleton h-3 w-28 rounded-full" />
												<div className="skeleton h-10 w-56 rounded-full" />
											</div>
											<div className="skeleton h-10 w-28 rounded-full" />
										</div>
										<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
											{Array.from({ length: 8 }).map((_, index) => (
												<div
													key={`skeleton-${index}`}
													className="rounded-[24px] border border-white/8 bg-[#17181e] p-4"
												>
													<div className="flex items-start justify-between gap-3">
														<div className="w-full space-y-3">
															<div className="skeleton h-3 w-20 rounded-full" />
															<div className="skeleton h-7 w-28 rounded-full" />
														</div>
														<div className="skeleton size-5 rounded-md" />
													</div>
													<div className="mt-4 space-y-2">
														<div className="skeleton h-3 w-full rounded-full" />
														<div className="skeleton h-3 w-2/3 rounded-full" />
													</div>
													<div className="mt-4 flex gap-2">
														<div className="skeleton h-10 flex-1 rounded-full" />
														<div className="skeleton h-10 flex-1 rounded-full" />
													</div>
												</div>
											))}
										</div>
									</section>
								) : selectedMovie ? (
									<section
										className={cn(
											"grid gap-4 rounded-[28px] p-4 sm:p-5",
											sectionPanelClass,
										)}
									>
										<div className="flex flex-wrap items-center justify-between gap-4">
											<div>
												<p className="text-[11px] text-white/35 uppercase tracking-[0.32em]">
													Continue watching
												</p>
												<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
													{selectedMovie.title}
												</h3>
											</div>
											<div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/75">
												Popular <ChevronDown className="size-4" />
											</div>
										</div>

										<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
											{selectedMovie.episodes.map((episode) => {
												const progressKey = `${episode.bookId}:${episode.chapterId}`;
												const resume = watchProgress[progressKey];
												const isSelected = selectedEpisodeIds.includes(
													episode.chapterId,
												);
												const isLoadingEpisode =
													loadingEpisodeId === episode.chapterId;

												return (
													<div
														key={episode.chapterId}
														className={cn(
															"rounded-[24px] border p-4 transition",
															shellPanelClass,
															isLightTheme
																? "hover:border-slate-300 hover:bg-slate-50"
																: "hover:border-white/14 hover:bg-[#1b1c23]",
														)}
													>
														<div className="flex items-start justify-between gap-3">
															<div>
																<p
																	className={cn(
																		"text-[11px] uppercase tracking-[0.24em]",
																		isLightTheme
																			? "text-slate-500"
																			: "text-white/35",
																	)}
																>
																	Episode {episode.index}
																</p>
																<h4
																	className={cn(
																		"mt-2 line-clamp-2 font-semibold",
																		isLightTheme
																			? "text-slate-900"
																			: "text-white",
																	)}
																>
																	{episode.title}
																</h4>
															</div>
															<label className="relative mt-0.5 flex cursor-pointer items-center justify-center">
																<input
																	type="checkbox"
																	checked={isSelected}
																	onChange={(event) =>
																		setSelectedEpisodeIds((current) =>
																			event.target.checked
																				? [...current, episode.chapterId]
																				: current.filter(
																						(id) => id !== episode.chapterId,
																					),
																		)
																	}
																	className="peer sr-only"
																/>
																<span className="flex size-5 items-center justify-center rounded-md border border-white/20 bg-white/[0.02] text-transparent transition peer-checked:border-[color:var(--reel-accent)] peer-checked:bg-[color:var(--reel-accent)] peer-checked:text-white">
																	<span className="size-2 rounded-sm bg-current" />
																</span>
															</label>
														</div>
														<p
															className={cn(
																"mt-3 text-xs",
																isLightTheme
																	? "text-slate-600"
																	: "text-white/45",
															)}
														>
															{resume?.positionSeconds
																? `Resume from ${Math.floor(resume.positionSeconds)}s`
																: "Ready for playback and download"}
														</p>
														<div className="mt-4 flex flex-col gap-2 sm:flex-row">
															<Button
																variant="outline"
																className={cn(
																	"w-full min-w-0 rounded-full px-3 sm:flex-1",
																	isLightTheme
																		? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
																		: "border-white/10 bg-transparent text-white hover:bg-white/[0.05]",
																)}
																onClick={() => void queueEpisodes([episode])}
															>
																<Download /> Save
															</Button>
															<Button
																className="w-full min-w-0 rounded-full bg-[color:var(--reel-accent)] px-3 text-white hover:bg-[color:var(--reel-accent)]/90 sm:flex-1"
																onClick={() =>
																	void openEpisode(episode, { resume: false })
																}
															>
																{isLoadingEpisode ? (
																	<LoaderCircle className="animate-spin" />
																) : (
																	<PlayCircle />
																)}{" "}
																Play
															</Button>
														</div>
													</div>
												);
											})}
										</div>

										<div className="flex flex-wrap gap-3">
											<Button
												variant="outline"
												className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
												onClick={() =>
													setSelectedEpisodeIds(
														selectedMovie.episodes.map(
															(episode) => episode.chapterId,
														),
													)
												}
											>
												Select all
											</Button>
											<Button
												variant="outline"
												className="rounded-full border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.08]"
												onClick={() => setSelectedEpisodeIds([])}
											>
												Clear
											</Button>
											<Button
												className="rounded-full bg-[color:var(--reel-accent)] px-5 text-white hover:bg-[color:var(--reel-accent)]/90"
												onClick={() => setShowConfirmModal(true)}
												disabled={selectedEpisodeIds.length === 0}
											>
												<Download /> Download all
											</Button>
										</div>
									</section>
								) : results.length > 0 ? (
									<section className="grid gap-4 rounded-[28px] bg-[#111216] p-4 sm:p-5">
										<div className="flex items-center justify-between gap-4">
											<div>
												<p className="text-[11px] text-white/35 uppercase tracking-[0.32em]">
													Trending
												</p>
												<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
													Search results
												</h3>
											</div>
											<div className="text-sm text-white/45">
												{results.length} stories
											</div>
										</div>

										<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
											{results.map((result) => (
												<button
													key={result.bookId}
													type="button"
													onClick={() =>
														void fetchMovie(result.bookId, result.chapterId)
													}
													className={cn(
														"overflow-hidden rounded-[24px] border text-left transition hover:-translate-y-1",
														shellPanelClass,
														isLightTheme
															? "hover:border-slate-300"
															: "hover:border-white/16",
													)}
												>
													<div className="relative aspect-[4/5] overflow-hidden">
														{result.poster || result.thumbnail ? (
															<Image
																src={result.poster || result.thumbnail}
																alt={result.title}
																fill
																unoptimized
																className="object-cover"
															/>
														) : (
															<div className="h-full w-full bg-[linear-gradient(135deg,#2c3340,#111318)]" />
														)}
														<div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
													</div>
													<div className="space-y-2 p-4">
														<h3 className="font-[family-name:var(--font-reel-display)] text-2xl leading-none">
															{result.title}
														</h3>
														<p className="line-clamp-2 text-sm text-white/58 leading-6">
															{result.description ||
																"Open this title to inspect episodes and playback details."}
														</p>
														<div className="flex flex-wrap gap-2 pt-1">
															{(result.tags.length
																? result.tags
																: [formatEpisodeBadge(result.episodeCount)]
															)
																.slice(0, 2)
																.map((tag, index) => (
																	<span
																		key={`${tag}-${index}`}
																		className="rounded-full border border-white/8 px-3 py-1 text-[11px] text-white/44 uppercase tracking-[0.18em]"
																	>
																		{tag}
																	</span>
																))}
														</div>
													</div>
												</button>
											))}
										</div>
									</section>
								) : (
									<section className="flex min-h-[320px] flex-col items-center justify-center rounded-[28px] bg-[#111216] px-6 py-12 text-center">
										<div className="flex size-16 items-center justify-center rounded-full bg-[color:var(--reel-accent)]/14 text-[color:var(--reel-accent)]">
											<Sparkles className="size-7" />
										</div>
										<h3 className="mt-6 font-[family-name:var(--font-reel-display)] text-4xl">
											Search-first desktop flow
										</h3>
										<p className="mt-4 max-w-xl text-sm text-white/55 leading-7">
											Paste a ReelShort episode URL to resolve a title
											instantly, or type a keyword to browse the encrypted
											catalog in a cleaner streaming deck.
										</p>
									</section>
								)
							) : null}

							{view === "downloads" ? (
								<section
									className={cn(
										"grid gap-4 rounded-[28px] p-4 sm:p-5",
										sectionPanelClass,
									)}
								>
									<div className="flex items-center justify-between gap-4">
										<div>
											<p className="text-[11px] text-white/35 uppercase tracking-[0.32em]">
												Your queue
											</p>
											<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
												Downloads
											</h3>
										</div>
										<div className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/60">
											{downloads.length} jobs
										</div>
									</div>

									{downloads.length === 0 ? (
										<div className="rounded-[24px] border border-white/10 border-dashed bg-white/[0.02] p-8 text-center text-sm text-white/55">
											Queue your first episode to see background progress here.
										</div>
									) : (
										downloads.map((job) => (
											<div
												key={job.id}
												className="rounded-[24px] border border-white/8 bg-[#17181e] p-4"
											>
												<div className="flex flex-wrap items-start justify-between gap-3">
													<div>
														<p className="text-[11px] text-white/35 uppercase tracking-[0.22em]">
															{job.movieTitle}
														</p>
														<h4 className="mt-1 font-semibold text-white">
															{job.episodeTitle}
														</h4>
														<p className="mt-2 text-white/45 text-xs">
															{job.outputPath ||
																settings.saveDirectory ||
																"Waiting for output path"}
														</p>
													</div>
													<div className="flex items-center gap-2">
														<span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/55 uppercase tracking-[0.22em]">
															{job.status}
														</span>
														{[
															"queued",
															"resolving",
															"downloading",
															"remuxing",
														].includes(job.status) ? (
															<Button
																variant="outline"
																className="rounded-full border-white/10 bg-transparent text-white hover:bg-white/[0.05]"
																onClick={() => void stopDownload(job.id)}
															>
																<XCircle /> Stop
															</Button>
														) : null}
													</div>
												</div>
												<div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
													<div
														className="h-full rounded-full bg-[color:var(--reel-accent)] transition-all"
														style={{ width: `${job.progress}%` }}
													/>
												</div>
												<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-white/55 text-xs">
													<span>{formatProgress(job.progress)}</span>
													<span>
														{job.error ||
															(job.status === "completed"
																? "Saved and ready for offline playback."
																: "Running in the background.")}
													</span>
												</div>
											</div>
										))
									)}
								</section>
							) : null}

							{view === "settings" ? (
								<section
									className={cn(
										"grid gap-4 rounded-[28px] p-4 sm:p-5 lg:grid-cols-2",
										sectionPanelClass,
									)}
								>
									<Card
										className={cn(
											"rounded-[24px] py-0 shadow-none",
											shellPanelClass,
										)}
									>
										<CardContent className="grid gap-5 p-5">
											<div>
												<p
													className={cn(
														"text-[11px] uppercase tracking-[0.3em]",
														subtleTextClass,
													)}
												>
													Theme
												</p>
												<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
													Appearance
												</h3>
											</div>
											<div className="flex flex-wrap gap-2">
												{[
													{ value: "light", label: "Light", icon: Sun },
													{ value: "dark", label: "Dark", icon: Moon },
													{ value: "system", label: "System", icon: Sparkles },
												].map((option) => {
													const Icon = option.icon;
													const active = settings.theme === option.value;
													return (
														<button
															key={option.value}
															type="button"
															onClick={() =>
																handleSettingsChange(
																	"theme",
																	option.value as ReelShortSettings["theme"],
																)
															}
															className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${active ? "bg-[color:var(--reel-accent)] text-white" : isLightTheme ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"}`}
														>
															<Icon className="size-4" />
															{option.label}
														</button>
													);
												})}
											</div>
											<div>
												<p
													className={cn(
														"text-[11px] uppercase tracking-[0.3em]",
														subtleTextClass,
													)}
												>
													Accent color
												</p>
												<input
													value={settings.accentColor}
													onChange={(event) =>
														handleSettingsChange(
															"accentColor",
															event.target.value || DEFAULT_ACCENT,
														)
													}
													className={cn(
														"mt-3 h-12 w-full rounded-[18px] border px-4 text-sm outline-none",
														isLightTheme
															? "border-slate-300 bg-white text-slate-900"
															: "border-white/10 bg-white/[0.03] text-white",
													)}
												/>
											</div>
										</CardContent>
									</Card>

									<Card
										className={cn(
											"rounded-[24px] py-0 shadow-none",
											shellPanelClass,
										)}
									>
										<CardContent className="grid gap-5 p-5">
											<div>
												<p
													className={cn(
														"text-[11px] uppercase tracking-[0.3em]",
														subtleTextClass,
													)}
												>
													Downloads
												</p>
												<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
													Storage
												</h3>
											</div>
											<label
												className={cn("grid gap-2 text-sm", secondaryTextClass)}
											>
												Save directory
												<input
													value={settings.saveDirectory}
													onChange={(event) =>
														handleSettingsChange(
															"saveDirectory",
															event.target.value,
														)
													}
													className={cn(
														"h-12 rounded-[18px] border px-4 outline-none",
														isLightTheme
															? "border-slate-300 bg-white text-slate-900"
															: "border-white/10 bg-white/[0.03] text-white",
													)}
												/>
											</label>
											<label
												className={cn(
													"flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm",
													isLightTheme
														? "border-slate-300 bg-white text-slate-700"
														: "border-white/10 bg-black/20 text-white/78",
												)}
											>
												<span>Auto Download watched episodes</span>
												<input
													type="checkbox"
													checked={settings.autoDownload}
													onChange={(event) =>
														handleSettingsChange(
															"autoDownload",
															event.target.checked,
														)
													}
													className="size-5 accent-[var(--reel-accent)]"
												/>
											</label>
											<label
												className={cn("grid gap-2 text-sm", secondaryTextClass)}
											>
												Concurrent downloads
												<input
													type="range"
													min={1}
													max={4}
													step={1}
													value={settings.concurrentDownloads}
													onChange={(event) =>
														handleSettingsChange(
															"concurrentDownloads",
															Number(event.target.value),
														)
													}
													className="accent-[var(--reel-accent)]"
												/>
												<span className={cn("text-xs", subtleTextClass)}>
													{settings.concurrentDownloads} simultaneous jobs
												</span>
											</label>
										</CardContent>
									</Card>
								</section>
							) : null}
						</div>

						<aside className="grid gap-4">
							<Card
								className={cn(
									"rounded-[28px] border-0 py-0 shadow-none",
									sectionPanelClass,
								)}
							>
								<CardContent className="grid gap-4 p-5">
									<div>
										<p className="text-[11px] text-white/35 uppercase tracking-[0.3em]">
											Current stream
										</p>
										<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
											Continue Watching
										</h3>
									</div>

									{activePlayback && selectedMovie ? (
										<button
											type="button"
											onClick={handleResumePlayback}
											className={cn(
												"rounded-[24px] border p-4 text-left transition",
												shellPanelClass,
												isLightTheme
													? "hover:border-slate-300"
													: "hover:border-white/14",
											)}
										>
											<p
												className={cn(
													"text-[11px] uppercase tracking-[0.24em]",
													subtleTextClass,
												)}
											>
												Resume
											</p>
											<h4 className="mt-2 font-semibold text-lg text-white">
												{activePlayback.title}
											</h4>
											<p className={cn("mt-2 text-sm", secondaryTextClass)}>
												Resume exactly where you left off.
											</p>
										</button>
									) : (
										<div
											className={cn(
												"rounded-[24px] border border-dashed p-5 text-sm",
												isLightTheme
													? "border-slate-300 bg-white text-slate-500"
													: "border-white/10 bg-[#17181e] text-white/50",
											)}
										>
											Open a title to unlock the player and smart resume memory.
										</div>
									)}
								</CardContent>
							</Card>

							<Card
								className={cn(
									"rounded-[28px] border-0 py-0 shadow-none",
									sectionPanelClass,
								)}
							>
								<CardContent className="grid gap-4 p-5">
									<div>
										<p
											className={cn(
												"text-[11px] uppercase tracking-[0.3em]",
												subtleTextClass,
											)}
										>
											Queue summary
										</p>
										<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
											Download health
										</h3>
									</div>

									<div className="grid gap-3">
										{downloadSummary.map((item) => {
											const Icon = item.icon;
											return (
												<div
													key={item.label}
													className={cn(
														"flex items-center justify-between rounded-[20px] border px-4 py-3",
														shellPanelClass,
													)}
												>
													<span className="flex items-center gap-3 text-sm text-white/70">
														<Icon
															className={`size-4 ${item.label === "Running" && item.value > 0 ? "animate-spin" : ""}`}
														/>
														{item.label}
													</span>
													<span className="font-semibold text-lg text-white">
														{item.value}
													</span>
												</div>
											);
										})}
									</div>
								</CardContent>
							</Card>
						</aside>
					</section>
				</main>
			</div>

			{showConfirmModal && selectedEpisodes.length > 0 ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
					<div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-[#0c111b] p-6 text-white shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
						<p className="text-[11px] text-white/45 uppercase tracking-[0.35em]">
							Confirm bulk download
						</p>
						<h3 className="mt-3 font-[family-name:var(--font-reel-display)] text-4xl">
							Download all selected episodes?
						</h3>
						<p className="mt-4 text-sm text-white/65 leading-7">
							{selectedEpisodes.length} episode
							{selectedEpisodes.length === 1 ? "" : "s"} will be queued in the
							background and saved to{" "}
							{settings.saveDirectory || "your configured directory"}.
						</p>
						<div className="mt-6 flex flex-wrap gap-3">
							<Button
								variant="outline"
								className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10"
								onClick={() => setShowConfirmModal(false)}
							>
								Cancel
							</Button>
							<Button
								className="rounded-full bg-[color:var(--reel-accent)] px-5 text-white hover:bg-[color:var(--reel-accent)]/90"
								onClick={() => {
									void queueEpisodes(selectedEpisodes);
									setShowConfirmModal(false);
								}}
							>
								<Download /> Confirm download all
							</Button>
						</div>
					</div>
				</div>
			) : null}

			{isPlayerOpen && activePlayback && selectedMovie ? (
				<ReelShortPlayer
					playback={activePlayback}
					movieTitle={selectedMovie.title}
					previousEpisodeTitle={previousEpisode?.title}
					nextEpisodeTitle={nextEpisode?.title}
					initialPosition={playerInitialPosition}
					onClose={() => setIsPlayerOpen(false)}
					onEnded={handlePlayerEnd}
					onPrevious={
						previousEpisode
							? () => void openEpisode(previousEpisode, { resume: false })
							: undefined
					}
					onNext={
						nextEpisode
							? () => void openEpisode(nextEpisode, { resume: false })
							: undefined
					}
					onProgress={handlePlayerProgress}
					onPlayStart={handlePlayStart}
				/>
			) : null}
		</div>
	);
}
