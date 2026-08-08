// 标签管理器：工作区共享标签库的创建/重命名/删除（+ 颜色选择）。
import { useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
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
import type { Label as LabelType } from "@/types/label";

export const LABEL_COLORS = [
	"#ef4444",
	"#f97316",
	"#eab308",
	"#22c55e",
	"#3b82f6",
	"#8b5cf6",
	"#ec4899",
];

export default function LabelManagerDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	labels: LabelType[];
	onCreate: (name: string, color: string) => Promise<void>;
	onRename: (id: string, name: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const { open, onOpenChange, labels, onCreate, onRename, onDelete } = props;
	const [name, setName] = useState("");
	const [color, setColor] = useState(LABEL_COLORS[4]);
	const [editing, setEditing] = useState<LabelType | null>(null);
	const [editName, setEditName] = useState("");
	const [busy, setBusy] = useState(false);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup className="w-full max-w-md">
					<DialogHeader>
						<DialogTitle>标签管理</DialogTitle>
						<DialogDescription>
							标签库属于整个工作区，所有项目共享。
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 p-4">
						{/* 新建 */}
						<form
							className="space-y-2"
							onSubmit={async (e) => {
								e.preventDefault();
								if (!name.trim() || busy) return;
								setBusy(true);
								try {
									await onCreate(name.trim(), color);
									setName("");
								} finally {
									setBusy(false);
								}
							}}
						>
							<div className="flex items-center gap-2">
								<div className="flex gap-1">
									{LABEL_COLORS.map((c) => (
										<button
											key={c}
											type="button"
											aria-label={`颜色 ${c}`}
											className={`size-5 rounded-full border-2 ${
												color === c ? "border-foreground" : "border-transparent"
											}`}
											style={{ backgroundColor: c }}
											onClick={() => setColor(c)}
										/>
									))}
								</div>
								<Input
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="新标签名称"
									className="flex-1"
								/>
								<Button type="submit" size="sm" disabled={!name.trim() || busy}>
									<PlusIcon /> 添加
								</Button>
							</div>
						</form>

						{/* 标签列表 */}
						{labels.length === 0 ? (
							<p className="py-4 text-center text-xs text-muted-foreground">
								还没有标签
							</p>
						) : (
							<ul className="space-y-1">
								{labels.map((label) => (
									<li
										key={label.id}
										className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
									>
										{editing?.id === label.id ? (
											<>
												<Input
													value={editName}
													onChange={(e) => setEditName(e.target.value)}
													className="h-7 flex-1 text-sm"
													autoFocus
												/>
												<Button
													size="sm"
													variant="ghost"
													onClick={async () => {
														if (!editName.trim()) return;
														await onRename(label.id, editName.trim());
														setEditing(null);
													}}
												>
													保存
												</Button>
											</>
										) : (
											<>
												<span
													className="size-3 rounded-full"
													style={{ backgroundColor: label.color }}
												/>
												<span className="flex-1 text-sm">{label.name}</span>
												<Button
													variant="ghost"
													size="icon"
													className="size-7"
													aria-label={`重命名 ${label.name}`}
													onClick={() => {
														setEditing(label);
														setEditName(label.name);
													}}
												>
													<PencilIcon />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="size-7 text-destructive"
													aria-label={`删除 ${label.name}`}
													onClick={() => onDelete(label.id)}
												>
													<TrashIcon />
												</Button>
											</>
										)}
									</li>
								))}
							</ul>
						)}
					</div>
					<DialogFooter className="p-4 pt-0">
						<DialogClose render={<Button variant="ghost">关闭</Button>} />
					</DialogFooter>
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
