"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    AlertCircle,
    CheckCircle2,
    Building2,
    Zap,
    ArrowUpDown
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createApiClient, formatAxiosError } from "@/lib/api";
import { useEnvContext } from "@/hooks/useEnvContext";
import { toast } from "@/hooks/useToast";
import { ListDomainsResponse } from "@server/routers/domain/listDomains";
import { AxiosResponse } from "axios";
import { cn } from "@/lib/cn";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import { build } from "@server/build";
import { toUnicode } from "punycode";

type OrganizationDomain = {
    domainId: string;
    baseDomain: string;
    verified: boolean;
    type: "ns" | "cname" | "wildcard";
};

type AvailableOption = {
    domainNamespaceId: string;
    fullDomain: string;
    domainId: string;
};

type DomainOption = {
    id: string;
    domain: string;
    type: "organization" | "provided";
    verified?: boolean;
    domainType?: "ns" | "cname" | "wildcard";
    domainId?: string;
    domainNamespaceId?: string;
    subdomain?: string;
};

interface DomainPickerProps {
    orgId: string;
    cols?: number;
    onDomainChange?: (domainInfo: {
        domainId: string;
        domainNamespaceId?: string;
        type: "organization" | "provided";
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    }) => void;
}

export default function DomainPicker({
    orgId,
    cols,
    onDomainChange
}: DomainPickerProps) {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const t = useTranslations();

    const [userInput, setUserInput] = useState<string>("");
    const [selectedOption, setSelectedOption] = useState<DomainOption | null>(
        null
    );
    const [availableOptions, setAvailableOptions] = useState<AvailableOption[]>(
        []
    );
    const [isChecking, setIsChecking] = useState(false);
    const [organizationDomains, setOrganizationDomains] = useState<
        OrganizationDomain[]
    >([]);
    const [loadingDomains, setLoadingDomains] = useState(false);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [activeTab, setActiveTab] = useState<
        "all" | "organization" | "provided"
    >("all");
    const [providedDomainsShown, setProvidedDomainsShown] = useState(3);

    useEffect(() => {
        const loadOrganizationDomains = async () => {
            setLoadingDomains(true);
            try {
                const response = await api.get<
                    AxiosResponse<ListDomainsResponse>
                >(`/org/${orgId}/domains`);
                if (response.status === 200) {
                    const domains = response.data.data.domains
                        .filter(
                            (domain) =>
                                domain.type === "ns" ||
                                domain.type === "cname" ||
                                domain.type === "wildcard"
                        )
                        .map((domain) => ({
                            ...domain,
                            baseDomain: toUnicode(domain.baseDomain),
                            type: domain.type as "ns" | "cname" | "wildcard"
                        }));
                    setOrganizationDomains(domains);
                }
            } catch (error) {
                console.error("Failed to load organization domains:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to load organization domains"
                });
            } finally {
                setLoadingDomains(false);
            }
        };

        loadOrganizationDomains();
    }, [orgId, api]);

    // Generate domain options based on user input
    const generateDomainOptions = (): DomainOption[] => {
        const options: DomainOption[] = [];

        if (!userInput.trim()) return options;

        // Add organization domain options
        organizationDomains.forEach((orgDomain) => {
            if (orgDomain.type === "cname") {
                // For CNAME domains, check if the user input matches exactly
                if (
                    orgDomain.baseDomain.toLowerCase() ===
                    userInput.toLowerCase()
                ) {
                    options.push({
                        id: `org-${orgDomain.domainId}`,
                        domain: orgDomain.baseDomain,
                        type: "organization",
                        verified: orgDomain.verified,
                        domainType: "cname",
                        domainId: orgDomain.domainId
                    });
                }
            } else if (orgDomain.type === "ns") {
                // For NS domains, check if the user input could be a subdomain
                const userInputLower = userInput.toLowerCase();
                const baseDomainLower = orgDomain.baseDomain.toLowerCase();

                // Check if user input ends with the base domain
                if (userInputLower.endsWith(`.${baseDomainLower}`)) {
                    const subdomain = userInputLower.slice(
                        0,
                        -(baseDomainLower.length + 1)
                    );
                    options.push({
                        id: `org-${orgDomain.domainId}`,
                        domain: userInput,
                        type: "organization",
                        verified: orgDomain.verified,
                        domainType: "ns",
                        domainId: orgDomain.domainId,
                        subdomain: subdomain
                    });
                } else if (userInputLower === baseDomainLower) {
                    // Exact match for base domain
                    options.push({
                        id: `org-${orgDomain.domainId}`,
                        domain: orgDomain.baseDomain,
                        type: "organization",
                        verified: orgDomain.verified,
                        domainType: "ns",
                        domainId: orgDomain.domainId
                    });
                }
            } else if (orgDomain.type === "wildcard") {
                // For wildcard domains, allow the base domain or multiple levels up
                const userInputLower = userInput.toLowerCase();
                const baseDomainLower = orgDomain.baseDomain.toLowerCase();

                // Check if user input is exactly the base domain
                if (userInputLower === baseDomainLower) {
                    options.push({
                        id: `org-${orgDomain.domainId}`,
                        domain: orgDomain.baseDomain,
                        type: "organization",
                        verified: orgDomain.verified,
                        domainType: "wildcard",
                        domainId: orgDomain.domainId
                    });
                }
                // Check if user input ends with the base domain (allows multiple level subdomains)
                else if (userInputLower.endsWith(`.${baseDomainLower}`)) {
                    const subdomain = userInputLower.slice(
                        0,
                        -(baseDomainLower.length + 1)
                    );
                    // Allow multiple levels (subdomain can contain dots)
                    options.push({
                        id: `org-${orgDomain.domainId}`,
                        domain: userInput,
                        type: "organization",
                        verified: orgDomain.verified,
                        domainType: "wildcard",
                        domainId: orgDomain.domainId,
                        subdomain: subdomain
                    });
                }
            }
        });

        // Add provided domain options (always try to match provided domains)
        availableOptions.forEach((option) => {
            options.push({
                id: `provided-${option.domainNamespaceId}`,
                domain: option.fullDomain,
                type: "provided",
                domainNamespaceId: option.domainNamespaceId,
                domainId: option.domainId
            });
        });

        // Sort options
        return options.sort((a, b) => {
            const comparison = a.domain.localeCompare(b.domain);
            return sortOrder === "asc" ? comparison : -comparison;
        });
    };

    const domainOptions = generateDomainOptions();

    // Filter options based on active tab
    const filteredOptions = domainOptions.filter((option) => {
        if (activeTab === "all") return true;
        return option.type === activeTab;
    });

    // Separate organization and provided options for pagination
    const organizationOptions = filteredOptions.filter(
        (opt) => opt.type === "organization"
    );
    const allProvidedOptions = filteredOptions.filter(
        (opt) => opt.type === "provided"
    );
    const providedOptions = allProvidedOptions.slice(0, providedDomainsShown);
    const hasMoreProvided = allProvidedOptions.length > providedDomainsShown;

    // Handle option selection
    const handleOptionSelect = (option: DomainOption) => {
        setSelectedOption(option);

        if (option.type === "organization") {
            if (option.domainType === "cname") {
                onDomainChange?.({
                    domainId: option.domainId!,
                    type: "organization",
                    subdomain: undefined,
                    fullDomain: option.domain,
                    baseDomain: option.domain
                });
            } else if (option.domainType === "ns") {
                const subdomain = option.subdomain || "";
                onDomainChange?.({
                    domainId: option.domainId!,
                    type: "organization",
                    subdomain: subdomain || undefined,
                    fullDomain: option.domain,
                    baseDomain: option.domain
                });
            } else if (option.domainType === "wildcard") {
                onDomainChange?.({
                    domainId: option.domainId!,
                    type: "organization",
                    subdomain: option.subdomain || undefined,
                    fullDomain: option.domain,
                    baseDomain: option.subdomain
                        ? option.domain.split(".").slice(1).join(".")
                        : option.domain
                });
            }
        } else if (option.type === "provided") {
            // Extract subdomain from full domain
            const parts = option.domain.split(".");
            const subdomain = parts[0];
            const baseDomain = parts.slice(1).join(".");
            onDomainChange?.({
                domainId: option.domainId!,
                domainNamespaceId: option.domainNamespaceId,
                type: "provided",
                subdomain: subdomain,
                fullDomain: option.domain,
                baseDomain: baseDomain
            });
        }
    };

    const isValidDomainCharacter = (char: string) => {
        // Allow Unicode letters, numbers, hyphens, and periods
        return /[\p{L}\p{N}.-]/u.test(char);
    };

    return (
        <div className="space-y-6">
            {/* Domain Input */}
            <div className="space-y-2">
                <Label htmlFor="domain-input">
                    {t("domainPickerEnterDomain")}
                </Label>
                <Input
                    id="domain-input"
                    value={userInput}
                    className="max-w-xl"
                    onChange={(e) => {
                        const rawInput = e.target.value;

                        // Allow Unicode characters but still filter out invalid ones
                        const validInput = rawInput
                            .split('')
                            .filter(char => isValidDomainCharacter(char))
                            .join('');

                        setUserInput(validInput);
                        // Clear selection when input changes
                        setSelectedOption(null);
                    }}
                />
                <p className="text-sm text-muted-foreground">
                    {build === "saas"
                        ? t("domainPickerDescriptionSaas")
                        : t("domainPickerDescription")}
                </p>
            </div>

            {/* Tabs and Sort Toggle */}
            {build === "saas" && (
                <div className="flex justify-between items-center">
                    <Tabs
                        value={activeTab}
                        onValueChange={(value) =>
                            setActiveTab(
                                value as "all" | "organization" | "provided"
                            )
                        }
                    >
                        <TabsList>
                            <TabsTrigger value="all">
                                {t("domainPickerTabAll")}
                            </TabsTrigger>
                            <TabsTrigger value="organization">
                                {t("domainPickerTabOrganization")}
                            </TabsTrigger>
                            {build == "saas" && (
                                <TabsTrigger value="provided">
                                    {t("domainPickerTabProvided")}
                                </TabsTrigger>
                            )}
                        </TabsList>
                    </Tabs>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                        }
                    >
                        <ArrowUpDown className="h-4 w-4 mr-2" />
                        {sortOrder === "asc"
                            ? t("domainPickerSortAsc")
                            : t("domainPickerSortDesc")}
                    </Button>
                </div>
            )}

            {/* Loading State */}
            {isChecking && (
                <div className="flex items-center justify-center p-8">
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span>{t("domainPickerCheckingAvailability")}</span>
                    </div>
                </div>
            )}

            {/* No Options */}
            {!isChecking &&
                filteredOptions.length === 0 &&
                userInput.trim() && (
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {t("domainPickerNoMatchingDomains")}
                        </AlertDescription>
                    </Alert>
                )}

            {/* Domain Options */}
            {!isChecking && filteredOptions.length > 0 && (
                <div className="space-y-4">
                    {/* Organization Domains */}
                    {organizationOptions.length > 0 && (
                        <div className="space-y-3">
                            {build !== "oss" && (
                                <div className="flex items-center space-x-2">
                                    <Building2 className="h-4 w-4" />
                                    <h4 className="text-sm font-medium">
                                        {t("domainPickerOrganizationDomains")}
                                    </h4>
                                </div>
                            )}
                            <div className={`grid gap-2 ${cols ? `grid-cols-${cols}` : 'grid-cols-1 sm:grid-cols-2'}`}>
                                {organizationOptions.map((option) => (
                                    <div
                                        key={option.id}
                                        className={cn(
                                            "transition-all p-3 rounded-lg border",
                                            selectedOption?.id === option.id
                                                ? "border-primary bg-primary/10"
                                                : "border-input hover:bg-accent",
                                            option.verified
                                                ? "cursor-pointer"
                                                : "cursor-not-allowed opacity-60"
                                        )}
                                        onClick={() =>
                                            option.verified &&
                                            handleOptionSelect(option)
                                        }
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center space-x-2">
                                                    <p className="font-mono text-sm">
                                                        {option.domain}
                                                    </p>
                                                    {/* <Badge */}
                                                    {/*     variant={ */}
                                                    {/*         option.domainType === */}
                                                    {/*         "ns" */}
                                                    {/*             ? "default" */}
                                                    {/*             : "secondary" */}
                                                    {/*     } */}
                                                    {/* > */}
                                                    {/*     {option.domainType} */}
                                                    {/* </Badge> */}
                                                    {option.verified ? (
                                                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                                                    ) : (
                                                        <AlertCircle className="h-3 w-3 text-yellow-500" />
                                                    )}
                                                </div>
                                                {option.subdomain && (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {t(
                                                            "domainPickerSubdomain",
                                                            {
                                                                subdomain:
                                                                    option.subdomain
                                                            }
                                                        )}
                                                    </p>
                                                )}
                                                {!option.verified && (
                                                    <p className="text-xs text-yellow-600 mt-1">
                                                        Domain is unverified
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Provided Domains */}
                    {providedOptions.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <Zap className="h-4 w-4" />
                                <div className="text-sm font-medium">
                                    {t("domainPickerProvidedDomains")}
                                </div>
                            </div>
                            <div className={`grid gap-2 ${cols ? `grid-cols-${cols}` : 'grid-cols-1 sm:grid-cols-2'}`}>
                                {providedOptions.map((option) => (
                                    <div
                                        key={option.id}
                                        className={cn(
                                            "transition-all p-3 rounded-lg border",
                                            selectedOption?.id === option.id
                                                ? "border-primary bg-primary/10"
                                                : "border-input",
                                            "cursor-pointer hover:bg-accent"
                                        )}
                                        onClick={() =>
                                            handleOptionSelect(option)
                                        }
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-mono text-sm">
                                                    {option.domain}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t(
                                                        "domainPickerNamespace",
                                                        {
                                                            namespace:
                                                                option.domainNamespaceId as string
                                                        }
                                                    )}
                                                </p>
                                            </div>
                                            {selectedOption?.id ===
                                                option.id && (
                                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                                )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {hasMoreProvided && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setProvidedDomainsShown(
                                            (prev) => prev + 3
                                        )
                                    }
                                    className="w-full"
                                >
                                    {t("domainPickerShowMore")}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);

        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}
