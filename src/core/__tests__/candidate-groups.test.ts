import{describe,expect,it}from'vitest';import{GROUP_GAP,groupCandidates,recommendationFor,type Ranked}from'../candidate-groups';
const entries=(rawTotals:number[]):Ranked[]=>rawTotals.map((rawTotal,i)=>({id:`o${i}`,rawTotal}));
const nameOf=(id:string)=>`方案${id}`;
describe('groupCandidates',()=>{
it('全部相同：所有方案并入同一组，无首尾之分',()=>{const groups=groupCandidates(entries([20,20,20,20]));expect(groups).toHaveLength(1);expect(groups[0].optionIds).toEqual(['o0','o1','o2','o3']);expect(groups[0].spread).toBe(0);expect(groups[0].gapToBest).toBe(0)});
it('连锁接近：逐项差距均小于阈值，但首尾差距明显的不会被并入同组',()=>{const groups=groupCandidates(entries([0,4,8,12]));expect(groups.map(g=>g.optionIds)).toEqual([['o0','o1'],['o2','o3']]);for(const g of groups)expect(g.spread).toBeLessThan(GROUP_GAP)});
it('连锁接近（三项）：中间项只与组内最佳比较，不会把 0 和 8 桥接成一组',()=>{const groups=groupCandidates(entries([0,4,8]));expect(groups.map(g=>g.optionIds)).toEqual([['o0','o1'],['o2']])});
it('四项只有一项明显落后：第一梯队三人，落后者单独成组并给出差距',()=>{const groups=groupCandidates(entries([10,11.5,13,24]));expect(groups.map(g=>g.optionIds)).toEqual([['o0','o1','o2'],['o3']]);expect(groups[0].spread).toBeLessThan(GROUP_GAP);expect(groups[1].gapToBest).toBeGreaterThanOrEqual(GROUP_GAP)});
it('边界：差距恰好 5 分视为可区分，小于 5 分视为难以区分',()=>{expect(groupCandidates(entries([10,15])).map(g=>g.optionIds)).toEqual([['o0'],['o1']]);expect(groupCandidates(entries([10,14.9])).map(g=>g.optionIds)).toEqual([['o0','o1']])});
it('使用未舍入分数：取整后相差 5 分（10 vs 15）但原始差距 4.2 的仍判为难以区分',()=>{const groups=groupCandidates(entries([10.4,14.6]));expect(Math.round(10.4)).toBe(10);expect(Math.round(14.6)).toBe(15);expect(groups).toHaveLength(1)});
it('录入顺序无关：同一组分数任意打乱，分组结果完全相同',()=>{const base=groupCandidates(entries([10,14,18,24]));const shuffled=groupCandidates([{id:'o3',rawTotal:24},{id:'o1',rawTotal:14},{id:'o0',rawTotal:10},{id:'o2',rawTotal:18}]);expect(shuffled).toEqual(base)});
it('分数相同按 id 定序：结果确定且与名称无关',()=>{const a=groupCandidates([{id:'b',rawTotal:10},{id:'a',rawTotal:10}]);const b=groupCandidates([{id:'a',rawTotal:10},{id:'b',rawTotal:10}]);expect(a).toEqual(b);expect(a[0].optionIds).toEqual(['a','b'])});
it('展示值不变式：组内 spread 恒小于阈值，后续组 gapToBest 恒不小于阈值',()=>{const groups=groupCandidates(entries([0,2,4,6,8,10,12]));for(const g of groups)expect(g.spread).toBeLessThan(GROUP_GAP);for(const g of groups.slice(1))expect(g.gapToBest).toBeGreaterThanOrEqual(GROUP_GAP)});
});
describe('recommendationFor',()=>{
it('第一梯队唯一：给出明确方向并说明与次优的差距',()=>{const text=recommendationFor(groupCandidates(entries([10,16,24])),nameOf);expect(text).toContain('「方案o0」是更不容易后悔的方向');expect(text).toContain('6');expect(text).not.toContain('难以区分')});
it('第一梯队多人：逐一列出全部并列方案，不遗漏同样接近者',()=>{const text=recommendationFor(groupCandidates(entries([10,12,13,24])),nameOf);expect(text).toContain('「方案o0」');expect(text).toContain('「方案o1」');expect(text).toContain('「方案o2」');expect(text).not.toContain('「方案o3」的总分');expect(text).toContain('难以区分');expect(text).toContain('明显差距')});
it('全部相同：列出所有方案且没有落后梯队',()=>{const text=recommendationFor(groupCandidates(entries([7,7,7])),nameOf);expect(text).toContain('「方案o0」');expect(text).toContain('「方案o1」');expect(text).toContain('「方案o2」');expect(text).toContain('难以区分');expect(text).not.toContain('明显差距')});
});
