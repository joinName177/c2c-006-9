import{describe,expect,it}from'vitest';
import{mount}from'@vue/test-utils';
import ResultPanel from'../components/ResultPanel.vue';
import RegretCurve from'../components/RegretCurve.vue';
import{analyzeDecision}from'../../core/analysis-service';
import type{DecisionDraft,DecisionOption,ValueWeights}from'../../core/models';

const weights:ValueWeights={stability:25,growth:25,freedom:25,money:25};
function option(id:string,stability:number,reversibility:number):DecisionOption{
  return{id,name:id,description:'',impacts:{stability,growth:0,freedom:0,money:0},reversibility};
}
function draftFor(options:DecisionOption[]):DecisionDraft{
  return{id:'c',title:'测试',background:'',options,weights,updatedAt:'2026-10-07T00:00:00.000Z'};
}
/** 通过真实引擎扫描出可用的离散分数，再选择旋钮构造目标模式。 */
function scanKnobs():{raw:number;knob:[number,number]}[]{
  const rows:{raw:number;knob:[number,number]}[]=[];
  for(let s=-5;s<=5;s+=1)for(let r=0;r<=100;r+=10){
    rows.push({raw:analyzeDecision(draftFor([option('probe',s,r)])).options[0].rawTotal,knob:[s,r]});
  }
  return rows.sort((a,b)=>a.raw-b.raw);
}

describe('ResultPanel 与 RegretCurve 共用分组判定',()=>{
  it('唯一领先时：建议点名领先、有名次第一、曲线按同一分组画一条断层',()=>{
    const rows=scanKnobs();
    const best=rows[0];
    const far=rows.find(r=>r.raw-best.raw>=5)!;
    const analysis=analyzeDecision(draftFor([option('win',...best.knob),option('lose',...far.knob)]));
    expect(analysis.winnerId).toBe('win');
    expect(analysis.groups).toHaveLength(2);

    const panel=mount(ResultPanel,{props:{analysis,stale:false}});
    expect(panel.text()).toContain('领先');
    expect(panel.text()).toContain('名次 #1');
    expect(panel.find('.winner-flag').exists()).toBe(true);
    expect(panel.find('.tied-flag').exists()).toBe(false);
    expect(panel.find('.verdict-tag').text()).toContain('唯一领先');

    const curve=panel.findComponent(RegretCurve);
    expect(curve.props('groups')).toEqual(analysis.groups);
    expect(curve.findAll('.gap-marker')).toHaveLength(1);
  });

  it('多人并列榜首时：不点名推荐，分数卡显示无法区分标签，曲线无断层',()=>{
    const analysis=analyzeDecision(draftFor([option('甲',0,50),option('乙',0,50),option('丙',0,50)]));
    expect(analysis.groups).toHaveLength(1);
    expect(analysis.winnerId).toBeUndefined();

    const panel=mount(ResultPanel,{props:{analysis,stale:false}});
    expect(panel.find('.verdict-tag').text()).toContain('无法区分');
    expect(panel.findAll('.tied-flag')).toHaveLength(3);
    expect(panel.find('.winner-flag').exists()).toBe(false);
    expect(panel.text()).not.toContain('领先');

    const curve=panel.findComponent(RegretCurve);
    expect(curve.props('groups')).toEqual(analysis.groups);
    expect(curve.findAll('.gap-marker')).toHaveLength(0);
  });

  it('一项明显落后时：看板、分数卡与曲线的梯队数完全一致',()=>{
    const rows=scanKnobs();
    const unique=[...new Map(rows.map(r=>[r.raw,r])).values()];
    // 前三彼此差距 <5，第四名落后第三名 >=5
    let pick:typeof rows|null=null;
    for(let i=0;i<unique.length&&!pick;i+=1)for(let j=i+1;j<unique.length&&!pick;j+=1)
      for(let k=j+1;k<unique.length&&!pick;k+=1){
        if(unique[k].raw-unique[i].raw>=5)continue;
        const far=unique.find((r,l)=>l>k&&r.raw-unique[k].raw>=5);
        if(far)pick=[unique[i],unique[j],unique[k],far];
      }
    expect(pick).not.toBeNull();
    const analysis=analyzeDecision(draftFor(pick!.map((r,i)=>option(`o${i}`,...r.knob))));
    expect(analysis.groups).toHaveLength(2);
    expect(analysis.groups[0].members).toHaveLength(3);
    expect(analysis.groups[1].members).toHaveLength(1);
    expect(analysis.winnerId).toBeUndefined();

    const panel=mount(ResultPanel,{props:{analysis,stale:false}});
    expect(panel.findAll('.tier-row')).toHaveLength(2);
    const curve=panel.findComponent(RegretCurve);
    expect(curve.findAll('.gap-marker')).toHaveLength(1);
    expect(panel.find('.recommendation').text()).toMatch(/难以区分|无法区分/);
    ['o0','o1','o2','o3'].forEach(name=>expect(panel.text()).toContain(name));
  });
});
