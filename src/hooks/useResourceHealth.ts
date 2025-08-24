import { useState, useEffect } from "react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";

type Target = {
  host: string;
  port: number;
};

type ResourceRow = {
  id: number;
  enabled: boolean;
  targets?: Target[];
};

type Status = "checking" | "online" | "offline";

export function useResourceHealth(orgId: string, resources: ResourceRow[]) {
  const { env } = useEnvContext();
  const api = createApiClient({ env });

  const [resourceStatus, setResourceStatus] = useState<Record<number, Status>>({});
  const [targetStatus, setTargetStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    if (!orgId || resources.length === 0) return;

    // init all as "checking"
    const initialRes: Record<number, Status> = {};
    const initialTargets: Record<string, Status> = {};
    resources.forEach((r) => {
      initialRes[r.id] = "checking";
      r.targets?.forEach((t) => {
        const key = `${r.id}:${t.host}:${t.port}`;
        initialTargets[key] = "checking";
      });
    });
    setResourceStatus(initialRes);
    setTargetStatus(initialTargets);

    // build batch checks
    const checks = resources.flatMap((r) =>
      r.enabled && r.targets?.length
        ? r.targets.map((t) => ({
            id: r.id,
            host: t.host,
            port: t.port,
          }))
        : []
    );

    if (checks.length === 0) return;

    api.post(`/org/${orgId}/resources/tcp-check-batch`, {
      checks,
      timeout: 5000,
    })
      .then((res) => {
        const results = res.data.data.results as Array<{
          id: number;
          host: string;
          port: number;
          connected: boolean;
        }>;

        // build maps
        const newTargetStatus: Record<string, Status> = {};
        const grouped: Record<number, boolean[]> = {};

        results.forEach((r) => {
          const key = `${r.id}:${r.host}:${r.port}`;
          newTargetStatus[key] = r.connected ? "online" : "offline";

          if (!grouped[r.id]) grouped[r.id] = [];
          grouped[r.id].push(r.connected);
        });

        const newResourceStatus: Record<number, Status> = {};
        Object.entries(grouped).forEach(([id, arr]) => {
          newResourceStatus[+id] = arr.some(Boolean) ? "online" : "offline";
        });

        setTargetStatus((prev) => ({ ...prev, ...newTargetStatus }));
        setResourceStatus((prev) => ({ ...prev, ...newResourceStatus }));
      })
      .catch(() => {
        // fallback all offline
        const fallbackRes: Record<number, Status> = {};
        const fallbackTargets: Record<string, Status> = {};
        resources.forEach((r) => {
          if (r.enabled) {
            fallbackRes[r.id] = "offline";
            r.targets?.forEach((t) => {
              fallbackTargets[`${r.id}:${t.host}:${t.port}`] = "offline";
            });
          }
        });
        setResourceStatus((prev) => ({ ...prev, ...fallbackRes }));
        setTargetStatus((prev) => ({ ...prev, ...fallbackTargets }));
      });
  }, [orgId, resources]);

  return { resourceStatus, targetStatus };
}
