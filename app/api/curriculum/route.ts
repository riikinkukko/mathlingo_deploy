import { NextResponse } from "next/server";
import { getCurriculum } from "@/lib/queries";

export async function GET() {
  const curriculum = await getCurriculum();
  return NextResponse.json({ curriculum });
}
