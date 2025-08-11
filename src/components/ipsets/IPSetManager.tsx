import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, Plus } from "lucide-react";
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import CreateIPSetDialog from "./CreateIPSetDialog";
import ManageIPSetsDialog from "./ManageIPSetsDialog";
import EditIPSetDialog from "./EditIPSetDialog";

export type IPSet = {
    id: string;
    name: string;
    description?: string;
    ips: string[];
    createdAt: string;
    updatedAt: string;
};

interface IPSetManagerProps {
    orgId: string;
    t: (key: string) => string;
    onIPSetsChange?: (ipSets: IPSet[]) => void;
}

export default function IPSetManager({ orgId, t, onIPSetsChange }: IPSetManagerProps) {
    const api = createApiClient(useEnvContext());
    const [ipSets, setIPSets] = useState<IPSet[]>([]);
    const [loading, setLoading] = useState(false);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [manageDialogOpen, setManageDialogOpen] = useState(false);
    const [ipSetToEdit, setIPSetToEdit] = useState<IPSet | null>(null);

    const fetchIPSets = async () => {
        try {
            const res = await api.get(`/org/${orgId}/ip-sets`);
            if (res.status === 200) {
                const fetchedIPSets = res.data.data.ipSets;
                setIPSets(fetchedIPSets);
                onIPSetsChange?.(fetchedIPSets);
            }
        } catch (err) {
            console.error('Failed to fetch IP sets:', err);
            toast({
                variant: "destructive",
                title: t('ipSetErrorFetch'),
                description: formatAxiosError(err, t('ipSetErrorFetchDescription'))
            });
        }
    };

    useEffect(() => {
        fetchIPSets();
    }, [orgId]);

    const handleCreateIPSet = async (data: { name: string; description?: string; ips: string[] }) => {
        try {
            setLoading(true);
            const res = await api.post(`/org/${orgId}/ip-sets`, data);
            if (res.status === 201) {
                await fetchIPSets();
                toast({
                    title: t('ipSetCreated'),
                    description: t('ipSetCreatedDescription')
                });
                setCreateDialogOpen(false);
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t('ipSetErrorCreate'),
                description: formatAxiosError(err, t('ipSetErrorCreateDescription'))
            });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateIPSet = async (ipSetId: string, data: Partial<IPSet>) => {
        try {
            setLoading(true);
            const res = await api.put(`/org/${orgId}/ip-sets/${ipSetId}`, data);
            if (res.status === 200) {
                await fetchIPSets();
                toast({
                    title: t('ipSetUpdated'),
                    description: t('ipSetUpdatedDescription')
                });
                setIPSetToEdit(null);
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t('ipSetErrorUpdate'),
                description: formatAxiosError(err, t('ipSetErrorUpdateDescription'))
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteIPSet = async (ipSetId: string) => {
        try {
            setLoading(true);
            const res = await api.delete(`/org/${orgId}/ip-sets/${ipSetId}`);
            if (res.status === 200) {
                await fetchIPSets();
                toast({
                    title: t('ipSetDeleted'),
                    description: t('ipSetDeletedDescription')
                });
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t('ipSetErrorDelete'),
                description: formatAxiosError(err, t('ipSetErrorDeleteDescription'))
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-between">
            <div>
                <h3 className="text-lg font-medium">{t('ipSets')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('ipSetsDescription')}
                </p>
            </div>
            <div className="flex space-x-2">
                <ManageIPSetsDialog
                    open={manageDialogOpen}
                    onOpenChange={setManageDialogOpen}
                    ipSets={ipSets}
                    onEdit={setIPSetToEdit}
                    onDelete={handleDeleteIPSet}
                    loading={loading}
                    t={t}
                />

                <CreateIPSetDialog
                    open={createDialogOpen}
                    onOpenChange={setCreateDialogOpen}
                    onCreate={handleCreateIPSet}
                    loading={loading}
                    t={t}
                />

                {ipSetToEdit && (
                    <EditIPSetDialog
                        open={!!ipSetToEdit}
                        onOpenChange={() => setIPSetToEdit(null)}
                        ipSet={ipSetToEdit}
                        onSave={(data) => handleUpdateIPSet(ipSetToEdit.id, data)}
                        loading={loading}
                        t={t}
                    />
                )}
            </div>
        </div>
    );
}