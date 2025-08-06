import { NextRequest, NextResponse } from "next/server";
import { authCookieHeader } from "@/lib/api/cookies";
import { verifySession } from "@/lib/auth/verifySession";
import { internal } from "@/lib/api";
import { ListUserOrgsResponse } from "@server/routers/org";

export type Org = {
    orgId: string;
    name: string;
};

export async function GET(req: NextRequest) {
    try {
        const user = await verifySession();
        if (!user) {
            return new Response("Unauthorized", { status: 401 });
        }

        let orgs: ListUserOrgsResponse["orgs"] = [];

        try {
            const res = await internal.get(`/user/${user.userId}/orgs`, await authCookieHeader());
            if (res && res.data && res.data.data && res.data.data.orgs) {
                orgs = res.data.data.orgs;
            }
        } catch (apiError) {
            console.error("Failed to fetch user orgs from internal API:", apiError);
            // Return empty array if API call fails instead of throwing
            orgs = [];
        }

        // Transform the response to match the expected format
        const transformedOrgs = orgs.map(org => ({
            orgId: org.orgId,
            name: org.name
        }));

        return NextResponse.json(transformedOrgs, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });
    } catch (err) {
        console.error("API /api/orgs failed:", err);
        return new Response("Internal Server Error", { status: 500 });
    }
}