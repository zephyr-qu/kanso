// 自定义日期选择器：触发按钮 + Popover 迷你月历。
// 替代原生 <input type="date">（触发难、日历样式跟随浏览器默认），
// 样式与设计系统一致（popover / 主题色选中态 / 今天高亮）。
import { useState } from "react";
import {
	CalendarIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** YYYY-MM-DD */
export function dateKey(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(value: string): Date | null {
	if (!value) return null;
	const d = new Date(`${value}T00:00:00`);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** 显示格式：YYYY/MM/DD */
export function displayDate(value: string): string {
	const d = parseDate(value);
	return d
		? `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
		: value;
}

export default function DatePicker(props: {
	value: string;
	onChange: (value: string) => void;
	ariaLabel?: string;
	placeholder?: string;
	/** 触发按钮内是否带日历图标（外层已有图标时可关闭）。 */
	showIcon?: boolean;
}) {
	const { value, onChange, ariaLabel, placeholder = "设置日期", showIcon = true } = props;
	const [open, setOpen] = useState(false);
	const [cursor, setCursor] = useState<Date>(() => {
		const d = parseDate(value) ?? new Date();
		return new Date(d.getFullYear(), d.getMonth(), 1);
	});

	const todayKey = dateKey(new Date());
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const firstWeekday = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const cells: Array<number | null> = [
		...Array.from({ length: firstWeekday }, () => null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	];

	function moveMonth(delta: number) {
		setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
	}

	function select(day: number) {
		onChange(dateKey(new Date(year, month, day)));
		setOpen(false);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				// 打开时把月历定位到当前值所在月份
				if (next && value) {
					const d = parseDate(value);
					if (d) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button variant="outline" size="sm" aria-label={ariaLabel}>
						{showIcon ? <CalendarIcon className="size-3.5" /> : null}
						{value ? displayDate(value) : placeholder}
						<ChevronDownIcon className="size-3 opacity-70" />
					</Button>
				}
			/>
			<PopoverPopup className="w-64 p-2" align="start">
				<div className="flex items-center justify-between px-1 pb-1.5">
					<button
						type="button"
						aria-label="上个月"
						className="date-picker-nav"
						onClick={() => moveMonth(-1)}
					>
						<ChevronLeftIcon className="size-4" />
					</button>
					<span className="text-sm font-medium">
						{year}年{month + 1}月
					</span>
					<button
						type="button"
						aria-label="下个月"
						className="date-picker-nav"
						onClick={() => moveMonth(1)}
					>
						<ChevronRightIcon className="size-4" />
					</button>
				</div>
				<div className="grid grid-cols-7 border-b pb-1 text-center text-[11px] text-muted-foreground">
					{WEEKDAY_LABELS.map((w) => (
						<span key={w} className="py-0.5">
							{w}
						</span>
					))}
				</div>
				<div className="grid grid-cols-7 gap-0.5 pt-1">
					{cells.map((day, index) => {
						if (day === null) return <span key={index} />;
						const key = dateKey(new Date(year, month, day));
						const isToday = key === todayKey;
						const isSelected = key === value;
						return (
							<button
								key={index}
								type="button"
								className={`size-7 rounded-md text-[12px] transition-colors hover:bg-accent ${
									isSelected
										? "bg-primary font-semibold text-primary-foreground hover:bg-primary"
										: isToday
											? "font-semibold text-primary"
											: "text-foreground/80"
								}`}
								onClick={() => select(day)}
							>
								{day}
							</button>
						);
					})}
				</div>
				<div className="mt-1.5 flex items-center justify-between border-t pt-1.5">
					<button
						type="button"
						className="date-picker-quick"
						onClick={() => {
							onChange(todayKey);
							setOpen(false);
						}}
					>
						今天
					</button>
					<button
						type="button"
						className="date-picker-quick"
						onClick={() => {
							onChange("");
							setOpen(false);
						}}
					>
						清除日期
					</button>
				</div>
			</PopoverPopup>
		</Popover>
	);
}
