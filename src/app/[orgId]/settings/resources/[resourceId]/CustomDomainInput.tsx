"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { toUnicode } from "punycode";

interface DomainOption {
    baseDomain: string;
    domainId: string;
}

interface CustomDomainInputProps {
    domainOptions: DomainOption[];
    selectedDomainId?: string;
    placeholder?: string;
    value: string;
    onChange?: (value: string, selectedDomainId: string) => void;
}

export default function CustomDomainInput({
    domainOptions,
    selectedDomainId,
    placeholder = "Subdomain",
    value: defaultValue,
    onChange
}: CustomDomainInputProps) {
    const [value, setValue] = React.useState(defaultValue);
    const [selectedDomain, setSelectedDomain] = React.useState<DomainOption>();

    React.useEffect(() => {
        if (domainOptions.length) {
            if (selectedDomainId) {
                const selectedDomainOption = domainOptions.find(
                    (option) => option.domainId === selectedDomainId
                );
                setSelectedDomain(selectedDomainOption || domainOptions[0]);
            } else {
                setSelectedDomain(domainOptions[0]);
            }
        }
    }, [domainOptions]);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedDomain) {
            return;
        }
        const newValue = event.target.value;
        setValue(newValue);
        if (onChange) {
            onChange(newValue, selectedDomain.domainId);
        }
    };

    const handleDomainChange = (domainId: string) => {
        const newSelectedDomain =
            domainOptions.find((option) => option.domainId === domainId) ||
            domainOptions[0];
        setSelectedDomain(newSelectedDomain);
        if (onChange) {
            onChange(value, newSelectedDomain.domainId);
        }
    };

    return (
        <div className="w-full">
            <div className="flex">
                <Input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={handleInputChange}
                    className="w-1/2 mr-1 text-right"
                />
                <Select
                    onValueChange={handleDomainChange}
                    value={selectedDomain?.domainId}
                    defaultValue={selectedDomain?.domainId}
                >
                    <SelectTrigger className="w-1/2 pr-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {domainOptions.map((option) => (
                            <SelectItem
                                key={option.domainId}
                                value={option.domainId}
                            >
                                .{toUnicode(option.baseDomain)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
