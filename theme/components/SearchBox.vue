<script setup lang="ts">
import type {DocumentValue, EnrichedDocumentSearchResults} from "flexsearch";
import {Document} from "flexsearch";
import searchData from "virtual:search-index";
import {useRouter} from "vitepress";
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from "vue";

interface SectionRecord {
  id: string;
  pageId: string;
  pageTitle: string;
  section: string;
  fragment: string;
  level: number;
  content: string;
  url: string;
  group: string;
  docOrder: number;
}

type FlexRecord = SectionRecord & Record<string, DocumentValue | DocumentValue[]>;

interface PageGroup {
  pageId: string;
  pageTitle: string;
  group: string;
  sections: SectionRecord[];
}

const isOpen = ref(false);
const query = ref("");
const pageGroups = ref<PageGroup[]>([]);
const activeId = ref<string | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const resultScrollRef = ref<HTMLElement | null>(null);
const router = useRouter();

let index!: Document<FlexRecord>;

const flatItems = computed<SectionRecord[]>(() => pageGroups.value.flatMap(g => g.sections));

function buildIndex() {
  index = new Document<FlexRecord>({
    tokenize: "full",
    document: {
      id: "id",
      index: ["pageTitle", "section", "content"],
      store: true,
    },
  });
  for (const record of searchData as unknown as FlexRecord[]) {
    index.add(record);
  }
}

// Segment-by-segment sort: compare each path part individually,
// using the leading number (e.g. "04-vue-workflow" → 4) for numeric ordering.
function sortByPath(a: string, b: string): number {
  const segs = (s: string) => s.split("/").filter(Boolean);
  const leadNum = (seg: string) => {
    const m = seg.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : Infinity;
  };
  const aSegs = segs(a);
  const bSegs = segs(b);
  for (let i = 0; i < Math.max(aSegs.length, bSegs.length); i++) {
    const aS = aSegs[i] ?? "";
    const bS = bSegs[i] ?? "";
    if (aS === bS) continue;
    const aN = leadNum(aS);
    const bN = leadNum(bS);
    if (aN !== bN) return aN - bN;
    return aS.localeCompare(bS);
  }
  return 0;
}

