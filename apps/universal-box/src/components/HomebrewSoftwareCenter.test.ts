import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomebrewSoftwareCenter from "./HomebrewSoftwareCenter";

describe("Homebrew software center presentation", () => {
  it("keeps search, package type, featured tools, and update review discoverable", () => {
    const markup = renderToStaticMarkup(
      createElement(HomebrewSoftwareCenter, { native: true, installed: true }),
    );

    expect(markup).toContain('data-testid="brew-software-center"');
    expect(markup).toContain('aria-label="软件类型"');
    expect(markup).toContain('data-testid="brew-software-query"');
    expect(markup).toContain('data-testid="brew-search"');
    expect(markup).toContain('data-testid="brew-check-updates"');
    expect(markup).toContain('data-testid="brew-featured-apps"');
    expect(markup).toContain('data-testid="brew-featured-install-firefox"');
    expect(markup).toContain('data-testid="brew-featured-install-google-chrome"');
    expect(markup).toContain("常用 Mac 应用");
    expect(markup).toContain("安装、升级、卸载和更新索引均需二次确认");
  });

  it("explains the browser-preview limitation without exposing native actions", () => {
    const markup = renderToStaticMarkup(
      createElement(HomebrewSoftwareCenter, { native: false, installed: false }),
    );

    expect(markup).toContain("网页预览不能操作本机软件");
    expect(markup).not.toContain('data-testid="brew-featured-apps"');
    expect(markup).not.toContain('data-testid="brew-confirm-run"');
  });
});
