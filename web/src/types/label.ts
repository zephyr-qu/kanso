// 与 Go 后端 label 表对应的前端类型。
// 标签属于项目（每块看板一套标签，项目间互不影响）。
export type Label = {
	id: string;
	projectId: string;
	name: string;
	createdAt: string;
};
