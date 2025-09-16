import { db } from "@server/db";
import { domains, orgDomains } from "@server/db";
import { eq, and } from "drizzle-orm";
import { subdomainSchema } from "@server/lib/schemas";
import { fromError } from "zod-validation-error";

type ValidatedHostname = {
    domainId: string;
    subdomain?: string | null;
    fullDomain: string;
    baseDomain: string;
    primary: boolean;
};

export type DomainValidationResult =
  | {
      success: true;
      data: ValidatedHostname;
    }
  | {
      success: false;
      error: string;
      data?: ValidatedHostname;
    };

/**
 * Validates a domain and constructs the full domain based on domain type and subdomain.
 * 
 * @param domainId - The ID of the domain to validate
 * @param orgId - The organization ID to check domain access
 * @param subdomain - Optional subdomain to append (for ns and wildcard domains)
 * @returns DomainValidationResult with success status and either fullDomain/subdomain or error message
 */
export async function validateAndConstructDomain(
    hostname: {
        domainId: string;
        subdomain?: string | null;
        baseDomain?: string;
        fullDomain?: string;
        primary: boolean;
    },
    orgId: string
): Promise<DomainValidationResult> {
    try {
        // Query domain with organization access check
        const [domainRes] = await db
            .select()
            .from(domains)
            .where(eq(domains.domainId, hostname.domainId))
            .leftJoin(
                orgDomains,
                and(eq(orgDomains.orgId, orgId), eq(orgDomains.domainId, hostname.domainId))
            );

        // Check if domain exists
        if (!domainRes || !domainRes.domains) {
            return {
                success: false,
                error: `Domain with ID ${hostname.domainId} not found`
            };
        }

        // Check if organization has access to domain
        if (domainRes.orgDomains && domainRes.orgDomains.orgId !== orgId) {
            return {
                success: false,
                error: `Organization does not have access to domain with ID ${hostname.domainId}`
            };
        }

        // Check if domain is verified
        if (!domainRes.domains.verified) {
            return {
                success: false,
                error: `Domain with ID ${hostname.domainId} is not verified`
            };
        }

        // Construct full domain based on domain type
        let fullDomain = "";
        let finalSubdomain = hostname.subdomain;

        if (domainRes.domains.type === "ns") {
            if (hostname.subdomain) {
                fullDomain = `${hostname.subdomain}.${domainRes.domains.baseDomain}`;
            } else {
                fullDomain = domainRes.domains.baseDomain;
            }
        } else if (domainRes.domains.type === "cname") {
            fullDomain = domainRes.domains.baseDomain;
            finalSubdomain = null; // CNAME domains don't use subdomains
        } else if (domainRes.domains.type === "wildcard") {
            if (hostname.subdomain !== undefined && hostname.subdomain !== null) {
                // Validate subdomain format for wildcard domains
                const parsedSubdomain = subdomainSchema.safeParse(hostname.subdomain);
                if (!parsedSubdomain.success) {
                    return {
                        success: false,
                        error: fromError(parsedSubdomain.error).toString()
                    };
                }
                fullDomain = `${hostname.subdomain}.${domainRes.domains.baseDomain}`;
            } else {
                fullDomain = domainRes.domains.baseDomain;
            }
        }

        // If the full domain equals the base domain, set subdomain to null
        if (fullDomain === domainRes.domains.baseDomain) {
            finalSubdomain = null;
        }

        // Convert to lowercase
        fullDomain = fullDomain.toLowerCase();

        return {
            success: true,
            data: {
                domainId: hostname.domainId,
                subdomain: finalSubdomain || null,
                fullDomain: fullDomain,
                baseDomain: domainRes.domains.baseDomain,
                primary: hostname.primary
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `An error occurred while validating domain: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}
