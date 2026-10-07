import{describe,expect,it}from'vitest';
import{
  CLEAR_GAP,
  DISPLAY_EPSILON,
  classifyGap,
  displayRanks,
  groupCandidates,
  normalizeRaw,
}from'../candidate-grouping';
import type{DecisionOption,OptionAnalysis}from'../models';

function opt(id:string,rawTotal:number,name?:string):OptionAnalysis{
  const option:DecisionOption={id,name:name??id,description:'',impacts:{stability:0,growth:0,freedom:0,money:0},reversibility:0};
  return{option,points:[],cards:[],total:Math.round(rawTotal),rawTotal:normalizeRaw(rawTotal)};
}
const ids=(groups:{members:OptionAnalysis[]}[])=>groups.map(g=>g.members.map(m=>m.option.id));

describe('classifyGap',()=>{
  it('按显示精度和明显差距分三级',()=>{
    expect(classifyGap(0)).toBe('tie');
    expect(classifyGap(DISPLAY_EPSILON-0.01)).toBe('tie');
    expect(classifyGap(1)).toBe('close');
    expect(classifyGap(4.99)).toBe('close');
    expect(classifyGap(CLEAR_GAP)).toBe('clear');
    expect(classifyGap(8)).toBe('clear');
  });
});

describe('groupCandidates',()=>{
  it('全部相同：单一候选组且不产生唯一胜者',()=>{
    const result=groupCandidates([opt('a',30),opt('b',30),opt('c',30),opt('d',30)]);
    expect(ids(result.groups)).toEqual([['a','b','c','d']]);
    expect(result.winnerId).toBeUndefined();
    expect(result.groups[0].spread).toBe(0);
    expect(result.groups[0].boundary).toBeNull();
  });

  it('连锁接近不会把首尾并组：0/4/8 → [0,4] 与 [8]，且榜首两人接近时不产生唯一胜者',()=>{
    const result=groupCandidates([opt('a',0),opt('b',4),opt('c',8)]);
    expect(ids(result.groups)).toEqual([['a','b'],['c']]);
    expect(result.winnerId).toBeUndefined();
    const boundary=result.groups[1].boundary!;
    expect(boundary.reason).toBe('gap-to-leader');
    expect(boundary.adjacentGap).toBe(4);
    expect(boundary.gapToLeader).toBe(8);
  });

  it('四项连锁 0/3/6/9 在首次达到 5 分参照差距处切开',()=>{
    const result=groupCandidates([opt('a',0),opt('b',3),opt('c',6),opt('d',9)]);
    expect(ids(result.groups)).toEqual([['a','b'],['c','d']]);
    expect(result.groups[0].spread).toBe(3);
    expect(result.groups[1].spread).toBe(3);
  });

  it('次邻跨越：0/4.9/5.1 不因 4.9 与 5.1 只差 0.2 而并组',()=>{
    const result=groupCandidates([opt('a',0),opt('b',4.9),opt('c',5.1)]);
    expect(ids(result.groups)).toEqual([['a','b'],['c']]);
    const boundary=result.groups[1].boundary!;
    expect(boundary.adjacentGap).toBeCloseTo(0.2,10);
    expect(boundary.gapToLeader).toBeCloseTo(5.1,10);
  });

  it('明显落后者自成后续梯队，但不影响落后者之间聚合：0/6/7 → [0] 与 [6,7]',()=>{
    const result=groupCandidates([opt('a',0),opt('b',6),opt('c',7)]);
    expect(ids(result.groups)).toEqual([['a'],['b','c']]);
    expect(result.winnerId).toBe('a');
    expect(result.groups[1].boundary?.reason).toBe('adjacent-gap');
    expect(result.groups[1].spread).toBe(1);
  });

  it('四项只有一项明显落后：前三名同组，落后者单独成组',()=>{
    const result=groupCandidates([opt('a',10),opt('b',11.5),opt('c',13),opt('d',19.5)]);
    expect(ids(result.groups)).toEqual([['a','b','c'],['d']]);
    expect(result.groups[0].spread).toBe(3);
    expect(result.groups[1].boundary?.adjacentGap).toBeCloseTo(6.5,10);
  });

  it('阈值边界：相邻差距恰好 5 视为明显差距，4.99 仍同组',()=>{
    expect(ids(groupCandidates([opt('a',0),opt('b',5)]).groups)).toEqual([['a'],['b']]);
    expect(ids(groupCandidates([opt('a',0),opt('b',4.99)]).groups)).toEqual([['a','b']]);
  });

  it('显示精度内但舍入整数不同的方案仍归为同一无法区分组',()=>{
    const sorted=[opt('a',10.4),opt('b',10.6)];
    expect(sorted.map(o=>o.total)).toEqual([10,11]);
    const result=groupCandidates(sorted);
    expect(ids(result.groups)).toEqual([['a','b']]);
    expect(result.winnerId).toBeUndefined();
  });

  it('显示名次按未舍入差距判定：不足 1 分即并列（即使舍入整数不同）',()=>{
    // 10.4→10 与 10.6→11：显示整数不同，但未舍入差距 0.2 < 1，名次并列
    expect(displayRanks([opt('a',10.4),opt('b',10.6),opt('c',12.4)])).toEqual([1,1,3]);
    // 11.5 与 12.4 差 0.9 分同样并列：10.4 第 1，后两者共享第 2
    expect(displayRanks([opt('a',10.4),opt('b',11.5),opt('c',12.4)])).toEqual([1,2,2]);
    expect(displayRanks([opt('a',10.4),opt('b',10.49),opt('c',12.4)])).toEqual([1,1,3]);
  });

  it('稳定性：改名不改变分组实质',()=>{
    const base=groupCandidates([opt('a',0),opt('b',4),opt('c',8)]);
    const renamed=groupCandidates([opt('a',0,'新名字'),opt('b',4,'乙'),opt('c',8,'丙')]);
    expect(ids(renamed.groups)).toEqual(ids(base.groups));
    expect(renamed.winnerId).toBe(base.winnerId);
    expect(renamed.groups.map(g=>g.spread)).toEqual(base.groups.map(g=>g.spread));
  });

  it('稳定性：并列项的输入顺序变化不改变分组成员集合',()=>{
    const a=groupCandidates([opt('a',30),opt('b',30),opt('c',40),opt('d',48)]);
    const tiesSwapped=groupCandidates([opt('b',30),opt('a',30),opt('c',40),opt('d',48)]);
    const canonical=(r:typeof a)=>r.groups.map(g=>g.members.map(m=>m.option.id).sort()).sort((x,y)=>x[0].localeCompare(y[0]));
    expect(canonical(tiesSwapped)).toEqual(canonical(a));
    expect(tiesSwapped.winnerId).toBe(a.winnerId);
  });

  it('组内不变量：相邻差距与相对组内最佳的差距都小于阈值；边界必有一项达到阈值',()=>{
    const values=[0,1,4.9,5,9.9,10,16,16.4];
    const result=groupCandidates(values.map((v,i)=>opt(`o${i}`,v)));
    for(const group of result.groups){
      expect(group.spread).toBeLessThan(CLEAR_GAP);
      group.members.forEach((m,idx)=>{
        if(idx>0){
          expect(normalizeRaw(m.rawTotal-group.members[idx-1].rawTotal)).toBeLessThan(CLEAR_GAP);
          expect(normalizeRaw(m.rawTotal-group.members[0].rawTotal)).toBeLessThan(CLEAR_GAP);
        }
      });
    }
    for(const group of result.groups.slice(1)){
      const b=group.boundary!;
      expect(b.adjacentGap>=CLEAR_GAP||b.gapToLeader>=CLEAR_GAP).toBe(true);
    }
    // 扁平化后仍保持原始排序
    expect(result.groups.flatMap(g=>g.members).map(m=>m.option.id)).toEqual(values.map((_,i)=>`o${i}`));
  });

  it('空列表返回空结果',()=>{
    expect(groupCandidates([])).toEqual({groups:[],winnerId:undefined});
  });
});
