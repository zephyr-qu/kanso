// 列内"添加任务"的内联表单（回车创建）。
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AddTaskForm(props: { onAdd: (title: string) => void }) {
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");

	if (!adding) {
		return (
			<Button
				variant="ghost"
				className="w-full justify-start text-xs text-muted-foreground"
				onClick={() => setAdding(true)}
			>
				<PlusIcon /> 添加任务
			</Button>
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
