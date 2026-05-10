export interface TracerouteHop {
	hop_index: number;
	ip: string;
	rtt1: number;
	rtt2: number;
	rtt3: number;
	loss: number;
	geo: {
		latitude: number;
		longitude: number;
		country_code: string;
		city: string;
	} | null;
}

export interface TracerouteResult {
	id: number;
	task_id: number;
	target_addr: string;
	total_delay: number;
	hop_count: number;
	successful: boolean;
	created_at: string;
	hops: TracerouteHop[];
}

export interface TracerouteMapData {
	results: TracerouteResult[];
}

export const fetchTracerouteMap = async (): Promise<TracerouteMapData> => {
	const response = await fetch("/api/v1/traceroute/map");
	const data = await response.json();
	if (data.error) {
		throw new Error(data.error);
	}
	return data.data;
};
