import { useState } from "react";
import { SendIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/task-detail/section-label";
import { formatDateTime } from "@/lib/format-relative";
import type { Comment } from "@/types/task-detail";

type TaskDetailCommentsProps = {
	comments: Comment[];
	onCreate: (content: string) => Promise<void>;
	onDelete: (id: string) => void;
};

export function TaskDetailComments({ comments, onCreate, onDelete }: TaskDetailCommentsProps) {
	const [draft, setDraft] = useState("");

	return (
		<section className="kanso-task-detail__section">
			<SectionLabel>评论</SectionLabel>
			<form
				className="kanso-comment-composer"
				onSubmit={(event) => {
					event.preventDefault();
					if (!draft.trim()) return;
					void onCreate(draft.trim()).then(() => setDraft(""));
				}}
			>
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="写下评论…"
					className="kanso-comment-input"
					unstyled
					rows={3}
				/>
				<div className="kanso-comment-composer__actions">
					<Button type="submit" size="sm" disabled={!draft.trim()}>
						<SendIcon /> 发表评论
					</Button>
				</div>
			</form>
			{comments.length === 0 ? (
				<p className="text-xs text-muted-foreground">还没有评论</p>
			) : (
				<ul className="kanso-comment-list">
					{comments.map((comment) => (
						<li key={comment.id} className="kanso-comment">
							<span className="kanso-comment__avatar">Ad</span>
							<div className="kanso-comment__body">
								<div className="kanso-comment__head">
									<span className="font-semibold">{comment.author || "—"}</span>
									<span>{formatDateTime(comment.createdAt)}</span>
									<Button
										variant="ghost"
										size="icon"
										className="kanso-comment__delete"
										aria-label="删除评论"
										onClick={() => onDelete(comment.id)}
									>
										<TrashIcon />
									</Button>
								</div>
								<div className="kanso-comment__text">{comment.content}</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
