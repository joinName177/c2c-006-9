<script setup lang="ts">
import type { DecisionAnalysis } from '../../core/models';
import RegretCurve from './RegretCurve.vue';
import { CLEAR_GAP, displayRanks } from '../../core/candidate-grouping';

const props = defineProps<{ analysis: DecisionAnalysis; stale: boolean }>();
const ranks = displayRanks(props.analysis.options);
const rankOf = (id: string) => ranks[props.analysis.options.findIndex(o => o.option.id === id)];

const tierName = (rank: number) =>
  rank === 1 ? '第一梯队 · 难以区分' : `第 ${rank} 梯队 · 已有差距`;
const gapText = (gap: number) => String(Math.round(gap * 10) / 10);
const groupNote = (g: (typeof props.analysis.groups)[number]) => {
  if (!g.boundary) return g.members.length > 1 ? `梯队内首尾相差 ${gapText(g.spread)} 分（不足 ${CLEAR_GAP} 分），无法区分先后` : '梯队内唯一方案';
  const by = g.boundary.reason === 'adjacent-gap'
    ? `与上一名相差 ${gapText(g.boundary.adjacentGap)} 分，出现明显断层`
    : `与本梯队最佳相差 ${gapText(g.boundary.gapToLeader)} 分，达到 ${CLEAR_GAP} 分阈值`;
  return by;
};
</script>

<template>
  <section class="results">
    <div v-if="stale" class="stale-note">输入已变化，下方是上一次分析结果，请重新计算。</div>

    <div class="recommendation" :class="{ tied: !analysis.winnerId }">
      <span>CANDIDATE GROUPS · THE LEAST REGRETFUL PATH</span>
      <h2>最不后悔建议</h2>
      <p>{{ analysis.recommendation }}</p>
      <small v-if="analysis.groups.length === 1 && analysis.groups[0].members.length > 1" class="verdict-tag">
        当前判定：无法区分（不点名唯一推荐）
      </small>
      <small v-else-if="analysis.winnerId" class="verdict-tag">
        当前判定：唯一领先（与次名差距 ≥ {{ CLEAR_GAP }} 分）
      </small>
      <aside v-for="notice in analysis.notices" :key="notice">{{ notice }}</aside>
    </div>

    <RegretCurve :options="analysis.options" :groups="analysis.groups" />

    <div class="tier-board">
      <span>HOW TO READ · 候选分组（同一判定同时用于曲线、名次与建议）</span>
      <p>
        按未舍入总分排序：相邻两方案差距 ≥ {{ CLEAR_GAP }} 分视为明显断层；
        新成员与梯队内最佳相差 ≥ {{ CLEAR_GAP }} 分也单独成组。
        因此逐项接近但首尾差距明显的方案不会被并入同一组。
      </p>
      <article v-for="g in analysis.groups" :key="g.rank" class="tier-row">
        <b :data-tier="g.rank">{{ String(g.rank).padStart(2, '0') }}</b>
        <div>
          <h4>{{ tierName(g.rank) }}</h4>
          <em v-for="m in g.members" :key="m.option.id">
            {{ m.option.name }} · 显示 {{ m.total }} 分
          </em>
          <small>{{ groupNote(g) }}</small>
        </div>
      </article>
    </div>

    <div class="score-grid">
      <template v-for="g in analysis.groups" :key="g.rank">
        <article v-for="m in g.members" :key="m.option.id" :data-tier="g.rank"
          :class="{ winner: analysis.winnerId === m.option.id }">
          <span>名次 #{{ rankOf(m.option.id) }} · 梯队 {{ String(g.rank).padStart(2, '0') }}</span>
          <h3>{{ m.option.name }}</h3>
          <b>{{ m.total }}<small>/100</small></b>
          <i v-if="analysis.winnerId === m.option.id" class="winner-flag">明显领先</i>
          <i v-else-if="g.rank === 1" class="tied-flag">与梯队内方案无法区分</i>
          <div>
            <i v-for="p in m.points" :key="p.horizon">{{ p.horizon }}年 {{ p.score }}</i>
          </div>
        </article>
      </template>
    </div>

    <div class="rehearsals">
      <article v-for="item in analysis.options" :key="item.option.id">
        <h3>{{ item.option.name }} · 后悔预演</h3>
        <div v-for="card in item.cards" :key="card.horizon">
          <b>{{ card.horizon }} 年后</b>
          <p>{{ card.regret }}</p>
          <small>{{ card.trigger }} {{ card.reversibility }}；{{ card.action }}</small>
        </div>
      </article>
    </div>
  </section>
</template>
