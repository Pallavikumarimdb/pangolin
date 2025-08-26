"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    InfoIcon,
    ShieldCheck,
    ShieldOff,
    AlertTriangle,
    Users,
    Shield,
    Check,
    ArrowRight,
    Unplug
} from "lucide-react";
import { useResourceContext } from "@app/hooks/useResourceContext";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { createApiClient } from "@app/lib/api";
import { build } from "@server/build";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@app/components/ui/accordion";

type ResourceInfoBoxType = {
    orgs: ResponseOrg[];
};

type ResponseOrg = {
    orgId: string;
    name: string;
};

type MoveImpact = {
    resourceId: number;
    resourceName: string;
    currentOrgId: string;
    currentOrgName: string;
    targetOrgId: string;
    targetOrgName: string;
    impact: {
        rolePermissions: {
            count: number;
            details: {
                roleId: number;
                roleName: string;
                roleDescription?: string;
            }[];
        };
        userPermissions: {
            count: number;
            details: {
                userId: string;
                username: string;
                email: string;
                name: string;
            }[];
        };
        targetSites: {
            count: number;
            details: {
                siteId: number;
                siteName: string;
                targetId: number;
                ip: string;
                port: number;
                willBeRemoved: boolean;
            }[];
        };
        movingUser: {
            userId: string;
            username: string;
            email: string;
            name: string;
            retainsAccess: boolean;
        } | null;
        totalImpactedPermissions: number;
        authenticationPreserved: boolean;
        movingUserRetainsAccess: boolean;
    };
};

type MoveWarning = {
    type: 'warning' | 'info' | 'danger';
    icon: React.ReactNode;
    message: string;
};

