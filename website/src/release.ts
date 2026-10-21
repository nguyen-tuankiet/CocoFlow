import { useEffect, useState } from "react";

// The download buttons follow the newest GitHub Release on their own: nothing here has to be edited per release.
// .github/workflows/release.yml publishes a release (two installers) on every merge to main; the page asks the GitHub API
// which one is the latest and links straight to its files. If the API is unreachable (rate limit, offline) the buttons
// open the "latest release" page instead, which is always correct.
export const REPO ="nguyen-tuankiet/CocoFlow";
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export type Asset = { url: string; size: string };
export type ReleaseInfo = { version: string; setup: Asset; full: Asset };

const FALLBACK: ReleaseInfo = {
  version: "0.4",
  setup: { url: RELEASES_PAGE, size: "~460 MB" },
  full: { url: RELEASES_PAGE, size: "~670 MB" },
};

type ApiAsset = { name: string; size: number; browser_download_url: string };

const toAsset = (a: ApiAsset | undefined, fallback: Asset): Asset =>
  a ? { url: a.browser_download_url, size: `${Math.round(a.size / 1048576)} MB` } : fallback;

export function useRelease(): ReleaseInfo {
  const [info, setInfo] = useState<ReleaseInfo>(FALLBACK);
  useEffect(() => {
    let alive = true;
    const apply = (j: { tag_name?: string; assets?: ApiAsset[] }) => {
      const assets = j.assets ?? [];
      const exes = assets.filter((a) => /setup\.exe$/i.test(a.name));
      const full = exes.find((a) => /full/i.test(a.name));
      const setup = exes.find((a) => !/full/i.test(a.name));
      if (!alive || !setup) return;
      setInfo({ version: (j.tag_name ?? "").replace(/^v/, "") || FALLBACK.version, setup: toAsset(setup, FALLBACK.setup), full: toAsset(full, FALLBACK.full) });
    };
    try {
      const cached = sessionStorage.getItem("cocoflow-release");
      if (cached) return apply(JSON.parse(cached));
    } catch {
      /* storage can be blocked */
    }
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        try {
          sessionStorage.setItem("cocoflow-release", JSON.stringify(j));
        } catch {
          /* ignore */
        }
        apply(j);
      })
      .catch(() => {
        /* keep the fallback links */
      });
    return () => {
      alive = false;
    };
  }, []);
  return info;
}
