'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SiteResourcesTreeProps } from './siteConfigTypes';
import SiteNode from './siteNode';


export default function SiteConfigDirectoryTree({
  site,
  resources,
  targets,
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
    targets.forEach(target => {
      protocols.add(target.protocol);
    });
    return Array.from(protocols);
  }, [resources, targets]);

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
            placeholder="Search resources and targets by name, domain, or IP..."
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
          targets={targets}
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
