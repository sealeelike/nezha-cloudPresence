import { swrFetcher } from "@/api/api"
import { deleteTracerouteTask, manualRunTracerouteTask } from "@/api/traceroute"
import { ActionButtonGroup } from "@/components/action-button-group"
import { HeaderButtonGroup } from "@/components/header-button-group"
import { TracerouteCard } from "@/components/traceroute"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { IconButton } from "@/components/xui/icon-button"
import { TracerouteTask } from "@/types/traceroute"
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import useSWR from "swr"

export default function TraceroutePage() {
    const { t } = useTranslation()
    const { data, mutate, error, isLoading } = useSWR<TracerouteTask[]>(
        "/api/v1/traceroute/task",
        swrFetcher,
    )

    useEffect(() => {
        if (error)
            toast(t("Error"), {
                description: t("Results.ErrorFetchingResource", { error: error.message }),
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [error])

    const handleManualRun = async (id: number) => {
        try {
            await manualRunTracerouteTask(id)
            toast(t("Success"), { description: t("TracerouteTriggered") })
        } catch (e: any) {
            toast(t("Error"), { description: e.message })
        }
    }

    const columns: ColumnDef<TracerouteTask>[] = [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                    }
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                />
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            header: "ID",
            accessorKey: "id",
        },
        {
            header: t("Name"),
            accessorKey: "name",
            cell: ({ row }) => (
                <div className="max-w-32 whitespace-normal break-words">{row.original.name}</div>
            ),
        },
        {
            header: t("SourceServer"),
            accessorKey: "source_server_id",
        },
        {
            header: t("Target"),
            accessorKey: "target_addr",
            cell: ({ row }) => (
                <div className="max-w-32 whitespace-normal break-words">
                    {row.original.target_addr}
                </div>
            ),
        },
        {
            header: t("Protocol"),
            accessorKey: "protocol",
            cell: ({ row }) => row.original.protocol.toUpperCase(),
        },
        {
            header: t("MaxHops"),
            accessorKey: "max_hops",
        },
        {
            header: t("Scheduler"),
            accessorKey: "scheduler",
        },
        {
            header: t("Status"),
            accessorKey: "enabled",
            cell: ({ row }) =>
                row.original.enabled ? (
                    <Badge variant="default">{t("Enabled")}</Badge>
                ) : (
                    <Badge variant="secondary">{t("Disabled")}</Badge>
                ),
        },
        {
            id: "actions",
            header: t("Actions"),
            cell: ({ row }) => {
                const task = row.original
                return (
                    <ActionButtonGroup
                        className="flex gap-2"
                        delete={{ fn: deleteTracerouteTask, id: task.id, mutate }}
                    >
                        <IconButton
                            variant="outline"
                            icon="play"
                            onClick={() => handleManualRun(task.id)}
                        />
                        <TracerouteCard mutate={mutate} data={task} />
                    </ActionButtonGroup>
                )
            },
        },
    ]

    const dataCache = useMemo(() => data ?? [], [data])

    const table = useReactTable({
        data: dataCache,
        columns,
        getCoreRowModel: getCoreRowModel(),
    })

    const selectedRows = table.getSelectedRowModel().rows

    return (
        <div className="px-3 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3 mt-6 mb-4">
                <h1 className="text-3xl font-bold tracking-tight">{t("Traceroute")}</h1>
                <HeaderButtonGroup
                    className="flex gap-2 flex-wrap shrink-0"
                    delete={{
                        fn: deleteTracerouteTask,
                        id: selectedRows.map((r) => r.original.id),
                        mutate,
                    }}
                >
                    <TracerouteCard mutate={mutate} />
                </HeaderButtonGroup>
            </div>

            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                                <TableHead key={header.id} className="text-sm">
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(
                                              header.column.columnDef.header,
                                              header.getContext(),
                                          )}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                {t("Loading")}...
                            </TableCell>
                        </TableRow>
                    ) : table.getRowModel().rows?.length ? (
                        table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id} className="text-xsm">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                {t("NoResults")}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
