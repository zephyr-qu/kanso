// 占位首页：应用壳的默认挂载点，M1 后续切片（工作区/项目）在此渲染。
export default function HomePage() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
			<p className="text-sm">欢迎使用 Kanso</p>
			<p className="text-xs">M1 实现中：工作区与项目将在后续切片中接入</p>
		</div>
	);
}
