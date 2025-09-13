'use client';

import {
  ArrowRight,
  Copy,
  ExternalLink,
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@app/hooks/useToast';
import { SiteResourceRow } from './siteConfigTypes';

export default function ResourceItem({
  resource,
  orgId,
  onToggle,
  onDelete,
  t = (key: string) => key
}: {
  resource: SiteResourceRow;
  orgId: string;
  onToggle: (val: boolean, resourceId: number) => Promise<void>;
  onDelete: (resourceId: number) => void;
  t?: (key: string) => string;
}) {
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
                  title: 'Copied to clipboard',
                  description: `Port ${resource.proxyPort} copied to clipboard`,
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
          <Badge variant="destructive" className="text-xs">
            {t('missingDomain')}
          </Badge>
          <span className="text-xs text-muted-foreground">{t('domainNotConfigured')}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground truncate">{resource.domain}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => {
            navigator.clipboard.writeText(resource.domain);
            toast({
              title: 'Copied to clipboard',
              description: `${resource.domain} copied to clipboard`,
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{resource.name}</h4>
            <Badge variant="secondary" className="text-xs">
              {resource.protocol.toUpperCase()}
            </Badge>
            {getAuthIcon()}
          </div>
          <div className="flex items-center gap-2">{getAccessInfo()}</div>
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
            <Link className="block w-full" href={`/${orgId}/settings/resources/${resource.id}`}>
              <DropdownMenuItem>{t('viewSettings')}</DropdownMenuItem>
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
}
