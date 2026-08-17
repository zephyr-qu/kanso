// 日历视图：把所有工作区任务按截止日期聚合到月历中，并支持拖拽改期。
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
import { queryKeys } from "@/hooks/query-keys";
import { useRealtime } from "@/hooks/use-realtime";
import { PageContent, PageHeader } from "@/components/kanso-ui";
import { toastManager } from "@/components/ui/toast";
import { normalizePriority, priorityColor } from "@/lib/priority";
import type { Board } from "@/types/board";
import type { Project } from "@/types/project";
import type { Workspace } from "@/types/workspace";

import type { CalendarTask } from "@/types/calendar";

type CalendarData = {
	tasks: CalendarTask[];
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage() {
	// 全局实时订阅：任何变更（含备份导入）失效日历聚合查询。
	useRealtime(undefined);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const today = new Date();
	const [cursor, setCursor] = useState(
		new Date(today.getFullYear(), today.getMonth(), 1),
	);
	const [dragOverDate, setDragOverDate] = useState<string | null>(null);

	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.calendar(),
		queryFn: async (): Promise<CalendarData> => {
			const workspaces = await api<Workspace[]>(buildPath("workspaces"));
			const projectGroups = await Promise.all(
				workspaces.map(async (workspace) => ({
					workspace,
					projects: await api<Project[]>(
						`/api/workspaces/${workspace.id}/projects`,
					),
				})),
			);
			const boards = await Promise.all(
				projectGroups.flatMap(({ workspace, projects }) =>
					projects.map(async (project) => ({
						workspace,
						project,
						board: await api<Board>(buildPath("project", { id: project.id })),
					})),
				),
			);
			return {
				tasks: boards.flatMap(({ workspace, project, board }) =>
					board.columns.flatMap((column) =>
						column.tasks.map((task) => ({
							...task,
							projectName: project.name,
							workspaceId: workspace.id,
						})),
					),
				),
			};
		},
	});

	const monthCells = useMemo(() => {
		const start = (cursor.getDay() + 6) % 7;
		const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
		const cells: Array<number | null> = Array(start).fill(null);
		for (let day = 1; day <= days; day += 1) cells.push(day);
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	}, [cursor]);

	const monthLabel = `${cursor.getFullYear()} 年 ${cursor.getMonth() + 1} 月`;
	const todayKey = formatDate(today);

	function moveMonth(offset: number) {
		setCursor((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
	}

	function tasksOn(date: string) {
		return (data?.tasks ?? []).filter((task) => task.dueDate?.slice(0, 10) === date);
	}

	async function reschedule(task: CalendarTask, date: string) {
		setDragOverDate(null);
		try {
			await api(buildPath("task", { id: task.id }), {
				method: "PATCH",
				body: JSON.stringify({ dueDate: date }),
			});
		} catch (error) {
			// W-7：改期失败给出反馈（裸 api() 的 rejection 此前无任何提示）。
			toastManager.add({
				title: "调整截止日期失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
			return;
		}
		await queryClient.invalidateQueries({ queryKey: queryKeys.calendar() });
		queryClient.invalidateQueries({ queryKey: queryKeys.board(task.projectId) });
		queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
	}

	return (
		<div className="flex h-full flex-col">
			<PageHeader>
				<div className="flex items-center gap-3">
					<h1 className="text-[17px] font-[650] tracking-tight">日历视图</h1>
					<span className="hidden text-xs text-muted-foreground sm:inline">
						拖拽任务调整截止日期
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<button type="button" aria-label="上个月" className="calendar-nav-button" onClick={() => moveMonth(-1)}>
						<ChevronLeftIcon className="size-4" />
					</button>
					<span className="min-w-[92px] text-center font-mono text-xs text-muted-foreground">
						{monthLabel}
					</span>
					<button type="button" aria-label="下个月" className="calendar-nav-button" onClick={() => moveMonth(1)}>
						<ChevronRightIcon className="size-4" />
					</button>
					<button type="button" className="calendar-today-button" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
						今天
					</button>
				</div>
			</PageHeader>

			<PageContent className="px-[30px] pb-11 pt-[26px]">
				{isLoading ? <p className="py-16 text-center text-sm text-muted-foreground">加载日历…</p> : null}
				{isError ? <p className="py-16 text-center text-sm text-destructive">加载日历失败</p> : null}
				{!isLoading && !isError ? (
					<>
						<div className="kanso-calendar-card calendar-grid overflow-hidden">
							{WEEKDAYS.map((weekday) => <div key={weekday} className="calendar-weekday">周{weekday}</div>)}
							{monthCells.map((day, index) => {
								if (day === null) return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" />;
								const date = formatDate(new Date(cursor.getFullYear(), cursor.getMonth(), day));
								const isToday = date === todayKey;
								const tasks = tasksOn(date);
								return (
									<div
										key={date}
										className={`calendar-cell ${isToday ? "calendar-cell-today" : ""} ${dragOverDate === date ? "calendar-cell-over" : ""}`}
										onDragOver={(event) => { event.preventDefault(); setDragOverDate(date); }}
										onDragLeave={() => setDragOverDate((current) => current === date ? null : current)}
										onDrop={(event) => {
											event.preventDefault();
										const taskId = event.dataTransfer.getData("text/plain");
										const task = data?.tasks.find((item) => item.id === taskId);
										if (task && task.dueDate?.slice(0, 10) !== date) void reschedule(task, date);
									}}
									>
										<span className={`calendar-day-number ${isToday ? "calendar-day-number-today" : ""}`}>{day}</span>
										<div className="flex min-h-0 flex-col gap-1">
											{tasks.slice(0, 3).map((task) => (
												<button
													key={task.id}
													type="button"
													draggable
													onDragStart={(event) => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; }}
													onClick={() => navigate(`/w/${task.workspaceId}/p/${task.projectId}/t/${task.id}`)}
													className="calendar-task"
													title={`${task.projectName} · ${task.title}`}
												>
													<span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: priorityColor(normalizePriority(task.priority)) }} />
													<span className="truncate">{task.title}</span>
												</button>
											))}
											{tasks.length > 3 ? <span className="px-1 text-[10px] text-muted-foreground">+{tasks.length - 3} 项任务</span> : null}
										</div>
									</div>
								);
							})}
						</div>
						<p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/70"><CalendarDaysIcon className="size-3" /> 点击任务查看详情 · 拖动任务改期</p>
					</>
				) : null}
			</PageContent>
		</div>
	);
}

function formatDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
