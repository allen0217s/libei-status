<script setup lang="ts">
import { computed } from 'vue';
import StateTree from './StateTree.vue';

const props = defineProps<{ value: unknown; name?: string }>();
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => value === undefined || value === null || value === '' ? '未记录' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const world = computed(() => record(record(props.value).世界));
const person = computed(() => { const value = record(props.value); return record(value.主角 ?? value.黎北); });
const clothes = computed(() => record(person.value.穿着));
const inventory = computed(() => Object.entries(record(person.value.随身物品)));
const layers = [
  { key: '上装', number: '01', area: '肩胸', y: 106 },
  { key: '内衬', number: '02', area: '腰腹', y: 150 },
  { key: '下装', number: '03', area: '下身', y: 212 },
  { key: '鞋履', number: '04', area: '足部', y: 316 },
];
const annotations = computed(() => layers.map(layer => ({ ...layer, garment: record(clothes.value[layer.key]).衣物, coverage: record(clothes.value[layer.key]).遮露 })));
</script>

<template>
  <div class="libei-overview">
    <dl class="libei-scene" aria-label="当前时间与地点">
      <div><dt>日期</dt><dd>{{ text(world.日期) }}</dd></div>
      <div><dt>时刻</dt><dd class="libei-time">{{ text(world.时间) }}</dd></div>
      <div class="libei-location"><dt>所在</dt><dd>{{ text(world.地点) }}</dd></div>
    </dl>

    <section class="libei-person" :aria-label="`${name || '主角'}身体与衣着`">
      <header class="libei-person-head">
        <div><span class="libei-eyebrow">人物近况</span><h3>{{ name || '主角' }} <span>身体与衣着</span></h3></div>
        <dl class="libei-metrics">
          <div><dt>钱财</dt><dd>{{ text(person.钱财) }}</dd></div>
          <div><dt>元精</dt><dd>{{ text(person.精液) }}</dd></div>
        </dl>
      </header>
      <div class="libei-body-layout">
        <figure class="libei-body-figure">
          <svg class="libei-body-map" viewBox="0 0 200 350" role="img" aria-label="男性人体示意，编号对应右侧衣着备注">
            <path class="libei-guide" d="M100 12V335M18 106H183M18 150H183M18 212H183M18 316H183" />
            <ellipse class="libei-ground" cx="92" cy="333" rx="47" ry="5" />
            <g class="libei-silhouette" stroke-linejoin="round" stroke-linecap="round">
              <path d="M79 58L79 73Q71 78 57 81Q45 83 41 99L31 141L24 183L20 196Q20 205 26 207Q31 208 34 199L39 186L48 148L58 119L62 154L59 184L63 211L65 249L67 289L65 314L59 324Q57 331 68 331L80 329Q85 328 83 319L84 287L89 251L94 219L99 251L104 287L105 319Q103 328 108 329L120 331Q131 331 129 324L123 314L121 289L123 249L125 211L129 184L126 154L130 119L140 148L149 186L154 199Q157 208 162 207Q168 205 168 196L164 183L157 141L147 99Q143 83 131 81Q117 78 109 73L109 58Z" />
              <path d="M75 30Q75 12 94 12Q113 12 113 30L111 49Q108 65 94 68Q80 65 77 49Z" />
              <path class="libei-body-detail" d="M80 76L94 86L108 76M62 100Q77 93 90 100M98 100Q111 93 126 100M94 90V156M70 116Q80 123 90 117M98 117Q109 123 118 116M76 135L87 137M101 137L112 135M77 149L88 151M100 151L111 149M65 170Q94 181 123 170M65 179L61 205L87 210L94 191L101 210L127 205L123 179M71 224L77 255M117 224L111 255M72 277L77 295M116 277L111 295" />
            </g>
            <g v-for="layer in layers" :key="layer.key" class="libei-map-marker" :transform="`translate(163 ${layer.y})`">
              <path d="M-40 0H-13" /><circle r="12" /><text text-anchor="middle" dominant-baseline="central">{{ layer.number }}</text>
            </g>
          </svg>
          <figcaption>衣着部位示意<br /><span>以右侧记录为准</span></figcaption>
        </figure>
        <div class="libei-annotations">
          <article v-for="layer in annotations" :key="layer.key" class="libei-annotation" :aria-label="`${layer.key}备注`">
            <header><span class="libei-number">{{ layer.number }}</span><h4>{{ layer.key }}</h4><span class="libei-area">{{ layer.area }}</span></header>
            <p class="libei-garment">{{ text(layer.garment) }}</p>
            <p class="libei-coverage"><span>遮露</span>{{ text(layer.coverage) }}</p>
          </article>
        </div>
      </div>
      <div class="libei-body-note"><span class="libei-note-label">身体近况</span><p>{{ text(person.阳具) }}</p></div>
      <details v-if="person.精液算式" class="libei-calculation"><summary>元精结算说明</summary><p>{{ text(person.精液算式) }}</p></details>
    </section>

    <section class="libei-thought" aria-label="当前想法"><h3>此刻想法</h3><p>{{ text(person.想法) }}</p></section>
    <section class="libei-inventory" aria-label="随身物品">
      <header><h3>随身物品</h3><span>{{ inventory.length }} 项</span></header>
      <dl v-if="inventory.length" class="libei-items"><div v-for="[name, description] in inventory" :key="name"><dt>{{ name }}</dt><dd>{{ text(description) }}</dd></div></dl>
      <p v-else class="libei-no-items">暂无随身物品记录</p>
    </section>
    <details class="libei-full-state"><summary>查看完整状态数据</summary><StateTree :value="value" /></details>
  </div>
