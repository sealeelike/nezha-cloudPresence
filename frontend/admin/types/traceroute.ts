export interface TracerouteTask {
    id: number
    created_at: string
    updated_at: string
    name: string
    source_server_id: number
    target_server_id: number
    target_addr: string
    protocol: string
    max_hops: number
    scheduler: string
    enabled: boolean
}

export interface TracerouteTaskForm {
    name: string
    source_server_id: number
    target_server_id: number
    target_addr: string
    protocol: string
    max_hops: number
    scheduler: string
    enabled: boolean
}

export interface TracerouteResult {
    id: number
    created_at: string
    task_id: number
    source_server_id: number
    target_addr: string
    total_delay: number
    hop_count: number
    successful: boolean
    error_msg?: string
}
