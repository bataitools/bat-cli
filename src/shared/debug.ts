/**
 * @grammar/shared - 跨平台通用开发环境源码追踪联动探针
 * 提供 H5 调试模式下通过 Ctrl + Shift 点击页面元素，全自动捕获组件源码路径并写入系统剪贴板的魔法特性。
 */

// 安全获取 DOM 元素上挂载的 React 内部 Fiber 节点
function getReactFiber(dom: any): any {
	if (!dom) return null;
	const key = Object.keys(dom).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
	return key ? dom[key] : null;
}

// 递归向上从 React Fiber 树中扒出 _debugSource 源码信息
function getSourceFromFiber(dom: HTMLElement): { fileName: string; lineNumber: number } | null {
	let fiber = getReactFiber(dom);
	while (fiber) {
		if (fiber._debugSource) {
			const { fileName, lineNumber } = fiber._debugSource;
			if (fileName && lineNumber) {
				return { fileName, lineNumber };
			}
		}
		// 向上递归父 Fiber 节点
		fiber = fiber.return;
	}
	return null;
}

// 格式化路径，从绝对路径提取相对于项目根目录的相对路径
function getCleanRelativePath(absolutePath: string): string {
	if (!absolutePath) return '';
	// 统一处理 Windows 和 Mac 路径斜杠
	const normalized = absolutePath.replace(/\\/g, '/');

	// 匹配 monorepo 中各个子包的 src 路径起点，如 grammar-mini/src 或 grammar-creator/src
	const srcIndex = normalized.indexOf('/src/');
	if (srcIndex !== -1) {
		// 截取类似 "src/pages/path/..." 的相对路径
		return normalized.substring(srcIndex + 1);
	}

	// 兼容 Next.js 等子包内直接的相对或绝对路径截取
	const appIndex = normalized.indexOf('/app/');
	if (appIndex !== -1) {
		return normalized.substring(appIndex + 1);
	}

	const parts = normalized.split('/');
	const packagesIndex = parts.indexOf('packages');
	if (packagesIndex !== -1) {
		return parts.slice(packagesIndex).join('/');
	}

	// 回退机制：返回最后 4 级目录路径
	return parts.slice(-4).join('/');
}

/**
 * 初始化全局源码追踪点击拦截器。
 * 建议在各大子项目（如 grammar-mini、grammar-creator、grammar-opera 等）的 App 入口处执行。
 */
export function setupSourceInspector(): () => void {
	// 仅在本地开发环境且存在浏览器/DOM环境时激活
	if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') {
		return () => {};
	}

	console.log(
		'%c[Source Inspector] 🚀 全局通用源码追踪探针挂载成功！请在页面上按住 Ctrl + Shift 并点击任意元素，坐标路径将全自动复制到系统剪贴板！',
		'color: #10b981; font-weight: 900; font-size: 13px; padding: 4px; border: 1px solid #10b981; border-radius: 4px;',
	);

	const handleInspectorClick = (e: MouseEvent) => {
		// Ctrl + Shift 组合键激活
		const isMatch = e.ctrlKey && e.shiftKey;
		if (!isMatch) return;

		e.preventDefault();
		e.stopPropagation();

		let target = e.target as HTMLElement | null;
		let cleanLocation: string | null = null;

		// 1. 优先尝试从 Babel 插件注入的 HTML 属性（data-location）中获取
		let currentTarget = target;
		while (currentTarget && currentTarget !== document.body) {
			const locationAttr = currentTarget.getAttribute('data-location');
			if (locationAttr) {
				cleanLocation = locationAttr.replace(/^\[.*?\]\s*/, '').trim();
				break;
			}
			currentTarget = currentTarget.parentElement;
		}

		// 2. 如果没有属性（如 Next.js/SWC 项目中没挂载 Babel 插件），则直接利用 React Fiber 探针全自动扒出组件位置！
		if (!cleanLocation && target) {
			const fiberSource = getSourceFromFiber(target);
			if (fiberSource) {
				const relativePath = getCleanRelativePath(fiberSource.fileName);
				if (relativePath) {
					cleanLocation = `${relativePath}:${fiberSource.lineNumber}`;
				}
			}
		}

		// 3. 完美执行！自动复制到系统剪贴板并在控制台友好提示
		if (cleanLocation) {
			const formattedLocation = `[Source] ${cleanLocation}`;

			// 写入剪贴板
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard
					.writeText(formattedLocation)
					.then(() => {
						console.log(
							`%c[Source Inspector] 📋 源码位置已全自动复制到您的系统剪贴板！可以直接 Ctrl+V 粘贴发给 AI 助手！\n位置: ${formattedLocation}`,
							'color: #10b981; font-weight: 800; font-size: 12px;',
						);
					})
					.catch((err) => {
						console.warn('[Source Inspector] 全自动复制到剪贴板失败，请手动复制控制台的路径:', formattedLocation, err);
					});
			}

			// 如果 Webpack 的 launch-editor 接口可用，同样尝试在本地唤起编辑器
			const openUrl = `/__open-in-editor?file=${cleanLocation}`;
			fetch(openUrl).catch(() => {});
		} else {
			console.log(
				'%c[Source Inspector] ⚠️ 未能在被点击的元素或其任何上层 Fiber 节点上抓取到源码路径。',
				'color: #f76b4f; font-weight: 800;',
			);
		}
	};

	window.addEventListener('click', handleInspectorClick, { capture: true });
	return () => {
		window.removeEventListener('click', handleInspectorClick, { capture: true });
	};
}
