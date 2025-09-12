'use client';

import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@app/hooks/useToast';
import { SiteTargetRow } from './siteConfigTypes';

export default function TargetItem({
  target,
  orgId,
  t = (key: string) => key
}: {
  target: SiteTargetRow;
  orgId: string;
  t?: (key: string) => string;
}) {
  const getTargetInfo = () => (
    <div className="flex items-center gap-2">
      <h4 className="font-medium text-sm truncate">
        {target.ip}:{target.port}
      </h4>
      {target.internalPort && target.internalPort !== target.port && (
        <h4 className="font-medium text-sm truncate">→ :{target.internalPort}</h4>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={() => {
          navigator.clipboard.writeText(`${target.ip}:${target.port}`);
          toast({
            title: 'Copied to clipboard',
            description: `${target.ip}:${target.port} copied to clipboard`,
          });
        }}
      >
        <Copy className="w-3 h-3" />
      </Button>
    </div>
  );

  return (
    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border hover:bg-muted/40 transition-colors ml-6">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{getTargetInfo()}</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground truncate">→ {target.resourceName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant="outline" className="text-xs">
          {target.protocol.toUpperCase()}
        </Badge>
        {target.method && (
          <Badge variant="secondary" className="text-xs">
            {target.method}
          </Badge>
        )}
      </div>
    </div>
  );
}
