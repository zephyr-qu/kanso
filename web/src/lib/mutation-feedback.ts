export type MutationFeedback = {
	success?: string;
	errorTitle?: string;
	suppressErrorToast?: boolean;
};

export type MutationMeta = {
	feedback?: MutationFeedback;
};

export function readMutationFeedback(meta: unknown): MutationFeedback {
	if (!meta || typeof meta !== "object") return {};
	const feedback = (meta as MutationMeta).feedback;
	if (!feedback || typeof feedback !== "object") return {};
	return feedback;
}

export function mutationErrorDescription(error: unknown): string {
	const raw = error instanceof Error ? error.message : "";
	const separator = raw.indexOf(" — ");
	if (separator >= 0) return raw.slice(separator + 3) || "请稍后重试";
	if (/Failed to fetch|NetworkError|网络|connection/i.test(raw)) {
		return "网络连接失败，请检查网络后重试";
	}
	return raw || "请稍后重试";
}
