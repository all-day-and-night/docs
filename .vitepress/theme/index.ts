import type {Theme} from "vitepress";
import DefaultTheme from "vitepress/theme";
import {h} from "vue";
import SearchBox from "./components/SearchBox.vue";
import {useImageFallback} from "./composables/useImageFallback";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    useImageFallback();
    return h(DefaultTheme.Layout, null, {
      "nav-bar-content-after": () => h(SearchBox),
    });
  },
} satisfies Theme;
