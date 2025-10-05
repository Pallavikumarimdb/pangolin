
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface TargetConfig {
    method?: string | null;
    ip?: string;
    port?: number;
}

interface TargetModalProps {
    value: TargetConfig;
    onChange: (config: TargetConfig) => void;
    trigger: React.ReactNode;
    showMethod?: boolean;
}

export function TargetModal({ 
    value, 
    onChange, 
    trigger, 
    showMethod = true 
}: TargetModalProps) {
    const [open, setOpen] = useState(false);
    const [config, setConfig] = useState<TargetConfig>(value);

    const handleSave = () => {
        onChange(config);
        setOpen(false);
    };

    const parseHostTarget = (input: string) => {
        const protocolMatch = input.match(/^(https?|h2c):\/\//);
        const protocol = protocolMatch ? protocolMatch[1] : null;
        const withoutProtocol = input.replace(/^(https?|h2c):\/\//, '');
        
        const portMatch = withoutProtocol.match(/:(\d+)(?:\/|$)/);
        const port = portMatch ? parseInt(portMatch[1], 10) : null;
        const host = withoutProtocol.replace(/:\d+(?:\/|$)/, '').replace(/\/$/, '');
        
        return { protocol, host, port };
    };

    const handleHostChange = (input: string) => {
        const trimmed = input.trim();
        const hasProtocol = /^(https?|h2c):\/\//.test(trimmed);
        const hasPort = /:\d+(?:\/|$)/.test(trimmed);

        if (hasProtocol || hasPort) {
            const parsed = parseHostTarget(trimmed);
            setConfig({
                ...config,
                ...(hasProtocol && parsed.protocol ? { method: parsed.protocol } : {}),
                ip: parsed.host,
                ...(hasPort && parsed.port ? { port: parsed.port } : {})
            });
        } else {
            setConfig({ ...config, ip: trimmed });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Configure Target</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {showMethod && (
                        <div className="grid gap-2">
                            <Label htmlFor="method">Method</Label>
                            <Select
                                value={config.method || "http"}
                                onValueChange={(value) =>
                                    setConfig({ ...config, method: value })
                                }
                            >
                                <SelectTrigger id="method">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="http">http</SelectItem>
                                    <SelectItem value="https">https</SelectItem>
                                    <SelectItem value="h2c">h2c</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="host">IP Address / Hostname</Label>
                        <Input
                            id="host"
                            placeholder="e.g., 192.168.1.1 or example.com"
                            value={config.ip || ""}
                            onChange={(e) => setConfig({ ...config, ip: e.target.value })}
                            onBlur={(e) => handleHostChange(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            You can also paste: http://example.com:8080
                        </p>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="port">Port</Label>
                        <Input
                            id="port"
                            type="number"
                            placeholder="e.g., 8080"
                            value={config.port || ""}
                            onChange={(e) =>
                                setConfig({
                                    ...config,
                                    port: parseInt(e.target.value, 10) || undefined
                                })
                            }
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>Save</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}