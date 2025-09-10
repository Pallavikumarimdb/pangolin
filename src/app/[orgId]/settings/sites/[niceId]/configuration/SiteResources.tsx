'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Server,
  Search,
  Filter,
  MoreHorizontal,
  ArrowRight,
  ShieldCheck,
  ShieldOff,
  Eye,
  Copy,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { toast } from '@app/hooks/useToast';

type SiteResourceRow = {
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

type siteData = {
  siteId: number;
  name: string;
  niceId: string;
}

type SiteResourcesTreeProps = {
  site: siteData,
  resources: SiteResourceRow[];
  orgId: string;
  onToggleResourceEnabled: (val: boolean, resourceId: number) => Promise<void>;
  onDeleteResource: (resourceId: number) => void;
};

const ResourceItem = ({
  resource,
  orgId,
  onToggle,
  onDelete,
  t = (key: string, params?: any) => key 
}: {
  resource: SiteResourceRow;
  orgId: string;
  onToggle: (val: boolean, resourceId: number) => Promise<void>;
  onDelete: (resourceId: number) => void;
  t?: (key: string, params?: any) => string;
}) => {
  const getAuthIcon = () => {
    switch (resource.authState) {
      case 'protected':
        return <ShieldCheck className="w-4 h-4 text-green-500" />;
      case 'not_protected':
        return <ShieldOff className="w-4 h-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getAccessInfo = () => {
    if (!resource.http) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Port: {resource.proxyPort}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              if (resource.proxyPort) {
                navigator.clipboard.writeText(resource.proxyPort.toString());
                toast({
                  title: "Copied to clipboard",
                  description: `Port ${resource.proxyPort} copied to clipboard`
                });
              }
            }}
          >
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      );
    }

    if (!resource.domainId) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs">Domain Missing</Badge>
          <span className="text-xs text-muted-foreground">Domain not configured</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground truncate">
          {resource.domain}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => {
            navigator.clipboard.writeText(resource.domain);
            toast({
              title: "Copied to clipboard",
              description: `${resource.domain} copied to clipboard`
            });
          }}
        >
          <Copy className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => window.open(resource.domain, '_blank')}
        >
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-shrink-0">
          <Server className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{resource.name}</h4>
            <Badge variant="secondary" className="text-xs">
              {resource.protocol.toUpperCase()}
            </Badge>
            {getAuthIcon()}
          </div>
          <div className="flex items-center gap-2">
            {getAccessInfo()}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Switch
          checked={resource.http ? !!resource.domainId && resource.enabled : resource.enabled}
          disabled={resource.http ? !resource.domainId : false}
          onCheckedChange={(checked) => onToggle(checked, resource.id)}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Link
              className="block w-full"
              href={`/${orgId}/settings/resources/${resource.id}`}
            >
              <DropdownMenuItem>
                {t('viewSettings')}
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(resource.id)}
              className="text-destructive focus:text-destructive"
            >
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Link href={`/${orgId}/settings/resources/${resource.id}`}>
          <Button variant="outline" size="sm">
            {t('edit')}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

const SiteNode = ({
  site,
  orgId,
  resources,
  expanded,
  onToggle,
  onToggleResourceEnabled,
  onDeleteResource,
  searchTerm,
  protocolFilter,
  statusFilter,
  t = (key: string, params?: any) => key
}: {
  site: siteData;
  orgId: string;
  resources: SiteResourceRow[];
  expanded: boolean;
  onToggle: (siteId: number) => void;
  onToggleResourceEnabled: (val: boolean, resourceId: number) => Promise<void>;
  onDeleteResource: (resourceId: number) => void;
  searchTerm: string;
  protocolFilter: string;
  statusFilter: string;
  t?: (key: string, params?: any) => string;
}) => {
  const filteredResources = useMemo(() => {
    return resources.filter(resource => {
      const matchesSearch = !searchTerm ||
        resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.domain.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProtocol =
        protocolFilter === "all" || resource.protocol === protocolFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && resource.enabled) ||
        (statusFilter === "disabled" && !resource.enabled) ||
        (statusFilter === "protected" && resource.authState === "protected") ||
        (statusFilter === "not_protected" && resource.authState === "not_protected");


      return matchesSearch && matchesProtocol && matchesStatus;
    });
  }, [resources, searchTerm, protocolFilter, statusFilter]);

  const resourceCounts = useMemo(() => {
    const total = resources.length;
    const enabled = resources.filter(r => r.enabled).length;
    const protected_count = resources.filter(r => r.authState === 'protected').length;
    return { total, enabled, protected: protected_count };
  }, [resources]);


  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onToggle(site.siteId)}
      >
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <Server className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-semibold text-lg">Resources</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{resourceCounts.total} resources</Badge>
          <Badge variant="secondary">{resourceCounts.enabled} enabled</Badge>
          {resourceCounts.protected > 0 && (
            <Badge variant="default">{resourceCounts.protected} protected</Badge>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20">
          {filteredResources.length > 0 ? (
            <div className="p-4 space-y-2">
              {filteredResources.map((resource) => (
                <ResourceItem
                  key={resource.id}
                  resource={resource}
                  orgId={orgId}
                  onToggle={onToggleResourceEnabled}
                  onDelete={onDeleteResource}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>
                {resources.length === 0
                  ? 'No resources found for this site'
                  : 'No resources match the current filters'
                }
              </p>
              {resources.length === 0 && (
                <Link href={`/${orgId}/settings/resources/create`} className="inline-block mt-2">
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Create First Resource
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
export default function SiteResourcesDirectoryTree({
  site,
  resources,
  orgId,
  onToggleResourceEnabled,
  onDeleteResource,
  t = (key: string, params?: any) => key
}: SiteResourcesTreeProps & { t?: (key: string, params?: any) => string }) {
  const [expandedSites, setExpandedSites] = useState(new Set<number>([site.siteId]));
  const [searchTerm, setSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const toggleSite = (siteId: number) => {
    const newExpanded = new Set(expandedSites);
    if (newExpanded.has(siteId)) {
      newExpanded.delete(siteId);
    } else {
      newExpanded.add(siteId);
    }
    setExpandedSites(newExpanded);
  };

  const allProtocols = useMemo(() => {
    const protocols = new Set<string>();
    resources.forEach(resource => {
      protocols.add(resource.protocol);
    });
    return Array.from(protocols);
  }, [resources]);


  const clearFilters = () => {
    setSearchTerm('');
    setProtocolFilter('all');
    setStatusFilter('all');
  };

  const hasFilters = searchTerm || protocolFilter !== 'all' || statusFilter !== 'all';


  return (
    <div className="w-full space-y-6">

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search resources by name or domain..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={protocolFilter} onValueChange={setProtocolFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Protocol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Protocols</SelectItem>
                  {allProtocols.map(protocol => (
                    <SelectItem key={protocol} value={protocol}>
                      {protocol.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status</SelectItem>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="protected">Protected</SelectItem>
                  <SelectItem value="not_protected">Not Protected</SelectItem>
                </SelectContent>
              </Select>

              {hasFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  <Filter className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>

      <div className="space-y-4">
        <SiteNode
          site={site}
          orgId={orgId}
          resources={resources}
          expanded={expandedSites.has(site.siteId)}
          onToggle={toggleSite}
          onToggleResourceEnabled={onToggleResourceEnabled}
          onDeleteResource={onDeleteResource}
          searchTerm={searchTerm}
          protocolFilter={protocolFilter}
          statusFilter={statusFilter}
          t={t}
        />
      </div>
    </div>
  );
}
