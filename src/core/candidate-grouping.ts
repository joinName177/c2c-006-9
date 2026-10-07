import type { OptionAnalysis } from './models';

/**
 * 候选方案分组规则
 *
 * 背景：旧版只比较前两名的整数总分（差值 < 5 即提示接近），三四个方案相似时
 * 会遗漏同样接近的方案。这里改为基于「未舍入总分」的可解释分组。
 *
 * 两个判据共同决定一条分组边界（任一达到阈值即切，保守而可解释）：
 * 1. 相邻差距（adjacent gap）：排序后相邻两个方案的未舍入分差。
 *    >= CLEAR_GAP(5) 视为明显断层，硬切边界——防止「逐项接近」的连锁：
 *    0, 4, 8 中每一环都只差 4，但首尾相差 8，不能因此并入同一组。
 * 2. 组内参照（gap to leader）：新成员与「当前组」最佳方案的未舍入分差。
 *    一旦 >= CLEAR_GAP 也切边界——防止跨越断层被拉入：
 *    0, 4.9, 5.1 中 4.9 与 5.1 只差 0.2，但 5.1 距本组最佳已达 5.1。
 *    参照随分组重置，因此 0, 6, 7 中 6、7 虽都落后榜首超过 5 分，
 *    但彼此只差 1 分，仍会同组；组间的明显差距由上一条边界负责。
 *
 * 显示精度 DISPLAY_EPSILON(1)：总分四舍五入到整数显示，未舍入差距小于 1 分时
 * 名次并列、文案描述为「处于同一显示精度内」，不宣称存在可分辨的先后
 * （即使两者舍入后的整数恰好不同，例如 10.4 与 10.6）。
 *
 * 由于 CLEAR_GAP > DISPLAY_EPSILON 且两条规则都以未舍入分为准，同一组内：
 * - 相邻差距一定 < 5（不会跨过明显断层）；
 * - 任意成员与组内最佳的差距一定 < 5（首尾也不会被并到一起）。
 */

/** 分数的显示精度：总分四舍五入到整数，相差不足 1 分在显示上不可分辨。 */
export const DISPLAY_EPSILON = 1;
/** 明显差距阈值：未舍入分差 >= 5 即视为已有明显差距（与旧版 <5 规则的边界保持一致）。 */
export const CLEAR_GAP = 5;

export type GapKind = 'tie' | 'close' | 'clear';

/** 分组之间的断层说明。 */
export interface GroupBoundary {
  /** 边界之后第一个方案的 id。 */
  toOptionId: string;
  /** 与上一组最后一名的未舍入相邻差距。 */
  adjacentGap: number;
  /** 与榜首方案的未舍入总分差距。 */
  gapToBest: number;
  /** 触发边界时，新成员与其所在组最佳的未舍入差距。 */
  gapToLeader: number;
  /** 触发边界的原因：相邻断层，或与本组最佳差距达到阈值。 */
  reason: 'adjacent-gap' | 'gap-to-leader';
}

export interface CandidateGroup {
  /** 1 表示最靠前的一组；组内与组间均按未舍入总分从低到高（越靠前越不后悔）。 */
  rank: number;
  members: OptionAnalysis[];
  /** 组内最佳到组内末位的未舍入分差。 */
  spread: number;
  /** 与上一组之间的边界；榜首组没有边界。 */
  boundary: GroupBoundary | null;
}

export interface GroupedCandidates {
  groups: CandidateGroup[];
  /** 榜首组唯一时的胜者 id；榜首组有多个成员时为 undefined（无法区分，不强推）。 */
  winnerId: string | undefined;
}

/** 消除浮点累积误差，比较一律使用未舍入但限定精度的数值。 */
export function normalizeRaw(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e10) / 1e10;
}

/** 差距分级，供名次、曲线和报告共用同一措辞。 */
export function classifyGap(rawGap: number): GapKind {
  const gap = normalizeRaw(rawGap);
  if (gap < DISPLAY_EPSILON) return 'tie';
  if (gap < CLEAR_GAP) return 'close';
  return 'clear';
}

/** 并列名次：未舍入差距小于显示精度（1 分）的方案共享同一名次（1, 1, 3…）。 */
export function displayRanks(sorted: readonly OptionAnalysis[]): number[] {
  const ranks: number[] = [];
  sorted.forEach((item, i) => {
    if (i > 0 && normalizeRaw(item.rawTotal - sorted[i - 1].rawTotal) < DISPLAY_EPSILON) {
      ranks.push(ranks[i - 1]);
    } else ranks.push(i + 1);
  });
  return ranks;
}

/**
 * 按未舍入总分把方案聚合为可解释的候选分组。
 * 输入需为已按 rawTotal 升序（越靠前越不后悔）排列的方案；
 * 分组结果只取决于未舍入分数，与名称和录入顺序无关。
 */
export function groupCandidates(sorted: readonly OptionAnalysis[]): GroupedCandidates {
  if (!sorted.length) return { groups: [], winnerId: undefined };

  const bestRaw = normalizeRaw(sorted[0].rawTotal);
  const groups: CandidateGroup[] = [];
  let current: OptionAnalysis[] = [sorted[0]];
  let leaderRaw = bestRaw;
  let currentBoundary: GroupBoundary | null = null;

  const pushGroup = () => {
    const first = current[0];
    const last = current[current.length - 1];
    groups.push({
      rank: groups.length + 1,
      members: current,
      spread: normalizeRaw(last.rawTotal - first.rawTotal),
      boundary: currentBoundary,
    });
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const item = sorted[i];
    const adjacentGap = normalizeRaw(item.rawTotal - sorted[i - 1].rawTotal);
    const gapToBest = normalizeRaw(item.rawTotal - bestRaw);
    const gapToLeader = normalizeRaw(item.rawTotal - leaderRaw);

    if (adjacentGap >= CLEAR_GAP || gapToLeader >= CLEAR_GAP) {
      pushGroup();
      current = [item];
      leaderRaw = normalizeRaw(item.rawTotal);
      currentBoundary = {
        toOptionId: item.option.id,
        adjacentGap,
        gapToBest,
        gapToLeader,
        reason: adjacentGap >= CLEAR_GAP ? 'adjacent-gap' : 'gap-to-leader',
      };
    } else {
      current.push(item);
    }
  }
  pushGroup();

  return {
    groups,
    winnerId: groups[0].members.length === 1 ? groups[0].members[0].option.id : undefined,
  };
}
