import { useState } from "react";
import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { api, setAccessKey } from "@/lib/api";
import { buildPath } from "@/lib/endpoints";
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
import { toastManager } from "@/components/ui/toast";

export function MemberKeyButton({
	memberId,
	hasKey,
	isSelf,
	canRotate,
	onRotated,
}: {
	memberId: string;
	hasKey: boolean;
	isSelf: boolean;
	canRotate: boolean;
	onRotated?: (key: string) => void;
}) {
	const [key, setKey] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(false);

	if (!canRotate) return null;

	const rotate = async () => {
		if (loading) return;
		setLoading(true);
		try {
			const response = await api<{ key: string }>(
				buildPath("memberKey", { id: memberId }),
				{ method: "POST" },
			);
			setKey(response.key);
			setCopied(false);
			setOpen(true);
			if (isSelf) {
				setAccessKey(response.key);
				onRotated?.(response.key);
			}
		} catch (error) {
			toastManager.add({
				title: "轮换密钥失败",
				description: error instanceof Error ? error.message : "网络错误",
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	const copy = async () => {
		if (!key) return;
		try {
			await navigator.clipboard.writeText(key);
		} catch {
			const textarea = document.createElement("textarea");
			textarea.value = key;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			textarea.remove();
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0 text-xs text-[var(--semantic-action-primary)]"
				onClick={rotate}
				loading={loading}
				aria-label={isSelf ? "轮换我的密钥" : `轮换成员密钥`}
			>
				<KeyRoundIcon className="size-3.5" />
				{isSelf ? "轮换我的密钥" : hasKey ? "轮换密钥" : "发放密钥"}
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setKey(null);
				}}
			>
				<DialogPortal>
					<DialogBackdrop />
					<DialogPopup>
						<DialogHeader>
							<DialogTitle>新密钥已生成</DialogTitle>
							<DialogDescription>
								密钥只在这里显示一次，请复制并安全交付给登录者。
							</DialogDescription>
						</DialogHeader>
						<div className="px-4 py-2">
							<code className="block select-all rounded-lg border bg-muted px-3 py-3 text-center font-mono text-sm">
								{key}
							</code>
						</div>
						<DialogFooter variant="bare" className="p-4 pt-2">
							<DialogClose render={<Button variant="ghost">完成</Button>} />
							<Button variant="outline" onClick={copy}>
								<CopyIcon className="size-3.5" />
								{copied ? "已复制" : "复制密钥"}
							</Button>
						</DialogFooter>
					</DialogPopup>
				</DialogPortal>
			</Dialog>
		</>
	);
}
