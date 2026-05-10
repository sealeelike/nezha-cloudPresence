/**
 * GlobalMap.tsx — 3D Globe + 2D 展开图双模式
 *
 * 依赖：react-globe.gl, leaflet, react-leaflet
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { countryCoordinates } from "@/lib/geo-limit";
import { cn } from "@/lib/utils";
import type { NezhaServer } from "@/types/nezha-api";
import Globe from "react-globe.gl";
import {
	MapContainer,
	TileLayer,
	CircleMarker,
	Polyline,
	Tooltip,
	Marker,
	useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchTracerouteMap, type TracerouteResult } from "@/api/traceroute";

// 禁用 Leaflet 交互元素的点击 focus 边框
if (typeof document !== "undefined" && !document.getElementById("route-style")) {
	const style = document.createElement("style");
	style.id = "route-style";
	style.textContent = `
		.leaflet-interactive:focus { outline: none !important; }
		.route-hit { cursor: pointer; }
	`;
	document.head.appendChild(style);
}

const ROUTE_COLORS = [
	"#3b82f6", "#ef4444", "#10b981", "#f59e0b",
	"#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
];

interface ArcData {
	startLat: number;
	startLng: number;
	endLat: number;
	endLng: number;
	color: string;
	label: string;
}

// 大圆弧插值：在两点间生成 n+1 个中间点
function greatCirclePoints(
	start: [number, number],
	end: [number, number],
	n: number,
): [number, number][] {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const toDeg = (r: number) => (r * 180) / Math.PI;

	const lat1 = toRad(start[0]);
	const lng1 = toRad(start[1]);
	const lat2 = toRad(end[0]);
	const lng2 = toRad(end[1]);

	const d =
		2 *
		Math.asin(
			Math.sqrt(
				Math.sin((lat2 - lat1) / 2) ** 2 +
					Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
			),
		);

	if (d < 0.0001) return [start, end];

	const pts: [number, number][] = [];
	for (let i = 0; i <= n; i++) {
		const f = i / n;
		const A = Math.sin((1 - f) * d) / Math.sin(d);
		const B = Math.sin(f * d) / Math.sin(d);
		const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
		const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
		const z = A * Math.sin(lat1) + B * Math.sin(lat2);
		pts.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
	}
	return pts;
}

// 让相邻点的经度"连续"：如果 dLng > 180，给第二个点加/减 360
// 这样画 polyline 就会走短路径（过太平洋而非横跨欧亚）
function continuousLng(points: [number, number][]): [number, number][] {
	if (points.length < 2) return points;
	const out: [number, number][] = [points[0]];
	let offset = 0;
	for (let i = 1; i < points.length; i++) {
		const prev = out[i - 1];
		const cur: [number, number] = [points[i][0], points[i][1] + offset];
		const dLng = cur[1] - prev[1];
		if (dLng > 180) {
			offset -= 360;
			cur[1] -= 360;
		} else if (dLng < -180) {
			offset += 360;
			cur[1] += 360;
		}
		out.push(cur);
	}
	return out;
}

interface PointData {
	lat: number;
	lng: number;
	name: string;
	count: number;
	color: string;
	routeIdx?: number;
	cumulativeRtt?: number; // 到达该点（聚类末端跳）的累计 RTT
}

// 地图空白点击 → 解除锁定
function MapClickHandler({ onBlankClick }: { onBlankClick: () => void }) {
	useMapEvents({
		click: () => onBlankClick(),
	});
	return null;
}

export default function GlobalMap({
	serverList,
	now: _now,
}: {
	serverList: NezhaServer[];
	now: number;
}) {
	const { t } = useTranslation();
	const [routes, setRoutes] = useState<TracerouteResult[]>([]);
	const [mode, setMode] = useState<"globe" | "flat">("flat");
	const [hoveredRoute, setHoveredRoute] = useState<number | null>(null);
	const [lockedRoutes, setLockedRoutes] = useState<Set<number>>(new Set());

	// 高亮集合：锁定 + hover 合并
	const activeSet = new Set<number>(lockedRoutes);
	if (hoveredRoute !== null) activeSet.add(hoveredRoute);
	const hasActive = activeSet.size > 0;
	const fetchedRef = useRef(false);
	const globeRef = useRef<unknown>(null);

	const customBackgroundImage =
		(window.CustomBackgroundImage as string) !== ""
			? window.CustomBackgroundImage
			: undefined;

	useEffect(() => {
		if (fetchedRef.current) return;
		fetchedRef.current = true;
		fetchTracerouteMap()
			.then((data) => setRoutes(data.results || []))
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (mode !== "globe") return;
		const globe = globeRef.current as { controls: () => { autoRotate: boolean } } | null;
		if (globe?.controls) {
			globe.controls().autoRotate = false;
		}
	}, [mode]);

	// 服务器节点
	const points: PointData[] = [];
	const grouped: Record<string, NezhaServer[]> = {};
	for (const s of serverList) {
		const code = s.country_code?.toUpperCase();
		if (!code) continue;
		if (!grouped[code]) grouped[code] = [];
		grouped[code].push(s);
	}
	for (const [code, servers] of Object.entries(grouped)) {
		const coords = countryCoordinates[code];
		if (!coords) continue;
		points.push({
			lat: coords.lat,
			lng: coords.lng,
			name: `${coords.name} (${servers.length})`,
			count: servers.length,
			color: "#22c55e",
		});
	}

	// 弧线数据
	const arcs: ArcData[] = [];
	routes.forEach((route, idx) => {
		const hopsWithGeo = route.hops.filter(
			(h) => h.geo && h.geo.latitude !== 0 && h.geo.longitude !== 0,
		);
		const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
		for (let i = 0; i < hopsWithGeo.length - 1; i++) {
			const from = hopsWithGeo[i].geo!;
			const to = hopsWithGeo[i + 1].geo!;
			if (from.latitude === to.latitude && from.longitude === to.longitude) continue;
			arcs.push({
				startLat: from.latitude,
				startLng: from.longitude,
				endLat: to.latitude,
				endLng: to.longitude,
				color,
				label: `→ ${route.target_addr} (${route.total_delay.toFixed(0)}ms)`,
			});
		}
	});

	// hop 节点：有 geo 用真实坐标；无 geo 在前后锚点之间按 rtt/index 插值
	// 相邻过近（< CLUSTER_THRESHOLD 度）的点合并，tooltip 列出全部
	const CLUSTER_THRESHOLD = 0.5; // 经纬度差阈值
	const hopPoints: PointData[] = [];

	const avgRtt = (h: { rtt1: number; rtt2: number; rtt3: number }): number => {
		const vs = [h.rtt1, h.rtt2, h.rtt3].filter((v) => v > 0);
		return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
	};

	routes.forEach((route, idx) => {
		const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
		const hops = route.hops;
		const n = hops.length;

		// 找所有 geo 锚点
		const anchorIdx: number[] = [];
		for (let i = 0; i < n; i++) {
			if (hops[i].geo && hops[i].geo.latitude !== 0) anchorIdx.push(i);
		}
		if (anchorIdx.length === 0) return;

		// 每个 hop 计算位置
		interface HopPos {
			lat: number;
			lng: number;
			label: string;
			hasGeo: boolean;
			rtt: number;
		}
		const hopPositions: HopPos[] = [];

		for (let i = 0; i < n; i++) {
			const h = hops[i];
			const rtt = avgRtt(h);

			if (h.geo && h.geo.latitude !== 0) {
				hopPositions.push({
					lat: h.geo.latitude,
					lng: h.geo.longitude,
					label: `#${h.hop_index} ${h.ip} · ${h.geo.city} · ${rtt > 0 ? rtt.toFixed(1) + "ms" : "timeout"}`,
					hasGeo: true,
					rtt,
				});
				continue;
			}

			// 无 geo：找前后锚点
			const prev = anchorIdx.filter((a) => a < i).pop();
			const next = anchorIdx.find((a) => a > i);
			if (prev === undefined || next === undefined) continue; // 开头/结尾孤立跳跳过

			const prevHop = hops[prev];
			const nextHop = hops[next];
			const prevRtt = avgRtt(prevHop);
			const nextRtt = avgRtt(nextHop);

			// 插值比例：优先用 rtt，否则用 index
			let t: number;
			if (rtt > 0 && nextRtt > prevRtt) {
				t = (rtt - prevRtt) / (nextRtt - prevRtt);
			} else {
				t = (i - prev) / (next - prev);
			}
			t = Math.max(0, Math.min(1, t));

			// 大圆弧插值到该比例位置
			const arc = greatCirclePoints(
				[prevHop.geo!.latitude, prevHop.geo!.longitude],
				[nextHop.geo!.latitude, nextHop.geo!.longitude],
				100,
			);
			const pos = arc[Math.round(t * (arc.length - 1))] || arc[arc.length - 1];

			hopPositions.push({
				lat: pos[0],
				lng: pos[1],
				label: `#${h.hop_index} ${h.ip || "timeout"} · ${rtt > 0 ? rtt.toFixed(1) + "ms" : "timeout"}`,
				hasGeo: false,
				rtt,
			});
		}

		// 聚类：合并距离过近的相邻点。聚类末端跳的 rtt 作为该点的累计延迟
		const clusters: {
			lat: number;
			lng: number;
			labels: string[];
			lastRtt: number;
		}[] = [];
		for (const hp of hopPositions) {
			const last = clusters[clusters.length - 1];
			if (
				last &&
				Math.abs(last.lat - hp.lat) < CLUSTER_THRESHOLD &&
				Math.abs(last.lng - hp.lng) < CLUSTER_THRESHOLD
			) {
				last.labels.push(hp.label);
				if (hp.rtt > 0) last.lastRtt = hp.rtt;
			} else {
				clusters.push({
					lat: hp.lat,
					lng: hp.lng,
					labels: [hp.label],
					lastRtt: hp.rtt,
				});
			}
		}

		clusters.forEach((c) => {
			hopPoints.push({
				lat: c.lat,
				lng: c.lng,
				name: c.labels.join("<br>"),
				count: c.labels.length,
				color,
				routeIdx: idx,
				cumulativeRtt: c.lastRtt,
			});
		});
	});

	const allPoints = [...points, ...hopPoints];
	const countryCount = Object.keys(grouped).length;

	const pointAltitude = useCallback((d: object) => {
		const p = d as PointData;
		return p.color === "#22c55e" ? 0.02 : 0.005;
	}, []);

	const pointRadius = useCallback((d: object) => {
		const p = d as PointData;
		return p.color === "#22c55e" ? 0.4 + Math.min(p.count, 5) * 0.15 : 0.2;
	}, []);

	// 2D 展开图的路径（大圆弧 + 连续经度，跨日期线走短路径）
	const flatPaths: {
		positions: [number, number][];
		color: string;
		label: string;
		arrowPos: [number, number];
		arrowAngle: number;
	}[] = [];
	routes.forEach((route, idx) => {
		const hopsWithGeo = route.hops.filter(
			(h) => h.geo && h.geo.latitude !== 0 && h.geo.longitude !== 0,
		);
		if (hopsWithGeo.length < 2) return;
		const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

		const rawHops: [number, number][] = hopsWithGeo.map(
			(h) => [h.geo!.latitude, h.geo!.longitude] as [number, number],
		);
		const continuous = continuousLng(rawHops);

		// 找最长 segment
		let maxDist = 0;
		let longestIdx = 0;
		for (let i = 0; i < continuous.length - 1; i++) {
			const dLat = continuous[i + 1][0] - continuous[i][0];
			const dLng = continuous[i + 1][1] - continuous[i][1];
			const dist = Math.sqrt(dLat * dLat + dLng * dLng);
			if (dist > maxDist) {
				maxDist = dist;
				longestIdx = i;
			}
		}

		// 最长 segment 的大圆弧中点和方向
		const arrowArc = greatCirclePoints(
			continuous[longestIdx],
			continuous[longestIdx + 1],
			20,
		);
		const mid = Math.floor(arrowArc.length / 2);
		const arrowPos: [number, number] = arrowArc[mid];
		const a = arrowArc[Math.max(0, mid - 1)];
		const b = arrowArc[Math.min(arrowArc.length - 1, mid + 1)];
		const dLat = b[0] - a[0];
		const dLng = b[1] - a[1];
		const arrowAngle = (Math.atan2(dLng, dLat) * 180) / Math.PI;

		// 渲染用的完整路径
		const allPoints: [number, number][] = [];
		for (let i = 0; i < continuous.length - 1; i++) {
			const arc = greatCirclePoints(continuous[i], continuous[i + 1], 30);
			if (i === 0) allPoints.push(...arc);
			else allPoints.push(...arc.slice(1));
		}
		const final = continuousLng(allPoints);

		flatPaths.push({
			positions: final,
			color,
			label: `→ ${route.target_addr} (${route.total_delay.toFixed(0)}ms)`,
			arrowPos,
			arrowAngle,
		});
	});

	return (
		<section
			className={cn("flex flex-col gap-4 mt-8", {
				"bg-card/70 rounded-lg p-4": customBackgroundImage,
			})}
		>
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium opacity-40">
					{t("map.Distributions")} {countryCount} {t("map.Regions")}
					{routes.length > 0 && ` · ${routes.length} Routes`}
				</p>
				<div className="flex gap-1">
					<button
						onClick={() => setMode("flat")}
						className={cn("px-2 py-1 text-xs rounded", mode === "flat" ? "bg-blue-600 text-white" : "bg-neutral-200 dark:bg-neutral-700")}
					>
						2D
					</button>
					<button
						onClick={() => setMode("globe")}
						className={cn("px-2 py-1 text-xs rounded", mode === "globe" ? "bg-blue-600 text-white" : "bg-neutral-200 dark:bg-neutral-700")}
					>
						3D
					</button>
				</div>
			</div>
			<div className="w-full rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700"
				style={{ background: "#0a0a1a" }}
			>
				{mode === "globe" ? (
					<div className="flex justify-center">
						<Globe
							ref={globeRef}
							width={800}
							height={500}
							backgroundColor="rgba(0,0,0,0)"
							globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
							atmosphereColor="#3b82f6"
							atmosphereAltitude={0.15}
							pointsData={allPoints}
							pointLat="lat"
							pointLng="lng"
							pointColor="color"
							pointAltitude={pointAltitude}
							pointRadius={pointRadius}
							pointLabel="name"
							arcsData={arcs}
							arcStartLat="startLat"
							arcStartLng="startLng"
							arcEndLat="endLat"
							arcEndLng="endLng"
							arcColor="color"
							arcDashLength={0.4}
							arcDashGap={0.2}
							arcDashAnimateTime={1500}
							arcStroke={0.5}
							arcLabel="label"
							arcAltitudeAutoScale={0.4}
						/>
					</div>
				) : (
					<MapContainer
						center={[20, 100]}
						zoom={2}
						minZoom={2}
						maxZoom={10}
						scrollWheelZoom={true}
						worldCopyJump={false}
						maxBounds={[[-85, -360], [85, 360]]}
						maxBoundsViscosity={1.0}
						style={{ height: "420px", width: "100%" }}
						attributionControl={false}
					>
						<MapClickHandler onBlankClick={() => setLockedRoutes(new Set())} />
						<TileLayer
							url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
							noWrap={false}
						/>

						{/* 服务器节点（3 份副本用于世界滚动） */}
						{[-360, 0, 360].map((offset) =>
							points.map((p) => (
								<CircleMarker
									key={`srv-${p.lat}-${p.lng}-${offset}`}
									center={[p.lat, p.lng + offset]}
									radius={6 + Math.min(p.count, 5)}
									pathOptions={{ color: "#22c55e", fillColor: "#16a34a", fillOpacity: 0.8, weight: 2 }}
								>
									<Tooltip direction="top" offset={[0, -8]}>
										<span className="text-xs">{p.name}</span>
									</Tooltip>
								</CircleMarker>
							)),
						)}

						{[-360, 0, 360].map((offset) =>
							flatPaths.map((fp, idx) => {
								const positions = fp.positions.map(
									([lat, lng]) => [lat, lng + offset] as LatLngExpression,
								);
								const dimmed = hasActive && !activeSet.has(idx);
								return (
									<Polyline
										key={`route-${idx}-${offset}`}
										positions={positions}
										pathOptions={{
											color: fp.color,
											weight: activeSet.has(idx) ? 3.5 : 2.5,
											opacity: dimmed ? 0.15 : 0.9,
										}}
									>
										<Tooltip sticky>
											<span className="text-xs">{fp.label}</span>
										</Tooltip>
									</Polyline>
								);
							}),
						)}

						{/* 激活路径（hover 或 locked）每个节点上方显示累计延迟 */}
						{hasActive &&
							[-360, 0, 360].map((offset) =>
								hopPoints
									.filter(
										(hp) =>
											hp.routeIdx !== undefined &&
											activeSet.has(hp.routeIdx) &&
											(hp.cumulativeRtt ?? 0) > 0,
									)
									.map((hp, hi) => {
										const icon = L.divIcon({
											className: "cum-rtt-label",
											html: `<div style="background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 3px; white-space: nowrap; border: 1px solid ${hp.color}; transform: translate(-50%, -100%);">${hp.cumulativeRtt!.toFixed(1)}ms</div>`,
											iconSize: [0, 0],
											iconAnchor: [0, 8],
										});
										return (
											<Marker
												key={`cum-${hi}-${offset}`}
												position={[hp.lat, hp.lng + offset]}
												icon={icon}
												interactive={false}
											/>
										);
									}),
							)}

						{/* 路径方向箭头（3 副本） */}
						{[-360, 0, 360].map((offset) =>
							flatPaths.map((fp, idx) => {
								const dimmed = hasActive && !activeSet.has(idx);
								const icon = L.divIcon({
									className: "route-arrow",
									html: `<div style="transform: rotate(${fp.arrowAngle}deg); opacity: ${dimmed ? 0.15 : 1}; color: ${fp.color}; font-size: 22px; line-height: 1; text-shadow: 0 0 3px rgba(0,0,0,0.8);">▲</div>`,
									iconSize: [22, 22],
									iconAnchor: [11, 11],
								});
								return (
									<Marker
										key={`arrow-${idx}-${offset}`}
										position={[fp.arrowPos[0], fp.arrowPos[1] + offset]}
										icon={icon}
										interactive={false}
									/>
								);
							}),
						)}

						{/* 不可见 hit area（鼠标容错区） */}
						{[-360, 0, 360].map((offset) =>
							flatPaths.map((fp, idx) => {
								const positions = fp.positions.map(
									([lat, lng]) => [lat, lng + offset] as LatLngExpression,
								);
								return (
									<Polyline
										key={`route-hit-${idx}-${offset}`}
										positions={positions}
										pathOptions={{
											color: fp.color,
											weight: 32,
											opacity: 0,
											className: "route-hit",
										}}
										interactive={true}
										eventHandlers={{
											mouseover: () => setHoveredRoute(idx),
											mouseout: () => setHoveredRoute(null),
											click: (e) => {
												L.DomEvent.stopPropagation(e);
												setLockedRoutes((prev) => {
													const next = new Set(prev);
													if (next.has(idx)) next.delete(idx);
													else next.add(idx);
													return next;
												});
											},
										}}
									>
										<Tooltip sticky>
											<span className="text-xs">{fp.label}</span>
										</Tooltip>
									</Polyline>
								);
							}),
						)}

						{/* Hop 节点（3 份副本） */}
						{[-360, 0, 360].map((offset) =>
							hopPoints.map((hp, idx) => {
								const dimmed =
									hasActive && (hp.routeIdx === undefined || !activeSet.has(hp.routeIdx));
								return (
									<CircleMarker
										key={`hop-${idx}-${offset}`}
										center={[hp.lat, hp.lng + offset]}
										radius={hp.count > 1 ? 4 + Math.min(hp.count, 4) : 3}
										pathOptions={{
											color: hp.color,
											fillColor: hp.color,
											fillOpacity: dimmed ? 0.15 : 1,
											opacity: dimmed ? 0.15 : 1,
											weight: 1,
										}}
									>
										<Tooltip direction="top" offset={[0, -4]}>
											<span
												className="text-xs"
												dangerouslySetInnerHTML={{ __html: hp.name }}
											/>
										</Tooltip>
									</CircleMarker>
								);
							}),
						)}
					</MapContainer>
				)}
			</div>
		</section>
	);
}
