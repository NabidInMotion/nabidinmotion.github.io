import { initSiteMeta } from "./site-meta.js";

const showBanner = !document.body?.classList.contains("legal-page");
initSiteMeta({ showBanner });
