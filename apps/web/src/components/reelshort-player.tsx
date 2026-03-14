"use client";

import { Button } from "@next-js-and-electron/ui/components/button";
import Hls from "hls.js";
import {
	Maximize2,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ReelShortPlayback } from "@/lib/reelshort/types";
import { formatDuration } from "@/lib/reelshort/utils";

type ReelShortPlayerProps = {
	playback: ReelShortPlayback;
	movieTitle: string;
	previousEpisodeTitle?: string;
	nextEpisodeTitle?: string;
	initialPosition?: number;
	onClose: () => void;
	onEnded: () => void;
	onPrevious?: () => void;
	onNext?: () => void;
	onProgress: (positionSeconds: number, durationSeconds: number) => void;
	onPlayStart: () => void;
};

export function ReelShortPlayer({
	playback,
	movieTitle,
	previousEpisodeTitle,
	nextEpisodeTitle,
	initialPosition = 0,
	onClose,
	onEnded,
	onPrevious,
	onNext,
	onProgress,
	onPlayStart,
}: ReelShortPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const startedRef = useRef(false);
	const autoplayAttemptedRef = useRef(false);
	const progressRef = useRef(onProgress);
	const endedRef = useRef(onEnded);
	const playStartRef = useRef(onPlayStart);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const [currentTime, setCurrentTime] = useState(initialPosition);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(1);
	const [error, setError] = useState("");
	const [videoSize, setVideoSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	useEffect(() => {
		progressRef.current = onProgress;
		endedRef.current = onEnded;
		playStartRef.current = onPlayStart;
	}, [onEnded, onPlayStart, onProgress]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		let hls: Hls | null = null;
		startedRef.current = false;
		autoplayAttemptedRef.current = false;
		setError("");
		setIsReady(false);
		setIsPlaying(false);
		setVideoSize(null);

		const attemptAutoplay = () => {
			if (autoplayAttemptedRef.current) {
				return;
			}

			autoplayAttemptedRef.current = true;
			const playPromise = video.play();
			if (!playPromise) {
				return;
			}

			void playPromise.catch((playError: unknown) => {
				if (
					playError instanceof DOMException &&
					playError.name === "AbortError"
				) {
					return;
				}

				setError(
					"Playback could not start automatically. Press play to start.",
				);
			});
		};

		if (video.canPlayType("application/vnd.apple.mpegurl")) {
			video.src = playback.videoUrl;
		} else if (Hls.isSupported()) {
			hls = new Hls({ enableWorker: true });
			hls.loadSource(playback.videoUrl);
			hls.attachMedia(video);
			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				attemptAutoplay();
			});
			hls.on(Hls.Events.ERROR, (_, data) => {
				if (data.fatal) {
					setError("Playback hit a fatal HLS error.");
				}
			});
		} else {
			setError("This desktop environment does not support HLS playback.");
		}

		const handleLoadedMetadata = () => {
			setDuration(video.duration || 0);
			setCurrentTime(initialPosition > 5 ? initialPosition : 0);
			setVideoSize({
				width: video.videoWidth || 0,
				height: video.videoHeight || 0,
			});
			if (initialPosition > 5) {
				video.currentTime = initialPosition;
			}
			setIsReady(true);
			attemptAutoplay();
		};

		const handleTimeUpdate = () => {
			setCurrentTime(video.currentTime);
			setDuration(video.duration || 0);
			progressRef.current(video.currentTime, video.duration || 0);
		};

		const handlePlay = () => {
			setIsPlaying(true);
			if (!startedRef.current) {
				startedRef.current = true;
				playStartRef.current();
			}
		};

		const handlePause = () => setIsPlaying(false);
		const handleEnded = () => endedRef.current();

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("timeupdate", handleTimeUpdate);
		video.addEventListener("play", handlePlay);
		video.addEventListener("pause", handlePause);
		video.addEventListener("ended", handleEnded);

		return () => {
			video.pause();
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("timeupdate", handleTimeUpdate);
			video.removeEventListener("play", handlePlay);
			video.removeEventListener("pause", handlePause);
			video.removeEventListener("ended", handleEnded);
			if (hls) {
				hls.destroy();
			}
			video.removeAttribute("src");
			video.load();
		};
	}, [playback.videoUrl]);

	const progress = useMemo(() => {
		if (!duration) {
			return 0;
		}

		return (currentTime / duration) * 100;
	}, [currentTime, duration]);

	const togglePlayback = () => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		if (video.paused) {
			void video.play();
		} else {
			video.pause();
		}
	};

	const handleSeek = (value: number) => {
		const video = videoRef.current;
		if (!video || !duration) {
			return;
		}

		video.currentTime = (value / 100) * duration;
	};

	const handleVolumeChange = (value: number) => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		const nextVolume = value / 100;
		video.volume = nextVolume;
		video.muted = nextVolume === 0;
		setVolume(nextVolume);
	};

	const handleMute = () => {
		const video = videoRef.current;
		if (!video) {
			return;
		}

		video.muted = !video.muted;
		setVolume(video.muted ? 0 : video.volume || 1);
	};

	const handleFullscreen = () => {
		if (document.fullscreenElement) {
			void document.exitFullscreen();
			return;
		}

		void frameRef.current?.requestFullscreen();
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/90 px-4 py-4 backdrop-blur-xl sm:px-8">
			<div
				ref={frameRef}
				className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#07080e] shadow-[0_40px_140px_rgba(0,0,0,0.65)]"
			>
				<div className="flex items-start justify-between gap-4 border-white/10 border-b px-5 py-4 text-white sm:px-6">
					<div className="min-w-0">
						<p className="text-white/45 text-xs uppercase tracking-[0.35em]">
							Now watching
						</p>
						<h2 className="truncate font-[family-name:var(--font-reel-display)] text-2xl">
							{movieTitle}
						</h2>
						<p className="truncate text-sm text-white/65">{playback.title}</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="text-white hover:bg-white/10"
						onClick={onClose}
					>
						<X />
					</Button>
				</div>

				<div className="grid flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
					<div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] bg-black">
						<div className="relative flex min-h-[320px] items-center justify-center overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
							<video
								ref={videoRef}
								className="block h-auto max-h-[calc(100svh-17rem)] w-auto max-w-full rounded-[24px] bg-black shadow-[0_18px_60px_rgba(0,0,0,0.4)]"
								preload="metadata"
								playsInline
								style={{
									width: videoSize?.width
										? `min(100%, calc((100svh - 17rem) * ${videoSize.width / videoSize.height}))`
										: undefined,
									...(videoSize?.width && videoSize?.height
										? {
												aspectRatio: `${videoSize.width} / ${videoSize.height}`,
											}
										: {}),
								}}
							>
								<track kind="captions" />
							</video>

							{!isReady && !error ? (
								<div className="absolute inset-0 flex items-center justify-center bg-black/40">
									<div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70">
										Loading stream...
									</div>
								</div>
							) : null}

							{error ? (
								<div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white/70">
									{error}
								</div>
							) : null}

							{videoSize ? (
								<div className="absolute top-4 left-4 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[11px] text-white/60 uppercase tracking-[0.22em] sm:top-6 sm:left-6">
									{videoSize.width} x {videoSize.height}
								</div>
							) : null}
						</div>

						<div className="border-white/10 border-t bg-[#0b0f16] px-4 py-4 sm:px-6">
							<div className="mx-auto max-w-4xl space-y-3 rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
								<input
									type="range"
									min={0}
									max={100}
									value={progress}
									onChange={(event) => handleSeek(Number(event.target.value))}
									className="h-1.5 w-full accent-[var(--reel-accent)]"
								/>

								<div className="flex flex-wrap items-center justify-between gap-3 text-white">
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="icon"
											className="text-white hover:bg-white/10"
											onClick={onPrevious}
											disabled={!onPrevious}
										>
											<SkipBack />
										</Button>
										<Button
											variant="ghost"
											size="icon-lg"
											className="rounded-full bg-white/12 text-white hover:bg-white/20"
											onClick={togglePlayback}
										>
											{isPlaying ? <Pause /> : <Play />}
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="text-white hover:bg-white/10"
											onClick={onNext}
											disabled={!onNext}
										>
											<SkipForward />
										</Button>
										<div className="ml-2 text-white/65 text-xs">
											{formatDuration(currentTime)} / {formatDuration(duration)}
										</div>
									</div>

									<div className="flex items-center gap-3">
										<div className="hidden items-center gap-2 sm:flex">
											<button
												type="button"
												onClick={handleMute}
												className="text-white/70 transition hover:text-white"
											>
												{volume === 0 ? (
													<VolumeX className="size-4" />
												) : (
													<Volume2 className="size-4" />
												)}
											</button>
											<input
												type="range"
												min={0}
												max={100}
												value={Math.round(volume * 100)}
												onChange={(event) =>
													handleVolumeChange(Number(event.target.value))
												}
												className="h-1.5 w-24 accent-[var(--reel-accent)]"
											/>
										</div>

										<Button
											variant="ghost"
											size="icon"
											className="text-white hover:bg-white/10"
											onClick={handleFullscreen}
										>
											<Maximize2 />
										</Button>
									</div>
								</div>
							</div>
						</div>
					</div>

					<aside className="flex flex-col gap-5 border-white/10 border-t bg-white/[0.03] p-5 text-white sm:p-6 xl:border-t-0 xl:border-l">
						<div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
							<p className="text-white/45 text-xs uppercase tracking-[0.32em]">
								Episode
							</p>
							<h3 className="mt-2 font-[family-name:var(--font-reel-display)] text-3xl">
								{playback.title}
							</h3>
							<p className="mt-3 text-sm text-white/65 leading-6">
								{playback.description ||
									"Smooth playback, cinematic pacing, and background downloads built for long-form movie nights."}
							</p>
						</div>

						<div className="grid gap-3 rounded-[28px] border border-white/10 bg-black/20 p-4">
							<div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
								<p className="text-white/45 text-xs uppercase tracking-[0.25em]">
									Previous
								</p>
								<p className="mt-2 text-sm text-white/80">
									{previousEpisodeTitle || "No previous episode"}
								</p>
							</div>
							<div className="rounded-[22px] border border-[color:var(--reel-accent)]/40 bg-[color:var(--reel-accent)]/10 p-4">
								<p className="text-white/45 text-xs uppercase tracking-[0.25em]">
									Next up
								</p>
								<p className="mt-2 text-sm text-white/90">
									{nextEpisodeTitle || "You are at the finale."}
								</p>
							</div>
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}
