import{describe,expect,it}from'vitest';
import{analyzeDecision,buildRecommendation}from'../analysis-service';
import{groupCandidates,normalizeRaw}from'../candidate-grouping';
import type{DecisionDraft,DecisionOption,ValueWeights}from'../models';

const weights:ValueWeights={stability:25,growth:25,freedom:25,money:25};

function makeDraft(options:DecisionOption[]):DecisionDraft{
  return{id:'case',title:'测试决策',background:'',options,weights,updatedAt:'2026-10-07T00:00:00.000Z'};
}
/**
 * 通过稳定维度影响值与可逆性两个旋钮构造选项，其余维度为中性 0。
 * 分数越低越不后悔，分值由真实引擎计算，测试只选择其中的离散分数。
 */
function option(id:string,stability:number,reversibility:number,name?:string):DecisionOption{
  return{id,name:name??id,description:'',impacts:{stability,growth:0,freedom:0,money:0},reversibility};
}
function scanTotals():number[]{
  const set=new Set<number>();
  for(let s=-5;s<=5;s+=1)for(let r=0;r<=100;r+=10){
    const a=analyzeDecision(makeDraft([option('probe',s,r)]));
    set.add(a.options[0].rawTotal);
  }
  return[...set].sort((x,y)=>x-y);
}
/** 找到能产生目标分数的一组 (stability, reversibility) 旋钮。 */
function knobFor(target:number):[number,number]{
  for(let s=-5;s<=5;s+=1)for(let r=0;r<=100;r+=10){
    const raw=analyzeDecision(makeDraft([option('probe',s,r)])).options[0].rawTotal;
    if(normalizeRaw(raw-target)===0)return[s,r];
  }
  throw new Error(`无法构造分数 ${target}`);
}
const memberIds=(a:ReturnType<typeof analyzeDecision>)=>a.groups.map(g=>g.members.map(m=>m.option.id));

