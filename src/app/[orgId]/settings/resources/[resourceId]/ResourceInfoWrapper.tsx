
import { verifySession } from "@/lib/auth/verifySession";
import { authCookieHeader } from "@/lib/api/cookies";
import { internal } from "@/lib/api";
import { ListUserOrgsResponse } from "@server/routers/org";
import ResourceInfoBox from "./ResourceInfoBox";


interface ResourceInfoWrapperType {
    resource: any;
}

export default async function ResourceInfoWrapper({ resource }: ResourceInfoWrapperType) {
    const user = await verifySession();
    if (!user) return <div className="text-red-500">Unauthorized</div>;

    let orgs: ListUserOrgsResponse["orgs"] = [];

    try {
        const res = await internal.get(`/user/${user.userId}/orgs`, await authCookieHeader());
        if (res?.data?.data?.orgs) {
            const fetchedOrgs: ListUserOrgsResponse["orgs"] = res.data.data.orgs;
            orgs = fetchedOrgs.filter(
                (org: { orgId: string; name: string }) => org.orgId !== resource.orgId
            );
        }
    } catch (err) {
        console.error("Failed to fetch user orgs:", err);
    }

    return <ResourceInfoBox orgs={orgs} />;
}
