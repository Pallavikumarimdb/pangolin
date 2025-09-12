
export type SiteResourceRow = {
  id: number;
  name: string;
  orgId: string;
  domain: string;
  authState: string;
  http: boolean;
  protocol: string;
  proxyPort: number | null;
  enabled: boolean;
  domainId?: string;
};

export type SiteTargetRow = {
  id: number;
  resourceId: number;
  siteId: number;
  ip: string;
  method: string;
  port: number;
  internalPort?: number;
  resourceName: string;
  resourceNiceId: string;
  protocol: string;
};

export type siteData = {
  siteId: number;
  name: string;
  niceId: string;
}

export type SiteResourcesTreeProps = {
  site: siteData,
  resources: SiteResourceRow[];
  targets: SiteTargetRow[];
  orgId: string;
  onToggleResourceEnabled: (val: boolean, resourceId: number) => Promise<void>;
  onDeleteResource: (resourceId: number) => void;
};


export type SiteData = {
    siteId: number;
    name: string;
    niceId: string;
    resources: SiteResourceRow[];
};

export type ListSiteResourcesResponse = {
    resources: Array<{
        resourceId: number;
        name: string;
        orgId: string;
        niceId: string;
        subdomain: string;
        fullDomain: string;
        domainId: string;
        ssl: boolean;
        sso: boolean;
        http: boolean;
        protocol: string;
        proxyPort: number;
        emailWhitelistEnabled: boolean;
        applyRules: boolean;
        enabled: boolean;
        enableProxy: boolean;
        skipToIdpId: number;
        targetId: number;
        ip: string;
        method: string;
        port: number;
        baseDomain: string;
    }>;
    pagination: { total: number; limit: number; offset: number };
};

export type ListSiteTargetsResponse = {
    targets: Array<{
        targetId: number;
        resourceId: number;
        siteId: number;
        ip: string;
        method: string;
        port: number;
        internalPort: number;
        enabled: boolean;
        resourceName: string;
        resourceNiceId: string;
        protocol: string;
    }>;
    pagination: { total: number; limit: number; offset: number };
};


export interface SiteNodeProps {
  site: siteData;
  orgId: string;
  resources: SiteResourceRow[];
  targets: SiteTargetRow[];
  expanded: boolean;
  onToggle: (siteId: number) => void;
  onToggleResourceEnabled: (
    val: boolean,
    resourceId: number
  ) => Promise<void>;
  onDeleteResource: (resourceId: number) => void;
  searchTerm: string;
  protocolFilter: string;
  statusFilter: string;
  t?: (key: string, params?: Record<string, unknown>) => string;
}