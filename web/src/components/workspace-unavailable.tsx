import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function WorkspaceUnavailable({
	status,
	canCreate,
	onCreate,
	onChoose,
}: {
	status: "loading" | "unavailable" | "empty";
	canCreate: boolean;
	onCreate: () => void;
	onChoose: () => void;
}) {
	const [creating, setCreating] = useState(false);
	if (status === "loading") {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const empty = status === "empty";
	return (
		<div className="flex h-full items-center justify-center px-6">
			<div className="max-w-md text-center">
				<div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-lg">⌂</div>
				<h1 className="text-lg font-semibold">{empty ? "暂无可访问工作区" : "工作区不可用"}</h1>
				<p className="mt-2 text-sm leading-6 text-muted-foreground">
					{empty
						? canCreate
							? "创建一个工作区开始协作，系统会自动准备一个默认项目。"
							: "当前成员还没有被授权加入工作区，请联系管理员。"
						: "这个工作区不存在，或当前成员没有访问权限。请重新选择工作区。"}
				</p>
				<div className="mt-5 flex justify-center gap-2">
					{!empty ? (
						<Button variant="outline" onClick={onChoose}>
							重新选择工作区
						</Button>
					) : null}
					{canCreate ? (
						<Button
							onClick={() => {
								setCreating(true);
								onCreate();
								setCreating(false);
							}}
							disabled={creating}
						>
							{creating ? "准备中…" : "新建工作区"}
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}