describe('analyzeDecision',()=>{
  it('总分同时给出未舍入值与整数显示值，且整数为未舍入值的四舍五入',()=>{
    // r=60 不可逆成本更低，分数应当低于 r=0
    const a=analyzeDecision(makeDraft([option('x',0,0),option('y',0,60)]));
    for(const o of a.options)expect(o.total).toBe(Math.round(o.rawTotal));
    expect(a.options.map(o=>o.option.id)).toEqual(['y','x']);
  });

  it('全部相同：单组、无唯一胜者、文案明确无法区分且不出现领先表述',()=>{
    const a=analyzeDecision(makeDraft([option('a',0,50),option('b',0,50),option('c',0,50)]));
    expect(a.groups).toHaveLength(1);
    expect(memberIds(a)).toEqual([['a','b','c']]);
    expect(a.winnerId).toBeUndefined();
    expect(a.recommendation).toContain('无法区分');
    expect(a.recommendation).not.toContain('领先');
  });

  it('连锁接近：相邻均不足 5 分但首尾达到 5 分时，不会把首尾并入同一组',()=>{
    const sorted=scanTotals();
    let pick:[number,number,number]|null=null;
    for(const v1 of sorted)for(const v2 of sorted)for(const v3 of sorted){
      if(v2>v1&&v3>v2&&v2-v1<5&&v3-v2<5&&v3-v1>=5){pick=[v1,v2,v3];break}
    }
    expect(pick).not.toBeNull();
    const a=analyzeDecision(makeDraft(pick!.map((v,idx)=>option(`o${idx}`,...knobFor(v)))));
    const raws=a.options.map(o=>o.rawTotal);
    expect(raws[1]-raws[0]).toBeLessThan(5);
    expect(raws[2]-raws[1]).toBeLessThan(5);
    expect(raws[2]-raws[0]).toBeGreaterThanOrEqual(5);
    expect(a.groups.length).toBeGreaterThanOrEqual(2);
    expect(a.winnerId).toBeUndefined();
    expect(a.recommendation).toMatch(/难以区分|无法区分/);
    expect(a.recommendation).not.toContain('领先');
  });

  it('四项只有一项明显落后：前三同组，落后者独立成组且胜者为空',()=>{
    const sorted=scanTotals();
    let pick:[number,number,number,number]|null=null;
    for(let i=0;i<sorted.length&&!pick;i+=1)for(let j=i+1;j<sorted.length&&!pick;j+=1)
      for(let k=j+1;k<sorted.length&&!pick;k+=1){
        const top=[sorted[i],sorted[j],sorted[k]];
        if(top[2]-top[0]>=5)continue;
        for(let l=k+1;l<sorted.length;l+=1){
          if(sorted[l]-top[2]>=5){pick=[...top,sorted[l]] as[number,number,number,number];break}
        }
      }
    expect(pick).not.toBeNull();
    const a=analyzeDecision(makeDraft(pick!.map((v,idx)=>option(`o${idx}`,...knobFor(v)))));
    expect(a.groups[0].members.map(m=>m.option.id)).toEqual(['o0','o1','o2']);
    expect(a.groups).toHaveLength(2);
    expect(a.groups[1].members.map(m=>m.option.id)).toEqual(['o3']);
    expect(a.groups[1].boundary).not.toBeNull();
    expect(a.winnerId).toBeUndefined();
  });

  it('唯一胜者：榜首与第二名差距达到 5 分才点名推荐，并给出与第二名的差距',()=>{
    const sorted=scanTotals();
    const best=sorted[0];
    const far=sorted.find(v=>v-best>=5);
    expect(far).toBeDefined();
    const a=analyzeDecision(makeDraft([option('win',...knobFor(best)),option('lose',...knobFor(far!))]));
    expect(a.winnerId).toBe('win');
    expect(a.groups).toHaveLength(2);
    expect(a.recommendation).toContain('win');
    expect(a.recommendation).toContain('领先');
    expect(a.recommendation).toMatch(/[5-9]|\d{2}/);
    expect(a.recommendation).not.toContain('无法区分');
  });

  it('稳定性：改变名称和录入顺序，分组成员、胜者与差距保持一致',()=>{
    const sorted=scanTotals();
    const chosen=[sorted[0],sorted[Math.min(1,sorted.length-1)],sorted[Math.min(3,sorted.length-1)]];
    const knobs=chosen.map(v=>knobFor(v));
    const base=analyzeDecision(makeDraft(knobs.map((k,i)=>option(`id-${i}`,...k))));
    const shuffled=analyzeDecision(makeDraft(
      knobs.slice().reverse().map((k,i)=>option(`id-${2-i}`,...k,`改名方案${i}`)),
    ));
    const canonical=(r:typeof base)=>r.groups
      .map(g=>g.members.map(m=>m.option.id).slice().sort())
      .sort((x,y)=>x[0].localeCompare(y[0]));
    expect(canonical(shuffled)).toEqual(canonical(base));
    expect(shuffled.winnerId).toBe(base.winnerId);
    expect(shuffled.groups.flatMap(g=>g.members).map(m=>normalizeRaw(m.rawTotal)).sort((x,y)=>x-y))
      .toEqual(base.groups.flatMap(g=>g.members).map(m=>normalizeRaw(m.rawTotal)).sort((x,y)=>x-y));
  });

  it('一致性不变量：唯一推荐与无法区分永不同时出现；groups 是 options 的有序划分',()=>{
    const knobs:[number,number][]=[];
    for(let s=-5;s<=5;s+=2)for(let r=0;r<=100;r+=25)knobs.push([s,r]);
    for(let i=0;i<knobs.length;i+=1)for(let j=i;j<knobs.length;j+=1){
      const a=analyzeDecision(makeDraft([
        option('p',...knobs[i]),
        option('q',...knobs[j]),
      ]));
      const topSize=a.groups[0].members.length;
      if(a.winnerId){
        expect(topSize).toBe(1);
        expect(a.recommendation).toContain('领先');
        expect(a.recommendation).not.toMatch(/无法区分|难以区分/);
      }else{
        expect(topSize).toBeGreaterThan(1);
        expect(a.recommendation).not.toContain('领先');
        expect(a.recommendation).toMatch(/难以区分|无法区分/);
      }
      expect(a.groups.flatMap(g=>g.members).map(o=>o.option.id)).toEqual(a.options.map(o=>o.option.id));
    }
  });

  it('高风险关键词仍追加专业提示',()=>{
    const draft=makeDraft([option('a',0,50),option('b',0,50)]);
    draft.title='要不要做这个投资';
    expect(analyzeDecision(draft).notices.join()).toContain('投资');
  });
});

describe('buildRecommendation',()=>{
  const oa=(id:string,raw:number,total=Math.round(raw))=>({
    option:{id,name:id,description:'',impacts:{stability:0,growth:0,freedom:0,money:0},reversibility:0},
    points:[],cards:[],rawTotal:raw,total,
  });
  it('显示总分相同的并列组说明全部成员',()=>{
    const groups=groupCandidates([oa('甲',10),oa('乙',10)]).groups;
    const text=buildRecommendation(groups);
    expect(text).toContain('「甲」');
    expect(text).toContain('「乙」');
    expect(text).toContain('显示总分相同');
  });
  it('唯一领先且第二名落后 5 分以上时点名并附差距',()=>{
    const groups=groupCandidates([oa('甲',10),oa('乙',16)]).groups;
    const text=buildRecommendation(groups);
    expect(text).toContain('「甲」');
    expect(text).toContain('6 分');
    expect(text).toContain('领先');
  });
  it('榜首多成员且另有落后梯队时，同时说明无法区分与明显差距',()=>{
    const groups=groupCandidates([oa('甲',10),oa('乙',12),oa('丙',19)]).groups;
    const text=buildRecommendation(groups);
    expect(text).toMatch(/难以区分|无法区分/);
    expect(text).toContain('明显差距');
  });
});
