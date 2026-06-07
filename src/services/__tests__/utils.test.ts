// ============================================================
//  utils 测试
// ============================================================

import { safeParseJSON } from '../utils';

describe('safeParseJSON', () => {
  it('解析标准 JSON', () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it('解析被 markdown 包裹的 JSON', () => {
    expect(safeParseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('从混合文本中提取 JSON 对象', () => {
    const raw = '一些前言文字 {"name":"test","value":42} 一些后记';
    expect(safeParseJSON(raw)).toEqual({ name: 'test', value: 42 });
  });

  it('解析 JSON 数组', () => {
    expect(safeParseJSON('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('无效输入返回 null', () => {
    expect(safeParseJSON('not json')).toBeNull();
    expect(safeParseJSON('')).toBeNull();
    expect(safeParseJSON('{broken')).toBeNull();
  });

  it('解析嵌套对象', () => {
    const raw = '{"characters":[{"name":"A"},{"name":"B"}],"count":2}';
    expect(safeParseJSON(raw)).toEqual({
      characters: [{ name: 'A' }, { name: 'B' }],
      count: 2,
    });
  });
});
