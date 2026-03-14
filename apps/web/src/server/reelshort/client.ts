import { inflateSync } from "node:zlib";
import CryptoJS from "crypto-js";

import type {
	ReelShortEpisode,
	ReelShortMovie,
	ReelShortPlayback,
	ReelShortSearchResult,
} from "@/lib/reelshort/types";

const API_BASE = "https://www.reelshort.com/api/video";
const SIGN_SECRET = "zj8N6zKEdrK8d1MxwHSvExdgQ868q1yT";
const AES_KEY = "VvRSNGFynLBW7aCP";
const AES_IV = "gLn8sxqpzyNjehDP";

type UnknownRecord = Record<string, unknown>;

const stableMeta = {
	channelId: "WEB41001",
	clientVer: "2.4.00",
	lang: "en",
	devId: `${randomString(12)}${Date.now()}`,
	session: randomString(32).toLowerCase(),
	uid: "675437821",
};

function randomString(length = 12) {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";

	for (let index = 0; index < length; index += 1) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return result;
}

function buildRequestMeta() {
	return {
		apiVersion: "1.0.4",
		...stableMeta,
		ts: Math.floor(Date.now() / 1000).toString(),
	};
}

function signPayload(payload: Record<string, unknown>) {
	const items = Object.keys(payload)
		.map((key) => ({
			key,
			value:
				typeof payload[key] === "object"
					? JSON.stringify(payload[key])
					: payload[key],
		}))
		.filter(
			({ value }) =>
				value !== "" &&
				value !== null &&
				value !== undefined &&
				value !== "null",
		)
		.sort((left, right) => left.key.localeCompare(right.key));

	const baseString = items
		.map(({ key, value }) => `${key}=${String(value)}`)
		.join("&");

	return CryptoJS.HmacSHA256(baseString, SIGN_SECRET).toString();
}

function decryptResponse(cipherText: string) {
	const key = CryptoJS.enc.Utf8.parse(AES_KEY);
	const iv = CryptoJS.enc.Utf8.parse(AES_IV);
	const decrypted = CryptoJS.AES.decrypt(cipherText, key, {
		iv,
		mode: CryptoJS.mode.CBC,
		padding: CryptoJS.pad.Pkcs7,
	});
	const base64 = decrypted.toString(CryptoJS.enc.Base64);
	const firstBuffer = Buffer.from(base64, "base64");
	const secondBuffer = Buffer.from(firstBuffer.toString(), "base64");
	const json = inflateSync(secondBuffer).toString();

	return JSON.parse(json) as unknown;
}

function getAtPath(source: unknown, path: string) {
	return path.split(".").reduce<unknown>((current, key) => {
		if (current === null || current === undefined) {
			return undefined;
		}

		if (Array.isArray(current)) {
			const index = Number(key);
			return Number.isNaN(index) ? undefined : current[index];
		}

		if (typeof current === "object") {
			return (current as UnknownRecord)[key];
		}

		return undefined;
	}, source);
}

function pickFirst<T>(
	source: unknown,
	paths: string[],
	predicate: (value: unknown) => value is T,
) {
	for (const path of paths) {
		const value = getAtPath(source, path);
		if (predicate(value)) {
			return value;
		}
	}

	return undefined;
}

function isString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function firstString(source: unknown, paths: string[]) {
	const value = pickFirst(source, paths, isString);
	return value?.trim() ?? "";
}

function firstNumber(source: unknown, paths: string[]) {
	return (
		pickFirst(source, paths, isNumber) ?? Number(firstString(source, paths))
	);
}

function firstArray(source: unknown, paths: string[]) {
	return pickFirst(source, paths, Array.isArray) ?? [];
}

function firstBoolean(source: unknown, paths: string[]) {
	const value = pickFirst(
		source,
		paths,
		(candidate): candidate is boolean => typeof candidate === "boolean",
	);
	if (typeof value === "boolean") {
		return value;
	}

	const stringValue = firstString(source, paths).toLowerCase();
	if (!stringValue) {
		return false;
	}

	return ["true", "1", "yes", "locked"].includes(stringValue);
}

function unwrapEnvelope(source: unknown): unknown {
	const data = getAtPath(source, "data");
	if (data !== undefined) {
		return data;
	}

	const result = getAtPath(source, "result");
	if (result !== undefined) {
		return result;
	}

	return source;
}

