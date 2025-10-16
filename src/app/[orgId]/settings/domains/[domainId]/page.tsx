import { redirect } from "next/navigation";

export default async function DomainPage(props: {
    params: Promise<{ orgId: string; domainId: string }>;
}) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/domains/${params.domainId}`);
}