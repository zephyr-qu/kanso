// 通用名称输入对话框（创建/重命名共用）。
// 注意：对话框在所有调用点常驻挂载，name 必须在 open/initialValue 变化时同步，
// 否则取消后残留上一个目标的名字，下一次重命名会把旧名误提交到新目标。
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogPortal,
	DialogPopup,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NameDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	submitLabel: string;
	initialValue?: string;
	/** 额外表单内容（如模板选择），渲染在名称输入之后。 */
	children?: React.ReactNode;
	onSubmit: (name: string) => Promise<void>;
}) {
	const [name, setName] = useState(props.initialValue ?? "");
	const [submitting, setSubmitting] = useState(false);

	// 常驻挂载 + 复用：每次打开/目标变化时重置为当前目标的名字。
	useEffect(() => {
		if (props.open) setName(props.initialValue ?? "");
	}, [props.open, props.initialValue]);

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
						<DialogDescription>{props.description}</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4 p-4"
						onSubmit={async (e) => {
							e.preventDefault();
							if (!name.trim() || submitting) return;
							setSubmitting(true);
							try {
								await props.onSubmit(name.trim());
								props.onOpenChange(false);
								setName("");
							} finally {
								setSubmitting(false);
							}
						}}
					>
						<div className="space-y-1.5">
							<Label htmlFor="name-input">名称</Label>
							<Input
								id="name-input"
								value={name}
								onChange={(e) => setName(e.target.value)}
								autoFocus
								placeholder="名称"
							/>
						</div>
						{props.children}
						<DialogFooter variant="bare">
							<DialogClose render={<Button variant="ghost">取消</Button>} />
							<Button type="submit" loading={submitting} disabled={!name.trim()}>
								{props.submitLabel}
							</Button>
						</DialogFooter>
					</form>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
