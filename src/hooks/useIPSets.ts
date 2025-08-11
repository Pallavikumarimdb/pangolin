import { useState, useEffect, useCallback } from 'react';
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api/formatAxiosError";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { IPSet } from '@app/components/ipsets/IPSetManager';

interface UseIPSetsOptions {
    orgId: string;
    t: (key: string) => string;
    onError?: (error: any) => void;
}

interface UseIPSetsReturn {
    ipSets: IPSet[];
    loading: boolean;
    fetchIPSets: () => Promise<void>;
    createIPSet: (data: { name: string; description?: string; ips: string[] }) => Promise<boolean>;
    updateIPSet: (ipSetId: string, data: Partial<IPSet>) => Promise<boolean>;
    deleteIPSet: (ipSetId: string) => Promise<boolean>;
    getIPSetById: (id: string) => IPSet | undefined;
    getIPSetByName: (name: string) => IPSet | undefined;
}

export default function useIPSets({ orgId, t, onError }: UseIPSetsOptions): UseIPSetsReturn {
    const api = createApiClient(useEnvContext());
    const [ipSets, setIPSets] = useState<IPSet[]>([]);
    const [loading, setLoading] = useState(false);

    const handleError = useCallback((error: any, defaultMessage: string) => {
        console.error(error);
        const errorMessage = formatAxiosError(error, defaultMessage);
        toast({
            variant: "destructive",
            title: t('error'),
            description: errorMessage
        });
        onError?.(error);
    }, [t, onError]);

    const fetchIPSets = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/org/${orgId}/ip-sets`);
            if (res.status === 200) {
                setIPSets(res.data.data.ipSets);
            }
        } catch (err) {
            handleError(err, t('ipSetErrorFetch'));
        } finally {
            setLoading(false);
        }
    }, [orgId, api, t, handleError]);

    const createIPSet = useCallback(async (data: { name: string; description?: string; ips: string[] }): Promise<boolean> => {
        try {
            setLoading(true);
            const res = await api.post(`/org/${orgId}/ip-sets`, data);
            if (res.status === 201) {
                await fetchIPSets();
                toast({
                    title: t('ipSetCreated'),
                    description: t('ipSetCreatedDescription')
                });
                return true;
            }
            return false;
        } catch (err) {
            handleError(err, t('ipSetErrorCreate'));
            return false;
        } finally {
            setLoading(false);
        }
    }, [orgId, api, t, handleError, fetchIPSets]);

    const updateIPSet = useCallback(async (ipSetId: string, data: Partial<IPSet>): Promise<boolean> => {
        try {
            setLoading(true);
            const res = await api.put(`/org/${orgId}/ip-sets/${ipSetId}`, data);
            if (res.status === 200) {
                await fetchIPSets();
                toast({
                    title: t('ipSetUpdated'),
                    description: t('ipSetUpdatedDescription')
                });
                return true;
            }
            return false;
        } catch (err) {
            handleError(err, t('ipSetErrorUpdate'));
            return false;
        } finally {
            setLoading(false);
        }
    }, [orgId, api, t, handleError, fetchIPSets]);

    const deleteIPSet = useCallback(async (ipSetId: string): Promise<boolean> => {
        try {
            setLoading(true);
            const res = await api.delete(`/org/${orgId}/ip-sets/${ipSetId}`);
            if (res.status === 200) {
                await fetchIPSets();
                toast({
                    title: t('ipSetDeleted'),
                    description: t('ipSetDeletedDescription')
                });
                return true;
            }
            return false;
        } catch (err) {
            handleError(err, t('ipSetErrorDelete'));
            return false;
        } finally {
            setLoading(false);
        }
    }, [orgId, api, t, handleError, fetchIPSets]);

    const getIPSetById = useCallback((id: string): IPSet | undefined => {
        return ipSets.find(ipSet => ipSet.id === id);
    }, [ipSets]);

    const getIPSetByName = useCallback((name: string): IPSet | undefined => {
        return ipSets.find(ipSet => ipSet.name === name);
    }, [ipSets]);

    useEffect(() => {
        if (orgId) {
            fetchIPSets();
        }
    }, [orgId, fetchIPSets]);

    return {
        ipSets,
        loading,
        fetchIPSets,
        createIPSet,
        updateIPSet,
        deleteIPSet,
        getIPSetById,
        getIPSetByName
    };
}