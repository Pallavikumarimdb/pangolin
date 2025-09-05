import SiteProvider from "@app/providers/SiteProvider";
import { internal } from "@app/lib/api";
import { GetSiteResponse } from "@server/routers/site";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import SiteInfoCard from "../../../../../components/SiteInfoCard";
import { getTranslations } from "next-intl/server";

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ niceId: string; orgId: string }>;
}

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;

    const { children } = props;

    let site = null;
    try {
        const res = await internal.get<AxiosResponse<GetSiteResponse>>(
            `/org/${params.orgId}/site/${params.niceId}`,
            await authCookieHeader()
        );
        site = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/sites`);
    }

    const t = await getTranslations();

    const navItems = [
        {
            title: t('general'),
            href: `/${params.orgId}/settings/sites/${params.niceId}/general`
        },
        {
            title: t('resources'),
            href: `/${params.orgId}/settings/sites/${params.niceId}/resources`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t('siteSetting', {siteName: site?.name})}
                description={t('siteSettingDescription')}
            />

            <SiteProvider site={site}>
                <div className="space-y-6">
                    <SiteInfoCard />
                    <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
                </div>
            </SiteProvider>
        </>
    );
}
