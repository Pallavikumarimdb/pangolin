import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import { internal } from "@app/lib/api";
import { GetDomainResponse } from "@server/routers/domain/getDomain";
import { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";
import SettingsLayoutClient from "./DomainSettingsLayout";

interface SettingsLayoutProps {
  children: React.ReactNode;
  params: Promise<{ domainId: string; orgId: string }>;
}

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  const { domainId, orgId } = await params;

  let domain = null;
  try {
    const res = await internal.get<AxiosResponse<GetDomainResponse>>(
      `/org/${orgId}/domain/${domainId}`,
      await authCookieHeader()
    );
    domain = res.data.data;
  } catch {
    redirect(`/${orgId}/settings/domains`);
  }

  const t = await getTranslations();

  return (
    <SettingsLayoutClient
      orgId={orgId}
      domain={domain}
    >
      {children}
    </SettingsLayoutClient>
  );
}
