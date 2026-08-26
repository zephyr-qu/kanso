import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/task-detail/section-label";
import type { Task } from "@/types/task";

type TaskDetailDescriptionProps = {
	value: string | null;
	onUpdate: (patch: Pick<Task, "description">) => void;
};

function DescriptionContent({ value }: { value: string | null }) {
	const paragraphs = value?.trim() ? value.split(/\n\s*\n/) : ["暂无描述，点击编辑添加。"];

	return (
		<div className="kanso-task-detail__description">
			{paragraphs.map((paragraph, index) => {
				const lines = paragraph.split("\n");
				return (
					<div key={`${index}-${paragraph.slice(0, 12)}`}>
						{lines.map((line, lineIndex) => {
							const isBullet = line.startsWith("• ");
							return (
								<p
									key={`${lineIndex}-${line}`}
									className={isBullet ? "kanso-task-detail__description-bullet" : undefined}
								>
									{isBullet ? line.slice(2) : line}
								</p>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}

export function TaskDetailDescription({ value, onUpdate }: TaskDetailDescriptionProps) {
	const [draft, setDraft] = useState("");
	const [editing, setEditing] = useState(false);

	return (
		<section className="kanso-task-detail__section">
			<SectionLabel>描述</SectionLabel>
			{editing ? (
				<div
					className="space-y-2"
					onBlur={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false);
					}}
				>
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={4}
						autoFocus
						onKeyDown={(event) => {
							if (event.key === "Escape") setEditing(false);
						}}
						placeholder="补充任务描述…"
					/>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
							取消
						</Button>
						<Button
							size="sm"
							onClick={() => {
								onUpdate({ description: draft });
								setEditing(false);
							}}
						>
							保存描述
						</Button>
					</div>
				</div>
			) : (
				<div
					className="cursor-text rounded-[10px] border bg-card p-4 text-sm leading-[1.7] text-muted-foreground transition-colors hover:border-foreground/15"
					onClick={() => {
						setDraft(value ?? "");
						setEditing(true);
					}}
				>
					<DescriptionContent value={value} />
				</div>
			)}
		</section>
	);
}
