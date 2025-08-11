import React, { useState } from "react";
import { Input } from "@app/components/ui/input";
import { Textarea } from "@app/components/ui/textarea";
import { Button } from "@app/components/ui/button";
import { IPSet } from './IPSetManager';

interface EditIPSetFormProps {
    ipSet: IPSet;
    onSave: (data: Partial<IPSet>) => Promise<void>;
    onCancel: () => void;
    loading: boolean;
    t: (key: string) => string;
}

export default function EditIPSetForm({
    ipSet,
    onSave,
    onCancel,
    loading,
    t
}: EditIPSetFormProps) {
    const [name, setName] = useState(ipSet.name);
    const [description, setDescription] = useState(ipSet.description || "");
    const [ips, setIPs] = useState<string[]>(ipSet.ips);

    const handleIPChange = (index: number, value: string) => {
        const updated = [...ips];
        updated[index] = value;
        setIPs(updated);
    };

    const handleAddIP = () => {
        setIPs([...ips, ""]);
    };

    const handleRemoveIP = (index: number) => {
        setIPs(ips.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        const ipArray = ips.filter(ip => ip.trim()).map(ip => ip.trim());
        await onSave({
            name,
            description,
            ips: ipArray
        });
    };

    const isValid = name.trim() && ips.some(ip => ip.trim());

    return (
        <div className="space-y-4">
            {/* Name */}
            <div>
                <label className="block text-sm font-medium mb-1">{t('name')}</label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('ipSetNamePlaceholder')}
                />
            </div>
            
            {/* Description */}
            <div>
                <label className="block text-sm font-medium mb-1">
                    {t('description')} ({t('optional')})
                </label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('ipSetDescriptionPlaceholder')}
                    rows={2}
                />
            </div>
            
            {/* IP List */}
            <div>
                <label className="block text-sm font-medium mb-1">{t('addipaddress')}</label>
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
            </div>
            
            {/* Actions */}
            <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {t('cancel')}
                </Button>
                <Button
                    onClick={handleSave}
                    loading={loading}
                    disabled={!isValid || loading}
                >
                    {t('save')}
                </Button>
            </div>
        </div>
    );
}