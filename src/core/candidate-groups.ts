import type{CandidateGroup}from'./models';
// 总分以整数显示（显示精度 1 分，单个分数的舍入噪声不超过 0.5 分）。
// 未舍入总分差距小于 5 分时，差异可能完全来自估计与舍入噪声，判定为「难以区分」；
// 差距达到 5 分（远大于显示噪声）才认为两个方案可以被区分。
export const GROUP_GAP=5;
export interface Ranked{id:string;rawTotal:number}
// 展示值向下取整到 0.1：保证界面上 spread 永远 < GROUP_GAP、gapToBest 永远 >= GROUP_GAP，
// 展示数字与分组规则可观测地一致（四舍五入可能把 4.95–4.99 的 spread 显示成 5.0）。
const floor1=(n:number)=>Math.floor(n*10)/10;
// 以「组内最佳者」为参照的贪心分组：候选按 (未舍入总分, 选项 id) 排序后，
// 只有与当前组最佳者相差不足 GROUP_GAP 才并入该组，否则开启新组。
// 因此任意组内首尾差距 spread 必然小于 GROUP_GAP —— 逐项接近（如 0/4/8/12）
// 不会把明显不同的首尾连锁并入同组；这正是纯相邻差距聚合（单链聚类）的缺陷。
// 对第一梯队而言，本规则与「以最佳方案为参照」完全等价，并把同一规则延伸到后续梯队。
// 排序键只含分数与 id，与选项名称、录入顺序无关，相同输入必然得到相同分组。
export function groupCandidates(entries:Ranked[]):CandidateGroup[]{const ranked=entries.slice().sort((a,b)=>a.rawTotal-b.rawTotal||(a.id<b.id?-1:a.id>b.id?1:0));const groups:{optionIds:string[];best:number;worst:number}[]=[];for(const entry of ranked){const current=groups[groups.length-1];if(current&&entry.rawTotal-current.best<GROUP_GAP){current.optionIds.push(entry.id);current.worst=entry.rawTotal}else groups.push({optionIds:[entry.id],best:entry.rawTotal,worst:entry.rawTotal})}const lead=groups[0]?.best??0;return groups.map(g=>({optionIds:g.optionIds,spread:floor1(g.worst-g.best),gapToBest:floor1(g.best-lead)}))}
// 推荐文案只由分组结果生成：第一梯队唯一才有明确方向，多人并列则逐一列出并建议补充信息；
// 后续梯队与第一梯队的差距 gapToBest 必然不小于 GROUP_GAP，不会出现「唯一推荐」与「难以区分」并存。
export function recommendationFor(groups:CandidateGroup[],nameOf:(id:string)=>string):string{const lead=groups[0];const names=lead.optionIds.map(id=>`「${nameOf(id)}」`);if(lead.optionIds.length===1){const gap=groups[1]?`，与最接近的方案相差约 ${groups[1].gapToBest} 分，差距已清晰可辨`:'';return`目前看，${names[0]}是更不容易后悔的方向${gap}。`}const tail=groups.length>1?`其余方案与第一梯队相差约 ${groups[1].gapToBest} 分，已有明显差距。`:'';return`${names.join('、')}的总分彼此相差不到 ${GROUP_GAP} 分，目前难以区分，建议补充信息后再决定。${tail}`}
