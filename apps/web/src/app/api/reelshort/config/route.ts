import { NextResponse } from "next/server";

import { getDefaultSaveDirectory } from "@/server/reelshort/download-manager";

export async function GET() {
	return NextResponse.json({
		defaultSaveDirectory: getDefaultSaveDirectory(),
	});
}
