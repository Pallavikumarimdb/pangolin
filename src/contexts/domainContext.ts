import { GetDomainResponse } from "@server/routers/domain/getDomain";
import { createContext } from "react";

interface DomainContextType {
    domain: GetDomainResponse;
    updateDomain: (updatedDomain: Partial<GetDomainResponse>) => void;
}

const DomainContext = createContext<DomainContextType | undefined>(undefined);

export default DomainContext;