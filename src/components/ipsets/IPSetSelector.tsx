import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { IPSet } from './IPSetManager';

interface IPSetSelectorProps {
    ipSets: IPSet[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export default function IPSetSelector({
    ipSets,
    value,
    onValueChange,
    placeholder = "Select IP Set",
    disabled = false,
    className = "min-w-[200px]"
}: IPSetSelectorProps) {
    return (
        <div className={className}>
            <Select
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
            >
                <SelectTrigger>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {ipSets.map((ipSet) => (
                        <SelectItem key={ipSet.id} value={ipSet.id}>
                            {ipSet.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}