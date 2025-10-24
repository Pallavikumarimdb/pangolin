"use client";

import RemoteExitNodeContext from "@app/contexts/remoteExitNodeContext";
import { build } from "@server/build";
import { GetRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";
import { useContext } from "react";

export function useRemoteExitNodeContext() {
    if (build == "oss") {
         return {
            remoteExitNode: {} as GetRemoteExitNodeResponse,
            updateRemoteExitNode: () => {},
        };
    }
    const context = useContext(RemoteExitNodeContext);
    if (context === undefined) {
        throw new Error("useRemoteExitNodeContext must be used within a RemoteExitNodeProvider");
    }
    return context;
}
