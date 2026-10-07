import{describe,expect,it}from'vitest';import{mount}from'@vue/test-utils';import ResultPanel from'../components/ResultPanel.vue';import{analyzeDecision}from'../../core/analysis-service';import type{DecisionAnalysis,DecisionDraft,DecisionOption}from'../../core/models';
const option=(id:string,money:number):DecisionOption=>({id,name:`方案${id}`,description:'',impacts:{stability:0,growth:0,freedom:0,money},reversibility:100});
const draft=(options:DecisionOption[]):DecisionDraft=>({id:'d',title:'测试',background:'',options,weights:{stability:25,growth:25,freedom:25,money:25},updatedAt:''});
const tied=()=>analyzeDecision(draft([option('a',0),option('b',-1),option('c',-4)]));
const unique=()=>analyzeDecision(draft([option('a',0),option('b',-4)]));
const panel=(analysis:DecisionAnalysis)=>mount(ResultPanel,{props:{analysis,stale:false}});
describe('ResultPanel 分组展示',()=>{
it('并列时：建议、徽章都标明难以区分，没有任何唯一推荐字样',()=>{const wrapper=panel(tied());const advice=wrapper.find('.recommendation p').text();expect(advice).toContain('难以区分');expect(advice).not.toContain('是更不容易后悔的方向');const badges=wrapper.findAll('.group-badge');expect(badges.map(b=>b.text())).toEqual(['第 1 梯队 · 难以区分','第 1 梯队 · 难以区分','第 2 梯队 · 落后约 10 分'])});
it('唯一领先时：建议给出明确方向，落后者徽章标注差距，建议中无难以区分字样',()=>{const wrapper=panel(unique());const advice=wrapper.find('.recommendation p').text();expect(advice).toContain('是更不容易后悔的方向');expect(advice).not.toContain('难以区分');const badges=wrapper.findAll('.group-badge');expect(badges.map(b=>b.text())).toEqual(['第 1 梯队','第 2 梯队 · 落后约 10 分'])});
it('展示判定依据，且名次顺序与分组展开顺序一致',()=>{const analysis=tied();const wrapper=panel(analysis);expect(wrapper.text()).toContain('判定依据');expect(wrapper.text()).toContain('未舍入总分');const names=wrapper.findAll('.score-grid h3').map(h=>h.text());expect(names).toEqual(analysis.options.map(o=>o.option.name))});
it('旧版存档缺少 groups 字段时正常渲染，不显示徽章',()=>{const legacy=JSON.parse(JSON.stringify(unique()))as DecisionAnalysis;delete(legacy as Partial<DecisionAnalysis>).groups;const wrapper=panel(legacy);expect(wrapper.find('.recommendation').exists()).toBe(true);expect(wrapper.findAll('.group-badge')).toHaveLength(0)});
});
