// 通用确认对话框（破坏性操作确认）。
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

export default function ConfirmDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel?: string;
	/** 破坏性操作用红色确认按钮（默认）；恢复等非破坏操作用主按钮。 */
	destructive?: boolean;
	onConfirm: () => Promise<void>;
}) {
	const [submitting, setSubmitting] = useState(false);
	const destructive = props.destructive !== false;

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup>
					<DialogHeader>
						<DialogTitle>{props.title}</DialogTitle>
						<DialogDescription>{props.description}</DialogDescription>
					</DialogHeader>
					<DialogFooter variant="bare" className="p-4 pt-0">
						<DialogClose render={<Button variant="ghost">取消</Button>} />
						<Button
							variant={destructive ? "destructive" : "default"}
							loading={submitting}
							onClick={async () => {
								setSubmitting(true);
								try {
									await props.onConfirm();
									props.onOpenChange(false);
								} finally {
									setSubmitting(false);
								}
							}}
						>
							{props.confirmLabel ?? "删除"}
						</Button>
					</DialogFooter>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
