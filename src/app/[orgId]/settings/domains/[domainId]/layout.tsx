import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";
import { GetDomainResponse } from "@server/routers/domain/getDomain";
import DomainProvider from "@app/providers/DomainProvider";
import DomainInfoCard from "@app/components/DomainInfoCard";

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ domainId: string; orgId: string }>;
}

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;

    const { children } = props;

    let domain = null;
    try {
        const res = await internal.get<AxiosResponse<GetDomainResponse>>(
            `/org/${params.orgId}/domain/${params.domainId}`,
            await authCookieHeader()
        );
        domain = res.data.data;
        console.log(JSON.stringify(domain));
    } catch {
        redirect(`/${params.orgId}/settings/domains`);
    }

    const t = await getTranslations();


    return (
        <>
            <SettingsSectionTitle
                title={domain ? domain.baseDomain : t('domainSetting')}
                description={t('domainSettingDescription')}
            />

            <DomainProvider domain={domain}>
                <div className="space-y-6">
                    <DomainInfoCard />
                </div>
            </DomainProvider>
        </>
    );
}
