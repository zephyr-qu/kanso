// 列内"添加任务"的内联表单（借鉴原型 .add：轻量触发按钮，hover 加深；回车创建）。
// 0008 后统一优先级为唯一重要度维度：表单提供四档优先级分段按钮（默认 中）。
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PriorityPicker } from "@/components/priority-picker";

export default function AddTaskForm(props: {
	onAdd: (title: string, priority: string) => void;
}) {
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");
	const [priority, setPriority] = useState("med");

	if (!adding) {
		return (
			<button
				type="button"
				className="flex w-full items-center gap-1.5 rounded-[6px] px-1.5 py-2 text-left text-[13px] text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
				onClick={() => setAdding(true)}
			>
				<PlusIcon className="size-3.5" /> 添加任务
			</button>
		);
	}
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (!title.trim()) return;
				props.onAdd(title.trim(), priority);
				setTitle("");
				setPriority("med");
				setAdding(false);
			}}
		>
			<Input
				autoFocus
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onBlur={() => setAdding(false)}
				placeholder="任务标题，回车创建"
				className="h-8 text-sm"
			/>
			{/* 优先级分段按钮：与 Quick Capture 同款交互。 */}
			<PriorityPicker value={priority} onChange={setPriority} preventFocusLoss className="mt-1.5" />
		</form>
	);
}
