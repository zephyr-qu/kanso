// 标签管理器：项目级标签库的创建/重命名/删除（看板工具栏入口）。
import { useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBackdrop,
	DialogDescription,
	DialogHeader,
	DialogPortal,
	DialogPopup,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Label as LabelType } from "@/types/label";

export default function LabelManagerDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	labels: LabelType[];
	onCreate: (name: string) => Promise<void>;
	onRename: (id: string, name: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const { open, onOpenChange, labels, onCreate, onRename, onDelete } = props;
	const [name, setName] = useState("");
	const [editing, setEditing] = useState<LabelType | null>(null);
	const [editName, setEditName] = useState("");
	const [busy, setBusy] = useState(false);
	// 删除二次确认：点垃圾桶进入「确认/取消」态（列/任务删除都有确认，标签删除补上）。
	const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogBackdrop />
				<DialogPopup className="w-full max-w-md">
					<DialogHeader>
						<DialogTitle>标签管理</DialogTitle>
						<DialogDescription>
							标签库属于当前项目，项目间互不影响。
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
					await onCreate(name.trim());
									setName("");
								} finally {
									setBusy(false);
								}
							}}
						>
							<div className="flex items-center gap-2">
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
										) : confirmingDelete === label.id ? (
												<>
													<span className="flex-1 truncate text-sm text-destructive">{label.name}</span>
													<Button
														size="sm"
														variant="destructive"
														className="h-7 px-2 text-xs"
														aria-label={`确认删除 ${label.name}`}
														onClick={() => { setConfirmingDelete(null); void onDelete(label.id); }}
													>
														删除
													</Button>
													<Button
														size="sm"
														variant="ghost"
														className="h-7 px-2 text-xs"
														aria-label="取消删除"
														onClick={() => setConfirmingDelete(null)}
													>
														取消
													</Button>
												</>
											) : (
												<>
													<span className="flex-1 text-sm">{label.name}</span>
													<Button
														variant="ghost"
														size="icon"
														className="size-7"
														aria-label={`重命名 ${label.name}`}
														onClick={() => {
															setEditing(label);
															setEditName(label.name);
															setConfirmingDelete(null);
														}}
													>
														<PencilIcon />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="size-7 text-destructive"
														aria-label={`删除 ${label.name}`}
														onClick={() => setConfirmingDelete(label.id)}
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
				</DialogPopup>
			</DialogPortal>
		</Dialog>
	);
}