function normalizeTags(source: unknown) {
	const raw =
		firstArray(source, [
			"tags",
			"tag_list",
			"labels",
			"book_tags",
			"category_list",
		]) || [];

	const tags = raw
		.map((tag) => {
			if (typeof tag === "string") {
				return tag;
			}

			if (tag && typeof tag === "object") {
				return firstString(tag, ["name", "title", "tag_name", "label", "text"]);
			}

			return "";
		})
		.filter(Boolean);

	if (tags.length > 0) {
		return Array.from(new Set(tags));
	}

	const themed = firstArray(source, ["theme", "tag"])
		.map((value) => (typeof value === "string" ? value.trim() : ""))
		.filter(Boolean);
	if (themed.length > 0) {
		return Array.from(new Set(themed));
	}

	const fallback = firstString(source, [
		"tags",
		"tag",
		"categories",
		"category",
	]);
	if (!fallback) {
		return [];
	}

	return fallback
		.split(/[|,/]/)
		.map((value) => value.trim())
		.filter(Boolean)
		.filter((value, index, array) => array.indexOf(value) === index);
}

function extractImage(source: unknown, kind: "thumbnail" | "poster") {
	const candidates =
		kind === "thumbnail"
			? [
					"thumbnail",
					"thumb",
					"image",
					"cover",
					"cover_url",
					"coverUrl",
					"horizontal_cover",
					"horizontalCover",
					"book_cover",
					"book_pic",
				]
			: [
					"poster",
					"poster_url",
					"posterUrl",
					"vertical_cover",
					"verticalCover",
					"portrait_cover",
					"portraitCover",
					"thumbnail",
					"cover",
					"book_pic",
				];

	return firstString(source, candidates);
}

function normalizeEpisode(
	source: unknown,
	bookId: string,
	index: number,
): ReelShortEpisode | null {
	if (firstNumber(source, ["chapter_type", "type"]) === 2) {
		return null;
	}

	const chapterId = firstString(source, [
		"chapter_id",
		"chapterId",
		"id",
		"chapter.id",
	]);
	if (!chapterId) {
		return null;
	}

	const serialNumber = firstNumber(source, [
		"serial_number",
		"chapter_index",
		"episode_index",
		"sort",
		"chapter_num",
		"episode",
		"episode_num",
		"index",
	]);

	const title =
		firstString(source, [
			"chapter_title",
			"chapterTitle",
			"title",
			"chapter_name",
			"name",
		]) ||
		(serialNumber === 0
			? "Trailer"
			: serialNumber
				? `Episode ${serialNumber}`
				: "") ||
		`Episode ${index}`;

	return {
		bookId,
		chapterId,
		title,
		index: serialNumber || index,
		thumbnail: extractImage(source, "thumbnail"),
		durationLabel: firstString(source, [
			"duration",
			"duration_label",
			"play_time",
			"video_duration",
		]),
		isLocked: firstBoolean(source, ["locked", "is_locked", "lock", "need_pay"]),
	};
}

function normalizeSearchItem(source: unknown): ReelShortSearchResult | null {
	const bookId = firstString(source, ["book_id", "bookId", "id", "book.id"]);
	if (!bookId) {
		return null;
	}

	return {
		bookId,
		chapterId: firstString(source, [
			"chapter_id",
			"chapterId",
			"first_chapter_id",
			"latest_chapter_id",
		]),
		title:
			firstString(source, [
				"title",
				"book_name",
				"bookTitle",
				"name",
				"book_title",
			]) || "Untitled story",
		description: firstString(source, [
			"description",
			"desc",
			"book_desc",
			"summary",
			"intro",
			"special_desc",
		]),
		tags: normalizeTags(source),
		thumbnail: extractImage(source, "thumbnail"),
		poster: extractImage(source, "poster"),
		episodeCount:
			firstNumber(source, [
				"chapter_count",
				"chapters",
				"episode_count",
				"episodeCount",
				"total",
			]) || 0,
	};
}

function normalizeMovie(source: unknown, bookId: string): ReelShortMovie {
	const envelope = unwrapEnvelope(source);
	const episodesSource =
		firstArray(envelope, [
			"online_base",
			"lists",
			"chapter_list",
			"chapterList",
			"chapters",
			"list",
			"episodes",
			"items",
			"book.chapters",
		]) || [];

	const episodes = episodesSource
		.map((episode, index) => normalizeEpisode(episode, bookId, index + 1))
		.filter((episode): episode is ReelShortEpisode => Boolean(episode))
		.sort((left, right) => left.index - right.index);

	const title =
		firstString(envelope, [
			"title",
			"book_name",
			"bookTitle",
			"name",
			"book_title",
		]) || "ReelShort title";
	const description = firstString(envelope, [
		"description",
		"desc",
		"book_desc",
		"summary",
		"intro",
		"special_desc",
	]);
	const thumbnail =
		extractImage(envelope, "thumbnail") || episodes[0]?.thumbnail || "";
	const poster = extractImage(envelope, "poster") || thumbnail;

	return {
		bookId,
		title,
		description,
		tags: normalizeTags(envelope),
		thumbnail,
		poster,
		episodes,
	};
}

