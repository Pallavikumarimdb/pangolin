import { useState } from "react";
import { Input } from "./ui/input";
import { Textarea } from "@app/components/ui/textarea";
import { Button } from "./ui/button";

type IPSet = {
    id: string;
    name: string;
    description?: string;
    ips: string[];
    createdAt: string;
    updatedAt: string;
};


export default function EditIPSetForm({
    ipSet,
    onSave,
    onCancel,
    loading,
    t
}: {
    ipSet: IPSet;
    onSave: (data: Partial<IPSet>) => void;
    onCancel: () => void;
    loading: boolean;
    t: (key: string) => string;
}) {
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

    const handleSave = () => {
        const ipArray = ips.filter(ip => ip.trim()).map(ip => ip.trim());
        onSave({
            name,
            description,
            ips: ipArray
        });
    };

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
                <label className="block text-sm font-medium mb-1">{t('ipAddresses')}</label>
                {ips.map((ip, index) => (
                    <div key={index} className="flex items-center space-x-2 mb-2">
                        <Input
                            value={ip}
                            onChange={(e) => handleIPChange(index, e.target.value)}
                            placeholder={t('singleIPAddressPlaceholder')}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleRemoveIP(index)}
                        >
                            {t('remove')}
                        </Button>
                    </div>
                ))}
                <Button type="button" variant="secondary" onClick={handleAddIP}>
                    {t('addIPAddress')}
                </Button>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                    {t('cancel')}
                </Button>
                <Button
                    onClick={handleSave}
                    loading={loading}
                    disabled={!name.trim() || ips.every(ip => !ip.trim())}
                >
                    {t('save')}
                </Button>
            </div>
        </div>
    );
}