</template>

<style scoped>
.libei-overview{display:grid;gap:12px;min-width:0;container-type:inline-size}
.libei-overview h3,.libei-overview h4,.libei-overview p,.libei-overview dl,.libei-overview dd,.libei-overview figure{margin:0}
.libei-scene{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,2fr);gap:12px;padding:12px 16px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface)}
.libei-scene>div{min-width:0}.libei-scene dt,.libei-eyebrow{font-size:11px;color:var(--bbs-ink-soft);letter-spacing:.08em}
.libei-scene dd{margin-top:2px;font-size:14px;font-weight:600;overflow-wrap:anywhere}.libei-scene .libei-time{font-size:21px;line-height:1.25;font-variant-numeric:tabular-nums}
.libei-person{min-width:0;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface);overflow:hidden}
.libei-person-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bbs-line)}
.libei-person-head>div{min-width:0;flex:1}.libei-person-head h3{font-size:20px;font-weight:600;overflow-wrap:anywhere}.libei-person-head h3 span{font-size:12px;font-weight:400;color:var(--bbs-ink-soft);margin-left:6px}
.libei-metrics{display:flex;gap:20px;align-items:center}.libei-metrics>div{min-width:0}.libei-metrics dt{font-size:11px;color:var(--bbs-ink-soft)}.libei-metrics dd{font-size:22px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.libei-body-layout{display:grid;grid-template-columns:minmax(100px,180px) minmax(0,1fr);gap:12px;padding:12px 16px}
.libei-body-figure{align-self:start;position:sticky;top:0;text-align:center;color:var(--bbs-ink-soft)}
.libei-body-map{display:block;width:100%;max-height:310px;color:var(--bbs-ink-soft)}
.libei-guide{stroke:var(--bbs-line);stroke-width:1;stroke-dasharray:2 5;fill:none}.libei-ground{fill:var(--bbs-line)}
.libei-silhouette{fill:var(--bbs-accent-soft);stroke:var(--bbs-ink-soft);stroke-width:1.5}.libei-body-detail{fill:none;stroke-width:1;opacity:.7}
.libei-map-marker path{fill:none;stroke:var(--bbs-ink-soft);stroke-width:1}.libei-map-marker circle{fill:var(--bbs-surface);stroke:var(--bbs-ink-soft);stroke-width:1}.libei-map-marker text{fill:var(--bbs-ink);font:600 10px var(--bbs-font-mono)}
.libei-body-figure figcaption{font-size:11px;line-height:1.6}.libei-body-figure figcaption span{font-size:10px}
.libei-annotations{display:grid;min-width:0;align-content:start}.libei-annotation{padding:8px 0 9px;border-bottom:1px solid var(--bbs-line);min-width:0}.libei-annotation:first-child{padding-top:0}.libei-annotation:last-child{border-bottom:0;padding-bottom:0}
.libei-annotation header{display:flex;gap:7px;align-items:center;margin-bottom:4px}.libei-number{display:inline-grid;place-items:center;min-width:23px;height:23px;border-radius:5px;background:var(--bbs-surface-2);color:var(--bbs-ink-soft);font:600 10px var(--bbs-font-mono)}
.libei-annotation h4{font-size:13px;font-weight:600}.libei-area{margin-left:auto;color:var(--bbs-ink-soft);font-size:10px}.libei-garment{font-size:13px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
.libei-coverage{margin-top:3px!important;font-size:12px;line-height:1.6;color:var(--bbs-ink-soft);white-space:pre-wrap;overflow-wrap:anywhere}.libei-coverage>span{display:inline-block;margin-right:6px;font-size:10px;border:1px solid var(--bbs-line);padding:0 4px;border-radius:3px}
.libei-body-note{display:grid;grid-template-columns:60px minmax(0,1fr);gap:10px;border-top:1px solid var(--bbs-line);background:var(--bbs-surface-2);padding:10px 16px}.libei-note-label{font-size:11px;color:var(--bbs-ink-soft)}.libei-body-note p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.libei-calculation{padding:8px 16px;border-top:1px solid var(--bbs-line);font-size:12px}.libei-calculation p{padding-top:6px;white-space:pre-wrap;overflow-wrap:anywhere}
.libei-thought{border-left:3px solid var(--bbs-ink-soft);padding:2px 0 2px 12px}.libei-thought h3,.libei-inventory h3{font-size:12px;font-weight:600;color:var(--bbs-ink-soft)}.libei-thought p{font-size:13px;line-height:1.8;padding-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}
.libei-inventory{padding:12px 16px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface)}.libei-inventory>header{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}.libei-inventory>header>span,.libei-no-items{font-size:11px;color:var(--bbs-ink-soft)}
.libei-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}.libei-items>div{min-width:0}.libei-items dt{font-size:12px;font-weight:600;overflow-wrap:anywhere}.libei-items dd{font-size:12px;color:var(--bbs-ink-soft);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px}
.libei-full-state{min-width:0;font-size:12px;color:var(--bbs-ink-soft)}.libei-full-state[open]>summary{margin-bottom:8px}.libei-overview summary{cursor:pointer;min-height:32px;align-content:center}.libei-overview summary:focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:3px;border-radius:3px}
@container(max-width:440px){.libei-scene{gap:8px;padding:10px 12px}.libei-scene dd{font-size:12px}.libei-person-head{padding:10px 12px;gap:8px}.libei-person-head h3{font-size:18px}.libei-person-head h3 span{font-size:11px}.libei-metrics{gap:12px}.libei-metrics dd{font-size:18px}.libei-body-layout{grid-template-columns:88px minmax(0,1fr);gap:10px;padding:10px 12px}.libei-body-note{grid-template-columns:1fr;gap:4px;padding:10px 12px}.libei-inventory{padding:10px 12px}.libei-items{grid-template-columns:1fr}.libei-area{display:none}.libei-body-figure figcaption{font-size:10px}.libei-body-figure figcaption span{display:none}}
</style>
