import { Globe, Hash, Shield } from "lucide-react";

interface TargetDisplayProps {
    value: {
        method?: string | null;
        ip?: string;
        port?: number;
    };
    showMethod?: boolean;
}

export function TargetDisplay({ value, showMethod = true }: TargetDisplayProps) {
    const { method, ip, port } = value;

    if (!ip && !port && !method) {
        return <span className="text-muted-foreground text-sm">Not configured</span>;
    }



    return (
        <div className="flex items-center gap-0 text-sm font-mono">
            {showMethod && method && (
                <span className="inline-flex items-center gap-1 font-medium">
                    {method === "https" && <Shield className="h-3 w-3 text-green-600 dark:text-green-400" />}
                    <span className={method === "https" ? "text-green-600 dark:text-green-400" : ""}>
                        {method}<span className="text-muted-foreground">://</span>
                    </span>
                </span>
            )}
            {ip && (
                <span className="inline-flex items-center font-medium">
                    {ip}
                    {port && <span className="text-muted-foreground">:</span>}
                </span>
            )}
            {port && (
                <span className="inline-flex items-center text-muted-foreground font-medium">
                    {port}
                </span>
            )}
        </div>
    );
}
