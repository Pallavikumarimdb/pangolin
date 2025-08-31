
import { verifySession } from "@/lib/auth/verifySession";
import { authCookieHeader } from "@/lib/api/cookies";
import { internal } from "@/lib/api";
import { ListUserOrgsResponse } from "@server/routers/org";
import GeneralForm from "./GeneralForm";


export default async function ResourceInfoWrapper() {
    const user = await verifySession();

    if (!user) return <div className="text-red-500">Unauthorized</div>;

    let fetchedOrgs: ListUserOrgsResponse["orgs"] = [];

    try {
        const res = await internal.get(`/user/${user.userId}/orgs`, await authCookieHeader());
        if (res?.data?.data?.orgs) {
            fetchedOrgs = res.data.data.orgs;
        }
    } catch (err) {
        console.error("Failed to fetch user orgs:", err);
    }


    return (
        <>
            <GeneralForm fetchedOrgs={fetchedOrgs} />
        </>
    );
}
