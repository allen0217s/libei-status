// 测试入口：只重导出生产模块，不复制被测实现。
export * as settings from '../src/api/settings';
export * as client from '../src/api/client';
export * as worldbooks from '../src/worldbooks';
export * as context from '../src/st/context';
