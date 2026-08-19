// 优先级分段选择器：添加任务表单 / 任务详情弹层共用，结束两处 verbatim 重复。
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/priority";
import { cn } from "@/lib/cn";

export function PriorityPicker({
	value,
	onChange,
	size = "px-2 py-1 text-[11px]",
	titlePrefix,
	preventFocusLoss,
	className,
}: {
	/** 当前选中优先级（应已标准化，如 "med"）。 */
	value: string;
	onChange: (priority: string) => void;
	/** 覆写按钮 padding / 字号。 */
	size?: string;
	/** 如 "设为"，生成 title="设为X优先级"。 */
	titlePrefix?: string;
	/** 点击时阻止默认 mousedown（避免表单 blur 提前关闭）。 */
	preventFocusLoss?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-wrap gap-1", className)}>
			{PRIORITIES.map((p) => (
				<button
					key={p}
					type="button"
					title={
						titlePrefix ? `${titlePrefix}${PRIORITY_LABEL[p]}优先级` : undefined
					}
					onMouseDown={preventFocusLoss ? (e) => e.preventDefault() : undefined}
					onClick={() => onChange(p)}
					className={cn(
						`kanso-priority-option kanso-priority-option--${p}`,
						size,
						className,
					)}
					data-selected={value === p}
				>
					<span className="kanso-priority-option__dot" aria-hidden="true" />
					{PRIORITY_LABEL[p]}
				</button>
			))}
		</div>
	);
}
