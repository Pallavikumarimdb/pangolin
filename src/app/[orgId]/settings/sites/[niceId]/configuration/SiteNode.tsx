"use client";

import { useMemo, useState, FC } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Network,
  Waypoints,
  Server,
  Plus,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ResourceItem from "./ResourceItem";
import TargetItem from "./TargetItem";
import { SiteNodeProps } from "./siteConfigTypes";



const SiteNode: FC<SiteNodeProps> = ({
  site,
  orgId,
  resources,
  targets,
  expanded,
  onToggle,
  onToggleResourceEnabled,
  onDeleteResource,
  searchTerm,
  protocolFilter,
  statusFilter,
  t = (key) => key,
}) => {
  const [expandedResources, setExpandedResources] = useState(true);
  const [expandedTargets, setExpandedTargets] = useState(true);

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      const matchesSearch =
        !searchTerm ||
        resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.domain.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProtocol =
        protocolFilter === "all" || resource.protocol === protocolFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && resource.enabled) ||
        (statusFilter === "disabled" && !resource.enabled) ||
        (statusFilter === "protected" &&
          resource.authState === "protected") ||
        (statusFilter === "not_protected" &&
          resource.authState === "not_protected");

      return matchesSearch && matchesProtocol && matchesStatus;
    });
  }, [resources, searchTerm, protocolFilter, statusFilter]);

  const filteredTargets = useMemo(() => {
    return targets.filter((target) => {
      const matchesSearch =
        !searchTerm ||
        target.resourceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        target.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
        target.port.toString().includes(searchTerm);

      const matchesProtocol =
        protocolFilter === "all" || target.protocol === protocolFilter;

      return matchesSearch && matchesProtocol;
    });
  }, [targets, searchTerm, protocolFilter]);


  const resourceCounts = useMemo(() => {
    const total = resources.length;
    const enabled = resources.filter((r) => r.enabled).length;
    const protectedCount = resources.filter(
      (r) => r.authState === "protected"
    ).length;
    return { total, enabled, protected: protectedCount };
  }, [resources]);

  const targetCounts = useMemo(
    () => ({ total: targets.length }),
    [targets]
  );

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => onToggle(site.siteId)}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          )}
          <Network className="w-6 h-6 text-primary" />
          <div>
            <h3 className="font-semibold text-lg">{site.name}</h3>
            <p className="text-sm text-muted-foreground">
              Configurations attached to {site.niceId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{resourceCounts.total} resources</Badge>
          <Badge variant="secondary">{resourceCounts.enabled} enabled</Badge>
          {resourceCounts.protected > 0 && (
            <Badge variant="default">
              {resourceCounts.protected} protected
            </Badge>
          )}
          <Badge variant="outline">{targetCounts.total} targets</Badge>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20">
          <div className="p-4 space-y-6">
            {/* --- Resources Section --- */}
            <div>
              <div
                className="flex items-center gap-2 mb-3 cursor-pointer hover:bg-muted/30 p-2 -m-2 rounded transition-colors"
                onClick={() => setExpandedResources((prev) => !prev)}
              >
                {expandedResources ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Waypoints className="w-5 h-5 text-muted-foreground" />
                <h4 className="font-semibold">Resources</h4>
                <Badge variant="outline">{filteredResources.length}</Badge>
              </div>

              {expandedResources && (
                <>
                  {filteredResources.length > 0 ? (
                    <div className="space-y-2">
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
                    <div className="p-6 text-center text-muted-foreground bg-muted/10 rounded-lg">
                      <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>
                        {resources.length === 0
                          ? "No resources found for this site"
                          : "No resources match the current filters"}
                      </p>
                      {resources.length === 0 && (
                        <Link
                          href={`/${orgId}/settings/resources/create`}
                          className="inline-block mt-2"
                        >
                          <Button size="sm">
                            <Plus className="w-4 h-4 mr-1" />
                            Create First Resource
                          </Button>
                        </Link>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* --- Targets Section --- */}
            <div>
              <div
                className="flex items-center gap-2 mb-3 cursor-pointer hover:bg-muted/30 p-2 -m-2 rounded transition-colors"
                onClick={() => setExpandedTargets((prev) => !prev)}
              >
                {expandedTargets ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Target className="w-5 h-5 text-muted-foreground" />
                <h4 className="font-semibold">Targets</h4>
                <Badge variant="outline">{filteredTargets.length}</Badge>
              </div>

              {expandedTargets && (
                <>
                  {filteredTargets.length > 0 ? (
                    <div className="space-y-2">
                      {filteredTargets.map((target) => (
                        <TargetItem
                          key={target.id}
                          target={target}
                          orgId={orgId}
                          t={t}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-muted-foreground bg-muted/10 rounded-lg">
                      <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>
                        {targets.length === 0
                          ? "No targets found for this site"
                          : "No targets match the current filters"}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default SiteNode;
