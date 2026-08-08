// 通用名称输入对话框（创建/重命名共用）。
import { useState } from "react";
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
	onSubmit: (name: string) => Promise<void>;
}) {
	const [name, setName] = useState(props.initialValue ?? "");
	const [submitting, setSubmitting] = useState(false);

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
						<DialogFooter>
							<DialogClose render={<Button variant="ghost">取消</Button>} />
							<Button
								type="submit"
								loading={submitting}
								disabled={!name.trim()}
							>
								{props.submitLabel}
							</Button>
						</DialogFooter>
					</form>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
