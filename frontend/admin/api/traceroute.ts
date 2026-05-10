import { TracerouteTaskForm } from "@/types/traceroute"

import { FetcherMethod, fetcher } from "./api"

export const createTracerouteTask = async (data: TracerouteTaskForm): Promise<number> => {
    return fetcher<number>(FetcherMethod.POST, "/api/v1/traceroute/task", data)
}

export const updateTracerouteTask = async (id: number, data: TracerouteTaskForm): Promise<void> => {
    return fetcher<void>(FetcherMethod.PATCH, `/api/v1/traceroute/task/${id}`, data)
}

export const deleteTracerouteTask = async (id: number[]): Promise<void> => {
    return fetcher<void>(FetcherMethod.POST, "/api/v1/traceroute/batch-delete/task", id)
}

export const manualRunTracerouteTask = async (id: number): Promise<void> => {
    return fetcher<void>(FetcherMethod.POST, `/api/v1/traceroute/task/${id}/run`, null)
}
