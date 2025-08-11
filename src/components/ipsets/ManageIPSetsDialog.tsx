import React from 'react';
import { Settings } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IPSet } from './IPSetManager';

interface ManageIPSetsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ipSets: IPSet[];
    onEdit: (ipSet: IPSet) => void;
    onDelete: (ipSetId: string) => Promise<void>;
    loading: boolean;
    t: (key: string) => string;
}

export default function ManageIPSetsDialog({ 
    open, 
    onOpenChange, 
    ipSets, 
    onEdit, 
    onDelete, 
    loading, 
    t 
}: ManageIPSetsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Settings className="mr-2 h-4 w-4" />
                    {t('manageIPSets')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('manageIPSets')}</DialogTitle>
                    <DialogDescription>
                        {t('manageIPSetsDescription')}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {ipSets.map((ipSet) => (
                        <div key={ipSet.id} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium">{ipSet.name}</h4>
                                <div className="flex space-x-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onEdit(ipSet)}
                                        disabled={loading}
                                    >
                                        {t('edit')}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => onDelete(ipSet.id)}
                                        disabled={loading}
                                    >
                                        {t('delete')}
                                    </Button>
                                </div>
                            </div>
                            {ipSet.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                    {ipSet.description}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-1">
                                {ipSet.ips.map((ip, index) => (
                                    <Badge key={index} variant="secondary">
                                        {ip}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    ))}
                    {ipSets.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                            {t('noIPSets')}
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}