import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { IPSet } from './IPSetManager';
import EditIPSetForm from './EditIPSetForm';

interface EditIPSetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    ipSet: IPSet;
    onSave: (data: Partial<IPSet>) => Promise<void>;
    loading: boolean;
    t: (key: string) => string;
}

export default function EditIPSetDialog({ 
    open, 
    onOpenChange, 
    ipSet, 
    onSave, 
    loading, 
    t 
}: EditIPSetDialogProps) {
    const handleCancel = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('editIPSet')}</DialogTitle>
                    <DialogDescription>
                        {t('editIPSetDescription')}
                    </DialogDescription>
                </DialogHeader>
                <EditIPSetForm
                    ipSet={ipSet}
                    onSave={onSave}
                    onCancel={handleCancel}
                    loading={loading}
                    t={t}
                />
            </DialogContent>
        </Dialog>
    );
}