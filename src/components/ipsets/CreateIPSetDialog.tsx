import React from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";

const createIPSetSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    description: z.string().optional(),
    ips: z.array(z.string()).min(1, "At least one IP is required")
});

interface CreateIPSetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (data: { name: string; description?: string; ips: string[] }) => Promise<void>;
    loading: boolean;
    t: (key: string) => string;
}

export default function CreateIPSetDialog({ 
    open, 
    onOpenChange, 
    onCreate, 
    loading, 
    t 
}: CreateIPSetDialogProps) {
    const form = useForm({
        resolver: zodResolver(createIPSetSchema),
        defaultValues: {
            name: "",
            description: "",
            ips: [""]
        }
    });

    const handleSubmit = async (data: z.infer<typeof createIPSetSchema>) => {
        // Filter out empty IPs
        const filteredIPs = data.ips.filter(ip => ip.trim()).map(ip => ip.trim());
        await onCreate({
            ...data,
            ips: filteredIPs
        });
        form.reset();
    };

    const handleCancel = () => {
        form.reset();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('createIPSet')}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('createIPSet')}</DialogTitle>
                    <DialogDescription>
                        {t('createIPSetDescription')}
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('name')}</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder={t('ipSetNamePlaceholder')} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('description')} ({t('optional')})</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} placeholder={t('ipSetDescriptionPlaceholder')} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="ips"
                            render={({ field }) => {
                                const ips: string[] = field.value || [];

                                const handleIPChange = (index: number, value: string) => {
                                    const updated = [...ips];
                                    updated[index] = value;
                                    field.onChange(updated);
                                };

                                const handleAddIP = () => {
                                    field.onChange([...ips, ""]);
                                };

                                const handleRemoveIP = (index: number) => {
                                    field.onChange(ips.filter((_, i) => i !== index));
                                };

                                return (
                                    <FormItem>
                                        <FormLabel>{t('ipAddresses')}</FormLabel>
                                        <div className="space-y-2">
                                            {ips.map((ip, index) => (
                                                <div key={index} className="flex items-center space-x-2">
                                                    <Input
                                                        value={ip}
                                                        onChange={(e) => handleIPChange(index, e.target.value)}
                                                        placeholder="192.168.1.1 or 192.168.1.0/24"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => handleRemoveIP(index)}
                                                        disabled={ips.length === 1}
                                                    >
                                                        {t('remove')}
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={handleAddIP}
                                            >
                                                {t('addipaddress')}
                                            </Button>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                );
                            }}
                        />

                        <div className="flex justify-end space-x-2">
                            <Button type="button" variant="outline" onClick={handleCancel}>
                                {t('cancel')}
                            </Button>
                            <Button type="submit" loading={loading}>
                                {t('create')}
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}