function normalizePlayback(
	source: unknown,
	bookId: string,
	chapterId: string,
): ReelShortPlayback {
	const envelope = unwrapEnvelope(source);
	const videoUrl = firstString(envelope, [
		"video_url",
		"videoUrl",
		"play_url",
		"url",
		"media_url",
	]);

	return {
		bookId,
		chapterId,
		title:
			firstString(envelope, [
				"chapter_title",
				"chapterTitle",
				"title",
				"chapter_name",
				"name",
			]) ||
			(firstNumber(envelope, [
				"serial_number",
				"chapter_index",
				"episode_index",
			])
				? `Episode ${firstNumber(envelope, ["serial_number", "chapter_index", "episode_index"])}`
				: "") ||
			"Episode",
		description: firstString(envelope, [
			"description",
			"desc",
			"summary",
			"intro",
			"chapter_desc",
			"special_desc",
		]),
		thumbnail: extractImage(envelope, "thumbnail"),
		poster:
			extractImage(envelope, "poster") || extractImage(envelope, "thumbnail"),
		videoUrl,
		isHls: videoUrl.includes(".m3u8"),
		nextChapterId: firstString(envelope, [
			"next_chapter_id",
			"nextChapterId",
			"next.chapter_id",
		]),
	};
}

async function fetchEncrypted<TPayload extends UnknownRecord>(options: {
	endpoint: string;
	pathPrefix?: "book" | "search";
	method: "GET" | "POST";
	payload?: TPayload;
	query?: Record<string, string>;
}) {
	const payload = options.payload ?? ({} as TPayload);
	const meta = buildRequestMeta();
	const signInput = {
		...payload,
		...meta,
		...(options.query ?? {}),
	};

	const sign = signPayload(signInput);
	const headers = {
		accept: "application/json, text/plain, */*",
		"content-type": "application/json",
		apiversion: meta.apiVersion,
		channelid: meta.channelId,
		clientver: meta.clientVer,
		lang: meta.lang,
		devid: meta.devId,
		session: meta.session,
		uid: meta.uid,
		ts: meta.ts,
		sign,
	};

	const url = new URL(
		`${API_BASE}/${options.pathPrefix ?? "book"}/${options.endpoint}`,
	);
	for (const [key, value] of Object.entries(options.query ?? {})) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url.toString(), {
		method: options.method,
		headers,
		body: options.method === "POST" ? JSON.stringify(payload) : undefined,
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`ReelShort API request failed with ${response.status}`);
	}

	const rawText = (await response.text()).trim();
	if (!rawText) {
		throw new Error("ReelShort API returned an empty response");
	}

	try {
		const parsed = JSON.parse(rawText) as unknown;

		if (typeof parsed === "string") {
			return decryptResponse(parsed);
		}

		if (parsed && typeof parsed === "object") {
			const data = (parsed as UnknownRecord).data;
			if (typeof data === "string") {
				return {
					...(parsed as UnknownRecord),
					data: decryptResponse(data),
				};
			}

			return parsed;
		}
	} catch {
		return decryptResponse(rawText);
	}

	return decryptResponse(rawText);
}

export async function searchMovies(word: string, page = 1, pageSize = 10) {
	const payload = { word, page, pageSize };
	const response = await fetchEncrypted({
		endpoint: "webSearch",
		pathPrefix: "search",
		method: "POST",
		payload,
	});
	const envelope = unwrapEnvelope(response);
	const items = firstArray(envelope, [
		"lists",
		"list",
		"book_list",
		"books",
		"records",
		"items",
		"result",
	]);

	return items
		.map((item) => normalizeSearchItem(item))
		.filter((item): item is ReelShortSearchResult => Boolean(item));
}

export async function getMovie(bookId: string, chapterId?: string) {
	const response = await fetchEncrypted({
		endpoint: "getBookInfo",
		method: "GET",
		query: { book_id: bookId },
	});

	return normalizeMovie(response, bookId);
}

export async function getPlayback(bookId: string, chapterId: string) {
	const response = await fetchEncrypted({
		endpoint: "getChapterInfo",
		method: "GET",
		query: { book_id: bookId, chapter_id: chapterId },
	});

	return normalizePlayback(response, bookId, chapterId);
}

export async function getMovieWithPlayback(bookId: string, chapterId?: string) {
	const movie = await getMovie(bookId, chapterId);
	const activeChapterId = chapterId ?? movie.episodes[0]?.chapterId;

	if (!activeChapterId) {
		return { movie, playback: null };
	}

	const playback = await getPlayback(bookId, activeChapterId);

	return {
		movie: {
			...movie,
			description: movie.description || playback.description,
			thumbnail: movie.thumbnail || playback.thumbnail,
			poster: movie.poster || playback.poster,
		},
		playback,
	};
}
