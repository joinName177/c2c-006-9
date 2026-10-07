<script setup lang="ts">
import{ref,computed}from'vue';
import type{OptionAnalysis}from'../../core/models';
import type{CandidateGroup}from'../../core/candidate-grouping';
import{CLEAR_GAP}from'../../core/candidate-grouping';
const props=defineProps<{options:OptionAnalysis[];groups:CandidateGroup[]}>();
const hidden=ref(new Set<string>());
const colors=['#4f5db7','#d58a32','#8b5f88','#3b8667'];
const x=(i:number)=>70+i*180;
const y=(score:number)=>230-score*1.75;
const path=(o:OptionAnalysis)=>o.points.map((p,i)=>`${i?'L':'M'} ${x(i)} ${y(p.score)}`).join(' ');
function toggle(id:string){const next=new Set(hidden.value);next.has(id)?next.delete(id):next.add(id);hidden.value=next}
const visible=computed(()=>props.options.filter(o=>!hidden.value.has(o.option.id)));
const tierOf=(id:string)=>props.groups.find(g=>g.members.some(m=>m.option.id===id))?.rank??1;
const gapText=(n:number)=>String(Math.round(n*10)/10);
/** 断层标记：每条边界对应「上一组最后一名」与「本组第一名」，中点画虚线。 */
const separators=computed(()=>props.groups.slice(1).map((g,idx)=>{
  const prev=props.groups[idx];
  const upper=prev.members[prev.members.length-1];
  const lower=g.members[0];
  return{rank:g.rank,y:y((upper.rawTotal+lower.rawTotal)/2),gap:g.boundary?.adjacentGap ?? lower.rawTotal-upper.rawTotal};
}));
</script>
<template>
  <div class="curve-card">
    <div class="curve-head">
      <div>
        <span>REGRET OVER TIME · CANDIDATE GROUPS</span>
        <h3>后悔曲线</h3>
        <small class="group-key">同色梯队内首尾相差不足 {{ CLEAR_GAP }} 分（难以区分）；琥珀色虚线为梯队断层。</small>
      </div>
      <div class="legend">
        <button v-for="o in options" :key="o.option.id" :class="{off:hidden.has(o.option.id)}" @click="toggle(o.option.id)">
          <i :style="{background:colors[tierOf(o.option.id)-1]}"></i>
          {{o.option.name}}<em>梯队 {{String(tierOf(o.option.id)).padStart(2,'0')}}</em>
        </button>
      </div>
    </div>
    <svg viewBox="0 0 500 280" role="img" :aria-label="`各选项未来十年的后悔指数曲线，共 ${groups.length} 个候选梯队`">
      <g class="grid">
        <line v-for="v in [0,25,50,75,100]" :key="v" x1="55" x2="460" :y1="y(v)" :y2="y(v)"/>
        <text v-for="v in [0,25,50,75,100]" :key="`t${v}`" x="22" :y="y(v)+4">{{v}}</text>
      </g>
      <g class="gap-marker" v-for="s in separators" :key="`gap-${s.rank}`">
        <line x1="55" x2="460" :y1="s.y" :y2="s.y" stroke-dasharray="5 4"/>
        <text x="455" :y="s.y - 4" text-anchor="end">断层 {{gapText(s.gap)}} 分</text>
      </g>
      <g v-for="o in visible" :key="o.option.id">
        <path :d="path(o)" fill="none" :stroke="colors[tierOf(o.option.id)-1]" stroke-width="4"/>
        <circle v-for="(p,i) in o.points" :key="p.horizon" :cx="x(i)" :cy="y(p.score)" r="6" :fill="colors[tierOf(o.option.id)-1]">
          <title>{{o.option.name}}（梯队 {{tierOf(o.option.id)}}） · {{p.horizon}}年：{{p.score}}，总分 {{o.total}}</title>
        </circle>
        <text class="total-label" x="435" :y="y(o.rawTotal)+4" :fill="colors[tierOf(o.option.id)-1]">{{o.total}}</text>
      </g>
      <text v-for="(h,i) in [1,5,10]" :key="h" :x="x(i)" y="268" text-anchor="middle">{{h}} 年后</text>
    </svg>
  </div>
</template>
