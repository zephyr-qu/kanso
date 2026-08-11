// 列内"添加任务"的内联表单（借鉴原型 .add：轻量触发按钮，hover 加深；回车创建）。
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function AddTaskForm(props: { onAdd: (title: string) => void }) {
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");

	if (!adding) {
		return (
			<button
				type="button"
				className="flex w-full items-center gap-1.5 rounded-[6px] px-1.5 py-2 text-left text-[13px] text-muted-foreground/80 transition-colors hover:bg-[rgba(24,24,27,0.04)] hover:text-foreground"
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
				props.onAdd(title.trim());
				setTitle("");
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
		</form>
	);
}
