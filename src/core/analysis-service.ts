import{normalizeWeights}from'./weight-service';
import{VALUE_KEYS,VALUE_LABELS,type DecisionAnalysis,type DecisionDraft,type Horizon,type OptionAnalysis,type RegretPoint,type RehearsalCard,type ValueKey}from'./models';
import{groupCandidates,normalizeRaw,CLEAR_GAP,type CandidateGroup}from'./candidate-grouping';
const timeFactor:Record<Horizon,Record<ValueKey,number>>={1:{stability:1.2,growth:.75,freedom:.8,money:1.15},5:{stability:1,growth:1,freedom:1,money:1},10:{stability:.8,growth:1.25,freedom:1.2,money:.85}};
function point(option:DecisionDraft['options'][number],weights:ReturnType<typeof normalizeWeights>,horizon:Horizon):RegretPoint{const breakdown={}as RegretPoint['breakdown'];let total=0;for(const key of VALUE_KEYS){const negative=(5-option.impacts[key])/10;const value=negative*weights[key]*timeFactor[horizon][key];breakdown[key]=Math.round(value*10)/10;total+=value}const irreversible=(100-option.reversibility)*.08*(horizon/10);return{horizon,score:Math.max(0,Math.min(100,Math.round(total+irreversible))),breakdown}}
function card(option:DecisionDraft['options'][number],p:RegretPoint,weights:ReturnType<typeof normalizeWeights>):RehearsalCard{const key=VALUE_KEYS.slice().sort((a,b)=>weights[b]*(5-option.impacts[b])-weights[a]*(5-option.impacts[a]))[0];const label=VALUE_LABELS[key];return{horizon:p.horizon,regret:`${p.horizon} 年后，你可能遗憾「${option.name}」没有更好照顾${label}。`,trigger:`当${label}需求持续得不到满足，后悔感可能升高。`,reversibility:option.reversibility>=60?'仍有较大调整空间':'改变成本可能随时间增加',action:`现在就为${label}设一个可检查的阶段目标。`}}
export function safetyNoticesFor(text:string):string[]{const notices:string[]=[];if(/医疗|诊断|治疗|medical/i.test(text))notices.push('涉及医疗，请同时咨询合格医疗专业人士。');if(/法律|诉讼|合同|legal/i.test(text))notices.push('涉及法律，请同时咨询合格法律专业人士。');if(/投资|股票|理财|investment/i.test(text))notices.push('涉及投资，请评估承受能力并咨询持牌专业人士。');return notices}

const names=(group:CandidateGroup)=>group.members.map(m=>`「${m.option.name}」`).join('、');
const gapText=(gap:number)=>String(Math.round(gap*10)/10);

/**
 * 依据分组结果生成建议。唯一来源是 groupCandidates：
 * 榜首组多于一个方案时绝不说「某方案领先」，榜首唯一时才点名推荐，
 * 因此报告不可能同时出现「唯一推荐」和「无法区分」。
 */
export function buildRecommendation(groups:CandidateGroup[]):string{
  if(groups.length===0)return'信息不足，暂无法给出建议。';
  const top=groups[0];
  const rest=groups.slice(1);
  const restNote=rest.length
    ? `其余方案与榜首已有至少 ${gapText(rest[0].boundary?.gapToBest ?? CLEAR_GAP)} 分的明显差距。`
    : '';
  const sameDisplay=top.members.every(m=>m.total===top.members[0].total);
  const tieText=sameDisplay
    ? `${names(top)}的显示总分相同（约 ${top.members[0].total} 分），按当前信息无法区分先后，建议补充关键信息后再决定。`
    : `${names(top)}的总分差距不足 1 分（${top.members.map(m=>`「${m.option.name}」${m.total} 分`).join('、')}），处于同一显示精度内，按当前信息无法区分先后，建议补充关键信息后再决定。`;

  if(groups.length===1){
    if(top.members.length===1)return`目前只有一个方案「${top.members[0].option.name}」，可直接作为方向，也建议再补充一个备选作对照。`;
    if(top.spread<1)return tieText;
    return`${names(top)}处在同一梯队，首尾仅相差 ${gapText(top.spread)} 分（不足 ${CLEAR_GAP} 分），彼此难以区分，建议补充信息后再决定。`;
  }

  if(top.members.length===1){
    const leader=top.members[0];
    const gap=groups[1].boundary?.gapToBest ?? 0;
    const second=groups[1];
    const closeBehind=second.members.length>1
      ? ` ${names(second)}彼此接近（相差不足 ${CLEAR_GAP} 分），但都已落后约 ${gapText(gap)} 分。`
      : ` 第二名与其相差约 ${gapText(gap)} 分。`;
    return`目前看，「${leader.option.name}」以约 ${gapText(gap)} 分的明显差距领先，是更不容易后悔的方向。${closeBehind}`;
  }

  if(top.spread<1)return`${tieText}${restNote}`;
  return`${names(top)}总分非常接近，首尾仅相差 ${gapText(top.spread)} 分（不足 ${CLEAR_GAP} 分），目前难以区分，建议补充信息后再决定。${restNote}`;
}

export function analyzeDecision(draft:DecisionDraft):DecisionAnalysis{
  const weights=normalizeWeights(draft.weights);
  const options:OptionAnalysis[]=draft.options.map(option=>{
    const points=([1,5,10]as Horizon[]).map(h=>point(option,weights,h));
    const rawTotal=normalizeRaw(points[0].score*.3+points[1].score*.4+points[2].score*.3);
    return{option,points,cards:points.map(p=>card(option,p,weights)),rawTotal,total:Math.round(rawTotal)};
  }).sort((a,b)=>a.rawTotal-b.rawTotal||a.option.id.localeCompare(b.option.id));

  const {groups,winnerId}=groupCandidates(options);
  const boundaries=groups.map(g=>g.boundary).filter((b):b is NonNullable<typeof b>=>b!==null);
  return{options,groups,boundaries,recommendation:buildRecommendation(groups),winnerId,notices:safetyNoticesFor(`${draft.title} ${draft.background}`)};
}