export default function ResourceInfoBox({ orgs }: ResourceInfoBoxType) {
    const { resource, authInfo } = useResourceContext();
    const api = createApiClient(useEnvContext());

    const t = useTranslations();

    let fullUrl = `${resource.ssl ? "https" : "http"}://${resource.fullDomain}`;

    const [selectedOrg, setSelectedOrg] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [moveImpact, setMoveImpact] = useState<MoveImpact | null>(null);

    const selectedOrgName = orgs.find(org => org.orgId === selectedOrg)?.name || '';

    const generateMoveWarnings = (): MoveWarning[] => {
        const warnings: MoveWarning[] = [];

        if (!moveImpact) return warnings;

        const { impact } = moveImpact;

        if (impact.rolePermissions.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Shield className="w-4 h-4" />,
                message: `${impact.rolePermissions.count} role-based permission${impact.rolePermissions.count > 1 ? 's' : ''} will be removed`
            });
        }

        if (impact.userPermissions.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Users className="w-4 h-4" />,
                message: `${impact.userPermissions.count} user${impact.userPermissions.count > 1 ? 's' : ''} will lose access`
            });
        }

        if (impact.targetSites.count > 0) {
            warnings.push({
                type: 'warning',
                icon: <Unplug className="w-4 h-4" />,
                message: `${impact.targetSites.count} target connection${impact.targetSites.count > 1 ? 's' : ''} will be disconnected`
            });
        }

        if (impact.totalImpactedPermissions === 0 && impact.targetSites.count === 0) {
            warnings.push({
                type: 'info',
                icon: <InfoIcon className="w-4 h-4" />,
                message: 'No existing permissions or connections will be affected'
            });
        }

        if (impact.movingUser) {
            warnings.push({
                type: 'info',
                icon: <Check className="w-4 h-4" />,
                message: 'You will retain access to this resource'
            });
        }

        return warnings;
    };

    const generatePreservedItems = () => [
        'Authentication settings (passwords, pins, whitelists)',
        'Resource configuration and settings',
        'SSL certificates and domain settings',
        'Your personal access to the resource'
    ];

    const getMoveImpact = async (targetOrgId: string): Promise<MoveImpact | null> => {
        try {
            const res = await api.get(
                `/resource/${resource.resourceId}/move-impact?targetOrgId=${targetOrgId}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (res.status === 200 && res.data?.data) {
                return res.data.data;
            }

            throw new Error('Invalid response format');
        } catch (error) {
            console.error('Error fetching move impact:', error);

            // Fallback to basic impact data if API call fails
            const selectedOrgName = orgs.find(org => org.orgId === targetOrgId)?.name || '';

            return {
                resourceId: resource.resourceId,
                resourceName: resource.name,
                currentOrgId: resource.orgId,
                currentOrgName: 'Current Organization',
                targetOrgId,
                targetOrgName: selectedOrgName,
                impact: {
                    rolePermissions: { count: 0, details: [] },
                    userPermissions: { count: 0, details: [] },
                    targetSites: { count: 0, details: [] },
                    movingUser: null,
                    totalImpactedPermissions: 0,
                    authenticationPreserved: true,
                    movingUserRetainsAccess: true
                }
            };
        }
    };

    useEffect(() => {
        if (selectedOrg) {
            setMoveImpact(null);
            getMoveImpact(selectedOrg).then(impact => {
                setMoveImpact(impact);
            });
        } else {
            setMoveImpact(null);
        }
    }, [selectedOrg]);

    const handleMoveClick = () => {
        if (!selectedOrg || !moveImpact) return;
        setShowConfirmDialog(true);
    };

    const handleConfirmMove = async () => {
        if (!selectedOrg) return;

        try {
            setIsLoading(true);
            setShowConfirmDialog(false);

            const res = await api.post(
                `/resource/${resource.resourceId}/move-org`,
                { orgId: selectedOrg },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            if (res.status !== 200) {
                throw new Error("Failed to move resource");
            }

            const moveData = res.data?.data;
            if (moveData?.moveImpact) {
                alert(
                    `Resource moved successfully!\n\n` +
                    `Moved to: ${moveData.targetOrgName}\n` +
                    `Role permissions removed: ${moveData.moveImpact.rolePermissionsRemoved}\n` +
                    `User permissions removed: ${moveData.moveImpact.userPermissionsRemoved}\n` +
                    `Target connections disconnected: ${moveData.moveImpact.targetsDisconnected}\n` +
                    `Authentication settings preserved: ${moveData.moveImpact.authenticationPreserved ? 'Yes' : 'No'}\n\n` +
                    `Redirecting to the new organization...`
                );
            } else {
                alert("Resource moved successfully! Redirecting to the new organization...");
            }
            window.location.href = `/${selectedOrg}/settings/resources`;

        } catch (err) {
            console.error("Failed to move resource", err);
            alert("Error moving resource. Please check if you have permission to move resources to the selected organization.");
        } finally {
            setIsLoading(false);
        }
    };

    const warnings = generateMoveWarnings();
    const preservedItems = generatePreservedItems();

    return (
        <Alert>
            <AlertDescription className="mt-4">
                <InfoSections cols={4}>
                    {resource.http ? (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("authentication")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    {authInfo.password ||
                                        authInfo.pincode ||
                                        authInfo.sso ||
                                        authInfo.whitelist ? (
                                        <div className="flex items-start space-x-2 text-green-500">
                                            <ShieldCheck className="w-4 h-4 mt-0.5" />
                                            <span>{t("protected")}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2 text-yellow-500">
                                            <ShieldOff className="w-4 h-4" />
                                            <span>{t("notProtected")}</span>
                                        </div>
                                    )}
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>URL</InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard
                                        text={fullUrl}
                                        isLink={true}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                            {/* {isEnabled && (
                                <InfoSection>
                                    <InfoSectionTitle>Socket</InfoSectionTitle>
                                    <InfoSectionContent>
                                        {isAvailable ? (
                                            <span className="text-green-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                <span>Online</span>
                                            </span>
                                        ) : (
                                            <span className="text-neutral-500 flex items-center space-x-2">
                                                <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                                <span>Offline</span>
                                            </span>
                                        )}
                                    </InfoSectionContent>
                                </InfoSection>
                            )} */}
                        </>
                    ) : (
                        <>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("protocol")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <span>
                                        {resource.protocol.toUpperCase()}
                                    </span>
                                </InfoSectionContent>
                            </InfoSection>
                            <InfoSection>
                                <InfoSectionTitle>{t("port")}</InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard
                                        text={resource.proxyPort!.toString()}
                                        isLink={false}
                                    />
                                </InfoSectionContent>
                            </InfoSection>
                            {/* {build == "oss" && (
                                <InfoSection>
                                    <InfoSectionTitle>
                                        {t("externalProxyEnabled")}
                                    </InfoSectionTitle>
                                    <InfoSectionContent>
                                        <span>
                                            {resource.enableProxy
                                                ? t("enabled")
                                                : t("disabled")}
                                        </span>
                                    </InfoSectionContent>
                                </InfoSection>
                            )} */}
                        </>
                    )}
                    <InfoSection>
                        <InfoSectionTitle>{t("visibility")}</InfoSectionTitle>
                        <InfoSectionContent>
                            <span>
                                {resource.enabled
                                    ? t("enabled")
                                    : t("disabled")}
                            </span>
                        </InfoSectionContent>
                    </InfoSection>

                    <InfoSection>
                        <InfoSectionContent>
                            <div className="flex flex-col gap-2">
                                <Select onValueChange={setSelectedOrg}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue
                                            placeholder={
                                                orgs.length === 0
                                                    ? "No organizations available"
                                                    : "Select target organization"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {orgs.map((org) => (
                                            <SelectItem key={org.orgId} value={org.orgId}>
                                                {org.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                                    <DialogTrigger asChild>
                                        <Button
                                            size="sm"
                                            onClick={handleMoveClick}
                                            disabled={!selectedOrg || isLoading || !moveImpact}
                                            variant="default"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                                    Moving...
                                                </>
                                            ) : (
                                                <>
                                                    <ArrowRight className="w-4 h-4 mr-2" />
                                                    Move Resource
                                                </>
                                            )}
                                        </Button>
                                    </DialogTrigger>

                                    <DialogContent className="max-h-[85vh] overflow-y-auto p-6">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                                                <ArrowRight className="w-5 h-5" />
                                                Move Resource to {selectedOrgName}?
                                            </DialogTitle>
                                            <DialogDescription>
                                                This will move <span className="font-medium">"{resource.name}"</span>
                                                from <span className="font-medium">{moveImpact?.currentOrgName || 'current organization'}</span>
                                                to <span className="font-medium">{moveImpact?.targetOrgName || selectedOrgName}</span>.
                                                Please review the impact below.
                                            </DialogDescription>
                                        </DialogHeader>

                                        <div className="space-y-6 mt-4">
                                            {warnings.length > 0 && (
                                                <Alert
                                                    variant={
                                                        warnings.some((w) => w.type === "danger") ? "destructive" : "default"
                                                    }
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <AlertTriangle className="h-5 w-5 mt-1" />
                                                        <div>
                                                            <AlertTitle className="font-semibold">Impact Summary</AlertTitle>
                                                            <AlertDescription>
                                                                <ul className="space-y-2 mt-2">
                                                                    {warnings.map((warning, idx) => (
                                                                        <li key={idx} className="flex items-start gap-2">
                                                                            <span
                                                                                className={`
                                                                                    ${warning.type === "warning"
                                                                                        ? "text-yellow-600"
                                                                                        : warning.type === "danger"
                                                                                            ? "text-red-600"
                                                                                            : "text-blue-600"}
                                                                                            `}
                                                                            >
                                                                                {warning.icon}
                                                                            </span>
                                                                            <span className="text-sm">{warning.message}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </AlertDescription>
                                                        </div>
                                                    </div>
                                                </Alert>
                                            )}

                                            {moveImpact && (
                                                <div className="rounded-lg border bg-yellow-100 border-yellow-200">
                                                    <Accordion type="single" collapsible>
                                                        <AccordionItem value="impact">
                                                            <AccordionTrigger className="px-4 py-3 text-yellow-900 font-medium flex items-center gap-2">
                                                                <AlertTriangle className="w-4 h-4" />
                                                                Detailed Impact
                                                            </AccordionTrigger>
                                                            <AccordionContent className="px-4 pb-4 space-y-4">
                                                                {moveImpact.impact.rolePermissions.count > 0 && (
                                                                    <div>
                                                                        <p className="text-sm font-medium text-yellow-800 mb-1">
                                                                            Roles that will lose access (
                                                                            {moveImpact.impact.rolePermissions.count}):
                                                                        </p>
                                                                        <ul className="text-sm text-yellow-700 ml-4 space-y-1">
                                                                            {moveImpact.impact.rolePermissions.details.map(
                                                                                (role, idx) => (
                                                                                    <li key={idx} className="flex items-start gap-2">
                                                                                        <span>•</span>
                                                                                        <span>{role.roleName}</span>
                                                                                    </li>
                                                                                )
                                                                            )}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {moveImpact.impact.userPermissions.count > 0 && (
                                                                    <div>
                                                                        <p className="text-sm font-medium text-yellow-800 mb-1">
                                                                            Users that will lose access (
                                                                            {moveImpact.impact.userPermissions.count}):
                                                                        </p>
                                                                        <ul className="text-sm text-yellow-700 ml-4 space-y-1">
                                                                            {moveImpact.impact.userPermissions.details.map(
                                                                                (user, idx) => (
                                                                                    <li key={idx} className="flex items-start gap-2">
                                                                                        <span>•</span>
                                                                                        <span>
                                                                                            {user.name || user.username}
                                                                                            {user.email && ` (${user.email})`}
                                                                                        </span>
                                                                                    </li>
                                                                                )
                                                                            )}
                                                                        </ul>
                                                                    </div>
                                                                )}

                                                                {moveImpact.impact.targetSites.count > 0 && (
                                                                    <div>
                                                                        <p className="text-sm font-medium text-yellow-900 mb-1">
                                                                            Target connections that will be disconnected (
                                                                            {moveImpact.impact.targetSites.count}):
                                                                        </p>
                                                                        <ul className="text-sm text-yellow-700 ml-4 space-y-1">
                                                                            {moveImpact.impact.targetSites.details.map((target, idx) => (
                                                                                <li key={idx} className="flex items-start gap-2">
                                                                                    <span>•</span>
                                                                                    <span>
                                                                                        {target.siteName} ({target.ip}:{target.port})
                                                                                    </span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                )}
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                </div>
                                            )}

                                            {/* Preserved Items */}
                                            <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                                <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                                                    <Check className="w-4 h-4" />
                                                    What will be preserved
                                                </h4>
                                                <ul className="text-sm space-y-1 text-green-700">
                                                    {preservedItems.map((item, idx) => (
                                                        <li key={idx} className="flex items-start gap-2">
                                                            <span>•</span>
                                                            <span>{item}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>

                                        {/* Sticky Footer */}
                                        <DialogFooter className="sticky -bottom-6 pb-4 bg-background border-t pt-3">
                                            <Button
                                                variant="outline"
                                                onClick={() => setShowConfirmDialog(false)}
                                                disabled={isLoading}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                variant="default"
                                                onClick={handleConfirmMove}
                                                disabled={isLoading}
                                            >
                                                {isLoading ? (
                                                    <>
                                                        <RotateCw className="w-4 h-4 animate-spin mr-2" />
                                                        Moving...
                                                    </>
                                                ) : (
                                                    "Confirm Move"
                                                )}
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>

                                </Dialog>
                            </div>
                        </InfoSectionContent>
                    </InfoSection>
                </InfoSections>
            </AlertDescription>
        </Alert>
    );
}