function doSearch(q: string) {
  if (!q.trim() || !index) {
    pageGroups.value = [];
    activeId.value = null;
    return;
  }

  const raw: EnrichedDocumentSearchResults<FlexRecord> = index.search(q, {
    enrich: true,
    limit: 40,
  });

  const seen = new Set<string>();
  const grouped = new Map<string, PageGroup>();

  for (const fieldResult of raw) {
    for (const item of fieldResult.result) {
      const id = String(item.id);
      if (seen.has(id) || !item.doc) continue;
      seen.add(id);
      const rec = item.doc as SectionRecord;
      if (!grouped.has(rec.pageId)) {
        grouped.set(rec.pageId, {
          pageId: rec.pageId,
          pageTitle: rec.pageTitle,
          group: rec.group,
          sections: [],
        });
      }
      grouped.get(rec.pageId)!.sections.push(rec);
    }
  }

  pageGroups.value = [...grouped.entries()]
    .sort(([a], [b]) => sortByPath(a, b))
    .map(([, g]) => ({
      ...g,
      // Restore document order within each page (FlexSearch returns by relevance)
      sections: g.sections.slice().sort((a, b) => a.docOrder - b.docOrder),
    }));

  activeId.value = flatItems.value[0]?.id ?? null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlight(text: string, q: string): string {
  const safe = escapeHtml(text);
  if (!q.trim()) return safe;
  const escapedQ = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escapedQ})`, "gi"), "<mark>$1</mark>");
}

function getExcerpt(content: string, q: string): string {
  if (!content) return "";
  const lower = content.toLowerCase();
  const idx = lower.indexOf(q.trim().toLowerCase());
  if (idx === -1) return content.slice(0, 80) + (content.length > 80 ? "..." : "");
  const start = Math.max(0, idx - 20);
  const end = Math.min(content.length, idx + 60);
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
}

function open() {
  isOpen.value = true;
  nextTick(() => inputRef.value?.focus());
}

function close() {
  isOpen.value = false;
  query.value = "";
  pageGroups.value = [];
  activeId.value = null;
}

function navigate(url: string) {
  close();
  router.go(url);
}

function onKeydown(e: KeyboardEvent) {
  const items = flatItems.value;
  if (!items.length) return;
  const idx = items.findIndex(item => item.id === activeId.value);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeId.value = items[idx < 0 ? 0 : (idx + 1) % items.length].id;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeId.value = items[idx <= 0 ? items.length - 1 : idx - 1].id;
  } else if (e.key === "Enter") {
    const item = items.find(i => i.id === activeId.value);
    if (item) navigate(item.url);
  } else if (e.key === "Escape") {
    close();
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    isOpen.value ? close() : open();
  }
}

watch(query, q => doSearch(q));

watch(activeId, async () => {
  await nextTick();
  const el = resultScrollRef.value?.querySelector(".is-active") as HTMLElement | null;
  el?.scrollIntoView({block: "nearest"});
});

onMounted(() => {
  buildIndex();
  window.addEventListener("keydown", onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
});
</script>

<template>
  <div class="search-wrapper">
    <button class="search-trigger" aria-label="문서 검색" @click="open">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <span class="trigger-text">검색</span>
      <span class="trigger-key">
        <kbd>Ctrl</kbd>
        <kbd>K</kbd>
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        class="search-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="문서 검색"
        @click.self="close"
      >
        <div class="search-modal">
          <!-- Input -->
          <div class="search-input-wrap">
            <svg
              class="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              type="search"
              class="search-input"
              placeholder="검색어를 입력하세요..."
              autocomplete="off"
              aria-label="검색어 입력"
              @keydown="onKeydown"
            />
            <button class="close-btn" aria-label="검색 닫기" @click="close">
              <kbd>Esc</kbd>
            </button>
          </div>

          <!-- Grouped results -->
          <div
            v-if="pageGroups.length > 0"
            ref="resultScrollRef"
            class="result-scroll"
            role="listbox"
            aria-label="검색 결과"
          >
            <div v-for="group in pageGroups" :key="group.pageId" class="page-group">
              <!-- Page header: navigates to page root, not part of arrow-key selection -->
              <button class="group-header" @click="navigate(group.pageId)">
                <span class="group-badge">{{ group.group }}</span>
                <span class="group-page-title" v-html="highlight(group.pageTitle, query)" />
                <span class="group-page-path">{{ group.pageId }}</span>
              </button>

              <!-- Sections -->
              <ul class="section-list">
                <li
                  v-for="section in group.sections"
                  :key="section.id"
                  class="section-item"
                  :class="[`level-${section.level}`, {'is-active': section.id === activeId}]"
                  role="option"
                  :aria-selected="section.id === activeId"
                  @click="navigate(section.url)"
                  @mouseenter="activeId = section.id"
                >
                  <div class="section-heading">
                    <span class="section-hash">#</span>
                    <span v-html="highlight(section.section, query)" />
                  </div>
                  <div
                    v-if="section.content"
                    class="section-content"
                    v-html="highlight(getExcerpt(section.content, query), query)"
                  />
                </li>
              </ul>
            </div>
          </div>

          <!-- Empty state -->
          <div v-else-if="query.trim()" class="search-empty">
            <span>"{{ query }}"에 대한 검색 결과가 없습니다.</span>
          </div>

          <!-- Footer hints -->
          <div class="search-footer">
            <span class="footer-hint"><kbd>↑</kbd> <kbd>↓</kbd> 이동</span>
            <span class="footer-hint"><kbd>Enter</kbd> 선택</span>
            <span class="footer-hint"><kbd>Esc</kbd> 닫기</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.search-wrapper {
  display: flex;
  align-items: center;
  margin-right: 24px;
  margin-left: 8px;
}

/* ── Trigger button ─────────────────────────────────────── */
.search-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color 0.2s,
    color 0.2s;
}

.search-trigger:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.trigger-text {
  font-size: 13px;
}

.trigger-key {
  display: flex;
  gap: 2px;
  margin-left: 4px;
}

.trigger-key kbd {
  font-size: 11px;
  padding: 1px 4px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg);
  font-family: inherit;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .trigger-text,
  .trigger-key {
    display: none;
  }
}

/* ── Overlay & modal ────────────────────────────────────── */
.search-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 72px;
  padding-inline: 16px;
}

.search-modal {
  width: 100%;
  max-width: 640px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 100px);
}

/* ── Input row ──────────────────────────────────────────── */
.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.search-icon {
  flex-shrink: 0;
  color: var(--vp-c-text-3);
}

.search-input {
  flex: 1;
  padding: 16px 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: 16px;
  color: var(--vp-c-text-1);
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--vp-c-text-3);
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.close-btn {
  display: flex;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.close-btn kbd {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  font-family: inherit;
}

/* ── Result scroll area ─────────────────────────────────── */
.result-scroll {
  overflow-y: auto;
  padding: 8px;
  flex: 1;
}

.result-scroll::-webkit-scrollbar {
  width: 6px;
}

.result-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.result-scroll::-webkit-scrollbar-thumb {
  background: var(--vp-c-border);
  border-radius: 3px;
}

/* ── Page group card ────────────────────────────────────── */
.page-group {
  margin-bottom: 8px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.06),
    0 -1px 3px rgba(0, 0, 0, 0.04);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: var(--vp-c-bg-soft);
  border: none;
  border-bottom: 1px solid var(--vp-c-divider);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.group-header:hover {
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, var(--vp-c-bg-soft));
}

.group-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: var(--vp-c-brand-1);
  color: #fff;
  text-transform: capitalize;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.group-page-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.group-page-path {
  font-size: 11px;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  flex-shrink: 0;
  font-family: var(--vp-font-family-mono, monospace);
}

/* ── Section list ───────────────────────────────────────── */
.section-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.section-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 12px;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom-color: var(--vp-c-divider);
  border-radius: 6px;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}

.section-item:last-child {
  border-bottom-color: transparent;
}

.section-item:hover:not(.is-active) {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, var(--vp-c-bg-soft));
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--vp-c-brand-1) 50%, transparent);
}

.section-item.is-active {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, var(--vp-c-bg-soft));
  box-shadow: inset 3px 0 0 var(--vp-c-brand-1);
}

.section-item.is-active .section-heading {
  color: var(--vp-c-brand-1);
}

/* Level-based indentation */
.section-item.level-1 {
  padding-left: 12px;
}
.section-item.level-2 {
  padding-left: 20px;
}
.section-item.level-3 {
  padding-left: 32px;
}
.section-item.level-4 {
  padding-left: 44px;
}
.section-item.level-5,
.section-item.level-6 {
  padding-left: 52px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  line-height: 1.4;
}

.section-hash {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.section-content {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 14px;
}

/* ── Highlight mark ─────────────────────────────────────── */
:deep(mark) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 18%, transparent);
  color: var(--vp-c-brand-1);
  border-radius: 2px;
  padding: 0 1px;
  font-style: normal;
}

/* ── Empty state ────────────────────────────────────────── */
.search-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

/* ── Footer ─────────────────────────────────────────────── */
.search-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.footer-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--vp-c-border);
  border-radius: 3px;
  font-size: 11px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  font-family: inherit;
  line-height: 1.5;
}
</style>
