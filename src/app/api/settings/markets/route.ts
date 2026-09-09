import { NextRequest, NextResponse } from "next/server";
import { getMarketSections, setMarketSections } from "@/lib/settings";
import { marketSectionsSchema } from "@/lib/markets/symbols";
import { CATALOG, SECTION_CAP } from "@/lib/markets/catalog";

export const runtime = "nodejs";

/** The picker's whole payload: what is chosen, what may be chosen, the cap. */
export async function GET() {
  try {
    const sections = await getMarketSections();
    return NextResponse.json({ sections, catalog: CATALOG, cap: SECTION_CAP });
  } catch (error) {
    console.error("Failed to load market sections:", error);
    return NextResponse.json({ error: "Failed to load market sections" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = marketSectionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid sections", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    await setMarketSections(parsed.data);
    return NextResponse.json({ sections: parsed.data });
  } catch (error) {
    console.error("Failed to save market sections:", error);
    return NextResponse.json({ error: "Failed to save market sections" }, { status: 500 });
  }
}
