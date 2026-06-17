declare module "*.css" {}

declare module "*.vue" {
  import type {Component} from "vue";
  const component: Component;
  export default component;
}

declare module "virtual:search-index" {
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
  const data: SectionRecord[];
  export default data;
}
