import { createTracerouteTask, updateTracerouteTask } from "@/api/traceroute"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { IconButton } from "@/components/xui/icon-button"
import { useServer } from "@/hooks/useServer"
import { TracerouteTask } from "@/types/traceroute"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { KeyedMutator } from "swr"
import { z } from "zod"

import { Combobox } from "./ui/combobox"

interface TracerouteCardProps {
    data?: TracerouteTask
    mutate: KeyedMutator<TracerouteTask[]>
}

const tracerouteFormSchema = z.object({
    name: z.string().min(1),
    source_server_id: z.coerce.number().int().min(1),
    target_server_id: z.coerce.number().int().min(0),
    target_addr: z.string(),
    protocol: z.string(),
    max_hops: z.coerce.number().int().min(1).max(64),
    scheduler: z.string(),
    enabled: z.boolean(),
})

export const TracerouteCard: React.FC<TracerouteCardProps> = ({ data, mutate }) => {
    const { t } = useTranslation()
    const form = useForm({
        resolver: zodResolver(tracerouteFormSchema) as any,
        defaultValues: data
            ? { ...data }
            : {
                  name: "",
                  source_server_id: 0,
                  target_server_id: 0,
                  target_addr: "",
                  protocol: "icmp",
                  max_hops: 30,
                  scheduler: "@every 10m",
                  enabled: true,
              },
        resetOptions: { keepDefaultValues: false },
    })

    const [open, setOpen] = useState(false)

    const onSubmit = async (values: any) => {
        try {
            data?.id
                ? await updateTracerouteTask(data.id, values)
                : await createTracerouteTask(values)
        } catch (e) {
            console.error(e)
            toast(t("Error"), { description: t("Results.UnExpectedError") })
            return
        }
        setOpen(false)
        await mutate()
        form.reset()
    }

    const { servers } = useServer()
    const serverList = servers?.map((s) => ({
        value: `${s.id}`,
        label: s.name,
    })) || [{ value: "", label: "" }]

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {data ? <IconButton variant="outline" icon="edit" /> : <IconButton icon="plus" />}
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <ScrollArea className="max-h-[calc(100dvh-5rem)] p-3">
                    <div className="items-center mx-1">
                        <DialogHeader>
                            <DialogTitle>
                                {data ? t("EditTraceroute") : t("CreateTraceroute")}
                            </DialogTitle>
                            <DialogDescription />
                        </DialogHeader>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2 my-2">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("Name")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="HK → Google DNS" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="source_server_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("SourceServer")}</FormLabel>
                                            <FormControl>
                                                <Combobox
                                                    placeholder="Search..."
                                                    options={serverList}
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value.toString()}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="target_addr"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("Target")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="8.8.8.8" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="target_server_id"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("TargetServer")} ({t("Optional")})</FormLabel>
                                            <FormControl>
                                                <Combobox
                                                    placeholder="Search..."
                                                    options={[{ value: "0", label: `— ${t("None")} —` }, ...serverList]}
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value.toString()}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="protocol"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("Protocol")}</FormLabel>
                                            <Select
                                                onValueChange={field.onChange}
                                                defaultValue={field.value}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="icmp">ICMP</SelectItem>
                                                    <SelectItem value="tcp">TCP</SelectItem>
                                                    <SelectItem value="udp">UDP</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="max_hops"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("MaxHops")}</FormLabel>
                                            <FormControl>
                                                <Input type="number" placeholder="30" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="scheduler"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("Scheduler")}</FormLabel>
                                            <FormControl>
                                                <Input placeholder="@every 10m" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="enabled"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center space-x-2">
                                            <FormControl>
                                                <div className="flex items-center gap-2">
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                    <Label className="text-sm">
                                                        {t("Enabled")}
                                                    </Label>
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter className="justify-end">
                                    <DialogClose asChild>
                                        <Button type="button" className="my-2" variant="secondary">
                                            {t("Close")}
                                        </Button>
                                    </DialogClose>
                                    <Button type="submit" className="my-2">
                                        {t("Submit")}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}
