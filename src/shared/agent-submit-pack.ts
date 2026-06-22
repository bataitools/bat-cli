import type { AgentI18nEntry, AgentSubmitBundle } from './agent-submit-validation';

/** 分文件提交：base.json 不含或仅含部分 i18n */
export type AgentSubmitBase = Omit<AgentSubmitBundle, 'i18n'> & {
	i18n?: Record<string, AgentI18nEntry>;
};

/** 将 base + 各语言 i18n 文件合并为完整 bundle */
export function packAgentSubmit(
	base: AgentSubmitBase,
	i18nByLang: Record<string, AgentI18nEntry>,
): AgentSubmitBundle {
	const { i18n: baseI18n, ...rest } = base;
	return {
		...rest,
		i18n: {
			...(baseI18n ?? {}),
			...i18nByLang,
		},
	};
}
