import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
	return <h2 className="kanso-detail-section-title">{children}</h2>;
}
